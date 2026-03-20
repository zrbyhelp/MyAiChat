<template>
  <div class="placeholder-pane">
    <div class="placeholder-title">{{ title }}</div>
    <div class="placeholder-text">内容建设中</div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
}>()
</script>

<style scoped>
.placeholder-pane {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.placeholder-title {
  font-size: 28px;
  font-weight: 600;
  color: #222;
}

.placeholder-text {
  font-size: 14px;
  color: #888;
}
</style>
