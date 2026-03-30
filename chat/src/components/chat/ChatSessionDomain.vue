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
        <div class="session-robot-form-card">
          <TForm label-align="top">
            <div class="form-grid-2">
              <TFormItem label="记忆模型">
                <TSelect
                  v-model="sessionRobotDraft.memoryModelConfigId"
                  :options="auxModelOptions"
                  placeholder="未单独配置，默认跟随正文模型"
                  clearable
                />
              </TFormItem>
              <TFormItem label="世界图谱模型">
                <TSelect
                  v-model="sessionRobotDraft.worldGraphModelConfigId"
                  :options="auxModelOptions"
                  placeholder="未单独配置，默认跟随正文模型"
                  clearable
                />
              </TFormItem>
            </div>
            <div class="form-grid-2">
              <TFormItem label="表单选项生成模型">
                <TSelect
                  v-model="sessionRobotDraft.formOptionModelConfigId"
                  :options="auxModelOptions"
                  placeholder="未单独配置，默认跟随正文模型"
                  clearable
                />
              </TFormItem>
            </div>
            <TFormItem label="数值计算模型">
              <TSelect
                v-model="sessionRobotDraft.numericComputationModelConfigId"
                :options="auxModelOptions"
                placeholder="未单独配置，默认跟随正文模型"
                clearable
              />
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
        <div class="session-robot-form-card">
          <TForm label-align="top">
            <div class="form-grid-2">
              <TFormItem label="记忆模型">
                <TSelect
                  v-model="sessionRobotDraft.memoryModelConfigId"
                  :options="auxModelOptions"
                  placeholder="未单独配置，默认跟随正文模型"
                  clearable
                />
              </TFormItem>
              <TFormItem label="世界图谱模型">
                <TSelect
                  v-model="sessionRobotDraft.worldGraphModelConfigId"
                  :options="auxModelOptions"
                  placeholder="未单独配置，默认跟随正文模型"
                  clearable
                />
              </TFormItem>
            </div>
            <div class="form-grid-2">
              <TFormItem label="表单选项生成模型">
                <TSelect
                  v-model="sessionRobotDraft.formOptionModelConfigId"
                  :options="auxModelOptions"
                  placeholder="未单独配置，默认跟随正文模型"
                  clearable
                />
              </TFormItem>
            </div>
            <TFormItem label="数值计算模型">
              <TSelect
                v-model="sessionRobotDraft.numericComputationModelConfigId"
                :options="auxModelOptions"
                placeholder="未单独配置，默认跟随正文模型"
                clearable
              />
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
  InputNumber as TInputNumber,
  Select as TSelect,
} from 'tdesign-vue-next'

import MemoryTreeView from '@/components/chat/MemoryTreeView.vue'
import type {
  MemorySchemaState,
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
  auxModelOptions: {
    type: Array as PropType<Array<{ label: string; value: string }>>,
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
}>()
</script>
