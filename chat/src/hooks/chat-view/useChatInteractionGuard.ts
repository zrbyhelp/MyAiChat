import { MessagePlugin } from 'tdesign-vue-next'
import { computed, onUnmounted, ref, watch, type Ref } from 'vue'

import type { ChatbotInstance } from './useChatView.types'

interface UseChatInteractionGuardOptions {
  chatbotRef: Ref<ChatbotInstance | null>
  isChatResponding: Ref<boolean>
}

export function useChatInteractionGuard(options: UseChatInteractionGuardOptions) {
  const interactionLocked = ref(false)
  const bypassNextSend = ref(false)
  const originalSendUserMessage = ref<ChatbotInstance['sendUserMessage'] | null>(null)
  const isInteractionLocked = computed(
    () => interactionLocked.value || options.isChatResponding.value,
  )

  function beginInteractionLock() {
    interactionLocked.value = true
  }

  function endInteractionLock() {
    interactionLocked.value = false
  }

  function restoreOriginalSend(instance?: ChatbotInstance | null) {
    if (!instance || !originalSendUserMessage.value) {
      return
    }
    instance.sendUserMessage = originalSendUserMessage.value
    originalSendUserMessage.value = null
  }

  watch(
    options.chatbotRef,
    (instance, previousInstance) => {
      restoreOriginalSend(previousInstance)

      const sendUserMessage = instance?.sendUserMessage
      if (!instance || !sendUserMessage) {
        return
      }

      originalSendUserMessage.value = sendUserMessage.bind(instance)
      instance.sendUserMessage = async (params) => {
        const prompt = String(params?.prompt || '').trim()
        if (bypassNextSend.value) {
          bypassNextSend.value = false
          return originalSendUserMessage.value?.(params)
        }
        if (!prompt) {
          return originalSendUserMessage.value?.(params)
        }
        if (isInteractionLocked.value) {
          MessagePlugin.warning('请等待当前回复结束后再操作')
          return
        }

        beginInteractionLock()
        try {
          await originalSendUserMessage.value?.(params)
        } catch (error) {
          endInteractionLock()
          throw error
        }
      }
    },
    { immediate: true },
  )

  onUnmounted(() => {
    restoreOriginalSend(options.chatbotRef.value)
  })

  async function sendPrompt(prompt: string, blockedMessage = '请等待当前回复结束后再操作') {
    const normalizedPrompt = prompt.trim()
    if (!normalizedPrompt) {
      return false
    }
    if (isInteractionLocked.value) {
      MessagePlugin.warning(blockedMessage)
      return false
    }

    beginInteractionLock()
    try {
      const sendUserMessage = originalSendUserMessage.value
      if (!sendUserMessage) {
        endInteractionLock()
        return false
      }
      bypassNextSend.value = true
      await sendUserMessage({ prompt: normalizedPrompt })
      return true
    } catch (error) {
      bypassNextSend.value = false
      endInteractionLock()
      throw error
    }
  }

  return {
    interactionLocked,
    isInteractionLocked,
    beginInteractionLock,
    endInteractionLock,
    sendPrompt,
  }
}
