import { MessagePlugin } from 'tdesign-vue-next'
import { computed, reactive, ref } from 'vue'

import {
  getRobotWorldGraph,
  listRobotKnowledgeDocuments,
  getRobots,
  replaceRobotWorldGraph,
  saveRobots,
  uploadRobotKnowledgeDocument,
} from '@/lib/api'
import { UnauthorizedError } from '@/lib/auth'
import { useDocumentGenerationManager } from '@/hooks/chat-view/useDocumentGenerationManager'
import { deleteLocalRobot, listLocalRobots, putLocalRobot } from '@/lib/local-db'
import type {
  AgentTemplateFileV1,
  AIRobotCard,
  MemorySchemaState,
  RobotKnowledgeDocument,
  RobotWorldGraph,
} from '@/types/ai'

interface UseChatRobotManagerOptions {
  defaultMemorySchema: MemorySchemaState
  normalizeMemorySchema: (schema?: Partial<MemorySchemaState> | null) => MemorySchemaState
}

interface SaveMobileAgentOptions {
  closeEditor?: boolean
  successMessage?: string
}

export function useChatRobotManager(options: UseChatRobotManagerOptions) {
  const AGENT_TEMPLATE_FILE_KIND = 'myaichat-agent-template'
  const AGENT_TEMPLATE_FILE_SECRET = 'myaichat:agent-template:v1'
  const agentManageVisible = ref(false)
  const mobileAgentEditorVisible = ref(false)
  const savingMobileAgent = ref(false)
  const robotTemplates = ref<AIRobotCard[]>([])
  const selectedNewChatRobotId = ref('')
  const editingAgentId = ref('')
  const mobileAgentEditorMode = ref<'create' | 'edit'>('create')
  const editingMobileAgentId = ref('')
  const agentEditorStep = ref<1 | 2 | 3 | 4>(1)
  const mobileAgentDraft = reactive<AIRobotCard>(createRobotTemplate())
  const knowledgeDocuments = ref<RobotKnowledgeDocument[]>([])
  const knowledgeDocumentsLoading = ref(false)
  const knowledgeDocumentUploading = ref(false)
  const knowledgeDocumentFile = ref<File | null>(null)
  const knowledgeDocumentEmbeddingModelConfigId = ref('')

  const selectedNewChatRobot = computed(
    () => robotTemplates.value.find((item) => item.id === selectedNewChatRobotId.value) ?? null,
  )
  const isEditingAgentDraft = computed(() => mobileAgentEditorMode.value === 'edit')

  function createRobotId() {
    return `robot-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  function resetKnowledgeDocumentState() {
    knowledgeDocuments.value = []
    knowledgeDocumentsLoading.value = false
    knowledgeDocumentUploading.value = false
    knowledgeDocumentFile.value = null
    knowledgeDocumentEmbeddingModelConfigId.value = ''
  }

  function createRobotTemplate(): AIRobotCard {
    return {
      id: createRobotId(),
      name: '新智能体',
      description: '',
      avatar: '',
      persistToServer: true,
      commonPrompt: '',
      systemPrompt: '',
      memoryModelConfigId: '',
      outlineModelConfigId: '',
      knowledgeRetrievalModelConfigId: '',
      worldGraphModelConfigId: '',
      memorySchema: options.normalizeMemorySchema(options.defaultMemorySchema),
      worldGraph: null,
    }
  }

  function cloneWorldGraph(graph?: RobotWorldGraph | null) {
    return graph ? JSON.parse(JSON.stringify(graph)) as RobotWorldGraph : null
  }

  const {
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
    openDocumentGenerationDialog,
    closeDocumentGenerationDialog,
    setDocumentGenerationFile,
    submitDocumentGeneration,
    cancelCurrentDocumentGeneration,
  } = useDocumentGenerationManager({
    onCompleted: async (task) => {
      await reloadRobotTemplates()
      const robotId = String(task.result?.robotId || '').trim()
      closeDocumentGenerationDialog()
      if (!robotId) {
        return
      }
      editingAgentId.value = robotId
      selectedNewChatRobotId.value = robotId
      openMobileAgentEditDialog(robotId)
    },
  })

  function syncMobileAgentDraft(source?: Partial<AIRobotCard> | null) {
    const fallback = createRobotTemplate()
    mobileAgentDraft.id = String(source?.id || fallback.id)
    mobileAgentDraft.name = String(source?.name || '')
    mobileAgentDraft.description = String(source?.description || '')
    mobileAgentDraft.avatar = String(source?.avatar || '')
    mobileAgentDraft.persistToServer = Boolean(source?.persistToServer ?? true)
    mobileAgentDraft.commonPrompt = String(source?.commonPrompt || '')
    mobileAgentDraft.systemPrompt = String(source?.systemPrompt || '')
    mobileAgentDraft.memoryModelConfigId = String(source?.memoryModelConfigId || '')
    mobileAgentDraft.outlineModelConfigId = String(source?.outlineModelConfigId || '')
    mobileAgentDraft.knowledgeRetrievalModelConfigId = String(source?.knowledgeRetrievalModelConfigId || '')
    mobileAgentDraft.worldGraphModelConfigId = String(source?.worldGraphModelConfigId || '')
    mobileAgentDraft.memorySchema = options.normalizeMemorySchema(source?.memorySchema || fallback.memorySchema)
    mobileAgentDraft.worldGraph = cloneWorldGraph(source?.worldGraph)
  }

  function normalizeRobotDraft(item: AIRobotCard, index: number): AIRobotCard {
    return {
      ...item,
      name: item.name.trim() || `智能体 ${index + 1}`,
      description: item.description.trim(),
      avatar: item.avatar.trim(),
      persistToServer: Boolean(item.persistToServer),
      commonPrompt: item.commonPrompt.trim(),
      systemPrompt: item.systemPrompt,
      memoryModelConfigId: String(item.memoryModelConfigId || '').trim(),
      outlineModelConfigId: String(item.outlineModelConfigId || '').trim(),
      knowledgeRetrievalModelConfigId: String(item.knowledgeRetrievalModelConfigId || '').trim(),
      worldGraphModelConfigId: String(item.worldGraphModelConfigId || '').trim(),
      memorySchema: options.normalizeMemorySchema(item.memorySchema),
      worldGraph: cloneWorldGraph(item.worldGraph),
    }
  }

  async function reloadRobotTemplates() {
    const [serverResponse, localRobots] = await Promise.all([getRobots(), listLocalRobots()])
    robotTemplates.value = [...serverResponse.robots, ...localRobots]
  }

  async function loadKnowledgeDocuments(robotId = mobileAgentDraft.id) {
    const normalizedRobotId = String(robotId || '').trim()
    const target = robotTemplates.value.find((item) => item.id === normalizedRobotId)
    if (!normalizedRobotId || !target?.persistToServer) {
      knowledgeDocuments.value = []
      return
    }

    knowledgeDocumentsLoading.value = true
    try {
      const response = await listRobotKnowledgeDocuments(normalizedRobotId)
      knowledgeDocuments.value = response.documents
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return
      }
      MessagePlugin.error(error instanceof Error ? error.message : '加载向量数据列表失败')
    } finally {
      knowledgeDocumentsLoading.value = false
    }
  }

  function setKnowledgeDocumentFile(file: File | null) {
    knowledgeDocumentFile.value = file
  }

  async function uploadKnowledgeDocument() {
    const target = robotTemplates.value.find(
      (item) => item.id === String(mobileAgentDraft.id || '').trim() && Boolean(item.persistToServer),
    )
    if (!target?.id) {
      MessagePlugin.error('请先保存到服务器，再添加向量数据')
      return
    }
    if (!(knowledgeDocumentFile.value instanceof File)) {
      MessagePlugin.error('请选择要导入的知识文件')
      return
    }
    if (!knowledgeDocumentEmbeddingModelConfigId.value.trim()) {
      MessagePlugin.error('请选择向量 Embedding 模型')
      return
    }

    knowledgeDocumentUploading.value = true
    try {
      await uploadRobotKnowledgeDocument(
        target.id,
        knowledgeDocumentFile.value,
        knowledgeDocumentEmbeddingModelConfigId.value,
      )
      knowledgeDocumentFile.value = null
      await loadKnowledgeDocuments(target.id)
      MessagePlugin.success('向量数据已写入知识库')
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return
      }
      await loadKnowledgeDocuments(target.id)
      MessagePlugin.error(error instanceof Error ? error.message : '添加向量数据失败')
    } finally {
      knowledgeDocumentUploading.value = false
    }
  }

  async function persistRobotTemplates(nextTemplates: AIRobotCard[], successMessage: string) {
    robotTemplates.value = nextTemplates.length ? nextTemplates : [createRobotTemplate()]
    if (!robotTemplates.value.some((item) => item.id === selectedNewChatRobotId.value)) {
      selectedNewChatRobotId.value = robotTemplates.value[0]?.id || ''
    }
    if (!robotTemplates.value.some((item) => item.id === editingAgentId.value)) {
      editingAgentId.value = robotTemplates.value[0]?.id || ''
    }
    MessagePlugin.success(successMessage)
  }

  async function loadRobotTemplates() {
    await reloadRobotTemplates()
    if (!robotTemplates.value.some((item) => item.id === selectedNewChatRobotId.value) && robotTemplates.value.length) {
      selectedNewChatRobotId.value = robotTemplates.value[0]!.id
    }
    if (!robotTemplates.value.some((item) => item.id === editingAgentId.value) && robotTemplates.value.length) {
      editingAgentId.value = robotTemplates.value[0]!.id
    }
  }

  function openAgentManageDialog() {
    editingAgentId.value = editingAgentId.value || robotTemplates.value[0]?.id || ''
    agentManageVisible.value = true
  }

  function addAgentTemplate() {
    openMobileAgentCreateDialog()
  }

  function goToAgentEditorStep(step: 1 | 2 | 3 | 4) {
    agentEditorStep.value = step
  }

  function openMobileAgentCreateDialog() {
    mobileAgentEditorMode.value = 'create'
    editingMobileAgentId.value = ''
    editingAgentId.value = ''
    syncMobileAgentDraft(createRobotTemplate())
    resetKnowledgeDocumentState()
    goToAgentEditorStep(1)
    mobileAgentEditorVisible.value = true
  }

  function openMobileAgentEditDialog(agentId: string) {
    const target = robotTemplates.value.find((item) => item.id === agentId)
    if (!target) {
      return
    }
    mobileAgentEditorMode.value = 'edit'
    editingMobileAgentId.value = agentId
    editingAgentId.value = agentId
    syncMobileAgentDraft(target)
    knowledgeDocumentFile.value = null
    goToAgentEditorStep(1)
    mobileAgentEditorVisible.value = true
    void loadKnowledgeDocuments(agentId)
  }

  function nextAgentEditorStep() {
    if (agentEditorStep.value < 4) {
      agentEditorStep.value = (agentEditorStep.value + 1) as 1 | 2 | 3 | 4
    }
  }

  function previousAgentEditorStep() {
    if (agentEditorStep.value > 1) {
      agentEditorStep.value = (agentEditorStep.value - 1) as 1 | 2 | 3 | 4
    }
  }

  async function removeMobileAgent(agentId: string) {
    savingMobileAgent.value = true
    try {
      const target = robotTemplates.value.find((item) => item.id === agentId)
      if (!target) {
        return
      }
      if (target.persistToServer) {
        const serverResponse = await getRobots()
        await saveRobots(serverResponse.robots.filter((item) => item.id !== agentId))
      } else {
        await deleteLocalRobot(agentId)
      }
      await reloadRobotTemplates()
      await persistRobotTemplates(robotTemplates.value, '智能体已删除')
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return
      }
      MessagePlugin.error(error instanceof Error ? error.message : '删除智能体失败')
    } finally {
      savingMobileAgent.value = false
    }
  }

  function handleAgentCardAction(agentId: string, action?: string | number | Record<string, unknown>) {
    const nextAction = String(action || '')
    if (nextAction === 'edit') {
      openMobileAgentEditDialog(agentId)
      return
    }
    if (nextAction === 'export') {
      void exportRobotTemplate(agentId)
      return
    }
    if (nextAction === 'delete') {
      void removeMobileAgent(agentId)
    }
  }

  function createImportedAgentName(baseName: string, existingNames: Set<string>) {
    const seedName = baseName.trim() || '导入模板'
    const suffix = '（导入）'
    let candidate = `${seedName}${suffix}`
    let index = 2

    while (existingNames.has(candidate)) {
      candidate = `${seedName}${suffix}${index}`
      index += 1
    }

    return candidate
  }

  function sanitizeFileNameSegment(value: string) {
    return value.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_').replace(/\s+/g, '-').replace(/-+/g, '-').trim() || 'agent-template'
  }

  function createTemplateExportFilename(templateName: string) {
    const now = new Date()
    const timestamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0'),
    ].join('')

    return `agent-template-${sanitizeFileNameSegment(templateName)}-${timestamp}.json`
  }

  function uint8ArrayToBase64(bytes: Uint8Array) {
    let binary = ''
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte)
    })
    return btoa(binary)
  }

  function base64ToUint8Array(value: string) {
    const binary = atob(value)
    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
  }

  async function getTemplateCryptoKey() {
    const rawKey = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(AGENT_TEMPLATE_FILE_SECRET),
    )
    return crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  }

  async function encryptTemplatePayload(template: AIRobotCard) {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const key = await getTemplateCryptoKey()
    const plaintext = new TextEncoder().encode(JSON.stringify(template))
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)

    return {
      iv: uint8ArrayToBase64(iv),
      payload: uint8ArrayToBase64(new Uint8Array(encrypted)),
    }
  }

  async function decryptTemplatePayload(input: { iv: string; payload: string }) {
    const key = await getTemplateCryptoKey()
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToUint8Array(input.iv) },
      key,
      base64ToUint8Array(input.payload),
    )

    return JSON.parse(new TextDecoder().decode(decrypted)) as Partial<AIRobotCard>
  }

  function downloadTextFile(filename: string, content: string) {
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  function normalizeImportedRobot(template: Partial<AIRobotCard>) {
    const normalized = normalizeRobotDraft(
      {
        ...createRobotTemplate(),
        ...template,
        persistToServer: false,
      },
      robotTemplates.value.length,
    )

    return {
      ...normalized,
      id: createRobotId(),
      persistToServer: false,
      worldGraph: cloneWorldGraph(template.worldGraph),
    }
  }

  function parseAgentTemplateFile(raw: string) {
    let payload: AgentTemplateFileV1 | null = null
    try {
      payload = JSON.parse(raw) as AgentTemplateFileV1
    } catch {
      throw new Error('模板文件不是有效的 JSON')
    }

    if (!payload || typeof payload !== 'object') {
      throw new Error('模板文件格式不正确')
    }

    if (payload.kind !== AGENT_TEMPLATE_FILE_KIND) {
      throw new Error('不支持的模板文件类型')
    }

    if (payload.version !== 1) {
      throw new Error('不支持的模板文件版本')
    }

    if (payload.algorithm !== 'AES-GCM') {
      throw new Error('不支持的模板加密算法')
    }

    if (typeof payload.iv !== 'string' || !payload.iv.trim()) {
      throw new Error('模板文件缺少加密向量')
    }

    if (typeof payload.payload !== 'string' || !payload.payload.trim()) {
      throw new Error('模板文件缺少加密内容')
    }

    return payload
  }

  async function exportRobotTemplate(agentId: string) {
    const target = robotTemplates.value.find((item) => item.id === agentId)
    if (!target) {
      MessagePlugin.error('未找到要导出的智能体模板')
      return
    }

    const worldGraph = target.persistToServer && target.id
      ? await getRobotWorldGraph(target.id)
      : cloneWorldGraph(target.worldGraph)
    const encrypted = await encryptTemplatePayload({
      ...normalizeRobotDraft(target, 0),
      worldGraph,
    })
    const payload: AgentTemplateFileV1 = {
      kind: AGENT_TEMPLATE_FILE_KIND,
      version: 1,
      exportedAt: new Date().toISOString(),
      algorithm: 'AES-GCM',
      iv: encrypted.iv,
      payload: encrypted.payload,
    }

    downloadTextFile(
      createTemplateExportFilename(target.name || 'agent-template'),
      `${JSON.stringify(payload, null, 2)}\n`,
    )
    MessagePlugin.success('模板已导出')
  }

  async function importRobotTemplate(file: File) {
    try {
      const raw = await file.text()
      const payload = parseAgentTemplateFile(raw)
      const decryptedTemplate = await decryptTemplatePayload(payload)
      const existingNames = new Set(robotTemplates.value.map((item) => item.name.trim()).filter(Boolean))
      const normalized = normalizeImportedRobot(decryptedTemplate)
      const importedRobot: AIRobotCard = {
        ...normalized,
        name: createImportedAgentName(normalized.name, existingNames),
        persistToServer: true,
      }

      const serverResponse = await getRobots()
      await saveRobots([...serverResponse.robots, { ...importedRobot, worldGraph: undefined }])
      if (importedRobot.worldGraph && importedRobot.id) {
        await replaceRobotWorldGraph(importedRobot.id, importedRobot.worldGraph)
      }
      await reloadRobotTemplates()
      await persistRobotTemplates(robotTemplates.value, '模板已导入到服务器')
    } catch (error) {
      const message =
        error instanceof Error && /decrypt|operation-specific|AES-GCM|cipher|too small|invalid/i.test(error.message)
          ? '模板文件无法解密'
          : error instanceof Error
            ? error.message
            : '导入模板失败'
      MessagePlugin.error(message)
    }
  }

  async function saveMobileAgent(saveOptions: SaveMobileAgentOptions = {}) {
    savingMobileAgent.value = true
    try {
      const nextAgent: AIRobotCard = {
        ...mobileAgentDraft,
        name: mobileAgentDraft.name.trim(),
        description: mobileAgentDraft.description.trim(),
        avatar: mobileAgentDraft.avatar.trim(),
        commonPrompt: mobileAgentDraft.commonPrompt.trim(),
        systemPrompt: mobileAgentDraft.systemPrompt,
        memoryModelConfigId: String(mobileAgentDraft.memoryModelConfigId || '').trim(),
        outlineModelConfigId: String(mobileAgentDraft.outlineModelConfigId || '').trim(),
        knowledgeRetrievalModelConfigId: String(mobileAgentDraft.knowledgeRetrievalModelConfigId || '').trim(),
        worldGraphModelConfigId: String(mobileAgentDraft.worldGraphModelConfigId || '').trim(),
        memorySchema: options.normalizeMemorySchema(mobileAgentDraft.memorySchema),
      }
      const previousAgent =
        mobileAgentEditorMode.value === 'edit'
          ? robotTemplates.value.find((item) => item.id === editingMobileAgentId.value) || null
          : null
      const normalizedAgent = normalizeRobotDraft(nextAgent, robotTemplates.value.length)

      if (normalizedAgent.persistToServer) {
        const serverResponse = await getRobots()
        const nextServerRobots =
          previousAgent?.persistToServer
            ? serverResponse.robots.map((item) =>
                item.id === normalizedAgent.id ? normalizedAgent : item,
              )
            : [...serverResponse.robots, normalizedAgent]
        await saveRobots(nextServerRobots)
        if (previousAgent && !previousAgent.persistToServer) {
          await deleteLocalRobot(previousAgent.id)
        }
      } else {
        await putLocalRobot({
          ...normalizedAgent,
          persistToServer: false,
        })
        if (previousAgent?.persistToServer) {
          const serverResponse = await getRobots()
          await saveRobots(serverResponse.robots.filter((item) => item.id !== previousAgent.id))
        }
      }

      await reloadRobotTemplates()
      await persistRobotTemplates(
        robotTemplates.value,
        saveOptions.successMessage
          || (mobileAgentEditorMode.value === 'edit' ? '智能体已更新' : '智能体已新增'),
      )

      if (mobileAgentEditorMode.value === 'create') {
        selectedNewChatRobotId.value = nextAgent.id
        editingAgentId.value = nextAgent.id
      } else {
        editingAgentId.value = nextAgent.id
      }

      if (saveOptions.closeEditor !== false) {
        mobileAgentEditorVisible.value = false
        agentManageVisible.value = false
      }
      return normalizedAgent
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return null
      }
      MessagePlugin.error(error instanceof Error ? error.message : '保存智能体失败')
      return null
    } finally {
      savingMobileAgent.value = false
    }
  }

  async function skipAgentStructureSetup() {
    await saveMobileAgent()
  }

  return {
    agentManageVisible,
    mobileAgentEditorVisible,
    savingMobileAgent,
    knowledgeDocuments,
    knowledgeDocumentsLoading,
    knowledgeDocumentUploading,
    knowledgeDocumentFile,
    knowledgeDocumentEmbeddingModelConfigId,
    documentGenerationVisible,
    documentGenerationSubmitting,
    robotTemplates,
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
    selectedNewChatRobotId,
    editingAgentId,
    mobileAgentEditorMode,
    editingMobileAgentId,
    agentEditorStep,
    mobileAgentDraft,
    selectedNewChatRobot,
    isEditingAgentDraft,
    createRobotTemplate,
    exportRobotTemplate,
    importRobotTemplate,
    loadRobotTemplates,
    loadKnowledgeDocuments,
    setKnowledgeDocumentFile,
    uploadKnowledgeDocument,
    openAgentManageDialog,
    openDocumentGenerationDialog,
    closeDocumentGenerationDialog,
    setDocumentGenerationFile,
    submitDocumentGeneration,
    cancelCurrentDocumentGeneration,
    addAgentTemplate,
    openMobileAgentCreateDialog,
    openMobileAgentEditDialog,
    nextAgentEditorStep,
    previousAgentEditorStep,
    removeMobileAgent,
    handleAgentCardAction,
    saveMobileAgent,
    skipAgentStructureSetup,
  }
}
