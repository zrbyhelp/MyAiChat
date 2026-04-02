import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __resetDocumentGenerationManagerForTests,
  useDocumentGenerationManager,
} from './useDocumentGenerationManager'

const {
  cancelRobotGenerationTask,
  createRobotGenerationTask,
  getRobotGenerationTask,
  success,
  error,
} = vi.hoisted(() => ({
  cancelRobotGenerationTask: vi.fn(),
  createRobotGenerationTask: vi.fn(),
  getRobotGenerationTask: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  cancelRobotGenerationTask,
  createRobotGenerationTask,
  getRobotGenerationTask,
}))

vi.mock('tdesign-vue-next', () => ({
  MessagePlugin: {
    success,
    error,
  },
}))

function createPendingTask(status: 'pending' | 'processing' | 'canceling' = 'pending') {
  return {
    id: 'task-1',
    status,
    stage: status === 'canceling' ? 'canceling' : 'summarizing',
    progress: status === 'canceling' ? 46 : 32,
    message: status === 'canceling' ? '正在取消生成任务' : '正在总结文档片段 1/3',
    sourceName: '设定集.txt',
    sourceType: 'txt',
    sourceSize: 1024,
    guidance: '',
    modelConfigId: 'model-1',
    embeddingModelConfigId: 'embedding-1',
    robotId: '',
    documentId: '',
    stats: {},
    result: {},
    error: '',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:01.000Z',
    startedAt: '2026-04-01T00:00:01.000Z',
    completedAt: '',
  } as const
}

describe('useDocumentGenerationManager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    __resetDocumentGenerationManagerForTests()
    cancelRobotGenerationTask.mockReset()
    createRobotGenerationTask.mockReset()
    getRobotGenerationTask.mockReset()
    success.mockReset()
    error.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the running task after closing the dialog and reopens it from shared state', async () => {
    const manager = useDocumentGenerationManager()
    const pendingTask = createPendingTask('pending')
    manager.documentGenerationVisible.value = true
    manager.documentGenerationTask.value = pendingTask

    expect(manager.documentGenerationVisible.value).toBe(true)
    expect(manager.documentGenerationIndicatorVisible.value).toBe(true)
    expect(manager.documentGenerationTask.value?.id).toBe('task-1')

    manager.closeDocumentGenerationDialog()

    expect(manager.documentGenerationVisible.value).toBe(false)
    expect(manager.documentGenerationIndicatorVisible.value).toBe(true)
    expect(manager.documentGenerationTask.value?.sourceName).toBe('设定集.txt')

    manager.reopenDocumentGenerationDialog()

    expect(manager.documentGenerationVisible.value).toBe(true)
  })

  it('polls from canceling to canceled and hides the indicator when cancellation finishes', async () => {
    const manager = useDocumentGenerationManager()
    const pendingTask = createPendingTask('pending')
    const cancelingTask = createPendingTask('canceling')
    const canceledTask = {
      ...cancelingTask,
      status: 'canceled',
      stage: 'canceled',
      message: '已取消文档生成',
      completedAt: '2026-04-01T00:00:03.000Z',
    }

    manager.documentGenerationTask.value = pendingTask
    getRobotGenerationTask.mockResolvedValueOnce(canceledTask)
    cancelRobotGenerationTask.mockResolvedValue({ task: cancelingTask })
    await manager.cancelCurrentDocumentGeneration()

    expect(cancelRobotGenerationTask).toHaveBeenCalledWith('task-1')
    expect(manager.documentGenerationTask.value?.status).toBe('canceling')

    await vi.runOnlyPendingTimersAsync()

    expect(manager.documentGenerationIndicatorVisible.value).toBe(false)
  })

  it('submits extraction detail controls together with the generation task', async () => {
    const manager = useDocumentGenerationManager()
    const file = new File(['hello'], '设定.txt', { type: 'text/plain' })
    createRobotGenerationTask.mockResolvedValue({
      task: {
        ...createPendingTask('pending'),
        sourceName: '设定.txt',
      },
    })
    getRobotGenerationTask.mockResolvedValue({
      task: {
        ...createPendingTask('pending'),
        status: 'completed',
        stage: 'completed',
        progress: 100,
        message: '完成',
        completedAt: '2026-04-01T00:00:04.000Z',
      },
    })

    manager.setDocumentGenerationFile(file)
    manager.documentGenerationModelConfigId.value = 'model-1'
    manager.documentGenerationEmbeddingModelConfigId.value = 'embedding-1'
    manager.documentGenerationTargetSegmentChars.value = 90000
    manager.documentGenerationMaxEntitiesPerSegment.value = 9
    manager.documentGenerationMaxRelationsPerSegment.value = 11
    manager.documentGenerationMaxEventsPerSegment.value = 5
    manager.documentGenerationEntityImportanceThreshold.value = 0.45
    manager.documentGenerationRelationImportanceThreshold.value = 0.5
    manager.documentGenerationEventImportanceThreshold.value = 0.6

    await manager.submitDocumentGeneration()

    expect(createRobotGenerationTask).toHaveBeenCalledWith(
      file,
      '',
      'model-1',
      'embedding-1',
      {
        targetSegmentChars: 90000,
        maxEntitiesPerSegment: 9,
        maxRelationsPerSegment: 11,
        maxEventsPerSegment: 5,
        entityImportanceThreshold: 0.45,
        relationImportanceThreshold: 0.5,
        eventImportanceThreshold: 0.6,
      },
    )
  })
})
