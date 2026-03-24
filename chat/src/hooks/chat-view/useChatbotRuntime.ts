import { onUnmounted, watch, type Ref } from 'vue'

import { asRecord } from '@/hooks/chat-view/useChatView.message-utils'
import type { ChatbotInstance, ChatRenderMessage } from '@/hooks/chat-view/useChatView.types'

interface UseChatbotRuntimeOptions {
  chatbotRef: Ref<ChatbotInstance | null>
  isChatResponding: Ref<boolean>
  pendingChatMessages: Ref<ChatRenderMessage[] | null>
  applyChatMessages: (messages: ChatRenderMessage[]) => void
}

export function useChatbotRuntime(options: UseChatbotRuntimeOptions) {
  let disposeChatbotEventBus: (() => void) | null = null

  watch(options.chatbotRef, (instance) => {
    disposeChatbotEventBus?.()
    disposeChatbotEventBus = null

    const eventBus = instance?.chatEngine?.eventBus
    const subscribe = eventBus?.on
    if (subscribe) {
      const unsubs = [
        subscribe('request:start', () => {
          options.isChatResponding.value = true
        }),
        subscribe('request:complete', () => {
          options.isChatResponding.value = false
        }),
        subscribe('request:abort', () => {
          options.isChatResponding.value = false
        }),
        subscribe('request:error', () => {
          options.isChatResponding.value = false
        }),
      ].filter((unsubscribe): unsubscribe is () => void => typeof unsubscribe === 'function')
      disposeChatbotEventBus = () => {
        unsubs.forEach((unsubscribe) => unsubscribe())
      }
    } else {
      options.isChatResponding.value =
        instance?.chatStatus === 'pending' || instance?.chatStatus === 'streaming'
    }

    if (!instance?.registerMergeStrategy) {
      return
    }

    instance.registerMergeStrategy('markdown', (chunk, existing) => {
      const chunkObj = asRecord(chunk)
      const existingObj = asRecord(existing)
      return {
        ...chunkObj,
        data: `${String(existingObj.data ?? '')}${String(chunkObj.data ?? '')}`,
      }
    })

    instance.registerMergeStrategy('thinking', (chunk, existing) => {
      const chunkObj = asRecord(chunk)
      const existingObj = asRecord(existing)
      const existingData = asRecord(existingObj.data)
      const chunkData = asRecord(chunkObj.data)
      return {
        ...chunkObj,
        data: {
          ...existingData,
          ...chunkData,
          text: `${String(existingData.text ?? '')}${String(chunkData.text ?? '')}`,
        },
      }
    })

    if (options.pendingChatMessages.value !== null) {
      options.applyChatMessages(options.pendingChatMessages.value)
    }
  })

  onUnmounted(() => {
    disposeChatbotEventBus?.()
    disposeChatbotEventBus = null
  })
}
