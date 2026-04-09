import type { ReplyMode } from '@/types/ai'

export type ChatPromptSource = 'manual' | 'suggestion' | 'form'

export const DEFAULT_REPLY_MODE: ReplyMode = 'default'

export const REPLY_MODE_OPTIONS = [
  { label: '默认', value: 'default' },
  { label: '剧情引导', value: 'story_guidance' },
  { label: '主角说话', value: 'protagonist_speech' },
] as const

export function normalizeReplyMode(value?: string | null): ReplyMode {
  if (value === 'story_guidance' || value === 'protagonist_speech') {
    return value
  }
  return DEFAULT_REPLY_MODE
}

export function buildReplyModePrompt(
  rawPrompt: string,
  replyMode: ReplyMode,
  source: ChatPromptSource,
) {
  const originalPrompt = String(rawPrompt || '')
  const normalizedReplyMode = normalizeReplyMode(replyMode)

  if (source !== 'manual' || normalizedReplyMode === 'default') {
    return {
      prompt: originalPrompt,
      originalPrompt,
      replyMode: normalizedReplyMode,
    }
  }

  if (normalizedReplyMode === 'story_guidance') {
    return {
      prompt: [
        '请将以下输入严格视为作者对剧情走向的幕后引导，输出时直接推进场景与事件，不要让主角把这段话当台词说出来。',
        '',
        '以下是用户原始输入：',
        originalPrompt,
      ].join('\n'),
      originalPrompt,
      replyMode: normalizedReplyMode,
    }
  }

  return {
    prompt: [
      '请将以下输入严格视为主角此刻说出的台词或内心表达，其他角色与叙事都围绕这句话继续展开。',
      '',
      '以下是用户原始输入：',
      originalPrompt,
    ].join('\n'),
    originalPrompt,
    replyMode: normalizedReplyMode,
  }
}
