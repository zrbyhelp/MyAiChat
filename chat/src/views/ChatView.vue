<template>
  <div class="main">
    <div class="mess-list">
      <div class="side-shell">
        <div class="side-action" @click="handleNewChatEntry">新聊天</div>
        <div class="side-action" @click="handleGoToRobotPage">设置机器人</div>
        <div class="side-placeholder">
          <div class="side-meta">当前机器人：{{ currentRobotLabel }}</div>
          <div class="side-meta">当前模型：{{ currentModelLabel }}</div>
        </div>
        <div class="history-title">历史聊天列表</div>
      </div>
      <div class="history-scroll-area">
        <div v-if="sessionHistory.length" class="history-list">
          <div v-for="item in sessionHistory" :key="item.id" class="history-item"
            :class="{ active: item.id === sessionId }" @click="openHistorySession(item.id)">
            <div class="history-item-head">
              <div class="history-item-title">{{ item.title || '新对话' }}</div>
              <TButton variant="text" size="small" theme="danger" class="history-delete-button"
                :loading="deletingSessionId === item.id" @click.stop="handleDeleteSession(item.id)">
                删除
              </TButton>
            </div>
            <div class="history-item-preview">{{ item.preview || item.robotName || '暂无消息' }}</div>
          </div>
        </div>
        <div v-else class="history-empty">
          暂无历史聊天
        </div>
      </div>
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
            <div class="token-stat-item">
              <svg class="token-stat-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 4l6 7h-4v8h-4v-8H6l6-7Z" fill="currentColor" />
              </svg>
              <span>{{ sessionPromptTokens }}</span>
            </div>
            <div class="token-stat-item">
              <svg class="token-stat-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 20l-6-7h4V5h4v8h4l-6 7Z" fill="currentColor" />
              </svg>
              <span>{{ sessionCompletionTokens }}</span>
            </div>
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
              <template v-for="draft in [getFormDraft(slot.formId, slot.schema)]" :key="`${slot.formId}-draft`">
                <TForm label-align="top">
                  <TFormItem v-for="field in slot.schema.fields" :key="field.name" :label="field.label">
                    <TInput v-if="field.type === 'input'" v-model="draft[field.name]"
                      :type="field.inputType === 'number' ? 'number' : 'text'" :placeholder="field.placeholder || ''"
                      :disabled="Boolean(submittedForms[slot.formId]) || isChatResponding" />
                    <TRadioGroup v-else-if="field.type === 'radio'" v-model="draft[field.name]"
                      :disabled="Boolean(submittedForms[slot.formId]) || isChatResponding">
                      <TRadio v-for="option in field.options || []" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </TRadio>
                    </TRadioGroup>
                    <TCheckboxGroup v-else-if="field.type === 'checkbox'" v-model="draft[field.name]"
                      :disabled="Boolean(submittedForms[slot.formId]) || isChatResponding">
                      <TCheckbox v-for="option in field.options || []" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </TCheckbox>
                    </TCheckboxGroup>
                    <TSelect v-else-if="field.type === 'select'" v-model="draft[field.name]"
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
  </div>

  <TDrawer v-model:visible="sidebarDrawerVisible" header="会话列表" placement="left" size="280px" :footer="false">
    <div class="drawer-side">
      <div class="side-shell">
        <div class="side-action" @click="handleNewChatEntry">新聊天</div>
        <div class="side-action" @click="handleGoToRobotPage">设置机器人</div>
        <div class="side-placeholder">
          <div class="side-meta">当前机器人：{{ currentRobotLabel }}</div>
          <div class="side-meta">当前模型：{{ currentModelLabel }}</div>
        </div>
        <div class="history-title">历史聊天列表</div>
      </div>
      <div class="history-scroll-area">
        <div v-if="sessionHistory.length" class="history-list">
          <div v-for="item in sessionHistory" :key="item.id" class="history-item"
            :class="{ active: item.id === sessionId }" @click="openHistorySession(item.id)">
            <div class="history-item-head">
              <div class="history-item-title">{{ item.title || '新对话' }}</div>
              <TButton variant="text" size="small" theme="danger" class="history-delete-button"
                :loading="deletingSessionId === item.id" @click.stop="handleDeleteSession(item.id)">
                删除
              </TButton>
            </div>
            <div class="history-item-preview">{{ item.preview || item.robotName || '暂无消息' }}</div>
          </div>
        </div>
        <div v-else class="history-empty">
          暂无历史聊天
        </div>
      </div>
    </div>
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
import type { AIMessageContent, ChatServiceConfig, SSEChunkData } from '@tdesign-vue-next/chat'
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
  MessagePlugin,
  Radio as TRadio,
  RadioGroup as TRadioGroup,
  Select as TSelect,
  Space as TSpace,
  Textarea as TTextarea,
} from 'tdesign-vue-next'
import { AiEducationIcon, LightbulbIcon, MenuIcon, OrderIcon, SettingIcon } from 'tdesign-icons-vue-next'
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { clearSessionMemory, deleteSession, getCapabilities, getModelConfigs, getRobots, getSession, getSessions, saveModelConfigs, testModelConnection, updateSessionMemory, upsertSession } from '@/lib/api'
import type {
  AIFormField,
  AIFormSchema,
  AIModelConfigItem,
  AIRobotCard,
  ChatSessionDetail,
  ChatSessionSummary,
  ModelCapabilities,
  ModelOption,
  ProviderType,
  SessionMemoryState,
  SessionUsageState,
  SessionRobotState,
  SuggestionOption,
} from '@/types/ai'

type ChatbotInstance = {
  registerMergeStrategy?: (type: string, handler: (chunk: any, existing?: any) => any) => void
  setMessages?: (messages: any[], mode?: 'replace' | 'prepend' | 'append') => void
  clearMessages?: () => void
  sendUserMessage?: (params: { prompt?: string }) => Promise<void>
}

type NormalizedStreamPayload = {
  type?: 'text' | 'reasoning' | 'reasoning_done' | 'suggestion' | 'form' | 'memory_status' | 'usage' | 'done' | 'error'
  text?: string
  message?: string
  items?: SuggestionOption[]
  form?: AIFormSchema | null
  status?: 'running' | 'success' | 'error'
  promptTokens?: number
  completionTokens?: number
}

type ChatFormSlot = {
  slotName: string
  formId: string
  schema: AIFormSchema
}

type FormActivityContent = {
  type: 'activity-form'
  slotName: string
  data: {
    activityType: 'form'
    content: AIFormSchema
  }
}

type ModelDropdownItem = {
  content: string
  value: string
  divider?: boolean
}

type MemoryStatusState = {
  status: 'running' | 'success' | 'error'
  text: string
}

const router = useRouter()
const ACTIVE_SESSION_STORAGE_KEY = 'myaichat.active-session-id'
const DEFAULT_SESSION_MEMORY: SessionMemoryState = {
  summary: '',
  updatedAt: '',
  sourceMessageCount: 0,
  threshold: 20,
  recentMessageLimit: 10,
}
const DEFAULT_SESSION_USAGE: SessionUsageState = {
  promptTokens: 0,
  completionTokens: 0,
}
const MOBILE_BREAKPOINT = 768

const DEFAULT_MODEL_CONFIGS: Record<ProviderType, Omit<AIModelConfigItem, 'id' | 'name' | 'model'>> = {
  ollama: {
    provider: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    apiKey: '',
    temperature: 0.7,
  },
  openai: {
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    apiKey: '',
    temperature: 0.7,
  },
}

function createSessionId() {
  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createModelConfig(provider: ProviderType = 'ollama', index = 1): AIModelConfigItem {
  return {
    id: `model-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: `模型配置 ${index}`,
    ...DEFAULT_MODEL_CONFIGS[provider],
    model: '',
  }
}

function getStoredActiveSessionId() {
  return typeof window !== 'undefined' ? window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY) || '' : ''
}

function storeActiveSessionId(value: string) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, value)
  }
}

function normalizeSessionMemory(memory?: Partial<SessionMemoryState> | null): SessionMemoryState {
  return {
    summary: typeof memory?.summary === 'string' ? memory.summary : '',
    updatedAt: typeof memory?.updatedAt === 'string' ? memory.updatedAt : '',
    sourceMessageCount: typeof memory?.sourceMessageCount === 'number' ? memory.sourceMessageCount : 0,
    threshold: typeof memory?.threshold === 'number' && memory.threshold > 0 ? Math.round(memory.threshold) : DEFAULT_SESSION_MEMORY.threshold,
    recentMessageLimit:
      typeof memory?.recentMessageLimit === 'number' && memory.recentMessageLimit > 0
        ? Math.round(memory.recentMessageLimit)
        : DEFAULT_SESSION_MEMORY.recentMessageLimit,
  }
}

function normalizeSessionMessages(session: ChatSessionDetail) {
  return session.messages.map((item, index) => {
    if (item.role === 'user') {
      return {
        id: `${session.id}-user-${index}`,
        role: 'user',
        name: '',
        datetime: item.createdAt,
        content: [
          {
            type: 'text',
            data: item.content,
          },
        ],
      }
    }

    const content = []
    if (item.reasoning) {
      content.push({
        type: 'thinking',
        status: 'complete',
        data: {
          title: '深度思考已完成',
          text: item.reasoning,
        },
      })
    }
    if (item.content) {
      content.push({
        type: 'markdown',
        data: item.content,
      })
    }
    if (item.suggestions?.length) {
      content.push({
        type: 'suggestion',
        data: item.suggestions.map((suggestion) => ({
          title: suggestion.title,
          prompt: suggestion.prompt,
        })),
      })
    }
    if (item.form?.fields?.length) {
      content.push(createFormActivityContent(item.form, `activity-form-${session.id}-${index}`))
    }

    return {
      id: `${session.id}-assistant-${index}`,
      role: 'assistant',
      name: '',
      avatar: session.robot.avatar || '',
      datetime: item.createdAt,
      content,
    }
  })
}

function createFormActivityContent(schema: AIFormSchema, slotName = `activity-form-${Date.now()}-${Math.random().toString(16).slice(2)}`): FormActivityContent {
  return {
    type: 'activity-form',
    slotName,
    data: {
      activityType: 'form',
      content: schema,
    },
  }
}

function createMemoryStatusContent(status: 'running' | 'success' | 'error', text: string): MemoryStatusState {
  return {
    status,
    text,
  }
}

function buildMemoryStatusMarkdown(status: 'running' | 'success' | 'error', text: string) {
  const statusLabel = status === 'running' ? '整理中' : status === 'success' ? '已更新' : '失败'
  return `<!--memory-status:${status}-->\n> **长期记忆 ${statusLabel}**  \n> ${text}`
}

function createSuggestionContent(items: SuggestionOption[]) {
  return {
    type: 'suggestion',
    data: items.map((item) => ({
      title: item.title,
      prompt: item.prompt,
    })),
  }
}

function normalizeSessionUsage(usage?: Partial<SessionUsageState> | null): SessionUsageState {
  return {
    promptTokens: typeof usage?.promptTokens === 'number' ? usage.promptTokens : 0,
    completionTokens: typeof usage?.completionTokens === 'number' ? usage.completionTokens : 0,
  }
}

function createInitialFormValues(schema: AIFormSchema) {
  return schema.fields.reduce<Record<string, any>>((result, field) => {
    if (Array.isArray(field.defaultValue)) {
      result[field.name] = [...field.defaultValue]
    } else if (typeof field.defaultValue === 'string') {
      result[field.name] = field.defaultValue
    } else if (field.type === 'checkbox' || (field.type === 'select' && field.multiple)) {
      result[field.name] = []
    } else {
      result[field.name] = ''
    }
    return result
  }, {})
}

function getFormDraft(formId: string, schema: AIFormSchema) {
  if (!formDrafts[formId]) {
    formDrafts[formId] = createInitialFormValues(schema)
  }
  return formDrafts[formId]
}

function getFormFieldLabel(field: AIFormField, value: any) {
  if (Array.isArray(value)) {
    const labels = value
      .map((item) => field.options?.find((option) => option.value === item)?.label || String(item))
      .filter(Boolean)
    return labels.join('、')
  }

  if (typeof value === 'string' && field.options?.length) {
    return field.options.find((option) => option.value === value)?.label || value
  }

  return String(value ?? '')
}

function buildFormPrompt(schema: AIFormSchema, values: Record<string, any>) {
  const lines = [schema.title ? `已填写表单《${schema.title}》` : '已填写表单']
  schema.fields.forEach((field) => {
    const value = values[field.name]
    if (Array.isArray(value) ? value.length : value !== '' && value !== null && value !== undefined) {
      lines.push(`${field.label}：${getFormFieldLabel(field, value)}`)
    }
  })
  return lines.join('\n')
}

const providerOptions = [
  { label: 'Ollama', value: 'ollama' },
  { label: 'OpenAI', value: 'openai' },
]

const isMobile = ref(false)
const sidebarDrawerVisible = ref(false)
const newChatVisible = ref(false)
const configVisible = ref(false)
const sessionRobotVisible = ref(false)
const memoryVisible = ref(false)
const savingConfig = ref(false)
const loadingModels = ref(false)
const testingConnection = ref(false)
const savingMemory = ref(false)
const clearingMemory = ref(false)
const chatbotRef = ref<ChatbotInstance | null>(null)
const chatInstanceKey = ref(0)
const sessionId = ref(createSessionId())
const sessionHistory = ref<ChatSessionSummary[]>([])
const deletingSessionId = ref('')
const robotTemplates = ref<AIRobotCard[]>([])
const selectedNewChatRobotId = ref('')
const pendingChatMessages = ref<any[] | null>(null)
const pendingAssistantSuggestions = ref<SuggestionOption[] | null>(null)
const pendingAssistantForm = ref<AIFormSchema | null>(null)
const chatMessages = ref<any[]>([])
const pendingAssistantMemoryStatus = ref<MemoryStatusState | null>(null)
const streamEnabled = ref(true)
const thinkingEnabled = ref(false)
const isChatResponding = ref(false)
const editingConfigId = ref('')
const activeModelConfigId = ref('')
const capabilities = ref<ModelCapabilities>({
  supportsStreaming: true,
  supportsReasoning: false,
})
const modelConfigs = ref<AIModelConfigItem[]>([])
const modelOptionsMap = ref<Record<string, ModelOption[]>>({})
const formDrafts = reactive<Record<string, Record<string, any>>>({})
const submittedForms = reactive<Record<string, boolean>>({})

const editingConfig = reactive<AIModelConfigItem>(createModelConfig())
const currentMemory = reactive<SessionMemoryState>({ ...DEFAULT_SESSION_MEMORY })
const currentUsage = reactive<SessionUsageState>({ ...DEFAULT_SESSION_USAGE })
const memoryDraft = reactive<SessionMemoryState>({ ...DEFAULT_SESSION_MEMORY })
const sessionRobot = reactive<SessionRobotState>({
  name: '当前机器人',
  avatar: '',
  systemPrompt: '',
})
const sessionRobotDraft = reactive<SessionRobotState>({
  name: '',
  avatar: '',
  systemPrompt: '',
})

const activeModelConfig = computed(
  () => modelConfigs.value.find((item) => item.id === activeModelConfigId.value) ?? modelConfigs.value[0] ?? createModelConfig(),
)
const currentRobotLabel = computed(() => sessionRobot.name.trim() || '当前机器人')
const currentModelLabel = computed(() => activeModelConfig.value.name || activeModelConfig.value.model || '选择模型')
const selectedNewChatRobot = computed(() => robotTemplates.value.find((item) => item.id === selectedNewChatRobotId.value) ?? null)
const memoryUpdatedLabel = computed(() => currentMemory.updatedAt ? new Date(currentMemory.updatedAt).toLocaleString() : '未生成')
const sessionPromptTokens = computed(() => currentUsage.promptTokens)
const sessionCompletionTokens = computed(() => currentUsage.completionTokens)
const mobileOverlayProps = computed(() => ({
  placement: 'bottom' as const,
  size: '100%',
  footer: false,
}))

const suggestionActionHandlers = {
  suggestion: async ({ content }: { content?: SuggestionOption }) => {
    if (isChatResponding.value) {
      MessagePlugin.warning('请等待当前回复结束后再操作')
      return
    }
    const prompt = content?.prompt?.trim() || content?.title?.trim() || ''
    if (!prompt) {
      return
    }
    await chatbotRef.value?.sendUserMessage?.({ prompt })
  },
}

function chatMessageProps(message: { role?: string; avatar?: string; name?: string }) {
  if (message.role === 'assistant') {
    return {
      name: '',
      avatar: message.avatar || sessionRobot.avatar || undefined,
      variant: 'outline',
      handleActions: suggestionActionHandlers,
    }
  }

  if (message.role === 'user') {
    return {
      name: '',
      variant: 'outline',
      handleActions: suggestionActionHandlers,
    }
  }

  return {
    name: '',
    variant: 'outline',
    handleActions: suggestionActionHandlers,
  }
}
const showStreamToggle = computed(() => capabilities.value.supportsStreaming)
const showThinkingToggle = computed(() => capabilities.value.supportsReasoning)
const effectiveStream = computed(() => showStreamToggle.value && streamEnabled.value)
const effectiveThinking = computed(() => showThinkingToggle.value && thinkingEnabled.value)
const chatbotRuntimeKey = computed(() => `${chatInstanceKey.value}`)
const formActivitySlots = computed<ChatFormSlot[]>(() => {
  const slots: ChatFormSlot[] = []
  chatMessages.value.forEach((message) => {
    if (!Array.isArray(message?.content)) {
      return
    }
    message.content.forEach((content: any, index: number) => {
      if (content?.type !== 'activity-form' || !content?.data?.content?.fields?.length) {
        return
      }
      const activitySlotName = content.slotName || `activity-form-${index}`
      slots.push({
        slotName: `${message.id}-${activitySlotName}`,
        formId: `${message.id}-${activitySlotName}`,
        schema: content.data.content as AIFormSchema,
      })
    })
  })
  return slots
})
const modelDropdownOptions = computed<ModelDropdownItem[]>(() => [
  ...modelConfigs.value.map((item, index) => ({
    content: item.name || item.model || '未命名配置',
    value: item.id,
    divider: index === modelConfigs.value.length - 1,
  })),
  { content: '配置', value: 'setting' },
])
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

function applySessionMemory(memory?: Partial<SessionMemoryState> | null) {
  const normalized = normalizeSessionMemory(memory)
  currentMemory.summary = normalized.summary
  currentMemory.updatedAt = normalized.updatedAt
  currentMemory.sourceMessageCount = normalized.sourceMessageCount
  currentMemory.threshold = normalized.threshold
  currentMemory.recentMessageLimit = normalized.recentMessageLimit
}

function applySessionUsage(usage?: Partial<SessionUsageState> | null) {
  const normalized = normalizeSessionUsage(usage)
  currentUsage.promptTokens = normalized.promptTokens
  currentUsage.completionTokens = normalized.completionTokens
}

watch(
  capabilities,
  (value) => {
    if (!value.supportsStreaming) {
      streamEnabled.value = false
    }
    if (!value.supportsReasoning) {
      thinkingEnabled.value = false
    }
  },
  { deep: true, immediate: true },
)

watch(chatbotRef, (instance) => {
  if (!instance?.registerMergeStrategy) {
    return
  }

  instance.registerMergeStrategy('markdown', (chunk, existing) => ({
    ...chunk,
    data: `${existing?.data ?? ''}${chunk.data ?? ''}`,
  }))

  instance.registerMergeStrategy('thinking', (chunk, existing) => ({
    ...chunk,
    data: {
      ...existing?.data,
      ...chunk?.data,
      text: `${existing?.data?.text ?? ''}${chunk?.data?.text ?? ''}`,
    },
  }))

  if (pendingChatMessages.value !== null) {
    applyChatMessages(pendingChatMessages.value)
  }
})

function applyChatMessages(messages: any[]) {
  pendingChatMessages.value = messages
  chatMessages.value = messages
  initializeFormDrafts(messages)
  const instance = chatbotRef.value
  if (!instance) {
    return
  }
  if (!messages.length) {
    instance.clearMessages?.()
  } else {
    instance.setMessages?.(messages, 'replace')
  }
  pendingChatMessages.value = null
}

function injectAssistantMemoryStatus(messages: any[], status: 'running' | 'success' | 'error', text: string) {
  const nextMessages = messages.map((message) => ({
    ...message,
    content: Array.isArray(message?.content) ? [...message.content] : [],
  }))
  const targetMessage = [...nextMessages].reverse().find((message) => message?.role === 'assistant' && Array.isArray(message?.content))
  if (!targetMessage) {
    return null
  }

  const withoutMemoryStatus = targetMessage.content.filter((content: any) => {
    return !(content?.type === 'markdown' && typeof content?.data === 'string' && content.data.includes('<!--memory-status:'))
  })
  const insertionIndex = withoutMemoryStatus.findIndex((content: any) => {
    return content?.type === 'suggestion' || content?.type === 'activity-form'
  })
  const memoryStatusContent = {
    type: 'markdown',
    data: buildMemoryStatusMarkdown(status, text),
  }

  if (insertionIndex === -1) {
    withoutMemoryStatus.push(memoryStatusContent)
  } else {
    withoutMemoryStatus.splice(insertionIndex, 0, memoryStatusContent)
  }

  targetMessage.content = withoutMemoryStatus
  return nextMessages
}

function flushPendingAssistantMemoryStatus() {
  const pendingStatus = pendingAssistantMemoryStatus.value
  if (!pendingStatus) {
    return
  }

  const nextMessages = injectAssistantMemoryStatus(chatMessages.value, pendingStatus.status, pendingStatus.text)
  if (!nextMessages) {
    return
  }

  pendingAssistantMemoryStatus.value = null
  applyChatMessages(nextMessages)
}

function flushPendingAssistantStructuredContent() {
  if (!pendingAssistantSuggestions.value?.length && !pendingAssistantForm.value?.fields?.length) {
    return
  }

  const nextMessages = chatMessages.value.map((message) => ({
    ...message,
    content: Array.isArray(message?.content) ? [...message.content] : [],
  }))
  const targetMessage = [...nextMessages].reverse().find((message) => message?.role === 'assistant' && Array.isArray(message?.content))
  if (!targetMessage) {
    return
  }

  targetMessage.content = targetMessage.content.filter((content: any) => content?.type !== 'suggestion' && content?.type !== 'activity-form')

  const memoryStatusIndex = targetMessage.content.findIndex((content: any) => {
    return content?.type === 'markdown' && typeof content?.data === 'string' && content.data.includes('<!--memory-status:')
  })
  const insertionIndex = memoryStatusIndex === -1 ? targetMessage.content.length : memoryStatusIndex
  const structuredContent = pendingAssistantSuggestions.value?.length
    ? [createSuggestionContent(pendingAssistantSuggestions.value)]
    : pendingAssistantForm.value?.fields?.length
      ? [createFormActivityContent(pendingAssistantForm.value)]
      : []

  if (structuredContent.length) {
    targetMessage.content.splice(insertionIndex, 0, ...structuredContent)
  }

  pendingAssistantSuggestions.value = null
  pendingAssistantForm.value = null
  applyChatMessages(nextMessages)
}

function initializeFormDrafts(messages: any[]) {
  messages.forEach((message) => {
    if (!Array.isArray(message?.content)) {
      return
    }
    message.content.forEach((content: any, index: number) => {
      if (content?.type !== 'activity-form' || !content?.data?.content?.fields?.length) {
        return
      }
      const activitySlotName = content.slotName || `activity-form-${index}`
      const formId = `${message.id}-${activitySlotName}`
      if (!formDrafts[formId]) {
        formDrafts[formId] = createInitialFormValues(content.data.content as AIFormSchema)
      }
      if (submittedForms[formId] === undefined) {
        submittedForms[formId] = false
      }
    })
  })
}

function handleChatMessageChange(event: CustomEvent<any[]> | any) {
  const messages = Array.isArray(event?.detail) ? event.detail : Array.isArray(event) ? event : []
  chatMessages.value = messages
  initializeFormDrafts(messages)
  if (pendingAssistantSuggestions.value?.length || pendingAssistantForm.value?.fields?.length) {
    nextTick(() => {
      flushPendingAssistantStructuredContent()
    })
  }
  if (pendingAssistantMemoryStatus.value) {
    nextTick(() => {
      flushPendingAssistantMemoryStatus()
    })
  }
}

async function submitChatForm(slot: ChatFormSlot) {
  if (isChatResponding.value) {
    MessagePlugin.warning('请等待当前回复结束后再提交表单')
    return
  }
  const values = formDrafts[slot.formId] || {}

  for (const field of slot.schema.fields) {
    if (!field.required) {
      continue
    }

    const value = values[field.name]
    const isEmpty = Array.isArray(value) ? value.length === 0 : value === '' || value === null || value === undefined
    if (isEmpty) {
      MessagePlugin.warning(`请填写${field.label}`)
      return
    }
  }

  const prompt = buildFormPrompt(slot.schema, values)
  if (!prompt.trim()) {
    MessagePlugin.warning('表单内容不能为空')
    return
  }

  submittedForms[slot.formId] = true
  try {
    await chatbotRef.value?.sendUserMessage?.({ prompt })
  } catch (error) {
    submittedForms[slot.formId] = false
    MessagePlugin.error(error instanceof Error ? error.message : '表单提交失败')
  }
}

async function refreshSessionHistory() {
  const response = await getSessions()
  sessionHistory.value = response.sessions
}

function syncMemoryDraftFromCurrentMemory() {
  memoryDraft.summary = currentMemory.summary
  memoryDraft.updatedAt = currentMemory.updatedAt
  memoryDraft.sourceMessageCount = currentMemory.sourceMessageCount
  memoryDraft.threshold = currentMemory.threshold
  memoryDraft.recentMessageLimit = currentMemory.recentMessageLimit
}

async function refreshCurrentSessionState() {
  if (!sessionId.value) {
    return
  }

  try {
    const response = await getSession(sessionId.value)
    applySessionMemory(response.session.memory)
    applySessionUsage(response.session.usage)
    if (memoryVisible.value) {
      syncMemoryDraftFromCurrentMemory()
    }
  } catch {
    // Ignore transient session refresh failures and keep the current values.
  }
}

async function loadRobotTemplates() {
  const response = await getRobots()
  robotTemplates.value = response.robots
  if (!selectedNewChatRobotId.value && response.robots.length) {
    selectedNewChatRobotId.value = response.robots[0]!.id
  }
}

async function syncCurrentSessionMeta() {
  const response = await upsertSession({
    id: sessionId.value,
    robot: {
      name: sessionRobot.name,
      avatar: sessionRobot.avatar,
      systemPrompt: sessionRobot.systemPrompt,
    },
    modelConfigId: activeModelConfig.value.id,
    modelLabel: currentModelLabel.value,
    memory: {
      threshold: currentMemory.threshold,
      recentMessageLimit: currentMemory.recentMessageLimit,
    },
  })
  storeActiveSessionId(response.session.id)
  sessionId.value = response.session.id
  applySessionMemory(response.session.memory)
  applySessionUsage(response.session.usage)
  await refreshSessionHistory()
}

async function hydrateSession(session: ChatSessionDetail) {
  sessionId.value = session.id
  sessionRobot.name = session.robot.name || '当前机器人'
  sessionRobot.avatar = session.robot.avatar || ''
  sessionRobot.systemPrompt = session.robot.systemPrompt || ''
  applySessionMemory(session.memory)
  applySessionUsage(session.usage)
  storeActiveSessionId(session.id)

  if (session.modelConfigId && session.modelConfigId !== activeModelConfigId.value && modelConfigs.value.some((item) => item.id === session.modelConfigId)) {
    activeModelConfigId.value = session.modelConfigId
    await loadCapabilities()
  }

  await nextTick()
  applyChatMessages(normalizeSessionMessages(session))
}

async function createNewChat(robot?: AIRobotCard | null) {
  if (robot) {
    sessionRobot.name = robot.name.trim() || '当前机器人'
    sessionRobot.avatar = robot.avatar || ''
    sessionRobot.systemPrompt = robot.systemPrompt
  }
  applySessionMemory(DEFAULT_SESSION_MEMORY)
  applySessionUsage(DEFAULT_SESSION_USAGE)
  sessionId.value = createSessionId()
  storeActiveSessionId(sessionId.value)
  await nextTick()
  applyChatMessages([])
  await syncCurrentSessionMeta()
}

function openMemoryDialog() {
  syncMemoryDraftFromCurrentMemory()
  memoryVisible.value = true
}

function openNewChatDialog() {
  if (robotTemplates.value.length) {
    selectedNewChatRobotId.value = selectedNewChatRobotId.value || robotTemplates.value[0]!.id
    newChatVisible.value = true
    return
  }
  MessagePlugin.warning('暂无机器人卡片，请先去“设置机器人”中新增')
}

async function confirmStartNewChat() {
  if (!selectedNewChatRobot.value) {
    MessagePlugin.warning('请先选择一个机器人')
    return
  }
  await createNewChat(selectedNewChatRobot.value)
  newChatVisible.value = false
  sidebarDrawerVisible.value = false
}

function handleNewChatEntry() {
  sidebarDrawerVisible.value = false
  openNewChatDialog()
}

function handleGoToRobotPage() {
  sidebarDrawerVisible.value = false
  goToRobotPage()
}

function goToRobotPage() {
  router.push({ name: 'robots' })
}

function switchStream() {
  if (showStreamToggle.value) {
    streamEnabled.value = !streamEnabled.value
  }
}

function switchThinking() {
  if (showThinkingToggle.value) {
    thinkingEnabled.value = !thinkingEnabled.value
  }
}

function openSessionRobotDialog() {
  sessionRobotDraft.name = sessionRobot.name
  sessionRobotDraft.avatar = sessionRobot.avatar
  sessionRobotDraft.systemPrompt = sessionRobot.systemPrompt
  sessionRobotVisible.value = true
}

async function applySessionRobot() {
  sessionRobot.name = sessionRobotDraft.name.trim() || '当前机器人'
  sessionRobot.avatar = sessionRobotDraft.avatar.trim()
  sessionRobot.systemPrompt = sessionRobotDraft.systemPrompt
  sessionRobotVisible.value = false
  await syncCurrentSessionMeta()
}

async function saveSessionMemoryConfig() {
  savingMemory.value = true
  try {
    const response = await updateSessionMemory(sessionId.value, {
      summary: memoryDraft.summary,
      threshold: Math.max(1, Math.round(memoryDraft.threshold || DEFAULT_SESSION_MEMORY.threshold)),
      recentMessageLimit: Math.max(1, Math.round(memoryDraft.recentMessageLimit || DEFAULT_SESSION_MEMORY.recentMessageLimit)),
    })
    applySessionMemory(response.session.memory)
    memoryVisible.value = false
    MessagePlugin.success('会话记忆已保存')
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '保存会话记忆失败')
  } finally {
    savingMemory.value = false
  }
}

async function clearCurrentSessionMemory() {
  clearingMemory.value = true
  try {
    const response = await clearSessionMemory(sessionId.value)
    applySessionMemory(response.session.memory)
    memoryDraft.summary = response.session.memory.summary
    memoryDraft.updatedAt = response.session.memory.updatedAt
    memoryDraft.sourceMessageCount = response.session.memory.sourceMessageCount
    memoryDraft.threshold = response.session.memory.threshold
    memoryDraft.recentMessageLimit = response.session.memory.recentMessageLimit
    MessagePlugin.success('会话记忆已清空')
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '清空会话记忆失败')
  } finally {
    clearingMemory.value = false
  }
}

async function openHistorySession(targetSessionId: string) {
  if (!targetSessionId || targetSessionId === sessionId.value) {
    return
  }

  try {
    const response = await getSession(targetSessionId)
    await hydrateSession(response.session)
    sidebarDrawerVisible.value = false
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '加载历史聊天失败')
  }
}

async function handleDeleteSession(targetSessionId: string) {
  if (!targetSessionId || deletingSessionId.value) {
    return
  }
  if (typeof window !== 'undefined' && !window.confirm('确认删除这个会话吗？')) {
    return
  }

  deletingSessionId.value = targetSessionId
  const remainingSessions = sessionHistory.value.filter((item) => item.id !== targetSessionId)
  const nextSessionId = sessionId.value === targetSessionId ? remainingSessions[0]?.id || '' : sessionId.value

  try {
    await deleteSession(targetSessionId)
    await refreshSessionHistory()

    if (sessionId.value === targetSessionId) {
      if (nextSessionId) {
        const response = await getSession(nextSessionId)
        await hydrateSession(response.session)
      } else {
        await createNewChat()
      }
    }
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '删除会话失败')
  } finally {
    deletingSessionId.value = ''
  }
}

function syncEditingConfig(config: AIModelConfigItem) {
  editingConfig.id = config.id
  editingConfig.name = config.name
  editingConfig.provider = config.provider
  editingConfig.baseUrl = config.baseUrl
  editingConfig.apiKey = config.apiKey
  editingConfig.model = config.model
  editingConfig.temperature = config.temperature
}

function commitEditingConfig() {
  modelConfigs.value = modelConfigs.value.map((item) =>
    item.id === editingConfig.id
      ? {
        ...editingConfig,
        name: editingConfig.name.trim() || item.name || '未命名配置',
      }
      : item,
  )
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
  const next = createModelConfig('ollama', modelConfigs.value.length + 1)
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
    const fallback = createModelConfig('ollama', 1)
    modelConfigs.value = [fallback]
    activeModelConfigId.value = fallback.id
    editingConfigId.value = fallback.id
    modelOptionsMap.value = { [fallback.id]: [] }
    syncEditingConfig(fallback)
    syncCurrentSessionMeta()
    return
  }

  modelConfigs.value = nextList
  if (activeModelConfigId.value === configId) {
    activeModelConfigId.value = nextList[0]!.id
    loadCapabilities()
    syncCurrentSessionMeta()
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
  await loadCapabilities()
  await syncCurrentSessionMeta()
}

function openConfigDialog() {
  if (!modelConfigs.value.length) {
    addModelConfig()
  } else {
    selectEditingConfig(editingConfigId.value || modelConfigs.value[0]!.id)
  }
  configVisible.value = true
}

function applyModelConfigs(configs: AIModelConfigItem[], activeId: string) {
  const normalized = configs.length ? configs : [createModelConfig()]
  modelConfigs.value = normalized
  activeModelConfigId.value = normalized.some((item) => item.id === activeId) ? activeId : normalized[0]!.id
  const editingTarget = normalized.find((item) => item.id === editingConfigId.value) ?? normalized[0]!
  editingConfigId.value = editingTarget.id
  syncEditingConfig(editingTarget)
}

async function loadCapabilities() {
  const current = activeModelConfig.value
  if (!current.model) {
    capabilities.value = { supportsStreaming: true, supportsReasoning: false }
    return
  }

  capabilities.value = await getCapabilities(current.provider, current.model)
}

async function refreshModelsForConfig(config: AIModelConfigItem) {
  loadingModels.value = true
  try {
    const models = await testModelConnection(config)
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

async function initializePage() {
  try {
    const { configs, activeModelConfigId: activeId } = await getModelConfigs()
    applyModelConfigs(configs, activeId)
    await loadCapabilities()
    await loadRobotTemplates()
    await refreshSessionHistory()

    const storedSessionId = getStoredActiveSessionId()
    const initialSessionId = storedSessionId || sessionHistory.value[0]?.id
    if (initialSessionId) {
      try {
        const response = await getSession(initialSessionId)
        await hydrateSession(response.session)
      } catch {
        await createNewChat()
      }
    } else {
      await createNewChat()
    }
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '初始化失败')
  }
}

function syncViewportMode() {
  if (typeof window === 'undefined') {
    return
  }
  isMobile.value = window.innerWidth <= MOBILE_BREAKPOINT
}

function handleProviderChange(value: unknown) {
  const nextProvider: ProviderType = value === 'openai' ? 'openai' : 'ollama'
  const defaults = DEFAULT_MODEL_CONFIGS[nextProvider]
  editingConfig.provider = nextProvider
  editingConfig.baseUrl = defaults.baseUrl
  editingConfig.apiKey = ''
  editingConfig.model = ''
  editingConfig.temperature = editingConfig.temperature ?? defaults.temperature
  modelOptionsMap.value = {
    ...modelOptionsMap.value,
    [editingConfig.id]: [],
  }
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

async function saveAllModelConfigs() {
  savingConfig.value = true
  try {
    commitEditingConfig()
    const payload = modelConfigs.value.map((item, index) => ({
      ...item,
      name: item.name.trim() || `模型配置 ${index + 1}`,
      baseUrl: item.baseUrl.trim(),
      apiKey: item.apiKey.trim(),
    }))
    const activeId = payload.some((item) => item.id === activeModelConfigId.value) ? activeModelConfigId.value : payload[0]!.id
    const response = await saveModelConfigs(payload, activeId)
    applyModelConfigs(response.configs, response.activeModelConfigId)
    configVisible.value = false
    await loadCapabilities()
    await syncCurrentSessionMeta()
    MessagePlugin.success('模型配置已保存')
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '保存失败')
  } finally {
    savingConfig.value = false
  }
}

async function switchModel(data: { value?: string | number | Record<string, any> }) {
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
    const response = await saveModelConfigs(modelConfigs.value, selectedValue)
    applyModelConfigs(response.configs, response.activeModelConfigId)
    await loadCapabilities()
    await syncCurrentSessionMeta()
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '切换模型失败')
  }
}

function createThinkingChunk(text: string, done = false): AIMessageContent {
  return {
    type: 'thinking',
    strategy: 'merge',
    status: done ? 'complete' : 'streaming',
    data: {
      title: done ? '深度思考已完成' : '思考中',
      text,
    },
  } as AIMessageContent
}

const chatServiceConfig = computed<ChatServiceConfig>(() => ({
  endpoint: '/api/chat/stream',
  stream: true,
  onRequest: async (params) => {
    isChatResponding.value = true
    return {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionId.value,
        provider: activeModelConfig.value.provider,
        baseUrl: activeModelConfig.value.baseUrl,
        apiKey: activeModelConfig.value.apiKey,
        model: activeModelConfig.value.model,
        modelConfigId: activeModelConfig.value.id,
        modelLabel: currentModelLabel.value,
        systemPrompt: sessionRobot.systemPrompt,
        robot: {
          name: sessionRobot.name,
          avatar: sessionRobot.avatar,
          systemPrompt: sessionRobot.systemPrompt,
        },
        stream: effectiveStream.value,
        thinking: effectiveThinking.value,
        temperature: activeModelConfig.value.temperature,
        prompt: params.prompt ?? '',
      }),
    }
  },
  onMessage: (chunk: SSEChunkData): AIMessageContent | null => {
    const payload = chunk.data as NormalizedStreamPayload
    if (payload.type === 'error') {
      isChatResponding.value = false
      MessagePlugin.error(payload.message || '聊天失败')
      return null
    }
    if (payload.type === 'reasoning' && payload.text) {
      return createThinkingChunk(payload.text)
    }
    if (payload.type === 'reasoning_done' && payload.text) {
      return createThinkingChunk(payload.text, true)
    }
    if (payload.type === 'text' && payload.text) {
      return { type: 'markdown', strategy: 'merge', data: payload.text }
    }
    if (payload.type === 'suggestion' && payload.items?.length) {
      pendingAssistantSuggestions.value = payload.items
      pendingAssistantForm.value = null
      return null
    }
    if (payload.type === 'form' && payload.form?.fields?.length) {
      if (!pendingAssistantSuggestions.value?.length) {
        pendingAssistantForm.value = payload.form
      }
      return null
    }
    if (payload.type === 'memory_status' && payload.message) {
      const status = createMemoryStatusContent(payload.status || 'running', payload.message)
      pendingAssistantMemoryStatus.value = status
      nextTick(() => {
        flushPendingAssistantMemoryStatus()
      })
      return null
    }
    if (payload.type === 'usage') {
      applySessionUsage({
        promptTokens: payload.promptTokens,
        completionTokens: payload.completionTokens,
      })
      return null
    }
    if (payload.type === 'done') {
      isChatResponding.value = false
      flushPendingAssistantStructuredContent()
      refreshCurrentSessionState().catch(() => { })
      refreshSessionHistory().catch(() => { })
    }
    return null
  },
  onError: (error) => {
    isChatResponding.value = false
    MessagePlugin.error(error instanceof Error ? error.message : '聊天失败')
  },
}))

onMounted(async () => {
  syncViewportMode()
  window.addEventListener('resize', syncViewportMode)
  await initializePage()
  await nextTick()
})

onUnmounted(() => {
  if (typeof window === 'undefined') {
    return
  }
  window.removeEventListener('resize', syncViewportMode)
})
</script>

<style scoped>
.main {
  height: 100vh;
  background-color: #f5f5f5;
  display: flex;
  flex-direction: row;
  overflow: hidden;
}

.mess-list {
  width: 240px;
  height: 100%;
  background-color: #fff;
  padding: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.drawer-side {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.side-shell {
  flex: 0 0 auto;
}

.history-scroll-area {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.mobile-overlay-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mobile-overlay-actions {
  display: flex;
  position: sticky;
  bottom: 0;
  padding-top: 8px;
  background: #fff;
}

.mobile-overlay-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 1;
  padding-bottom: 4px;
  background: #fff;
}

.mobile-overlay-title {
  font-size: 16px;
  font-weight: 600;
  color: #222;
}

.mobile-sidebar-trigger {
  display: none;
}

.side-action {
  cursor: pointer;
  padding: 10px 8px;
}

.side-placeholder {
  padding: 10px 8px;
  color: #8b8b8b;
  line-height: 1.8;
}

.robot-picker-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.robot-picker-item {
  border: 1px solid #e7e7e7;
  border-radius: 10px;
  padding: 12px;
  cursor: pointer;
}

.robot-picker-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #eef3ff;
  color: #4c6ef5;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
}

.robot-picker-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.robot-picker-item.active {
  border-color: var(--td-brand-color);
  background: #f5f9ff;
}

.robot-picker-name {
  font-size: 14px;
  font-weight: 600;
  color: #222;
}

.robot-picker-desc {
  margin-top: 6px;
  font-size: 12px;
  color: #8b8b8b;
  line-height: 1.5;
}

.history-title {
  padding: 12px 8px 8px;
  font-size: 13px;
  color: #666;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-item {
  padding: 10px 8px;
  border-radius: 8px;
  cursor: pointer;
}

.history-item-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.history-item.active {
  background: #f5f9ff;
}

.history-item-title {
  font-size: 13px;
  color: #222;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-delete-button {
  flex: 0 0 auto;
  margin: -4px -6px 0 0;
}

.history-item-preview,
.history-empty {
  font-size: 12px;
  color: #8b8b8b;
  line-height: 1.5;
}

.history-item-preview {
  margin-top: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.history-empty {
  padding: 8px;
}

.footer-button-label {
  display: inline;
}

.footer-model-label {
  display: inline-block;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
}

.sender-footer-actions {
  flex-wrap: wrap;
  row-gap: 8px;
}

.side-meta {
  font-size: 12px;
}

.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: 0 20px;
}

.chatbot {
  padding: 0 0 20px 0;
  flex: 1;
  max-width: 800px;
  width: 100%;
  height: 0;
  min-height: 0;
}

.chatbot-instance {
  height: 100%;
  min-height: 0;
}

.memory-icon {
  width: 18px;
  height: 18px;
  display: block;
}

.chat-form-card {
  border: 1px solid #e7e7e7;
  border-radius: 12px;
  padding: 12px;
  background: #fff;
  min-width: 280px;
}

.chat-form-title {
  font-size: 14px;
  font-weight: 600;
  color: #222;
}

.chat-form-desc {
  margin-top: 6px;
  margin-bottom: 12px;
  font-size: 12px;
  color: #8b8b8b;
  line-height: 1.5;
}

.memory-status-card {
  margin-top: 8px;
  border-radius: 10px;
  padding: 10px 12px;
  border: 1px solid #e7e7e7;
  background: #f8f8f8;
}

.memory-status-running {
  border-color: #d9e1ff;
  background: #f5f8ff;
}

.memory-status-success {
  border-color: #d6f5df;
  background: #f1fbf4;
}

.memory-status-error {
  border-color: #f5d2d2;
  background: #fff3f3;
}

.memory-status-label {
  font-size: 12px;
  font-weight: 600;
  color: #666;
}

.memory-status-text {
  margin-top: 4px;
  font-size: 12px;
  color: #333;
  line-height: 1.5;
}

.chatbot-header {
  width: 100%;
  padding: 10px 0px;
  display: flex;
  align-items: center;
  justify-content: end;
  gap: 8px;
  box-sizing: border-box;
}

.chatbot-header-left {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.token-stats {
  display: inline-flex;
  flex-direction: row;
  gap: 2px;
  min-width: 56px;
}

.token-stat-item {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  font-size: 12px;
  color: #555;
  line-height: 1.2;
  white-space: nowrap;
}

.token-stat-icon {
  width: 12px;
  height: 12px;
  flex: 0 0 auto;
}

.config-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
  min-height: 420px;
}

.config-layout.mobile {
  grid-template-columns: 1fr;
  min-height: auto;
}

.config-list {
  border-right: 1px solid #eee;
  padding-right: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.config-layout.mobile .config-list {
  border-right: 0;
  padding-right: 0;
}

.config-list-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 420px;
  overflow: auto;
}

.config-editor {
  padding-left: 8px;
}

.config-layout.mobile .config-editor {
  padding-left: 0;
}

.config-model-row {
  width: 100%;
}

.config-model-select {
  flex: 1;
  min-width: 0;
}

.config-test-row,
.memory-action-row {
  flex-wrap: wrap;
}

.config-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
}

.config-card {
  border: 1px solid #e7e7e7;
  border-radius: 10px;
  padding: 12px;
  cursor: pointer;
}

.config-card.active {
  border-color: var(--td-brand-color);
  background: #f5f9ff;
}

.config-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.config-card-name {
  font-weight: 600;
}

.config-card-meta {
  font-size: 12px;
  color: #888;
  margin-top: 6px;
  word-break: break-all;
}

.config-badge {
  font-size: 12px;
  color: var(--td-brand-color);
}

.config-empty {
  color: #999;
  font-size: 13px;
  padding: 8px 0;
}

.dialog-tip {
  color: #888;
  font-size: 12px;
}

.memory-meta {
  margin-bottom: 12px;
  color: #777;
  font-size: 12px;
  line-height: 1.8;
}

@media (max-width: 900px) {
  .sender-footer-actions {
    width: 100%;
  }
}

@media (max-width: 768px) {
  .mess-list {
    display: none;
  }

  .mobile-sidebar-trigger {
    position: fixed;
    left: 12px;
    top: 12px;
    z-index: 10;
    display: inline-flex;
  }

  .chat-container {
    padding: 0 12px;
  }

  .chatbot-header {
    padding: 10px 0 10px 52px;
  }

  .chatbot {
    max-width: none;
    padding-bottom: 12px;
  }

  .mobile-overlay-body {
    min-height: calc(100vh - 120px);
    padding-bottom: 12px;
  }

  .mobile-overlay-body :deep(.t-form),
  .mobile-overlay-body :deep(.t-form__item),
  .mobile-overlay-body :deep(.t-input),
  .mobile-overlay-body :deep(.t-input-number),
  .mobile-overlay-body :deep(.t-textarea),
  .mobile-overlay-body :deep(.t-select) {
    width: 100%;
  }

  .mobile-overlay-body :deep(.t-textarea__inner) {
    min-height: 220px;
  }

  .sender-footer-actions {
    align-items: stretch;
    justify-content: flex-start;
  }

  .sender-footer-actions :deep(.t-button) {
    max-width: 100%;
  }

  .footer-button-label {
    display: inline;
  }

  .footer-model-label {
    max-width: 140px;
  }

  .config-model-row {
    flex-direction: column;
    align-items: stretch;
  }

  .config-test-row {
    align-items: flex-start;
  }
}
</style>
