import { MessagePlugin } from 'tdesign-vue-next'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useChatInteractionGuard } from './useChatInteractionGuard'
import type { ChatbotInstance } from './useChatView.types'

describe('useChatInteractionGuard', () => {
  it('locks interaction before sending and keeps the lock until explicitly released', async () => {
    const sendUserMessage = vi.fn().mockResolvedValue(undefined)
    const chatbotRef = ref<ChatbotInstance | null>({
      sendUserMessage,
    })
    const isChatResponding = ref(false)
    const guard = useChatInteractionGuard({
      chatbotRef,
      isChatResponding,
    })

    const sent = await guard.sendPrompt('你好')

    expect(sent).toBe(true)
    expect(sendUserMessage).toHaveBeenCalledWith({ prompt: '你好' })
    expect(guard.isInteractionLocked.value).toBe(true)

    guard.endInteractionLock()

    expect(guard.isInteractionLocked.value).toBe(false)
  })

  it('tracks the pending send source for the next request', async () => {
    const sendUserMessage = vi.fn().mockResolvedValue(undefined)
    const chatbotRef = ref<ChatbotInstance | null>({
      sendUserMessage,
    })
    const isChatResponding = ref(false)
    const guard = useChatInteractionGuard({
      chatbotRef,
      isChatResponding,
    })

    const sent = await guard.sendPrompt('建议动作', { source: 'suggestion' })

    expect(sent).toBe(true)
    expect(guard.consumePendingSendSource()).toBe('suggestion')
    expect(guard.consumePendingSendSource()).toBe('manual')
  })

  it('blocks duplicate sends while interaction is locked', async () => {
    const warningSpy = vi
      .spyOn(MessagePlugin, 'warning')
      .mockImplementation(() => Promise.resolve({} as never))
    const sendUserMessage = vi.fn().mockResolvedValue(undefined)
    const chatbotRef = ref<ChatbotInstance | null>({
      sendUserMessage,
    })
    const isChatResponding = ref(false)
    const guard = useChatInteractionGuard({
      chatbotRef,
      isChatResponding,
    })

    guard.beginInteractionLock()
    const sent = await guard.sendPrompt('第二条消息')

    expect(sent).toBe(false)
    expect(sendUserMessage).not.toHaveBeenCalled()
    expect(warningSpy).toHaveBeenCalledWith('请等待当前回复结束后再操作')

    warningSpy.mockRestore()
  })

  it('releases the lock when sending throws', async () => {
    const sendUserMessage = vi.fn().mockRejectedValue(new Error('send failed'))
    const chatbotRef = ref<ChatbotInstance | null>({
      sendUserMessage,
    })
    const isChatResponding = ref(false)
    const guard = useChatInteractionGuard({
      chatbotRef,
      isChatResponding,
    })

    await expect(guard.sendPrompt('异常')).rejects.toThrow('send failed')
    expect(guard.isInteractionLocked.value).toBe(false)
  })
})
