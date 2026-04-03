export const DEFAULT_MEMORY_THRESHOLD = 20
export const DEFAULT_RECENT_MESSAGE_LIMIT = 10
export const MAX_MESSAGE_HISTORY = 200
export const DEFAULT_MEMORY_PROMPT = [
  '请根据上一版长期记忆、上一版短期记忆、本轮用户输入和本轮回复，输出新的长期记忆与短期记忆。',
  '要求：',
  '1. 长期记忆只保留跨轮稳定有效的人设、关系、偏好、约束、长期目标和长期事实。',
  '2. 短期记忆保留当前阶段状态、最近推进、待办事项、未解决问题和近期情境。',
  '3. 两部分都要尽量完整，不要遗漏后续回复仍会依赖的信息。',
].join('\n')

export const DEFAULT_MODEL_CONFIG = {
  id: 'model-default',
  name: '默认模型',
  provider: 'openai',
  baseUrl: 'https://api.openai.com',
  apiKey: '',
  model: '',
  description: '',
  tags: [],
  temperature: 0.7,
  persistToServer: true,
}

export const DEFAULT_MODEL_CONFIGS = {
  configs: [DEFAULT_MODEL_CONFIG],
  activeModelConfigId: DEFAULT_MODEL_CONFIG.id,
}

export const DEFAULT_MEMORY_SCHEMA = { categories: [] }

export const DEFAULT_ROBOTS = [
  {
    id: 'robot-default',
    name: '默认智能体',
    description: '',
    avatar: '',
    persistToServer: true,
    commonPrompt: '',
    systemPrompt: '',
    memoryModelConfigId: '',
    outlineModelConfigId: '',
    knowledgeRetrievalModelConfigId: '',
    worldGraphModelConfigId: '',
    memorySchema: DEFAULT_MEMORY_SCHEMA,
  },
]

export const DEFAULT_SESSION_ROBOT = {
  id: '',
  name: '当前智能体',
  avatar: '',
  commonPrompt: '',
  systemPrompt: '',
  memoryModelConfigId: '',
  outlineModelConfigId: '',
  knowledgeRetrievalModelConfigId: '',
  worldGraphModelConfigId: '',
}

export const DEFAULT_SESSION_MEMORY = {
  summary: '',
  updatedAt: '',
  sourceMessageCount: 0,
  persistToServer: true,
  threshold: DEFAULT_MEMORY_THRESHOLD,
  recentMessageLimit: DEFAULT_RECENT_MESSAGE_LIMIT,
  prompt: DEFAULT_MEMORY_PROMPT,
}

export const DEFAULT_STRUCTURED_MEMORY = {
  updatedAt: '',
  longTermMemory: '',
  shortTermMemory: '',
}

export const DEFAULT_SESSIONS_PAYLOAD = {
  sessions: [],
}

export const PROVIDER_DEFAULTS = {
  openai: {
    baseUrl: 'https://api.openai.com',
    temperature: 0.7,
  },
  ollama: {
    baseUrl: 'http://127.0.0.1:11434/v1',
    temperature: 0.7,
  },
}

export const SUGGESTION_BLOCK_START = '<suggestions>'
export const SUGGESTION_BLOCK_END = '</suggestions>'
export const FORM_BLOCK_START = '<form>'
export const FORM_BLOCK_END = '</form>'

export const CHOICE_PROTOCOL_PROMPT = [
  '当你希望用户从几个明确选项中选择下一步时，必须在回复末尾追加 suggestions 结构块。',
  `suggestions 格式：${SUGGESTION_BLOCK_START}[{"t":"按钮文字","p":"点击后发送的文本"}]${SUGGESTION_BLOCK_END}`,
  '若发送文本与按钮文字相同，可省略 p。',
  '如果正文里出现“请选择”“你想要哪一个”“你希望我继续哪一步”这类明确选项问题，不能只写正文，必须同时返回 suggestions。',
  'suggestions 应覆盖用户下一步最合理的 2 到 5 个选项，按钮文字简短直接。',
  '每次回复最多只能返回一种结构块；若可用 suggestions，就不要返回 form。',
  '不要返回多余字段，不需要 suggestions 时不要输出该结构。',
].join('\n')

export const FORM_PROTOCOL_PROMPT = [
  '仅当必须收集结构化填写信息且不适合用 suggestions 时，才返回 form 结构块。',
  `form 格式：${FORM_BLOCK_START}{"ti":"标题","de":"说明","st":"提交","fs":[{"n":"gender","l":"性别","t":"radio","r":true,"o":[{"l":"男","v":"male"},{"l":"女","v":"female"}]},{"n":"age","l":"年龄","t":"input","it":"number","r":true}]}${FORM_BLOCK_END}`,
  '表单短 key：ti=title，de=description，st=submitText，fs=fields。',
  '字段短 key：n=name，l=label，t=type，p=placeholder，r=required，it=inputType，m=multiple，o=options，d=defaultValue。',
  '选项短 key：l=label，v=value。',
  'fields.type 只允许 input、radio、checkbox、select。',
  '不要返回空字符串、空数组、默认值等多余信息。',
].join('\n')
