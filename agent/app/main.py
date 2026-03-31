from __future__ import annotations

import json
import logging
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse

from .graph import (
    build_answerer_messages,
    build_model,
    build_initial_state,
    chunk_text,
    debug_log,
    normalize_structured_memory,
    normalize_positive_int,
    numeric_agent_node,
    numeric_payload_for_answerer,
    extract_usage,
    memory_node,
    refresh_state_memory_context,
    story_outline_node,
    world_graph_writeback_node,
)
from .schemas import StructuredMemory
from .persistence import ThreadStore
from .schemas import ChatMessage, RunRequest, ThreadState

app = FastAPI(title="MyAiChat Agent Service")
store = ThreadStore()
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup() -> None:
    store.ensure_ready()


def sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def has_schema_categories(schema) -> bool:
    return bool(getattr(schema, "categories", None))


def should_use_request_schema(thread, request: RunRequest) -> bool:
    if not has_schema_categories(request.memory_schema):
        return False
    if not thread or not has_schema_categories(thread.memory_schema):
        return True
    return thread.memory_schema.model_dump() != request.memory_schema.model_dump()

def resolve_robot_name(request: RunRequest) -> str:
    name = str(getattr(request.robot, "name", "") or "").strip()
    return name or "当前智能体"


def format_stage_error(request: RunRequest, stage_label: str, error: Exception | str) -> str:
    robot_name = resolve_robot_name(request)
    raw_message = str(error if isinstance(error, str) else getattr(error, "message", "") or str(error)).strip()
    return f"聊天失败：智能体「{robot_name}」{stage_label}失败" + (f"：{raw_message}" if raw_message else "")


def should_refresh_structured_memory(history: list[ChatMessage], _structured_memory: StructuredMemory, interval: int) -> bool:
    existing_user_turns = sum(1 for message in history if message.role == "user")
    next_user_turn_index = existing_user_turns + 1
    return next_user_turn_index % normalize_positive_int(interval, 3) == 0


@app.get("/health")
async def health():
    return JSONResponse({"ok": True})


@app.post("/runs/stream")
async def run_stream(request: RunRequest):
    if not request.model_settings.model:
        raise HTTPException(status_code=400, detail="model 不能为空")
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="prompt 不能为空")

    thread = store.load(request.thread_id)
    history = thread.messages if thread else request.history
    use_request_schema = should_use_request_schema(thread, request)
    memory_schema = request.memory_schema if use_request_schema else (
        thread.memory_schema if thread and has_schema_categories(thread.memory_schema) else request.memory_schema
    )
    raw_structured_memory = thread.structured_memory if thread and not use_request_schema else request.structured_memory
    structured_memory = normalize_structured_memory(memory_schema, raw_structured_memory.model_dump())
    if thread:
        request.numeric_state = thread.numeric_state
        request.story_outline = thread.story_outline or request.story_outline
    debug_log("[numeric-agent:input]", {
        "thread_id": request.thread_id,
        "session_id": request.session_id,
        "numeric_computation_enabled": bool(request.robot.numeric_computation_enabled),
        "numeric_computation_prompt": request.robot.numeric_computation_prompt or "",
        "numeric_computation_items": request.robot.numeric_computation_items or [],
        "request_numeric_state": request.numeric_state or {},
        "thread_numeric_state": thread.numeric_state if thread else None,
    })
    state = build_initial_state(request, history, memory_schema, structured_memory)

    async def event_stream() -> AsyncIterator[str]:
        try:
            yield sse({"type": "run_started", "threadId": request.thread_id})
            final_response = ""
            final_memory = structured_memory
            usage = {"prompt_tokens": 0, "completion_tokens": 0}
            try:
                numeric_payload = await numeric_agent_node(state)
            except Exception as error:
                raise RuntimeError(format_stage_error(request, "数值计算阶段", error)) from error
            state.update(numeric_payload)
            usage = numeric_payload.get("usage") or usage
            yield sse({"type": "numeric_state_updated", "state": state.get("numeric_state") or {}})

            has_world_graph = bool(str((state.get("world_graph_payload") or {}).get("meta", {}).get("robotId") or "").strip())
            try:
                yield sse({"type": "story_outline_started"})
                outline_payload = await story_outline_node(state)
            except Exception as error:
                raise RuntimeError(format_stage_error(request, "故事梗概阶段", error)) from error
            state.update(outline_payload)
            usage = outline_payload.get("usage") or usage
            yield sse({
                "type": "story_outline_completed",
                "story_outline": state.get("story_outline") or "",
            })
            debug_log("[answerer:numeric-input]", {
                "thread_id": request.thread_id,
                "session_id": request.session_id,
                "numeric_state": numeric_payload_for_answerer(
                    state.get("numeric_computation_items") or [],
                    state.get("numeric_state") or {},
                ),
            })
            try:
                answer_model = build_model(state["model_config"])
                answer_usage = {"prompt_tokens": 0, "completion_tokens": 0}
                async for chunk in answer_model.astream(build_answerer_messages(state)):
                    text = chunk_text(chunk)
                    if text:
                        final_response += text
                        yield sse({"type": "message_delta", "text": text})
                    chunk_usage = extract_usage(chunk)
                    if chunk_usage["prompt_tokens"] or chunk_usage["completion_tokens"]:
                        answer_usage = chunk_usage
            except Exception as error:
                raise RuntimeError(format_stage_error(request, "主回复阶段", error)) from error
            usage = answer_usage or usage
            state["final_response"] = final_response
            yield sse({"type": "message_done", "text": final_response})
            yield sse({
                "type": "response_completed",
                "threadId": request.thread_id,
                "message": final_response,
                "numeric_state": state.get("numeric_state") or {},
            })

            if should_refresh_structured_memory(
                history,
                state["structured_memory"],
                state["structured_memory_interval"],
            ):
                yield sse({"type": "memory_started"})
                try:
                    memory_payload = await memory_node(state)
                except Exception as error:
                    raise RuntimeError(format_stage_error(request, "结构化记忆阶段", error)) from error
                state.update(memory_payload)
                final_memory = memory_payload.get("structured_memory") or final_memory
                refresh_state_memory_context(state, final_memory)
                usage = memory_payload.get("usage") or usage
                yield sse({"type": "memory_updated", "memory": final_memory.model_dump()})

            try:
                if has_world_graph:
                    yield sse({"type": "world_graph_writeback_started"})
                world_graph_writeback_payload = await world_graph_writeback_node(state)
                state.update(world_graph_writeback_payload)
                usage = world_graph_writeback_payload.get("usage") or usage
                yield sse({"type": "world_graph_writeback_ready"})
            except Exception as error:
                logger.exception(
                    "world graph writeback failed for thread=%s session=%s",
                    request.thread_id,
                    request.session_id,
                )
                debug_log("[world-graph-writeback:error]", {
                    "thread_id": request.thread_id,
                    "session_id": request.session_id,
                    "message": str(error),
                })

            next_messages = [*history, ChatMessage(role="user", content=request.prompt), ChatMessage(role="assistant", content=final_response)]
            try:
                store.save(
                    ThreadState(
                        thread_id=request.thread_id,
                        messages=next_messages,
                        memory_schema=memory_schema,
                        structured_memory=final_memory,
                        numeric_state=state.get("numeric_state") or {},
                        story_outline=state.get("story_outline") or "",
                    )
                )
            except Exception as error:
                raise RuntimeError(format_stage_error(request, "保存会话阶段", error)) from error
            yield sse({"type": "usage", **usage})
            yield sse({
                "type": "run_completed",
                "threadId": request.thread_id,
                "message": final_response,
                "memory": final_memory.model_dump(),
                "numeric_state": state.get("numeric_state") or {},
                "story_outline": state.get("story_outline") or "",
                "world_graph_writeback_ops": state.get("world_graph_writeback_ops") or {},
                "usage": usage,
            })
        except Exception as error:
            yield sse({
                "type": "error",
                "message": str(error).strip() or format_stage_error(request, "执行阶段", error),
            })

    return StreamingResponse(event_stream(), media_type="text/event-stream")
