from __future__ import annotations

from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class CompatibleModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class MemorySchemaOption(CompatibleModel):
    label: str
    value: str


class MemorySchemaField(CompatibleModel):
    id: str
    name: str
    label: str
    type: Literal["text", "number", "enum", "boolean", "object", "array"] = "text"
    required: bool = False
    options: list[MemorySchemaOption] = Field(default_factory=list)
    fields: list["MemorySchemaField"] = Field(default_factory=list)
    item_type: Literal["text", "number", "enum", "boolean", "object"] | None = Field(
        default=None,
        validation_alias=AliasChoices("item_type", "itemType"),
    )
    item_options: list[MemorySchemaOption] = Field(
        default_factory=list,
        validation_alias=AliasChoices("item_options", "itemOptions"),
    )
    item_fields: list["MemorySchemaField"] = Field(
        default_factory=list,
        validation_alias=AliasChoices("item_fields", "itemFields"),
    )


class MemoryCategorySchema(CompatibleModel):
    id: str
    label: str
    description: str = ""
    extraction_instructions: str = Field(
        default="",
        validation_alias=AliasChoices("extraction_instructions", "extractionInstructions"),
    )
    fields: list[MemorySchemaField] = Field(default_factory=list)


class MemorySchema(CompatibleModel):
    categories: list[MemoryCategorySchema] = Field(default_factory=list)


class StructuredMemoryItem(CompatibleModel):
    id: str = ""
    summary: str = ""
    source_turn_id: str = Field(
        default="",
        validation_alias=AliasChoices("source_turn_id", "sourceTurnId"),
    )
    updated_at: str = Field(
        default="",
        validation_alias=AliasChoices("updated_at", "updatedAt"),
    )
    values: dict[str, Any] = Field(default_factory=dict)


class StructuredMemoryCategory(CompatibleModel):
    category_id: str = Field(validation_alias=AliasChoices("category_id", "categoryId"))
    label: str = ""
    description: str = ""
    updated_at: str = Field(
        default="",
        validation_alias=AliasChoices("updated_at", "updatedAt"),
    )
    items: list[StructuredMemoryItem] = Field(default_factory=list)


class StructuredMemory(CompatibleModel):
    updated_at: str = Field(
        default="",
        validation_alias=AliasChoices("updated_at", "updatedAt"),
    )
    categories: list[StructuredMemoryCategory] = Field(default_factory=list)


class StructuredMemoryPatchItem(CompatibleModel):
    op: Literal["add", "update", "delete"] = "add"
    id: str = ""
    summary: str = ""
    source_turn_id: str = Field(
        default="",
        validation_alias=AliasChoices("source_turn_id", "sourceTurnId"),
    )
    updated_at: str = Field(
        default="",
        validation_alias=AliasChoices("updated_at", "updatedAt"),
    )
    values: dict[str, Any] = Field(default_factory=dict)


class StructuredMemoryPatchCategory(CompatibleModel):
    category_id: str = Field(validation_alias=AliasChoices("category_id", "categoryId"))
    updated_at: str = Field(
        default="",
        validation_alias=AliasChoices("updated_at", "updatedAt"),
    )
    items: list[StructuredMemoryPatchItem] = Field(default_factory=list)


class StructuredMemoryPatch(CompatibleModel):
    updated_at: str = Field(
        default="",
        validation_alias=AliasChoices("updated_at", "updatedAt"),
    )
    categories: list[StructuredMemoryPatchCategory] = Field(default_factory=list)


class ChatMessage(CompatibleModel):
    role: Literal["user", "assistant", "system"]
    content: str


class ModelConfig(CompatibleModel):
    base_url: str = Field(validation_alias=AliasChoices("base_url", "baseUrl"))
    api_key: str = Field(validation_alias=AliasChoices("api_key", "apiKey"))
    model: str
    temperature: float | None = 0.7


class RobotProfile(CompatibleModel):
    name: str = "当前智能体"
    avatar: str = ""
    common_prompt: str = Field(
        default="",
        validation_alias=AliasChoices("common_prompt", "commonPrompt"),
    )
    system_prompt: str = Field(
        default="",
        validation_alias=AliasChoices("system_prompt", "systemPrompt"),
    )
    numeric_computation_enabled: bool = Field(
        default=False,
        validation_alias=AliasChoices("numeric_computation_enabled", "numericComputationEnabled", "image_fetch_enabled", "imageFetchEnabled"),
    )
    numeric_computation_prompt: str = Field(
        default="",
        validation_alias=AliasChoices("numeric_computation_prompt", "numericComputationPrompt", "image_fetch_prompt", "imageFetchPrompt"),
    )
    numeric_computation_items: list[dict[str, Any]] = Field(
        default_factory=list,
        validation_alias=AliasChoices("numeric_computation_items", "numericComputationItems", "numeric_computation_schema", "numericComputationSchema"),
    )
    structured_memory_interval: int | None = Field(
        default=None,
        validation_alias=AliasChoices("structured_memory_interval", "structuredMemoryInterval"),
    )
    structured_memory_history_limit: int | None = Field(
        default=None,
        validation_alias=AliasChoices("structured_memory_history_limit", "structuredMemoryHistoryLimit"),
    )


class RunUser(CompatibleModel):
    id: str
    email: str | None = None
    display_name: str | None = Field(
        default=None,
        validation_alias=AliasChoices("display_name", "displayName"),
    )


class RunRequest(CompatibleModel):
    thread_id: str
    session_id: str
    prompt: str
    user: RunUser
    model_settings: ModelConfig = Field(alias="model_config")
    robot: RobotProfile = Field(default_factory=RobotProfile)
    system_prompt: str = ""
    history: list[ChatMessage] = Field(default_factory=list)
    memory_schema: MemorySchema = Field(default_factory=MemorySchema)
    structured_memory: StructuredMemory = Field(default_factory=StructuredMemory)
    structured_memory_interval: int | None = Field(
        default=None,
        validation_alias=AliasChoices("structured_memory_interval", "structuredMemoryInterval"),
    )
    structured_memory_history_limit: int | None = Field(
        default=None,
        validation_alias=AliasChoices("structured_memory_history_limit", "structuredMemoryHistoryLimit"),
    )
    numeric_state: dict[str, Any] = Field(
        default_factory=dict,
        validation_alias=AliasChoices("numeric_state", "numericState"),
    )


class ThreadState(CompatibleModel):
    thread_id: str
    messages: list[ChatMessage] = Field(default_factory=list)
    memory_schema: MemorySchema = Field(default_factory=MemorySchema)
    structured_memory: StructuredMemory = Field(default_factory=StructuredMemory)
    numeric_state: dict[str, Any] = Field(
        default_factory=dict,
        validation_alias=AliasChoices("numeric_state", "numericState"),
    )


MemorySchemaField.model_rebuild()
