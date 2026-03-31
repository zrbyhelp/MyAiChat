from __future__ import annotations

import json
import logging
from typing import AsyncIterator, TypeVar

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import ValidationError

from .graph import (
    build_answerer_messages,
    build_model,
    build_initial_state,
    chunk_text,
    debug_log,
    parse_json_object,
    normalize_structured_memory,
    normalize_positive_int,
    numeric_agent_node,
    numeric_payload_for_answerer,
    extract_usage,
    memory_node,
    story_outline_node,
    world_graph_writeback_node,
)
from .schemas import StructuredMemory
from .persistence import ThreadStore
from .prompt_config import get_prompt_config
from .schemas import (
    ChatMessage,
    DocumentSummaryRequest,
    GeneratedRobotPayload,
    GeneratedWorldGraphPatchPayload,
    GeneratedMemorySchemaPayload,
    RobotGenerationCorePayload,
    RobotGenerationCoreContext,
    RobotWorldGraphEvolutionRequest,
    RetrievalSummaryRequest,
    RobotGenerationRequest,
    RunRequest,
    SummaryResponse,
    ThreadState,
)

app = FastAPI(title="MyAiChat Agent Service")
store = ThreadStore()
logger = logging.getLogger(__name__)
StructuredSchemaT = TypeVar("StructuredSchemaT")


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


def build_request_state(request: RunRequest) -> tuple[dict, StructuredMemory]:
    memory_schema = request.memory_schema
    structured_memory = normalize_structured_memory(memory_schema, request.structured_memory.model_dump())
    state = build_initial_state(request, request.history, memory_schema, structured_memory)
    if request.final_response:
        state["final_response"] = request.final_response
    return state, structured_memory


def save_memory_to_thread(request: RunRequest, memory: StructuredMemory, state: dict) -> None:
    current_thread = store.load(request.thread_id)
    if current_thread:
        store.save(
            ThreadState(
                thread_id=request.thread_id,
                messages=current_thread.messages,
                memory_schema=current_thread.memory_schema,
                structured_memory=memory,
                numeric_state=current_thread.numeric_state,
                story_outline=current_thread.story_outline,
            )
        )
        return

    next_messages = [
        *request.history,
        ChatMessage(role="user", content=request.prompt),
        ChatMessage(role="assistant", content=request.final_response or ""),
    ]
    store.save(
        ThreadState(
            thread_id=request.thread_id,
            messages=next_messages,
            memory_schema=request.memory_schema,
            structured_memory=memory,
            numeric_state=state.get("numeric_state") or {},
            story_outline=state.get("story_outline") or "",
        )
    )


async def invoke_text_model(config: dict, system_instruction: str, user_content: str) -> tuple[str, dict]:
    model = build_model(config)
    response = await model.ainvoke([
        SystemMessage(content=system_instruction),
        HumanMessage(content=user_content),
    ])
    return chunk_text(response).strip(), extract_usage(response)


def sum_usage(*items: dict) -> dict:
    total_prompt = 0
    total_completion = 0
    for usage in items:
        total_prompt += int((usage or {}).get("prompt_tokens", 0) or 0)
        total_completion += int((usage or {}).get("completion_tokens", 0) or 0)
    return {
        "prompt_tokens": total_prompt,
        "completion_tokens": total_completion,
    }


def resolve_structured_methods(config: dict) -> list[str]:
    provider = str(config.get("provider") or "openai").strip().lower()
    if provider == "ollama":
        return ["json_mode", "function_calling"]
    return ["json_schema", "json_mode", "function_calling"]


def build_json_mode_instruction(schema: type[StructuredSchemaT]) -> str:
    schema_json = json.dumps(schema.model_json_schema(), ensure_ascii=False)
    return "\n\n".join([
        "你必须只输出单个 JSON 对象，禁止输出解释、前后缀、Markdown、代码块或多个 JSON 对象。",
        "输出必须严格符合以下 JSON Schema：",
        schema_json,
    ])


def collect_structured_raw_candidates(raw) -> list[object]:
    candidates: list[object] = []
    if raw is None:
        return candidates

    content = chunk_text(raw).strip()
    if content:
        candidates.append(content)

    tool_calls = getattr(raw, "tool_calls", None)
    if isinstance(tool_calls, list):
        for item in tool_calls:
            if isinstance(item, dict):
                args = item.get("args")
                if args is not None:
                    candidates.append(args)

    additional_kwargs = getattr(raw, "additional_kwargs", None)
    if isinstance(additional_kwargs, dict):
        for item in additional_kwargs.get("tool_calls", []):
            if not isinstance(item, dict):
                continue
            function_payload = item.get("function")
            if isinstance(function_payload, dict) and function_payload.get("arguments") is not None:
                candidates.append(function_payload.get("arguments"))

    invalid_tool_calls = getattr(raw, "invalid_tool_calls", None)
    if isinstance(invalid_tool_calls, list):
        for item in invalid_tool_calls:
            if isinstance(item, dict):
                args = item.get("args")
                if args is not None:
                    candidates.append(args)

    return candidates


def coerce_structured_payload_from_raw(schema: type[StructuredSchemaT], raw) -> StructuredSchemaT | None:
    for candidate in collect_structured_raw_candidates(raw):
        if isinstance(candidate, dict):
            try:
                return schema.model_validate(candidate)
            except Exception:
                continue
        parsed = parse_json_object(candidate, {})
        if parsed:
            try:
                return schema.model_validate(parsed)
            except Exception:
                continue
    return None


async def invoke_structured_model(
    config: dict,
    system_instruction: str,
    user_content: str,
    schema: type[StructuredSchemaT],
    stage_label: str,
) -> tuple[StructuredSchemaT, dict]:
    methods = resolve_structured_methods(config)
    last_error: Exception | None = None
    for method in methods:
        try:
            invoke_system_instruction = system_instruction
            invoke_kwargs = {
                "method": method,
                "include_raw": True,
            }
            if method in {"json_schema", "function_calling"}:
                invoke_kwargs["strict"] = True
            if method == "json_mode":
                invoke_system_instruction = f"{system_instruction}{build_json_mode_instruction(schema)}"
            runnable = build_model(config).with_structured_output(
                schema,
                **invoke_kwargs,
            )
            result = await runnable.ainvoke([
                SystemMessage(content=invoke_system_instruction),
                HumanMessage(content=user_content),
            ])
            parsed = result.get("parsed") if isinstance(result, dict) else result
            parsing_error = result.get("parsing_error") if isinstance(result, dict) else None
            raw = result.get("raw") if isinstance(result, dict) else None
            if parsing_error:
                recovered = coerce_structured_payload_from_raw(schema, raw)
                if recovered is not None:
                    usage = extract_usage(raw)
                    logger.warning(
                        "structured generation recovered from raw payload: stage=%s method=%s",
                        stage_label,
                        method,
                    )
                    return recovered, usage
                raise parsing_error
            if parsed is None:
                recovered = coerce_structured_payload_from_raw(schema, raw)
                if recovered is not None:
                    usage = extract_usage(raw)
                    logger.warning(
                        "structured generation recovered empty parsed payload from raw: stage=%s method=%s",
                        stage_label,
                        method,
                    )
                    return recovered, usage
                raise ValueError("模型没有返回结构化结果")
            usage = extract_usage(raw)
            if isinstance(parsed, schema):
                return parsed, usage
            return schema.model_validate(parsed), usage
        except Exception as error:
            last_error = error
            logger.warning(
                "structured generation failed: stage=%s method=%s error=%s",
                stage_label,
                method,
                str(error).strip() or error.__class__.__name__,
            )
            continue

    detail = str(last_error).strip() if last_error else f"{stage_label}生成失败"
    raise HTTPException(status_code=502, detail=f"{stage_label}生成失败：{detail}")


def build_robot_generation_context(request: RobotGenerationRequest) -> str:
    return "\n\n".join([
        f"文档名称：{request.source_name or '未命名文档'}",
        f"用户引导语：{request.guidance or '无'}",
        "文档整体摘要：",
        request.document_summary.strip() or "无",
        "分段摘要：",
        "\n".join([f"- {item.strip()}" for item in request.segment_summaries if item.strip()]) or "无",
    ])


def build_memory_schema_prompt(request: RobotGenerationRequest, core: RobotGenerationCorePayload) -> str:
    return "\n\n".join([
        build_robot_generation_context(request),
        "已确定的智能体核心定位：",
        f"名称：{core.name}",
        f"简介：{core.description}",
        f"系统提示词摘要：{core.system_prompt.strip() or '无'}",
    ])


def world_graph_json_text(value) -> str:
    return json.dumps(value if isinstance(value, dict) else {}, ensure_ascii=False, indent=2)


def build_world_graph_evolution_prompt(request: RobotWorldGraphEvolutionRequest) -> str:
    core = request.core if isinstance(request.core, RobotGenerationCoreContext) else RobotGenerationCoreContext()
    return "\n\n".join([
        f"文档名称：{request.source_name or '未命名文档'}",
        f"用户引导语：{request.guidance or '无'}",
        "已确定的智能体核心定位：",
        f"名称：{core.name or '未命名智能体'}",
        f"简介：{core.description or '无'}",
        f"当前切片：{request.segment_index + 1}/{max(request.segment_total, 1)}",
        "当前切片摘要：",
        request.segment_summary.strip() or "无",
        "当前全量世界图谱 JSON：",
        world_graph_json_text(request.current_world_graph),
    ])


def ensure_generated_robot_payload(payload: GeneratedRobotPayload) -> None:
    missing_fields: list[str] = []
    if not payload.name.strip():
        missing_fields.append("name")
    if not payload.description.strip():
        missing_fields.append("description")
    if not payload.system_prompt.strip():
        missing_fields.append("systemPrompt")
    if len(payload.memory_schema.categories) < 2:
        missing_fields.append("memorySchema.categories(>=2)")
    if not payload.document_summary.strip():
        missing_fields.append("documentSummary")
    if not payload.retrieval_summary.strip():
        missing_fields.append("retrievalSummary")

    if not missing_fields:
        return

    raise HTTPException(
        status_code=502,
        detail=f"生成的智能体配置不完整：缺少 {', '.join(missing_fields)}",
    )


def normalize_history_text(history: list[ChatMessage], limit: int = 8) -> str:
    if not history:
        return "暂无历史消息。"
    trimmed = history[-limit:]
    return "\n".join(
        [f"{item.role}: {item.content.strip()}" for item in trimmed if item.content.strip()]
    ) or "暂无历史消息。"


@app.get("/health")
async def health():
    return JSONResponse({"ok": True})


@app.post("/runs/document-summary")
async def run_document_summary(request: DocumentSummaryRequest):
    if not request.model_settings.model:
        raise HTTPException(status_code=400, detail="model 不能为空")

    template = get_prompt_config().templates.document_summary
    if request.mode == "segment":
        text = request.text.strip()
        if not text:
            raise HTTPException(status_code=400, detail="text 不能为空")
        prompt = "\n\n".join([
            f"文档名称：{request.source_name or '未命名文档'}",
            f"用户引导语：{request.guidance or '无'}",
            f"当前片段：{request.index + 1}/{max(request.total, 1)}",
            "片段内容：",
            text,
        ])
        summary, usage = await invoke_text_model(
            request.model_settings.model_dump(),
            template.segment_system_instruction,
            prompt,
        )
    else:
        items = [item.strip() for item in request.summaries if item.strip()]
        if not items:
            raise HTTPException(status_code=400, detail="summaries 不能为空")
        prompt = "\n\n".join([
            f"文档名称：{request.source_name or '未命名文档'}",
            f"用户引导语：{request.guidance or '无'}",
            f"聚合轮次：{max(request.round, 1)}",
            "待压缩摘要：",
            "\n\n".join([f"- {item}" for item in items]),
        ])
        summary, usage = await invoke_text_model(
            request.model_settings.model_dump(),
            template.aggregate_system_instruction,
            prompt,
        )

    return JSONResponse(SummaryResponse(summary=summary, usage=usage).model_dump())


@app.post("/runs/robot-generation")
async def run_robot_generation(request: RobotGenerationRequest):
    if not request.model_settings.model:
        raise HTTPException(status_code=400, detail="model 不能为空")
    if not request.document_summary.strip() and not any(item.strip() for item in request.segment_summaries):
        raise HTTPException(status_code=400, detail="document_summary 不能为空")

    template = get_prompt_config().templates.robot_generation
    config = request.model_settings.model_dump()
    core_prompt = build_robot_generation_context(request)
    logger.info("robot generation started: source=%s guidance=%s", request.source_name or "未命名文档", request.guidance or "")
    core_payload, core_usage = await invoke_structured_model(
        config,
        template.core_system_instruction,
        core_prompt,
        RobotGenerationCorePayload,
        "智能体核心配置",
    )
    logger.info("robot generation core ready: name=%s", core_payload.name)
    memory_schema_payload, memory_usage = await invoke_structured_model(
        config,
        template.memory_schema_system_instruction,
        build_memory_schema_prompt(request, core_payload),
        GeneratedMemorySchemaPayload,
        "结构化记忆 schema",
    )
    logger.info(
        "robot generation memory schema ready: category_count=%s",
        len(memory_schema_payload.categories),
    )
    try:
        payload = GeneratedRobotPayload.model_validate({
            **core_payload.model_dump(by_alias=False),
            "memory_schema": memory_schema_payload.model_dump(by_alias=False),
        })
    except ValidationError as error:
        raise HTTPException(status_code=502, detail=f"合并智能体配置失败：{error}") from error
    ensure_generated_robot_payload(payload)
    response = payload.model_dump(by_alias=False)
    response["usage"] = sum_usage(core_usage, memory_usage)
    return JSONResponse(response)


@app.post("/runs/robot-world-graph-evolution")
async def run_robot_world_graph_evolution(request: RobotWorldGraphEvolutionRequest):
    if not request.model_settings.model:
        raise HTTPException(status_code=400, detail="model 不能为空")
    if not request.segment_summary.strip():
        raise HTTPException(status_code=400, detail="segment_summary 不能为空")

    template = get_prompt_config().templates.robot_generation
    patch_payload, usage = await invoke_structured_model(
        request.model_settings.model_dump(),
        template.world_graph_evolution_system_instruction,
        build_world_graph_evolution_prompt(request),
        GeneratedWorldGraphPatchPayload,
        "世界图谱演化 patch",
    )
    return JSONResponse({
        "world_graph_patch": patch_payload.model_dump(by_alias=False),
        "usage": usage,
    })


@app.post("/runs/retrieval-summary")
async def run_retrieval_summary(request: RetrievalSummaryRequest):
    if not request.model_settings.model:
        raise HTTPException(status_code=400, detail="model 不能为空")
    if not request.prompt.strip() and not any(item.content.strip() for item in request.history):
        raise HTTPException(status_code=400, detail="prompt 不能为空")

    template = get_prompt_config().templates.retrieval_summary
    prompt = "\n\n".join([
        f"机器人名称：{request.robot_name or '当前智能体'}",
        f"机器人简介：{request.robot_description or '无'}",
        f"故事梗概：{request.story_outline or '无'}",
        "最近对话：",
        normalize_history_text(request.history),
        "用户当前输入：",
        request.prompt.strip() or "无",
    ])
    summary, usage = await invoke_text_model(
        request.model_settings.model_dump(),
        template.system_instruction,
        prompt,
    )
    return JSONResponse(SummaryResponse(summary=summary, usage=usage).model_dump())


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
            usage = {"prompt_tokens": 0, "completion_tokens": 0}
            try:
                numeric_payload = await numeric_agent_node(state)
            except Exception as error:
                raise RuntimeError(format_stage_error(request, "数值计算阶段", error)) from error
            state.update(numeric_payload)
            usage = numeric_payload.get("usage") or usage
            yield sse({"type": "numeric_state_updated", "state": state.get("numeric_state") or {}})

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

            next_messages = [*history, ChatMessage(role="user", content=request.prompt), ChatMessage(role="assistant", content=final_response)]
            try:
                store.save(
                    ThreadState(
                        thread_id=request.thread_id,
                        messages=next_messages,
                        memory_schema=memory_schema,
                        structured_memory=state["structured_memory"],
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
                "memory": state["structured_memory"].model_dump(),
                "numeric_state": state.get("numeric_state") or {},
                "story_outline": state.get("story_outline") or "",
                "usage": usage,
            })
        except Exception as error:
            yield sse({
                "type": "error",
                "message": str(error).strip() or format_stage_error(request, "执行阶段", error),
            })

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/runs/memory")
async def run_memory(request: RunRequest):
    if not request.model_settings.model:
        raise HTTPException(status_code=400, detail="model 不能为空")
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="prompt 不能为空")

    state, _structured_memory = build_request_state(request)
    payload = await memory_node(state)
    memory = payload.get("structured_memory")
    if not isinstance(memory, StructuredMemory):
        raise HTTPException(status_code=500, detail="结构化记忆结果无效")
    save_memory_to_thread(request, memory, state)
    return JSONResponse({
        "threadId": request.thread_id,
        "memory": memory.model_dump(),
        "usage": payload.get("usage") or {"prompt_tokens": 0, "completion_tokens": 0},
    })


@app.post("/runs/world-graph-writeback")
async def run_world_graph_writeback(request: RunRequest):
    if not request.model_settings.model:
        raise HTTPException(status_code=400, detail="model 不能为空")
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="prompt 不能为空")

    state, _structured_memory = build_request_state(request)
    payload = await world_graph_writeback_node(state)
    return JSONResponse({
        "threadId": request.thread_id,
        "world_graph_writeback_ops": payload.get("world_graph_writeback_ops") or {},
        "usage": payload.get("usage") or {"prompt_tokens": 0, "completion_tokens": 0},
    })
