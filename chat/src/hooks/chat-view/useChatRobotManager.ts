import { MessagePlugin } from 'tdesign-vue-next'
import { computed, reactive, ref } from 'vue'

import { getRobots, saveRobots } from '@/lib/api'
import { UnauthorizedError } from '@/lib/auth'
import { deleteLocalRobot, listLocalRobots, putLocalRobot } from '@/lib/local-db'
import type {
  AgentTemplateFileV1,
  AIRobotCard,
  MemorySchemaState,
  NumericComputationItem,
} from '@/types/ai'

interface UseChatRobotManagerOptions {
  defaultStructuredMemoryInterval: number
  defaultStructuredMemoryHistoryLimit: number
  defaultMemorySchema: MemorySchemaState
  normalizeMemorySchema: (schema?: Partial<MemorySchemaState> | null) => MemorySchemaState
  createNumericComputationItem: (index?: number) => NumericComputationItem
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
  const agentEditorStep = ref<1 | 2 | 3>(1)
  const mobileAgentDraft = reactive<AIRobotCard>(createRobotTemplate())

  const selectedNewChatRobot = computed(
    () => robotTemplates.value.find((item) => item.id === selectedNewChatRobotId.value) ?? null,
  )
  const isEditingAgentDraft = computed(() => mobileAgentEditorMode.value === 'edit')

  function createRobotId() {
    return `robot-${Date.now()}-${Math.random().toString(16).slice(2)}`
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
      numericComputationModelConfigId: '',
      formOptionModelConfigId: '',
      numericComputationEnabled: false,
      numericComputationPrompt: '',
      numericComputationItems: [],
      structuredMemoryInterval: options.defaultStructuredMemoryInterval,
      structuredMemoryHistoryLimit: options.defaultStructuredMemoryHistoryLimit,
      memorySchema: options.normalizeMemorySchema(options.defaultMemorySchema),
    }
  }

  function cloneNumericComputationItems(items?: NumericComputationItem[] | null) {
    return (Array.isArray(items) ? items : []).map((item) => ({
      name: String(item?.name || '').trim(),
      currentValue:
        typeof item?.currentValue === 'number' && Number.isFinite(item.currentValue)
          ? item.currentValue
          : 0,
      description: String(item?.description || ''),
    }))
  }

  function addNumericComputationItem(target: { numericComputationItems: NumericComputationItem[] }) {
    target.numericComputationItems.push(options.createNumericComputationItem(target.numericComputationItems.length + 1))
  }

  function removeNumericComputationItem(
    target: { numericComputationItems: NumericComputationItem[] },
    index: number,
  ) {
    target.numericComputationItems.splice(index, 1)
  }

  function validateNumericComputationItems(items: NumericComputationItem[]) {
    const normalized = cloneNumericComputationItems(items)
    const seenNames = new Set<string>()

    for (const item of normalized) {
      if (!item.name) {
        return { ok: false as const, message: '数值结构中的名称不能为空' }
      }
      if (seenNames.has(item.name)) {
        return { ok: false as const, message: `数值结构名称重复：${item.name}` }
      }
      if (!Number.isFinite(item.currentValue)) {
        return { ok: false as const, message: `数值结构 ${item.name} 的当前值必须是数值` }
      }
      seenNames.add(item.name)
    }

    return { ok: true as const, normalized }
  }

  function syncMobileAgentDraft(source?: Partial<AIRobotCard> | null) {
    const fallback = createRobotTemplate()
    mobileAgentDraft.id = String(source?.id || fallback.id)
    mobileAgentDraft.name = String(source?.name || '')
    mobileAgentDraft.description = String(source?.description || '')
    mobileAgentDraft.avatar = String(source?.avatar || '')
    mobileAgentDraft.persistToServer = Boolean(source?.persistToServer ?? true)
    mobileAgentDraft.commonPrompt = String(source?.commonPrompt || '')
    mobileAgentDraft.systemPrompt = String(source?.systemPrompt || '')
    mobileAgentDraft.memoryModelConfigId = ''
    mobileAgentDraft.numericComputationModelConfigId = ''
    mobileAgentDraft.formOptionModelConfigId = ''
    mobileAgentDraft.numericComputationEnabled = Boolean(source?.numericComputationEnabled)
    mobileAgentDraft.numericComputationPrompt = String(source?.numericComputationPrompt || '')
    mobileAgentDraft.numericComputationItems = cloneNumericComputationItems(source?.numericComputationItems)
    mobileAgentDraft.structuredMemoryInterval =
      typeof source?.structuredMemoryInterval === 'number' && source.structuredMemoryInterval > 0
        ? Math.round(source.structuredMemoryInterval)
        : fallback.structuredMemoryInterval
    mobileAgentDraft.structuredMemoryHistoryLimit =
      typeof source?.structuredMemoryHistoryLimit === 'number' && source.structuredMemoryHistoryLimit > 0
        ? Math.round(source.structuredMemoryHistoryLimit)
        : fallback.structuredMemoryHistoryLimit
    mobileAgentDraft.memorySchema = options.normalizeMemorySchema(source?.memorySchema || fallback.memorySchema)
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
      memoryModelConfigId: '',
      numericComputationModelConfigId: '',
      formOptionModelConfigId: '',
      numericComputationEnabled: Boolean(item.numericComputationEnabled),
      numericComputationPrompt: item.numericComputationPrompt.trim(),
      numericComputationItems: cloneNumericComputationItems(item.numericComputationItems),
      structuredMemoryInterval: Math.max(
        1,
        Math.round(item.structuredMemoryInterval || options.defaultStructuredMemoryInterval),
      ),
      structuredMemoryHistoryLimit: Math.max(
        1,
        Math.round(item.structuredMemoryHistoryLimit || options.defaultStructuredMemoryHistoryLimit),
      ),
      memorySchema: options.normalizeMemorySchema(item.memorySchema),
    }
  }

  async function reloadRobotTemplates() {
    const [serverResponse, localRobots] = await Promise.all([getRobots(), listLocalRobots()])
    robotTemplates.value = [...serverResponse.robots, ...localRobots]
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

  function goToAgentEditorStep(step: 1 | 2 | 3) {
    agentEditorStep.value = step
  }

  function openMobileAgentCreateDialog() {
    mobileAgentEditorMode.value = 'create'
    editingMobileAgentId.value = ''
    editingAgentId.value = ''
    syncMobileAgentDraft(createRobotTemplate())
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
    goToAgentEditorStep(1)
    mobileAgentEditorVisible.value = true
  }

  function nextAgentEditorStep() {
    if (agentEditorStep.value < 3) {
      agentEditorStep.value = (agentEditorStep.value + 1) as 1 | 2 | 3
    }
  }

  function previousAgentEditorStep() {
    if (agentEditorStep.value > 1) {
      agentEditorStep.value = (agentEditorStep.value - 1) as 1 | 2 | 3
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

    const encrypted = await encryptTemplatePayload(normalizeRobotDraft(target, 0))
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
        persistToServer: false,
      }

      await putLocalRobot(importedRobot)
      await reloadRobotTemplates()
      await persistRobotTemplates(robotTemplates.value, '模板已导入到本地')
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

  async function saveMobileAgent() {
    savingMobileAgent.value = true
    try {
      const itemsValidation = validateNumericComputationItems(mobileAgentDraft.numericComputationItems)
      if (!itemsValidation.ok && mobileAgentDraft.numericComputationEnabled) {
        MessagePlugin.error(itemsValidation.message)
        return
      }
      const nextAgent: AIRobotCard = {
        ...mobileAgentDraft,
        name: mobileAgentDraft.name.trim(),
        description: mobileAgentDraft.description.trim(),
        avatar: mobileAgentDraft.avatar.trim(),
        commonPrompt: mobileAgentDraft.commonPrompt.trim(),
        systemPrompt: mobileAgentDraft.systemPrompt,
        memoryModelConfigId: '',
        numericComputationModelConfigId: '',
        formOptionModelConfigId: '',
        numericComputationEnabled: Boolean(mobileAgentDraft.numericComputationEnabled),
        numericComputationPrompt: mobileAgentDraft.numericComputationPrompt.trim(),
        numericComputationItems: itemsValidation.ok ? itemsValidation.normalized : [],
        structuredMemoryInterval: Math.max(
          1,
          Math.round(mobileAgentDraft.structuredMemoryInterval || options.defaultStructuredMemoryInterval),
        ),
        structuredMemoryHistoryLimit: Math.max(
          1,
          Math.round(
            mobileAgentDraft.structuredMemoryHistoryLimit || options.defaultStructuredMemoryHistoryLimit,
          ),
        ),
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
        mobileAgentEditorMode.value === 'edit' ? '智能体已更新' : '智能体已新增',
      )

      if (mobileAgentEditorMode.value === 'create') {
        selectedNewChatRobotId.value = nextAgent.id
        editingAgentId.value = nextAgent.id
      } else {
        editingAgentId.value = nextAgent.id
      }

      mobileAgentEditorVisible.value = false
      agentManageVisible.value = false
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return
      }
      MessagePlugin.error(error instanceof Error ? error.message : '保存智能体失败')
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
    robotTemplates,
    selectedNewChatRobotId,
    editingAgentId,
    mobileAgentEditorMode,
    editingMobileAgentId,
    agentEditorStep,
    mobileAgentDraft,
    selectedNewChatRobot,
    isEditingAgentDraft,
    createRobotTemplate,
    cloneNumericComputationItems,
    addNumericComputationItem,
    removeNumericComputationItem,
    validateNumericComputationItems,
    exportRobotTemplate,
    importRobotTemplate,
    loadRobotTemplates,
    openAgentManageDialog,
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
