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
    extract_usage,
    memory_node,
    moderator_node,
    researcher_node,
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


def normalize_positive_int(value: int | None, fallback: int) -> int:
    return value if isinstance(value, int) and value > 0 else fallback


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
    memory_schema = thread.memory_schema if thread and has_schema_categories(thread.memory_schema) else request.memory_schema
    structured_memory = thread.structured_memory if thread else request.structured_memory
    state = build_initial_state(request, history, memory_schema, structured_memory)

    async def event_stream() -> AsyncIterator[str]:
        yield sse({"type": "run_started", "threadId": request.thread_id})
        final_response = ""
        final_memory = structured_memory.model_dump()
        final_ui_payload = {"suggestions": [], "form": None}
        usage = {"prompt_tokens": 0, "completion_tokens": 0}
        moderation_payload = await moderator_node(state)
        state.update(moderation_payload)
        moderation = moderation_payload.get("moderation") or {}
        usage = moderation_payload.get("usage") or usage
        yield sse({
            "type": "agent_turn",
            "agent": "moderator",
            "message": moderation.get("summary") or "已完成路由决策",
        })

        if moderation.get("need_web_search"):
            research_payload = await researcher_node(state)
            state.update(research_payload)
            for item in research_payload.get("tool_events") or []:
                yield sse(item)
            yield sse({
                "type": "agent_turn",
                "agent": "researcher",
                "message": research_payload.get("research_summary") or "已完成联网检索",
            })

        yield sse({
            "type": "agent_turn",
            "agent": "answerer",
            "message": "正在生成最终答复",
        })
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
        usage = answer_usage or usage
        state["final_response"] = final_response
        yield sse({"type": "message_done", "text": final_response})

        ui_payload_result = await ui_agent_node(state)
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
            memory_payload = await memory_node(state)
            state.update(memory_payload)
            final_memory = memory_payload.get("structured_memory") or final_memory
            usage = memory_payload.get("usage") or usage
            yield sse({"type": "memory_updated", "memory": final_memory})

        next_messages = [*history, ChatMessage(role="user", content=request.prompt), ChatMessage(role="assistant", content=final_response)]
        store.save(
            ThreadState(
                thread_id=request.thread_id,
                messages=next_messages,
                memory_schema=memory_schema,
                structured_memory=type(structured_memory).model_validate(final_memory),
            )
        )
        yield sse({"type": "usage", **usage})
        yield sse({
            "type": "run_completed",
            "threadId": request.thread_id,
            "message": final_response,
            "suggestions": final_ui_payload.get("suggestions") or [],
            "form": final_ui_payload.get("form"),
            "memory": final_memory,
            "usage": usage,
        })

    return StreamingResponse(event_stream(), media_type="text/event-stream")
