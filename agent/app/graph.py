from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import TypedDict

from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from typing_extensions import NotRequired

from .schemas import (
    ChatMessage,
    MemoryCategorySchema,
    MemorySchema,
    MemorySchemaField,
    RunRequest,
    StructuredMemory,
    StructuredMemoryPatch,
    )
from .tools import fetch_url, web_search


class AgentState(TypedDict):
    thread_id: str
    prompt: str
    system_prompt: str
    history: list[dict]
    memory_schema: dict
    structured_memory: dict
    structured_memory_interval: int
    structured_memory_history_limit: int
    model_config: dict
    moderation: NotRequired[dict]
    research_summary: NotRequired[str]
    tool_events: NotRequired[list[dict]]
    final_response: NotRequired[str]
    ui_payload: NotRequired[dict]
    usage: NotRequired[dict]


DEFAULT_STRUCTURED_MEMORY_INTERVAL = 3
DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT = 12


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sanitize_base_url(base_url: str) -> str:
    return str(base_url or "").rstrip("/")


def build_model(config: dict) -> ChatOpenAI:
    return ChatOpenAI(
        model=config["model"],
        api_key=config["api_key"],
        base_url=sanitize_base_url(config["base_url"]),
        temperature=config.get("temperature", 0.7) or 0.7,
        stream_usage=True,
    )


def parse_json_object(raw: str, fallback: dict) -> dict:
    text = str(raw or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        if "\n" in text:
            text = text.split("\n", 1)[1]
    try:
        return json.loads(text)
    except Exception:
        return fallback


def normalize_ui_suggestions(input_value) -> list[dict]:
    items = input_value if isinstance(input_value, list) else []
    results: list[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or item.get("t") or "").strip()
        prompt = str(item.get("prompt") or item.get("p") or title).strip()
        if not title:
            continue
        results.append({
            "title": title,
            "prompt": prompt or title,
        })
    return results


def normalize_ui_options(input_value) -> list[dict]:
    items = input_value if isinstance(input_value, list) else []
    results: list[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or item.get("l") or item.get("value") or item.get("v") or "").strip()
        value = str(item.get("value") or item.get("v") or item.get("label") or item.get("l") or "").strip()
        if not label or not value:
            continue
        results.append({
            "label": label,
            "value": value,
        })
    return results


def normalize_ui_form(input_value) -> dict | None:
    if not isinstance(input_value, dict):
        return None

    raw_fields = input_value.get("fields")
    raw_fields = raw_fields if isinstance(raw_fields, list) else input_value.get("fs")
    raw_fields = raw_fields if isinstance(raw_fields, list) else []
    fields: list[dict] = []

    for index, field in enumerate(raw_fields):
        if not isinstance(field, dict):
            continue
        field_type = str(field.get("type") or field.get("t") or "input").strip()
        if field_type not in {"input", "radio", "checkbox", "select"}:
            field_type = "input"
        normalized = {
            "name": str(field.get("name") or field.get("n") or f"field_{index + 1}").strip(),
            "label": str(field.get("label") or field.get("l") or field.get("name") or field.get("n") or f"字段 {index + 1}").strip(),
            "type": field_type,
            "placeholder": str(field.get("placeholder") or field.get("p") or "").strip(),
            "required": bool(field.get("required") if field.get("required") is not None else field.get("r")),
            "inputType": "number" if str(field.get("inputType") or field.get("it") or "").strip() == "number" else "text",
            "multiple": bool(field.get("multiple") if field.get("multiple") is not None else field.get("m")),
            "options": normalize_ui_options(field.get("options") or field.get("o")),
            "defaultValue": field.get("defaultValue") if field.get("defaultValue") is not None else field.get("d", ""),
        }
        if normalized["name"] and normalized["label"]:
            fields.append(normalized)

    if not fields:
        return None

    return {
        "title": str(input_value.get("title") or input_value.get("ti") or "请补充信息").strip(),
        "description": str(input_value.get("description") or input_value.get("de") or "").strip(),
        "submitText": str(input_value.get("submitText") or input_value.get("st") or "提交").strip(),
        "fields": fields,
    }


def normalize_ui_payload(input_value) -> dict:
    payload = input_value if isinstance(input_value, dict) else {}
    suggestions = normalize_ui_suggestions(payload.get("suggestions") or payload.get("s"))
    form = normalize_ui_form(payload.get("form") or payload.get("f"))
    if form:
        suggestions = []
    if not form and not suggestions:
        suggestions = [{"title": "继续", "prompt": "继续"}]
    return {"suggestions": suggestions, "form": form}


def extract_usage(message) -> dict:
    usage = getattr(message, "usage_metadata", None) or {}
    input_tokens = int(usage.get("input_tokens", 0) or 0)
    output_tokens = int(usage.get("output_tokens", 0) or 0)
    return {
        "prompt_tokens": input_tokens,
        "completion_tokens": output_tokens,
    }


def chunk_text(chunk) -> str:
    content = getattr(chunk, "content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "".join(parts)
    return str(content or "")


def field_type_text(field: MemorySchemaField) -> str:
    if field.type == "enum":
        options = ", ".join([option.value for option in field.options]) or "无"
        return f"enum({options})"
    if field.type == "object":
        child = ", ".join([sub.name for sub in field.fields]) or "无子字段"
        return f"object({child})"
    if field.type == "array":
        if field.item_type == "enum":
            options = ", ".join([option.value for option in field.item_options]) or "无"
            return f"array(enum:{options})"
        if field.item_type == "object":
            child = ", ".join([sub.name for sub in field.item_fields]) or "无子字段"
            return f"array(object:{child})"
        return f"array({field.item_type or 'text'})"
    return field.type


def schema_text(schema: MemorySchema) -> str:
    if not schema.categories:
        return "暂无记忆 schema。"
    lines: list[str] = []
    for category in schema.categories:
        lines.append(f"- {category.id} | {category.label}")
        if category.description:
            lines.append(f"  描述：{category.description}")
        if category.extraction_instructions:
            lines.append(f"  抽取说明：{category.extraction_instructions}")
        for field in category.fields:
            required = "必填" if field.required else "可选"
            lines.append(f"  字段：{field.name} ({field.label}) / {field_type_text(field)} / {required}")
    return "\n".join(lines)


def memory_text(memory: StructuredMemory) -> str:
    if not memory.categories:
        return "暂无结构化记忆。"

    parts: list[str] = []
    for category in memory.categories:
        parts.append(f"{category.label or category.category_id}：")
        for item in category.items[:8]:
            value_text = ", ".join([f"{key}={json.dumps(value, ensure_ascii=False)}" for key, value in item.values.items()])
            summary = item.summary.strip()
            parts.append(f"- {summary or value_text or item.id}")
            if value_text and summary != value_text:
                parts.append(f"  {value_text}")
    return "\n".join(parts) if parts else "暂无结构化记忆。"


def default_structured_memory(schema: MemorySchema) -> StructuredMemory:
    return StructuredMemory(
        updated_at="",
        categories=[
            {
                "category_id": category.id,
                "label": category.label,
                "description": category.description,
                "updated_at": "",
                "items": [],
            }
            for category in schema.categories
        ],
    )


def normalize_positive_int(value, fallback: int) -> int:
    try:
        normalized = int(value)
    except Exception:
        return fallback
    return normalized if normalized > 0 else fallback


def history_text(history: list[dict], limit: int = DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT) -> str:
    if not history:
        return "暂无历史消息。"
    normalized_limit = normalize_positive_int(limit, DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT)
    return "\n".join([f"{item['role']}: {item['content']}" for item in history[-normalized_limit:]])


def normalize_scalar(value, field_type: str, enum_options: set[str] | None = None):
    if field_type == "number":
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return value
        try:
            return float(value)
        except Exception:
            return None
    if field_type == "boolean":
        if isinstance(value, bool):
            return value
        text = str(value).strip().lower()
        if text in {"true", "1", "yes", "y"}:
            return True
        if text in {"false", "0", "no", "n"}:
            return False
        return None
    if field_type == "enum":
        text = str(value or "").strip()
        return text if text and (not enum_options or text in enum_options) else None
    text = str(value or "").strip()
    return text or None


def normalize_field_value(field: MemorySchemaField, value):
    if field.type == "object":
        source = value if isinstance(value, dict) else {}
        result: dict = {}
        for child in field.fields:
            child_value = normalize_field_value(child, source.get(child.name))
            if child_value is not None:
                result[child.name] = child_value
        return result or None

    if field.type == "array":
        items = value if isinstance(value, list) else []
        normalized_items: list = []
        for item in items[:20]:
            if field.item_type == "object":
                source = item if isinstance(item, dict) else {}
                child_result: dict = {}
                for child in field.item_fields:
                    child_value = normalize_field_value(child, source.get(child.name))
                    if child_value is not None:
                        child_result[child.name] = child_value
                if child_result:
                    normalized_items.append(child_result)
            else:
                normalized = normalize_scalar(
                    item,
                    field.item_type or "text",
                    {option.value for option in field.item_options} if field.item_type == "enum" else None,
                )
                if normalized is not None:
                    normalized_items.append(normalized)
        return normalized_items or None

    return normalize_scalar(
        value,
        field.type,
        {option.value for option in field.options} if field.type == "enum" else None,
    )


def normalize_structured_memory(schema: MemorySchema, payload: dict) -> StructuredMemory:
    category_map = {
        str(item.get("category_id") or item.get("categoryId") or ""): item
        for item in (payload.get("categories") or [])
        if isinstance(item, dict)
    }
    categories: list[dict] = []

    for category in schema.categories:
        raw_category = category_map.get(category.id, {})
        raw_items = raw_category.get("items") if isinstance(raw_category, dict) else []
        items: list[dict] = []

        for item_index, raw_item in enumerate(raw_items if isinstance(raw_items, list) else []):
            raw_values = raw_item.get("values") if isinstance(raw_item, dict) else {}
            raw_values = raw_values if isinstance(raw_values, dict) else {}
            values: dict = {}
            for field in category.fields:
                normalized = normalize_field_value(field, raw_values.get(field.name))
                if normalized is not None:
                    values[field.name] = normalized
            if not values:
                continue
            items.append({
                "id": str(raw_item.get("id") or f"{category.id}_{item_index + 1}"),
                "summary": str(raw_item.get("summary") or "").strip(),
                "source_turn_id": str(raw_item.get("source_turn_id") or raw_item.get("sourceTurnId") or ""),
                "updated_at": str(raw_item.get("updated_at") or raw_item.get("updatedAt") or utc_now()),
                "values": values,
            })

        categories.append({
            "category_id": category.id,
            "label": category.label,
            "description": category.description,
            "updated_at": str(raw_category.get("updated_at") or raw_category.get("updatedAt") or utc_now()) if items else "",
            "items": items,
        })

    return StructuredMemory.model_validate({
        "updated_at": str(payload.get("updated_at") or payload.get("updatedAt") or utc_now()),
        "categories": categories,
    })


def default_structured_memory_patch(schema: MemorySchema) -> StructuredMemoryPatch:
    return StructuredMemoryPatch(
        updated_at="",
        categories=[{"category_id": category.id, "updated_at": "", "items": []} for category in schema.categories],
    )


def normalize_structured_memory_patch(schema: MemorySchema, payload: dict) -> StructuredMemoryPatch:
    category_map = {
        str(item.get("category_id") or item.get("categoryId") or ""): item
        for item in (payload.get("categories") or [])
        if isinstance(item, dict)
    }
    categories: list[dict] = []

    for category in schema.categories:
        raw_category = category_map.get(category.id, {})
        raw_items = raw_category.get("items") if isinstance(raw_category, dict) else []
        items: list[dict] = []

        for item_index, raw_item in enumerate(raw_items if isinstance(raw_items, list) else []):
            op = str(raw_item.get("op") or "add").strip().lower()
            if op not in {"add", "update", "delete"}:
                op = "add"
            item_id = str(raw_item.get("id") or "").strip()
            if op in {"update", "delete"} and not item_id:
                continue

            raw_values = raw_item.get("values") if isinstance(raw_item, dict) else {}
            raw_values = raw_values if isinstance(raw_values, dict) else {}
            values: dict = {}
            if op != "delete":
                for field in category.fields:
                    normalized = normalize_field_value(field, raw_values.get(field.name))
                    if normalized is not None:
                        values[field.name] = normalized
                if op == "add" and not values:
                    continue
                if op == "update" and not values and not str(raw_item.get("summary") or "").strip():
                    continue

            items.append({
                "op": op,
                "id": item_id or f"{category.id}_{item_index + 1}_{int(datetime.now(timezone.utc).timestamp())}",
                "summary": str(raw_item.get("summary") or "").strip(),
                "source_turn_id": str(raw_item.get("source_turn_id") or raw_item.get("sourceTurnId") or ""),
                "updated_at": str(raw_item.get("updated_at") or raw_item.get("updatedAt") or utc_now()),
                "values": values,
            })

        categories.append({
            "category_id": category.id,
            "updated_at": str(raw_category.get("updated_at") or raw_category.get("updatedAt") or (utc_now() if items else "")),
            "items": items,
        })

    return StructuredMemoryPatch.model_validate({
        "updated_at": str(payload.get("updated_at") or payload.get("updatedAt") or utc_now()),
        "categories": categories,
    })


def merge_structured_memory(schema: MemorySchema, current_memory: StructuredMemory, patch_memory: StructuredMemoryPatch) -> StructuredMemory:
    current_map = {category.category_id: category for category in current_memory.categories}
    merged_categories: list[dict] = []

    for category in schema.categories:
        current_category = current_map.get(category.id)
        next_category = next((item for item in patch_memory.categories if item.category_id == category.id), None)
        current_items = [item.model_dump() for item in current_category.items] if current_category else []
        next_items = [item.model_dump() for item in next_category.items] if next_category else []

        merged_items = [*current_items]
        for next_item in next_items:
            op = str(next_item.get("op") or "add")
            target_id = str(next_item.get("id") or "").strip()
            match_index = next(
                (index for index, current_item in enumerate(merged_items) if str(current_item.get("id") or "").strip() == target_id),
                -1,
            )
            if op == "delete":
                if match_index >= 0:
                    merged_items.pop(match_index)
                continue
            if op == "update":
                if match_index < 0:
                    continue
                merged_items[match_index] = {
                    **merged_items[match_index],
                    **next_item,
                    "values": {
                        **(merged_items[match_index].get("values") or {}),
                        **(next_item.get("values") or {}),
                    },
                }
                merged_items[match_index].pop("op", None)
                continue
            item_to_add = {**next_item}
            item_to_add.pop("op", None)
            merged_items.append(item_to_add)

        merged_categories.append({
            "category_id": category.id,
            "label": category.label,
            "description": category.description,
            "updated_at": utc_now() if next_items else (current_category.updated_at if current_category and current_category.items else ""),
            "items": merged_items,
        })

    return StructuredMemory.model_validate({
        "updated_at": utc_now() if any(category.items for category in patch_memory.categories) or any(category.items for category in current_memory.categories) else current_memory.updated_at,
        "categories": merged_categories,
    })


async def moderator_node(state: AgentState) -> dict:
    model = build_model(state["model_config"])
    prompt = (
        "你是多智能体群聊中的 moderator。"
        "请判断当前用户问题是否需要联网搜索，并给出最多 2 个搜索词。"
        '只输出 JSON：{"need_web_search":true|false,"search_queries":["..."],"summary":"给下游智能体的简短说明"}'
    )
    response = await model.ainvoke(
        [
            {"role": "system", "content": prompt},
            {
                "role": "user",
                "content": (
                    f"结构化记忆：\n{memory_text(StructuredMemory.model_validate(state['structured_memory']))}\n\n"
                    f"历史消息：\n{history_text(state['history'], state['structured_memory_history_limit'])}\n\n"
                    f"用户最新输入：{state['prompt']}"
                ),
            },
        ]
    )
    moderation = parse_json_object(
        response.content if isinstance(response.content, str) else str(response.content),
        {"need_web_search": False, "search_queries": [], "summary": "直接回答"},
    )
    usage = extract_usage(response)
    return {"moderation": moderation, "usage": usage}


async def researcher_node(state: AgentState) -> dict:
    moderation = state.get("moderation") or {}
    queries = [str(item).strip() for item in moderation.get("search_queries", []) if str(item).strip()][:2]
    tool_events: list[dict] = []
    summaries: list[str] = []
    for query in queries:
        tool_events.append({"type": "tool_call", "tool": "web_search", "query": query})
        results = await web_search(query)
        tool_events.append({"type": "tool_result", "tool": "web_search", "query": query, "results": results})
        summaries.append(f"搜索词：{query}")
        for item in results[:3]:
            summaries.append(f"- {item['title']} | {item['url']} | {item['snippet']}")
        first_url = results[0]["url"] if results else ""
        if first_url:
            tool_events.append({"type": "tool_call", "tool": "url_fetch", "url": first_url})
            fetched = await fetch_url(first_url)
            tool_events.append({"type": "tool_result", "tool": "url_fetch", "url": first_url, "page": fetched})
            summaries.append(f"页面摘要：{fetched['title']}\n{fetched['content']}")
    return {
        "tool_events": tool_events,
        "research_summary": "\n".join(summaries).strip(),
    }


async def answerer_node(state: AgentState) -> dict:
    model = build_model(state["model_config"])
    research = state.get("research_summary") or "无额外联网资料。"
    structured_memory = StructuredMemory.model_validate(state["structured_memory"])
    response = await model.ainvoke(build_answerer_messages(state, structured_memory, research))
    usage = extract_usage(response)
    content = response.content if isinstance(response.content, str) else str(response.content)
    return {"final_response": content.strip(), "usage": usage}


def build_answerer_messages(
    state: AgentState,
    structured_memory: StructuredMemory | None = None,
    research: str | None = None,
) -> list[dict]:
    memory = structured_memory or StructuredMemory.model_validate(state["structured_memory"])
    research_text = research if research is not None else state.get("research_summary") or "无额外联网资料。"
    return [
        {
            "role": "system",
            "content": (
                f"{state['system_prompt']}\n\n"
                "请综合结构化记忆、历史消息，直接给出中文内容。"
            ).strip(),
        },
        {
            "role": "user",
            "content": (
                f"结构化记忆：\n{memory_text(memory)}\n\n"
                f"历史消息：\n{history_text(state['history'], state['structured_memory_history_limit'])}\n\n"
                f"moderator 说明：{(state.get('moderation') or {}).get('summary', '')}\n\n"
                f"researcher 输出：\n{research_text}\n\n"
                f"用户最新输入：{state['prompt']}"
            ),
        },
    ]


async def ui_agent_node(state: AgentState) -> dict:
    model = build_model(state["model_config"])
    structured_memory = StructuredMemory.model_validate(state["structured_memory"])
    response = await model.ainvoke(
        [
            {
                "role": "system",
                "content": (
                    "你负责为当前 assistant 回复生成聊天气泡里的交互 UI。"
                    "只输出 JSON，顶层结构固定为 {\"suggestions\":[{\"title\":\"按钮文字\",\"prompt\":\"点击后发送文本\"}],\"form\":null} 或 {\"suggestions\":[],\"form\":{\"title\":\"标题\",\"description\":\"说明\",\"submitText\":\"提交\",\"fields\":[{\"name\":\"字段名\",\"label\":\"字段标签\",\"type\":\"input|radio|checkbox|select\",\"placeholder\":\"占位\",\"required\":true,\"inputType\":\"text|number\",\"multiple\":false,\"options\":[{\"label\":\"选项\",\"value\":\"值\"}],\"defaultValue\":\"默认值\"}]}}。"
                    "只要当前回复要求用户输入，补充、填写任何输入内容，必须优先生成 form，不要生成 suggestions。"
                    "只有在不需要用户输入、只是给出后续动作或方向选择时，才生成 suggestions。"
                    "当回复存在明确下一步选择时，生成 suggestions。"
                    "form 和 suggestions 不能同时出现。"
                    "如果没有明显交互需求，也必须返回一个 suggestions，内容只能有一个继续。"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"结构化记忆：\n{memory_text(structured_memory)}\n\n"
                    f"历史消息：\n{history_text(state['history'], state['structured_memory_history_limit'])}\n\n"
                    f"用户最新输入：{state['prompt']}\n\n"
                    f"assistant 最终回复：\n{state.get('final_response', '')}"
                ),
            },
        ]
    )
    usage = extract_usage(response)
    raw = response.content if isinstance(response.content, str) else str(response.content)
    parsed = parse_json_object(raw, {})
    ui_payload = normalize_ui_payload(parsed)
    return {"ui_payload": ui_payload, "usage": usage}


async def memory_node(state: AgentState) -> dict:
    model = build_model(state["model_config"])
    schema = MemorySchema.model_validate(state["memory_schema"])
    current_memory = StructuredMemory.model_validate(state["structured_memory"])
    response = await model.ainvoke(
        [
            {
                "role": "system",
                "content": (
                    "你负责把当前对话整理成结构化长期记忆。"
                    "你必须严格遵循给定 schema，只输出 JSON。"
                    "你输出的是增量 patch，不是完整重写后的全部记忆。"
                    "顶层结构固定为："
                    '{"updated_at":"ISO时间","categories":[{"category_id":"分类ID","updated_at":"ISO时间","items":[{"op":"add|update|delete","id":"记录ID","summary":"一句话总结","source_turn_id":"来源轮次ID","updated_at":"ISO时间","values":{"字段名":"字段值"}}]}]}。'
                    "categories 里只能使用 schema 中声明的 category_id。"
                    "values 里只能写该分类 schema 声明过的字段。"
                    "每个 item 必须显式声明 op，只允许 add、update、delete。"
                    "只输出本轮新增或发生变化的记忆项；未变化的旧记忆不要重复输出。"
                    "如果某个分类本轮没有新增或变化，items 输出空数组即可。"
                    "如果要修改已有记忆，必须使用 op=update，并提供现有记录的 id。"
                    "如果要删除已有记忆，必须使用 op=delete，并提供现有记录的 id。"
                    "delete 时不要输出 values。"
                    "add 时必须提供有效 values；update 时只需要输出要修改的字段。"
                    "除非本轮明确要求删除或纠正错误记忆，否则不要输出 delete。"
                    "不要输出没有任何字段值的 add item，不要输出缺少 id 的 update/delete item。"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"当前记忆 schema：\n{schema_text(schema)}\n\n"
                    f"现有结构化记忆：\n{json.dumps(current_memory.model_dump(), ensure_ascii=False)}\n\n"
                    "你需要根据现有记忆的 id 决定执行 add、update 还是 delete。\n\n"
                    f"历史消息：\n{history_text(state['history'], state['structured_memory_history_limit'])}\n\n"
                    f"用户最新输入：{state['prompt']}\n\n"
                    f"助手最终回复：{state.get('final_response', '')}"
                ),
            },
        ]
    )
    usage = extract_usage(response)
    raw = response.content if isinstance(response.content, str) else str(response.content)
    parsed = parse_json_object(raw, default_structured_memory_patch(schema).model_dump())
    patch_memory = normalize_structured_memory_patch(schema, parsed)
    memory = merge_structured_memory(schema, current_memory, patch_memory).model_dump()
    return {"structured_memory": memory, "usage": usage}


def add_usage(existing: dict | None, delta: dict | None) -> dict:
    left = existing or {"prompt_tokens": 0, "completion_tokens": 0}
    right = delta or {"prompt_tokens": 0, "completion_tokens": 0}
    return {
        "prompt_tokens": int(left.get("prompt_tokens", 0)) + int(right.get("prompt_tokens", 0)),
        "completion_tokens": int(left.get("completion_tokens", 0)) + int(right.get("completion_tokens", 0)),
    }


def build_graph():
    graph = StateGraph(AgentState)

    async def moderator(state: AgentState) -> dict:
        result = await moderator_node(state)
        return {"moderation": result["moderation"], "usage": add_usage(state.get("usage"), result.get("usage"))}

    async def researcher(state: AgentState) -> dict:
        return await researcher_node(state)

    async def answerer(state: AgentState) -> dict:
        result = await answerer_node(state)
        return {"final_response": result["final_response"], "usage": add_usage(state.get("usage"), result.get("usage"))}

    async def ui_agent(state: AgentState) -> dict:
        result = await ui_agent_node(state)
        return {"ui_payload": result["ui_payload"], "usage": add_usage(state.get("usage"), result.get("usage"))}

    async def memory(state: AgentState) -> dict:
        result = await memory_node(state)
        return {"structured_memory": result["structured_memory"], "usage": add_usage(state.get("usage"), result.get("usage"))}

    graph.add_node("moderator", moderator)
    graph.add_node("researcher", researcher)
    graph.add_node("answerer", answerer)
    graph.add_node("ui_agent", ui_agent)
    graph.add_node("memory", memory)
    graph.add_edge(START, "moderator")
    graph.add_conditional_edges(
        "moderator",
        lambda state: "researcher" if (state.get("moderation") or {}).get("need_web_search") else "answerer",
        {"researcher": "researcher", "answerer": "answerer"},
    )
    graph.add_edge("researcher", "answerer")
    graph.add_edge("answerer", "ui_agent")
    graph.add_edge("ui_agent", "memory")
    graph.add_edge("memory", END)
    return graph.compile()


def build_initial_state(
    request: RunRequest,
    history: list[ChatMessage],
    memory_schema: MemorySchema,
    structured_memory: StructuredMemory,
) -> AgentState:
    return {
        "thread_id": request.thread_id,
        "prompt": request.prompt,
        "system_prompt": request.system_prompt or request.robot.system_prompt or "",
        "history": [item.model_dump() for item in history],
        "memory_schema": memory_schema.model_dump(),
        "structured_memory": structured_memory.model_dump(),
        "structured_memory_interval": normalize_positive_int(
            request.structured_memory_interval or request.robot.structured_memory_interval,
            DEFAULT_STRUCTURED_MEMORY_INTERVAL,
        ),
        "structured_memory_history_limit": normalize_positive_int(
            request.structured_memory_history_limit or request.robot.structured_memory_history_limit,
            DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT,
        ),
        "model_config": request.model_settings.model_dump(),
        "usage": {"prompt_tokens": 0, "completion_tokens": 0},
    }
