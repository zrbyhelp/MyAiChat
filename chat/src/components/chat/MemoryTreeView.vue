<template>
  <div v-if="categories.length" class="memory-tree-view">
    <div
      v-for="category in categories"
      :key="category.categoryId"
      class="memory-tree-category"
    >
      <div class="memory-tree-category-head">
        <div class="memory-tree-category-title">{{ category.label || category.categoryId }}</div>
        <div class="memory-tree-category-meta">{{ category.items.length }} 条记录</div>
      </div>
      <div v-if="category.description" class="memory-tree-category-desc">{{ category.description }}</div>

      <div v-if="category.items.length" class="memory-tree-items">
        <details
          v-for="item in category.items"
          :key="item.id"
          class="memory-tree-item"
          open
        >
          <summary class="memory-tree-item-summary">
            <span class="memory-tree-item-title">{{ item.summary || item.id }}</span>
            <span v-if="item.updatedAt" class="memory-tree-item-meta">{{ item.updatedAt }}</span>
          </summary>
          <div class="memory-tree-item-body">
            <MemoryValueTree
              v-for="(value, key) in item.values"
              :key="`${item.id}-${String(key)}`"
              :label="String(key)"
              :value="value"
            />
          </div>
        </details>
      </div>

      <div v-else class="history-empty">暂无记录，说明当前会话还没有提取出这一类结构化记忆</div>
    </div>
  </div>

  <div v-else class="history-empty">当前会话还没有结构化记忆记录</div>
</template>

<script setup lang="ts">
import MemoryValueTree from '@/components/chat/MemoryValueTree.vue'

type StructuredMemoryTreeCategory = {
  categoryId: string
  label: string
  description: string
  items: Array<{
    id: string
    summary: string
    updatedAt: string
    values: Record<string, unknown>
  }>
}

defineProps<{
  categories: StructuredMemoryTreeCategory[]
}>()
</script>

<style scoped>
.memory-tree-view {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.memory-tree-category {
  border: 1px solid #e7ebf3;
  border-radius: 14px;
  background: #fff;
  padding: 14px;
}

.memory-tree-category-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.memory-tree-category-title {
  font-size: 14px;
  font-weight: 700;
  color: #1f2937;
}

.memory-tree-category-meta,
.memory-tree-category-desc {
  color: #7a8599;
  font-size: 12px;
}

.memory-tree-category-desc {
  margin-top: 6px;
  line-height: 1.6;
}

.memory-tree-items {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.memory-tree-item {
  border: 1px solid #edf1f7;
  border-radius: 12px;
  background: #fbfcfe;
}

.memory-tree-item-summary {
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  cursor: pointer;
}

.memory-tree-item-summary::-webkit-details-marker {
  display: none;
}

.memory-tree-item-title {
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
}

.memory-tree-item-meta {
  color: #8a94a7;
  font-size: 11px;
}

.memory-tree-item-body {
  padding: 0 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
