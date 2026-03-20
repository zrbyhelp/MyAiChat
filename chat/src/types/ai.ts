export type ProviderType = 'ollama' | 'openai'

export interface AIModelConfigItem {
  id: string
  name: string
  provider: ProviderType
  baseUrl: string
  apiKey: string
  model: string
  temperature: number | null
}

export interface AIRobotCard {
  id: string
  name: string
  description: string
  avatar: string
  systemPrompt: string
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
  systemPrompt: string
}

export interface SessionMemoryState {
  summary: string
  updatedAt: string
  sourceMessageCount: number
  threshold: number
  recentMessageLimit: number
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
  robotName: string
  modelConfigId: string
  modelLabel: string
  usage: SessionUsageState
}

export interface ChatSessionDetail extends ChatSessionSummary {
  robot: SessionRobotState
  messages: ChatSessionMessage[]
  memory: SessionMemoryState
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
