import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useChatRobotManager } from './useChatRobotManager'
import type { AIRobotCard, MemorySchemaState } from '@/types/ai'

const {
  createRobotGenerationTask,
  getRobotGenerationTask,
  getRobots,
  getRobotWorldGraph,
  replaceRobotWorldGraph,
  saveRobots,
  listLocalRobots,
  putLocalRobot,
  deleteLocalRobot,
  success,
  error,
} = vi.hoisted(() => ({
  getRobots: vi.fn(),
  createRobotGenerationTask: vi.fn(),
  getRobotGenerationTask: vi.fn(),
  getRobotWorldGraph: vi.fn(),
  replaceRobotWorldGraph: vi.fn(),
  saveRobots: vi.fn(),
  listLocalRobots: vi.fn(),
  putLocalRobot: vi.fn(),
  deleteLocalRobot: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  createRobotGenerationTask,
  getRobotGenerationTask,
  getRobots,
  getRobotWorldGraph,
  replaceRobotWorldGraph,
  saveRobots,
}))

vi.mock('@/lib/local-db', () => ({
  listLocalRobots,
  putLocalRobot,
  deleteLocalRobot,
}))

vi.mock('tdesign-vue-next', () => ({
  MessagePlugin: {
    success,
    error,
  },
}))

const defaultMemorySchema: MemorySchemaState = {
  categories: [
    {
      id: 'profile',
      label: '资料',
      description: '',
      extractionInstructions: '',
      fields: [
        {
          id: 'nickname',
          name: 'nickname',
          label: '昵称',
          type: 'text',
          required: false,
        },
      ],
    },
  ],
}

function createRobot(overrides: Partial<AIRobotCard> = {}): AIRobotCard {
  return {
    id: overrides.id || 'robot-1',
    name: overrides.name || '测试模板',
    description: overrides.description || '模板说明',
    avatar: overrides.avatar || '',
    persistToServer: overrides.persistToServer ?? true,
    commonPrompt: overrides.commonPrompt || '通用提示',
    systemPrompt: overrides.systemPrompt || '系统提示',
    memoryModelConfigId: '',
    outlineModelConfigId: '',
    knowledgeRetrievalModelConfigId: '',
    numericComputationModelConfigId: '',
    worldGraphModelConfigId: '',
    numericComputationEnabled: false,
    numericComputationPrompt: '',
    numericComputationItems: [],
    structuredMemoryInterval: 3,
    structuredMemoryHistoryLimit: 12,
    memorySchema: overrides.memorySchema || defaultMemorySchema,
    worldGraph: overrides.worldGraph || null,
  }
}

function createManager() {
  return useChatRobotManager({
    defaultStructuredMemoryInterval: 3,
    defaultStructuredMemoryHistoryLimit: 12,
    defaultMemorySchema,
    normalizeMemorySchema: (schema?: Partial<MemorySchemaState> | null) =>
      schema?.categories?.length ? ({ categories: schema.categories } as MemorySchemaState) : defaultMemorySchema,
    createNumericComputationItem: (index = 1) => ({
      name: `value_${index}`,
      currentValue: 0,
      description: '',
    }),
  })
}

describe('useChatRobotManager', () => {
  let localRobots: AIRobotCard[]
  let serverRobots: AIRobotCard[]
  let createObjectUrlSpy: ReturnType<typeof vi.spyOn>
  let revokeObjectUrlSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    localRobots = []
    serverRobots = [createRobot()]
    getRobots.mockImplementation(async () => ({ robots: serverRobots }))
    getRobotWorldGraph.mockResolvedValue({
      meta: {
        robotId: 'robot-1',
        title: '测试模板 世界设定',
        summary: '',
        graphVersion: 1,
        calendar: {
          calendarId: 'default',
          calendarName: '默认历法',
          eras: ['新纪元'],
          monthNames: ['一月'],
          dayNames: ['周一'],
          timeOfDayLabels: ['白天'],
          formatTemplate: '{yearLabel}',
        },
        layout: {
          viewportX: 0,
          viewportY: 0,
          zoom: 1,
        },
      },
      relationTypes: [],
      nodes: [],
      edges: [],
    })
    replaceRobotWorldGraph.mockResolvedValue(undefined)
    saveRobots.mockImplementation(async (robots: AIRobotCard[]) => {
      serverRobots = robots
      return { robots }
    })
    listLocalRobots.mockImplementation(async () => localRobots)
    putLocalRobot.mockImplementation(async (robot: AIRobotCard) => {
      localRobots = [...localRobots.filter((item) => item.id !== robot.id), robot]
    })
    deleteLocalRobot.mockResolvedValue(undefined)
    success.mockReset()
    error.mockReset()
    createRobotGenerationTask.mockReset()
    getRobotGenerationTask.mockReset()
    getRobots.mockClear()
    getRobotWorldGraph.mockClear()
    replaceRobotWorldGraph.mockClear()
    saveRobots.mockClear()
    listLocalRobots.mockClear()
    putLocalRobot.mockClear()
    deleteLocalRobot.mockClear()
    createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:agent-template')
    revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  it('exports a single robot template with versioned file payload', async () => {
    const manager = createManager()
    await manager.loadRobotTemplates()

    await manager.exportRobotTemplate('robot-1')

    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1)
    const blob = createObjectUrlSpy.mock.calls[0]?.[0]
    expect(blob).toBeInstanceOf(Blob)
    const exported = JSON.parse(await (blob as Blob).text())
    expect(exported.kind).toBe('myaichat-agent-template')
    expect(exported.version).toBe(1)
    expect(exported.algorithm).toBe('AES-GCM')
    expect(typeof exported.iv).toBe('string')
    expect(typeof exported.payload).toBe('string')
    expect(exported.template).toBeUndefined()
    expect(getRobotWorldGraph).toHaveBeenCalledWith('robot-1')
    expect(success).toHaveBeenCalledWith('模板已导出')
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:agent-template')
  })

  it('imports a template to the server and restores its world graph', async () => {
    const manager = createManager()
    await manager.loadRobotTemplates()

    await manager.exportRobotTemplate('robot-1')

    const blob = createObjectUrlSpy.mock.calls[0]?.[0] as Blob
    const file = new File([await blob.text()], 'agent-template.json', { type: 'application/json' })

    await manager.importRobotTemplate(file)

    expect(saveRobots).toHaveBeenCalledTimes(1)
    expect(putLocalRobot).not.toHaveBeenCalled()
    const importedRobot = (saveRobots.mock.calls[0]?.[0] as AIRobotCard[]).find((item) => item.name === '测试模板（导入）')
    expect(importedRobot?.persistToServer).toBe(true)
    expect(importedRobot?.id).not.toBe('robot-existing')
    expect(importedRobot?.name).toBe('测试模板（导入）')
    expect(replaceRobotWorldGraph).toHaveBeenCalledTimes(1)
    expect(success).toHaveBeenCalledWith('模板已导入到服务器')
    expect(manager.robotTemplates.value.some((item) => item.name === '测试模板（导入）')).toBe(true)
  })

  it('shows an error for an invalid import file', async () => {
    const manager = createManager()
    await manager.loadRobotTemplates()

    const file = new File(['not-json'], 'bad-template.json', { type: 'application/json' })

    await manager.importRobotTemplate(file)

    expect(putLocalRobot).not.toHaveBeenCalled()
    expect(saveRobots).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith('模板文件不是有效的 JSON')
  })

  it('shows an error for a payload that cannot be decrypted', async () => {
    const manager = createManager()
    await manager.loadRobotTemplates()

    const file = new File(
      [
        JSON.stringify({
          kind: 'myaichat-agent-template',
          version: 1,
          exportedAt: '2026-03-27T00:00:00.000Z',
          algorithm: 'AES-GCM',
          iv: 'AAAAAAAAAAAAAAAA',
          payload: 'AAAAAAAAAAAAAAAA',
        }),
      ],
      'bad-cipher.json',
      { type: 'application/json' },
    )

    await manager.importRobotTemplate(file)

    expect(putLocalRobot).not.toHaveBeenCalled()
    expect(saveRobots).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith('模板文件无法解密')
  })

  it('requires a document generation model before submitting', async () => {
    const manager = createManager()

    manager.setDocumentGenerationFile(new File(['hello'], 'demo.txt', { type: 'text/plain' }))
    manager.documentGenerationEmbeddingModelConfigId.value = 'embedding-1'

    await manager.submitDocumentGeneration()

    expect(createRobotGenerationTask).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith('请选择文档生成模型')
  })

  it('requires an embedding model before submitting', async () => {
    const manager = createManager()

    manager.setDocumentGenerationFile(new File(['hello'], 'demo.txt', { type: 'text/plain' }))
    manager.documentGenerationModelConfigId.value = 'model-1'

    await manager.submitDocumentGeneration()

    expect(createRobotGenerationTask).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith('请选择向量 Embedding 模型')
  })
})
