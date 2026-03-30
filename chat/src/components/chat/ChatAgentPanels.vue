<!-- eslint-disable vue/no-mutating-props -->
<template>
  <TDrawer
    v-if="isMobile"
    :visible="newChatVisible"
    :header="false"
    placement="right"
    size="100%"
    :footer="false"
    @update:visible="(value) => $emit('update:newChatVisible', value)"
  >
    <div class="mobile-overlay-body">
      <div class="mobile-overlay-topbar">
        <div class="mobile-overlay-title">选择智能体</div>
        <TButton variant="text" @click="$emit('update:newChatVisible', false)">关闭</TButton>
      </div>
      <div v-if="robotTemplates.length" class="robot-picker-grid">
        <TCard
          v-for="item in robotTemplates"
          :key="item.id"
          class="config-card robot-picker-card"
          hoverShadow
          @click="
            () => {
              $emit('update:selectedNewChatRobotId', item.id)
              $emit('confirm-start-new-chat')
            }
          "
        >
          <template #header>
            <div class="robot-picker-card-head">
              <div class="robot-picker-avatar">
                <img v-if="item.avatar" :src="item.avatar" alt="" />
                <span v-else>{{ (item.name || '智').slice(0, 1) }}</span>
              </div>
              <span class="config-card-name ellipsis-1">{{ item.name || '未命名智能体' }}</span>
            </div>
          </template>
          <div class="config-card-meta ellipsis-2">{{ item.description || '暂无简介' }}</div>
          <div class="config-card-meta config-card-meta-secondary ellipsis-2">
            {{ item.systemPrompt || '未填写主要故事设定' }}
          </div>
        </TCard>
      </div>
      <div v-else class="history-empty">暂无智能体卡片，请先去“设置智能体”里维护</div>
    </div>
  </TDrawer>
  <TDialog
    v-else
    :visible="newChatVisible"
    header="选择智能体"
    width="960px"
    :footer="false"
    :confirm-btn="null"
    :cancel-btn="null"
    @update:visible="(value) => $emit('update:newChatVisible', value)"
  >
    <div class="mobile-overlay-body">
      <div v-if="robotTemplates.length" class="robot-picker-grid robot-picker-grid-desktop">
        <TCard
          v-for="item in robotTemplates"
          :key="item.id"
          class="config-card robot-picker-card"
          hoverShadow
          @click="
            () => {
              $emit('update:selectedNewChatRobotId', item.id)
              $emit('confirm-start-new-chat')
            }
          "
        >
          <template #header>
            <div class="robot-picker-card-head">
              <div class="robot-picker-avatar">
                <img v-if="item.avatar" :src="item.avatar" alt="" />
                <span v-else>{{ (item.name || '智').slice(0, 1) }}</span>
              </div>
              <span class="config-card-name ellipsis-1">{{ item.name || '未命名智能体' }}</span>
            </div>
          </template>
          <div class="config-card-meta ellipsis-2">{{ item.description || '暂无简介' }}</div>
          <div class="config-card-meta config-card-meta-secondary ellipsis-2">
            {{ item.systemPrompt || '未填写主要故事设定' }}
          </div>
        </TCard>
      </div>
      <div v-else class="history-empty">暂无智能体卡片，请先去“设置智能体”里维护</div>
    </div>
  </TDialog>
  <input
    ref="agentTemplateImportInputRef"
    type="file"
    accept=".json,application/json"
    hidden
    @change="handleAgentTemplateImportChange"
  />

  <TDrawer
    v-if="isMobile"
    :visible="agentManageVisible"
    placement="right"
    :footer="false"
    @update:visible="(value) => $emit('update:agentManageVisible', value)"
  >
    <template #header> 设置智能体 </template>
    <div class="mobile-overlay-body">
      <div class="agent-manage-panel">
        <div v-if="robotTemplates.length" class="config-list-body">
          <TCard
            v-for="item in robotTemplates"
            :key="item.id"
            class="config-card"
            hoverShadow
            @click="$emit('open-mobile-agent-edit-dialog', item.id)"
          >
            <template #title>
              <span class="config-card-name ellipsis-1" :title="item.name || '未命名智能体'">{{
                item.name || '未命名智能体'
              }}</span>
            </template>
            <template #subtitle>
              <span class="config-card-meta ellipsis-1" :title="item.description || '暂无简介'">
                {{ item.description || '暂无简介' }}
              </span>
            </template>
            <template #actions>
              <TDropdown
                trigger="click"
                placement="bottom-right"
                :options="agentCardActionOptions"
                @click="(data) => $emit('handle-agent-card-action', item.id, data.value)"
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
              :title="item.systemPrompt || '未填写主要故事设定'"
            >
              {{ item.systemPrompt || '未填写主要故事设定' }}
            </div>
          </TCard>
          <TDropdown trigger="click" placement="bottom-right" :options="addAgentEntryOptions" @click="handleAddAgentEntryClick">
            <TCard class="config-card config-card-add" hoverShadow>
              <div class="config-card-add-media" aria-label="新增智能体">
                <svg viewBox="0 0 64 64" aria-hidden="true">
                  <path d="M32 14v36M14 32h36" />
                </svg>
              </div>
            </TCard>
          </TDropdown>
        </div>
        <TDropdown v-else trigger="click" placement="bottom-right" :options="addAgentEntryOptions" @click="handleAddAgentEntryClick">
          <TCard class="config-card config-card-add" hoverShadow>
            <div class="config-card-add-media" aria-label="新增智能体">
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <path d="M32 14v36M14 32h36" />
              </svg>
            </div>
          </TCard>
        </TDropdown>
      </div>
    </div>
  </TDrawer>
  <TDrawer
    v-if="isMobile"
    :visible="mobileAgentEditorVisible"
    placement="bottom"
    size="80%"
    :footer="false"
    @update:visible="(value) => $emit('update:mobileAgentEditorVisible', value)"
  >
    <template #header>
      {{ isEditingAgentDraft ? '修改智能体' : '新增智能体' }}
    </template>
    <div class="mobile-overlay-body agent-editor-shell">
      <TSteps class="agent-editor-steps" :current="agentEditorStep - 1" readonly>
        <TStepItem title="基础信息" />
        <TStepItem title="故事设定" />
        <TStepItem title="记忆设置" />
      </TSteps>
      <div class="session-robot-form-card agent-editor-content">
        <TForm v-if="agentEditorStep === 1" label-align="top">
          <div class="form-grid-2">
            <TFormItem label="名称">
              <TInput v-model="mobileAgentDraft.name" placeholder="例如：销售顾问 / 数据分析师" />
            </TFormItem>
            <TFormItem label="简介">
              <TInput v-model="mobileAgentDraft.description" placeholder="用于卡片展示的说明" />
            </TFormItem>
            <TFormItem class="form-grid-span-2" label="头像">
              <TUpload
                ref="avatarUploadRef"
                theme="image"
                accept="image/*"
                :max="1"
                :multiple="false"
                :auto-upload="false"
                :model-value="avatarUploadFiles"
                :request-method="requestAvatarUpload"
                :tips="avatarUploadTips"
                @change="handleAvatarUploadChange"
                @success="handleAvatarUploadSuccess"
                @fail="handleAvatarUploadFail"
                @remove="handleAvatarUploadRemove"
              />
            </TFormItem>
            <TFormItem class="form-grid-span-2" label="新建聊天记录保存在服务器">
              <TSwitch v-model="mobileAgentDraft.persistToServer" />
            </TFormItem>
          </div>
        </TForm>
        <TForm v-else-if="agentEditorStep === 2" label-align="top">
          <TFormItem label="主要故事设定">
            <TTextarea
              v-model="mobileAgentDraft.systemPrompt"
              :autosize="{ minRows: 8, maxRows: 12 }"
              placeholder="填写世界观背景、核心规则、主线冲突与长期设定；人物和关系请在世界图谱维护。"
            />
          </TFormItem>
          <div
            class="story-world-graph-entry"
            :class="{ disabled: !canOpenWorldGraph }"
            @click="handleOpenWorldGraphFromEditor"
          >
            <div class="story-world-graph-preview" aria-hidden="true">
              <span class="story-world-graph-node mint"></span>
              <span class="story-world-graph-node cyan"></span>
              <span class="story-world-graph-node green"></span>
              <span class="story-world-graph-link left"></span>
              <span class="story-world-graph-link right"></span>
            </div>
            <div class="story-world-graph-copy">
              <strong>世界图谱</strong>
              <span>{{ worldGraphEntryHint }}</span>
            </div>
            <TButton variant="outline" size="small">
              {{ worldGraphEntryActionLabel }}
            </TButton>
          </div>
          <TFormItem>
            <template #label>
              <span class="form-label-with-tip">
                智能体通用提示
                <TPopup content="该提示词会通用到本智能体全部生成工具上" placement="top">
                  <InfoCircleIcon class="form-label-tip-icon" />
                </TPopup>
              </span>
            </template>
            <TTextarea
              v-model="mobileAgentDraft.commonPrompt"
              :autosize="{ minRows: 5, maxRows: 8 }"
              placeholder="填写会统一加到本智能体所有生成节点顶部的通用要求。"
            />
          </TFormItem>
          <TFormItem label="启用数值计算">
            <TSwitch v-model="mobileAgentDraft.numericComputationEnabled" />
          </TFormItem>
          <TFormItem v-if="mobileAgentDraft.numericComputationEnabled" label="数值计算提示词">
            <TTextarea
              v-model="mobileAgentDraft.numericComputationPrompt"
              :autosize="{ minRows: 4, maxRows: 8 }"
              placeholder="例如：根据用户行为和上下文调整好感度、危险度、财富等数值，并说明增减规则。"
            />
          </TFormItem>
          <TFormItem v-if="mobileAgentDraft.numericComputationEnabled" label="数值结构体">
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
                    v-for="(item, itemIndex) in mobileAgentDraft.numericComputationItems"
                    :key="`mobile-agent-${itemIndex}`"
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
                        @click="$emit('remove-numeric-computation-item', mobileAgentDraft, itemIndex)"
                        >删除</TButton
                      >
                    </td>
                  </tr>
                </tbody>
              </table>
              <TButton variant="outline" @click="$emit('add-numeric-computation-item', mobileAgentDraft)"
                >新增数值项</TButton
              >
            </div>
          </TFormItem>
        </TForm>
        <TForm v-else label-align="top">
          <div class="form-grid-2">
            <TFormItem label="记忆间隔">
              <TInputNumber
                v-model="mobileAgentDraft.structuredMemoryInterval"
                :min="1"
                placeholder="3"
              />
            </TFormItem>
            <TFormItem label="历史消息条数">
              <TInputNumber
                v-model="mobileAgentDraft.structuredMemoryHistoryLimit"
                :min="1"
                placeholder="12"
              />
            </TFormItem>
          </div>
          <div class="form-grid-2">
            <TFormItem label="记忆模型">
              <TSelect
                v-model="mobileAgentDraft.memoryModelConfigId"
                :options="auxModelOptions"
                placeholder="未单独配置，默认跟随正文模型"
                clearable
              />
            </TFormItem>
            <TFormItem label="世界图谱模型">
              <TSelect
                v-model="mobileAgentDraft.worldGraphModelConfigId"
                :options="auxModelOptions"
                placeholder="未单独配置，默认跟随正文模型"
                clearable
              />
            </TFormItem>
            <TFormItem label="数值计算模型">
              <TSelect
                v-model="mobileAgentDraft.numericComputationModelConfigId"
                :options="auxModelOptions"
                placeholder="未单独配置，默认跟随正文模型"
                clearable
              />
            </TFormItem>
            <TFormItem label="表单选项模型">
              <TSelect
                v-model="mobileAgentDraft.formOptionModelConfigId"
                :options="auxModelOptions"
                placeholder="未单独配置，默认跟随正文模型"
                clearable
              />
            </TFormItem>
          </div>
          <div class="agent-schema-card">
            <MemorySchemaEditor :schema="mobileAgentDraft.memorySchema" />
          </div>
        </TForm>
      </div>
      <div class="mobile-overlay-actions drawer-actions">
        <template v-if="agentEditorStep === 1">
          <TButton theme="primary" @click="$emit('next-agent-editor-step')">下一步</TButton>
        </template>
        <template v-else-if="agentEditorStep === 2">
          <div class="agent-editor-actions agent-editor-actions-split">
            <div class="agent-editor-actions-left">
              <TButton theme="default" variant="base" @click="$emit('previous-agent-editor-step')"
                >上一步</TButton
              >
            </div>
            <div class="agent-editor-actions-right">
              <TButton theme="primary" :loading="savingMobileAgent" @click="$emit('skip-agent-structure-setup')">
                跳过结构体设置
              </TButton>
              <TButton variant="outline" @click="$emit('next-agent-editor-step')">下一步</TButton>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="agent-editor-actions agent-editor-actions-split">
            <div class="agent-editor-actions-left">
              <TButton theme="default" variant="base" @click="$emit('previous-agent-editor-step')"
                >上一步</TButton
              >
            </div>
            <div class="agent-editor-actions-right">
              <TButton theme="primary" :loading="savingMobileAgent || savingAvatarOnSubmit" @click="handleSaveMobileAgent"
                >确定</TButton
              >
            </div>
          </div>
        </template>
      </div>
    </div>
  </TDrawer>
  <TDialog
    v-if="!isMobile"
    :visible="agentManageVisible"
    header="设置智能体"
    placement="center"
    width="1160px"
    :footer="false"
    :confirm-btn="null"
    :cancel-btn="null"
    @update:visible="(value) => $emit('update:agentManageVisible', value)"
  >
    <div class="mobile-overlay-body agent-manage-shell">
      <div class="agent-manage-panel">
        <div class="config-list-header">
          <span class="config-title">已配置智能体</span>
        </div>
        <div v-if="robotTemplates.length" class="desktop-config-grid">
          <TCard
            v-for="item in robotTemplates"
            :key="item.id"
            class="config-card"
            hoverShadow
            @click="$emit('open-mobile-agent-edit-dialog', item.id)"
          >
            <template #title>
              <span class="config-card-name ellipsis-1" :title="item.name || '未命名智能体'">{{
                item.name || '未命名智能体'
              }}</span>
            </template>
            <template #subtitle>
              <span class="config-card-meta ellipsis-1" :title="item.description || '暂无简介'">
                {{ item.description || '暂无简介' }}
              </span>
            </template>
            <template #actions>
              <TDropdown
                trigger="click"
                placement="bottom-right"
                :options="agentCardActionOptions"
                @click="(data) => $emit('handle-agent-card-action', item.id, data.value)"
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
              :title="item.systemPrompt || '未填写主要故事设定'"
            >
              {{ item.systemPrompt || '未填写主要故事设定' }}
            </div>
          </TCard>
          <TDropdown trigger="click" placement="bottom-right" :options="addAgentEntryOptions" @click="handleAddAgentEntryClick">
            <TCard class="config-card config-card-add" hoverShadow>
              <div class="config-card-add-media" aria-label="新增智能体">
                <svg viewBox="0 0 64 64" aria-hidden="true">
                  <path d="M32 14v36M14 32h36" />
                </svg>
              </div>
            </TCard>
          </TDropdown>
        </div>
        <TDropdown v-else trigger="click" placement="bottom-right" :options="addAgentEntryOptions" @click="handleAddAgentEntryClick">
          <TCard class="config-card config-card-add" hoverShadow>
            <div class="config-card-add-media" aria-label="新增智能体">
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <path d="M32 14v36M14 32h36" />
              </svg>
            </div>
          </TCard>
        </TDropdown>
      </div>
    </div>
  </TDialog>
  <TDialog
    v-if="!isMobile"
    :visible="mobileAgentEditorVisible"
    :header="isEditingAgentDraft ? '修改智能体' : '新增智能体'"
    width="760px"
    :footer="false"
    :confirm-btn="null"
    :cancel-btn="null"
    @update:visible="(value) => $emit('update:mobileAgentEditorVisible', value)"
  >
    <div class="mobile-overlay-body agent-editor-shell">
      <TSteps class="agent-editor-steps" :current="agentEditorStep - 1" readonly>
        <TStepItem title="基础信息" />
        <TStepItem title="故事设定" />
        <TStepItem title="记忆设置" />
      </TSteps>
      <div class="session-robot-form-card agent-editor-card agent-editor-content">
        <TForm v-if="agentEditorStep === 1" label-align="top">
          <div class="form-grid-2">
            <TFormItem label="名称">
              <TInput v-model="mobileAgentDraft.name" placeholder="例如：销售顾问 / 数据分析师" />
            </TFormItem>
            <TFormItem label="简介">
              <TInput v-model="mobileAgentDraft.description" placeholder="用于卡片展示的说明" />
            </TFormItem>
            <TFormItem class="form-grid-span-2" label="头像">
              <TUpload
                ref="avatarUploadRef"
                theme="image"
                accept="image/*"
                :max="1"
                :multiple="false"
                :auto-upload="false"
                :model-value="avatarUploadFiles"
                :request-method="requestAvatarUpload"
                :tips="avatarUploadTips"
                @change="handleAvatarUploadChange"
                @success="handleAvatarUploadSuccess"
                @fail="handleAvatarUploadFail"
                @remove="handleAvatarUploadRemove"
              />
            </TFormItem>
            <TFormItem class="form-grid-span-2" label="新建聊天记录保存在服务器">
              <TSwitch v-model="mobileAgentDraft.persistToServer" />
            </TFormItem>
          </div>
        </TForm>
        <TForm v-else-if="agentEditorStep === 2" label-align="top">
          <TFormItem label="主要故事设定">
            <TTextarea
              v-model="mobileAgentDraft.systemPrompt"
              :autosize="{ minRows: 10, maxRows: 14 }"
              placeholder="填写世界观背景、核心规则、主线冲突与长期设定；人物和关系请在世界图谱维护。"
            />
          </TFormItem>
          <div
            class="story-world-graph-entry"
            :class="{ disabled: !canOpenWorldGraph }"
            @click="handleOpenWorldGraphFromEditor"
          >
            <div class="story-world-graph-preview" aria-hidden="true">
              <span class="story-world-graph-node mint"></span>
              <span class="story-world-graph-node cyan"></span>
              <span class="story-world-graph-node green"></span>
              <span class="story-world-graph-link left"></span>
              <span class="story-world-graph-link right"></span>
            </div>
            <div class="story-world-graph-copy">
              <strong>世界图谱</strong>
              <span>{{ worldGraphEntryHint }}</span>
            </div>
            <TButton variant="outline" size="small">
              {{ worldGraphEntryActionLabel }}
            </TButton>
          </div>
          <TFormItem>
            <template #label>
              <span class="form-label-with-tip">
                智能体通用提示
                <TPopup content="该提示词会通用到本智能体全部生成工具上" placement="top">
                  <InfoCircleIcon class="form-label-tip-icon" />
                </TPopup>
              </span>
            </template>
            <TTextarea
              v-model="mobileAgentDraft.commonPrompt"
              :autosize="{ minRows: 5, maxRows: 8 }"
              placeholder="填写会统一加到本智能体所有生成节点顶部的通用要求。"
            />
          </TFormItem>
          <TFormItem label="启用数值计算">
            <TSwitch v-model="mobileAgentDraft.numericComputationEnabled" />
          </TFormItem>
          <TFormItem v-if="mobileAgentDraft.numericComputationEnabled" label="数值计算提示词">
            <TTextarea
              v-model="mobileAgentDraft.numericComputationPrompt"
              :autosize="{ minRows: 4, maxRows: 8 }"
              placeholder="例如：根据用户行为和上下文调整好感度、危险度、财富等数值，并说明增减规则。"
            />
          </TFormItem>
          <TFormItem v-if="mobileAgentDraft.numericComputationEnabled" label="数值结构体">
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
                    v-for="(item, itemIndex) in mobileAgentDraft.numericComputationItems"
                    :key="`desktop-agent-${itemIndex}`"
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
                        @click="$emit('remove-numeric-computation-item', mobileAgentDraft, itemIndex)"
                        >删除</TButton
                      >
                    </td>
                  </tr>
                </tbody>
              </table>
              <TButton variant="outline" @click="$emit('add-numeric-computation-item', mobileAgentDraft)"
                >新增数值项</TButton
              >
            </div>
          </TFormItem>
        </TForm>
        <TForm v-else label-align="top">
          <div class="form-grid-2">
            <TFormItem label="记忆间隔">
              <TInputNumber
                v-model="mobileAgentDraft.structuredMemoryInterval"
                :min="1"
                placeholder="3"
              />
            </TFormItem>
            <TFormItem label="历史消息条数">
              <TInputNumber
                v-model="mobileAgentDraft.structuredMemoryHistoryLimit"
                :min="1"
                placeholder="12"
              />
            </TFormItem>
          </div>
          <div class="form-grid-2">
            <TFormItem label="记忆模型">
              <TSelect
                v-model="mobileAgentDraft.memoryModelConfigId"
                :options="auxModelOptions"
                placeholder="未单独配置，默认跟随正文模型"
                clearable
              />
            </TFormItem>
            <TFormItem label="世界图谱模型">
              <TSelect
                v-model="mobileAgentDraft.worldGraphModelConfigId"
                :options="auxModelOptions"
                placeholder="未单独配置，默认跟随正文模型"
                clearable
              />
            </TFormItem>
            <TFormItem label="数值计算模型">
              <TSelect
                v-model="mobileAgentDraft.numericComputationModelConfigId"
                :options="auxModelOptions"
                placeholder="未单独配置，默认跟随正文模型"
                clearable
              />
            </TFormItem>
            <TFormItem label="表单选项模型">
              <TSelect
                v-model="mobileAgentDraft.formOptionModelConfigId"
                :options="auxModelOptions"
                placeholder="未单独配置，默认跟随正文模型"
                clearable
              />
            </TFormItem>
          </div>
          <div class="agent-schema-card">
            <MemorySchemaEditor :schema="mobileAgentDraft.memorySchema" />
          </div>
        </TForm>
      </div>
      <div class="mobile-overlay-actions drawer-actions">
        <template v-if="agentEditorStep === 1">
          <TButton theme="primary" @click="$emit('next-agent-editor-step')">下一步</TButton>
        </template>
        <template v-else-if="agentEditorStep === 2">
          <div class="agent-editor-actions agent-editor-actions-split">
            <div class="agent-editor-actions-left">
              <TButton theme="default" variant="base" @click="$emit('previous-agent-editor-step')"
                >上一步</TButton
              >
            </div>
            <div class="agent-editor-actions-right">
              <TButton theme="primary" :loading="savingMobileAgent" @click="$emit('skip-agent-structure-setup')">
                跳过结构体设置
              </TButton>
              <TButton variant="outline" @click="$emit('next-agent-editor-step')">下一步</TButton>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="agent-editor-actions agent-editor-actions-split">
            <div class="agent-editor-actions-left">
              <TButton theme="default" variant="base" @click="$emit('previous-agent-editor-step')"
                >上一步</TButton
              >
            </div>
            <div class="agent-editor-actions-right">
              <TButton theme="primary" :loading="savingMobileAgent || savingAvatarOnSubmit" @click="handleSaveMobileAgent"
                >确定</TButton
              >
            </div>
          </div>
        </template>
      </div>
    </div>
  </TDialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, toRefs } from 'vue'
import type { PropType } from 'vue'
import { InfoCircleIcon, MoreIcon } from 'tdesign-icons-vue-next'

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
  StepItem as TStepItem,
  Steps as TSteps,
  Switch as TSwitch,
  Textarea as TTextarea,
  Upload as TUpload,
  MessagePlugin,
} from 'tdesign-vue-next'

import MemorySchemaEditor from '@/components/chat/MemorySchemaEditor.vue'
import { uploadImageFile } from '@/lib/api'
import type { AIRobotCard, NumericComputationItem } from '@/types/ai'
import type {
  RequestMethodResponse,
  SuccessContext,
  UploadChangeContext,
  UploadFailContext,
  UploadFile,
  UploadInstanceFunctions,
} from 'tdesign-vue-next'

const props = defineProps({
  isMobile: {
    type: Boolean,
    required: true,
  },
  newChatVisible: {
    type: Boolean,
    required: true,
  },
  agentManageVisible: {
    type: Boolean,
    required: true,
  },
  mobileAgentEditorVisible: {
    type: Boolean,
    required: true,
  },
  robotTemplates: {
    type: Array as PropType<AIRobotCard[]>,
    required: true,
  },
  selectedNewChatRobotId: {
    type: String,
    required: true,
  },
  isEditingAgentDraft: {
    type: Boolean,
    required: true,
  },
  agentEditorStep: {
    type: Number as PropType<1 | 2 | 3>,
    required: true,
  },
  mobileAgentDraft: {
    type: Object as PropType<AIRobotCard>,
    required: true,
  },
  savingMobileAgent: {
    type: Boolean,
    required: true,
  },
  auxModelOptions: {
    type: Array as PropType<Array<{ label: string; value: string }>>,
    required: true,
  },
  agentCardActionOptions: {
    type: Array as PropType<Array<Record<string, unknown>>>,
    required: true,
  },
})

const {
  isMobile,
  newChatVisible,
  agentManageVisible,
  mobileAgentEditorVisible,
  robotTemplates,
  selectedNewChatRobotId,
  isEditingAgentDraft,
  agentEditorStep,
  mobileAgentDraft,
  savingMobileAgent,
  auxModelOptions,
  agentCardActionOptions,
} = toRefs(props)

const avatarUploadRef = ref<UploadInstanceFunctions | null>(null)
const agentTemplateImportInputRef = ref<HTMLInputElement | null>(null)
const pendingAvatarUploadFiles = ref<UploadFile[]>([])
const localPreviewUrls = new Set<string>()
const savingAvatarOnSubmit = ref(false)
const addAgentEntryOptions = [
  { content: '新增模板', value: 'create' },
  { content: '导入模板', value: 'import' },
]

const avatarUploadFiles = computed<UploadFile[]>(() => {
  if (pendingAvatarUploadFiles.value.length) {
    return pendingAvatarUploadFiles.value
  }

  const avatar = String(mobileAgentDraft.value.avatar || '').trim()
  if (!avatar) {
    return []
  }
  return [
    {
      name: 'avatar',
      url: avatar,
      status: 'success',
    },
  ]
})

const hasPendingAvatarFile = computed(() =>
  pendingAvatarUploadFiles.value.some((item) => item.raw instanceof File),
)
const savedServerRobotForDraft = computed(() => {
  const agentId = String(mobileAgentDraft.value.id || '').trim()
  if (!agentId) {
    return null
  }
  return (
    robotTemplates.value.find(
      (item) => item.id === agentId && Boolean(item.persistToServer),
    ) || null
  )
})
const canOpenWorldGraph = computed(() => mobileAgentDraft.value.persistToServer)
const worldGraphEntryHint = computed(() => {
  if (!mobileAgentDraft.value.persistToServer) {
    return '开启保存到服务器后可编辑人物关系'
  }
  return savedServerRobotForDraft.value ? '点击进入人物与关系编辑' : '保存后自动进入人物与关系编辑'
})
const worldGraphEntryActionLabel = computed(() => {
  if (!mobileAgentDraft.value.persistToServer) {
    return '需存服务端'
  }
  return savedServerRobotForDraft.value ? '进入编辑' : '保存并进入'
})

const avatarUploadTips = computed(() =>
  mobileAgentDraft.value.persistToServer
    ? '支持 jpg/png/webp/gif/svg/avif，最大 10MB；点击“确定”时上传头像'
    : '当前未开启“上传到服务器”，不会执行头像上传',
)

async function requestAvatarUpload(files: UploadFile | UploadFile[]): Promise<RequestMethodResponse> {
  if (!mobileAgentDraft.value.persistToServer) {
    return {
      status: 'fail',
      error: '请先开启“上传到服务器”再上传头像',
      response: {},
    }
  }

  const currentFile = Array.isArray(files) ? files[0] : files
  const rawFile = currentFile?.raw
  if (!(rawFile instanceof File)) {
    return {
      status: 'fail',
      error: '未获取到上传文件',
      response: {},
    }
  }

  try {
    const payload = await uploadImageFile(rawFile)
    return {
      status: 'success',
      response: {
        url: payload.url,
      },
    }
  } catch (error) {
    return {
      status: 'fail',
      error: error instanceof Error ? error.message : '头像上传失败',
      response: {},
    }
  }
}

function handleAvatarUploadSuccess(context: SuccessContext) {
  const uploadedUrl = String(context.response?.url || context.file?.response?.url || '').trim()
  if (!uploadedUrl) {
    MessagePlugin.error('上传成功但未返回头像地址')
    return
  }
  clearPendingAvatarFiles()
  mobileAgentDraft.value.avatar = uploadedUrl
}

function handleAvatarUploadFail(context: UploadFailContext) {
  const message = String(context.response?.message || context.response?.error || '头像上传失败').trim()
  MessagePlugin.error(message || '头像上传失败')
}

function handleAvatarUploadChange(value: UploadFile[], _context: UploadChangeContext) {
  clearPendingAvatarFiles()
  pendingAvatarUploadFiles.value = createUploadFilesWithPreview(Array.isArray(value) ? value : [])
}

function handleAvatarUploadRemove() {
  clearPendingAvatarFiles()
  mobileAgentDraft.value.avatar = ''
}

function handleSelectCreateAgent() {
  emit('add-agent-template')
}

function handleSelectImportAgent() {
  agentTemplateImportInputRef.value?.click()
}

function handleAddAgentEntryClick(data: { value?: string | number | Record<string, unknown> }) {
  if (String(data?.value || '') === 'import') {
    handleSelectImportAgent()
    return
  }

  handleSelectCreateAgent()
}

function handleAgentTemplateImportChange(event: Event) {
  const target = event.target as HTMLInputElement | null
  const file = target?.files?.[0]
  if (!file) {
    return
  }

  emit('import-agent-template', file)
  target.value = ''
}

async function handleOpenWorldGraphFromEditor() {
  if (!mobileAgentDraft.value.persistToServer) {
    MessagePlugin.warning('请先开启“新建聊天记录保存在服务器”')
    return
  }

  if (savingAvatarOnSubmit.value || savingMobileAgent.value) {
    return
  }

  const targetRobot = savedServerRobotForDraft.value
  if (targetRobot) {
    emit('open-world-graph', targetRobot.id)
    return
  }

  if (hasPendingAvatarFile.value) {
    savingAvatarOnSubmit.value = true
    try {
      const uploadSuccess = await uploadPendingAvatarBeforeSave()
      if (!uploadSuccess) {
        return
      }
    } finally {
      savingAvatarOnSubmit.value = false
    }
  }

  emit('save-mobile-agent-and-open-world-graph')
}

async function handleSaveMobileAgent() {
  if (!mobileAgentDraft.value.persistToServer || !hasPendingAvatarFile.value) {
    emit('save-mobile-agent')
    return
  }

  if (savingAvatarOnSubmit.value) {
    return
  }

  savingAvatarOnSubmit.value = true
  try {
    const uploadSuccess = await uploadPendingAvatarBeforeSave()
    if (!uploadSuccess) {
      return
    }
    emit('save-mobile-agent')
  } finally {
    savingAvatarOnSubmit.value = false
  }
}

async function uploadPendingAvatarBeforeSave() {
  const pendingFile = pendingAvatarUploadFiles.value.find((item) => item.raw instanceof File)?.raw
  if (!(pendingFile instanceof File)) {
    MessagePlugin.error('未获取到待上传头像文件')
    return false
  }
  try {
    const payload = await uploadImageFile(pendingFile)
    mobileAgentDraft.value.avatar = String(payload.url || '').trim()
    clearPendingAvatarFiles()
    return Boolean(mobileAgentDraft.value.avatar)
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '头像上传失败')
    return false
  }
}

function createUploadFilesWithPreview(files: UploadFile[]) {
  return files.map((file) => {
    if (file.url) {
      return file
    }
    if (file.raw instanceof File) {
      const previewUrl = URL.createObjectURL(file.raw)
      localPreviewUrls.add(previewUrl)
      return {
        ...file,
        url: previewUrl,
      }
    }
    return file
  })
}

function clearPendingAvatarFiles() {
  pendingAvatarUploadFiles.value.forEach((file) => {
    const fileUrl = String(file.url || '')
    if (!fileUrl.startsWith('blob:')) {
      return
    }
    if (localPreviewUrls.has(fileUrl)) {
      URL.revokeObjectURL(fileUrl)
      localPreviewUrls.delete(fileUrl)
    }
  })
  pendingAvatarUploadFiles.value = []
}

onBeforeUnmount(() => {
  clearPendingAvatarFiles()
})

const emit = defineEmits<{
  (e: 'update:newChatVisible', value: boolean): void
  (e: 'update:agentManageVisible', value: boolean): void
  (e: 'update:mobileAgentEditorVisible', value: boolean): void
  (e: 'update:selectedNewChatRobotId', value: string): void
  (e: 'confirm-start-new-chat'): void
  (e: 'open-mobile-agent-edit-dialog', agentId: string): void
  (
    e: 'handle-agent-card-action',
    agentId: string,
    action?: string | number | Record<string, unknown>,
  ): void
  (e: 'open-mobile-agent-create-dialog'): void
  (e: 'add-agent-template'): void
  (e: 'import-agent-template', file: File): void
  (e: 'next-agent-editor-step'): void
  (e: 'previous-agent-editor-step'): void
  (e: 'skip-agent-structure-setup'): void
  (e: 'save-mobile-agent'): void
  (e: 'save-mobile-agent-and-open-world-graph'): void
  (e: 'open-world-graph', agentId: string): void
  (e: 'remove-numeric-computation-item', target: { numericComputationItems: NumericComputationItem[] }, index: number): void
  (e: 'add-numeric-computation-item', target: { numericComputationItems: NumericComputationItem[] }): void
}>()
</script>

<style scoped>
.story-world-graph-entry {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  padding: 16px;
  margin: -2px 0 16px;
  border: 1px solid #e5e7eb;
  border-radius: 20px;
  background: linear-gradient(135deg, #faf8f4 0%, #f4f4f5 100%);
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}

.story-world-graph-entry:hover {
  border-color: #d1d5db;
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}

.story-world-graph-entry.disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.story-world-graph-entry.disabled:hover {
  border-color: #e5e7eb;
  box-shadow: none;
  transform: none;
}

.story-world-graph-preview {
  position: relative;
  height: 92px;
  border-radius: 18px;
  background:
    radial-gradient(circle at 16% 20%, rgba(255, 255, 255, 0.95), transparent 34%),
    linear-gradient(145deg, #f1efe9 0%, #efefef 100%);
  overflow: hidden;
}

.story-world-graph-node {
  position: absolute;
  width: 18px;
  height: 18px;
  border-radius: 999px;
}

.story-world-graph-node.mint {
  top: 18px;
  left: 64px;
  width: 24px;
  height: 24px;
  background: #86efe2;
}

.story-world-graph-node.cyan {
  bottom: 18px;
  left: 28px;
  width: 26px;
  height: 26px;
  background: #8fe8df;
}

.story-world-graph-node.green {
  bottom: 24px;
  right: 30px;
  width: 24px;
  height: 24px;
  background: #b2ff94;
}

.story-world-graph-link {
  position: absolute;
  border-top: 2px solid #20242a;
  border-radius: 999px;
  transform-origin: center;
}

.story-world-graph-link.left {
  top: 46px;
  left: 34px;
  width: 54px;
  transform: rotate(-28deg);
}

.story-world-graph-link.right {
  top: 48px;
  right: 40px;
  width: 48px;
  transform: rotate(28deg);
}

.story-world-graph-copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.story-world-graph-copy strong {
  color: #111827;
  font-size: 15px;
  font-weight: 600;
}

.story-world-graph-copy span {
  color: #6b7280;
  font-size: 13px;
  line-height: 1.5;
}

@media (max-width: 768px) {
  .story-world-graph-entry {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .story-world-graph-preview {
    height: 104px;
  }
}
</style>
