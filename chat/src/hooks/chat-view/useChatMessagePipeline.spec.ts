import { MessagePlugin } from 'tdesign-vue-next'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useChatMessagePipeline } from './useChatMessagePipeline'
import type { ChatbotInstance } from './useChatView.types'

describe('useChatMessagePipeline', () => {
  it('blocks form submission while interaction is locked', async () => {
    const warningSpy = vi
      .spyOn(MessagePlugin, 'warning')
      .mockImplementation(() => Promise.resolve({} as never))
    const sendPrompt = vi.fn().mockResolvedValue(true)
    const pipeline = useChatMessagePipeline({
      chatbotRef: ref<ChatbotInstance | null>(null),
      isInteractionLocked: ref(true),
      sendPrompt,
    })

    await pipeline.submitChatForm({
      slotName: 'assistant-1-form',
      formId: 'assistant-1-form',
      schema: {
        title: '补充信息',
        fields: [
          {
            name: 'city',
            label: '城市',
            type: 'input',
            required: true,
          },
        ],
      },
    })

    expect(sendPrompt).not.toHaveBeenCalled()
    expect(warningSpy).toHaveBeenCalledWith('请等待当前回复结束后再提交表单')

    warningSpy.mockRestore()
  })

  it('sends the built prompt when form submission is allowed', async () => {
    const sendPrompt = vi.fn().mockResolvedValue(true)
    const pipeline = useChatMessagePipeline({
      chatbotRef: ref<ChatbotInstance | null>(null),
      isInteractionLocked: ref(false),
      sendPrompt,
    })
    const slot = {
      slotName: 'assistant-2-form',
      formId: 'assistant-2-form',
      schema: {
        title: '补充信息',
        fields: [
          {
            name: 'city',
            label: '城市',
            type: 'input' as const,
            required: true,
          },
        ],
      },
    }

    const draft = pipeline.getFormDraft(slot.formId, slot.schema)
    draft.city = '上海'

    await pipeline.submitChatForm(slot)

    expect(sendPrompt).toHaveBeenCalledTimes(1)
    expect(sendPrompt.mock.calls[0]?.[0]).toContain('城市')
    expect(sendPrompt.mock.calls[0]?.[0]).toContain('上海')
    expect(sendPrompt.mock.calls[0]?.[1]).toEqual({
      blockedMessage: '请等待当前回复结束后再提交表单',
      source: 'form',
    })
    expect(pipeline.submittedForms[slot.formId]).toBe(true)
  })
})
