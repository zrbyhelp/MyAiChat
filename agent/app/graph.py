from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import TypedDict

from langchain_openai import ChatOpenAI
from typing_extensions import NotRequired

from .prompt_config import get_prompt_config
from .schemas import (
    ChatMessage,
    MemoryCategorySchema,
    MemorySchema,
    MemorySchemaField,
    RunRequest,
    StructuredMemory,
)


class AgentState(TypedDict):
    thread_id: str
    prompt: str
    common_prompt: str
    system_prompt: str
    history: list[dict]
    history_text: str
    memory_schema: MemorySchema
    structured_memory: StructuredMemory
    structured_memory_text: str
    structured_memory_payload_json: str
    structured_memory_interval: int
    structured_memory_history_limit: int
    model_config: dict
    auxiliary_model_configs: dict
    numeric_computation_enabled: bool
    numeric_computation_prompt: str
    numeric_computation_items: list[dict]
    numeric_state: dict
    world_graph_payload: dict
    world_graph_text_summary: str
    world_graph_decision: dict
    world_graph_writeback_ops: dict
    final_response: NotRequired[str]
    ui_payload: NotRequired[dict]
    usage: NotRequired[dict]


DEFAULT_STRUCTURED_MEMORY_INTERVAL = 3
DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT = 12
MAX_MEMORY_SUMMARY_LENGTH = 280
PROMPT_CONFIG = get_prompt_config()
DEBUG_LOGS_ENABLED = str(os.getenv("AGENT_DEBUG_LOGS", "")).strip().lower() in {"1", "true", "yes", "on"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def debug_log(label: str, payload: dict) -> None:
    if not DEBUG_LOGS_ENABLED:
        return
    print(label, json.dumps(payload, ensure_ascii=False), flush=True)


def history_payload(history: list[ChatMessage]) -> list[dict]:
    return [item.model_dump() for item in history]


def build_memory_context(memory: StructuredMemory) -> tuple[str, str]:
    return memory_text(memory), json.dumps(compact_memory_payload(memory), ensure_ascii=False)


def refresh_state_memory_context(state: AgentState, memory: StructuredMemory) -> None:
    memory_text_value, memory_payload_json = build_memory_context(memory)
    state["structured_memory"] = memory
    state["structured_memory_text"] = memory_text_value
    state["structured_memory_payload_json"] = memory_payload_json


def sanitize_base_url(base_url: str) -> str:
    return str(base_url or "").rstrip("/")


def resolve_model_base_url(config: dict) -> str:
    base_url = sanitize_base_url(config.get("base_url", ""))
    if str(config.get("provider") or "openai").strip() == "ollama" and not base_url.endswith("/v1"):
        return f"{base_url}/v1"
    return base_url


def resolve_model_api_key(config: dict) -> str:
    api_key = str(config.get("api_key") or "").strip()
    if api_key:
      return api_key
    if str(config.get("provider") or "openai").strip() == "ollama":
      return "ollama"
    return ""


def build_model(config: dict) -> ChatOpenAI:
    return ChatOpenAI(
        model=config["model"],
        api_key=resolve_model_api_key(config),
        base_url=resolve_model_base_url(config),
        temperature=config.get("temperature", 0.7) or 0.7,
        stream_usage=True,
    )


def resolve_node_model_config(state: AgentState, kind: str) -> dict:
    auxiliary_configs = state.get("auxiliary_model_configs") or {}
    target = auxiliary_configs.get(kind)
    if isinstance(target, dict) and str(target.get("model") or "").strip():
        return target
    return state["model_config"]


def compose_system_prompt(*sections: str) -> str:
    return "\n\n".join([section.strip() for section in sections if isinstance(section, str) and section.strip()])


def resolve_common_prompt(state: AgentState) -> str:
    return str(state.get("common_prompt") or PROMPT_CONFIG.defaults.common_prompt or "").strip()


def resolve_system_prompt(state: AgentState) -> str:
    return str(state.get("system_prompt") or PROMPT_CONFIG.defaults.system_prompt or "").strip()


def resolve_numeric_computation_prompt(state: AgentState) -> str:
    return str(state.get("numeric_computation_prompt") or PROMPT_CONFIG.defaults.numeric_computation_prompt or "").strip()


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


def truncate_text(value, limit: int) -> str:
    text = str(value or "").strip()
    if limit <= 0 or len(text) <= limit:
        return text
    return text[: max(limit - 1, 0)].rstrip() + "…"


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
        for item in category.items:
            value_text = ", ".join([
                f"{key}={json.dumps(value, ensure_ascii=False)}"
                for key, value in item.values.items()
            ])
            summary = item.summary.strip()
            parts.append(f"- {summary or value_text or item.id}")
            if value_text and summary != value_text:
                parts.append(f"  {value_text}")
    return "\n".join(parts) if parts else "暂无结构化记忆。"

def normalize_positive_int(value, fallback: int) -> int:
    try:
        normalized = int(value)
    except Exception:
        return fallback
    return normalized if normalized > 0 else fallback


def normalize_string_list(value) -> list[str]:
    items = value if isinstance(value, list) else []
    results: list[str] = []
    seen: set[str] = set()
    for item in items:
        text = str(item or "").strip()
        if text and text not in seen:
            seen.add(text)
            results.append(text)
    return results


def world_graph_json_text(value) -> str:
    payload = value if isinstance(value, dict) else {}
    return json.dumps(payload, ensure_ascii=False)


def normalize_world_graph_entity_candidate(value) -> dict | None:
    item = value if isinstance(value, dict) else {}
    entity_id = str(item.get("id") or "").strip()
    object_type = str(item.get("object_type") or item.get("objectType") or "").strip()
    name = str(item.get("name") or "").strip()
    summary = str(item.get("summary") or "").strip()
    if not entity_id or not object_type or not name:
        return None
    return {
        "id": entity_id,
        "object_type": object_type,
        "name": name,
        "summary": summary,
    }


def normalize_world_graph_decision(value) -> dict:
    payload = value if isinstance(value, dict) else {}
    candidates = [
        normalize_world_graph_entity_candidate(item)
        for item in (payload.get("candidate_new_entities") or payload.get("candidateNewEntities") or [])
    ]
    return {
        "focus_character_ids": normalize_string_list(payload.get("focus_character_ids") or payload.get("focusCharacterIds")),
        "focus_organization_ids": normalize_string_list(payload.get("focus_organization_ids") or payload.get("focusOrganizationIds")),
        "focus_location_ids": normalize_string_list(payload.get("focus_location_ids") or payload.get("focusLocationIds")),
        "focus_item_ids": normalize_string_list(payload.get("focus_item_ids") or payload.get("focusItemIds")),
        "focus_event_ids": normalize_string_list(payload.get("focus_event_ids") or payload.get("focusEventIds")),
        "focus_edge_ids": normalize_string_list(payload.get("focus_edge_ids") or payload.get("focusEdgeIds")),
        "primary_conflict": str(payload.get("primary_conflict") or payload.get("primaryConflict") or "").strip(),
        "recommended_progression": str(payload.get("recommended_progression") or payload.get("recommendedProgression") or "").strip(),
        "timeline_focus": str(payload.get("timeline_focus") or payload.get("timelineFocus") or "").strip(),
        "must_keep_consistency": normalize_string_list(payload.get("must_keep_consistency") or payload.get("mustKeepConsistency")),
        "candidate_new_entities": [item for item in candidates if item],
    }


def normalize_world_graph_context_output(value) -> dict:
    payload = value if isinstance(value, dict) else {}
    return {
        "context_summary": str(payload.get("context_summary") or payload.get("contextSummary") or "").strip(),
        "decision": normalize_world_graph_decision(payload.get("decision")),
    }


def normalize_world_graph_writeback_ops(value) -> dict:
    payload = value if isinstance(value, dict) else {}
    def normalize_list(key_snake: str, key_camel: str) -> list[dict]:
        items = payload.get(key_snake)
        if not isinstance(items, list):
            items = payload.get(key_camel)
        return [item for item in items if isinstance(item, dict)] if isinstance(items, list) else []

    return {
        "upsert_nodes": normalize_list("upsert_nodes", "upsertNodes"),
        "upsert_edges": normalize_list("upsert_edges", "upsertEdges"),
        "upsert_events": normalize_list("upsert_events", "upsertEvents"),
        "append_node_snapshots": normalize_list("append_node_snapshots", "appendNodeSnapshots"),
        "append_edge_snapshots": normalize_list("append_edge_snapshots", "appendEdgeSnapshots"),
        "append_event_effects": normalize_list("append_event_effects", "appendEventEffects"),
    }


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
    return normalize_scalar(
        value,
        field.type,
        {option.value for option in field.options} if field.type == "enum" else None,
    )


def normalize_memory_item(category: MemoryCategorySchema, raw_item: dict, item_index: int) -> dict | None:
    raw_values = raw_item.get("values") if isinstance(raw_item, dict) else {}
    raw_values = raw_values if isinstance(raw_values, dict) else {}
    values: dict = {}
    for field in category.fields:
        normalized = normalize_field_value(field, raw_values.get(field.name))
        if normalized is not None:
            values[field.name] = normalized
    if not values:
        return None
    return {
        "id": str(raw_item.get("id") or f"{category.id}_{item_index + 1}"),
        "summary": truncate_text(raw_item.get("summary") or "", MAX_MEMORY_SUMMARY_LENGTH),
        "source_turn_id": str(raw_item.get("source_turn_id") or raw_item.get("sourceTurnId") or ""),
        "updated_at": str(raw_item.get("updated_at") or raw_item.get("updatedAt") or utc_now()),
        "values": values,
    }


def normalize_structured_memory_category(category: MemoryCategorySchema, raw_category: dict | None) -> dict:
    raw_category = raw_category if isinstance(raw_category, dict) else {}
    raw_items = raw_category.get("items") if isinstance(raw_category.get("items"), list) else []
    items: list[dict] = []

    for item_index, raw_item in enumerate(raw_items):
        normalized_item = normalize_memory_item(category, raw_item if isinstance(raw_item, dict) else {}, item_index)
        if normalized_item:
            items.append(normalized_item)

    return {
        "category_id": category.id,
        "label": category.label,
        "description": category.description,
        "updated_at": str(raw_category.get("updated_at") or raw_category.get("updatedAt") or utc_now()) if items else "",
        "items": items,
    }


def normalize_structured_memory(schema: MemorySchema, payload: dict) -> StructuredMemory:
    category_map = {
        str(item.get("category_id") or item.get("categoryId") or ""): item
        for item in (payload.get("categories") or [])
        if isinstance(item, dict)
    }
    categories: list[dict] = []

    for category in schema.categories:
        categories.append(normalize_structured_memory_category(category, category_map.get(category.id)))

    return StructuredMemory.model_validate({
        "updated_at": str(payload.get("updated_at") or payload.get("updatedAt") or utc_now()),
        "categories": categories,
    })


def compact_category_memory_payload(category_memory: dict) -> dict:
    items = category_memory.get("items") if isinstance(category_memory.get("items"), list) else []
    compact_items: list[dict] = []
    for item in items:
        values = item.get("values") if isinstance(item.get("values"), dict) else {}
        compact_items.append({
            "id": str(item.get("id") or ""),
            "summary": str(item.get("summary") or ""),
            "source_turn_id": str(item.get("source_turn_id") or item.get("sourceTurnId") or ""),
            "updated_at": str(item.get("updated_at") or item.get("updatedAt") or ""),
            "values": values,
        })
    return {
        "category_id": str(category_memory.get("category_id") or category_memory.get("categoryId") or ""),
        "label": str(category_memory.get("label") or ""),
        "description": str(category_memory.get("description") or ""),
        "updated_at": str(category_memory.get("updated_at") or category_memory.get("updatedAt") or ""),
        "items": compact_items,
    }


def compact_memory_payload(memory: StructuredMemory) -> dict:
    return {
        "updated_at": memory.updated_at,
        "categories": [compact_category_memory_payload(category.model_dump()) for category in memory.categories],
    }

def normalize_category_memory_patch(
    category: MemoryCategorySchema,
    payload: dict | None,
) -> dict:
    payload = payload if isinstance(payload, dict) else {}
    raw_upserts = payload.get("upserts") if isinstance(payload.get("upserts"), list) else []
    upserts: list[dict] = []
    for item_index, raw_item in enumerate(raw_upserts):
        normalized_item = normalize_memory_item(category, raw_item if isinstance(raw_item, dict) else {}, item_index)
        if normalized_item:
            upserts.append(normalized_item)

    raw_deletes = payload.get("deletes") if isinstance(payload.get("deletes"), list) else []
    deletes: list[str] = []
    seen_delete_ids: set[str] = set()
    for raw_delete in raw_deletes:
        delete_id = str(raw_delete or "").strip()
        if delete_id and delete_id not in seen_delete_ids:
            seen_delete_ids.add(delete_id)
            deletes.append(delete_id)

    return {
        "category_id": category.id,
        "updated_at": str(payload.get("updated_at") or payload.get("updatedAt") or utc_now()),
        "upserts": upserts,
        "deletes": deletes,
    }


def normalize_memory_patch(schema: MemorySchema, payload: dict | None) -> dict:
    payload = payload if isinstance(payload, dict) else {}
    category_map = {
        str(item.get("category_id") or item.get("categoryId") or ""): item
        for item in (payload.get("categories") or [])
        if isinstance(item, dict)
    }
    return {
        "updated_at": str(payload.get("updated_at") or payload.get("updatedAt") or utc_now()),
        "categories": [
            normalize_category_memory_patch(category, category_map.get(category.id))
            for category in schema.categories
        ],
    }


def merge_category_memory_patch(category: MemoryCategorySchema, current_category_memory: dict, patch: dict) -> dict:
    current_items = current_category_memory.get("items") if isinstance(current_category_memory.get("items"), list) else []
    delete_ids = set(patch.get("deletes") or [])
    upserts = patch.get("upserts") if isinstance(patch.get("upserts"), list) else []
    upsert_map = {
        str(item.get("id") or ""): item
        for item in upserts
        if isinstance(item, dict) and str(item.get("id") or "").strip()
    }

    merged_items: list[dict] = []
    seen_ids: set[str] = set()

    for item_index, current_item in enumerate(current_items):
        item_id = str(current_item.get("id") or "").strip()
        if not item_id or item_id in delete_ids:
            continue
        if item_id in upsert_map:
            merged_items.append(upsert_map[item_id])
            seen_ids.add(item_id)
            continue
        normalized_item = normalize_memory_item(category, current_item if isinstance(current_item, dict) else {}, item_index)
        if normalized_item:
            merged_items.append(normalized_item)
            seen_ids.add(item_id)

    for upsert in upserts:
        upsert_id = str(upsert.get("id") or "").strip()
        if upsert_id and upsert_id not in seen_ids and upsert_id not in delete_ids:
            merged_items.append(upsert)
            seen_ids.add(upsert_id)

    return {
        "category_id": category.id,
        "label": category.label,
        "description": category.description,
        "updated_at": str(patch.get("updated_at") or patch.get("updatedAt") or current_category_memory.get("updated_at") or current_category_memory.get("updatedAt") or utc_now()) if merged_items else "",
        "items": merged_items,
    }


def merge_memory_patch(schema: MemorySchema, current_memory: StructuredMemory, patch: dict) -> dict:
    current_memory_map = {
        category.category_id: category.model_dump()
        for category in current_memory.categories
    }
    categories: list[dict] = []
    patch_categories = {
        str(item.get("category_id") or item.get("categoryId") or ""): item
        for item in (patch.get("categories") or [])
        if isinstance(item, dict)
    }

    for category in schema.categories:
        current_category_memory = current_memory_map.get(
            category.id,
            {
                "category_id": category.id,
                "label": category.label,
                "description": category.description,
                "updated_at": "",
                "items": [],
            },
        )
        categories.append(
            merge_category_memory_patch(category, current_category_memory, patch_categories.get(category.id) or {})
        )

    return normalize_structured_memory(schema, {
        "updated_at": str(patch.get("updated_at") or patch.get("updatedAt") or utc_now()),
        "categories": categories,
    }).model_dump()


async def update_memory_patch(
    model: ChatOpenAI,
    state: AgentState,
    schema: MemorySchema,
    current_memory: StructuredMemory,
) -> tuple[dict, dict]:
    response = await model.ainvoke(
        [
            {
                "role": "system",
                "content": compose_system_prompt(
                    resolve_common_prompt(state),
                    PROMPT_CONFIG.templates.memory_patch.system_instruction,
                ),
            },
            {
                "role": "user",
                "content": (
                    f"当前记忆 schema：\n{schema_text(schema)}\n\n"
                    f"当前已有记忆：\n{state['structured_memory_payload_json']}\n\n"
                    f"历史消息：\n{state['history_text']}\n\n"
                    f"用户最新输入：{state['prompt']}\n\n"
                    f"助手最终回复：{state.get('final_response', '')}"
                ),
            },
        ]
    )
    usage = extract_usage(response)
    raw = response.content if isinstance(response.content, str) else str(response.content)
    parsed = parse_json_object(raw, {
        "updated_at": utc_now(),
        "categories": [],
    })
    patch = normalize_memory_patch(schema, parsed)
    return patch, usage


async def answerer_node(state: AgentState) -> dict:
    model = build_model(state["model_config"])
    response = await model.ainvoke(build_answerer_messages(state))
    usage = extract_usage(response)
    content = response.content if isinstance(response.content, str) else str(response.content)
    return {"final_response": content.strip(), "usage": usage}


def build_answerer_messages(
    state: AgentState,
) -> list[dict]:
    numeric_items = state.get("numeric_computation_items") or []
    world_graph_decision = state.get("world_graph_decision") or {}
    return [
        {
            "role": "system",
            "content": compose_system_prompt(
                resolve_common_prompt(state),
                PROMPT_CONFIG.templates.answerer.base_instruction,
                resolve_system_prompt(state),
            ),
        },
        {
            "role": "user",
            "content": (
                f"结构化记忆：\n{state['structured_memory_text']}\n\n"
                f"世界图谱上下文：\n{state.get('world_graph_text_summary') or '暂无世界图谱上下文。'}\n\n"
                f"世界图谱决策：\n{json.dumps(world_graph_decision, ensure_ascii=False)}\n\n"
                f"{PROMPT_CONFIG.templates.answerer.numeric_guardrail}\n\n"
                f"数值信息：\n{json.dumps(numeric_payload_for_answerer(numeric_items, state.get('numeric_state')), ensure_ascii=False)}\n\n"
                f"历史消息：\n{state['history_text']}\n\n"
                f"用户最新输入：{state['prompt']}"
            ),
        },
    ]


async def numeric_agent_node(state: AgentState) -> dict:
    numeric_items = state.get("numeric_computation_items") or []
    numeric_schema = numeric_items_to_schema(numeric_items)
    current_numeric_state = normalize_numeric_state_value(numeric_schema, {}, state.get("numeric_state") or {})
    current_numeric_state = current_numeric_state if isinstance(current_numeric_state, dict) else {}

    if not state.get("numeric_computation_enabled") or not numeric_schema:
        return {
            "numeric_state": current_numeric_state,
            "usage": {"prompt_tokens": 0, "completion_tokens": 0},
        }

    model = build_model(resolve_node_model_config(state, "numeric_computation"))
    response = await model.ainvoke(
        [
            {
                "role": "system",
                "content": compose_system_prompt(
                    resolve_common_prompt(state),
                    PROMPT_CONFIG.templates.numeric_agent.system_instruction,
                    (
                        f"{PROMPT_CONFIG.templates.numeric_agent.user_prompt_label}\n"
                        f"{resolve_numeric_computation_prompt(state) or '未配置'}"
                    ),
                ),
            },
            {
                "role": "user",
                "content": (
                    f"主要故事设定：\n{resolve_system_prompt(state)}\n\n"
                    f"结构化记忆：\n{state['structured_memory_text']}\n\n"
                    f"数值字段定义：\n{numeric_items_description_text(numeric_items)}\n\n"
                    f"数值结构体：\n{json.dumps(numeric_schema, ensure_ascii=False)}\n\n"
                    f"当前数值状态：\n{numeric_state_text(current_numeric_state)}\n\n"
                    f"历史消息：\n{state['history_text']}\n\n"
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
    debug_log("[numeric-agent]", {
        "prompt": state.get("prompt") or "",
        "raw_output": raw_content,
        "parsed_output": parsed,
        "numeric_result": numeric_result,
    })
    return {
        "numeric_state": numeric_result,
        "usage": usage,
    }


async def world_graph_context_node(state: AgentState) -> dict:
    world_graph_payload = state.get("world_graph_payload") or {}
    if not str(world_graph_payload.get("meta", {}).get("robotId") or "").strip():
        return {
            "world_graph_text_summary": "",
            "world_graph_decision": normalize_world_graph_decision({}),
            "usage": {"prompt_tokens": 0, "completion_tokens": 0},
        }

    model = build_model(resolve_node_model_config(state, "world_graph"))
    response = await model.ainvoke(
        [
            {
                "role": "system",
                "content": compose_system_prompt(
                    resolve_common_prompt(state),
                    f"主要故事设定：\n{resolve_system_prompt(state)}",
                    PROMPT_CONFIG.templates.world_graph_context.system_instruction,
                ),
            },
            {
                "role": "user",
                "content": (
                    f"结构化记忆：\n{state['structured_memory_text']}\n\n"
                    f"数值信息：\n{json.dumps(numeric_payload_for_answerer(state.get('numeric_computation_items') or [], state.get('numeric_state')), ensure_ascii=False)}\n\n"
                    f"历史消息：\n{state['history_text']}\n\n"
                    f"用户最新输入：{state['prompt']}\n\n"
                    f"完整世界图谱 JSON：\n{world_graph_json_text(world_graph_payload)}"
                ),
            },
        ]
    )
    usage = extract_usage(response)
    raw = response.content if isinstance(response.content, str) else str(response.content)
    parsed = normalize_world_graph_context_output(parse_json_object(raw, {}))
    return {
        "world_graph_text_summary": parsed["context_summary"],
        "world_graph_decision": parsed["decision"],
        "usage": usage,
    }


async def world_graph_writeback_node(state: AgentState) -> dict:
    world_graph_payload = state.get("world_graph_payload") or {}
    if not str(world_graph_payload.get("meta", {}).get("robotId") or "").strip():
        return {
            "world_graph_writeback_ops": normalize_world_graph_writeback_ops({}),
            "usage": {"prompt_tokens": 0, "completion_tokens": 0},
        }

    model = build_model(resolve_node_model_config(state, "world_graph"))
    response = await model.ainvoke(
        [
            {
                "role": "system",
                "content": compose_system_prompt(
                    resolve_common_prompt(state),
                    f"主要故事设定：\n{resolve_system_prompt(state)}",
                    PROMPT_CONFIG.templates.world_graph_writeback.system_instruction,
                ),
            },
            {
                "role": "user",
                "content": (
                    f"结构化记忆：\n{state['structured_memory_text']}\n\n"
                    f"数值信息：\n{json.dumps(numeric_payload_for_answerer(state.get('numeric_computation_items') or [], state.get('numeric_state')), ensure_ascii=False)}\n\n"
                    f"历史消息：\n{state['history_text']}\n\n"
                    f"用户最新输入：{state['prompt']}\n\n"
                    f"前置世界图谱决策：\n{json.dumps(state.get('world_graph_decision') or {}, ensure_ascii=False)}\n\n"
                    f"最终正文：\n{state.get('final_response', '')}\n\n"
                    f"完整世界图谱 JSON：\n{world_graph_json_text(world_graph_payload)}"
                ),
            },
        ]
    )
    usage = extract_usage(response)
    raw = response.content if isinstance(response.content, str) else str(response.content)
    parsed = normalize_world_graph_writeback_ops(parse_json_object(raw, {}))
    return {
        "world_graph_writeback_ops": parsed,
        "usage": usage,
    }


async def ui_agent_node(state: AgentState) -> dict:
    model = build_model(resolve_node_model_config(state, "form_option"))
    response = await model.ainvoke(
        [
            {
                "role": "system",
                "content": compose_system_prompt(
                    resolve_common_prompt(state),
                    PROMPT_CONFIG.templates.ui_agent.system_instruction,
                ),
            },
            {
                "role": "user",
                "content": (
                    f"主要故事设定：\n{resolve_system_prompt(state)}\n\n"
                    f"结构化记忆：\n{state['structured_memory_text']}\n\n"
                    f"历史消息：\n{state['history_text']}\n\n"
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
    model = build_model(resolve_node_model_config(state, "memory"))
    schema = state["memory_schema"]
    current_memory = state["structured_memory"]
    patch, usage = await update_memory_patch(model, state, schema, current_memory)
    memory = merge_memory_patch(schema, current_memory, patch)
    return {"structured_memory": StructuredMemory.model_validate(memory), "usage": usage}


def add_usage(existing: dict | None, delta: dict | None) -> dict:
    left = existing or {"prompt_tokens": 0, "completion_tokens": 0}
    right = delta or {"prompt_tokens": 0, "completion_tokens": 0}
    return {
        "prompt_tokens": int(left.get("prompt_tokens", 0)) + int(right.get("prompt_tokens", 0)),
        "completion_tokens": int(left.get("completion_tokens", 0)) + int(right.get("completion_tokens", 0)),
    }

def build_initial_state(
    request: RunRequest,
    history: list[ChatMessage],
    memory_schema: MemorySchema,
    structured_memory: StructuredMemory,
) -> AgentState:
    normalized_numeric_items = normalize_numeric_items(request.robot.numeric_computation_items or [])
    normalized_history = history_payload(history)
    resolved_history_limit = normalize_positive_int(
        request.structured_memory_history_limit or request.robot.structured_memory_history_limit,
        DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT,
    )
    resolved_history_text = history_text(normalized_history, resolved_history_limit)
    structured_memory_text, structured_memory_payload_json = build_memory_context(structured_memory)
    return {
        "thread_id": request.thread_id,
        "prompt": request.prompt,
        "common_prompt": request.robot.common_prompt or PROMPT_CONFIG.defaults.common_prompt,
        "system_prompt": request.system_prompt or request.robot.system_prompt or PROMPT_CONFIG.defaults.system_prompt,
        "history": normalized_history,
        "history_text": resolved_history_text,
        "memory_schema": memory_schema,
        "structured_memory": structured_memory,
        "structured_memory_text": structured_memory_text,
        "structured_memory_payload_json": structured_memory_payload_json,
        "structured_memory_interval": normalize_positive_int(
            request.structured_memory_interval or request.robot.structured_memory_interval,
            DEFAULT_STRUCTURED_MEMORY_INTERVAL,
        ),
        "structured_memory_history_limit": resolved_history_limit,
        "numeric_computation_enabled": bool(request.robot.numeric_computation_enabled),
        "numeric_computation_prompt": request.robot.numeric_computation_prompt or PROMPT_CONFIG.defaults.numeric_computation_prompt,
        "numeric_computation_items": normalized_numeric_items,
        "numeric_state": request.numeric_state or {},
        "world_graph_payload": request.world_graph or {},
        "world_graph_text_summary": "",
        "world_graph_decision": normalize_world_graph_decision({}),
        "world_graph_writeback_ops": normalize_world_graph_writeback_ops({}),
        "model_config": request.model_settings.model_dump(),
        "auxiliary_model_configs": request.auxiliary_model_configs.model_dump(),
        "usage": {"prompt_tokens": 0, "completion_tokens": 0},
    }
