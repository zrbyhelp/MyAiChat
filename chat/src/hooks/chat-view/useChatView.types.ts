import type { AIFormSchema, SuggestionOption } from '@/types/ai'

export type ChatbotInstance = {
  registerMergeStrategy?: (
    type: string,
    handler: (chunk: unknown, existing?: unknown) => unknown,
  ) => void
  setMessages?: (messages: ChatRenderMessage[], mode?: 'replace' | 'prepend' | 'append') => void
  clearMessages?: () => void
  sendUserMessage?: (params: { prompt?: string }) => Promise<void>
  chatStatus?: 'idle' | 'pending' | 'streaming' | 'complete' | 'stop' | 'error'
  chatEngine?: {
    eventBus?: {
      on?: (event: string, callback: (payload?: unknown) => void) => (() => void) | void
      emit?: (event: string, payload?: unknown) => void
    }
    sendRequest?: (params: { prompt?: string; messageID?: string }) => Promise<void>
    processMessageResult?: (messageId: string, result: unknown) => void
    setMessageStatus?: (messageId: string, status: string) => void
  }
}

export type ChatRenderContent = {
  type?: string
  slotName?: string
  data?: unknown
  [key: string]: unknown
}

export type ChatRenderMessage = {
  id?: string
  role?: string
  datetime?: string
  content?: ChatRenderContent[]
  [key: string]: unknown
}

export type ChatMessageChangeEvent =
  | CustomEvent<ChatRenderMessage[]>
  | ChatRenderMessage[]
  | null
  | undefined

export type FormDraftValue = string | number | boolean | (string | number | boolean)[]

export type NormalizedStreamPayload = {
  type?:
    | 'text'
    | 'reasoning'
    | 'reasoning_done'
    | 'suggestion'
    | 'form'
    | 'memory_status'
    | 'usage'
    | 'structured_memory'
    | 'numeric_state_updated'
    | 'ui_loading'
    | 'done'
    | 'error'
  text?: string
  message?: string
  items?: SuggestionOption[]
  form?: AIFormSchema | null
  status?: 'running' | 'success' | 'error'
  promptTokens?: number
  completionTokens?: number
  memory?: import('@/types/ai').StructuredMemoryState
  state?: Record<string, unknown>
}

export type ChatFormSlot = {
  slotName: string
  formId: string
  schema: AIFormSchema
}

export type ChatLoadingSlot = {
  slotName: string
  text: string
}

export type FormActivityContent = {
  type: 'activity-form'
  slotName: string
  data: {
    activityType: 'form'
    content: AIFormSchema
  }
}

export type ModelDropdownItem = {
  content: string
  value: string
  divider?: boolean
}

export type MemoryStatusState = {
  status: 'running' | 'success' | 'error'
  text: string
}
