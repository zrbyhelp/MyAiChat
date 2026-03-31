export const DEFAULT_MEMORY_THRESHOLD = 20
export const DEFAULT_RECENT_MESSAGE_LIMIT = 10
export const DEFAULT_STRUCTURED_MEMORY_INTERVAL = 3
export const DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT = 12
export const MAX_MESSAGE_HISTORY = 200
export const DEFAULT_MEMORY_PROMPT = [
  '请根据旧摘要和新增对话，输出一份新的完整中文会话摘要。',
  '要求：',
  '1. 只输出摘要正文，不要加标题，不要输出 JSON。',
  '2. 保留重要上下文、用户偏好、约束、任务进展和仍未解决的问题。',
  '3. 内容尽量精炼，但不要遗漏后续对话需要继续依赖的信息。',
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

export const DEFAULT_MEMORY_SCHEMA = {
  categories: [
    {
      id: 'preferences',
      label: '用户偏好',
      description: '记录长期稳定的偏好、风格和约束',
      extractionInstructions: '只记录会持续影响后续回答的偏好、风格或约束条件。',
      fields: [
        { id: 'preference', name: 'preference', label: '偏好项', type: 'text', required: true },
        { id: 'value', name: 'value', label: '偏好值', type: 'text', required: true },
      ],
    },
    {
      id: 'facts',
      label: '已知事实',
      description: '记录稳定事实、背景信息和环境上下文',
      extractionInstructions: '只记录较稳定、后续仍可能被引用的事实信息。',
      fields: [
        { id: 'subject', name: 'subject', label: '主体', type: 'text', required: true },
        { id: 'predicate', name: 'predicate', label: '关系', type: 'text', required: true },
        { id: 'value', name: 'value', label: '值', type: 'text', required: true },
      ],
    },
    {
      id: 'tasks',
      label: '任务进展',
      description: '记录目标、状态、待办和阻塞项',
      extractionInstructions: '记录任务目标、当前状态、下一步与阻塞因素。',
      fields: [
        { id: 'title', name: 'title', label: '任务标题', type: 'text', required: true },
        {
          id: 'status',
          name: 'status',
          label: '状态',
          type: 'enum',
          required: true,
          options: [
            { label: '待办', value: 'todo' },
            { label: '进行中', value: 'in_progress' },
            { label: '阻塞', value: 'blocked' },
            { label: '完成', value: 'done' },
          ],
        },
        { id: 'details', name: 'details', label: '详情', type: 'text', required: false },
        { id: 'next_step', name: 'next_step', label: '下一步', type: 'text', required: false },
      ],
    },
    {
      id: 'long_term_memory',
      label: '长期记忆',
      description: '记录对后续长期有价值的稳定背景、经历和约定',
      extractionInstructions: '只记录后续多轮对话仍值得保留的长期信息，避免写入一次性细节。',
      fields: [
        { id: 'topic', name: 'topic', label: '记忆主题', type: 'text', required: true },
        { id: 'content', name: 'content', label: '记忆内容', type: 'text', required: true },
      ],
    },
  ],
}

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
    numericComputationModelConfigId: '',
    worldGraphModelConfigId: '',
    numericComputationEnabled: false,
    numericComputationPrompt: '',
    numericComputationItems: [],
    structuredMemoryInterval: DEFAULT_STRUCTURED_MEMORY_INTERVAL,
    structuredMemoryHistoryLimit: DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT,
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
  numericComputationModelConfigId: '',
  worldGraphModelConfigId: '',
  numericComputationEnabled: false,
  numericComputationPrompt: '',
  numericComputationItems: [],
  structuredMemoryInterval: DEFAULT_STRUCTURED_MEMORY_INTERVAL,
  structuredMemoryHistoryLimit: DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT,
}

export const DEFAULT_SESSION_MEMORY = {
  summary: '',
  updatedAt: '',
  sourceMessageCount: 0,
  persistToServer: true,
  threshold: DEFAULT_MEMORY_THRESHOLD,
  recentMessageLimit: DEFAULT_RECENT_MESSAGE_LIMIT,
  prompt: DEFAULT_MEMORY_PROMPT,
  structuredMemoryInterval: DEFAULT_STRUCTURED_MEMORY_INTERVAL,
  structuredMemoryHistoryLimit: DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT,
}

export const DEFAULT_STRUCTURED_MEMORY = {
  updatedAt: '',
  categories: [],
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
