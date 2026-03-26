from __future__ import annotations

import json
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse

from .graph import (
    build_answerer_messages,
    build_model,
    build_initial_state,
    chunk_text,
    normalize_structured_memory,
    numeric_agent_node,
    numeric_payload_for_answerer,
    extract_usage,
    memory_node,
    ui_agent_node,
)
from .schemas import StructuredMemory
from .persistence import ThreadStore
from .schemas import ChatMessage, RunRequest, ThreadState

app = FastAPI(title="MyAiChat Agent Service")
store = ThreadStore()


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


def normalize_positive_int(value: int | None, fallback: int) -> int:
    return value if isinstance(value, int) and value > 0 else fallback


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
    print(
        "[numeric-agent:input]",
        json.dumps(
            {
                "thread_id": request.thread_id,
                "session_id": request.session_id,
                "numeric_computation_enabled": bool(request.robot.numeric_computation_enabled),
                "numeric_computation_prompt": request.robot.numeric_computation_prompt or "",
                "numeric_computation_items": request.robot.numeric_computation_items or [],
                "request_numeric_state": request.numeric_state or {},
                "thread_numeric_state": thread.numeric_state if thread else None,
            },
            ensure_ascii=False,
        ),
        flush=True,
    )
    state = build_initial_state(request, history, memory_schema, structured_memory)

    async def event_stream() -> AsyncIterator[str]:
        try:
            yield sse({"type": "run_started", "threadId": request.thread_id})
            final_response = ""
            final_memory = structured_memory.model_dump()
            final_ui_payload = {"suggestions": [], "form": None}
            usage = {"prompt_tokens": 0, "completion_tokens": 0}
            try:
                numeric_payload = await numeric_agent_node(state)
            except Exception as error:
                raise RuntimeError(format_stage_error(request, "数值计算阶段", error)) from error
            state.update(numeric_payload)
            usage = numeric_payload.get("usage") or usage
            yield sse({"type": "numeric_state_updated", "state": state.get("numeric_state") or {}})

            print(
                "[answerer:numeric-input]",
                json.dumps(
                    {
                        "thread_id": request.thread_id,
                        "session_id": request.session_id,
                        "numeric_state": numeric_payload_for_answerer(
                            state.get("numeric_computation_items") or [],
                            state.get("numeric_state") or {},
                        ),
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )
            try:
                answer_model = build_model(state["model_config"])
                answer_usage = {"prompt_tokens": 0, "completion_tokens": 0}
                async for chunk in answer_model.astream(
                    build_answerer_messages(state, StructuredMemory.model_validate(state["structured_memory"]))
                ):
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

            try:
                ui_payload_result = await ui_agent_node(state)
            except Exception as error:
                raise RuntimeError(format_stage_error(request, "交互 UI 阶段", error)) from error
            state.update(ui_payload_result)
            final_ui_payload = ui_payload_result.get("ui_payload") or final_ui_payload
            usage = ui_payload_result.get("usage") or usage
            if final_ui_payload.get("form"):
                yield sse({"type": "form", "form": final_ui_payload["form"]})
            elif final_ui_payload.get("suggestions"):
                yield sse({"type": "suggestion", "items": final_ui_payload["suggestions"]})

            if should_refresh_structured_memory(
                history,
                StructuredMemory.model_validate(state["structured_memory"]),
                state["structured_memory_interval"],
            ):
                yield sse({"type": "memory_started"})
                try:
                    memory_payload = await memory_node(state)
                except Exception as error:
                    raise RuntimeError(format_stage_error(request, "结构化记忆阶段", error)) from error
                state.update(memory_payload)
                final_memory = memory_payload.get("structured_memory") or final_memory
                usage = memory_payload.get("usage") or usage
                yield sse({"type": "memory_updated", "memory": final_memory})

            next_messages = [*history, ChatMessage(role="user", content=request.prompt), ChatMessage(role="assistant", content=final_response)]
            try:
                store.save(
                    ThreadState(
                        thread_id=request.thread_id,
                        messages=next_messages,
                        memory_schema=memory_schema,
                        structured_memory=type(structured_memory).model_validate(final_memory),
                        numeric_state=state.get("numeric_state") or {},
                    )
                )
            except Exception as error:
                raise RuntimeError(format_stage_error(request, "保存会话阶段", error)) from error
            yield sse({"type": "usage", **usage})
            yield sse({
                "type": "run_completed",
                "threadId": request.thread_id,
                "message": final_response,
                "suggestions": final_ui_payload.get("suggestions") or [],
                "form": final_ui_payload.get("form"),
                "memory": final_memory,
                "numeric_state": state.get("numeric_state") or {},
                "usage": usage,
            })
        except Exception as error:
            yield sse({
                "type": "error",
                "message": str(error).strip() or format_stage_error(request, "执行阶段", error),
            })

    return StreamingResponse(event_stream(), media_type="text/event-stream")
