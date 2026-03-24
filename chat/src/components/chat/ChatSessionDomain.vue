<!-- eslint-disable vue/no-mutating-props -->
<template>
  <TDrawer
    v-if="isMobile"
    :visible="sessionRobotVisible"
    :header="false"
    placement="right"
    size="100%"
    :footer="false"
    @update:visible="(value) => $emit('update:sessionRobotVisible', value)"
  >
    <div class="mobile-overlay-body">
      <div class="mobile-overlay-topbar">
        <div class="mobile-overlay-title">编辑当前智能体</div>
        <TButton variant="text" @click="$emit('update:sessionRobotVisible', false)">关闭</TButton>
      </div>
      <div class="session-robot-shell">
        <div class="session-robot-hero">
          <div class="session-robot-avatar">
            <img v-if="sessionRobotDraft.avatar" :src="sessionRobotDraft.avatar" alt="" />
            <span v-else>{{ (sessionRobotDraft.name || '智').slice(0, 1) }}</span>
          </div>
          <div class="session-robot-hero-text">
            <div class="session-robot-hero-title">{{ sessionRobotDraft.name || '当前智能体' }}</div>
            <div class="session-robot-hero-subtitle">修改后仅作用于当前会话上下文</div>
          </div>
        </div>
        <div class="session-robot-form-card">
          <TForm label-align="top">
            <div class="form-grid-2">
              <TFormItem label="名称">
                <TInput
                  v-model="sessionRobotDraft.name"
                  placeholder="例如：销售顾问 / 数据分析师"
                />
              </TFormItem>
              <TFormItem label="头像">
                <TInput v-model="sessionRobotDraft.avatar" placeholder="请输入头像图片 URL" />
              </TFormItem>
            </div>
            <TFormItem label="System Prompt">
              <TTextarea
                v-model="sessionRobotDraft.systemPrompt"
                :autosize="{ minRows: 5, maxRows: 8 }"
              />
            </TFormItem>
            <TFormItem label="启用数值计算">
              <TSwitch v-model="sessionRobotDraft.numericComputationEnabled" />
            </TFormItem>
            <TFormItem v-if="sessionRobotDraft.numericComputationEnabled" label="数值计算提示词">
              <TTextarea
                v-model="sessionRobotDraft.numericComputationPrompt"
                :autosize="{ minRows: 4, maxRows: 7 }"
              />
            </TFormItem>
            <TFormItem v-if="sessionRobotDraft.numericComputationEnabled" label="数值结构体">
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
                      v-for="(item, itemIndex) in sessionRobotDraft.numericComputationItems"
                      :key="`session-mobile-${itemIndex}`"
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
                          @click="$emit('remove-numeric-computation-item', sessionRobotDraft, itemIndex)"
                          >删除</TButton
                        >
                      </td>
                    </tr>
                  </tbody>
                </table>
                <TButton variant="outline" @click="$emit('add-numeric-computation-item', sessionRobotDraft)"
                  >新增数值项</TButton
                >
              </div>
            </TFormItem>
          </TForm>
        </div>
      </div>
      <div class="mobile-overlay-actions drawer-actions">
        <TButton block theme="primary" @click="$emit('apply-session-robot')">应用到当前上下文</TButton>
      </div>
    </div>
  </TDrawer>
  <TDialog
    v-else
    :visible="sessionRobotVisible"
    header="编辑当前智能体"
    width="560px"
    :footer="false"
    :confirm-btn="null"
    :cancel-btn="null"
    @update:visible="(value) => $emit('update:sessionRobotVisible', value)"
  >
    <div class="mobile-overlay-body">
      <div class="session-robot-shell">
        <div class="session-robot-hero">
          <div class="session-robot-avatar">
            <img v-if="sessionRobotDraft.avatar" :src="sessionRobotDraft.avatar" alt="" />
            <span v-else>{{ (sessionRobotDraft.name || '智').slice(0, 1) }}</span>
          </div>
          <div class="session-robot-hero-text">
            <div class="session-robot-hero-title">{{ sessionRobotDraft.name || '当前智能体' }}</div>
            <div class="session-robot-hero-subtitle">修改后仅作用于当前会话上下文</div>
          </div>
        </div>
        <div class="session-robot-form-card">
          <TForm label-align="top">
            <div class="form-grid-2">
              <TFormItem label="名称">
                <TInput
                  v-model="sessionRobotDraft.name"
                  placeholder="例如：销售顾问 / 数据分析师"
                />
              </TFormItem>
              <TFormItem label="头像">
                <TInput v-model="sessionRobotDraft.avatar" placeholder="请输入头像图片 URL" />
              </TFormItem>
            </div>
            <TFormItem label="System Prompt">
              <TTextarea
                v-model="sessionRobotDraft.systemPrompt"
                :autosize="{ minRows: 5, maxRows: 8 }"
              />
            </TFormItem>
            <TFormItem label="启用数值计算">
              <TSwitch v-model="sessionRobotDraft.numericComputationEnabled" />
            </TFormItem>
            <TFormItem v-if="sessionRobotDraft.numericComputationEnabled" label="数值计算提示词">
              <TTextarea
                v-model="sessionRobotDraft.numericComputationPrompt"
                :autosize="{ minRows: 4, maxRows: 7 }"
              />
            </TFormItem>
            <TFormItem v-if="sessionRobotDraft.numericComputationEnabled" label="数值结构体">
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
                      v-for="(item, itemIndex) in sessionRobotDraft.numericComputationItems"
                      :key="`session-desktop-${itemIndex}`"
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
                          @click="$emit('remove-numeric-computation-item', sessionRobotDraft, itemIndex)"
                          >删除</TButton
                        >
                      </td>
                    </tr>
                  </tbody>
                </table>
                <TButton variant="outline" @click="$emit('add-numeric-computation-item', sessionRobotDraft)"
                  >新增数值项</TButton
                >
              </div>
            </TFormItem>
          </TForm>
        </div>
      </div>
      <div class="mobile-overlay-actions drawer-actions">
        <TButton block theme="primary" @click="$emit('apply-session-robot')">应用到当前上下文</TButton>
      </div>
    </div>
  </TDialog>

  <TDrawer
    v-if="isMobile"
    :visible="memoryVisible"
    :header="false"
    placement="right"
    size="100%"
    :footer="false"
    @update:visible="(value) => $emit('update:memoryVisible', value)"
  >
    <div class="mobile-overlay-body">
      <div class="mobile-overlay-topbar">
        <div class="mobile-overlay-title">结构化记忆</div>
        <TButton variant="text" @click="$emit('update:memoryVisible', false)">关闭</TButton>
      </div>
      <div class="memory-meta">
        <div>最近更新时间：{{ memoryUpdatedLabel }}</div>
        <div>分类：{{ currentMemorySchema.categories.length }}</div>
        <div>记录：{{ structuredMemoryRecordCount }}</div>
      </div>
        <div class="session-robot-form-card">
          <TForm label-align="top">
            <div class="form-grid-2">
              <TFormItem label="结构化记忆处理间隔">
              <TInputNumber
                v-model="sessionMemoryDraft.structuredMemoryInterval"
                :min="1"
                placeholder="3"
              />
            </TFormItem>
              <TFormItem label="提示词历史消息条数">
                <TInputNumber
                  v-model="sessionMemoryDraft.structuredMemoryHistoryLimit"
                  :min="1"
                  placeholder="12"
                />
              </TFormItem>
            </div>
          </TForm>
        </div>
      <MemoryTreeView :categories="memoryDisplayCategories" />
      <div class="mobile-overlay-actions drawer-actions">
        <TButton block theme="primary" @click="$emit('apply-session-memory-settings')">保存记忆设置</TButton>
      </div>
    </div>
  </TDrawer>
  <TDialog
    v-else
    :visible="memoryVisible"
    header="结构化记忆"
    width="640px"
    :footer="false"
    :confirm-btn="null"
    :cancel-btn="null"
    @update:visible="(value) => $emit('update:memoryVisible', value)"
  >
    <div class="mobile-overlay-body">
      <div class="memory-meta">
        <div>最近更新时间：{{ memoryUpdatedLabel }}</div>
        <div>分类：{{ currentMemorySchema.categories.length }}</div>
        <div>记录：{{ structuredMemoryRecordCount }}</div>
      </div>
        <div class="session-robot-form-card">
          <TForm label-align="top">
            <div class="form-grid-2">
              <TFormItem label="结构化记忆处理间隔">
              <TInputNumber
                v-model="sessionMemoryDraft.structuredMemoryInterval"
                :min="1"
                placeholder="3"
              />
            </TFormItem>
              <TFormItem label="提示词历史消息条数">
                <TInputNumber
                  v-model="sessionMemoryDraft.structuredMemoryHistoryLimit"
                  :min="1"
                  placeholder="12"
                />
              </TFormItem>
            </div>
          </TForm>
        </div>
      <MemoryTreeView :categories="memoryDisplayCategories" />
      <div class="mobile-overlay-actions drawer-actions">
        <TButton block theme="primary" @click="$emit('apply-session-memory-settings')">保存记忆设置</TButton>
      </div>
    </div>
  </TDialog>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'

import {
  Button as TButton,
  Dialog as TDialog,
  Drawer as TDrawer,
  Form as TForm,
  FormItem as TFormItem,
  Input as TInput,
  InputNumber as TInputNumber,
  Textarea as TTextarea,
} from 'tdesign-vue-next'

import MemoryTreeView from '@/components/chat/MemoryTreeView.vue'
import type {
  MemorySchemaState,
  NumericComputationItem,
  SessionMemoryState,
  SessionRobotState,
  StructuredMemoryCategory,
} from '@/types/ai'

defineProps({
  isMobile: {
    type: Boolean,
    required: true,
  },
  sessionRobotVisible: {
    type: Boolean,
    required: true,
  },
  memoryVisible: {
    type: Boolean,
    required: true,
  },
  sessionRobotDraft: {
    type: Object as PropType<SessionRobotState>,
    required: true,
  },
  sessionMemoryDraft: {
    type: Object as PropType<SessionMemoryState>,
    required: true,
  },
  memoryUpdatedLabel: {
    type: String,
    required: true,
  },
  currentMemorySchema: {
    type: Object as PropType<MemorySchemaState>,
    required: true,
  },
  structuredMemoryRecordCount: {
    type: Number,
    required: true,
  },
  memoryDisplayCategories: {
    type: Array as PropType<StructuredMemoryCategory[]>,
    required: true,
  },
})

defineEmits<{
  (e: 'update:sessionRobotVisible', value: boolean): void
  (e: 'update:memoryVisible', value: boolean): void
  (e: 'apply-session-robot'): void
  (e: 'apply-session-memory-settings'): void
  (
    e: 'remove-numeric-computation-item',
    target: { numericComputationItems: NumericComputationItem[] },
    index: number,
  ): void
  (
    e: 'add-numeric-computation-item',
    target: { numericComputationItems: NumericComputationItem[] },
  ): void
}>()
</script>
