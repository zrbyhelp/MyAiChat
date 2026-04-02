import { MessagePlugin } from 'tdesign-vue-next'
import { computed, getCurrentInstance, onUnmounted, ref } from 'vue'

import {
  cancelRobotGenerationTask,
  createRobotGenerationTask,
  getRobotGenerationTask,
} from '@/lib/api'
import { UnauthorizedError } from '@/lib/auth'
import type { RobotGenerationExtractionDetail, RobotGenerationTask } from '@/types/ai'

interface UseDocumentGenerationManagerOptions {
  onCompleted?: (task: RobotGenerationTask) => void | Promise<void>
}

const ACTIVE_TASK_STATUSES = new Set<RobotGenerationTask['status']>(['pending', 'processing', 'canceling'])
const CANCELABLE_TASK_STATUSES = new Set<RobotGenerationTask['status']>(['pending', 'processing'])
const DEFAULT_EXTRACTION_DETAIL: RobotGenerationExtractionDetail = {
  targetSegmentChars: 180000,
  maxEntitiesPerSegment: 12,
  maxRelationsPerSegment: 16,
  maxEventsPerSegment: 8,
  entityImportanceThreshold: 0.35,
  relationImportanceThreshold: 0.35,
  eventImportanceThreshold: 0.4,
}

const documentGenerationVisible = ref(false)
const documentGenerationSubmitting = ref(false)
const documentGenerationTask = ref<RobotGenerationTask | null>(null)
const documentGenerationGuidance = ref('')
const documentGenerationFile = ref<File | null>(null)
const documentGenerationModelConfigId = ref('')
const documentGenerationEmbeddingModelConfigId = ref('')
const documentGenerationTargetSegmentChars = ref(DEFAULT_EXTRACTION_DETAIL.targetSegmentChars)
const documentGenerationMaxEntitiesPerSegment = ref(DEFAULT_EXTRACTION_DETAIL.maxEntitiesPerSegment)
const documentGenerationMaxRelationsPerSegment = ref(DEFAULT_EXTRACTION_DETAIL.maxRelationsPerSegment)
const documentGenerationMaxEventsPerSegment = ref(DEFAULT_EXTRACTION_DETAIL.maxEventsPerSegment)
const documentGenerationEntityImportanceThreshold = ref(DEFAULT_EXTRACTION_DETAIL.entityImportanceThreshold)
const documentGenerationRelationImportanceThreshold = ref(DEFAULT_EXTRACTION_DETAIL.relationImportanceThreshold)
const documentGenerationEventImportanceThreshold = ref(DEFAULT_EXTRACTION_DETAIL.eventImportanceThreshold)
const completionListeners = new Set<(task: RobotGenerationTask) => void | Promise<void>>()

let generationTaskPollTimer: number | null = null

function clearDocumentGenerationPollTimer() {
  if (generationTaskPollTimer !== null) {
    window.clearTimeout(generationTaskPollTimer)
    generationTaskPollTimer = null
  }
}

function isActiveTask(task?: RobotGenerationTask | null) {
  return Boolean(task && ACTIVE_TASK_STATUSES.has(task.status))
}

function isCancelableTask(task?: RobotGenerationTask | null) {
  return Boolean(task && CANCELABLE_TASK_STATUSES.has(task.status))
}

function resetDocumentGenerationState(options: { keepTask?: boolean } = {}) {
  documentGenerationGuidance.value = ''
  documentGenerationFile.value = null
  documentGenerationModelConfigId.value = ''
  documentGenerationEmbeddingModelConfigId.value = ''
  documentGenerationTargetSegmentChars.value = DEFAULT_EXTRACTION_DETAIL.targetSegmentChars
  documentGenerationMaxEntitiesPerSegment.value = DEFAULT_EXTRACTION_DETAIL.maxEntitiesPerSegment
  documentGenerationMaxRelationsPerSegment.value = DEFAULT_EXTRACTION_DETAIL.maxRelationsPerSegment
  documentGenerationMaxEventsPerSegment.value = DEFAULT_EXTRACTION_DETAIL.maxEventsPerSegment
  documentGenerationEntityImportanceThreshold.value = DEFAULT_EXTRACTION_DETAIL.entityImportanceThreshold
  documentGenerationRelationImportanceThreshold.value = DEFAULT_EXTRACTION_DETAIL.relationImportanceThreshold
  documentGenerationEventImportanceThreshold.value = DEFAULT_EXTRACTION_DETAIL.eventImportanceThreshold
  documentGenerationSubmitting.value = false
  if (!options.keepTask) {
    documentGenerationTask.value = null
  }
  clearDocumentGenerationPollTimer()
}

async function notifyCompletionListeners(task: RobotGenerationTask) {
  const callbacks = [...completionListeners]
  if (!callbacks.length) {
    return
  }
  await Promise.allSettled(callbacks.map(async (listener) => listener(task)))
}

function scheduleDocumentGenerationPoll(taskId: string) {
  clearDocumentGenerationPollTimer()
  generationTaskPollTimer = window.setTimeout(() => {
    void pollDocumentGenerationTask(taskId)
  }, 1500)
}

function applyCancelableTaskState(task: RobotGenerationTask | null) {
  if (!task || !isCancelableTask(task)) {
    return
  }
  documentGenerationTask.value = {
    ...task,
    status: 'canceling',
    stage: 'canceling',
    message: '正在取消生成任务',
  }
}

async function handleTerminalDocumentGenerationTask(task: RobotGenerationTask) {
  clearDocumentGenerationPollTimer()
  documentGenerationSubmitting.value = false
  documentGenerationTask.value = task

  if (task.status === 'completed') {
    await notifyCompletionListeners(task)
    MessagePlugin.success(task.message || '智能体生成完成')
    return
  }

  if (task.status === 'failed') {
    MessagePlugin.error(task.error || task.message || '智能体生成失败')
    return
  }

  if (task.status === 'canceled') {
    MessagePlugin.success(task.message || '已取消文档生成')
  }
}

async function pollDocumentGenerationTask(taskId: string) {
  try {
    const response = await getRobotGenerationTask(taskId)
    documentGenerationTask.value = response.task

    if (!isActiveTask(response.task)) {
      await handleTerminalDocumentGenerationTask(response.task)
      return
    }

    scheduleDocumentGenerationPoll(taskId)
  } catch (error) {
    documentGenerationSubmitting.value = false
    clearDocumentGenerationPollTimer()
    MessagePlugin.error(error instanceof Error ? error.message : '查询生成任务失败')
  }
}

async function submitDocumentGeneration() {
  if (!(documentGenerationFile.value instanceof File)) {
    MessagePlugin.error('请选择要导入的文档')
    return
  }
  if (!documentGenerationModelConfigId.value.trim()) {
    MessagePlugin.error('请选择文档生成模型')
    return
  }
  if (!documentGenerationEmbeddingModelConfigId.value.trim()) {
    MessagePlugin.error('请选择向量 Embedding 模型')
    return
  }

  documentGenerationSubmitting.value = true
  try {
    const response = await createRobotGenerationTask(
      documentGenerationFile.value,
      documentGenerationGuidance.value,
      documentGenerationModelConfigId.value,
      documentGenerationEmbeddingModelConfigId.value,
      {
        targetSegmentChars: documentGenerationTargetSegmentChars.value,
        maxEntitiesPerSegment: documentGenerationMaxEntitiesPerSegment.value,
        maxRelationsPerSegment: documentGenerationMaxRelationsPerSegment.value,
        maxEventsPerSegment: documentGenerationMaxEventsPerSegment.value,
        entityImportanceThreshold: documentGenerationEntityImportanceThreshold.value,
        relationImportanceThreshold: documentGenerationRelationImportanceThreshold.value,
        eventImportanceThreshold: documentGenerationEventImportanceThreshold.value,
      },
    )
    documentGenerationTask.value = response.task
    documentGenerationSubmitting.value = false
    MessagePlugin.success('文档已进入生成队列')
    await pollDocumentGenerationTask(response.task.id)
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      documentGenerationSubmitting.value = false
      return
    }
    documentGenerationSubmitting.value = false
    MessagePlugin.error(error instanceof Error ? error.message : '提交文档生成任务失败')
  }
}

async function cancelCurrentDocumentGeneration() {
  if (!isCancelableTask(documentGenerationTask.value)) {
    return
  }

  const currentTask = documentGenerationTask.value as RobotGenerationTask
  applyCancelableTaskState(currentTask)
  clearDocumentGenerationPollTimer()

  try {
    const response = await cancelRobotGenerationTask(currentTask.id)
    documentGenerationTask.value = response.task

    if (isActiveTask(response.task)) {
      scheduleDocumentGenerationPoll(response.task.id)
      return
    }

    await handleTerminalDocumentGenerationTask(response.task)
  } catch (error) {
    documentGenerationTask.value = currentTask
    MessagePlugin.error(error instanceof Error ? error.message : '取消文档生成失败')
    if (isActiveTask(currentTask)) {
      scheduleDocumentGenerationPoll(currentTask.id)
    }
  }
}

function openDocumentGenerationDialog() {
  if (!isActiveTask(documentGenerationTask.value)) {
    resetDocumentGenerationState()
  }
  documentGenerationVisible.value = true
}

function reopenDocumentGenerationDialog() {
  documentGenerationVisible.value = true
}

function closeDocumentGenerationDialog() {
  documentGenerationVisible.value = false
  if (!isActiveTask(documentGenerationTask.value)) {
    resetDocumentGenerationState()
  }
}

function setDocumentGenerationFile(file: File | null) {
  documentGenerationFile.value = file
}

export function __resetDocumentGenerationManagerForTests() {
  documentGenerationVisible.value = false
  documentGenerationSubmitting.value = false
  documentGenerationTask.value = null
  documentGenerationGuidance.value = ''
  documentGenerationFile.value = null
  documentGenerationModelConfigId.value = ''
  documentGenerationEmbeddingModelConfigId.value = ''
  documentGenerationTargetSegmentChars.value = DEFAULT_EXTRACTION_DETAIL.targetSegmentChars
  documentGenerationMaxEntitiesPerSegment.value = DEFAULT_EXTRACTION_DETAIL.maxEntitiesPerSegment
  documentGenerationMaxRelationsPerSegment.value = DEFAULT_EXTRACTION_DETAIL.maxRelationsPerSegment
  documentGenerationMaxEventsPerSegment.value = DEFAULT_EXTRACTION_DETAIL.maxEventsPerSegment
  documentGenerationEntityImportanceThreshold.value = DEFAULT_EXTRACTION_DETAIL.entityImportanceThreshold
  documentGenerationRelationImportanceThreshold.value = DEFAULT_EXTRACTION_DETAIL.relationImportanceThreshold
  documentGenerationEventImportanceThreshold.value = DEFAULT_EXTRACTION_DETAIL.eventImportanceThreshold
  completionListeners.clear()
  clearDocumentGenerationPollTimer()
}

export function useDocumentGenerationManager(options: UseDocumentGenerationManagerOptions = {}) {
  const listener = typeof options.onCompleted === 'function' ? options.onCompleted : null
  if (listener) {
    completionListeners.add(listener)
    if (getCurrentInstance()) {
      onUnmounted(() => {
        completionListeners.delete(listener)
      })
    }
  }

  const documentGenerationRunning = computed(() => isActiveTask(documentGenerationTask.value))
  const documentGenerationCancelable = computed(() => isCancelableTask(documentGenerationTask.value))
  const documentGenerationIndicatorVisible = computed(() => documentGenerationRunning.value)

  return {
    documentGenerationVisible,
    documentGenerationSubmitting,
    documentGenerationTask,
    documentGenerationGuidance,
    documentGenerationFile,
    documentGenerationModelConfigId,
    documentGenerationEmbeddingModelConfigId,
    documentGenerationTargetSegmentChars,
    documentGenerationMaxEntitiesPerSegment,
    documentGenerationMaxRelationsPerSegment,
    documentGenerationMaxEventsPerSegment,
    documentGenerationEntityImportanceThreshold,
    documentGenerationRelationImportanceThreshold,
    documentGenerationEventImportanceThreshold,
    documentGenerationRunning,
    documentGenerationCancelable,
    documentGenerationIndicatorVisible,
    openDocumentGenerationDialog,
    reopenDocumentGenerationDialog,
    closeDocumentGenerationDialog,
    setDocumentGenerationFile,
    submitDocumentGeneration,
    cancelCurrentDocumentGeneration,
  }
}
