import { MessagePlugin } from 'tdesign-vue-next'
import { computed, reactive, ref } from 'vue'

import { getRobots, saveRobots } from '@/lib/api'
import { UnauthorizedError } from '@/lib/auth'
import type {
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

  function createRobotTemplate(): AIRobotCard {
    return {
      id: `robot-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: '新智能体',
      description: '',
      avatar: '',
      systemPrompt: '',
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
    mobileAgentDraft.systemPrompt = String(source?.systemPrompt || '')
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

  async function persistRobotTemplates(nextTemplates: AIRobotCard[], successMessage: string) {
    const payload = nextTemplates.length
      ? nextTemplates.map((item, index) => ({
          ...item,
          name: item.name.trim() || `智能体 ${index + 1}`,
          description: item.description.trim(),
          avatar: item.avatar.trim(),
          numericComputationEnabled: Boolean(item.numericComputationEnabled),
          numericComputationPrompt: item.numericComputationPrompt.trim(),
          numericComputationItems: cloneNumericComputationItems(item.numericComputationItems),
          structuredMemoryInterval: Math.max(1, Math.round(item.structuredMemoryInterval || options.defaultStructuredMemoryInterval)),
          structuredMemoryHistoryLimit: Math.max(1, Math.round(item.structuredMemoryHistoryLimit || options.defaultStructuredMemoryHistoryLimit)),
          memorySchema: options.normalizeMemorySchema(item.memorySchema),
        }))
      : [createRobotTemplate()]

    const response = await saveRobots(payload)
    robotTemplates.value = response.robots.length ? response.robots : [createRobotTemplate()]
    if (!robotTemplates.value.some((item) => item.id === selectedNewChatRobotId.value)) {
      selectedNewChatRobotId.value = robotTemplates.value[0]?.id || ''
    }
    if (!robotTemplates.value.some((item) => item.id === editingAgentId.value)) {
      editingAgentId.value = robotTemplates.value[0]?.id || ''
    }
    MessagePlugin.success(successMessage)
  }

  async function loadRobotTemplates() {
    const response = await getRobots()
    robotTemplates.value = response.robots
    if (!robotTemplates.value.some((item) => item.id === selectedNewChatRobotId.value) && response.robots.length) {
      selectedNewChatRobotId.value = response.robots[0]!.id
    }
    if (!robotTemplates.value.some((item) => item.id === editingAgentId.value) && response.robots.length) {
      editingAgentId.value = response.robots[0]!.id
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
      const nextTemplates = robotTemplates.value.filter((item) => item.id !== agentId)
      await persistRobotTemplates(nextTemplates, '智能体已删除')
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
    if (nextAction === 'delete') {
      void removeMobileAgent(agentId)
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
        systemPrompt: mobileAgentDraft.systemPrompt,
        numericComputationEnabled: Boolean(mobileAgentDraft.numericComputationEnabled),
        numericComputationPrompt: mobileAgentDraft.numericComputationPrompt.trim(),
        numericComputationItems: itemsValidation.ok ? itemsValidation.normalized : [],
        structuredMemoryInterval: Math.max(1, Math.round(mobileAgentDraft.structuredMemoryInterval || options.defaultStructuredMemoryInterval)),
        structuredMemoryHistoryLimit: Math.max(1, Math.round(mobileAgentDraft.structuredMemoryHistoryLimit || options.defaultStructuredMemoryHistoryLimit)),
        memorySchema: options.normalizeMemorySchema(mobileAgentDraft.memorySchema),
      }
      const nextTemplates =
        mobileAgentEditorMode.value === 'edit'
          ? robotTemplates.value.map((item) => (item.id === editingMobileAgentId.value ? nextAgent : item))
          : [...robotTemplates.value, nextAgent]

      await persistRobotTemplates(
        nextTemplates,
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
