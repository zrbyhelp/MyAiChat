import { MessagePlugin } from 'tdesign-vue-next'
import { computed, nextTick, reactive, ref, type Ref } from 'vue'

import {
  asRecord,
  buildFormPrompt,
  createFormActivityContent,
  createInitialFormValues,
  createSuggestionContent,
  extractActivityFormSchema,
  withMessageDatetimes,
  withSystemStatusMessages,
  withTimeSeparators,
} from '@/hooks/chat-view/useChatView.message-utils'
import type {
  ChatbotInstance,
  ChatFormSlot,
  ChatLoadingSlot,
  ChatMessageChangeEvent,
  ChatRenderContent,
  ChatRenderMessage,
  FormDraftValue,
  MemoryStatusState,
} from '@/hooks/chat-view/useChatView.types'
import type { AIFormSchema, SuggestionOption } from '@/types/ai'

interface UseChatMessagePipelineOptions {
  chatbotRef: Ref<ChatbotInstance | null>
  isChatResponding: Ref<boolean>
}

export function useChatMessagePipeline(options: UseChatMessagePipelineOptions) {
  const pendingChatMessages = ref<ChatRenderMessage[] | null>(null)
  const pendingAssistantSuggestions = ref<SuggestionOption[] | null>(null)
  const pendingAssistantForm = ref<AIFormSchema | null>(null)
  const pendingAssistantMemoryStatus = ref<MemoryStatusState | null>(null)
  const currentAssistantLoadingText = ref('')
  const currentMemoryStatusText = ref('')
  const chatMessages = ref<ChatRenderMessage[]>([])
  const rawChatMessages = ref<ChatRenderMessage[]>([])
  const formDrafts = reactive<Record<string, Record<string, FormDraftValue>>>({})
  const submittedForms = reactive<Record<string, boolean>>({})

  const formActivitySlots = computed<ChatFormSlot[]>(() => {
    const slots: ChatFormSlot[] = []
    chatMessages.value.forEach((message) => {
      if (!Array.isArray(message?.content)) {
        return
      }
      message.content.forEach((content: ChatRenderContent, index: number) => {
        const schema = extractActivityFormSchema(content)
        if (!schema) {
          return
        }
        const activitySlotName = content.slotName || `activity-form-${index}`
        slots.push({
          slotName: `${message.id}-${activitySlotName}`,
          formId: `${message.id}-${activitySlotName}`,
          schema,
        })
      })
    })
    return slots
  })

  const loadingActivitySlots = computed<ChatLoadingSlot[]>(() => {
    const slots: ChatLoadingSlot[] = []
    chatMessages.value.forEach((message) => {
      if (!Array.isArray(message?.content)) {
        return
      }
      message.content.forEach((content: ChatRenderContent, index: number) => {
        if (content?.type !== 'activity-loading') {
          return
        }
        const activitySlotName = content.slotName || `activity-loading-${index}`
        slots.push({
          slotName: `${message.id}-${activitySlotName}`,
          text:
            typeof asRecord(content.data).text === 'string' && String(asRecord(content.data).text).trim()
              ? String(asRecord(content.data).text).trim()
              : '正在生成交互 UI',
        })
      })
    })
    return slots
  })

  const memoryStatusActivitySlots = computed(() => [])

  function initializeFormDrafts(messages: ChatRenderMessage[]) {
    messages.forEach((message) => {
      if (!Array.isArray(message?.content)) {
        return
      }
      message.content.forEach((content: ChatRenderContent, index: number) => {
        const schema = extractActivityFormSchema(content)
        if (!schema) {
          return
        }
        const activitySlotName = content.slotName || `activity-form-${index}`
        const formId = `${message.id}-${activitySlotName}`
        if (!formDrafts[formId]) {
          formDrafts[formId] = createInitialFormValues(schema)
        }
        if (submittedForms[formId] === undefined) {
          submittedForms[formId] = false
        }
      })
    })
  }

  function applyChatMessages(messages: ChatRenderMessage[]) {
    const sourceMessages = messages.filter((message) => message?.role !== 'system')
    rawChatMessages.value = withMessageDatetimes(sourceMessages, rawChatMessages.value)
    const renderedMessages = withSystemStatusMessages(withTimeSeparators(rawChatMessages.value), [
      { key: 'ui-loading', text: currentAssistantLoadingText.value },
      { key: 'memory-status', text: currentMemoryStatusText.value },
    ])
    pendingChatMessages.value = renderedMessages
    chatMessages.value = renderedMessages
    initializeFormDrafts(renderedMessages)
    const instance = options.chatbotRef.value
    if (!instance) {
      return
    }
    if (!renderedMessages.length) {
      instance.clearMessages?.()
    } else {
      instance.setMessages?.(renderedMessages, 'replace')
    }
    pendingChatMessages.value = null
  }

  function flushPendingAssistantMemoryStatus() {
    pendingAssistantMemoryStatus.value = null
  }

  function flushPendingAssistantStructuredContent() {
    if (
      !pendingAssistantSuggestions.value?.length &&
      !pendingAssistantForm.value?.fields?.length
    ) {
      return
    }

    const nextMessages = chatMessages.value.map((message) => ({
      ...message,
      content: Array.isArray(message?.content) ? [...message.content] : [],
    }))
    const targetMessage = [...nextMessages]
      .reverse()
      .find((message) => message?.role === 'assistant' && Array.isArray(message?.content))
    if (!targetMessage) {
      return
    }

    targetMessage.content = targetMessage.content.filter(
      (content: ChatRenderContent) =>
        content?.type !== 'suggestion' && content?.type !== 'activity-form',
    )

    const memoryStatusIndex = targetMessage.content.findIndex((content: ChatRenderContent) => {
      return (
        content?.type === 'markdown' &&
        typeof content?.data === 'string' &&
        content.data.includes('<!--memory-status:')
      )
    })
    const insertionIndex = memoryStatusIndex === -1 ? targetMessage.content.length : memoryStatusIndex
    const structuredContent = [
      ...(pendingAssistantSuggestions.value?.length ? [createSuggestionContent(pendingAssistantSuggestions.value)] : []),
      ...(pendingAssistantForm.value?.fields?.length ? [createFormActivityContent(pendingAssistantForm.value)] : []),
    ]

    if (structuredContent.length) {
      targetMessage.content.splice(insertionIndex, 0, ...structuredContent)
    }

    pendingAssistantSuggestions.value = null
    pendingAssistantForm.value = null
    applyChatMessages(nextMessages)
  }

  function handleChatMessageChange(event: ChatMessageChangeEvent) {
    const messages = Array.isArray(event)
      ? event
      : event && 'detail' in event && Array.isArray(event.detail)
        ? event.detail
        : []
    rawChatMessages.value = withMessageDatetimes(
      messages.filter((message) => message?.role !== 'system'),
      rawChatMessages.value,
    )
    const renderedMessages = withSystemStatusMessages(withTimeSeparators(rawChatMessages.value), [
      { key: 'ui-loading', text: currentAssistantLoadingText.value },
      { key: 'memory-status', text: currentMemoryStatusText.value },
    ])
    chatMessages.value = renderedMessages
    initializeFormDrafts(renderedMessages)
    if (pendingAssistantSuggestions.value?.length || pendingAssistantForm.value?.fields?.length) {
      nextTick(() => {
        flushPendingAssistantStructuredContent()
      })
    }
    if (pendingAssistantMemoryStatus.value) {
      nextTick(() => {
        flushPendingAssistantMemoryStatus()
      })
    }
  }

  function getFormDraft(formId: string, schema: AIFormSchema) {
    if (!formDrafts[formId]) {
      formDrafts[formId] = createInitialFormValues(schema)
    } else {
      const draft = formDrafts[formId]
      schema.fields.forEach((field) => {
        const expectsArray = field.type === 'checkbox' || (field.type === 'select' && field.multiple)
        const currentValue = draft?.[field.name]
        if (expectsArray) {
          if (Array.isArray(currentValue)) {
            return
          }
          draft[field.name] =
            typeof currentValue === 'string' && currentValue.trim() ? [currentValue] : []
          return
        }
        if (Array.isArray(currentValue)) {
          draft[field.name] = currentValue[0] ?? ''
        }
      })
    }
    return formDrafts[formId]
  }

  async function submitChatForm(slot: ChatFormSlot) {
    if (options.isChatResponding.value) {
      MessagePlugin.warning('请等待当前回复结束后再提交表单')
      return
    }
    const values = formDrafts[slot.formId] || {}

    for (const field of slot.schema.fields) {
      if (!field.required) {
        continue
      }

      const value = values[field.name]
      const isEmpty = Array.isArray(value)
        ? value.length === 0
        : value === '' || value === null || value === undefined
      if (isEmpty) {
        MessagePlugin.warning(`请填写${field.label}`)
        return
      }
    }

    const prompt = buildFormPrompt(slot.schema, values)
    if (!prompt.trim()) {
      MessagePlugin.warning('表单内容不能为空')
      return
    }

    submittedForms[slot.formId] = true
    try {
      await options.chatbotRef.value?.sendUserMessage?.({ prompt })
    } catch (error) {
      submittedForms[slot.formId] = false
      MessagePlugin.error(error instanceof Error ? error.message : '表单提交失败')
    }
  }

  return {
    pendingChatMessages,
    pendingAssistantSuggestions,
    pendingAssistantForm,
    pendingAssistantMemoryStatus,
    currentAssistantLoadingText,
    currentMemoryStatusText,
    chatMessages,
    submittedForms,
    formActivitySlots,
    loadingActivitySlots,
    memoryStatusActivitySlots,
    applyChatMessages,
    flushPendingAssistantMemoryStatus,
    flushPendingAssistantStructuredContent,
    handleChatMessageChange,
    getFormDraft,
    submitChatForm,
  }
}
