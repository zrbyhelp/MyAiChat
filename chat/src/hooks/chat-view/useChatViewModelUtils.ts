import type { AIModelConfigItem, ProviderType } from '@/types/ai'

export const PROVIDER_OPTIONS = [
  { label: 'OpenAI Compatible', value: 'openai' },
  { label: 'Ollama', value: 'ollama' },
]

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
    persistToServer: true,
  },
  ollama: {
    provider: 'ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    apiKey: '',
    description: '',
    tags: [],
    temperature: 0.7,
    persistToServer: true,
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

export function normalizeModelTags(tags?: string[] | string | null) {
  const list = Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(/[,\n，]/) : []
  return list
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .filter((item, index, source) => source.indexOf(item) === index)
}
