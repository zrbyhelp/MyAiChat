<template>
  <div class="mess-list">
    <SessionHistoryPanel
      :current-robot-label="currentRobotLabel"
      :current-model-label="currentModelLabel"
      :session-history="sessionHistory"
      :session-id="sessionId"
      :deleting-session-id="deletingSessionId"
      :batch-deleting-session-ids="batchDeletingSessionIds"
      :history-selection-mode="historySelectionMode"
      :selected-session-ids="selectedSessionIds"
      @new-chat="handleNewChatEntry"
      @go-robots="handleGoToRobotPage"
      @open-session="openHistorySession"
      @delete-session="handleDeleteSession"
      @toggle-history-selection-mode="toggleHistorySelectionMode"
      @toggle-session-selection="toggleSessionSelection"
      @batch-delete-sessions="handleBatchDeleteSessions"
    />
  </div>

  <div
    class="chat-container"
    :class="{
      'mobile-chat-input-expanded': isMobile && mobileSenderExpanded,
      'mobile-chat-input-collapsed': isMobile && !mobileSenderExpanded,
    }"
  >
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
        class="chatbot-instance"
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
                    :disabled="Boolean(submittedForms[slot.formId]) || isChatInteractionLocked"
                  />
                  <TRadioGroup
                    v-else-if="field.type === 'radio'"
                    v-model="draft[field.name] as string | number | boolean"
                    :disabled="Boolean(submittedForms[slot.formId]) || isChatInteractionLocked"
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
                    :disabled="Boolean(submittedForms[slot.formId]) || isChatInteractionLocked"
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
                    :disabled="Boolean(submittedForms[slot.formId]) || isChatInteractionLocked"
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
              :disabled="Boolean(submittedForms[slot.formId]) || isChatInteractionLocked"
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
              <span class="footer-button-label footer-model-label">{{ currentModelLabel }}</span>
            </TButton>
          </TSpace>
        </template>
      </t-chatbot>
    </div>
  </div>

  <div
    v-if="isMobile"
    class="mobile-sender-toggle"
    :class="{
      'is-expanded': mobileSenderExpanded,
      'is-collapsed': !mobileSenderExpanded,
    }"
  >
    <TButton shape="round" variant="outline" @click="toggleMobileSenderExpanded">
      {{ mobileSenderExpanded ? '收回' : '展开' }}
    </TButton>
  </div>

  <TDrawer
    v-model:visible="sidebarDrawerVisible"
    header="会话列表"
    placement="left"
    size="320px"
    :footer="false"
  >
    <SessionHistoryPanel
      :current-robot-label="currentRobotLabel"
      :current-model-label="currentModelLabel"
      :session-history="sessionHistory"
      :session-id="sessionId"
      :deleting-session-id="deletingSessionId"
      :batch-deleting-session-ids="batchDeletingSessionIds"
      :history-selection-mode="historySelectionMode"
      :selected-session-ids="selectedSessionIds"
      @new-chat="handleNewChatEntry"
      @go-robots="handleGoToRobotPage"
      @open-session="openHistorySession"
      @delete-session="handleDeleteSession"
      @toggle-history-selection-mode="toggleHistorySelectionMode"
      @toggle-session-selection="toggleSessionSelection"
      @batch-delete-sessions="handleBatchDeleteSessions"
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
    @import-agent-template="importRobotTemplate"
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
    :aux-model-options="auxModelOptions"
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
import SessionHistoryPanel from '@/components/chat/SessionHistoryPanel.vue'
import { putLocalSession } from '@/lib/local-db'
import { useAuth } from '@clerk/vue'
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'

import { useChatbotRuntime } from '@/hooks/chat-view/useChatbotRuntime'
import { useChatInteractionGuard } from '@/hooks/chat-view/useChatInteractionGuard'
import { useChatViewBootstrap } from '@/hooks/chat-view/useChatViewBootstrap'
import { useChatMessagePipeline } from '@/hooks/chat-view/useChatMessagePipeline'
import { useChatInitializer } from '@/hooks/chat-view/useChatInitializer'
import { useChatModelManager } from '@/hooks/chat-view/useChatModelManager'
import { serializeChatMessages } from '@/hooks/chat-view/useChatView.message-utils'
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
import type { ChatSessionDetail } from '@/types/ai'
import { useChatSession } from '@/hooks/useChatSession'
import { useTokenStatisticAnimation } from '@/hooks/useTokenStatisticAnimation'

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

const activePrimaryTab = computed<'agent' | 'discover' | 'mine'>(() => 'agent')

const chatbotRef = ref<ChatbotInstance | null>(null)
const chatInstanceKey = ref(0)
const isChatResponding = ref(false)
const mobileSenderExpanded = ref(false)
const {
  isInteractionLocked: isChatInteractionLocked,
  beginInteractionLock,
  endInteractionLock,
  sendPrompt,
} = useChatInteractionGuard({
  chatbotRef,
  isChatResponding,
})
const {
  pendingChatMessages,
  pendingAssistantSuggestions,
  pendingAssistantForm,
  pendingAssistantMemoryStatus,
  currentAssistantLoadingText,
  currentMemoryStatusText,
  chatMessages,
  rawChatMessages,
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
  isInteractionLocked: isChatInteractionLocked,
  sendPrompt,
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
  loadModelConfigs,
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
  importRobotTemplate,
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
  batchDeletingSessionIds,
  historySelectionMode,
  selectedSessionIds,
  createSessionId,
  getStoredActiveSessionId,
  storeActiveSessionId,
  refreshSessionHistory,
  loadSessionRecord,
  toggleHistorySelectionMode: toggleHistorySelectionModeState,
  toggleSessionSelection: toggleSessionSelectionState,
  openHistorySession: openHistorySessionRecord,
  handleDeleteSession: handleDeleteSessionRecord,
  handleBatchDeleteSessions: handleBatchDeleteSessionsRecord,
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
  currentStructuredMemory,
  currentUsage,
  currentNumericState,
  applySessionMemory,
  applyStructuredMemory,
  applyMemorySchema,
  applySessionUsage,
  applyNumericState,
  openMemoryDialog,
  openSessionRobotDialog,
  applySessionRobot,
  applySessionMemorySettings,
} = useChatSessionStateManager({
  cloneNumericComputationItems,
  validateNumericComputationItems,
  onSyncCurrentSessionMeta: syncCurrentSessionMeta,
})
const auxModelOptions = computed(() => [
  {
    label: '未单独配置，默认跟随正文模型',
    value: '',
  },
  ...modelConfigs.value.map((item) => ({
    label: item.model ? `${item.name} / ${item.model}` : item.name,
    value: item.id,
  })),
])
function buildCurrentSessionDetail(): ChatSessionDetail {
  const serializedMessages = serializeChatMessages(rawChatMessages.value)
  const createdAt =
    serializedMessages[0]?.createdAt ||
    sessionHistory.value.find((item) => item.id === sessionId.value)?.createdAt ||
    new Date().toISOString()
  const updatedAt = serializedMessages[serializedMessages.length - 1]?.createdAt || new Date().toISOString()
  return {
    id: sessionId.value,
    title:
      sessionHistory.value.find((item) => item.id === sessionId.value)?.title ||
      (serializedMessages.find((item) => item.role === 'user')?.content
        ? serializedMessages.find((item) => item.role === 'user')!.content.slice(0, 24)
        : '新对话'),
    preview: serializedMessages[serializedMessages.length - 1]?.content || '',
    createdAt,
    updatedAt,
    persistToServer: currentSessionMemory.persistToServer,
    robotName: sessionRobot.name || '当前智能体',
    modelConfigId: activeModelConfig.value.id,
    modelLabel: currentModelLabel.value,
    usage: {
      promptTokens: currentUsage.promptTokens,
      completionTokens: currentUsage.completionTokens,
    },
    threadId: sessionId.value,
    robot: {
      name: sessionRobot.name,
      avatar: sessionRobot.avatar,
      commonPrompt: sessionRobot.commonPrompt,
      systemPrompt: sessionRobot.systemPrompt,
      memoryModelConfigId: sessionRobot.memoryModelConfigId,
      numericComputationModelConfigId: sessionRobot.numericComputationModelConfigId,
      formOptionModelConfigId: sessionRobot.formOptionModelConfigId,
      numericComputationEnabled: sessionRobot.numericComputationEnabled,
      numericComputationPrompt: sessionRobot.numericComputationPrompt,
      numericComputationItems: cloneNumericComputationItems(sessionRobot.numericComputationItems),
      structuredMemoryInterval: sessionRobot.structuredMemoryInterval,
      structuredMemoryHistoryLimit: sessionRobot.structuredMemoryHistoryLimit,
    },
    messages: serializedMessages,
    memory: {
      ...currentSessionMemory,
      persistToServer: currentSessionMemory.persistToServer,
    },
    memorySchema: {
      categories: currentMemorySchema.categories,
    },
    structuredMemory: {
      updatedAt: currentStructuredMemory.updatedAt,
      categories: currentStructuredMemory.categories,
    },
    numericState: currentNumericState.value,
  }
}

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
  loadSessionRecord,
  buildCurrentSessionDetail,
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
  applyNumericState,
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
  toggleHistorySelectionMode,
  toggleSessionSelection,
  handleBatchDeleteSessions,
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
  onToggleHistorySelectionMode: toggleHistorySelectionModeState,
  onToggleSessionSelection: toggleSessionSelectionState,
  onBatchDeleteSessions: handleBatchDeleteSessionsRecord,
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
  loadModelConfigs,
  loadCapabilities,
  loadRobotTemplates,
  refreshSessionHistory,
  openSessionById: openHistorySessionRecord,
  createNewChat: () => createNewChat(),
})
useTokenStatisticAnimation(sessionPromptTokens, sessionCompletionTokens)
const chatSenderProps = computed(() => ({
  loading: isChatResponding.value || isChatInteractionLocked.value,
  style: isMobile.value
    ? {
        position: 'fixed',
        left: '12px',
        width: 'calc(100vw - 24px)',
        maxWidth: 'calc(100vw - 24px)',
        bottom: mobileSenderExpanded.value
          ? 'calc(76px + env(safe-area-inset-bottom))'
          : 'calc(8px + env(safe-area-inset-bottom))',
        zIndex: mobileSenderExpanded.value ? '12' : '10',
        opacity: mobileSenderExpanded.value ? '1' : '0',
        pointerEvents: mobileSenderExpanded.value ? 'auto' : 'none',
        transition: 'bottom 0.24s ease, opacity 0.2s ease',
      }
    : {
        marginBottom: '12px',
      },
}))
function toggleMobileSenderExpanded() {
  mobileSenderExpanded.value = !mobileSenderExpanded.value
}

useChatbotRuntime({
  chatbotRef,
  isChatResponding,
  pendingChatMessages,
  applyChatMessages,
})
const chatbotRuntimeKey = computed(() => `${chatInstanceKey.value}`)
const { chatMessageProps, agentCardActionOptions, modelCardActionOptions } =
  useChatViewPresentation({
    isInteractionLocked: isChatInteractionLocked,
    sendPrompt,
    assistantAvatar: computed(() => sessionRobot.avatar),
  })

function finalizeChatResponse(options?: { refreshSession?: boolean }) {
  isChatResponding.value = false
  endInteractionLock()
  currentAssistantLoadingText.value = ''
  currentMemoryStatusText.value = ''
  pendingAssistantMemoryStatus.value = null
  flushPendingAssistantStructuredContent()
  applyChatMessages(chatMessages.value)
  if (options?.refreshSession) {
    refreshCurrentSessionState().catch(() => {})
    refreshSessionHistory().catch(() => {})
  } else {
    putLocalSession(buildCurrentSessionDetail())
      .then(() => refreshSessionHistory())
      .catch(() => {})
  }
}
const { chatServiceConfig } = useChatStreaming({
  beginInteractionLock,
  sessionId,
  activeModelConfig,
  currentModelLabel,
  modelConfigs,
  sessionRobot,
  currentSessionMemory,
  currentMemorySchema,
  currentStructuredMemory,
  currentNumericState,
  rawChatMessages,
  effectiveStream,
  effectiveThinking,
  cloneNumericComputationItems,
  applyNumericState,
  applySessionUsage,
  applyStructuredMemory,
  serializeChatMessages,
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
  initDebug,
  routeName: () => String(route.name || ''),
})
</script>
