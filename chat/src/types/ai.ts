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

export interface NumericComputationItem {
  name: string
  currentValue: number
  description: string
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
  numericComputationModelConfigId: string
  formOptionModelConfigId: string
  numericComputationEnabled: boolean
  numericComputationPrompt: string
  numericComputationItems: NumericComputationItem[]
  structuredMemoryInterval: number
  structuredMemoryHistoryLimit: number
  memorySchema: MemorySchemaState
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
  name: string
  avatar: string
  commonPrompt: string
  systemPrompt: string
  memoryModelConfigId: string
  numericComputationModelConfigId: string
  formOptionModelConfigId: string
  numericComputationEnabled: boolean
  numericComputationPrompt: string
  numericComputationItems: NumericComputationItem[]
  structuredMemoryInterval: number
  structuredMemoryHistoryLimit: number
}

export interface SessionMemoryState {
  summary: string
  updatedAt: string
  sourceMessageCount: number
  persistToServer: boolean
  threshold: number
  recentMessageLimit: number
  prompt: string
  structuredMemoryInterval: number
  structuredMemoryHistoryLimit: number
}

export interface StructuredMemoryItem {
  id: string
  summary: string
  sourceTurnId?: string
  updatedAt?: string
  values: Record<string, StructuredMemoryValue>
}

export interface StructuredMemoryCategory {
  categoryId: string
  label: string
  description?: string
  updatedAt?: string
  items: StructuredMemoryItem[]
}

export interface StructuredMemoryState {
  updatedAt: string
  categories: StructuredMemoryCategory[]
}

export interface SessionUsageState {
  promptTokens: number
  completionTokens: number
}

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
  usage: SessionUsageState
}

export interface ChatSessionDetail extends ChatSessionSummary {
  threadId: string
  robot: SessionRobotState
  messages: ChatSessionMessage[]
  memory: SessionMemoryState
  memorySchema: MemorySchemaState
  structuredMemory: StructuredMemoryState
  numericState?: Record<string, unknown>
}

export interface ModelConfigsResponse {
  configs: AIModelConfigItem[]
  activeModelConfigId: string
}

export interface RobotsResponse {
  robots: AIRobotCard[]
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
