<template>
  <div class="main">
    <PrimaryNav v-model="activePrimaryTab" />
    <template v-if="activePrimaryTab === 'agent'">
      <div class="mess-list">
        <SessionHistoryPanel
          :current-robot-label="currentRobotLabel"
          :current-model-label="currentModelLabel"
          :session-history="sessionHistory"
          :session-id="sessionId"
          :deleting-session-id="deletingSessionId"
          @new-chat="handleNewChatEntry"
          @go-robots="handleGoToRobotPage"
          @open-session="openHistorySession"
          @delete-session="handleDeleteSession"
        />
      </div>

      <div class="chat-container">
        <div class="chatbot-header">

          <TSpace align="center" size="small">
            <TButton
              class="mobile-sidebar-trigger"
              shape="circle"
              variant="outline"
              @click="sidebarDrawerVisible = true"
            >
              <template #icon>
                <MenuIcon />
              </template>
            </TButton>
            <TButton shape="circle" variant="outline" @click="openMemoryDialog">
              <template #icon>
                <svg class="memory-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M9 4.5a3.5 3.5 0 0 0-3.28 4.73A3.75 3.75 0 0 0 4 12.5c0 1.34.7 2.52 1.75 3.18v1.07A2.25 2.25 0 0 0 8 19h1v1.25a.75.75 0 0 0 1.5 0V19h3v1.25a.75.75 0 0 0 1.5 0V19h1a2.25 2.25 0 0 0 2.25-2.25v-1.07A3.74 3.74 0 0 0 20 12.5a3.75 3.75 0 0 0-1.72-3.27A3.5 3.5 0 0 0 12 6.3 3.5 3.5 0 0 0 9 4.5Zm0 1.5c.97 0 1.82.63 2.13 1.54a.75.75 0 0 0 1.43 0A2.25 2.25 0 0 1 16.75 9a.75.75 0 0 0 .55.86 2.25 2.25 0 0 1 .45 4.18.75.75 0 0 0-.37.65v2.06a.75.75 0 0 1-.75.75H8a.75.75 0 0 1-.75-.75V14.7a.75.75 0 0 0-.37-.65 2.25 2.25 0 0 1 .45-4.18A.75.75 0 0 0 7.88 9 2.25 2.25 0 0 1 9 6Z"
                    fill="currentColor"
                  />
                </svg>
              </template>
            </TButton>
            <TButton shape="circle" variant="outline" @click="openSessionRobotDialog">
              <template #icon>
                <SettingIcon />
              </template>
            </TButton>
          </TSpace>

        </div>
        <div class="chatbot">
          <t-chatbot
            :key="chatbotRuntimeKey"
            ref="chatbotRef"
            layout="both"
            :message-props="chatMessageProps"
            :chat-service-config="chatServiceConfig"
            :is-stream-load="effectiveStream"
            :on-message-change="handleChatMessageChange"
            @messageChange="handleChatMessageChange"
          >
            <template v-for="slot in formActivitySlots" :key="slot.slotName" #[slot.slotName]>
              <div class="chat-form-card">
                <div class="chat-form-title">{{ slot.schema.title || '请补充信息' }}</div>
                <div v-if="slot.schema.description" class="chat-form-desc">
                  {{ slot.schema.description }}
                </div>
                <template
                  v-for="(draft, draftIndex) in [getFormDraft(slot.formId, slot.schema)]"
                  :key="`${slot.formId}-draft-${draftIndex}`"
                >
                  <TForm label-align="top">
                    <TFormItem
                      v-for="field in slot.schema.fields"
                      :key="field.name"
                      :label="field.label"
                    >
                      <TInput
                        v-if="field.type === 'input'"
                        v-model="draft[field.name] as string | number"
                        :type="field.inputType === 'number' ? 'number' : 'text'"
                        :placeholder="field.placeholder || ''"
                        :disabled="Boolean(submittedForms[slot.formId]) || isChatResponding"
                      />
                      <TRadioGroup
                        v-else-if="field.type === 'radio'"
                        v-model="draft[field.name] as string | number | boolean"
                        :disabled="Boolean(submittedForms[slot.formId]) || isChatResponding"
                      >
                        <TRadio
                          v-for="option in field.options || []"
                          :key="option.value"
                          :value="option.value"
                        >
                          {{ option.label }}
                        </TRadio>
                      </TRadioGroup>
                      <TCheckboxGroup
                        v-else-if="field.type === 'checkbox'"
                        v-model="draft[field.name] as (string | number | boolean)[]"
                        :disabled="Boolean(submittedForms[slot.formId]) || isChatResponding"
                      >
                        <TCheckbox
                          v-for="option in field.options || []"
                          :key="option.value"
                          :value="option.value"
                        >
                          {{ option.label }}
                        </TCheckbox>
                      </TCheckboxGroup>
                      <TSelect
                        v-else-if="field.type === 'select'"
                        v-model="draft[field.name] as string | number | (string | number)[]"
                        :multiple="Boolean(field.multiple)"
                        :disabled="Boolean(submittedForms[slot.formId]) || isChatResponding"
                        :options="
                          (field.options || []).map((option) => ({
                            label: option.label,
                            value: option.value,
                          }))
                        "
                        :placeholder="field.placeholder || ''"
                      />
                    </TFormItem>
                  </TForm>
                </template>
                <TButton
                  theme="primary"
                  :disabled="Boolean(submittedForms[slot.formId]) || isChatResponding"
                  @click="submitChatForm(slot)"
                >
                  {{ submittedForms[slot.formId] ? '已提交' : slot.schema.submitText || '提交' }}
                </TButton>
              </div>
            </template>
            <template #sender-footer-prefix>
              <TSpace align="center" size="small" class="sender-footer-actions">
                <TButton
                  v-if="showStreamToggle"
                  shape="round"
                  variant="outline"
                  :theme="effectiveStream ? 'primary' : 'default'"
                  @click="switchStream"
                >
                  <template #icon>
                    <OrderIcon />
                  </template>
                  <span class="footer-button-label">流式传输</span>
                </TButton>
                <TButton
                  v-if="showThinkingToggle"
                  shape="round"
                  variant="outline"
                  :theme="effectiveThinking ? 'primary' : 'default'"
                  @click="switchThinking"
                >
                  <template #icon>
                    <LightbulbIcon />
                  </template>
                  <span class="footer-button-label">思考</span>
                </TButton>
                <TButton shape="round" variant="outline" @click="openConfigDialog">
                  <template #icon>
                    <SettingIcon />
                  </template>
                  <span class="footer-button-label footer-model-label">{{ currentModelLabel }}</span>
                </TButton>
              </TSpace>
            </template>
          </t-chatbot>
        </div>
      </div>
    </template>
    <PlaceholderPane v-else :title="activePrimaryTab === 'discover' ? '发现' : '我的'" />
  </div>

  <TDrawer
    v-model:visible="sidebarDrawerVisible"
    header="会话列表"
    placement="left"
    size="280px"
    :footer="false"
  >
    <SessionHistoryPanel
      :current-robot-label="currentRobotLabel"
      :current-model-label="currentModelLabel"
      :session-history="sessionHistory"
      :session-id="sessionId"
      :deleting-session-id="deletingSessionId"
      @new-chat="handleNewChatEntry"
      @go-robots="handleGoToRobotPage"
      @open-session="openHistorySession"
      @delete-session="handleDeleteSession"
    />
  </TDrawer>

  <TDrawer
    v-if="isMobile"
    v-model:visible="newChatVisible"
    :header="false"
    placement="right"
    size="100%"
    :footer="false"
  >
    <div class="mobile-overlay-body">
      <div class="mobile-overlay-topbar">
        <div class="mobile-overlay-title">选择智能体</div>
        <TButton variant="text" @click="newChatVisible = false">关闭</TButton>
      </div>
      <div v-if="robotTemplates.length" class="robot-picker-list">
        <div
          v-for="item in robotTemplates"
          :key="item.id"
          class="robot-picker-item"
          :class="{ active: item.id === selectedNewChatRobotId }"
          @click="selectedNewChatRobotId = item.id"
        >
          <div class="robot-picker-avatar">
            <img v-if="item.avatar" :src="item.avatar" alt="" />
            <span v-else>{{ (item.name || '智').slice(0, 1) }}</span>
          </div>
          <div class="robot-picker-name">{{ item.name || '未命名智能体' }}</div>
          <div class="robot-picker-desc">{{ item.description || '暂无简介' }}</div>
        </div>
      </div>
      <div v-else class="history-empty">暂无智能体卡片，请先去“设置智能体”里维护</div>
      <div class="mobile-overlay-actions drawer-actions">
        <TButton block theme="primary" @click="confirmStartNewChat">开始新聊天</TButton>
      </div>
    </div>
  </TDrawer>
  <TDialog
    v-else
    v-model:visible="newChatVisible"
    header="选择智能体"
    width="560px"
    :footer="false"
    :confirm-btn="null"
    :cancel-btn="null"
  >
    <div class="mobile-overlay-body">
      <div v-if="robotTemplates.length" class="robot-picker-list">
        <div
          v-for="item in robotTemplates"
          :key="item.id"
          class="robot-picker-item"
          :class="{ active: item.id === selectedNewChatRobotId }"
          @click="selectedNewChatRobotId = item.id"
        >
          <div class="robot-picker-avatar">
            <img v-if="item.avatar" :src="item.avatar" alt="" />
            <span v-else>{{ (item.name || '智').slice(0, 1) }}</span>
          </div>
          <div class="robot-picker-name">{{ item.name || '未命名智能体' }}</div>
          <div class="robot-picker-desc">{{ item.description || '暂无简介' }}</div>
        </div>
      </div>
      <div v-else class="history-empty">暂无智能体卡片，请先去“设置智能体”里维护</div>
      <div class="mobile-overlay-actions drawer-actions">
        <TButton block theme="primary" @click="confirmStartNewChat">开始新聊天</TButton>
      </div>
    </div>
  </TDialog>

  <TDrawer
    v-if="isMobile"
    v-model:visible="agentManageVisible"
    placement="right"
    :footer="false"
  >
    <template #header>
      设置智能体
    </template>
    <div class="mobile-overlay-body">
      <div class="config-layout" :class="{ mobile: isMobile }">
        <div class="config-list">
          <TButton block variant="outline" @click="openMobileAgentCreateDialog">新增智能体</TButton>
          <div v-if="robotTemplates.length" class="config-list-body">
            <div
              v-for="(item, index) in robotTemplates"
              :key="item.id"
              class="config-card"
            >
              <div class="config-card-head">
                <span class="config-card-name">{{ item.name || `智能体 ${index + 1}` }}</span>
              </div>
              <div class="config-card-meta">{{ item.description || '暂无简介' }}</div>
              <div class="config-card-meta">{{ item.systemPrompt || '未填写 System Prompt' }}</div>
              <TSpace align="center" size="small">
                <TButton variant="text" size="small" @click.stop="openMobileAgentEditDialog(item.id)"
                  >编辑</TButton
                >
                <TButton
                  variant="text"
                  size="small"
                  theme="danger"
                  :loading="savingMobileAgent"
                  @click.stop="removeMobileAgent(item.id)"
                  >删除</TButton
                >
              </TSpace>
            </div>
          </div>
          <div v-else class="config-empty">暂无智能体配置</div>
        </div>
      </div>
    </div>
  </TDrawer>
  <TDrawer
    v-if="isMobile"
    v-model:visible="mobileAgentEditorVisible"
    placement="bottom"
    size="80%"
    :footer="false"
  >
    <template #header>
      {{ mobileAgentEditorMode === 'edit' ? '编辑智能体' : '新增智能体' }}
    </template>
    <div class="mobile-overlay-body">
      <TForm label-align="top">
        <TFormItem label="名称">
          <TInput v-model="mobileAgentDraft.name" placeholder="例如：销售顾问 / 数据分析师" />
        </TFormItem>
        <TFormItem label="简介">
          <TInput v-model="mobileAgentDraft.description" placeholder="用于卡片展示的说明" />
        </TFormItem>
        <TFormItem label="头像">
          <TInput v-model="mobileAgentDraft.avatar" placeholder="请输入头像图片 URL" />
        </TFormItem>
        <TFormItem label="System Prompt">
          <TTextarea
            v-model="mobileAgentDraft.systemPrompt"
            :autosize="{ minRows: 5, maxRows: 8 }"
          />
        </TFormItem>
      </TForm>
      <div class="mobile-overlay-actions drawer-actions">
        <TButton block theme="primary" :loading="savingMobileAgent" @click="saveMobileAgent">
          {{ mobileAgentEditorMode === 'edit' ? '保存修改' : '新增智能体' }}
        </TButton>
      </div>
    </div>
  </TDrawer>
  <TDialog
    v-if="!isMobile"
    v-model:visible="agentManageVisible"
    header="设置智能体"
    width="900px"
    :footer="false"
    :confirm-btn="null"
    :cancel-btn="null"
  >
    <div class="mobile-overlay-body">
      <div class="config-layout" :class="{ mobile: isMobile }">
        <div class="config-list">
          <div class="config-list-header">
            <span class="config-title">已配置智能体</span>
          </div>
          <div v-if="robotTemplates.length" class="config-list-body">
            <div
              v-for="(item, index) in robotTemplates"
              :key="item.id"
              class="config-card"
              :class="{ active: item.id === editingAgentId }"
              @click="selectEditingAgent(item.id)"
            >
              <div class="config-card-head">
                <span class="config-card-name">{{ item.name || `智能体 ${index + 1}` }}</span>
              </div>
              <div class="config-card-meta">{{ item.description || '暂无简介' }}</div>
              <div class="config-card-meta">{{ item.systemPrompt || '未填写 System Prompt' }}</div>
              <TSpace align="center" size="small">
                <TButton
                  variant="text"
                  size="small"
                  theme="danger"
                  @click.stop="removeAgentTemplate(item.id)"
                  >删除</TButton
                >
              </TSpace>
            </div>
          </div>
          <div v-else class="config-empty">暂无智能体配置</div>
          <TButton block variant="outline" @click="addAgentTemplate">新增智能体</TButton>
        </div>

        <div class="config-editor">
          <div v-if="editingAgent" class="session-robot-form-card">
            <div class="config-title">智能体详情</div>
            <TForm label-align="top">
              <TFormItem label="名称">
                <TInput v-model="editingAgent.name" placeholder="例如：销售顾问 / 数据分析师" />
              </TFormItem>
              <TFormItem label="简介">
                <TInput
                  v-model="editingAgent.description"
                  placeholder="用于卡片展示的说明"
                />
              </TFormItem>
              <TFormItem label="头像">
                <TInput v-model="editingAgent.avatar" placeholder="请输入头像图片 URL" />
              </TFormItem>
              <TFormItem label="System Prompt">
                <TTextarea
                  v-model="editingAgent.systemPrompt"
                  :autosize="{ minRows: 5, maxRows: 8 }"
                />
              </TFormItem>
            </TForm>
          </div>
          <div v-else class="config-empty">请选择一个智能体</div>
        </div>
      </div>
      <div class="mobile-overlay-actions drawer-actions">
        <TButton block theme="primary" :loading="savingAgentTemplates" @click="saveAgentTemplates"
          >保存智能体</TButton
        >
      </div>
    </div>
  </TDialog>

  <TDrawer
    v-if="isMobile"
    v-model:visible="configVisible"
    placement="right"
    :footer="false"
  >

      <template #header>
        模型配置
      </template>
    <div class="mobile-overlay-body">
      <div class="config-layout" :class="{ mobile: isMobile }">
        <div class="config-list">
          <TButton block variant="outline" @click="openMobileModelCreateDialog">增加模型</TButton>
          <div v-if="modelConfigs.length" class="config-list-body">
            <div
              v-for="item in modelConfigs"
              :key="item.id"
              class="config-card"
              :class="{ active: item.id === activeModelConfigId }"
              @click="setActiveModelAndClose(item.id)"
            >
              <div class="config-card-head">
                <span class="config-card-name">{{ item.name || '未命名配置' }}</span>
                <span v-if="item.id === activeModelConfigId" class="config-badge">当前使用</span>
              </div>
              <div class="config-card-meta">
                {{ item.provider }} / {{ item.model || '未选择模型' }}
              </div>
              <div class="config-card-meta">{{ item.baseUrl || '未填写地址' }}</div>
              <TSpace align="center" size="small">
                <TButton variant="text" size="small" @click.stop="openMobileModelEditDialog(item.id)"
                  >编辑</TButton
                >
                <TButton
                  variant="text"
                  size="small"
                  theme="danger"
                  :loading="savingMobileModel"
                  @click.stop="removeMobileModel(item.id)"
                  >删除</TButton
                >
              </TSpace>
            </div>
          </div>
          <div v-else class="config-empty">暂无模型配置</div>
        </div>
      </div>
    </div>
  </TDrawer>
  <TDrawer
    v-if="isMobile"
    v-model:visible="mobileModelEditorVisible"
    placement="bottom"
    size="80%"
    :footer="false"
  >
    <template #header>
      {{ mobileModelEditorMode === 'edit' ? '编辑模型配置' : '新增模型配置' }}
    </template>
    <div class="mobile-overlay-body">
      <TForm label-align="top">
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
            @change="handleMobileModelProviderChange"
          />
        </TFormItem>
        <TFormItem label="Base URL">
          <TInput v-model="mobileModelDraft.baseUrl" placeholder="请输入 AI 服务地址" />
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
            <TButton variant="outline" @click="refreshMobileModelOptions">刷新模型</TButton>
            <div v-if="modelOptionsMap[mobileModelDraft.id]?.length" class="mobile-model-button-list">
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
        <TFormItem label="Temperature">
          <TInputNumber
            v-model="mobileModelTemperatureValue"
            :decimal-places="1"
            :step="0.1"
            :min="0"
            :max="2"
          />
        </TFormItem>
        <TSpace align="center" class="config-test-row">
          <TButton variant="outline" :loading="testingConnection" @click="handleMobileModelTestConnection"
            >测试连接</TButton
          >
          <span class="dialog-tip">测试成功后会更新当前配置的模型候选列表</span>
        </TSpace>
      </TForm>
      <div class="mobile-overlay-actions drawer-actions">
        <TButton block theme="primary" :loading="savingMobileModel" @click="saveMobileModel">
          {{ mobileModelEditorMode === 'edit' ? '保存修改' : '新增模型配置' }}
        </TButton>
      </div>
    </div>
  </TDrawer>
  <TDialog
    v-else
    v-model:visible="configVisible"
    header="模型配置"
    width="900px"
    :footer="false"
    :confirm-btn="null"
    :cancel-btn="null"
  >
    <div class="mobile-overlay-body">
      <div class="desktop-config-grid-shell">
        <div class="desktop-config-toolbar">
          <div class="config-list-header">
            <span class="config-title">已配置模型</span>
          </div>
          <TButton variant="outline" @click="openDesktopModelCreateDialog">增加模型</TButton>
        </div>
        <div v-if="modelConfigs.length" class="desktop-config-grid">
            <div
              v-for="item in modelConfigs"
              :key="item.id"
              class="config-card"
              :class="{ active: item.id === activeModelConfigId }"
              @click="setActiveModelAndClose(item.id)"
            >
              <div class="config-card-head">
                <span class="config-card-name">{{ item.name || '未命名配置' }}</span>
                <span v-if="item.id === activeModelConfigId" class="config-badge">当前使用</span>
              </div>
              <div class="config-card-meta">
                {{ item.provider }} / {{ item.model || '未选择模型' }}
              </div>
              <div class="config-card-meta">{{ item.baseUrl || '未填写地址' }}</div>
              <TSpace align="center" size="small">
                <TButton variant="text" size="small" @click.stop="openDesktopModelEditDialog(item.id)"
                  >编辑</TButton
                >
                <TButton
                  variant="text"
                  size="small"
                  theme="danger"
                  :loading="savingDesktopModel"
                  @click.stop="removeDesktopModel(item.id)"
                  >删除</TButton
                >
              </TSpace>
            </div>
        </div>
        <div v-else class="config-empty">暂无模型配置</div>
      </div>
    </div>
  </TDialog>
  <TDialog
    v-if="!isMobile"
    v-model:visible="desktopModelEditorVisible"
    :header="desktopModelEditorMode === 'edit' ? '编辑模型配置' : '新增模型配置'"
    width="640px"
    :footer="false"
    :confirm-btn="null"
    :cancel-btn="null"
  >
    <div class="mobile-overlay-body">
      <TForm label-align="top">
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
            @change="handleDesktopModelProviderChange"
          />
        </TFormItem>
        <TFormItem label="Base URL">
          <TInput v-model="desktopModelDraft.baseUrl" placeholder="请输入 AI 服务地址" />
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
            <TButton variant="outline" @click="refreshDesktopModelOptions">刷新模型</TButton>
          </TSpace>
        </TFormItem>
        <TFormItem label="Temperature">
          <TInputNumber
            v-model="desktopModelTemperatureValue"
            :decimal-places="1"
            :step="0.1"
            :min="0"
            :max="2"
          />
        </TFormItem>
        <TSpace align="center" class="config-test-row">
          <TButton variant="outline" :loading="testingConnection" @click="handleDesktopModelTestConnection"
            >测试连接</TButton
          >
          <span class="dialog-tip">测试成功后会更新当前配置的模型候选列表</span>
        </TSpace>
      </TForm>
      <div class="mobile-overlay-actions drawer-actions">
        <TButton block theme="primary" :loading="savingDesktopModel" @click="saveDesktopModel">
          {{ desktopModelEditorMode === 'edit' ? '保存修改' : '新增模型配置' }}
        </TButton>
      </div>
    </div>
  </TDialog>

  <TDrawer
    v-if="isMobile"
    v-model:visible="sessionRobotVisible"
    :header="false"
    placement="right"
    size="100%"
    :footer="false"
  >
    <div class="mobile-overlay-body">
      <div class="mobile-overlay-topbar">
        <div class="mobile-overlay-title">编辑当前智能体</div>
        <TButton variant="text" @click="sessionRobotVisible = false">关闭</TButton>
      </div>
      <div class="session-robot-shell">
        <div class="session-robot-hero">
          <div class="session-robot-avatar">
            <img v-if="sessionRobotDraft.avatar" :src="sessionRobotDraft.avatar" alt="" />
            <span v-else>{{ (sessionRobotDraft.name || '智').slice(0, 1) }}</span>
          </div>
          <div class="session-robot-hero-text">
            <div class="session-robot-hero-title">{{ sessionRobotDraft.name || '当前智能体' }}</div>
            <div class="session-robot-hero-subtitle">修改后仅作用于当前会话上下文</div>
          </div>
        </div>
        <div class="session-robot-form-card">
          <TForm label-align="top">
            <TFormItem label="名称">
              <TInput v-model="sessionRobotDraft.name" placeholder="例如：销售顾问 / 数据分析师" />
            </TFormItem>
            <TFormItem label="头像">
              <TInput v-model="sessionRobotDraft.avatar" placeholder="请输入头像图片 URL" />
            </TFormItem>
            <TFormItem label="System Prompt">
              <TTextarea
                v-model="sessionRobotDraft.systemPrompt"
                :autosize="{ minRows: 5, maxRows: 8 }"
              />
            </TFormItem>
          </TForm>
        </div>
      </div>
      <div class="mobile-overlay-actions drawer-actions">
        <TButton block theme="primary" @click="applySessionRobot">应用到当前上下文</TButton>
      </div>
    </div>
  </TDrawer>
  <TDialog
    v-else
    v-model:visible="sessionRobotVisible"
    header="编辑当前智能体"
    width="560px"
    :footer="false"
    :confirm-btn="null"
    :cancel-btn="null"
  >
    <div class="mobile-overlay-body">
      <div class="session-robot-shell">
        <div class="session-robot-hero">
          <div class="session-robot-avatar">
            <img v-if="sessionRobotDraft.avatar" :src="sessionRobotDraft.avatar" alt="" />
            <span v-else>{{ (sessionRobotDraft.name || '智').slice(0, 1) }}</span>
          </div>
          <div class="session-robot-hero-text">
            <div class="session-robot-hero-title">{{ sessionRobotDraft.name || '当前智能体' }}</div>
            <div class="session-robot-hero-subtitle">修改后仅作用于当前会话上下文</div>
          </div>
        </div>
        <div class="session-robot-form-card">
          <TForm label-align="top">
            <TFormItem label="名称">
              <TInput v-model="sessionRobotDraft.name" placeholder="例如：销售顾问 / 数据分析师" />
            </TFormItem>
            <TFormItem label="头像">
              <TInput v-model="sessionRobotDraft.avatar" placeholder="请输入头像图片 URL" />
            </TFormItem>
            <TFormItem label="System Prompt">
              <TTextarea
                v-model="sessionRobotDraft.systemPrompt"
                :autosize="{ minRows: 5, maxRows: 8 }"
              />
            </TFormItem>
          </TForm>
        </div>
      </div>
      <div class="mobile-overlay-actions drawer-actions">
        <TButton block theme="primary" @click="applySessionRobot">应用到当前上下文</TButton>
      </div>
    </div>
  </TDialog>

  <TDrawer
    v-if="isMobile"
    v-model:visible="memoryVisible"
    :header="false"
    placement="right"
    size="100%"
    :footer="false"
  >
    <div class="mobile-overlay-body">
      <div class="mobile-overlay-topbar">
        <div class="mobile-overlay-title">会话记忆</div>
        <TButton variant="text" @click="memoryVisible = false">关闭</TButton>
      </div>
      <TForm label-align="top">
        <TFormItem label="压缩阈值">
          <TInputNumber v-model="memoryDraft.threshold" :min="1" :step="1" />
        </TFormItem>
        <TFormItem label="最近原始消息保留条数">
          <TInputNumber v-model="memoryDraft.recentMessageLimit" :min="1" :step="1" />
        </TFormItem>
        <TFormItem label="长期记忆摘要">
          <TTextarea v-model="memoryDraft.summary" :autosize="{ minRows: 8, maxRows: 14 }" />
        </TFormItem>
        <div class="memory-meta">
          <div>最近更新时间：{{ memoryUpdatedLabel }}</div>
          <div>已覆盖消息数：{{ currentMemory.sourceMessageCount }}</div>
        </div>
        <TSpace align="center" size="small" class="memory-action-row">
          <TButton
            theme="danger"
            variant="outline"
            :loading="clearingMemory"
            @click="clearCurrentSessionMemory"
            >清空记忆</TButton
          >
        </TSpace>
      </TForm>
      <div class="mobile-overlay-actions drawer-actions">
        <TButton block theme="primary" :loading="savingMemory" @click="saveSessionMemoryConfig"
          >保存记忆配置</TButton
        >
      </div>
    </div>
  </TDrawer>
  <TDialog
    v-else
    v-model:visible="memoryVisible"
    header="会话记忆"
    width="640px"
    :footer="false"
    :confirm-btn="null"
    :cancel-btn="null"
  >
    <div class="mobile-overlay-body">
      <TForm label-align="top">
        <TFormItem label="压缩阈值">
          <TInputNumber v-model="memoryDraft.threshold" :min="1" :step="1" />
        </TFormItem>
        <TFormItem label="最近原始消息保留条数">
          <TInputNumber v-model="memoryDraft.recentMessageLimit" :min="1" :step="1" />
        </TFormItem>
        <TFormItem label="长期记忆摘要">
          <TTextarea v-model="memoryDraft.summary" :autosize="{ minRows: 8, maxRows: 14 }" />
        </TFormItem>
        <div class="memory-meta">
          <div>最近更新时间：{{ memoryUpdatedLabel }}</div>
          <div>已覆盖消息数：{{ currentMemory.sourceMessageCount }}</div>
        </div>
        <TSpace align="center" size="small" class="memory-action-row">
          <TButton
            theme="danger"
            variant="outline"
            :loading="clearingMemory"
            @click="clearCurrentSessionMemory"
            >清空记忆</TButton
          >
        </TSpace>
      </TForm>
      <div class="mobile-overlay-actions drawer-actions">
        <TButton block theme="primary" :loading="savingMemory" @click="saveSessionMemoryConfig"
          >保存记忆配置</TButton
        >
      </div>
    </div>
  </TDialog>
</template>

<script setup lang="ts">
import {
  Button as TButton,
  Checkbox as TCheckbox,
  CheckboxGroup as TCheckboxGroup,
  Dialog as TDialog,
  Drawer as TDrawer,
  Form as TForm,
  FormItem as TFormItem,
  Input as TInput,
  InputNumber as TInputNumber,
  Radio as TRadio,
  RadioGroup as TRadioGroup,
  Select as TSelect,
  Space as TSpace,
  Statistic as TStatistic,
  Textarea as TTextarea,
} from 'tdesign-vue-next'
import {
  AiEducationIcon,
  LightbulbIcon,
  MenuIcon,
  OrderIcon,
  SettingIcon,
} from 'tdesign-icons-vue-next'

import PlaceholderPane from '@/components/chat/PlaceholderPane.vue'
import PrimaryNav from '@/components/chat/PrimaryNav.vue'
import SessionHistoryPanel from '@/components/chat/SessionHistoryPanel.vue'
import { useChatView } from '@/hooks/useChatView'

const {
  activePrimaryTab,
  sidebarDrawerVisible,
  newChatVisible,
  configVisible,
  agentManageVisible,
  mobileAgentEditorVisible,
  mobileModelEditorVisible,
  desktopModelEditorVisible,
  sessionRobotVisible,
  memoryVisible,
  savingConfig,
  savingAgentTemplates,
  savingMobileAgent,
  savingMobileModel,
  savingDesktopModel,
  loadingModels,
  testingConnection,
  savingMemory,
  clearingMemory,
  chatbotRef,
  chatbotRuntimeKey,
  sessionId,
  sessionHistory,
  deletingSessionId,
  robotTemplates,
  selectedNewChatRobotId,
  editingAgentId,
  mobileAgentEditorMode,
  desktopModelEditorMode,
  editingAgent,
  submittedForms,
  isChatResponding,
  modelConfigs,
  editingConfigId,
  activeModelConfigId,
  editingConfig,
  modelOptionsMap,
  sessionRobotDraft,
  memoryDraft,
  mobileAgentDraft,
  mobileModelDraft,
  desktopModelDraft,
  currentRobotLabel,
  currentModelLabel,
  sessionPromptTokens,
  sessionCompletionTokens,
  promptTokenAnimation,
  promptTokenAnimationStart,
  completionTokenAnimation,
  completionTokenAnimationStart,
  effectiveStream,
  effectiveThinking,
  showStreamToggle,
  showThinkingToggle,
  formActivitySlots,
  editingModelOptions,
  temperatureValue,
  mobileModelTemperatureValue,
  desktopModelTemperatureValue,
  mobileModelEditorMode,
  memoryUpdatedLabel,
  currentMemory,
  providerOptions,
  chatMessageProps,
  chatServiceConfig,
  handleChatMessageChange,
  getFormDraft,
  submitChatForm,
  switchStream,
  switchThinking,
  refreshEditingModels,
  handleTestConnection,
  handleProviderChange,
  saveAllModelConfigs,
  openConfigDialog,
  selectEditingConfig,
  setActiveModel,
  setActiveModelAndClose,
  removeModelConfig,
  addModelConfig,
  addAgentTemplate,
  openMobileAgentCreateDialog,
  openMobileAgentEditDialog,
  openMobileModelCreateDialog,
  openMobileModelEditDialog,
  openDesktopModelCreateDialog,
  openDesktopModelEditDialog,
  handleDesktopModelProviderChange,
  refreshDesktopModelOptions,
  handleDesktopModelTestConnection,
  handleMobileModelProviderChange,
  refreshMobileModelOptions,
  handleMobileModelTestConnection,
  removeAgentTemplate,
  removeMobileAgent,
  removeMobileModel,
  removeDesktopModel,
  selectEditingAgent,
  saveMobileAgent,
  saveMobileModel,
  saveDesktopModel,
  saveAgentTemplates,
  openSessionRobotDialog,
  applySessionRobot,
  openMemoryDialog,
  saveSessionMemoryConfig,
  clearCurrentSessionMemory,
  confirmStartNewChat,
  handleNewChatEntry,
  handleGoToRobotPage,
  openHistorySession,
  handleDeleteSession,
  isMobile,
} = useChatView()
</script>

<style src="./ChatView.css"></style>
