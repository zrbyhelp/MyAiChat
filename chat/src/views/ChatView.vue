<template>
  <div class="main">
    <PrimaryNav v-model="activePrimaryTab" />
    <template v-if="activePrimaryTab === 'agent'">
      <div class="mess-list">
        <SessionHistoryPanel
          :current-robot-label="currentRobotLabel"
          :current-model-label="currentModelLabel"
          :session-history="sessionHistory"
          :session-id="sessionId"
          :deleting-session-id="deletingSessionId"
          @new-chat="handleNewChatEntry"
          @go-robots="handleGoToRobotPage"
          @open-session="openHistorySession"
          @delete-session="handleDeleteSession"
        />
      </div>

      <div class="chat-container">
        <div class="chatbot-header">
          <TSpace align="center" size="small">
            <TButton
              class="mobile-sidebar-trigger"
              shape="circle"
              variant="outline"
              @click="sidebarDrawerVisible = true"
            >
              <template #icon>
                <MenuIcon />
              </template>
            </TButton>
            <TButton shape="circle" variant="outline" @click="openMemoryDialog">
              <template #icon>
                <svg class="memory-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M9 4.5a3.5 3.5 0 0 0-3.28 4.73A3.75 3.75 0 0 0 4 12.5c0 1.34.7 2.52 1.75 3.18v1.07A2.25 2.25 0 0 0 8 19h1v1.25a.75.75 0 0 0 1.5 0V19h3v1.25a.75.75 0 0 0 1.5 0V19h1a2.25 2.25 0 0 0 2.25-2.25v-1.07A3.74 3.74 0 0 0 20 12.5a3.75 3.75 0 0 0-1.72-3.27A3.5 3.5 0 0 0 12 6.3 3.5 3.5 0 0 0 9 4.5Zm0 1.5c.97 0 1.82.63 2.13 1.54a.75.75 0 0 0 1.43 0A2.25 2.25 0 0 1 16.75 9a.75.75 0 0 0 .55.86 2.25 2.25 0 0 1 .45 4.18.75.75 0 0 0-.37.65v2.06a.75.75 0 0 1-.75.75H8a.75.75 0 0 1-.75-.75V14.7a.75.75 0 0 0-.37-.65 2.25 2.25 0 0 1 .45-4.18A.75.75 0 0 0 7.88 9 2.25 2.25 0 0 1 9 6Z"
                    fill="currentColor"
                  />
                </svg>
              </template>
            </TButton>
            <TButton shape="circle" variant="outline" @click="openSessionRobotDialog">
              <template #icon>
                <SettingIcon />
              </template>
            </TButton>
          </TSpace>
        </div>
        <div class="chatbot">
          <t-chatbot
            :key="chatbotRuntimeKey"
            ref="chatbotRef"
            layout="both"
            :message-props="chatMessageProps"
            :sender-props="chatSenderProps"
            :chat-service-config="chatServiceConfig"
            :is-stream-load="effectiveStream"
            :on-message-change="handleChatMessageChange"
            @messageChange="handleChatMessageChange"
          >
            <template v-for="slot in formActivitySlots" :key="slot.slotName" #[slot.slotName]>
              <div class="chat-form-card">
                <div class="chat-form-title">{{ slot.schema.title || '请补充信息' }}</div>
                <div v-if="slot.schema.description" class="chat-form-desc">
                  {{ slot.schema.description }}
                </div>
                <template
                  v-for="(draft, draftIndex) in [getFormDraft(slot.formId, slot.schema)]"
                  :key="`${slot.formId}-draft-${draftIndex}`"
                >
                  <TForm label-align="top">
                    <TFormItem
                      v-for="field in slot.schema.fields"
                      :key="field.name"
                      :label="field.label"
                    >
                      <TInput
                        v-if="field.type === 'input'"
                        v-model="draft[field.name] as string | number"
                        :type="field.inputType === 'number' ? 'number' : 'text'"
                        :placeholder="field.placeholder || ''"
                        :disabled="Boolean(submittedForms[slot.formId]) || isChatResponding"
                      />
                      <TRadioGroup
                        v-else-if="field.type === 'radio'"
                        v-model="draft[field.name] as string | number | boolean"
                        :disabled="Boolean(submittedForms[slot.formId]) || isChatResponding"
                      >
                        <TRadio
                          v-for="option in field.options || []"
                          :key="option.value"
                          :value="option.value"
                        >
                          {{ option.label }}
                        </TRadio>
                      </TRadioGroup>
                      <TCheckboxGroup
                        v-else-if="field.type === 'checkbox'"
                        v-model="draft[field.name] as (string | number | boolean)[]"
                        :disabled="Boolean(submittedForms[slot.formId]) || isChatResponding"
                      >
                        <TCheckbox
                          v-for="option in field.options || []"
                          :key="option.value"
                          :value="option.value"
                        >
                          {{ option.label }}
                        </TCheckbox>
                      </TCheckboxGroup>
                      <TSelect
                        v-else-if="field.type === 'select'"
                        v-model="draft[field.name] as string | number | (string | number)[]"
                        :multiple="Boolean(field.multiple)"
                        :disabled="Boolean(submittedForms[slot.formId]) || isChatResponding"
                        :options="
                          (field.options || []).map((option) => ({
                            label: option.label,
                            value: option.value,
                          }))
                        "
                        :placeholder="field.placeholder || ''"
                      />
                    </TFormItem>
                  </TForm>
                </template>
                <TButton
                  theme="primary"
                  :disabled="Boolean(submittedForms[slot.formId]) || isChatResponding"
                  @click="submitChatForm(slot)"
                >
                  {{ submittedForms[slot.formId] ? '已提交' : slot.schema.submitText || '提交' }}
                </TButton>
              </div>
            </template>
            <template v-for="slot in loadingActivitySlots" :key="slot.slotName" #[slot.slotName]>
              <div class="chat-loading-card" aria-label="loading">
                <span class="chat-loading-text">{{ slot.text }}</span>
                <span class="chat-loading-dot"></span>
                <span class="chat-loading-dot"></span>
                <span class="chat-loading-dot"></span>
              </div>
            </template>
            <template #sender-footer-prefix>
              <TSpace align="center" size="small" class="sender-footer-actions">
                <TButton
                  v-if="showThinkingToggle"
                  shape="round"
                  variant="outline"
                  :theme="effectiveThinking ? 'primary' : 'default'"
                  @click="switchThinking"
                >
                  <template #icon>
                    <LightbulbIcon />
                  </template>
                  <span class="footer-button-label">思考</span>
                </TButton>
                <TButton shape="round" variant="outline" @click="openConfigDialog">
                  <template #icon>
                    <SettingIcon />
                  </template>
                  <span class="footer-button-label footer-model-label">{{
                    currentModelLabel
                  }}</span>
                </TButton>
              </TSpace>
            </template>
          </t-chatbot>
        </div>
      </div>
    </template>
    <PlaceholderPane v-else :title="activePrimaryTab === 'discover' ? '发现' : '我的'" />
  </div>

  <TDrawer
    v-model:visible="sidebarDrawerVisible"
    header="会话列表"
    placement="left"
    size="280px"
    :footer="false"
  >
    <SessionHistoryPanel
      :current-robot-label="currentRobotLabel"
      :current-model-label="currentModelLabel"
      :session-history="sessionHistory"
      :session-id="sessionId"
      :deleting-session-id="deletingSessionId"
      @new-chat="handleNewChatEntry"
      @go-robots="handleGoToRobotPage"
      @open-session="openHistorySession"
      @delete-session="handleDeleteSession"
    />
  </TDrawer>

  <ChatAgentPanels
    :is-mobile="isMobile"
    v-model:new-chat-visible="newChatVisible"
    v-model:agent-manage-visible="agentManageVisible"
    v-model:mobile-agent-editor-visible="mobileAgentEditorVisible"
    v-model:selected-new-chat-robot-id="selectedNewChatRobotId"
    :robot-templates="robotTemplates"
    :is-editing-agent-draft="isEditingAgentDraft"
    :agent-editor-step="agentEditorStep"
    :mobile-agent-draft="mobileAgentDraft"
    :saving-mobile-agent="savingMobileAgent"
    :agent-card-action-options="agentCardActionOptions"
    @confirm-start-new-chat="confirmStartNewChat"
    @open-mobile-agent-edit-dialog="openMobileAgentEditDialog"
    @handle-agent-card-action="handleAgentCardAction"
    @open-mobile-agent-create-dialog="openMobileAgentCreateDialog"
    @add-agent-template="addAgentTemplate"
    @next-agent-editor-step="nextAgentEditorStep"
    @previous-agent-editor-step="previousAgentEditorStep"
    @skip-agent-structure-setup="skipAgentStructureSetup"
    @save-mobile-agent="saveMobileAgent"
    @remove-numeric-computation-item="removeNumericComputationItem"
    @add-numeric-computation-item="addNumericComputationItem"
  />

  <ChatModelDomain
    :is-mobile="isMobile"
    v-model:config-visible="configVisible"
    v-model:mobile-model-editor-visible="mobileModelEditorVisible"
    v-model:desktop-model-editor-visible="desktopModelEditorVisible"
    :mobile-model-editor-mode="mobileModelEditorMode"
    :desktop-model-editor-mode="desktopModelEditorMode"
    :model-configs="modelConfigs"
    :active-model-config-id="activeModelConfigId"
    :model-card-action-options="modelCardActionOptions"
    :mobile-model-draft="mobileModelDraft"
    :desktop-model-draft="desktopModelDraft"
    :provider-options="providerOptions"
    :model-options-map="modelOptionsMap"
    :mobile-model-temperature-value="mobileModelTemperatureValue"
    :desktop-model-temperature-value="desktopModelTemperatureValue"
    :mobile-model-tags-input="mobileModelTagsInput"
    :desktop-model-tags-input="desktopModelTagsInput"
    :saving-mobile-model="savingMobileModel"
    :saving-desktop-model="savingDesktopModel"
    :loading-models="loadingModels"
    :mobile-draft-stream-enabled="mobileDraftStreamEnabled"
    :desktop-draft-stream-enabled="desktopDraftStreamEnabled"
    @update:mobile-model-tags-input="(value) => (mobileModelTagsInput = value)"
    @update:desktop-model-tags-input="(value) => (desktopModelTagsInput = value)"
    @update:mobile-model-temperature-value="(value) => (mobileModelTemperatureValue = value)"
    @update:desktop-model-temperature-value="(value) => (desktopModelTemperatureValue = value)"
    @set-active-model-and-close="setActiveModelAndClose"
    @open-mobile-model-create-dialog="openMobileModelCreateDialog"
    @open-desktop-model-create-dialog="openDesktopModelCreateDialog"
    @handle-mobile-model-provider-change="handleMobileModelProviderChange"
    @handle-desktop-model-provider-change="handleDesktopModelProviderChange"
    @refresh-mobile-model-options="refreshMobileModelOptions"
    @refresh-desktop-model-options="refreshDesktopModelOptions"
    @handle-mobile-model-card-action="handleMobileModelCardAction"
    @handle-desktop-model-card-action="handleDesktopModelCardAction"
    @save-mobile-model="saveMobileModel"
    @save-desktop-model="saveDesktopModel"
    @toggle-mobile-model-stream="toggleMobileDraftStreamEnabled"
    @toggle-desktop-model-stream="toggleDesktopDraftStreamEnabled"
  />

  <ChatSessionDomain
    :is-mobile="isMobile"
    v-model:session-robot-visible="sessionRobotVisible"
    v-model:memory-visible="memoryVisible"
    :session-robot-draft="sessionRobotDraft"
    :session-memory-draft="sessionMemoryDraft"
    :memory-updated-label="memoryUpdatedLabel"
    :current-memory-schema="currentMemorySchema"
    :structured-memory-record-count="structuredMemoryRecordCount"
    :memory-display-categories="memoryDisplayCategories"
    @apply-session-robot="applySessionRobot"
    @apply-session-memory-settings="applySessionMemorySettings"
    @remove-numeric-computation-item="removeNumericComputationItem"
    @add-numeric-computation-item="addNumericComputationItem"
  />
</template>

<script setup lang="ts">
import {
  Button as TButton,
  Checkbox as TCheckbox,
  CheckboxGroup as TCheckboxGroup,
  Drawer as TDrawer,
  Form as TForm,
  FormItem as TFormItem,
  Input as TInput,
  Radio as TRadio,
  RadioGroup as TRadioGroup,
  Select as TSelect,
  Space as TSpace,
} from 'tdesign-vue-next'
import { LightbulbIcon, MenuIcon, SettingIcon } from 'tdesign-icons-vue-next'

import ChatAgentPanels from '@/components/chat/ChatAgentPanels.vue'
import ChatModelDomain from '@/components/chat/ChatModelDomain.vue'
import ChatSessionDomain from '@/components/chat/ChatSessionDomain.vue'
import PlaceholderPane from '@/components/chat/PlaceholderPane.vue'
import PrimaryNav from '@/components/chat/PrimaryNav.vue'
import SessionHistoryPanel from '@/components/chat/SessionHistoryPanel.vue'
import { useAuth } from '@clerk/vue'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useChatbotRuntime } from '@/hooks/chat-view/useChatbotRuntime'
import { useChatViewBootstrap } from '@/hooks/chat-view/useChatViewBootstrap'
import { useChatMessagePipeline } from '@/hooks/chat-view/useChatMessagePipeline'
import { useChatInitializer } from '@/hooks/chat-view/useChatInitializer'
import { useChatModelManager } from '@/hooks/chat-view/useChatModelManager'
import {
  createModelConfig,
  createNumericComputationItem,
  DEFAULT_MODEL_CONFIGS,
  normalizeModelTags,
  PROVIDER_OPTIONS,
} from '@/hooks/chat-view/useChatViewModelUtils'
import { useChatViewPresentation } from '@/hooks/chat-view/useChatViewPresentation'
import { useChatRobotManager } from '@/hooks/chat-view/useChatRobotManager'
import { useChatSessionLifecycle } from '@/hooks/chat-view/useChatSessionLifecycle'
import { useChatSessionLifecycleDelegate } from '@/hooks/chat-view/useChatSessionLifecycleDelegate'
import { useChatStreaming } from '@/hooks/chat-view/useChatStreaming'
import { useChatViewUiController } from '@/hooks/chat-view/useChatViewUiController'
import {
  DEFAULT_SESSION_MEMORY,
  DEFAULT_SESSION_USAGE,
  DEFAULT_STRUCTURED_MEMORY,
  DEFAULT_MEMORY_SCHEMA,
  DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT,
  DEFAULT_STRUCTURED_MEMORY_INTERVAL,
  normalizeMemorySchema,
  normalizeSessionMessages,
  useChatSessionStateManager,
} from '@/hooks/chat-view/useChatSessionStateManager'
import type { ChatbotInstance } from '@/hooks/chat-view/useChatView.types'
import { useChatSession } from '@/hooks/useChatSession'
import { useTokenStatisticAnimation } from '@/hooks/useTokenStatisticAnimation'

const router = useRouter()
const route = useRoute()
const MOBILE_BREAKPOINT = 768

const providerOptions = PROVIDER_OPTIONS
const {
  bindLifecycle,
  refreshCurrentSessionState,
  syncCurrentSessionMeta,
  hydrateSession,
  createNewChat,
} = useChatSessionLifecycleDelegate()

const activePrimaryTab = computed<'agent' | 'discover' | 'mine'>({
  get: () => {
    if (route.name === 'agent' || route.name === 'mine') {
      return route.name
    }
    return 'discover'
  },
  set: (value) => {
    if (route.name === value) {
      return
    }
    void router.push({ name: value })
  },
})
const chatbotRef = ref<ChatbotInstance | null>(null)
const chatInstanceKey = ref(0)
const isChatResponding = ref(false)
const {
  pendingChatMessages,
  pendingAssistantSuggestions,
  pendingAssistantForm,
  pendingAssistantMemoryStatus,
  currentAssistantLoadingText,
  currentMemoryStatusText,
  chatMessages,
  submittedForms,
  formActivitySlots,
  loadingActivitySlots,
  applyChatMessages,
  flushPendingAssistantMemoryStatus,
  flushPendingAssistantStructuredContent,
  handleChatMessageChange,
  getFormDraft,
  submitChatForm,
} = useChatMessagePipeline({
  chatbotRef,
  isChatResponding,
})
const {
  configVisible,
  mobileModelEditorVisible,
  desktopModelEditorVisible,
  savingMobileModel,
  savingDesktopModel,
  loadingModels,
  mobileModelEditorMode,
  desktopModelEditorMode,
  activeModelConfigId,
  thinkingEnabled,
  modelConfigs,
  modelOptionsMap,
  mobileModelDraft,
  desktopModelDraft,
  mobileModelTagsInput,
  desktopModelTagsInput,
  activeModelConfig,
  currentModelLabel,
  showThinkingToggle,
  effectiveStream,
  effectiveThinking,
  mobileDraftStreamEnabled,
  desktopDraftStreamEnabled,
  toggleMobileDraftStreamEnabled,
  toggleDesktopDraftStreamEnabled,
  mobileModelTemperatureValue,
  desktopModelTemperatureValue,
  applyModelConfigs,
  loadCapabilities,
  openConfigDialog,
  openMobileModelCreateDialog,
  openDesktopModelCreateDialog,
  handleMobileModelProviderChange,
  handleDesktopModelProviderChange,
  refreshMobileModelOptions,
  refreshDesktopModelOptions,
  handleMobileModelCardAction,
  handleDesktopModelCardAction,
  saveMobileModel,
  saveDesktopModel,
  setActiveModelAndClose,
} = useChatModelManager({
  createModelConfig,
  normalizeModelTags,
  defaultModelConfigs: DEFAULT_MODEL_CONFIGS,
  onSyncCurrentSessionMeta: syncCurrentSessionMeta,
})
const {
  agentManageVisible,
  mobileAgentEditorVisible,
  savingMobileAgent,
  robotTemplates,
  selectedNewChatRobotId,
  agentEditorStep,
  mobileAgentDraft,
  selectedNewChatRobot,
  isEditingAgentDraft,
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
  handleAgentCardAction,
  saveMobileAgent,
  skipAgentStructureSetup,
} = useChatRobotManager({
  defaultStructuredMemoryInterval: DEFAULT_STRUCTURED_MEMORY_INTERVAL,
  defaultStructuredMemoryHistoryLimit: DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT,
  defaultMemorySchema: DEFAULT_MEMORY_SCHEMA,
  normalizeMemorySchema,
  createNumericComputationItem,
})
const {
  sessionId,
  sessionHistory,
  deletingSessionId,
  createSessionId,
  getStoredActiveSessionId,
  storeActiveSessionId,
  refreshSessionHistory,
  openHistorySession: openHistorySessionRecord,
  handleDeleteSession: handleDeleteSessionRecord,
} = useChatSession({
  onHydrateSession: hydrateSession,
  onCreateNewChat: () => createNewChat(),
})
const {
  sessionRobotVisible,
  memoryVisible,
  currentSessionMemory,
  currentMemorySchema,
  sessionRobot,
  sessionRobotDraft,
  sessionMemoryDraft,
  currentRobotLabel,
  memoryUpdatedLabel,
  memoryDisplayCategories,
  structuredMemoryRecordCount,
  sessionPromptTokens,
  sessionCompletionTokens,
  applySessionMemory,
  applyStructuredMemory,
  applyMemorySchema,
  applySessionUsage,
  openMemoryDialog,
  openSessionRobotDialog,
  applySessionRobot,
  applySessionMemorySettings,
} = useChatSessionStateManager({
  cloneNumericComputationItems,
  validateNumericComputationItems,
  onSyncCurrentSessionMeta: syncCurrentSessionMeta,
})
const {
  refreshCurrentSessionState: refreshCurrentSessionStateFromLifecycle,
  syncCurrentSessionMeta: syncCurrentSessionMetaFromLifecycle,
  hydrateSession: hydrateSessionFromLifecycle,
  createNewChat: createNewChatFromLifecycle,
} = useChatSessionLifecycle({
  sessionId,
  createSessionId,
  storeActiveSessionId,
  refreshSessionHistory,
  sessionRobot,
  currentSessionMemory,
  currentMemorySchema,
  activeModelConfig,
  currentModelLabel,
  activeModelConfigId,
  modelConfigs,
  cloneNumericComputationItems,
  applySessionMemory,
  applyMemorySchema,
  applyStructuredMemory,
  applySessionUsage,
  applyChatMessages,
  loadCapabilities,
  normalizeSessionMessages,
  defaultStructuredMemoryInterval: DEFAULT_STRUCTURED_MEMORY_INTERVAL,
  defaultStructuredMemoryHistoryLimit: DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT,
  defaultMemorySchema: DEFAULT_MEMORY_SCHEMA,
  defaultSessionMemory: DEFAULT_SESSION_MEMORY,
  defaultStructuredMemory: DEFAULT_STRUCTURED_MEMORY,
  defaultSessionUsage: DEFAULT_SESSION_USAGE,
})
bindLifecycle({
  refreshCurrentSessionState: refreshCurrentSessionStateFromLifecycle,
  syncCurrentSessionMeta: syncCurrentSessionMetaFromLifecycle,
  hydrateSession: hydrateSessionFromLifecycle,
  createNewChat: createNewChatFromLifecycle,
})
const {
  isMobile,
  sidebarDrawerVisible,
  newChatVisible,
  confirmStartNewChat,
  handleNewChatEntry,
  handleGoToRobotPage,
  switchThinking,
  openHistorySession,
  handleDeleteSession,
  syncViewportMode,
} = useChatViewUiController({
  mobileBreakpoint: MOBILE_BREAKPOINT,
  robotTemplates,
  selectedNewChatRobotId,
  selectedNewChatRobot,
  showThinkingToggle,
  thinkingEnabled,
  onCreateNewChat: createNewChat,
  onOpenAgentManageDialog: openAgentManageDialog,
  onOpenHistorySession: openHistorySessionRecord,
  onDeleteSession: handleDeleteSessionRecord,
})
const { isLoaded: isAuthLoaded, isSignedIn } = useAuth()

function initDebug(message: string, extra?: Record<string, unknown>) {
  console.debug('[chat-init]', message, extra || {})
}
const { hasInitializedAgent, ensureAgentInitialized } = useChatInitializer({
  routeName: () => String(route.name || ''),
  isAuthLoaded,
  isSignedIn,
  sessionHistory,
  getStoredActiveSessionId,
  initDebug,
  applyModelConfigs,
  loadCapabilities,
  loadRobotTemplates,
  refreshSessionHistory,
  hydrateSession,
  createNewChat: () => createNewChat(),
})
useTokenStatisticAnimation(sessionPromptTokens, sessionCompletionTokens)
const chatSenderProps = computed(() => ({
  loading: isChatResponding.value,
}))
useChatbotRuntime({
  chatbotRef,
  isChatResponding,
  pendingChatMessages,
  applyChatMessages,
})
const chatbotRuntimeKey = computed(() => `${chatInstanceKey.value}`)
const { chatMessageProps, agentCardActionOptions, modelCardActionOptions } =
  useChatViewPresentation({
    chatbotRef,
    isChatResponding,
    assistantAvatar: computed(() => sessionRobot.avatar),
  })

function finalizeChatResponse(options?: { refreshSession?: boolean }) {
  isChatResponding.value = false
  currentAssistantLoadingText.value = ''
  currentMemoryStatusText.value = ''
  pendingAssistantMemoryStatus.value = null
  flushPendingAssistantStructuredContent()
  applyChatMessages(chatMessages.value)
  if (options?.refreshSession) {
    refreshCurrentSessionState().catch(() => {})
    refreshSessionHistory().catch(() => {})
  }
}
const { chatServiceConfig } = useChatStreaming({
  sessionId,
  activeModelConfig,
  currentModelLabel,
  sessionRobot,
  effectiveStream,
  effectiveThinking,
  cloneNumericComputationItems,
  applySessionUsage,
  applyStructuredMemory,
  finalizeChatResponse,
  currentAssistantLoadingText,
  currentMemoryStatusText,
  pendingAssistantSuggestions,
  pendingAssistantForm,
  pendingAssistantMemoryStatus,
  chatMessages,
  applyChatMessages,
  flushPendingAssistantStructuredContent,
  flushPendingAssistantMemoryStatus,
})
useChatViewBootstrap({
  activePrimaryTab,
  isAuthLoaded,
  isSignedIn,
  hasInitializedAgent,
  ensureAgentInitialized,
  syncViewportMode,
  initDebug,
  routeName: () => String(route.name || ''),
})
</script>

<style src="./ChatView.css"></style>
