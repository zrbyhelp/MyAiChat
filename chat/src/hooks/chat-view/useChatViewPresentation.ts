import { MessagePlugin } from 'tdesign-vue-next'
import type { Ref } from 'vue'

import type { SuggestionOption } from '@/types/ai'

interface UseChatViewPresentationOptions {
  isInteractionLocked: Ref<boolean>
  sendPrompt: (prompt: string, blockedMessage?: string) => Promise<boolean>
  assistantAvatar: Ref<string>
}

export function useChatViewPresentation(options: UseChatViewPresentationOptions) {
  const suggestionActionHandlers = {
    suggestion: async ({ content }: { content?: SuggestionOption }) => {
      if (options.isInteractionLocked.value) {
        MessagePlugin.warning('请等待当前回复结束后再操作')
        return
      }
      const prompt = content?.prompt?.trim() || content?.title?.trim() || ''
      if (!prompt) {
        return
      }
      await options.sendPrompt(prompt)
    },
  }

  function chatMessageProps(message: { role?: string; avatar?: string; name?: string }) {
    if (message.role === 'system') {
      return {
        name: '',
        variant: 'text',
        handleActions: suggestionActionHandlers,
      }
    }

    if (message.role === 'assistant') {
      return {
        name: '',
        avatar: message.avatar || options.assistantAvatar.value || undefined,
        variant: 'outline',
        handleActions: suggestionActionHandlers,
      }
    }

    return {
      name: '',
      variant: 'outline',
      handleActions: suggestionActionHandlers,
    }
  }

  const agentCardActionOptions = [
    { content: '修改', value: 'edit' },
    { content: '导出', value: 'export' },
    { content: '删除', value: 'delete', theme: 'error' as const },
  ]
  const modelCardActionOptions = [
    { content: '修改', value: 'edit' },
    { content: '删除', value: 'delete', theme: 'error' as const },
  ]

  return {
    chatMessageProps,
    agentCardActionOptions,
    modelCardActionOptions,
  }
}
