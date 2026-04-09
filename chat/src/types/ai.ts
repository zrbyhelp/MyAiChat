export type ProviderType = 'openai' | 'ollama'

export interface AIModelConfigItem {
  id: string
  name: string
  provider: ProviderType
  baseUrl: string
  apiKey: string
  model: string
  description: string
  tags: string[]
  temperature: number | null
  persistToServer: boolean
}

export type MemoryFieldType = 'text' | 'number' | 'enum' | 'boolean'
export type StructuredMemoryValue = string | number | boolean | null

export interface MemorySchemaOption {
  label: string
  value: string
}

export interface MemorySchemaField {
  id: string
  name: string
  label: string
  type: MemoryFieldType
  required: boolean
  options?: MemorySchemaOption[]
}

export interface MemorySchemaCategory {
  id: string
  label: string
  description: string
  extractionInstructions: string
  fields: MemorySchemaField[]
}

export interface MemorySchemaState {
  categories: MemorySchemaCategory[]
}

export interface AIRobotCard {
  id: string
  name: string
  description: string
  avatar: string
  persistToServer: boolean
  commonPrompt: string
  systemPrompt: string
  memoryModelConfigId: string
  outlineModelConfigId: string
  knowledgeRetrievalModelConfigId: string
  worldGraphModelConfigId: string
  memorySchema: MemorySchemaState
  worldGraph?: RobotWorldGraph | null
}

export interface AgentTemplateFileV1 {
  kind: 'myaichat-agent-template'
  version: 1
  exportedAt: string
  algorithm: 'AES-GCM'
  iv: string
  payload: string
}

export interface ModelOption {
  id: string
  label: string
}

export interface ModelCapabilities {
  supportsStreaming: boolean
  supportsReasoning: boolean
}

export interface SessionRobotState {
  id: string
  name: string
  avatar: string
  commonPrompt: string
  systemPrompt: string
  memoryModelConfigId: string
  outlineModelConfigId: string
  knowledgeRetrievalModelConfigId: string
  worldGraphModelConfigId: string
}

export interface SessionMemoryState {
  summary: string
  updatedAt: string
  sourceMessageCount: number
  persistToServer: boolean
  threshold: number
  recentMessageLimit: number
  prompt: string
}

export interface StructuredMemoryState {
  updatedAt: string
  longTermMemory: string
  shortTermMemory: string
}

export interface SessionUsageState {
  promptTokens: number
  completionTokens: number
}

export type ReplyMode = 'default' | 'story_guidance' | 'protagonist_speech'

export interface ChatSessionMessage {
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  suggestions?: SuggestionOption[]
  form?: AIFormSchema | null
  createdAt: string
}

export interface SuggestionOption {
  title: string
  prompt: string
}

export interface AIFormOption {
  label: string
  value: string
}

export interface AIFormField {
  name: string
  label: string
  type: 'input' | 'radio' | 'checkbox' | 'select'
  placeholder?: string
  required?: boolean
  inputType?: 'text' | 'number'
  multiple?: boolean
  options?: AIFormOption[]
  defaultValue?: string | string[]
}

export interface AIFormSchema {
  title: string
  description?: string
  submitText?: string
  fields: AIFormField[]
}

export interface ChatSessionSummary {
  id: string
  title: string
  preview: string
  createdAt: string
  updatedAt: string
  persistToServer: boolean
  robotName: string
  modelConfigId: string
  modelLabel: string
  replyMode: ReplyMode
  usage: SessionUsageState
}

export interface StoryDraftState {
  characters: string[]
  items: string[]
  organizations: string[]
  locations: string[]
  events: string[]
}

export interface StoryOutlineState {
  storyDraft: StoryDraftState
  retrievalQuery: string
}

export interface ChatSessionDetail extends ChatSessionSummary {
  threadId: string
  storyOutline?: StoryOutlineState
  robot: SessionRobotState
  messages: ChatSessionMessage[]
  memory: SessionMemoryState
  memorySchema: MemorySchemaState
  structuredMemory: StructuredMemoryState
  worldGraph?: RobotWorldGraph | null
}

export interface ModelConfigsResponse {
  configs: AIModelConfigItem[]
  activeModelConfigId: string
}

export interface RobotsResponse {
  robots: AIRobotCard[]
}

export interface RobotGenerationExtractionDetail {
  targetSegmentChars: number
  maxEntitiesPerSegment: number
  maxRelationsPerSegment: number
  maxEventsPerSegment: number
  entityImportanceThreshold: number
  relationImportanceThreshold: number
  eventImportanceThreshold: number
}

export interface RobotGenerationTask {
  id: string
  status: 'pending' | 'processing' | 'canceling' | 'completed' | 'failed' | 'canceled'
  stage: string
  progress: number
  message: string
  sourceName: string
  sourceType: string
  sourceSize: number
  guidance: string
  modelConfigId: string
  embeddingModelConfigId: string
  robotId: string
  documentId: string
  stats: Record<string, unknown>
  result: Record<string, unknown>
  error: string
  createdAt: string
  updatedAt: string
  startedAt: string
  completedAt: string
}

export interface RobotGenerationTaskResponse {
  task: RobotGenerationTask
}

export interface RobotKnowledgeDocument {
  id: string
  robotId: string
  status: 'processing' | 'ready' | 'failed'
  sourceName: string
  sourceType: string
  sourceSize: number
  guidance: string
  summary: string
  retrievalSummary: string
  chunkCount: number
  characterCount: number
  qdrantCollection: string
  embeddingModelConfigId: string
  embeddingModel: string
  meta: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface RobotKnowledgeDocumentsResponse {
  documents: RobotKnowledgeDocument[]
}

export interface RobotKnowledgeDocumentResponse {
  document: RobotKnowledgeDocument
}

export interface ModelsResponse {
  models: ModelOption[]
}

export interface CapabilitiesResponse {
  capabilities: ModelCapabilities
}

export interface TestConnectionResponse {
  success: boolean
  models: ModelOption[]
  message: string
}

export interface SessionsResponse {
  sessions: ChatSessionSummary[]
}

export interface SessionResponse {
  session: ChatSessionDetail
}

export interface DeleteSessionResponse {
  deletedSessionId: string
}

export type SessionBackgroundTaskKind = 'memory' | 'graph_writeback' | ''
export type SessionBackgroundStatusValue =
  | 'idle'
  | 'queued'
  | 'memory_processing'
  | 'graph_writeback_processing'
  | 'completed'
  | 'failed'

export interface SessionBackgroundStatus {
  sessionId: string
  status: SessionBackgroundStatusValue
  pendingTaskCount: number
  currentTask: SessionBackgroundTaskKind
  lastError: string
  updatedAt: string
}

export interface SessionBackgroundStatusResponse {
  status: SessionBackgroundStatus
}

export type WorldObjectType = 'character' | 'organization' | 'location' | 'event' | 'item'
export type WorldRelationDirectionality = 'directed' | 'undirected'
export type WorldTimelineEffectTargetKind = 'node' | 'relation'
export type WorldTimelineEffectChangeTargetType = 'node-content' | 'relation'
export type WorldTimelineEffectRelationMode = 'existing' | 'create'

export interface WorldCalendarConfig {
  calendarId: string
  calendarName: string
  eras: string[]
  monthNames: string[]
  dayNames: string[]
  timeOfDayLabels: string[]
  formatTemplate: string
}

export interface WorldGraphLayout {
  viewportX: number
  viewportY: number
  zoom: number
}

export interface WorldTimeline {
  sequenceIndex: number
  calendarId: string
  yearLabel: string
  monthLabel: string
  dayLabel: string
  timeOfDayLabel: string
  phase: string
  impactLevel: number
  eventType: string
}

export interface WorldTimelineEffectNodeAttributeChange {
  fieldKey: string
  beforeValue: string
  afterValue: string
}

export interface WorldTimelineEffectRelationChange {
  fieldKey: string
  beforeValue: string
  afterValue: string
}

export interface WorldTimelineEffectRelationDraft {
  targetNodeId: string
  relationTypeCode: string
  relationLabel: string
  summary: string
  status: string
  intensity: number | null
}

export interface WorldTimelineEffect {
  id: string
  summary: string
  targetNodeId: string
  changeTargetType: WorldTimelineEffectChangeTargetType
  nodeAttributeChanges: WorldTimelineEffectNodeAttributeChange[]
  relationMode: WorldTimelineEffectRelationMode
  relationId: string
  relationChanges: WorldTimelineEffectRelationChange[]
  relationDraft: WorldTimelineEffectRelationDraft
  targetKind?: WorldTimelineEffectTargetKind
  targetId?: string
  changeKind?: string
  beforeValue?: string
  afterValue?: string
}

export interface WorldNodeSnapshot {
  sequenceIndex: number
  name?: string
  summary?: string
  knownFacts?: string
  preferencesAndConstraints?: string
  taskProgress?: string
  longTermMemory?: string
  status?: string
  tags?: string[]
  attributes?: Record<string, string | number | boolean | null>
}

export interface WorldEdgeSnapshot {
  sequenceIndex: number
  relationTypeCode?: string
  relationLabel?: string
  summary?: string
  status?: string
  intensity?: number | null
}

export interface WorldNode {
  id: string
  objectType: WorldObjectType
  name: string
  summary: string
  knownFacts: string
  preferencesAndConstraints: string
  taskProgress: string
  longTermMemory: string
  status: string
  tags: string[]
  attributes: Record<string, string | number | boolean | null>
  position: {
    x: number
    y: number
  }
  startSequenceIndex: number
  timelineSnapshots: WorldNodeSnapshot[]
  timeline: WorldTimeline | null
  effects: WorldTimelineEffect[]
  createdAt: string
  updatedAt: string
}

export interface WorldEdge {
  id: string
  sourceNodeId: string
  targetNodeId: string
  relationTypeCode: string
  relationLabel: string
  summary: string
  directionality: WorldRelationDirectionality
  intensity: number | null
  status: string
  startSequenceIndex: number
  endSequenceIndex: number | null
  timelineSnapshots: WorldEdgeSnapshot[]
  createdAt: string
  updatedAt: string
}

export interface RobotWorldRelationType {
  id: string
  code: string
  label: string
  description: string
  directionality: WorldRelationDirectionality
  sourceObjectTypes: WorldObjectType[]
  targetObjectTypes: WorldObjectType[]
  isBuiltin: boolean
  createdAt?: string
  updatedAt?: string
}

export interface RobotWorldGraphMeta {
  robotId: string
  title: string
  summary: string
  graphVersion: number
  calendar: WorldCalendarConfig
  layout: WorldGraphLayout
}

export interface RobotWorldGraph {
  meta: RobotWorldGraphMeta
  relationTypes: RobotWorldRelationType[]
  nodes: WorldNode[]
  edges: WorldEdge[]
}
