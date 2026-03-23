import type { AIModelConfigItem, NumericComputationItem, ProviderType } from '@/types/ai'

export const PROVIDER_OPTIONS = [{ label: 'OpenAI Compatible', value: 'openai' }]

export const DEFAULT_MODEL_CONFIGS: Record<
  ProviderType,
  Omit<AIModelConfigItem, 'id' | 'name' | 'model'>
> = {
  openai: {
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    apiKey: '',
    description: '',
    tags: [],
    temperature: 0.7,
  },
}

export function createModelConfig(provider: ProviderType = 'openai', index = 1): AIModelConfigItem {
  return {
    id: `model-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: `模型配置 ${index}`,
    ...DEFAULT_MODEL_CONFIGS[provider],
    model: '',
  }
}

export function createNumericComputationItem(index = 1): NumericComputationItem {
  return {
    name: `value_${index}`,
    currentValue: 0,
    description: '',
  }
}

export function normalizeModelTags(tags?: string[] | string | null) {
  const list = Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(/[,\n，]/) : []
  return list
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .filter((item, index, source) => source.indexOf(item) === index)
}
