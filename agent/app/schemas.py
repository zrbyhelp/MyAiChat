from __future__ import annotations

from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field

from .prompt_config import get_prompt_config


PROMPT_DEFAULTS = get_prompt_config().defaults

class CompatibleModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class MemorySchemaOption(CompatibleModel):
    label: str
    value: str


class MemorySchemaField(CompatibleModel):
    id: str
    name: str
    label: str
    type: Literal["text", "number", "enum", "boolean"] = "text"
    required: bool = False
    options: list[MemorySchemaOption] = Field(default_factory=list)


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


class ChatMessage(CompatibleModel):
    role: Literal["user", "assistant", "system"]
    content: str


class ModelConfig(CompatibleModel):
    provider: str = "openai"
    base_url: str = Field(validation_alias=AliasChoices("base_url", "baseUrl"))
    api_key: str = Field(validation_alias=AliasChoices("api_key", "apiKey"))
    model: str
    temperature: float | None = 0.7


class RobotProfile(CompatibleModel):
    id: str = ""
    name: str = "当前智能体"
    avatar: str = ""
    common_prompt: str = Field(
        default=PROMPT_DEFAULTS.common_prompt,
        validation_alias=AliasChoices("common_prompt", "commonPrompt"),
    )
    system_prompt: str = Field(
        default=PROMPT_DEFAULTS.system_prompt,
        validation_alias=AliasChoices("system_prompt", "systemPrompt"),
    )
    memory_model_config_id: str = Field(
        default="",
        validation_alias=AliasChoices("memory_model_config_id", "memoryModelConfigId"),
    )
    outline_model_config_id: str = Field(
        default="",
        validation_alias=AliasChoices("outline_model_config_id", "outlineModelConfigId"),
    )
    numeric_computation_model_config_id: str = Field(
        default="",
        validation_alias=AliasChoices("numeric_computation_model_config_id", "numericComputationModelConfigId"),
    )
    world_graph_model_config_id: str = Field(
        default="",
        validation_alias=AliasChoices("world_graph_model_config_id", "worldGraphModelConfigId"),
    )
    numeric_computation_enabled: bool = Field(
        default=False,
        validation_alias=AliasChoices("numeric_computation_enabled", "numericComputationEnabled", "image_fetch_enabled", "imageFetchEnabled"),
    )
    numeric_computation_prompt: str = Field(
        default=PROMPT_DEFAULTS.numeric_computation_prompt,
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


class AuxiliaryModelConfigs(CompatibleModel):
    memory: ModelConfig | None = None
    outline: ModelConfig | None = None
    numeric_computation: ModelConfig | None = Field(
        default=None,
        validation_alias=AliasChoices("numeric_computation", "numericComputation"),
    )
    world_graph: ModelConfig | None = Field(
        default=None,
        validation_alias=AliasChoices("world_graph", "worldGraph"),
    )


class RunRequest(CompatibleModel):
    thread_id: str
    session_id: str
    prompt: str
    final_response: str = Field(
        default="",
        validation_alias=AliasChoices("final_response", "finalResponse"),
    )
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
    auxiliary_model_configs: AuxiliaryModelConfigs = Field(
        default_factory=AuxiliaryModelConfigs,
        validation_alias=AliasChoices("auxiliary_model_configs", "auxiliaryModelConfigs"),
    )
    numeric_state: dict[str, Any] = Field(
        default_factory=dict,
        validation_alias=AliasChoices("numeric_state", "numericState"),
    )
    story_outline: str = Field(
        default="",
        validation_alias=AliasChoices("story_outline", "storyOutline"),
    )
    world_graph: dict[str, Any] = Field(
        default_factory=dict,
        validation_alias=AliasChoices("world_graph", "worldGraph"),
    )


class DocumentSummaryRequest(CompatibleModel):
    model_settings: ModelConfig = Field(alias="model_config")
    mode: Literal["segment", "aggregate"] = "segment"
    source_name: str = Field(
        default="",
        validation_alias=AliasChoices("source_name", "sourceName"),
    )
    guidance: str = ""
    text: str = ""
    summaries: list[str] = Field(default_factory=list)
    index: int = 0
    total: int = 1
    round: int = 1


class SummaryResponse(CompatibleModel):
    summary: str = ""
    usage: dict[str, int] = Field(default_factory=dict)


class RobotGenerationRequest(CompatibleModel):
    model_settings: ModelConfig = Field(alias="model_config")
    source_name: str = Field(
        default="",
        validation_alias=AliasChoices("source_name", "sourceName"),
    )
    guidance: str = ""
    document_summary: str = Field(
        default="",
        validation_alias=AliasChoices("document_summary", "documentSummary"),
    )
    segment_summaries: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("segment_summaries", "segmentSummaries"),
    )


class RobotGenerationCoreContext(CompatibleModel):
    name: str = ""
    description: str = ""


class GeneratedNumericComputationItem(CompatibleModel):
    name: str = Field(description="数值字段名称，必须简洁稳定。")
    current_value: float = Field(
        default=0,
        validation_alias=AliasChoices("current_value", "currentValue"),
        description="该字段的初始数值。",
    )
    description: str = Field(default="", description="该数值字段的用途说明。")


class GeneratedMemorySchemaOption(CompatibleModel):
    label: str = Field(description="给用户看的选项名称。")
    value: str = Field(description="程序内部使用的稳定值。")


class GeneratedMemorySchemaField(CompatibleModel):
    id: str = Field(description="字段稳定 id，只能使用英文、数字、下划线或短横线。")
    name: str = Field(description="字段名，建议与 id 接近。")
    label: str = Field(description="给用户看的中文字段名称。")
    type: Literal["text", "number", "enum", "boolean"] = Field(
        default="text",
        description="字段类型，只允许 text、number、enum、boolean。",
    )
    required: bool = Field(default=False, description="该字段是否必填。")
    options: list[GeneratedMemorySchemaOption] = Field(
        default_factory=list,
        description="当 type=enum 时必须提供结构化选项对象数组，否则返回空数组。",
    )


class GeneratedMemoryCategorySchema(CompatibleModel):
    id: str = Field(description="分类稳定 id，只能使用英文、数字、下划线或短横线。")
    label: str = Field(description="分类中文名称。")
    description: str = Field(default="", description="分类用途说明。")
    extraction_instructions: str = Field(
        default="",
        validation_alias=AliasChoices("extraction_instructions", "extractionInstructions"),
        description="提取该分类信息时的简短指引。",
    )
    fields: list[GeneratedMemorySchemaField] = Field(
        default_factory=list,
        description="该分类下的字段定义，至少 1 个。",
    )


class GeneratedMemorySchemaPayload(CompatibleModel):
    categories: list[GeneratedMemoryCategorySchema] = Field(
        default_factory=list,
        description="结构化记忆分类数组，至少 2 个分类。",
    )


class GeneratedWorldGraphMeta(CompatibleModel):
    title: str = Field(default="", description="世界图谱标题。")
    description: str = Field(default="", description="世界图谱简介。")


class GeneratedWorldGraphRelationType(CompatibleModel):
    id: str = Field(description="关系类型稳定 id。")
    name: str = Field(description="关系类型中文名称。")
    description: str = Field(default="", description="关系类型说明。")
    directionality: Literal["directed", "undirected"] = Field(
        default="directed",
        description="关系方向性，只允许 directed 或 undirected。",
    )


class GeneratedWorldGraphNode(CompatibleModel):
    id: str = Field(description="节点稳定 id。")
    name: str = Field(description="节点名称。")
    type: Literal["character", "organization", "location", "event", "item"] = Field(
        default="character",
        description="节点类型。",
    )
    description: str = Field(default="", description="节点简介。")


class GeneratedWorldGraphEdge(CompatibleModel):
    id: str = Field(description="边稳定 id。")
    source: str = Field(description="源节点 id。")
    target: str = Field(description="目标节点 id。")
    relation_type: str = Field(
        default="",
        validation_alias=AliasChoices("relation_type", "relationType"),
        description="关系类型 id。",
    )
    description: str = Field(default="", description="关系说明。")


class GeneratedWorldGraphPatchPayload(CompatibleModel):
    meta: GeneratedWorldGraphMeta = Field(default_factory=GeneratedWorldGraphMeta)
    upsert_relation_types: list[GeneratedWorldGraphRelationType] = Field(
        default_factory=list,
        validation_alias=AliasChoices("upsert_relation_types", "upsertRelationTypes"),
    )
    delete_relation_type_codes: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("delete_relation_type_codes", "deleteRelationTypeCodes"),
    )
    upsert_nodes: list[GeneratedWorldGraphNode] = Field(
        default_factory=list,
        validation_alias=AliasChoices("upsert_nodes", "upsertNodes"),
    )
    delete_node_ids: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("delete_node_ids", "deleteNodeIds"),
    )
    upsert_edges: list[GeneratedWorldGraphEdge] = Field(
        default_factory=list,
        validation_alias=AliasChoices("upsert_edges", "upsertEdges"),
    )
    delete_edge_ids: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("delete_edge_ids", "deleteEdgeIds"),
    )


class RobotWorldGraphEvolutionRequest(CompatibleModel):
    model_settings: ModelConfig = Field(alias="model_config")
    source_name: str = Field(
        default="",
        validation_alias=AliasChoices("source_name", "sourceName"),
    )
    guidance: str = ""
    core: RobotGenerationCoreContext = Field(default_factory=RobotGenerationCoreContext)
    segment_summary: str = Field(
        default="",
        validation_alias=AliasChoices("segment_summary", "segmentSummary"),
    )
    segment_index: int = Field(
        default=0,
        validation_alias=AliasChoices("segment_index", "segmentIndex"),
    )
    segment_total: int = Field(
        default=1,
        validation_alias=AliasChoices("segment_total", "segmentTotal"),
    )
    current_world_graph: dict[str, Any] = Field(
        default_factory=dict,
        validation_alias=AliasChoices("current_world_graph", "currentWorldGraph"),
    )


class RobotGenerationCorePayload(CompatibleModel):
    name: str = Field(description="智能体名称。")
    description: str = Field(description="智能体简介。")
    system_prompt: str = Field(
        default="",
        validation_alias=AliasChoices("system_prompt", "systemPrompt"),
        description="主要系统提示词正文。",
    )
    common_prompt: str = Field(
        default="",
        validation_alias=AliasChoices("common_prompt", "commonPrompt"),
        description="公共提示词，可为空字符串。",
    )
    numeric_computation_enabled: bool = Field(
        default=False,
        validation_alias=AliasChoices("numeric_computation_enabled", "numericComputationEnabled"),
        description="只有文档天然需要数值追踪时才为 true。",
    )
    numeric_computation_prompt: str = Field(
        default="",
        validation_alias=AliasChoices("numeric_computation_prompt", "numericComputationPrompt"),
        description="数值计算规则说明，不需要时返回空字符串。",
    )
    numeric_computation_items: list[GeneratedNumericComputationItem] = Field(
        default_factory=list,
        validation_alias=AliasChoices("numeric_computation_items", "numericComputationItems"),
        description="数值字段定义数组，不需要时返回空数组。",
    )
    structured_memory_interval: int = Field(
        default=3,
        validation_alias=AliasChoices("structured_memory_interval", "structuredMemoryInterval"),
        description="结构化记忆触发间隔，正整数。",
    )
    structured_memory_history_limit: int = Field(
        default=12,
        validation_alias=AliasChoices("structured_memory_history_limit", "structuredMemoryHistoryLimit"),
        description="结构化记忆历史窗口上限，正整数。",
    )
    document_summary: str = Field(
        default="",
        validation_alias=AliasChoices("document_summary", "documentSummary"),
        description="面向产品展示的文档整体摘要。",
    )
    retrieval_summary: str = Field(
        default="",
        validation_alias=AliasChoices("retrieval_summary", "retrievalSummary"),
        description="面向知识检索的高密度摘要。",
    )


class GeneratedRobotPayload(CompatibleModel):
    name: str = ""
    description: str = ""
    system_prompt: str = Field(
        default="",
        validation_alias=AliasChoices("system_prompt", "systemPrompt"),
    )
    common_prompt: str = Field(
        default="",
        validation_alias=AliasChoices("common_prompt", "commonPrompt"),
    )
    memory_schema: GeneratedMemorySchemaPayload = Field(
        default_factory=GeneratedMemorySchemaPayload,
        validation_alias=AliasChoices("memory_schema", "memorySchema"),
    )
    world_graph: dict[str, Any] = Field(
        default_factory=dict,
        validation_alias=AliasChoices("world_graph", "worldGraph"),
    )
    numeric_computation_enabled: bool = Field(
        default=False,
        validation_alias=AliasChoices("numeric_computation_enabled", "numericComputationEnabled"),
    )
    numeric_computation_prompt: str = Field(
        default="",
        validation_alias=AliasChoices("numeric_computation_prompt", "numericComputationPrompt"),
    )
    numeric_computation_items: list[GeneratedNumericComputationItem] = Field(
        default_factory=list,
        validation_alias=AliasChoices("numeric_computation_items", "numericComputationItems"),
    )
    structured_memory_interval: int = Field(
        default=3,
        validation_alias=AliasChoices("structured_memory_interval", "structuredMemoryInterval"),
    )
    structured_memory_history_limit: int = Field(
        default=12,
        validation_alias=AliasChoices("structured_memory_history_limit", "structuredMemoryHistoryLimit"),
    )
    document_summary: str = Field(
        default="",
        validation_alias=AliasChoices("document_summary", "documentSummary"),
    )
    retrieval_summary: str = Field(
        default="",
        validation_alias=AliasChoices("retrieval_summary", "retrievalSummary"),
    )


class RetrievalSummaryRequest(CompatibleModel):
    model_settings: ModelConfig = Field(alias="model_config")
    robot_name: str = Field(
        default="",
        validation_alias=AliasChoices("robot_name", "robotName"),
    )
    robot_description: str = Field(
        default="",
        validation_alias=AliasChoices("robot_description", "robotDescription"),
    )
    story_outline: str = Field(
        default="",
        validation_alias=AliasChoices("story_outline", "storyOutline"),
    )
    prompt: str = ""
    history: list[ChatMessage] = Field(default_factory=list)


class ThreadState(CompatibleModel):
    thread_id: str
    messages: list[ChatMessage] = Field(default_factory=list)
    memory_schema: MemorySchema = Field(default_factory=MemorySchema)
    structured_memory: StructuredMemory = Field(default_factory=StructuredMemory)
    numeric_state: dict[str, Any] = Field(
        default_factory=dict,
        validation_alias=AliasChoices("numeric_state", "numericState"),
    )
    story_outline: str = Field(
        default="",
        validation_alias=AliasChoices("story_outline", "storyOutline"),
    )


MemorySchemaField.model_rebuild()
