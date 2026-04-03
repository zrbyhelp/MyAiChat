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
              <TFormItem label="故事梗概模型">
                <TSelect
                  v-model="sessionRobotDraft.outlineModelConfigId"
                  :options="auxModelOptions"
                  placeholder="未单独配置，默认跟随正文模型"
                  clearable
                />
              </TFormItem>
            </div>
            <div class="form-grid-2">
              <TFormItem label="知识检索模型">
                <TSelect
                  v-model="sessionRobotDraft.knowledgeRetrievalModelConfigId"
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
              <TFormItem label="故事梗概模型">
                <TSelect
                  v-model="sessionRobotDraft.outlineModelConfigId"
                  :options="auxModelOptions"
                  placeholder="未单独配置，默认跟随正文模型"
                  clearable
                />
              </TFormItem>
            </div>
            <div class="form-grid-2">
              <TFormItem label="知识检索模型">
                <TSelect
                  v-model="sessionRobotDraft.knowledgeRetrievalModelConfigId"
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
        <div>长期记忆：{{ currentStructuredMemory.longTermMemory ? '已生成' : '暂无' }}</div>
        <div>短期记忆：{{ currentStructuredMemory.shortTermMemory ? '已生成' : '暂无' }}</div>
        <div>记录：{{ structuredMemoryRecordCount }}</div>
      </div>
      <div class="session-robot-form-card memory-text-card">
        <div class="memory-text-block">
          <strong>长期记忆</strong>
          <p>{{ currentStructuredMemory.longTermMemory || '暂无长期记忆' }}</p>
        </div>
        <div class="memory-text-block">
          <strong>短期记忆</strong>
          <p>{{ currentStructuredMemory.shortTermMemory || '暂无短期记忆' }}</p>
        </div>
      </div>
      <div class="mobile-overlay-actions drawer-actions">
        <TButton block theme="primary" @click="$emit('update:memoryVisible', false)">关闭</TButton>
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
        <div>长期记忆：{{ currentStructuredMemory.longTermMemory ? '已生成' : '暂无' }}</div>
        <div>短期记忆：{{ currentStructuredMemory.shortTermMemory ? '已生成' : '暂无' }}</div>
        <div>记录：{{ structuredMemoryRecordCount }}</div>
      </div>
      <div class="session-robot-form-card memory-text-card">
        <div class="memory-text-block">
          <strong>长期记忆</strong>
          <p>{{ currentStructuredMemory.longTermMemory || '暂无长期记忆' }}</p>
        </div>
        <div class="memory-text-block">
          <strong>短期记忆</strong>
          <p>{{ currentStructuredMemory.shortTermMemory || '暂无短期记忆' }}</p>
        </div>
      </div>
      <div class="mobile-overlay-actions drawer-actions">
        <TButton block theme="primary" @click="$emit('update:memoryVisible', false)">关闭</TButton>
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
  Select as TSelect,
} from 'tdesign-vue-next'

import type {
  MemorySchemaState,
  SessionMemoryState,
  SessionRobotState,
  StructuredMemoryState,
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
  currentStructuredMemory: {
    type: Object as PropType<StructuredMemoryState>,
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
