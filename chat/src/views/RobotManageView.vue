<template>
  <div class="page">
    <div class="page-header">
      <div class="page-header-main">
        <TButton variant="outline" class="back-button" @click="goBack">返回聊天</TButton>
        <div class="page-heading">
          <div class="title">机器人卡片</div>
          <div class="subtitle">这里只维护可复用的机器人模板，不会直接影响聊天页当前上下文。</div>
        </div>
      </div>
      <TSpace align="center" class="page-header-actions">
        <TButton variant="outline" @click="addRobot">新增卡片</TButton>
        <TButton theme="primary" :loading="saving" @click="saveRobotCards">保存</TButton>
      </TSpace>
    </div>

    <div class="grid">
      <div v-for="(robot, index) in robots" :key="robot.id" class="card">
        <TSpace align="center" class="card-head">
          <span class="card-title">机器人卡片 {{ index + 1 }}</span>
          <TButton variant="text" theme="danger" @click="removeRobot(robot.id)">删除</TButton>
        </TSpace>
        <TForm label-align="top">
          <TFormItem label="名称">
            <TInput v-model="robot.name" placeholder="例如：销售顾问" />
          </TFormItem>
          <TFormItem label="简介">
            <TInput v-model="robot.description" placeholder="用于卡片展示的说明" />
          </TFormItem>
          <TFormItem label="头像">
            <TInput v-model="robot.avatar" placeholder="请输入头像图片 URL" />
          </TFormItem>
          <TFormItem label="System Prompt">
            <TTextarea v-model="robot.systemPrompt" :autosize="{ minRows: 6, maxRows: 10 }" />
          </TFormItem>
        </TForm>
      </div>
    </div>

    <div class="mobile-actions">
      <TButton variant="outline" block @click="addRobot">新增卡片</TButton>
      <TButton theme="primary" block :loading="saving" @click="saveRobotCards">保存</TButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button as TButton, Form as TForm, FormItem as TFormItem, Input as TInput, MessagePlugin, Space as TSpace, Textarea as TTextarea } from 'tdesign-vue-next'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { getRobots, saveRobots } from '@/lib/api'
import type { AIRobotCard } from '@/types/ai'

function createRobotCard(): AIRobotCard {
  return {
    id: `robot-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: '新机器人',
    description: '',
    avatar: '',
    systemPrompt: '',
  }
}

const router = useRouter()
const saving = ref(false)
const robots = ref<AIRobotCard[]>([])

function goBack() {
  router.push({ name: 'chat' })
}

function addRobot() {
  robots.value = [...robots.value, createRobotCard()]
}

function removeRobot(robotId: string) {
  robots.value = robots.value.filter((item) => item.id !== robotId)
}

async function loadRobots() {
  try {
    const response = await getRobots()
    robots.value = response.robots.length ? response.robots : [createRobotCard()]
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '加载机器人失败')
  }
}

async function saveRobotCards() {
  saving.value = true
  try {
        const payload = robots.value.length
      ? robots.value.map((item, index) => ({
          ...item,
          name: item.name.trim() || `机器人 ${index + 1}`,
          description: item.description.trim(),
          avatar: item.avatar.trim(),
        }))
      : [createRobotCard()]

    const response = await saveRobots(payload)
    robots.value = response.robots
    MessagePlugin.success('机器人卡片已保存')
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(loadRobots)
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 24px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
  gap: 16px;
}

.page-header-main {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}

.page-heading {
  min-width: 0;
}

.page-header-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.title {
  font-size: 20px;
  font-weight: 600;
}

.subtitle {
  font-size: 12px;
  color: #888;
  margin-top: 4px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
}

.card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
}

.card-head {
  width: 100%;
  justify-content: space-between;
  margin-bottom: 8px;
}

.card-title {
  font-weight: 600;
}

.mobile-actions {
  display: none;
}

@media (max-width: 768px) {
  .page {
    padding: 16px 12px 88px;
  }

  .page-header {
    flex-direction: column;
    margin-bottom: 16px;
  }

  .page-header-main {
    width: 100%;
    flex-direction: column;
    gap: 10px;
  }

  .page-header-actions {
    display: none;
  }

  .back-button {
    width: fit-content;
  }

  .title {
    font-size: 18px;
  }

  .subtitle {
    line-height: 1.6;
  }

  .grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .card {
    border-radius: 14px;
    padding: 14px 12px;
  }

  .card-head {
    align-items: flex-start;
  }

  .card :deep(.t-textarea__inner) {
    min-height: 220px;
  }

  .mobile-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    position: fixed;
    left: 12px;
    right: 12px;
    bottom: 12px;
    z-index: 5;
    padding: 10px;
    border-radius: 14px;
    background: rgba(245, 245, 245, 0.96);
    backdrop-filter: blur(10px);
  }
}
</style>
