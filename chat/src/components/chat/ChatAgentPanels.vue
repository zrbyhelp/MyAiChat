<!-- eslint-disable vue/no-mutating-props -->
<template>
  <TDrawer
    v-if="isMobile"
    :visible="newChatVisible"
    :header="false"
    placement="right"
    size="100%"
    :footer="false"
    @update:visible="(value) => $emit('update:newChatVisible', value)"
  >
    <div class="mobile-overlay-body">
      <div class="mobile-overlay-topbar">
        <div class="mobile-overlay-title">选择智能体</div>
        <TButton variant="text" @click="$emit('update:newChatVisible', false)">关闭</TButton>
      </div>
      <div v-if="robotTemplates.length" class="robot-picker-grid">
        <TCard
          v-for="item in robotTemplates"
          :key="item.id"
          class="config-card robot-picker-card"
          hoverShadow
          @click="
            () => {
              $emit('update:selectedNewChatRobotId', item.id)
              $emit('confirm-start-new-chat')
            }
          "
        >
          <template #header>
            <div class="robot-picker-card-head">
              <div class="robot-picker-avatar">
                <img v-if="item.avatar" :src="item.avatar" alt="" />
                <span v-else>{{ (item.name || '智').slice(0, 1) }}</span>
              </div>
              <span class="config-card-name ellipsis-1">{{ item.name || '未命名智能体' }}</span>
            </div>
          </template>
          <div class="config-card-meta ellipsis-2">{{ item.description || '暂无简介' }}</div>
          <div class="config-card-meta config-card-meta-secondary ellipsis-2">
            {{ item.systemPrompt || '未填写主要故事设定' }}
          </div>
        </TCard>
      </div>
      <div v-else class="history-empty">暂无智能体卡片，请先去“设置智能体”里维护</div>
    </div>
  </TDrawer>
  <TDialog
    v-else
    :visible="newChatVisible"
    header="选择智能体"
    width="960px"
    :footer="false"
    :confirm-btn="null"
    :cancel-btn="null"
    @update:visible="(value) => $emit('update:newChatVisible', value)"
  >
    <div class="mobile-overlay-body">
      <div v-if="robotTemplates.length" class="robot-picker-grid robot-picker-grid-desktop">
        <TCard
          v-for="item in robotTemplates"
          :key="item.id"
          class="config-card robot-picker-card"
          hoverShadow
          @click="
            () => {
              $emit('update:selectedNewChatRobotId', item.id)
              $emit('confirm-start-new-chat')
            }
          "
        >
          <template #header>
            <div class="robot-picker-card-head">
              <div class="robot-picker-avatar">
                <img v-if="item.avatar" :src="item.avatar" alt="" />
                <span v-else>{{ (item.name || '智').slice(0, 1) }}</span>
              </div>
              <span class="config-card-name ellipsis-1">{{ item.name || '未命名智能体' }}</span>
            </div>
          </template>
          <div class="config-card-meta ellipsis-2">{{ item.description || '暂无简介' }}</div>
          <div class="config-card-meta config-card-meta-secondary ellipsis-2">
            {{ item.systemPrompt || '未填写主要故事设定' }}
          </div>
        </TCard>
      </div>
      <div v-else class="history-empty">暂无智能体卡片，请先去“设置智能体”里维护</div>
    </div>
  </TDialog>

  <TDrawer
    v-if="isMobile"
    :visible="agentManageVisible"
    placement="right"
    :footer="false"
    @update:visible="(value) => $emit('update:agentManageVisible', value)"
  >
    <template #header> 设置智能体 </template>
    <div class="mobile-overlay-body">
      <div class="agent-manage-panel">
        <div v-if="robotTemplates.length" class="config-list-body">
          <TCard
            v-for="item in robotTemplates"
            :key="item.id"
            class="config-card"
            hoverShadow
            @click="$emit('open-mobile-agent-edit-dialog', item.id)"
          >
            <template #title>
              <span class="config-card-name ellipsis-1" :title="item.name || '未命名智能体'">{{
                item.name || '未命名智能体'
              }}</span>
            </template>
            <template #subtitle>
              <span class="config-card-meta ellipsis-1" :title="item.description || '暂无简介'">
                {{ item.description || '暂无简介' }}
              </span>
            </template>
            <template #actions>
              <TDropdown
                trigger="click"
                placement="bottom-right"
                :options="agentCardActionOptions"
                @click="(data) => $emit('handle-agent-card-action', item.id, data.value)"
              >
                <TButton variant="text" shape="square" size="small" @click.stop>
                  <template #icon>
                    <MoreIcon />
                  </template>
                </TButton>
              </TDropdown>
            </template>
            <div
              class="config-card-meta config-card-meta-secondary ellipsis-2"
              :title="item.systemPrompt || '未填写主要故事设定'"
            >
              {{ item.systemPrompt || '未填写主要故事设定' }}
            </div>
          </TCard>
          <TCard
            class="config-card config-card-add"
            hoverShadow
            @click="$emit('open-mobile-agent-create-dialog')"
          >
            <div class="config-card-add-media" aria-label="新增智能体">
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <path d="M32 14v36M14 32h36" />
              </svg>
            </div>
          </TCard>
        </div>
        <TCard
          v-else
          class="config-card config-card-add"
          hoverShadow
          @click="$emit('open-mobile-agent-create-dialog')"
        >
          <div class="config-card-add-media" aria-label="新增智能体">
            <svg viewBox="0 0 64 64" aria-hidden="true">
              <path d="M32 14v36M14 32h36" />
            </svg>
          </div>
        </TCard>
      </div>
    </div>
  </TDrawer>
  <TDrawer
    v-if="isMobile"
    :visible="mobileAgentEditorVisible"
    placement="bottom"
    size="80%"
    :footer="false"
    @update:visible="(value) => $emit('update:mobileAgentEditorVisible', value)"
  >
    <template #header>
      {{ isEditingAgentDraft ? '修改智能体' : '新增智能体' }}
    </template>
    <div class="mobile-overlay-body agent-editor-shell">
      <TSteps class="agent-editor-steps" :current="agentEditorStep - 1" readonly>
        <TStepItem title="基础信息" />
        <TStepItem title="故事设定" />
        <TStepItem title="记忆设置" />
      </TSteps>
      <div class="session-robot-form-card agent-editor-content">
        <TForm v-if="agentEditorStep === 1" label-align="top">
          <div class="form-grid-2">
            <TFormItem label="名称">
              <TInput v-model="mobileAgentDraft.name" placeholder="例如：销售顾问 / 数据分析师" />
            </TFormItem>
            <TFormItem label="简介">
              <TInput v-model="mobileAgentDraft.description" placeholder="用于卡片展示的说明" />
            </TFormItem>
            <TFormItem class="form-grid-span-2" label="头像">
              <TInput v-model="mobileAgentDraft.avatar" placeholder="请输入头像图片 URL" />
            </TFormItem>
            <TFormItem class="form-grid-span-2" label="新建聊天记录保存在服务器">
              <TSwitch v-model="mobileAgentDraft.persistToServer" />
            </TFormItem>
          </div>
        </TForm>
        <TForm v-else-if="agentEditorStep === 2" label-align="top">
          <TFormItem label="主要故事设定">
            <TTextarea
              v-model="mobileAgentDraft.systemPrompt"
              :autosize="{ minRows: 8, maxRows: 12 }"
              placeholder="描述智能体的角色、语气、关系、行为边界和长期背景。"
            />
          </TFormItem>
          <TFormItem>
            <template #label>
              <span class="form-label-with-tip">
                智能体通用提示
                <TPopup content="该提示词会通用到本智能体全部生成工具上" placement="top">
                  <InfoCircleIcon class="form-label-tip-icon" />
                </TPopup>
              </span>
            </template>
            <TTextarea
              v-model="mobileAgentDraft.commonPrompt"
              :autosize="{ minRows: 5, maxRows: 8 }"
              placeholder="填写会统一加到本智能体所有生成节点顶部的通用要求。"
            />
          </TFormItem>
          <TFormItem label="启用数值计算">
            <TSwitch v-model="mobileAgentDraft.numericComputationEnabled" />
          </TFormItem>
          <TFormItem v-if="mobileAgentDraft.numericComputationEnabled" label="数值计算提示词">
            <TTextarea
              v-model="mobileAgentDraft.numericComputationPrompt"
              :autosize="{ minRows: 4, maxRows: 8 }"
              placeholder="例如：根据用户行为和上下文调整好感度、危险度、财富等数值，并说明增减规则。"
            />
          </TFormItem>
          <TFormItem v-if="mobileAgentDraft.numericComputationEnabled" label="数值结构体">
            <div class="numeric-items-editor">
              <table class="numeric-items-table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>当前值</th>
                    <th>说明</th>
                    <th class="numeric-items-action-col">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(item, itemIndex) in mobileAgentDraft.numericComputationItems"
                    :key="`mobile-agent-${itemIndex}`"
                  >
                    <td><TInput v-model="item.name" placeholder="例如 favorability" /></td>
                    <td><TInputNumber v-model="item.currentValue" :step="1" /></td>
                    <td>
                      <TInput
                        v-model="item.description"
                        placeholder="例如 好感度，受对话行为影响"
                      />
                    </td>
                    <td class="numeric-items-action-col">
                      <TButton
                        variant="text"
                        theme="danger"
                        @click="$emit('remove-numeric-computation-item', mobileAgentDraft, itemIndex)"
                        >删除</TButton
                      >
                    </td>
                  </tr>
                </tbody>
              </table>
              <TButton variant="outline" @click="$emit('add-numeric-computation-item', mobileAgentDraft)"
                >新增数值项</TButton
              >
            </div>
          </TFormItem>
        </TForm>
        <TForm v-else label-align="top">
          <div class="form-grid-2">
            <TFormItem label="记忆间隔">
              <TInputNumber
                v-model="mobileAgentDraft.structuredMemoryInterval"
                :min="1"
                placeholder="3"
              />
            </TFormItem>
            <TFormItem label="历史消息条数">
              <TInputNumber
                v-model="mobileAgentDraft.structuredMemoryHistoryLimit"
                :min="1"
                placeholder="12"
              />
            </TFormItem>
          </div>
          <div class="agent-schema-card">
            <MemorySchemaEditor :schema="mobileAgentDraft.memorySchema" />
          </div>
        </TForm>
      </div>
      <div class="mobile-overlay-actions drawer-actions">
        <template v-if="agentEditorStep === 1">
          <TButton theme="primary" @click="$emit('next-agent-editor-step')">下一步</TButton>
        </template>
        <template v-else-if="agentEditorStep === 2">
          <div class="agent-editor-actions agent-editor-actions-split">
            <div class="agent-editor-actions-left">
              <TButton theme="default" variant="base" @click="$emit('previous-agent-editor-step')"
                >上一步</TButton
              >
            </div>
            <div class="agent-editor-actions-right">
              <TButton theme="primary" :loading="savingMobileAgent" @click="$emit('skip-agent-structure-setup')">
                跳过结构体设置
              </TButton>
              <TButton variant="outline" @click="$emit('next-agent-editor-step')">下一步</TButton>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="agent-editor-actions agent-editor-actions-split">
            <div class="agent-editor-actions-left">
              <TButton theme="default" variant="base" @click="$emit('previous-agent-editor-step')"
                >上一步</TButton
              >
            </div>
            <div class="agent-editor-actions-right">
              <TButton theme="primary" :loading="savingMobileAgent" @click="$emit('save-mobile-agent')"
                >确定</TButton
              >
            </div>
          </div>
        </template>
      </div>
    </div>
  </TDrawer>
  <TDialog
    v-if="!isMobile"
    :visible="agentManageVisible"
    header="设置智能体"
    width="1160px"
    :footer="false"
    :confirm-btn="null"
    :cancel-btn="null"
    @update:visible="(value) => $emit('update:agentManageVisible', value)"
  >
    <div class="mobile-overlay-body agent-manage-shell">
      <div class="agent-manage-panel">
        <div class="config-list-header">
          <span class="config-title">已配置智能体</span>
        </div>
        <div v-if="robotTemplates.length" class="desktop-config-grid">
          <TCard
            v-for="item in robotTemplates"
            :key="item.id"
            class="config-card"
            hoverShadow
            @click="$emit('open-mobile-agent-edit-dialog', item.id)"
          >
            <template #title>
              <span class="config-card-name ellipsis-1" :title="item.name || '未命名智能体'">{{
                item.name || '未命名智能体'
              }}</span>
            </template>
            <template #subtitle>
              <span class="config-card-meta ellipsis-1" :title="item.description || '暂无简介'">
                {{ item.description || '暂无简介' }}
              </span>
            </template>
            <template #actions>
              <TDropdown
                trigger="click"
                placement="bottom-right"
                :options="agentCardActionOptions"
                @click="(data) => $emit('handle-agent-card-action', item.id, data.value)"
              >
                <TButton variant="text" shape="square" size="small" @click.stop>
                  <template #icon>
                    <MoreIcon />
                  </template>
                </TButton>
              </TDropdown>
            </template>
            <div
              class="config-card-meta config-card-meta-secondary ellipsis-2"
              :title="item.systemPrompt || '未填写主要故事设定'"
            >
              {{ item.systemPrompt || '未填写主要故事设定' }}
            </div>
          </TCard>
          <TCard class="config-card config-card-add" hoverShadow @click="$emit('add-agent-template')">
            <div class="config-card-add-media" aria-label="新增智能体">
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <path d="M32 14v36M14 32h36" />
              </svg>
            </div>
          </TCard>
        </div>
        <TCard v-else class="config-card config-card-add" hoverShadow @click="$emit('add-agent-template')">
          <div class="config-card-add-media" aria-label="新增智能体">
            <svg viewBox="0 0 64 64" aria-hidden="true">
              <path d="M32 14v36M14 32h36" />
            </svg>
          </div>
        </TCard>
      </div>
    </div>
  </TDialog>
  <TDialog
    v-if="!isMobile"
    :visible="mobileAgentEditorVisible"
    :header="isEditingAgentDraft ? '修改智能体' : '新增智能体'"
    width="760px"
    :footer="false"
    :confirm-btn="null"
    :cancel-btn="null"
    @update:visible="(value) => $emit('update:mobileAgentEditorVisible', value)"
  >
    <div class="mobile-overlay-body agent-editor-shell">
      <TSteps class="agent-editor-steps" :current="agentEditorStep - 1" readonly>
        <TStepItem title="基础信息" />
        <TStepItem title="故事设定" />
        <TStepItem title="记忆设置" />
      </TSteps>
      <div class="session-robot-form-card agent-editor-card agent-editor-content">
        <TForm v-if="agentEditorStep === 1" label-align="top">
          <div class="form-grid-2">
            <TFormItem label="名称">
              <TInput v-model="mobileAgentDraft.name" placeholder="例如：销售顾问 / 数据分析师" />
            </TFormItem>
            <TFormItem label="简介">
              <TInput v-model="mobileAgentDraft.description" placeholder="用于卡片展示的说明" />
            </TFormItem>
            <TFormItem class="form-grid-span-2" label="头像">
              <TInput v-model="mobileAgentDraft.avatar" placeholder="请输入头像图片 URL" />
            </TFormItem>
            <TFormItem class="form-grid-span-2" label="新建聊天记录保存在服务器">
              <TSwitch v-model="mobileAgentDraft.persistToServer" />
            </TFormItem>
          </div>
        </TForm>
        <TForm v-else-if="agentEditorStep === 2" label-align="top">
          <TFormItem label="主要故事设定">
            <TTextarea
              v-model="mobileAgentDraft.systemPrompt"
              :autosize="{ minRows: 10, maxRows: 14 }"
              placeholder="描述智能体的角色、语气、关系、行为边界和长期背景。"
            />
          </TFormItem>
          <TFormItem>
            <template #label>
              <span class="form-label-with-tip">
                智能体通用提示
                <TPopup content="该提示词会通用到本智能体全部生成工具上" placement="top">
                  <InfoCircleIcon class="form-label-tip-icon" />
                </TPopup>
              </span>
            </template>
            <TTextarea
              v-model="mobileAgentDraft.commonPrompt"
              :autosize="{ minRows: 5, maxRows: 8 }"
              placeholder="填写会统一加到本智能体所有生成节点顶部的通用要求。"
            />
          </TFormItem>
          <TFormItem label="启用数值计算">
            <TSwitch v-model="mobileAgentDraft.numericComputationEnabled" />
          </TFormItem>
          <TFormItem v-if="mobileAgentDraft.numericComputationEnabled" label="数值计算提示词">
            <TTextarea
              v-model="mobileAgentDraft.numericComputationPrompt"
              :autosize="{ minRows: 4, maxRows: 8 }"
              placeholder="例如：根据用户行为和上下文调整好感度、危险度、财富等数值，并说明增减规则。"
            />
          </TFormItem>
          <TFormItem v-if="mobileAgentDraft.numericComputationEnabled" label="数值结构体">
            <div class="numeric-items-editor">
              <table class="numeric-items-table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>当前值</th>
                    <th>说明</th>
                    <th class="numeric-items-action-col">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(item, itemIndex) in mobileAgentDraft.numericComputationItems"
                    :key="`desktop-agent-${itemIndex}`"
                  >
                    <td><TInput v-model="item.name" placeholder="例如 favorability" /></td>
                    <td><TInputNumber v-model="item.currentValue" :step="1" /></td>
                    <td>
                      <TInput
                        v-model="item.description"
                        placeholder="例如 好感度，受对话行为影响"
                      />
                    </td>
                    <td class="numeric-items-action-col">
                      <TButton
                        variant="text"
                        theme="danger"
                        @click="$emit('remove-numeric-computation-item', mobileAgentDraft, itemIndex)"
                        >删除</TButton
                      >
                    </td>
                  </tr>
                </tbody>
              </table>
              <TButton variant="outline" @click="$emit('add-numeric-computation-item', mobileAgentDraft)"
                >新增数值项</TButton
              >
            </div>
          </TFormItem>
        </TForm>
        <TForm v-else label-align="top">
          <div class="form-grid-2">
            <TFormItem label="记忆间隔">
              <TInputNumber
                v-model="mobileAgentDraft.structuredMemoryInterval"
                :min="1"
                placeholder="3"
              />
            </TFormItem>
            <TFormItem label="历史消息条数">
              <TInputNumber
                v-model="mobileAgentDraft.structuredMemoryHistoryLimit"
                :min="1"
                placeholder="12"
              />
            </TFormItem>
          </div>
          <div class="agent-schema-card">
            <MemorySchemaEditor :schema="mobileAgentDraft.memorySchema" />
          </div>
        </TForm>
      </div>
      <div class="mobile-overlay-actions drawer-actions">
        <template v-if="agentEditorStep === 1">
          <TButton theme="primary" @click="$emit('next-agent-editor-step')">下一步</TButton>
        </template>
        <template v-else-if="agentEditorStep === 2">
          <div class="agent-editor-actions agent-editor-actions-split">
            <div class="agent-editor-actions-left">
              <TButton theme="default" variant="base" @click="$emit('previous-agent-editor-step')"
                >上一步</TButton
              >
            </div>
            <div class="agent-editor-actions-right">
              <TButton theme="primary" :loading="savingMobileAgent" @click="$emit('skip-agent-structure-setup')">
                跳过结构体设置
              </TButton>
              <TButton variant="outline" @click="$emit('next-agent-editor-step')">下一步</TButton>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="agent-editor-actions agent-editor-actions-split">
            <div class="agent-editor-actions-left">
              <TButton theme="default" variant="base" @click="$emit('previous-agent-editor-step')"
                >上一步</TButton
              >
            </div>
            <div class="agent-editor-actions-right">
              <TButton theme="primary" :loading="savingMobileAgent" @click="$emit('save-mobile-agent')"
                >确定</TButton
              >
            </div>
          </div>
        </template>
      </div>
    </div>
  </TDialog>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import { InfoCircleIcon, MoreIcon } from 'tdesign-icons-vue-next'

import {
  Button as TButton,
  Card as TCard,
  Dialog as TDialog,
  Drawer as TDrawer,
  Dropdown as TDropdown,
  Form as TForm,
  FormItem as TFormItem,
  Input as TInput,
  InputNumber as TInputNumber,
  Popup as TPopup,
  StepItem as TStepItem,
  Steps as TSteps,
  Switch as TSwitch,
  Textarea as TTextarea,
} from 'tdesign-vue-next'

import MemorySchemaEditor from '@/components/chat/MemorySchemaEditor.vue'
import type { AIRobotCard, NumericComputationItem } from '@/types/ai'

defineProps({
  isMobile: {
    type: Boolean,
    required: true,
  },
  newChatVisible: {
    type: Boolean,
    required: true,
  },
  agentManageVisible: {
    type: Boolean,
    required: true,
  },
  mobileAgentEditorVisible: {
    type: Boolean,
    required: true,
  },
  robotTemplates: {
    type: Array as PropType<AIRobotCard[]>,
    required: true,
  },
  selectedNewChatRobotId: {
    type: String,
    required: true,
  },
  isEditingAgentDraft: {
    type: Boolean,
    required: true,
  },
  agentEditorStep: {
    type: Number as PropType<1 | 2 | 3>,
    required: true,
  },
  mobileAgentDraft: {
    type: Object as PropType<AIRobotCard>,
    required: true,
  },
  savingMobileAgent: {
    type: Boolean,
    required: true,
  },
  agentCardActionOptions: {
    type: Array as PropType<Array<Record<string, unknown>>>,
    required: true,
  },
})

defineEmits<{
  (e: 'update:newChatVisible', value: boolean): void
  (e: 'update:agentManageVisible', value: boolean): void
  (e: 'update:mobileAgentEditorVisible', value: boolean): void
  (e: 'update:selectedNewChatRobotId', value: string): void
  (e: 'confirm-start-new-chat'): void
  (e: 'open-mobile-agent-edit-dialog', agentId: string): void
  (
    e: 'handle-agent-card-action',
    agentId: string,
    action?: string | number | Record<string, unknown>,
  ): void
  (e: 'open-mobile-agent-create-dialog'): void
  (e: 'add-agent-template'): void
  (e: 'next-agent-editor-step'): void
  (e: 'previous-agent-editor-step'): void
  (e: 'skip-agent-structure-setup'): void
  (e: 'save-mobile-agent'): void
  (e: 'remove-numeric-computation-item', target: { numericComputationItems: NumericComputationItem[] }, index: number): void
  (e: 'add-numeric-computation-item', target: { numericComputationItems: NumericComputationItem[] }): void
}>()
</script>
