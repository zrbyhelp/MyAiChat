<template>
  <div class="memory-tree-node">
    <template v-if="isObjectValue(value)">
      <div class="memory-tree-branch">
        <div class="memory-tree-branch-label">
          <span class="memory-tree-caret">▾</span>
          <span>{{ label }}</span>
        </div>
        <div class="memory-tree-children">
          <MemoryValueTree
            v-for="(childValue, childKey) in value"
            :key="`${label}-${String(childKey)}`"
            :label="String(childKey)"
            :value="childValue"
          />
        </div>
      </div>
    </template>

    <template v-else-if="Array.isArray(value)">
      <div class="memory-tree-branch">
        <div class="memory-tree-branch-label">
          <span class="memory-tree-caret">▾</span>
          <span>{{ label }}</span>
          <span class="memory-tree-meta">[{{ value.length }}]</span>
        </div>
        <div class="memory-tree-children">
          <MemoryValueTree
            v-for="(childValue, childIndex) in value"
            :key="`${label}-${childIndex}`"
            :label="`[${childIndex}]`"
            :value="childValue"
          />
        </div>
      </div>
    </template>

    <template v-else>
      <div class="memory-tree-leaf">
        <span class="memory-tree-leaf-label">{{ label }}</span>
        <span class="memory-tree-leaf-separator">:</span>
        <span class="memory-tree-leaf-value">{{ formatLeafValue(value) }}</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'MemoryValueTree' })

defineProps<{
  label: string
  value: unknown
}>()

function isObjectValue(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatLeafValue(value: unknown) {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  if (value === null || value === undefined || value === '') {
    return '空'
  }
  return String(value)
}
</script>

<style scoped>
.memory-tree-node {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.memory-tree-branch,
.memory-tree-leaf {
  border-radius: 10px;
}

.memory-tree-branch-label,
.memory-tree-leaf {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 6px 10px;
  background: #f7f9fc;
  border: 1px solid #e8edf5;
  color: #1f2937;
  font-size: 13px;
}

.memory-tree-caret {
  color: #718096;
  font-size: 11px;
}

.memory-tree-meta {
  color: #8a94a7;
  font-size: 12px;
}

.memory-tree-children {
  margin-left: 18px;
  margin-top: 8px;
  padding-left: 12px;
  border-left: 1px dashed #d6dce8;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.memory-tree-leaf-label {
  font-weight: 600;
}

.memory-tree-leaf-separator {
  color: #8a94a7;
}

.memory-tree-leaf-value {
  color: #425466;
  word-break: break-word;
}
</style>
