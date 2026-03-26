<template>
  <div class="memory-schema-tree-table">
    <el-table
      v-if="rows.length"
      :data="rows"
      row-key="id"
      border
      size="small"
      fit
      default-expand-all
      :tree-props="{ children: 'children' }"
      class="memory-schema-tree-table__table"
      style="width: 100%; max-width: 100%"
    >
      <el-table-column label="名称" min-width="180">
        <template #default="{ row }">
          <div class="memory-schema-name-cell">
            <template v-if="row.kind === 'field'">
              <TInput v-model="row.field.label" placeholder="例如：任务标题" />
            </template>
            <template v-else-if="row.kind === 'option'">
              <TInput v-model="row.option.label" placeholder="选项标签" />
            </template>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="键 / 值" min-width="150">
        <template #default="{ row }">
          <template v-if="row.kind === 'field'">
            <TInput v-model="row.field.name" placeholder="例如：title" />
          </template>
          <template v-else-if="row.kind === 'option' || row.kind === 'itemOption'">
            <TInput v-model="row.option.value" placeholder="选项值" />
          </template>
        </template>
      </el-table-column>

      <el-table-column label="类型 / 配置" width="160">
        <template #default="{ row }">
          <template v-if="row.kind === 'field'">
            <TSelect
              v-model="row.field.type"
              :options="fieldTypeOptions"
              @change="handleFieldTypeChange(row.field)"
            />
          </template>
          <template v-else-if="row.kind === 'option'">
            <div class="memory-schema-meta-label">枚举选项</div>
          </template>
        </template>
      </el-table-column>

      <el-table-column label="必填" width="90" align="center">
        <template #default="{ row }">
          <template v-if="row.kind === 'field'">
            <TCheckbox v-model="row.field.required">必填</TCheckbox>
          </template>
          <template v-else>
            <span class="memory-schema-muted">-</span>
          </template>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="120" align="right">
        <template #default="{ row }">
          <div class="memory-schema-row-actions">
            <template v-if="row.kind === 'field'">
              <TButton
                v-if="row.field.type === 'enum'"
                size="small"
                variant="text"
                theme="primary"
                @click="addOption(row.field)"
              >
                加选项
              </TButton>
              <TButton size="small" variant="text" theme="danger" @click="removeFieldById(row.id)">
                删除
              </TButton>
            </template>

            <template v-else-if="row.kind === 'option'">
              <TButton size="small" variant="text" theme="danger" @click="removeOption(row.parentField, row.optionIndex)">
                删除
              </TButton>
            </template>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <div v-else class="memory-schema-empty">暂无字段，点击上方新增</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ElTable, ElTableColumn } from 'element-plus'
import {
  Checkbox as TCheckbox,
  Button as TButton,
  Input as TInput,
  Select as TSelect,
} from 'tdesign-vue-next'

import type { MemorySchemaField, MemorySchemaOption } from '@/types/ai'

defineOptions({ name: 'MemorySchemaFieldEditor' })

type FieldTreeRow =
  | {
      id: string
      kind: 'field'
      field: MemorySchemaField
      children?: FieldTreeRow[]
    }
  | {
      id: string
      kind: 'option'
      option: MemorySchemaOption
      optionIndex: number
      parentField: MemorySchemaField
    }

const props = defineProps<{
  fields: MemorySchemaField[]
}>()

const fieldTypeOptions = [
  { label: '文本', value: 'text' },
  { label: '数字', value: 'number' },
  { label: '枚举', value: 'enum' },
  { label: '布尔', value: 'boolean' },
]

const rows = computed<FieldTreeRow[]>(() => buildRows(props.fields))

function buildRows(fields: MemorySchemaField[]): FieldTreeRow[] {
  return fields.map((field) => ({
    id: field.id,
    kind: 'field',
    field,
    children: buildChildren(field),
  }))
}

function buildChildren(field: MemorySchemaField): FieldTreeRow[] | undefined {
  if (field.type === 'enum') {
    return (field.options || []).map((option, optionIndex) => ({
      id: `${field.id}::option::${optionIndex}`,
      kind: 'option',
      option,
      optionIndex,
      parentField: field,
    }))
  }

  return undefined
}

function removeFieldById(fieldId: string) {
  removeFieldFromList(props.fields, fieldId)
}

function removeFieldFromList(fields: MemorySchemaField[], fieldId: string): boolean {
  const index = fields.findIndex((field) => field.id === fieldId)
  if (index >= 0) {
    fields.splice(index, 1)
    return true
  }
  return false
}

function handleFieldTypeChange(field: MemorySchemaField) {
  field.options = []
}

function addOption(field: MemorySchemaField) {
  field.options = [...(field.options || []), { label: '', value: '' }]
}

function removeOption(field: MemorySchemaField, index: number) {
  field.options = (field.options || []).filter((_, optionIndex) => optionIndex !== index)
}
</script>

<style scoped>
.memory-schema-tree-table {
  width: 100%;
  min-width: 0;
}

.memory-schema-tree-table__table :deep(.t-input),
.memory-schema-tree-table__table :deep(.t-input__wrap),
.memory-schema-tree-table__table :deep(.t-select) {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.memory-schema-tree-table__table :deep(.cell) {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.memory-schema-meta-label {
  color: #526071;
  font-size: 12px;
  font-weight: 600;
}

.memory-schema-muted {
  color: #9aa4b2;
  font-size: 12px;
}

.memory-schema-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.memory-schema-name-cell :deep(.t-input) {
  flex: 1;
  min-width: 0;
}

.memory-schema-row-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  flex-wrap: wrap;
}

.memory-schema-empty {
  padding: 14px;
  border: 1px dashed #d7dfec;
  border-radius: 14px;
  background: #f8fbff;
  color: #7b8798;
  font-size: 12px;
  text-align: center;
}

@media (max-width: 900px) {
  .memory-schema-row-actions {
    justify-content: flex-start;
  }
}
</style>
