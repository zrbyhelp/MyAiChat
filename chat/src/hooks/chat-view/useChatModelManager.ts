import { MessagePlugin } from 'tdesign-vue-next'
import { computed, reactive, ref, watch } from 'vue'

import { getCapabilities, getModelConfigs, saveModelConfigs, testModelConnection } from '@/lib/api'
import { fetchBrowserDirectModels } from '@/lib/browser-agent/openai-compatible'
import {
  deleteLocalModelConfig,
  listLocalModelConfigs,
  putLocalModelConfig,
} from '@/lib/local-db'
import type { AIModelConfigItem, ModelAccessMode, ModelCapabilities, ModelOption, ProviderType } from '@/types/ai'

interface UseChatModelManagerOptions {
  createModelConfig: (provider?: ProviderType, index?: number) => AIModelConfigItem
  normalizeModelTags: (tags?: string[] | string | null) => string[]
  defaultModelConfigs: Record<ProviderType, Omit<AIModelConfigItem, 'id' | 'name' | 'model'>>
  onSyncCurrentSessionMeta: () => Promise<void>
}

export function useChatModelManager(options: UseChatModelManagerOptions) {
  const ACTIVE_MODEL_CONFIG_STORAGE_KEY = 'myaichat.active-model-config-id'
  const configVisible = ref(false)
  const mobileModelEditorVisible = ref(false)
  const desktopModelEditorVisible = ref(false)
  const savingConfig = ref(false)
  const savingMobileModel = ref(false)
  const savingDesktopModel = ref(false)
  const loadingModels = ref(false)
  const testingConnection = ref(false)

  const mobileModelEditorMode = ref<'create' | 'edit'>('create')
  const editingMobileModelId = ref('')
  const desktopModelEditorMode = ref<'create' | 'edit'>('create')
  const editingDesktopModelId = ref('')
  const editingConfigId = ref('')
  const activeModelConfigId = ref('')

  const streamEnabled = ref(true)
  const streamEnabledByModelId = ref<Record<string, boolean>>({})
  const thinkingEnabled = ref(false)
  const capabilities = ref<ModelCapabilities>({
    supportsStreaming: true,
    supportsReasoning: false,
  })
  const modelConfigs = ref<AIModelConfigItem[]>([])
  const modelOptionsMap = ref<Record<string, ModelOption[]>>({})

  const editingConfig = reactive<AIModelConfigItem>(options.createModelConfig())
  const mobileModelDraft = reactive<AIModelConfigItem>(options.createModelConfig())
  const desktopModelDraft = reactive<AIModelConfigItem>(options.createModelConfig())
  const mobileModelTagsInput = ref('')
  const desktopModelTagsInput = ref('')

  const activeModelConfig = computed(
    () =>
      modelConfigs.value.find((item) => item.id === activeModelConfigId.value) ??
      modelConfigs.value[0] ??
      options.createModelConfig(),
  )
  const currentModelLabel = computed(
    () => activeModelConfig.value.name || activeModelConfig.value.model || '选择模型',
  )
  const showStreamToggle = computed(() => capabilities.value.supportsStreaming)
  const showThinkingToggle = computed(() => capabilities.value.supportsReasoning)
  // 流式传输开关已下线，默认始终开启流式输出
  const effectiveStream = computed(() => true)
  const effectiveThinking = computed(() => showThinkingToggle.value && thinkingEnabled.value)
  const editingModelOptions = computed(() =>
    (modelOptionsMap.value[editingConfigId.value] || []).map((item) => ({
      label: item.label,
      value: item.id,
    })),
  )
  const temperatureValue = computed<number | undefined>({
    get: () => editingConfig.temperature ?? undefined,
    set: (value) => {
      editingConfig.temperature = typeof value === 'number' ? value : null
    },
  })
  const mobileModelTemperatureValue = computed<number | undefined>({
    get: () => mobileModelDraft.temperature ?? undefined,
    set: (value) => {
      mobileModelDraft.temperature = typeof value === 'number' ? value : null
    },
  })
  const desktopModelTemperatureValue = computed<number | undefined>({
    get: () => desktopModelDraft.temperature ?? undefined,
    set: (value) => {
      desktopModelDraft.temperature = typeof value === 'number' ? value : null
    },
  })
  const mobileDraftStreamEnabled = computed(
    () => streamEnabledByModelId.value[mobileModelDraft.id] ?? true,
  )
  const desktopDraftStreamEnabled = computed(
    () => streamEnabledByModelId.value[desktopModelDraft.id] ?? true,
  )

  watch(
    capabilities,
    (value) => {
      if (!value.supportsReasoning) {
        thinkingEnabled.value = false
      }
    },
    { deep: true, immediate: true },
  )

  function getStoredActiveModelConfigId() {
    return typeof window !== 'undefined'
      ? window.localStorage.getItem(ACTIVE_MODEL_CONFIG_STORAGE_KEY) || ''
      : ''
  }

  function storeActiveModelConfigId(value: string) {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ACTIVE_MODEL_CONFIG_STORAGE_KEY, value)
    }
  }

  function syncEditingConfig(config: AIModelConfigItem) {
    editingConfig.id = config.id
    editingConfig.name = config.name
    editingConfig.provider = config.provider
    editingConfig.accessMode = normalizeAccessMode(config.accessMode)
    editingConfig.baseUrl = config.baseUrl
    editingConfig.apiKey = config.apiKey
    editingConfig.model = config.model
    editingConfig.description = config.description
    editingConfig.tags = options.normalizeModelTags(config.tags)
    editingConfig.temperature = config.temperature
    editingConfig.persistToServer = Boolean(config.persistToServer ?? true)
  }

  function commitEditingConfig() {
    modelConfigs.value = modelConfigs.value.map((item) =>
      item.id === editingConfig.id
        ? {
            ...editingConfig,
            name: editingConfig.name.trim() || item.name || '未命名配置',
            description: String(editingConfig.description || '').trim(),
            tags: options.normalizeModelTags(editingConfig.tags),
            accessMode: normalizeAccessMode(editingConfig.accessMode),
            persistToServer: Boolean(editingConfig.persistToServer),
          }
        : item,
    )
  }

  function applyModelConfigs(configs: AIModelConfigItem[], activeId: string) {
    const normalized = (configs.length ? configs : [options.createModelConfig()]).map(
      (item, index) => ({
        ...item,
        name: String(item.name || `模型配置 ${index + 1}`),
        description: String(item.description || '').trim(),
        tags: options.normalizeModelTags(item.tags),
        accessMode: normalizeAccessMode(item.accessMode),
        persistToServer: Boolean(item.persistToServer ?? true),
      }),
    )
    modelConfigs.value = normalized
    streamEnabledByModelId.value = normalized.reduce<Record<string, boolean>>((acc, item) => {
      acc[item.id] = streamEnabledByModelId.value[item.id] ?? true
      return acc
    }, {})
    activeModelConfigId.value = normalized.some((item) => item.id === activeId)
      ? activeId
      : normalized[0]!.id
    storeActiveModelConfigId(activeModelConfigId.value)
    const editingTarget =
      normalized.find((item) => item.id === editingConfigId.value) ?? normalized[0]!
    editingConfigId.value = editingTarget.id
    syncEditingConfig(editingTarget)
  }

  watch(
    activeModelConfigId,
    (value) => {
      if (!value) {
        return
      }
      streamEnabled.value = streamEnabledByModelId.value[value] ?? true
    },
    { immediate: true },
  )

  watch(streamEnabled, (value) => {
    const currentId = activeModelConfigId.value
    if (!currentId) {
      return
    }
    streamEnabledByModelId.value = {
      ...streamEnabledByModelId.value,
      [currentId]: value,
    }
  })

  async function loadCapabilities() {
    const current = activeModelConfig.value
    if (!current.model) {
      capabilities.value = { supportsStreaming: true, supportsReasoning: false }
      return
    }

    capabilities.value = await getCapabilities(current.provider, current.model)
  }

  async function loadModelConfigs() {
    const [serverResponse, localConfigs] = await Promise.all([getModelConfigs(), listLocalModelConfigs()])
    const mergedConfigs = [
      ...serverResponse.configs.map((item) => ({ ...item, persistToServer: true })),
      ...localConfigs.map((item) => ({ ...item, persistToServer: false })),
    ]
    const storedActiveId = getStoredActiveModelConfigId()
    const resolvedActiveId = mergedConfigs.some((item) => item.id === storedActiveId)
      ? storedActiveId
      : mergedConfigs.some((item) => item.id === serverResponse.activeModelConfigId)
        ? serverResponse.activeModelConfigId
        : mergedConfigs[0]?.id || options.createModelConfig().id
    applyModelConfigs(mergedConfigs, resolvedActiveId)
  }

  async function persistModelConfigs(
    nextConfigs: AIModelConfigItem[],
    nextActiveModelId: string,
    successMessage: string,
  ) {
    const payload = nextConfigs.length
      ? nextConfigs.map((item, index) => ({
          ...item,
          name: item.name.trim() || `模型配置 ${index + 1}`,
          baseUrl: item.baseUrl.trim(),
          apiKey: item.apiKey.trim(),
          description: item.description.trim(),
          tags: options.normalizeModelTags(item.tags),
          accessMode: normalizeAccessMode(item.accessMode),
          persistToServer: Boolean(item.persistToServer),
        }))
      : [options.createModelConfig()]

    const activeId = payload.some((item) => item.id === nextActiveModelId)
      ? nextActiveModelId
      : payload[0]!.id

    const serverPayload = payload.filter((item) => item.persistToServer)
    const localPayload = payload.filter((item) => !item.persistToServer)
    const currentServerResponse = await getModelConfigs()
    const currentLocalIds = new Set((await listLocalModelConfigs()).map((item) => item.id))
    const nextLocalIds = new Set(localPayload.map((item) => item.id))

    if (serverPayload.length || currentServerResponse.configs.length) {
      const serverActiveId = serverPayload.some((item) => item.id === activeId)
        ? activeId
        : serverPayload[0]?.id || ''
      await saveModelConfigs(serverPayload, serverActiveId)
    }

    for (const config of localPayload) {
      await putLocalModelConfig({
        ...config,
        persistToServer: false,
      })
    }
    for (const configId of currentLocalIds) {
      if (!nextLocalIds.has(configId)) {
        await deleteLocalModelConfig(configId)
      }
    }

    await loadModelConfigs()
    await loadCapabilities()
    await options.onSyncCurrentSessionMeta()
    MessagePlugin.success(successMessage)
  }

  function syncMobileModelDraft(source?: Partial<AIModelConfigItem> | null) {
    const provider: ProviderType = 'openai'
    const fallback = options.createModelConfig(provider)
    mobileModelDraft.id = String(source?.id || fallback.id)
    mobileModelDraft.name = String(source?.name || '')
    mobileModelDraft.provider = provider
    mobileModelDraft.accessMode = normalizeAccessMode(source?.accessMode)
    mobileModelDraft.baseUrl = String(source?.baseUrl || fallback.baseUrl)
    mobileModelDraft.apiKey = String(source?.apiKey || '')
    mobileModelDraft.model = String(source?.model || '')
    mobileModelDraft.description = String(source?.description || '')
    mobileModelDraft.tags = options.normalizeModelTags(source?.tags || fallback.tags)
    mobileModelDraft.persistToServer = Boolean(source?.persistToServer ?? true)
    mobileModelTagsInput.value = mobileModelDraft.tags.join(', ')
    mobileModelDraft.temperature =
      typeof source?.temperature === 'number' || source?.temperature === null
        ? source.temperature
        : fallback.temperature
  }

  function syncDesktopModelDraft(source?: Partial<AIModelConfigItem> | null) {
    const provider: ProviderType = 'openai'
    const fallback = options.createModelConfig(provider)
    desktopModelDraft.id = String(source?.id || fallback.id)
    desktopModelDraft.name = String(source?.name || '')
    desktopModelDraft.provider = provider
    desktopModelDraft.accessMode = normalizeAccessMode(source?.accessMode)
    desktopModelDraft.baseUrl = String(source?.baseUrl || fallback.baseUrl)
    desktopModelDraft.apiKey = String(source?.apiKey || '')
    desktopModelDraft.model = String(source?.model || '')
    desktopModelDraft.description = String(source?.description || '')
    desktopModelDraft.tags = options.normalizeModelTags(source?.tags || fallback.tags)
    desktopModelDraft.persistToServer = Boolean(source?.persistToServer ?? true)
    desktopModelTagsInput.value = desktopModelDraft.tags.join(', ')
    desktopModelDraft.temperature =
      typeof source?.temperature === 'number' || source?.temperature === null
        ? source.temperature
        : fallback.temperature
  }

  function selectEditingConfig(configId: string) {
    commitEditingConfig()
    const target = modelConfigs.value.find((item) => item.id === configId)
    if (!target) {
      return
    }
    editingConfigId.value = target.id
    syncEditingConfig(target)
  }

  function addModelConfig() {
    commitEditingConfig()
    const next = options.createModelConfig('openai', modelConfigs.value.length + 1)
    modelConfigs.value = [...modelConfigs.value, next]
    modelOptionsMap.value = {
      ...modelOptionsMap.value,
      [next.id]: [],
    }
    editingConfigId.value = next.id
    syncEditingConfig(next)
  }

  function removeModelConfig(configId: string) {
    const nextList = modelConfigs.value.filter((item) => item.id !== configId)
    if (!nextList.length) {
      const fallback = options.createModelConfig('openai', 1)
      modelConfigs.value = [fallback]
      activeModelConfigId.value = fallback.id
      editingConfigId.value = fallback.id
      modelOptionsMap.value = { [fallback.id]: [] }
      syncEditingConfig(fallback)
      options.onSyncCurrentSessionMeta().catch(() => {})
      return
    }

    modelConfigs.value = nextList
    if (activeModelConfigId.value === configId) {
      activeModelConfigId.value = nextList[0]!.id
      loadCapabilities().catch(() => {})
      options.onSyncCurrentSessionMeta().catch(() => {})
    }
    if (editingConfigId.value === configId) {
      editingConfigId.value = nextList[0]!.id
      syncEditingConfig(nextList[0]!)
    }

    const nextMap = { ...modelOptionsMap.value }
    delete nextMap[configId]
    modelOptionsMap.value = nextMap
  }

  async function setActiveModel(configId: string) {
    if (activeModelConfigId.value === configId) {
      return
    }
    commitEditingConfig()
    activeModelConfigId.value = configId
    storeActiveModelConfigId(configId)
    await loadCapabilities()
    await options.onSyncCurrentSessionMeta()
  }

  async function setActiveModelAndClose(configId: string) {
    if (activeModelConfigId.value !== configId) {
      await setActiveModel(configId)
    }
    configVisible.value = false
  }

  function setModelStreamEnabled(modelId: string, value: boolean) {
    if (!modelId) {
      return
    }
    streamEnabledByModelId.value = {
      ...streamEnabledByModelId.value,
      [modelId]: value,
    }
    if (activeModelConfigId.value === modelId) {
      streamEnabled.value = value
    }
  }

  function toggleMobileDraftStreamEnabled() {
    const modelId = mobileModelDraft.id
    setModelStreamEnabled(modelId, !mobileDraftStreamEnabled.value)
  }

  function toggleDesktopDraftStreamEnabled() {
    const modelId = desktopModelDraft.id
    setModelStreamEnabled(modelId, !desktopDraftStreamEnabled.value)
  }

  function openConfigDialog() {
    if (!modelConfigs.value.length) {
      addModelConfig()
    } else {
      selectEditingConfig(editingConfigId.value || modelConfigs.value[0]!.id)
    }
    configVisible.value = true
  }

  async function refreshModelsForConfig(config: AIModelConfigItem) {
    loadingModels.value = true
    try {
      const models =
        config.accessMode === 'browser-direct'
          ? {
              models: await fetchBrowserDirectModels(config),
              message: '模型列表已从浏览器直连刷新',
            }
          : await testModelConnection(config)
      modelOptionsMap.value = {
        ...modelOptionsMap.value,
        [config.id]: models.models,
      }
      if (!config.model || !models.models.some((item) => item.id === config.model)) {
        editingConfig.model = models.models[0]?.id ?? ''
      }
      MessagePlugin.success(models.message)
    } finally {
      loadingModels.value = false
    }
  }

  async function refreshEditingModels() {
    await refreshModelsForConfig(editingConfig)
  }

  async function handleTestConnection() {
    testingConnection.value = true
    try {
      await refreshModelsForConfig({
        ...editingConfig,
        name: editingConfig.name.trim() || '未命名配置',
        baseUrl: editingConfig.baseUrl.trim(),
        apiKey: editingConfig.apiKey.trim(),
      })
    } catch (error) {
      MessagePlugin.error(error instanceof Error ? error.message : '连接失败')
    } finally {
      testingConnection.value = false
    }
  }

  function handleProviderChange() {
    const nextProvider: ProviderType = 'openai'
    const defaults = options.defaultModelConfigs[nextProvider]
    editingConfig.provider = nextProvider
    editingConfig.accessMode = normalizeAccessMode(editingConfig.accessMode)
    editingConfig.baseUrl = defaults.baseUrl
    editingConfig.apiKey = ''
    editingConfig.model = ''
    editingConfig.temperature = editingConfig.temperature ?? defaults.temperature
    modelOptionsMap.value = {
      ...modelOptionsMap.value,
      [editingConfig.id]: [],
    }
  }

  async function saveAllModelConfigs() {
    savingConfig.value = true
    try {
      commitEditingConfig()
      const payload = modelConfigs.value.map((item, index) => ({
        ...item,
        name: item.name.trim() || `模型配置 ${index + 1}`,
        baseUrl: item.baseUrl.trim(),
        apiKey: item.apiKey.trim(),
        description: item.description.trim(),
        tags: options.normalizeModelTags(item.tags),
      }))
      const activeId = payload.some((item) => item.id === activeModelConfigId.value)
        ? activeModelConfigId.value
        : payload[0]!.id
      await persistModelConfigs(payload, activeId, '模型配置已保存')
      configVisible.value = false
    } catch (error) {
      MessagePlugin.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      savingConfig.value = false
    }
  }

  async function switchModel(data: { value?: string | number | Record<string, unknown> }) {
    const selectedValue = typeof data.value === 'string' ? data.value : ''
    if (selectedValue === 'setting') {
      openConfigDialog()
      return
    }
    if (!selectedValue || selectedValue === activeModelConfigId.value) {
      return
    }

    try {
      commitEditingConfig()
      activeModelConfigId.value = selectedValue
      storeActiveModelConfigId(selectedValue)
      await loadCapabilities()
      await options.onSyncCurrentSessionMeta()
    } catch (error) {
      MessagePlugin.error(error instanceof Error ? error.message : '切换模型失败')
    }
  }

  function handleMobileModelProviderChange() {
    const nextProvider: ProviderType = 'openai'
    const defaults = options.defaultModelConfigs[nextProvider]
    mobileModelDraft.provider = nextProvider
    mobileModelDraft.accessMode = normalizeAccessMode(mobileModelDraft.accessMode)
    mobileModelDraft.baseUrl = defaults.baseUrl
    mobileModelDraft.apiKey = ''
    mobileModelDraft.model = ''
    mobileModelDraft.temperature = mobileModelDraft.temperature ?? defaults.temperature
    modelOptionsMap.value = {
      ...modelOptionsMap.value,
      [mobileModelDraft.id]: [],
    }
  }

  function handleDesktopModelProviderChange() {
    const nextProvider: ProviderType = 'openai'
    const defaults = options.defaultModelConfigs[nextProvider]
    desktopModelDraft.provider = nextProvider
    desktopModelDraft.accessMode = normalizeAccessMode(desktopModelDraft.accessMode)
    desktopModelDraft.baseUrl = defaults.baseUrl
    desktopModelDraft.apiKey = ''
    desktopModelDraft.model = ''
    desktopModelDraft.temperature = desktopModelDraft.temperature ?? defaults.temperature
    modelOptionsMap.value = {
      ...modelOptionsMap.value,
      [desktopModelDraft.id]: [],
    }
  }

  async function refreshMobileModelOptions() {
    await refreshModelsForConfig(mobileModelDraft)
  }

  async function refreshDesktopModelOptions() {
    await refreshModelsForConfig(desktopModelDraft)
  }

  async function handleMobileModelTestConnection() {
    testingConnection.value = true
    try {
      await refreshModelsForConfig({
        ...mobileModelDraft,
        name: mobileModelDraft.name.trim() || '未命名配置',
        baseUrl: mobileModelDraft.baseUrl.trim(),
        apiKey: mobileModelDraft.apiKey.trim(),
      })
    } catch (error) {
      MessagePlugin.error(error instanceof Error ? error.message : '连接失败')
    } finally {
      testingConnection.value = false
    }
  }

  async function handleDesktopModelTestConnection() {
    testingConnection.value = true
    try {
      await refreshModelsForConfig({
        ...desktopModelDraft,
        name: desktopModelDraft.name.trim() || '未命名配置',
        baseUrl: desktopModelDraft.baseUrl.trim(),
        apiKey: desktopModelDraft.apiKey.trim(),
      })
    } catch (error) {
      MessagePlugin.error(error instanceof Error ? error.message : '连接失败')
    } finally {
      testingConnection.value = false
    }
  }

  function openMobileModelCreateDialog() {
    mobileModelEditorMode.value = 'create'
    editingMobileModelId.value = ''
    syncMobileModelDraft(options.createModelConfig('openai', modelConfigs.value.length + 1))
    mobileModelEditorVisible.value = true
  }

  function openMobileModelEditDialog(configId: string) {
    const target = modelConfigs.value.find((item) => item.id === configId)
    if (!target) {
      return
    }
    mobileModelEditorMode.value = 'edit'
    editingMobileModelId.value = configId
    syncMobileModelDraft(target)
    modelOptionsMap.value = {
      ...modelOptionsMap.value,
      [target.id]: modelOptionsMap.value[target.id] || [],
    }
    mobileModelEditorVisible.value = true
  }

  function openDesktopModelCreateDialog() {
    desktopModelEditorMode.value = 'create'
    editingDesktopModelId.value = ''
    syncDesktopModelDraft(options.createModelConfig('openai', modelConfigs.value.length + 1))
    desktopModelEditorVisible.value = true
  }

  function openDesktopModelEditDialog(configId: string) {
    const target = modelConfigs.value.find((item) => item.id === configId)
    if (!target) {
      return
    }
    desktopModelEditorMode.value = 'edit'
    editingDesktopModelId.value = configId
    syncDesktopModelDraft(target)
    modelOptionsMap.value = {
      ...modelOptionsMap.value,
      [target.id]: modelOptionsMap.value[target.id] || [],
    }
    desktopModelEditorVisible.value = true
  }

  async function saveMobileModel() {
    savingMobileModel.value = true
    try {
      const nextConfig: AIModelConfigItem = {
        ...mobileModelDraft,
        name: mobileModelDraft.name.trim(),
        baseUrl: mobileModelDraft.baseUrl.trim(),
        apiKey: mobileModelDraft.apiKey.trim(),
        description: mobileModelDraft.description.trim(),
        tags: options.normalizeModelTags(mobileModelTagsInput.value),
        accessMode: normalizeAccessMode(mobileModelDraft.accessMode),
        persistToServer: Boolean(mobileModelDraft.persistToServer),
      }
      const nextConfigs =
        mobileModelEditorMode.value === 'edit'
          ? modelConfigs.value.map((item) =>
              item.id === editingMobileModelId.value ? nextConfig : item,
            )
          : [...modelConfigs.value, nextConfig]

      await persistModelConfigs(
        nextConfigs,
        nextConfig.id,
        mobileModelEditorMode.value === 'edit' ? '模型配置已更新' : '模型配置已新增',
      )
      mobileModelEditorVisible.value = false
    } catch (error) {
      MessagePlugin.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      savingMobileModel.value = false
    }
  }

  async function removeMobileModel(configId: string) {
    savingMobileModel.value = true
    try {
      const nextConfigs = modelConfigs.value.filter((item) => item.id !== configId)
      const nextActiveModelId =
        activeModelConfigId.value === configId
          ? nextConfigs[0]?.id || options.createModelConfig().id
          : activeModelConfigId.value
      await persistModelConfigs(nextConfigs, nextActiveModelId, '模型配置已删除')
    } catch (error) {
      MessagePlugin.error(error instanceof Error ? error.message : '删除模型配置失败')
    } finally {
      savingMobileModel.value = false
    }
  }

  function handleMobileModelCardAction(
    configId: string,
    action?: string | number | Record<string, unknown>,
  ) {
    const nextAction = String(action || '')
    if (nextAction === 'edit') {
      openMobileModelEditDialog(configId)
      return
    }
    if (nextAction === 'delete') {
      void removeMobileModel(configId)
    }
  }

  async function saveDesktopModel() {
    savingDesktopModel.value = true
    try {
      const nextConfig: AIModelConfigItem = {
        ...desktopModelDraft,
        name: desktopModelDraft.name.trim(),
        baseUrl: desktopModelDraft.baseUrl.trim(),
        apiKey: desktopModelDraft.apiKey.trim(),
        description: desktopModelDraft.description.trim(),
        tags: options.normalizeModelTags(desktopModelTagsInput.value),
        accessMode: normalizeAccessMode(desktopModelDraft.accessMode),
        persistToServer: Boolean(desktopModelDraft.persistToServer),
      }
      const nextConfigs =
        desktopModelEditorMode.value === 'edit'
          ? modelConfigs.value.map((item) =>
              item.id === editingDesktopModelId.value ? nextConfig : item,
            )
          : [...modelConfigs.value, nextConfig]

      await persistModelConfigs(
        nextConfigs,
        nextConfig.id,
        desktopModelEditorMode.value === 'edit' ? '模型配置已更新' : '模型配置已新增',
      )
      desktopModelEditorVisible.value = false
      configVisible.value = false
    } catch (error) {
      MessagePlugin.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      savingDesktopModel.value = false
    }
  }

  async function removeDesktopModel(configId: string) {
    savingDesktopModel.value = true
    try {
      const nextConfigs = modelConfigs.value.filter((item) => item.id !== configId)
      const nextActiveModelId =
        activeModelConfigId.value === configId
          ? nextConfigs[0]?.id || options.createModelConfig().id
          : activeModelConfigId.value
      await persistModelConfigs(nextConfigs, nextActiveModelId, '模型配置已删除')
    } catch (error) {
      MessagePlugin.error(error instanceof Error ? error.message : '删除模型配置失败')
    } finally {
      savingDesktopModel.value = false
    }
  }

  function handleDesktopModelCardAction(
    configId: string,
    action?: string | number | Record<string, unknown>,
  ) {
    const nextAction = String(action || '')
    if (nextAction === 'edit') {
      openDesktopModelEditDialog(configId)
      return
    }
    if (nextAction === 'delete') {
      void removeDesktopModel(configId)
    }
  }

  return {
    configVisible,
    mobileModelEditorVisible,
    desktopModelEditorVisible,
    savingConfig,
    savingMobileModel,
    savingDesktopModel,
    loadingModels,
    testingConnection,
    mobileModelEditorMode,
    editingMobileModelId,
    desktopModelEditorMode,
    editingDesktopModelId,
    editingConfigId,
    activeModelConfigId,
    streamEnabled,
    thinkingEnabled,
    capabilities,
    modelConfigs,
    modelOptionsMap,
    editingConfig,
    mobileModelDraft,
    desktopModelDraft,
    mobileModelTagsInput,
    desktopModelTagsInput,
    activeModelConfig,
    currentModelLabel,
    showStreamToggle,
    showThinkingToggle,
    effectiveStream,
    effectiveThinking,
    mobileDraftStreamEnabled,
    desktopDraftStreamEnabled,
    toggleMobileDraftStreamEnabled,
    toggleDesktopDraftStreamEnabled,
    editingModelOptions,
    temperatureValue,
    mobileModelTemperatureValue,
    desktopModelTemperatureValue,
    applyModelConfigs,
    loadModelConfigs,
    loadCapabilities,
    switchModel,
    openConfigDialog,
    refreshEditingModels,
    handleTestConnection,
    handleProviderChange,
    saveAllModelConfigs,
    openMobileModelCreateDialog,
    openMobileModelEditDialog,
    openDesktopModelCreateDialog,
    openDesktopModelEditDialog,
    handleMobileModelProviderChange,
    handleDesktopModelProviderChange,
    refreshMobileModelOptions,
    refreshDesktopModelOptions,
    handleMobileModelTestConnection,
    handleDesktopModelTestConnection,
    handleMobileModelCardAction,
    handleDesktopModelCardAction,
    saveMobileModel,
    saveDesktopModel,
    removeMobileModel,
    removeDesktopModel,
    selectEditingConfig,
    setActiveModel,
    setActiveModelAndClose,
    removeModelConfig,
    addModelConfig,
  }
}
  function normalizeAccessMode(value?: string): ModelAccessMode {
    return value === 'browser-direct' ? 'browser-direct' : 'server'
  }
