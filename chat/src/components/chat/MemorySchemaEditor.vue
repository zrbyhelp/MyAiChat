<!-- eslint-disable vue/no-mutating-props -->
<template>
  <div class="memory-schema-editor">
    <div v-if="schema.categories.length" class="memory-schema-category-list">
      <TCard
        v-for="(category, categoryIndex) in schema.categories"
        :key="category.id"
        class="memory-schema-category-card"
        hoverShadow
        @click="openEditDialog(categoryIndex)"
      >
        <template #header>
          <div class="memory-schema-category-top">
            <div class="memory-schema-category-main">
              <div class="memory-schema-category-title ellipsis-1" :title="category.label || category.id || `分类 ${categoryIndex + 1}`">
                {{ category.label || category.id || `分类 ${categoryIndex + 1}` }}
              </div>
              <div class="memory-schema-category-subtitle" :title="category.description || '暂无分类说明'">
                {{ category.description || '暂无分类说明' }}
              </div>
            </div>
          </div>
        </template>
        <template #actions>
          <TDropdown
            trigger="click"
            placement="bottom-right"
            :options="categoryActionOptions"
            @click="(data) => handleCategoryAction(categoryIndex, data.value)"
          >
            <TButton size="small" variant="text" @click.stop>操作</TButton>
          </TDropdown>
        </template>

        <div class="memory-schema-category-desc">
          <TTag theme="primary" variant="light">{{ category.fields.length }} 个字段</TTag>
        </div>

        <div class="memory-schema-category-instructions ellipsis-2" :title="category.extractionInstructions || '暂无抽取规则'">
          {{ category.extractionInstructions || '暂无抽取规则' }}
        </div>
      </TCard>

      <TCard class="memory-schema-category-card memory-schema-category-card-add" hoverShadow @click="openCreateDialog">
        <div class="memory-schema-add-media" aria-label="新增记忆分类">
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <path d="M32 14v36M14 32h36" />
          </svg>
        </div>
      </TCard>
    </div>

    <TCard v-else class="memory-schema-category-card memory-schema-category-card-add" hoverShadow @click="openCreateDialog">
      <div class="memory-schema-add-media" aria-label="新增记忆分类">
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M32 14v36M14 32h36" />
        </svg>
      </div>
    </TCard>

    <TDialog
      v-model:visible="dialogVisible"
      destroy-on-close
      width="1080px"
      :header="editingIndex === null ? '新增记忆分类' : '编辑记忆分类'"
      :confirm-btn="null"
      :cancel-btn="null"
      :footer="false"
    >
      <div v-if="draftCategory" class="memory-schema-dialog">
        <div class="memory-schema-dialog-meta">
          <TForm label-align="top">
            <div class="memory-schema-dialog-grid">
              <TFormItem label="分类标题">
                <TInput v-model="draftCategory.label" placeholder="例如：用户偏好 / 长期记忆" />
              </TFormItem>
              <TFormItem label="分类 ID">
                <TInput v-model="draftCategory.id" placeholder="例如：preferences / long_term_memory" />
              </TFormItem>
            </div>
            <TFormItem label="分类说明">
              <TInput v-model="draftCategory.description" placeholder="这类记忆主要记录什么" />
            </TFormItem>
            <TFormItem label="抽取规则">
              <TTextarea
                v-model="draftCategory.extractionInstructions"
                :autosize="{ minRows: 3, maxRows: 5 }"
                placeholder="告诉智能体这一类应该提取哪些长期信息"
              />
            </TFormItem>
          </TForm>
        </div>

          <TCard class="memory-schema-dialog-fields" title="字段结构">
            <template #actions>
              <TButton size="small" theme="primary" variant="outline" @click="addField(draftCategory)">
                新增字段
              </TButton>
            </template>
            <div class="memory-schema-dialog-head">
              <div>
                <div class="memory-schema-dialog-hint">按字段行编辑，嵌套结构会继续以子表形式展示</div>
              </div>
            </div>

            <MemorySchemaFieldEditor :fields="draftCategory.fields" />
          </TCard>

        <div class="memory-schema-dialog-actions">
          <TButton v-if="editingIndex !== null" theme="danger" variant="text" @click="deleteEditingCategory">
            删除分类
          </TButton>
          <div class="memory-schema-dialog-actions-right">
            <TButton variant="outline" @click="closeDialog">取消</TButton>
            <TButton theme="primary" @click="saveCategory">保存并关闭</TButton>
          </div>
        </div>
      </div>
    </TDialog>
  </div>
</template>

<script setup lang="ts">
/* eslint-disable vue/no-mutating-props */
import {
  Button as TButton,
  Card as TCard,
  Dialog as TDialog,
  Dropdown as TDropdown,
  Form as TForm,
  FormItem as TFormItem,
  Input as TInput,
  Tag as TTag,
  Textarea as TTextarea,
} from 'tdesign-vue-next'
import { ref } from 'vue'

import MemorySchemaFieldEditor from '@/components/chat/MemorySchemaFieldEditor.vue'
import type { MemorySchemaCategory, MemorySchemaField, MemorySchemaState } from '@/types/ai'

const props = defineProps<{
  schema: MemorySchemaState
}>()

const dialogVisible = ref(false)
const editingIndex = ref<number | null>(null)
const draftCategory = ref<MemorySchemaCategory | null>(null)
const categoryActionOptions = [
  { content: '编辑分类', value: 'edit' },
  { content: '删除', value: 'delete', theme: 'error' as const },
]

function cloneCategory(category: MemorySchemaCategory): MemorySchemaCategory {
  return JSON.parse(JSON.stringify(category)) as MemorySchemaCategory
}

function createField(): MemorySchemaField {
  return {
    id: `field-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: '',
    label: '',
    type: 'text',
    required: false,
    options: [],
    fields: [],
    itemType: 'text',
    itemOptions: [],
    itemFields: [],
  }
}

function createCategory(): MemorySchemaCategory {
  return {
    id: `category-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    label: '',
    description: '',
    extractionInstructions: '',
    fields: [],
  }
}

function openCreateDialog() {
  editingIndex.value = null
  draftCategory.value = createCategory()
  dialogVisible.value = true
}

function openEditDialog(index: number) {
  editingIndex.value = index
  draftCategory.value = cloneCategory(props.schema.categories[index] as MemorySchemaCategory)
  dialogVisible.value = true
}

function closeDialog() {
  dialogVisible.value = false
  editingIndex.value = null
  draftCategory.value = null
}

function saveCategory() {
  if (!draftCategory.value) {
    return
  }
  const nextCategory = cloneCategory(draftCategory.value)
  if (editingIndex.value === null) {
    props.schema.categories.push(nextCategory)
  } else {
    props.schema.categories.splice(editingIndex.value, 1, nextCategory)
  }
  closeDialog()
}

function removeCategory(index: number) {
  props.schema.categories.splice(index, 1)
  if (editingIndex.value === index) {
    closeDialog()
  }
}

function handleCategoryAction(index: number, action?: string | number | Record<string, unknown>) {
  const nextAction = String(action || '')
  if (nextAction === 'edit') {
    openEditDialog(index)
    return
  }
  if (nextAction === 'delete') {
    removeCategory(index)
  }
}

function deleteEditingCategory() {
  if (editingIndex.value === null) {
    return
  }
  removeCategory(editingIndex.value)
}

function addField(category: MemorySchemaCategory) {
  category.fields.push(createField())
}
</script>

<style scoped>
.memory-schema-editor {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.memory-schema-category-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.memory-schema-category-card {
  cursor: pointer;
}

.memory-schema-category-card :deep(.t-card__header),
.memory-schema-category-card :deep(.t-card__body),
.memory-schema-category-card :deep(.t-card__actions) {
  min-width: 0;
}

.memory-schema-category-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.memory-schema-category-main {
  min-width: 0;
}

.memory-schema-category-title {
  font-size: 16px;
  font-weight: 700;
  color: #162033;
  line-height: 1.3;
}

.memory-schema-category-subtitle {
  margin-top: 4px;
  color: #738096;
  font-size: 12px;
}

.memory-schema-category-desc {
  margin-bottom: 12px;
  color: #334155;
  font-size: 13px;
  line-height: 1.6;
}

.memory-schema-category-instructions {
  flex: 1;
  color: #607089;
  font-size: 12px;
  line-height: 1.7;
}

.memory-schema-category-card-add {
  display: flex;
  align-items: center;
  justify-content: center;
}

.memory-schema-add-media {
  width: 48px;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.memory-schema-add-media svg {
  width: 24px;
  height: 24px;
  stroke: #3b82f6;
  stroke-width: 4;
  stroke-linecap: round;
  fill: none;
}

.ellipsis-1 {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ellipsis-2 {
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.memory-schema-dialog {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

.memory-schema-dialog-meta,
.memory-schema-dialog-fields {
  background: #fbfdff;
  min-width: 0;
}

.memory-schema-dialog-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.memory-schema-dialog-head {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 16px;
  margin-bottom: 14px;
}

.memory-schema-dialog-hint {
  margin-top: 4px;
  color: #7b8798;
  font-size: 12px;
}

.memory-schema-dialog-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.memory-schema-dialog-actions-right {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-left: auto;
}

@media (max-width: 900px) {
  .memory-schema-category-list {
    grid-template-columns: 1fr;
  }

  .memory-schema-dialog-grid {
    grid-template-columns: 1fr;
  }
}
</style>
