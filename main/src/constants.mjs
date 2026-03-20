export const DEFAULT_MEMORY_THRESHOLD = 20
export const DEFAULT_RECENT_MESSAGE_LIMIT = 10
export const MAX_MESSAGE_HISTORY = 200

export const DEFAULT_MODEL_CONFIG = {
  id: 'model-default',
  name: '默认模型',
  provider: 'ollama',
  baseUrl: 'http://127.0.0.1:11434',
  apiKey: '',
  model: '',
  temperature: 0.7,
}

export const DEFAULT_MODEL_CONFIGS = {
  configs: [DEFAULT_MODEL_CONFIG],
  activeModelConfigId: DEFAULT_MODEL_CONFIG.id,
}

export const DEFAULT_ROBOTS = [
  {
    id: 'robot-default',
    name: '默认机器人',
    description: '',
    avatar: '',
    systemPrompt: '',
  },
]

export const DEFAULT_SESSION_ROBOT = {
  name: '当前机器人',
  avatar: '',
  systemPrompt: '',
}

export const DEFAULT_SESSION_MEMORY = {
  summary: '',
  updatedAt: '',
  sourceMessageCount: 0,
  threshold: DEFAULT_MEMORY_THRESHOLD,
  recentMessageLimit: DEFAULT_RECENT_MESSAGE_LIMIT,
}

export const DEFAULT_SESSIONS_PAYLOAD = {
  sessions: [],
}

export const PROVIDER_DEFAULTS = {
  ollama: {
    baseUrl: 'http://127.0.0.1:11434',
    temperature: 0.7,
  },
  openai: {
    baseUrl: 'https://api.openai.com',
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
