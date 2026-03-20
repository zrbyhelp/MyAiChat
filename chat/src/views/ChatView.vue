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
      <TButton class="mobile-sidebar-trigger" shape="circle" variant="outline" @click="sidebarDrawerVisible = true">
        <template #icon>
          <MenuIcon />
        </template>
      </TButton>
      <div class="chat-container">
        <div class="chatbot-header">
          <div class="chatbot-header-left">
            <div class="token-stats" title="当前会话真实 Token 统计">
              <TStatistic
                class="token-stat-card token-stat-card-prompt"
                prefix="↑"
                :value="sessionPromptTokens"
                :animation="promptTokenAnimation"
                :animation-start="promptTokenAnimationStart"
              />
              <TStatistic
                class="token-stat-card token-stat-card-completion"
                prefix="↓"
                :value="sessionCompletionTokens"
                :animation="completionTokenAnimation"
                :animation-start="completionTokenAnimationStart"
              />
            </div>
          </div>
          <TSpace align="center" size="small">
            <TButton shape="circle" variant="text" @click="openMemoryDialog">
              <template #icon>
                <svg class="memory-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M9 4.5a3.5 3.5 0 0 0-3.28 4.73A3.75 3.75 0 0 0 4 12.5c0 1.34.7 2.52 1.75 3.18v1.07A2.25 2.25 0 0 0 8 19h1v1.25a.75.75 0 0 0 1.5 0V19h3v1.25a.75.75 0 0 0 1.5 0V19h1a2.25 2.25 0 0 0 2.25-2.25v-1.07A3.74 3.74 0 0 0 20 12.5a3.75 3.75 0 0 0-1.72-3.27A3.5 3.5 0 0 0 12 6.3 3.5 3.5 0 0 0 9 4.5Zm0 1.5c.97 0 1.82.63 2.13 1.54a.75.75 0 0 0 1.43 0A2.25 2.25 0 0 1 16.75 9a.75.75 0 0 0 .55.86 2.25 2.25 0 0 1 .45 4.18.75.75 0 0 0-.37.65v2.06a.75.75 0 0 1-.75.75H8a.75.75 0 0 1-.75-.75V14.7a.75.75 0 0 0-.37-.65 2.25 2.25 0 0 1 .45-4.18A.75.75 0 0 0 7.88 9 2.25 2.25 0 0 1 9 6Z"
                    fill="currentColor" />
                </svg>
              </template>
            </TButton>
            <TButton shape="circle" variant="text" @click="openSessionRobotDialog">
              <template #icon>
                <SettingIcon />
              </template>
            </TButton>
          </TSpace>
        </div>
        <div class="chatbot">
        <t-chatbot :key="chatbotRuntimeKey" ref="chatbotRef" layout="both" :message-props="chatMessageProps"
          :chat-service-config="chatServiceConfig" :is-stream-load="effectiveStream"
          :on-message-change="handleChatMessageChange" @messageChange="handleChatMessageChange"
          class="chatbot-instance">
          <template v-for="slot in formActivitySlots" :key="slot.slotName" #[slot.slotName]>
            <div class="chat-form-card">
              <div class="chat-form-title">{{ slot.schema.title || '请补充信息' }}</div>
              <div v-if="slot.schema.description" class="chat-form-desc">{{ slot.schema.description }}</div>
              <template v-for="(draft, draftIndex) in [getFormDraft(slot.formId, slot.schema)]" :key="`${slot.formId}-draft-${draftIndex}`">
                <TForm label-align="top">
                  <TFormItem v-for="field in slot.schema.fields" :key="field.name" :label="field.label">
                    <TInput v-if="field.type === 'input'" v-model="draft[field.name] as string | number"
                      :type="field.inputType === 'number' ? 'number' : 'text'" :placeholder="field.placeholder || ''"
                      :disabled="Boolean(submittedForms[slot.formId]) || isChatResponding" />
                    <TRadioGroup v-else-if="field.type === 'radio'" v-model="draft[field.name] as string | number | boolean"
                      :disabled="Boolean(submittedForms[slot.formId]) || isChatResponding">
                      <TRadio v-for="option in field.options || []" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </TRadio>
                    </TRadioGroup>
                    <TCheckboxGroup v-else-if="field.type === 'checkbox'" v-model="draft[field.name] as (string | number | boolean)[]"
                      :disabled="Boolean(submittedForms[slot.formId]) || isChatResponding">
                      <TCheckbox v-for="option in field.options || []" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </TCheckbox>
                    </TCheckboxGroup>
                    <TSelect v-else-if="field.type === 'select'" v-model="draft[field.name] as string | number | (string | number)[]"
                      :multiple="Boolean(field.multiple)" :disabled="Boolean(submittedForms[slot.formId]) || isChatResponding"
                      :options="(field.options || []).map((option) => ({ label: option.label, value: option.value }))"
                      :placeholder="field.placeholder || ''" />
                  </TFormItem>
                </TForm>
              </template>
              <TButton theme="primary" :disabled="Boolean(submittedForms[slot.formId]) || isChatResponding" @click="submitChatForm(slot)">
                {{ submittedForms[slot.formId] ? '已提交' : slot.schema.submitText || '提交' }}
              </TButton>
            </div>
          </template>
          <template #sender-footer-prefix>
            <TSpace align="center" size="small" class="sender-footer-actions">
              <TButton v-if="showStreamToggle" shape="round" variant="outline"
                :theme="effectiveStream ? 'primary' : 'default'" @click="switchStream">
                <template #icon>
                  <OrderIcon />
                </template>
                <span class="footer-button-label">流式传输</span>
              </TButton>
              <TButton v-if="showThinkingToggle" shape="round" variant="outline"
                :theme="effectiveThinking ? 'primary' : 'default'" @click="switchThinking">
                <template #icon>
                  <LightbulbIcon />
                </template>
                <span class="footer-button-label">思考</span>
              </TButton>
              <TDropdown :options="modelDropdownOptions" trigger="click" @click="switchModel">
                <TButton shape="round" variant="outline" :disabled="!modelConfigs.length">
                  <template #icon>
                    <AiEducationIcon />
                  </template>
                  <span class="footer-button-label footer-model-label">{{ currentModelLabel }}</span>
                </TButton>
              </TDropdown>
            </TSpace>
          </template>
        </t-chatbot>
        </div>
      </div>
    </template>
    <PlaceholderPane v-else :title="activePrimaryTab === 'discover' ? '发现' : '我的'" />
  </div>

  <TDrawer v-model:visible="sidebarDrawerVisible" header="会话列表" placement="left" size="280px" :footer="false">
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

  <component :is="isMobile ? TDrawer : TDialog" v-model:visible="newChatVisible" :header="isMobile ? false : '选择机器人'"
    v-bind="isMobile ? mobileOverlayProps : { width: '560px', confirmBtn: { content: '开始新聊天' } }"
    @confirm="confirmStartNewChat">
    <div class="mobile-overlay-body">
      <div v-if="isMobile" class="mobile-overlay-topbar">
        <div class="mobile-overlay-title">选择机器人</div>
        <TButton variant="text" @click="newChatVisible = false">关闭</TButton>
      </div>
      <div v-if="robotTemplates.length" class="robot-picker-list">
        <div v-for="item in robotTemplates" :key="item.id" class="robot-picker-item"
          :class="{ active: item.id === selectedNewChatRobotId }" @click="selectedNewChatRobotId = item.id">
          <div class="robot-picker-avatar">
            <img v-if="item.avatar" :src="item.avatar" alt="" />
            <span v-else>{{ (item.name || '机').slice(0, 1) }}</span>
          </div>
          <div class="robot-picker-name">{{ item.name || '未命名机器人' }}</div>
          <div class="robot-picker-desc">{{ item.description || '暂无简介' }}</div>
        </div>
      </div>
      <div v-else class="history-empty">
        暂无机器人卡片，请先去“设置机器人”里维护
      </div>
      <div v-if="isMobile" class="mobile-overlay-actions">
        <TButton block theme="primary" @click="confirmStartNewChat">开始新聊天</TButton>
      </div>
    </div>
  </component>

  <component :is="isMobile ? TDrawer : TDialog" v-model:visible="configVisible" :header="isMobile ? false : '模型配置'"
    v-bind="isMobile ? mobileOverlayProps : { width: '900px', confirmBtn: { content: '保存全部配置', loading: savingConfig } }"
    @confirm="saveAllModelConfigs">
    <div class="mobile-overlay-body">
      <div v-if="isMobile" class="mobile-overlay-topbar">
        <div class="mobile-overlay-title">模型配置</div>
        <TButton variant="text" @click="configVisible = false">关闭</TButton>
      </div>
      <div class="config-layout" :class="{ mobile: isMobile }">
        <div class="config-list">
          <div class="config-list-header">
            <span class="config-title">已配置模型</span>
          </div>
          <div v-if="modelConfigs.length" class="config-list-body">
            <div v-for="item in modelConfigs" :key="item.id" class="config-card"
              :class="{ active: item.id === editingConfigId }" @click="selectEditingConfig(item.id)">
              <div class="config-card-head">
                <span class="config-card-name">{{ item.name || '未命名配置' }}</span>
                <span v-if="item.id === activeModelConfigId" class="config-badge">当前使用</span>
              </div>
              <div class="config-card-meta">{{ item.provider }} / {{ item.model || '未选择模型' }}</div>
              <div class="config-card-meta">{{ item.baseUrl || '未填写地址' }}</div>
              <TSpace align="center" size="small">
                <TButton variant="text" size="small" @click.stop="setActiveModel(item.id)">设为当前</TButton>
                <TButton variant="text" size="small" theme="danger" @click.stop="removeModelConfig(item.id)">删除</TButton>
              </TSpace>
            </div>
          </div>
          <div v-else class="config-empty">暂无模型配置</div>
          <TButton block variant="outline" @click="addModelConfig">增加模型</TButton>
        </div>

        <div class="config-editor">
          <div class="config-title">配置详情</div>
          <TForm label-align="top">
            <TFormItem label="配置名称">
              <TInput v-model="editingConfig.name" placeholder="例如：DeepSeek 生产环境 / 本地 Ollama" />
            </TFormItem>
            <TFormItem label="接入方式">
              <TSelect v-model="editingConfig.provider" :options="providerOptions" @change="handleProviderChange" />
            </TFormItem>
            <TFormItem label="Base URL">
              <TInput v-model="editingConfig.baseUrl" placeholder="请输入 AI 服务地址" />
            </TFormItem>
            <TFormItem v-if="editingConfig.provider === 'openai'" label="API Key">
              <TInput v-model="editingConfig.apiKey" type="password" placeholder="请输入 OpenAI API Key" />
            </TFormItem>
            <TFormItem label="模型">
              <TSpace align="center" class="config-model-row">
                <TSelect v-model="editingConfig.model" class="config-model-select" :loading="loadingModels"
                  :options="editingModelOptions" placeholder="请选择模型" />
                <TButton variant="outline" @click="refreshEditingModels">刷新模型</TButton>
              </TSpace>
            </TFormItem>
            <TFormItem label="Temperature">
              <TInputNumber v-model="temperatureValue" :decimal-places="1" :step="0.1" :min="0" :max="2" />
            </TFormItem>
            <TSpace align="center" class="config-test-row">
              <TButton variant="outline" :loading="testingConnection" @click="handleTestConnection">测试连接</TButton>
              <span class="dialog-tip">测试成功后会更新当前配置的模型候选列表</span>
            </TSpace>
          </TForm>
        </div>
      </div>
      <div v-if="isMobile" class="mobile-overlay-actions">
        <TButton block theme="primary" :loading="savingConfig" @click="saveAllModelConfigs">保存全部配置</TButton>
      </div>
    </div>
  </component>

  <component :is="isMobile ? TDrawer : TDialog" v-model:visible="sessionRobotVisible" :header="isMobile ? false : '编辑当前机器人'"
    v-bind="isMobile ? mobileOverlayProps : { width: '560px', confirmBtn: { content: '应用到当前上下文' } }"
    @confirm="applySessionRobot">
    <div class="mobile-overlay-body">
      <div v-if="isMobile" class="mobile-overlay-topbar">
        <div class="mobile-overlay-title">编辑当前机器人</div>
        <TButton variant="text" @click="sessionRobotVisible = false">关闭</TButton>
      </div>
      <div class="session-robot-shell">
        <div class="session-robot-hero">
          <div class="session-robot-avatar">
            <img v-if="sessionRobotDraft.avatar" :src="sessionRobotDraft.avatar" alt="" />
            <span v-else>{{ (sessionRobotDraft.name || '机').slice(0, 1) }}</span>
          </div>
          <div class="session-robot-hero-text">
            <div class="session-robot-hero-title">{{ sessionRobotDraft.name || '当前机器人' }}</div>
            <div class="session-robot-hero-subtitle">修改后仅作用于当前会话上下文</div>
          </div>
        </div>
        <div class="session-robot-form-card">
          <TForm label-align="top">
            <TFormItem label="名称">
              <TInput v-model="sessionRobotDraft.name" placeholder="例如：销售顾问 / 数据分析师" />
            </TFormItem>
            <TFormItem label="头像">
              <TInput v-model="sessionRobotDraft.avatar" placeholder="请输入头像图片 URL" />
            </TFormItem>
            <TFormItem label="System Prompt">
              <TTextarea v-model="sessionRobotDraft.systemPrompt" :autosize="{ minRows: 5, maxRows: 8 }" />
            </TFormItem>
          </TForm>
        </div>
      </div>
      <div v-if="isMobile" class="mobile-overlay-actions">
        <TButton block theme="primary" @click="applySessionRobot">应用到当前上下文</TButton>
      </div>
    </div>
  </component>

  <component :is="isMobile ? TDrawer : TDialog" v-model:visible="memoryVisible" :header="isMobile ? false : '会话记忆'"
    v-bind="isMobile ? mobileOverlayProps : { width: '640px', confirmBtn: { content: '保存记忆配置', loading: savingMemory } }"
    @confirm="saveSessionMemoryConfig">
    <div class="mobile-overlay-body">
      <div v-if="isMobile" class="mobile-overlay-topbar">
        <div class="mobile-overlay-title">会话记忆</div>
        <TButton variant="text" @click="memoryVisible = false">关闭</TButton>
      </div>
      <TForm label-align="top">
        <TFormItem label="压缩阈值">
          <TInputNumber v-model="memoryDraft.threshold" :min="1" :step="1" />
        </TFormItem>
        <TFormItem label="最近原始消息保留条数">
          <TInputNumber v-model="memoryDraft.recentMessageLimit" :min="1" :step="1" />
        </TFormItem>
        <TFormItem label="长期记忆摘要">
          <TTextarea v-model="memoryDraft.summary" :autosize="{ minRows: 8, maxRows: 14 }" />
        </TFormItem>
        <div class="memory-meta">
          <div>最近更新时间：{{ memoryUpdatedLabel }}</div>
          <div>已覆盖消息数：{{ currentMemory.sourceMessageCount }}</div>
        </div>
        <TSpace align="center" size="small" class="memory-action-row">
          <TButton theme="danger" variant="outline" :loading="clearingMemory" @click="clearCurrentSessionMemory">清空记忆</TButton>
        </TSpace>
      </TForm>
      <div v-if="isMobile" class="mobile-overlay-actions">
        <TButton block theme="primary" :loading="savingMemory" @click="saveSessionMemoryConfig">保存记忆配置</TButton>
      </div>
    </div>
  </component>
</template>

<script setup lang="ts">
import {
  Button as TButton,
  Checkbox as TCheckbox,
  CheckboxGroup as TCheckboxGroup,
  Dialog as TDialog,
  Drawer as TDrawer,
  Dropdown as TDropdown,
  Form as TForm,
  FormItem as TFormItem,
  Input as TInput,
  InputNumber as TInputNumber,
  Radio as TRadio,
  RadioGroup as TRadioGroup,
  Select as TSelect,
  Space as TSpace,
  Statistic as TStatistic,
  Textarea as TTextarea,
} from 'tdesign-vue-next'
import {
  AiEducationIcon,
  LightbulbIcon,
  MenuIcon,
  OrderIcon,
  SettingIcon,
} from 'tdesign-icons-vue-next'

import PlaceholderPane from '@/components/chat/PlaceholderPane.vue'
import PrimaryNav from '@/components/chat/PrimaryNav.vue'
import SessionHistoryPanel from '@/components/chat/SessionHistoryPanel.vue'
import { useChatView } from '@/hooks/useChatView'

const {
  activePrimaryTab,
  sidebarDrawerVisible,
  newChatVisible,
  configVisible,
  sessionRobotVisible,
  memoryVisible,
  savingConfig,
  loadingModels,
  testingConnection,
  savingMemory,
  clearingMemory,
  chatbotRef,
  chatbotRuntimeKey,
  sessionId,
  sessionHistory,
  deletingSessionId,
  robotTemplates,
  selectedNewChatRobotId,
  submittedForms,
  isChatResponding,
  modelConfigs,
  editingConfigId,
  activeModelConfigId,
  editingConfig,
  sessionRobotDraft,
  memoryDraft,
  mobileOverlayProps,
  currentRobotLabel,
  currentModelLabel,
  sessionPromptTokens,
  sessionCompletionTokens,
  promptTokenAnimation,
  promptTokenAnimationStart,
  completionTokenAnimation,
  completionTokenAnimationStart,
  effectiveStream,
  effectiveThinking,
  showStreamToggle,
  showThinkingToggle,
  formActivitySlots,
  modelDropdownOptions,
  editingModelOptions,
  temperatureValue,
  memoryUpdatedLabel,
  currentMemory,
  providerOptions,
  chatMessageProps,
  chatServiceConfig,
  handleChatMessageChange,
  getFormDraft,
  submitChatForm,
  switchStream,
  switchThinking,
  switchModel,
  refreshEditingModels,
  handleTestConnection,
  handleProviderChange,
  saveAllModelConfigs,
  selectEditingConfig,
  setActiveModel,
  removeModelConfig,
  addModelConfig,
  openSessionRobotDialog,
  applySessionRobot,
  openMemoryDialog,
  saveSessionMemoryConfig,
  clearCurrentSessionMemory,
  confirmStartNewChat,
  handleNewChatEntry,
  handleGoToRobotPage,
  openHistorySession,
  handleDeleteSession,
  isMobile,
} = useChatView()
</script>

<style src="./ChatView.css"></style>
