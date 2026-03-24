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
class AgentState(TypedDict):
    thread_id: str
    prompt: str
    common_prompt: str
    system_prompt: str
    history: list[dict]
    memory_schema: dict
    structured_memory: dict
    structured_memory_interval: int
    structured_memory_history_limit: int
    model_config: dict
    numeric_computation_enabled: bool
    numeric_computation_prompt: str
    numeric_computation_items: list[dict]
    numeric_state: dict
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


def compose_system_prompt(*sections: str) -> str:
    return "\n\n".join([section.strip() for section in sections if isinstance(section, str) and section.strip()])


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


def normalize_numeric_items(input_value) -> list[dict]:
    items = input_value if isinstance(input_value, list) else []
    results: list[dict] = []
    seen_names: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name or name in seen_names:
            continue
        try:
            current_value = float(item.get("current_value") if item.get("current_value") is not None else item.get("currentValue"))
        except Exception:
            continue
        description = str(item.get("description") or "").strip()
        seen_names.add(name)
        results.append({
            "name": name,
            "current_value": current_value,
            "description": description,
        })
    return results


def numeric_items_to_schema(items: list[dict]) -> dict:
    return {item["name"]: float(item["current_value"]) for item in items if item.get("name")}


def numeric_items_description_text(items: list[dict]) -> str:
    if not items:
        return "暂无字段说明。"
    return "\n".join([
        f"- {item['name']}：默认值 {float(item['current_value']):g}；说明：{item.get('description') or '无'}"
        for item in items
    ])


def numeric_payload_for_answerer(items: list[dict], numeric_state: dict | None) -> list[dict]:
    result = numeric_state if isinstance(numeric_state, dict) else {}
    payload: list[dict] = []
    for item in items:
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        value = result.get(name, item.get("current_value"))
        try:
            normalized_value = float(value)
        except Exception:
            normalized_value = float(item.get("current_value") or 0)
        payload.append({
            "name": name,
            "currentValue": normalized_value,
            "description": str(item.get("description") or "").strip(),
        })
    return payload


def normalize_numeric_state_value(schema_value, current_value, next_value):
    if isinstance(schema_value, dict):
        current_dict = current_value if isinstance(current_value, dict) else {}
        next_dict = next_value if isinstance(next_value, dict) else {}
        result: dict = {}
        for key, child_schema in schema_value.items():
            normalized_child = normalize_numeric_state_value(child_schema, current_dict.get(key), next_dict.get(key))
            if normalized_child is not None:
                result[key] = normalized_child
        return result

    if isinstance(next_value, (int, float)) and not isinstance(next_value, bool):
        return float(next_value)
    if isinstance(current_value, (int, float)) and not isinstance(current_value, bool):
        return float(current_value)
    return float(schema_value)


def numeric_state_text(state_value) -> str:
    payload = state_value if isinstance(state_value, dict) else {}
    if not payload:
        return "暂无数值状态。"
    return json.dumps(payload, ensure_ascii=False)


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


async def answerer_node(state: AgentState) -> dict:
    model = build_model(state["model_config"])
    structured_memory = StructuredMemory.model_validate(state["structured_memory"])
    response = await model.ainvoke(build_answerer_messages(state, structured_memory))
    usage = extract_usage(response)
    content = response.content if isinstance(response.content, str) else str(response.content)
    return {"final_response": content.strip(), "usage": usage}


def build_answerer_messages(
    state: AgentState,
    structured_memory: StructuredMemory | None = None,
) -> list[dict]:
    memory = structured_memory or StructuredMemory.model_validate(state["structured_memory"])
    numeric_items = normalize_numeric_items(state.get("numeric_computation_items"))
    return [
        {
            "role": "system",
            "content": compose_system_prompt(
                state["common_prompt"],
                "请综合结构化记忆、历史消息，直接给出中文内容。",
                state["system_prompt"],
            ),
        },
        {
            "role": "user",
            "content": (
                f"结构化记忆：\n{memory_text(memory)}\n\n"
                "数值信息说明：每个数值项中的 description 字段表示这个值的名字或含义。你只能读取、引用这里提供的 currentValue，不能以任何形式自行计算、修改、推断、纠正、补全或重写这些数值；如果正文需要提到数值，必须严格以这里给出的 currentValue 为准。\n\n"
                f"数值信息：\n{json.dumps(numeric_payload_for_answerer(numeric_items, state.get('numeric_state')), ensure_ascii=False)}\n\n"
                f"历史消息：\n{history_text(state['history'], state['structured_memory_history_limit'])}\n\n"
                f"用户最新输入：{state['prompt']}"
            ),
        },
    ]


async def numeric_agent_node(state: AgentState) -> dict:
    numeric_items = normalize_numeric_items(state.get("numeric_computation_items"))
    numeric_schema = numeric_items_to_schema(numeric_items)
    current_numeric_state = normalize_numeric_state_value(numeric_schema, {}, state.get("numeric_state") or {})
    current_numeric_state = current_numeric_state if isinstance(current_numeric_state, dict) else {}

    if not state.get("numeric_computation_enabled") or not numeric_schema:
        return {
            "numeric_state": current_numeric_state,
            "usage": {"prompt_tokens": 0, "completion_tokens": 0},
        }

    model = build_model(state["model_config"])
    structured_memory = StructuredMemory.model_validate(state["structured_memory"])
    response = await model.ainvoke(
        [
            {
                "role": "system",
                "content": compose_system_prompt(
                    state["common_prompt"],
                    (
                        "你是多智能体系统中的数值计算节点，用来在正文回复前根据上下文生成数值 JSON。"
                        "你只能输出 JSON，不要输出解释。"
                        "输出格式必须是一个 JSON 对象，字段必须严格遵循给定数值结构体。"
                        "你必须根据用户传入的数值计算提示词修改当前 JSON 数据并输出。"
                        "所有叶子字段都必须是 number，不能输出字符串、布尔值、null。"
                        "不要输出 summary、explanation 或任何额外字段。"
                        f"\n\n用户配置的数值计算提示词：\n{state.get('numeric_computation_prompt') or '未配置'}"
                    ),
                    state["system_prompt"],
                ),
            },
            {
                "role": "user",
                "content": (
                    f"结构化记忆：\n{memory_text(structured_memory)}\n\n"
                    f"数值字段定义：\n{numeric_items_description_text(numeric_items)}\n\n"
                    f"数值结构体：\n{json.dumps(numeric_schema, ensure_ascii=False)}\n\n"
                    f"当前数值状态：\n{numeric_state_text(current_numeric_state)}\n\n"
                    f"历史消息：\n{history_text(state['history'], state['structured_memory_history_limit'])}\n\n"
                    f"用户最新输入：{state['prompt']}"
                ),
            },
        ]
    )
    usage = extract_usage(response)
    raw_content = response.content if isinstance(response.content, str) else str(response.content)
    parsed = parse_json_object(raw_content, numeric_schema)
    numeric_result = normalize_numeric_state_value(
        numeric_schema,
        current_numeric_state,
        parsed,
    )
    numeric_result = numeric_result if isinstance(numeric_result, dict) else numeric_schema
    print(
        "[numeric-agent]",
        json.dumps(
            {
                "prompt": state.get("prompt") or "",
                "raw_output": raw_content,
                "parsed_output": parsed,
                "numeric_result": numeric_result,
            },
            ensure_ascii=False,
        ),
        flush=True,
    )
    return {
        "numeric_state": numeric_result,
        "usage": usage,
    }


async def ui_agent_node(state: AgentState) -> dict:
    model = build_model(state["model_config"])
    structured_memory = StructuredMemory.model_validate(state["structured_memory"])
    response = await model.ainvoke(
        [
            {
                "role": "system",
                "content": compose_system_prompt(
                    state["common_prompt"],
                    (
                        "你负责为当前 assistant 回复生成聊天气泡里的交互 UI。"
                        "只输出 JSON，顶层结构固定为 {\"suggestions\":[{\"title\":\"按钮文字\",\"prompt\":\"点击后发送文本\"}],\"form\":null} 或 {\"suggestions\":[],\"form\":{\"title\":\"标题\",\"description\":\"说明\",\"submitText\":\"提交\",\"fields\":[{\"name\":\"字段名\",\"label\":\"字段标签\",\"type\":\"input|radio|checkbox|select\",\"placeholder\":\"占位\",\"required\":true,\"inputType\":\"text|number\",\"multiple\":false,\"options\":[{\"label\":\"选项\",\"value\":\"值\"}],\"defaultValue\":\"默认值\"}]}}。"
                        "只要当前回复要求用户输入，补充、填写任何输入内容，必须优先生成 form，不要生成 suggestions。"
                        "只有在不需要用户输入、只是给出后续动作或方向选择时，才生成 suggestions。"
                        "当回复存在明确下一步选择时，生成 suggestions。"
                        "form 和 suggestions 不能同时出现。"
                        "如果没有明显交互需求，也必须返回一个 suggestions，内容只能有一个继续。"
                    ),
                    state["system_prompt"],
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
                "content": compose_system_prompt(
                    state["common_prompt"],
                    (
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
                    state["system_prompt"],
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

    async def numeric_agent(state: AgentState) -> dict:
        result = await numeric_agent_node(state)
        return {
            "numeric_state": result.get("numeric_state", {}),
            "usage": add_usage(state.get("usage"), result.get("usage")),
        }

    async def answerer(state: AgentState) -> dict:
        result = await answerer_node(state)
        return {"final_response": result["final_response"], "usage": add_usage(state.get("usage"), result.get("usage"))}

    async def ui_agent(state: AgentState) -> dict:
        result = await ui_agent_node(state)
        return {"ui_payload": result["ui_payload"], "usage": add_usage(state.get("usage"), result.get("usage"))}

    async def memory(state: AgentState) -> dict:
        result = await memory_node(state)
        return {"structured_memory": result["structured_memory"], "usage": add_usage(state.get("usage"), result.get("usage"))}

    graph.add_node("numeric_agent", numeric_agent)
    graph.add_node("answerer", answerer)
    graph.add_node("ui_agent", ui_agent)
    graph.add_node("memory", memory)
    graph.add_edge(START, "numeric_agent")
    graph.add_edge("numeric_agent", "answerer")
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
        "common_prompt": request.robot.common_prompt or "",
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
        "numeric_computation_enabled": bool(request.robot.numeric_computation_enabled),
        "numeric_computation_prompt": request.robot.numeric_computation_prompt or "",
        "numeric_computation_items": request.robot.numeric_computation_items or [],
        "numeric_state": request.numeric_state or {},
        "model_config": request.model_settings.model_dump(),
        "usage": {"prompt_tokens": 0, "completion_tokens": 0},
    }
