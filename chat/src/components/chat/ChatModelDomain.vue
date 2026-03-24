<!-- eslint-disable vue/no-mutating-props -->
<template>
  <TDrawer
    v-if="isMobile"
    :visible="configVisible"
    placement="right"
    :footer="false"
    @update:visible="(value) => $emit('update:configVisible', value)"
  >
    <template #header> 模型配置 </template>
    <div class="mobile-overlay-body">
      <div class="config-layout" :class="{ mobile: isMobile }">
        <div class="config-list">
          <div v-if="modelConfigs.length" class="config-list-body">
            <TCard
              v-for="item in modelConfigs"
              :key="item.id"
              class="config-card"
              :class="{ active: item.id === activeModelConfigId }"
              hoverShadow
              @click="$emit('set-active-model-and-close', item.id)"
            >
              <template #title>
                <span class="config-card-name ellipsis-1" :title="item.name || '未命名配置'">{{
                  item.name || '未命名配置'
                }}</span>
              </template>
              <template #subtitle>
                <span
                  class="config-card-meta ellipsis-1"
                  :title="`${item.provider} / ${item.model || '未选择模型'}`"
                >
                  {{ item.provider }} / {{ item.model || '未选择模型' }}
                </span>
              </template>
              <template #actions>
                <TDropdown
                  trigger="click"
                  placement="bottom-right"
                  :options="modelCardActionOptions"
                  @click="(data) => $emit('handle-mobile-model-card-action', item.id, data.value)"
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
                :title="item.baseUrl || '未填写地址'"
              >
                {{ item.baseUrl || '未填写地址' }}
              </div>
              <div class="config-card-tag-list">
                <TTag
                  v-if="item.description"
                  theme="default"
                  variant="light"
                  class="config-card-tag"
                >
                  {{ item.description }}
                </TTag>
                <TTag
                  v-for="tag in item.tags"
                  :key="tag"
                  theme="default"
                  variant="light"
                  class="config-card-tag"
                >
                  {{ tag }}
                </TTag>
              </div>
            </TCard>
            <TCard
              class="config-card config-card-add"
              hoverShadow
              @click="$emit('open-mobile-model-create-dialog')"
            >
              <div class="config-card-add-media" aria-label="新增模型">
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
            @click="$emit('open-mobile-model-create-dialog')"
          >
            <div class="config-card-add-media" aria-label="新增模型">
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <path d="M32 14v36M14 32h36" />
              </svg>
            </div>
          </TCard>
        </div>
      </div>
    </div>
  </TDrawer>

  <TDrawer
    v-if="isMobile"
    :visible="mobileModelEditorVisible"
    placement="bottom"
    size="80%"
    :footer="false"
    @update:visible="(value) => $emit('update:mobileModelEditorVisible', value)"
  >
    <template #header>
      {{ mobileModelEditorMode === 'edit' ? '编辑模型配置' : '新增模型配置' }}
    </template>
    <div class="mobile-overlay-body">
      <TForm label-align="top">
        <div class="form-grid-2">
          <TFormItem label="配置名称">
            <TInput
              v-model="mobileModelDraft.name"
              placeholder="例如：DeepSeek 生产环境 / 本地 Ollama"
            />
          </TFormItem>
          <TFormItem label="接入方式">
            <TSelect
              v-model="mobileModelDraft.provider"
              :options="providerOptions"
              @change="(value) => $emit('handle-mobile-model-provider-change', value)"
            />
          </TFormItem>
          <TFormItem class="form-grid-span-2" label="Base URL">
            <TInput v-model="mobileModelDraft.baseUrl" placeholder="请输入 AI 服务地址" />
          </TFormItem>
          <TFormItem class="form-grid-span-2" label="上传到服务器">
            <TSwitch v-model="mobileModelDraft.persistToServer" />
          </TFormItem>
          <TFormItem v-if="mobileModelDraft.provider === 'openai'" label="API Key">
            <TInput
              v-model="mobileModelDraft.apiKey"
              type="password"
              placeholder="请输入 OpenAI API Key"
            />
          </TFormItem>
          <TFormItem label="模型">
            <div class="mobile-model-picker">
              <TButton variant="outline" @click="$emit('refresh-mobile-model-options')">刷新模型</TButton>
              <div
                v-if="modelOptionsMap[mobileModelDraft.id]?.length"
                class="mobile-model-button-list"
              >
                <TButton
                  v-for="item in modelOptionsMap[mobileModelDraft.id] || []"
                  :key="item.id"
                  :theme="mobileModelDraft.model === item.id ? 'primary' : 'default'"
                  variant="outline"
                  @click="mobileModelDraft.model = item.id"
                >
                  {{ item.label }}
                </TButton>
              </div>
              <div v-else class="config-empty">暂无模型候选，请先刷新模型</div>
            </div>
          </TFormItem>
          <TFormItem>
            <template #label>
              <span class="form-label-with-tip">
                温度
                <TPopup
                  content="范围 0 到 2。越低越稳定保守，越高越随机灵活；常用值一般在 0.7 左右。"
                  placement="top"
                >
                  <InfoCircleIcon class="form-label-tip-icon" />
                </TPopup>
              </span>
            </template>
            <TInputNumber
              :model-value="mobileTemperatureValue"
              :decimal-places="1"
              :step="0.1"
              :min="0"
              :max="2"
              @update:model-value="(value: number | undefined) => (mobileTemperatureValue = value)"
            />
          </TFormItem>
          <TFormItem label="标签配置">
            <TInput v-model="mobileTagsValue" placeholder="多个标签用逗号分隔" />
          </TFormItem>
        </div>
      </TForm>
      <div class="mobile-overlay-actions drawer-actions">
        <TButton block theme="primary" :loading="savingMobileModel" @click="$emit('save-mobile-model')">
          {{ mobileModelEditorMode === 'edit' ? '保存修改' : '新增模型配置' }}
        </TButton>
      </div>
    </div>
  </TDrawer>

  <TDialog
    v-else
    :visible="configVisible"
    header="模型配置"
    width="900px"
    :footer="false"
    :confirm-btn="null"
    :cancel-btn="null"
    @update:visible="(value) => $emit('update:configVisible', value)"
  >
    <div class="mobile-overlay-body">
      <div class="desktop-config-grid-shell">
        <div class="desktop-config-toolbar">
          <div class="config-list-header">
            <span class="config-title">已配置模型</span>
          </div>
        </div>
        <div v-if="modelConfigs.length" class="desktop-config-grid">
          <TCard
            v-for="item in modelConfigs"
            :key="item.id"
            class="config-card"
            :class="{ active: item.id === activeModelConfigId }"
            hoverShadow
            @click="$emit('set-active-model-and-close', item.id)"
          >
            <template #title>
              <span class="config-card-name ellipsis-1" :title="item.name || '未命名配置'">{{
                item.name || '未命名配置'
              }}</span>
            </template>
            <template #subtitle>
              <span
                class="config-card-meta ellipsis-1"
                :title="`${item.provider} / ${item.model || '未选择模型'}`"
              >
                {{ item.provider }} / {{ item.model || '未选择模型' }}
              </span>
            </template>
            <template #actions>
              <TDropdown
                trigger="click"
                placement="bottom-right"
                :options="modelCardActionOptions"
                @click="(data) => $emit('handle-desktop-model-card-action', item.id, data.value)"
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
              :title="item.baseUrl || '未填写地址'"
            >
              {{ item.baseUrl || '未填写地址' }}
            </div>
            <div class="config-card-tag-list">
              <TTag v-if="item.description" theme="default" variant="light" class="config-card-tag">
                {{ item.description }}
              </TTag>
              <TTag
                v-for="tag in item.tags"
                :key="tag"
                theme="default"
                variant="light"
                class="config-card-tag"
              >
                {{ tag }}
              </TTag>
            </div>
          </TCard>
          <TCard
            class="config-card config-card-add"
            hoverShadow
            @click="$emit('open-desktop-model-create-dialog')"
          >
            <div class="config-card-add-media" aria-label="新增模型">
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
          @click="$emit('open-desktop-model-create-dialog')"
        >
          <div class="config-card-add-media" aria-label="新增模型">
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
    :visible="desktopModelEditorVisible"
    :header="desktopModelEditorMode === 'edit' ? '编辑模型配置' : '新增模型配置'"
    width="760px"
    :footer="false"
    :confirm-btn="null"
    :cancel-btn="null"
    @update:visible="(value) => $emit('update:desktopModelEditorVisible', value)"
  >
    <div class="mobile-overlay-body">
      <TForm label-align="top">
        <div class="form-grid-2">
          <TFormItem label="配置名称">
            <TInput
              v-model="desktopModelDraft.name"
              placeholder="例如：DeepSeek 生产环境 / 本地 Ollama"
            />
          </TFormItem>
          <TFormItem label="接入方式">
            <TSelect
              v-model="desktopModelDraft.provider"
              :options="providerOptions"
              @change="(value) => $emit('handle-desktop-model-provider-change', value)"
            />
          </TFormItem>
          <TFormItem class="form-grid-span-2" label="Base URL">
            <TInput v-model="desktopModelDraft.baseUrl" placeholder="请输入 AI 服务地址" />
          </TFormItem>
          <TFormItem class="form-grid-span-2" label="上传到服务器">
            <TSwitch v-model="desktopModelDraft.persistToServer" />
          </TFormItem>
          <TFormItem v-if="desktopModelDraft.provider === 'openai'" label="API Key">
            <TInput
              v-model="desktopModelDraft.apiKey"
              type="password"
              placeholder="请输入 OpenAI API Key"
            />
          </TFormItem>
          <TFormItem label="模型">
            <TSpace align="center" class="config-model-row">
              <TSelect
                v-model="desktopModelDraft.model"
                class="config-model-select"
                :loading="loadingModels"
                :options="
                  (modelOptionsMap[desktopModelDraft.id] || []).map((item) => ({
                    label: item.label,
                    value: item.id,
                  }))
                "
                placeholder="请选择模型"
              />
              <TButton variant="outline" @click="$emit('refresh-desktop-model-options')">刷新模型</TButton>
            </TSpace>
          </TFormItem>
        </div>
        <div class="form-grid-2">
          <TFormItem>
            <template #label>
              <span class="form-label-with-tip">
                温度
                <TPopup
                  content="范围 0 到 2。越低越稳定保守，越高越随机灵活；常用值一般在 0.7 左右。"
                  placement="top"
                >
                  <InfoCircleIcon class="form-label-tip-icon" />
                </TPopup>
              </span>
            </template>
            <TInputNumber
              :model-value="desktopTemperatureValue"
              :decimal-places="1"
              :step="0.1"
              :min="0"
              :max="2"
              @update:model-value="(value: number | undefined) => (desktopTemperatureValue = value)"
            />
          </TFormItem>
          <TFormItem class="form-grid-span-2" label="标签配置">
            <TInput v-model="desktopTagsValue" placeholder="多个标签用逗号分隔" />
          </TFormItem>
        </div>
      </TForm>
      <div class="mobile-overlay-actions drawer-actions">
        <TButton block theme="primary" :loading="savingDesktopModel" @click="$emit('save-desktop-model')">
          {{ desktopModelEditorMode === 'edit' ? '保存修改' : '新增模型配置' }}
        </TButton>
      </div>
    </div>
  </TDialog>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import { computed } from 'vue'

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
  Select as TSelect,
  Space as TSpace,
  Switch as TSwitch,
  Tag as TTag,
} from 'tdesign-vue-next'
import { InfoCircleIcon, MoreIcon } from 'tdesign-icons-vue-next'

import type { AIModelConfigItem, ModelOption } from '@/types/ai'

type OptionItem = {
  label: string
  value: string
}

type CardAction = string | number | Record<string, unknown>

const props = defineProps({
  isMobile: {
    type: Boolean,
    required: true,
  },
  configVisible: {
    type: Boolean,
    required: true,
  },
  mobileModelEditorVisible: {
    type: Boolean,
    required: true,
  },
  desktopModelEditorVisible: {
    type: Boolean,
    required: true,
  },
  mobileModelEditorMode: {
    type: String as PropType<'create' | 'edit'>,
    required: true,
  },
  desktopModelEditorMode: {
    type: String as PropType<'create' | 'edit'>,
    required: true,
  },
  modelConfigs: {
    type: Array as PropType<AIModelConfigItem[]>,
    required: true,
  },
  activeModelConfigId: {
    type: String,
    required: true,
  },
  modelCardActionOptions: {
    type: Array as PropType<Array<Record<string, unknown>>>,
    required: true,
  },
  mobileModelDraft: {
    type: Object as PropType<AIModelConfigItem>,
    required: true,
  },
  desktopModelDraft: {
    type: Object as PropType<AIModelConfigItem>,
    required: true,
  },
  providerOptions: {
    type: Array as PropType<OptionItem[]>,
    required: true,
  },
  modelOptionsMap: {
    type: Object as PropType<Record<string, ModelOption[]>>,
    required: true,
  },
  mobileModelTemperatureValue: {
    type: Number,
    default: undefined,
  },
  desktopModelTemperatureValue: {
    type: Number,
    default: undefined,
  },
  mobileModelTagsInput: {
    type: String,
    required: true,
  },
  desktopModelTagsInput: {
    type: String,
    required: true,
  },
  savingMobileModel: {
    type: Boolean,
    required: true,
  },
  savingDesktopModel: {
    type: Boolean,
    required: true,
  },
  loadingModels: {
    type: Boolean,
    required: true,
  },
})

const emit = defineEmits<{
  (e: 'update:configVisible', value: boolean): void
  (e: 'update:mobileModelEditorVisible', value: boolean): void
  (e: 'update:desktopModelEditorVisible', value: boolean): void
  (e: 'update:mobileModelTagsInput', value: string): void
  (e: 'update:desktopModelTagsInput', value: string): void
  (e: 'update:mobileModelTemperatureValue', value: number | undefined): void
  (e: 'update:desktopModelTemperatureValue', value: number | undefined): void
  (e: 'set-active-model-and-close', modelId: string): void
  (e: 'open-mobile-model-create-dialog'): void
  (e: 'open-desktop-model-create-dialog'): void
  (e: 'handle-mobile-model-provider-change', value: unknown): void
  (e: 'handle-desktop-model-provider-change', value: unknown): void
  (e: 'refresh-mobile-model-options'): void
  (e: 'refresh-desktop-model-options'): void
  (e: 'handle-mobile-model-card-action', modelId: string, action?: CardAction): void
  (e: 'handle-desktop-model-card-action', modelId: string, action?: CardAction): void
  (e: 'save-mobile-model'): void
  (e: 'save-desktop-model'): void
}>()

const mobileTagsValue = computed({
  get: () => props.mobileModelTagsInput,
  set: (value: string) => emit('update:mobileModelTagsInput', value),
})

const desktopTagsValue = computed({
  get: () => props.desktopModelTagsInput,
  set: (value: string) => emit('update:desktopModelTagsInput', value),
})

const mobileTemperatureValue = computed({
  get: () => props.mobileModelTemperatureValue,
  set: (value: number | undefined) => emit('update:mobileModelTemperatureValue', value),
})

const desktopTemperatureValue = computed({
  get: () => props.desktopModelTemperatureValue,
  set: (value: number | undefined) => emit('update:desktopModelTemperatureValue', value),
})
</script>
