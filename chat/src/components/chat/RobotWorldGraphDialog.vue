<template>
  <div v-if="!hasGraphSource" class="empty-state">{{ emptyStateText }}</div>
  <div v-else-if="loading" class="empty-state">正在加载世界设定...</div>
  <div v-else class="world-shell">
    <aside class="sidebar">
      <div class="sidebar-tabs" :class="{ single: !showRelationTypeTab }">
        <button class="sidebar-tab" :class="{ active: activePanel === 'graph' }" @click="switchPanel('graph')">图谱</button>
        <button
          v-if="showRelationTypeTab"
          class="sidebar-tab"
          :class="{ active: activePanel === 'relation-types' }"
          @click="switchPanel('relation-types')"
        >
          关系类型
        </button>
      </div>
      <div v-if="!isReadOnly" class="sidebar-tools">
        <TButton class="world-settings-button" size="small" variant="outline" @click="openMetaEditor">世界设定</TButton>
      </div>
      <div class="sidebar-search">
        <TInput v-model="searchKeyword" borderless placeholder="搜索" />
      </div>
      <div class="sidebar-list">
        <button
          v-for="item in sidebarItems"
          :key="item.id"
          class="sidebar-item"
          :class="{ active: item.active, disabled: item.disabled, future: item.future }"
          :disabled="item.disabled"
          @click="item.onClick"
        >
          <span>{{ item.label }}</span>
        </button>
        <div v-if="!sidebarItems.length" class="sidebar-empty">暂无内容</div>
      </div>
      <div class="sidebar-footer">
        <div v-if="!isReadOnly && createMenuVisible" class="create-menu">
          <button
            v-for="item in creatableObjectTypeOptions"
            :key="item.value"
            class="create-menu-item"
            @click="handleCreateNode(item.value)"
          >
            新增{{ item.label }}
          </button>
        </div>
        <TButton v-if="!isReadOnly" class="create-button" variant="outline" @click="handleSidebarCreate">新增</TButton>
        <TButton class="close-button" variant="text" @click="closeWorldGraph">关闭</TButton>
      </div>
    </aside>

    <section class="canvas-area">
      <div class="graph-stage-shell" :class="{ 'with-timeline': showTimelineDock, collapsed: showTimelineDock && timelineCollapsed }">
        <WorldGraphCanvasX6
          :nodes="canvasNodes"
          :edges="canvasEdges"
          :relation-types="relationTypes"
          :selected-node-id="selectedNodeId"
          :selected-edge-id="selectedEdgeId"
          :linking-source-node-id="linkingSourceNodeId"
          :current-sequence-index="currentSequenceIndex"
          :layout="meta.layout"
          :read-only="isReadOnly"
          :show-event-nodes="isSessionMode"
          :show-all-edges="isSessionMode && showAllSessionRelations"
          :fit-request-key="fitRequestKey"
          @select-node="selectNode"
          @select-edge="selectEdge"
          @clear-selection="clearGraphSelection"
          @move-node="handleNodeMove"
          @pick-link-target-node="handleLinkTargetPick"
          @start-link-from-node="beginLinking"
          @cancel-linking="cancelLinking"
          @request-auto-layout="autoLayout"
          @update-layout="updateGraphLayout"
        />

        <aside v-if="selectedCanvasNode" class="node-detail-panel">
          <div class="node-detail-head">
            <div>
              <span class="node-detail-type">{{ objectTypeLabel[selectedCanvasNode.objectType] }}</span>
              <strong>{{ selectedCanvasNode.name || '未命名对象' }}</strong>
              <small>起始时间点 {{ selectedCanvasNode.startSequenceIndex }}</small>
            </div>
            <TButton variant="text" size="small" @click="clearGraphSelection">关闭</TButton>
          </div>

          <div class="node-detail-actions">
            <TButton v-if="!isReadOnly" size="small" theme="primary" @click="openSelectedNodeEditor">编辑</TButton>
            <TButton v-if="!isReadOnly" size="small" variant="outline" @click="startLinkingFromDetail">连线</TButton>
          </div>

          <div class="node-detail-body">
            <div v-if="selectedCanvasNode.summary" class="node-detail-section">
              <span>介绍</span>
              <p>{{ selectedCanvasNode.summary }}</p>
            </div>

            <div v-if="selectedCanvasNode.tags.length" class="node-detail-section">
              <span>标签</span>
              <div class="node-tag-list">
                <em v-for="tag in selectedCanvasNode.tags" :key="tag">{{ tag }}</em>
              </div>
            </div>

            <div v-if="selectedNodeDetailItems.length" class="node-detail-section">
              <span>属性</span>
              <div class="node-detail-grid">
                <div v-for="item in selectedNodeDetailItems" :key="item.key" class="node-detail-item">
                  <small>{{ item.label }}</small>
                  <strong>{{ item.value }}</strong>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <aside v-else-if="selectedCanvasEdge && isReadOnly" class="node-detail-panel">
          <div class="node-detail-head">
            <div>
              <span class="node-detail-type">关系</span>
              <strong>{{ selectedCanvasEdgeRelationLabel }}</strong>
              <small>{{ selectedCanvasEdgeSourceName }} -> {{ selectedCanvasEdgeTargetName }}</small>
            </div>
            <TButton variant="text" size="small" @click="clearGraphSelection">关闭</TButton>
          </div>

          <div class="node-detail-body">
            <div class="node-detail-section">
              <span>说明</span>
              <p>{{ selectedCanvasEdge.summary || '暂无说明' }}</p>
            </div>

            <div v-if="selectedEdgeDetailItems.length" class="node-detail-section">
              <span>详情</span>
              <div class="node-detail-grid">
                <div v-for="item in selectedEdgeDetailItems" :key="item.key" class="node-detail-item">
                  <small>{{ item.label }}</small>
                  <strong>{{ item.value }}</strong>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div v-if="!isReadOnly && relationTypePickerVisible" class="relation-picker-mask" @click.self="cancelLinking">
          <div class="relation-picker">
            <div class="relation-picker-title">选择关联类型</div>
            <div class="relation-picker-subtitle">{{ linkingSourceName }} -> {{ linkingTargetName }}</div>
            <button
              v-for="item in availableLinkRelationTypes"
              :key="item.id"
              class="relation-picker-item"
              @click="createEdgeWithType(item)"
            >
              {{ item.label }}
            </button>
            <div v-if="!availableLinkRelationTypes.length" class="sidebar-empty">这两个对象之间暂无可用关系类型</div>
            <TButton variant="text" @click="cancelLinking">取消</TButton>
          </div>
        </div>

        <div v-if="editorVisible && !isReadOnly" class="editor-popup-layer" @click.self="closeEditor">
          <section class="editor-popup">
            <div class="editor-head">
              <div>
                <strong>{{ editorTitle }}</strong>
                <small>{{ editorSubtitle }}</small>
              </div>
            </div>

            <div class="editor-body">
              <template v-if="editorMode === 'node' && nodeDraft">
                <TForm label-align="top">
                  <TFormItem label="名称"><TInput v-model="nodeDraft.name" /></TFormItem>
                  <TFormItem label="介绍"><TTextarea v-model="nodeDraft.summary" :autosize="{ minRows: 2, maxRows: 4 }" /></TFormItem>
                  <TFormItem label="标签"><TInput v-model="nodeTagsInput" placeholder="逗号分隔" /></TFormItem>
                  <TFormItem v-for="field in selectedNodeFields" :key="field.key" :label="field.label">
                    <TTextarea
                      v-if="field.input === 'textarea'"
                      :model-value="String(readNodeAttribute(field.key) ?? '')"
                      :autosize="{ minRows: 2, maxRows: 4 }"
                      @update:model-value="writeNodeAttribute(field.key, $event, field.input)"
                    />
                    <TInputNumber
                      v-else-if="field.input === 'number'"
                      :model-value="Number(readNodeAttribute(field.key) || 0)"
                      @update:model-value="writeNodeAttribute(field.key, $event, field.input)"
                    />
                    <TInput
                      v-else
                      :model-value="String(readNodeAttribute(field.key) ?? '')"
                      @update:model-value="writeNodeAttribute(field.key, $event, field.input)"
                    />
                  </TFormItem>

                  <template v-if="nodeDraft.objectType === 'event'">
                    <TFormItem label="时间序号">
                      <TInputNumber
                        :model-value="nodeDraft.timeline?.sequenceIndex || 0"
                        :min="0"
                        :max="currentSequenceIndex + 1"
                        @update:model-value="writeTimelineField('sequenceIndex', $event, 'number')"
                      />
                    </TFormItem>
                    <TFormItem v-for="field in eventTimelineFields" :key="field.key" :label="field.label">
                      <TInputNumber
                        v-if="field.input === 'number'"
                        :model-value="Number(readTimelineField(field.key) || 0)"
                        :min="0"
                        :max="100"
                        @update:model-value="writeTimelineField(field.key, $event, field.input)"
                      />
                      <TInput
                        v-else
                        :model-value="String(readTimelineField(field.key) ?? '')"
                        @update:model-value="writeTimelineField(field.key, $event, field.input)"
                      />
                    </TFormItem>
                    <div class="effects-section">
                      <div class="effects-head">
                        <span>事件影响</span>
                        <TButton size="small" variant="outline" @click="addEffect">新增影响</TButton>
                      </div>
                      <div v-for="effect in nodeDraft.effects" :key="effect.id" class="effect-card">
                        <TSelect
                          :model-value="effect.targetNodeId"
                          :options="eventEffectTargetNodeOptions"
                          filterable
                          placeholder="先选择节点"
                          @update:model-value="updateEffect(effect.id, 'targetNodeId', $event)"
                        />
                        <TSelect
                          :model-value="effect.changeTargetType"
                          :options="effectChangeTargetOptions"
                          placeholder="选择变化类型"
                          @update:model-value="updateEffect(effect.id, 'changeTargetType', $event)"
                        />
                        <TInput :model-value="effect.summary" placeholder="影响说明" @update:model-value="updateEffect(effect.id, 'summary', $event)" />

                        <template v-if="effect.changeTargetType === 'node-content'">
                          <div v-if="getEffectTargetNode(effect)" class="effect-mode-panel">
                            <div class="effect-mode-title">节点内容变化</div>
                            <div v-for="field in getEffectNodeFieldOptions(effect)" :key="field.key" class="effect-field-row">
                              <button class="effect-field-toggle" :class="{ active: Boolean(findEffectNodeAttributeChange(effect, field.key)) }" @click="toggleEffectNodeAttributeChange(effect.id, field.key)">
                                {{ field.label }}
                              </button>
                              <template v-if="findEffectNodeAttributeChange(effect, field.key)">
                                <TInput :model-value="readEffectNodeFieldCurrentValue(effect, field.key)" disabled placeholder="当前值" />
                                <TInputNumber
                                  v-if="field.input === 'number'"
                                  :model-value="Number(findEffectNodeAttributeChange(effect, field.key)?.afterValue || 0)"
                                  @update:model-value="updateEffectNodeAttributeChange(effect.id, field.key, 'afterValue', $event)"
                                />
                                <TTextarea
                                  v-else-if="field.input === 'textarea'"
                                  :model-value="findEffectNodeAttributeChange(effect, field.key)?.afterValue || ''"
                                  :autosize="{ minRows: 2, maxRows: 3 }"
                                  @update:model-value="updateEffectNodeAttributeChange(effect.id, field.key, 'afterValue', $event)"
                                />
                                <TInput
                                  v-else
                                  :model-value="findEffectNodeAttributeChange(effect, field.key)?.afterValue || ''"
                                  placeholder="变更后"
                                  @update:model-value="updateEffectNodeAttributeChange(effect.id, field.key, 'afterValue', $event)"
                                />
                              </template>
                            </div>
                          </div>
                          <div v-else class="sidebar-empty">先选择要发生变化的节点</div>
                        </template>

                        <template v-else>
                          <div v-if="getEffectTargetNode(effect)" class="effect-mode-panel">
                            <div class="effect-mode-switch">
                              <button
                                v-for="item in effectRelationModeOptions"
                                :key="item.value"
                                class="effect-mode-chip"
                                :class="{ active: effect.relationMode === item.value }"
                                @click="updateEffect(effect.id, 'relationMode', item.value)"
                              >
                                {{ item.label }}
                              </button>
                            </div>

                            <template v-if="effect.relationMode === 'existing'">
                              <TSelect
                                :model-value="effect.relationId"
                                :options="getEffectRelationOptions(effect)"
                                filterable
                                placeholder="选择已有关系"
                                @update:model-value="updateEffect(effect.id, 'relationId', $event)"
                              />
                              <div v-if="getSelectedEffectRelation(effect)" class="effect-mode-panel">
                                <div class="effect-mode-title">关系变化</div>
                                <div v-for="field in relationEffectFieldMap" :key="field.key" class="effect-field-row">
                                  <button class="effect-field-toggle" :class="{ active: Boolean(findEffectRelationChange(effect, field.key)) }" @click="toggleEffectRelationChange(effect.id, field.key)">
                                    {{ field.label }}
                                  </button>
                                  <template v-if="findEffectRelationChange(effect, field.key)">
                                    <TInput :model-value="readEffectRelationFieldCurrentValue(effect, field.key)" disabled placeholder="当前值" />
                                    <TInputNumber
                                      v-if="field.input === 'number'"
                                      :model-value="Number(findEffectRelationChange(effect, field.key)?.afterValue || 0)"
                                      @update:model-value="updateEffectRelationChange(effect.id, field.key, 'afterValue', $event)"
                                    />
                                    <TTextarea
                                      v-else-if="field.input === 'textarea'"
                                      :model-value="findEffectRelationChange(effect, field.key)?.afterValue || ''"
                                      :autosize="{ minRows: 2, maxRows: 3 }"
                                      @update:model-value="updateEffectRelationChange(effect.id, field.key, 'afterValue', $event)"
                                    />
                                    <TInput
                                      v-else
                                      :model-value="findEffectRelationChange(effect, field.key)?.afterValue || ''"
                                      placeholder="变更后"
                                      @update:model-value="updateEffectRelationChange(effect.id, field.key, 'afterValue', $event)"
                                    />
                                  </template>
                                </div>
                              </div>
                              <div v-else class="sidebar-empty">先选择当前节点的一条已有关系</div>
                            </template>

                            <template v-else>
                              <TSelect
                                :model-value="effect.relationDraft.targetNodeId"
                                :options="getEffectCreateRelationTargetNodeOptions(effect)"
                                filterable
                                placeholder="选择目标节点"
                                @update:model-value="updateEffectRelationDraft(effect.id, 'targetNodeId', $event)"
                              />
                              <TSelect
                                :model-value="effect.relationDraft.relationTypeCode"
                                :options="getEffectCreateRelationTypeOptions(effect)"
                                placeholder="选择关系类型"
                                @update:model-value="updateEffectRelationDraft(effect.id, 'relationTypeCode', $event)"
                              />
                              <TInput :model-value="effect.relationDraft.relationLabel" placeholder="关系显示名称" @update:model-value="updateEffectRelationDraft(effect.id, 'relationLabel', $event)" />
                              <TTextarea
                                :model-value="effect.relationDraft.summary"
                                :autosize="{ minRows: 2, maxRows: 3 }"
                                placeholder="关系说明"
                                @update:model-value="updateEffectRelationDraft(effect.id, 'summary', $event)"
                              />
                              <TInputNumber :model-value="effect.relationDraft.intensity ?? undefined" :min="0" :max="100" @update:model-value="updateEffectRelationDraft(effect.id, 'intensity', $event)" />
                            </template>
                          </div>
                          <div v-else class="sidebar-empty">先选择关系所属的起始节点</div>
                        </template>
                        <TButton theme="danger" variant="text" @click="removeEffect(effect.id)">删除</TButton>
                      </div>
                    </div>
                  </template>
                </TForm>
                <div class="editor-actions">
                  <TButton theme="primary" :loading="savingNode" @click="saveNode">保存对象</TButton>
                  <TButton theme="danger" variant="outline" @click="removeNode">删除对象</TButton>
                </div>
              </template>

              <template v-else-if="editorMode === 'edge' && edgeDraft">
                <TForm label-align="top">
                  <TFormItem label="关系类型"><TSelect v-model="edgeDraft.relationTypeCode" :options="editableEdgeRelationTypeOptions" /></TFormItem>
                  <TFormItem label="显示名称"><TInput v-model="edgeDraft.relationLabel" /></TFormItem>
                  <TFormItem label="说明"><TTextarea v-model="edgeDraft.summary" :autosize="{ minRows: 2, maxRows: 4 }" /></TFormItem>
                  <TFormItem label="强度"><TInputNumber :model-value="edgeDraft.intensity ?? undefined" :min="0" :max="100" @update:model-value="updateEdgeIntensity" /></TFormItem>
                </TForm>
                <div class="editor-actions">
                  <TButton theme="primary" :loading="savingEdge" @click="saveEdge">保存关系</TButton>
                  <TButton theme="danger" variant="outline" @click="removeEdge">删除关系</TButton>
                </div>
              </template>

              <template v-else-if="editorMode === 'relation-type' && typeDraft">
                <TForm label-align="top">
                  <TFormItem label="编码"><TInput v-model="typeDraft.code" :disabled="typeDraft.isBuiltin" /></TFormItem>
                  <TFormItem label="名称"><TInput v-model="typeDraft.label" :disabled="typeDraft.isBuiltin" /></TFormItem>
                  <TFormItem label="说明"><TTextarea v-model="typeDraft.description" :disabled="typeDraft.isBuiltin" :autosize="{ minRows: 3, maxRows: 5 }" /></TFormItem>
                  <TFormItem label="方向性"><TSelect v-model="typeDraft.directionality" :options="directionalityOptions" :disabled="typeDraft.isBuiltin" /></TFormItem>
                  <TFormItem label="源类型">
                    <TSelect v-model="typeSourceObjectTypes" :options="objectTypeOptions" :disabled="typeDraft.isBuiltin" multiple clearable />
                  </TFormItem>
                  <TFormItem label="目标类型">
                    <TSelect v-model="typeTargetObjectTypes" :options="objectTypeOptions" :disabled="typeDraft.isBuiltin" multiple clearable />
                  </TFormItem>
                </TForm>
                <div v-if="!typeDraft.isBuiltin" class="editor-actions">
                  <TButton theme="primary" :loading="savingType" @click="saveType">保存类型</TButton>
                  <TButton theme="danger" variant="outline" @click="removeType">删除类型</TButton>
                </div>
              </template>

              <div v-else class="sidebar-empty">选择一个对象、关系或关系类型</div>
            </div>
          </section>
        </div>

        <div v-if="metaEditorVisible && !isReadOnly" class="editor-popup-layer" @click.self="closeMetaEditor">
          <section class="editor-popup meta-editor-popup">
            <div class="editor-head">
              <div>
                <strong>世界设定</strong>
                <small>修改标题、概要、历法和展示信息</small>
              </div>
              <TButton variant="text" size="small" @click="closeMetaEditor">关闭</TButton>
            </div>

            <div class="editor-body">
              <TForm label-align="top" class="meta-form meta-form-popup">
                <TFormItem label="标题"><TInput v-model="meta.title" /></TFormItem>
                <TFormItem label="概要"><TTextarea v-model="meta.summary" :autosize="{ minRows: 2, maxRows: 4 }" /></TFormItem>
                <TFormItem label="历法 ID"><TInput v-model="meta.calendar.calendarId" /></TFormItem>
                <TFormItem label="历法名称"><TInput v-model="meta.calendar.calendarName" /></TFormItem>
                <TFormItem label="纪元"><TTextarea v-model="calendarErasInput" :autosize="{ minRows: 2, maxRows: 3 }" placeholder="每行一项" /></TFormItem>
                <TFormItem label="月份名称"><TTextarea v-model="calendarMonthNamesInput" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="每行一项" /></TFormItem>
                <TFormItem label="日期名称"><TTextarea v-model="calendarDayNamesInput" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="每行一项" /></TFormItem>
                <TFormItem label="时段名称"><TTextarea v-model="calendarTimeOfDayLabelsInput" :autosize="{ minRows: 2, maxRows: 3 }" placeholder="每行一项" /></TFormItem>
                <TFormItem label="格式模板"><TInput v-model="meta.calendar.formatTemplate" placeholder="{era} {yearLabel}年 {monthLabel} {dayLabel} {timeOfDayLabel}" /></TFormItem>
              </TForm>
              <div class="editor-actions">
                <TButton theme="primary" :loading="savingMeta" @click="saveGraphMeta">保存世界设定</TButton>
                <TButton variant="outline" @click="closeMetaEditor">取消</TButton>
              </div>
            </div>
          </section>
        </div>

        <div v-if="timelineEventDetailNode" class="editor-popup-layer" @click.self="closeTimelineEventDetail">
          <section class="timeline-event-detail-popup">
            <div class="editor-head">
              <div>
                <strong>{{ timelineEventDetailNode.name || '未命名事件' }}</strong>
                <small>{{ timelineEventDetailEntry ? getTimelinePointLabel(timelineEventDetailEntry.sequenceIndex) : '' }}</small>
              </div>
              <TButton variant="text" size="small" @click="closeTimelineEventDetail">关闭</TButton>
            </div>
            <div class="editor-body timeline-event-detail-body">
              <div class="node-detail-section">
                <span>事件详情</span>
                <p>{{ timelineEventDetailNode.summary || '暂无详情' }}</p>
              </div>
              <div v-if="timelineEventDetailNode.tags.length" class="node-detail-section">
                <span>标签</span>
                <div class="node-tag-list">
                  <em v-for="tag in timelineEventDetailNode.tags" :key="tag">{{ tag }}</em>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div
        v-if="showTimelineDock"
        class="timeline-dock"
        :class="{ collapsed: timelineCollapsed }"
        @pointerdown.stop
        @mousedown.stop
        @touchstart.stop
      >
        <div class="timeline-dock-head">
          <div class="timeline-current">
            <span>当前时间点</span>
            <strong>{{ currentTimelineLabel }}</strong>
            <small>{{ timelineVisibilitySummary }}</small>
          </div>
          <div class="timeline-actions">
            <TButton v-if="isSessionMode" size="small" variant="outline" @click="toggleSessionRelationVisibility">
              {{ showAllSessionRelations ? '仅看关联关系' : '全部显示关系' }}
            </TButton>
            <TButton
              class="timeline-toggle-button"
              size="small"
              variant="outline"
              :aria-expanded="String(!timelineCollapsed)"
              @click="toggleTimelineCollapsed"
            >
              {{ timelineCollapsed ? '展开时间点' : '收起时间点' }}
            </TButton>
          </div>
        </div>

        <template v-if="!timelineCollapsed">
          <div class="timeline-actions timeline-actions-expanded">
            <TButton size="small" variant="outline" :disabled="currentSequenceIndex === 0" @click="moveToPreviousPoint">上一个</TButton>
            <TButton size="small" variant="outline" :disabled="currentSequenceIndex === timelineMaxSequenceIndex" @click="moveToNextPoint">下一个</TButton>
            <TButton size="small" variant="outline" @click="toggleAutoplay">
              {{ isAutoplaying ? '暂停播放' : '自动播放' }}
            </TButton>
            <TButton size="small" variant="outline" @click="restartAutoplay">重新播放</TButton>
            <TSelect
              v-model="playbackSpeed"
              class="timeline-speed-select"
              size="small"
              :options="playbackSpeedOptions"
              :clearable="false"
            />
            <TButton v-if="!isReadOnly" size="small" theme="primary" @click="createEventAtCurrentPoint">在此时间点新增事件</TButton>
          </div>

          <div class="timeline-range-wrap">
            <input
              :value="currentSequenceIndex"
              class="timeline-range"
              type="range"
              min="0"
              :max="timelineMaxSequenceIndex"
              step="1"
              @input="handleTimelineRangeInput"
            />
          </div>

          <div
            ref="timelineEventStripRef"
            class="timeline-event-strip"
            @pointerdown="handleTimelineEventStripPointerDown"
            @pointermove="handleTimelineEventStripPointerMove"
            @pointerup="handleTimelineEventStripPointerUp"
            @pointercancel="handleTimelineEventStripPointerUp"
            @lostpointercapture="handleTimelineEventStripPointerUp"
          >
            <button
              v-for="eventEntry in currentTimelineEvents"
              :key="eventEntry.key"
              class="timeline-event-chip"
              :data-event-id="eventEntry.eventId"
              @click="handleTimelineEventChipClick(eventEntry.key, $event)"
            >
              <span>事件</span>
              <strong>{{ eventEntry.name }}</strong>
              <small class="timeline-event-summary">{{ getTimelineEventPreviewText(eventEntry) }}</small>
            </button>
            <div v-if="!currentTimelineEvents.length" class="timeline-event-empty">当前时间点暂无事件，可直接新增事件或新增节点。</div>
          </div>
        </template>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, toRaw, watch } from 'vue'
import {
  Button as TButton,
  Form as TForm,
  FormItem as TFormItem,
  Input as TInput,
  InputNumber as TInputNumber,
  MessagePlugin,
  Select as TSelect,
  Textarea as TTextarea,
} from 'tdesign-vue-next'

import WorldGraphCanvasX6 from '@/components/chat/WorldGraphCanvasX6.vue'
import { buildSessionGraphLayout } from '@/components/chat/worldGraphLayout'
import { getRenderableWorldGraphCanvasEdges } from '@/components/chat/worldGraphCanvasVisibility'
import {
  createRobotWorldEdge,
  createRobotWorldNode,
  createRobotWorldRelationType,
  deleteRobotWorldEdge,
  deleteRobotWorldNode,
  deleteRobotWorldRelationType,
  getRobotWorldGraph,
  updateRobotWorldEdge,
  updateRobotWorldGraphMeta,
  updateRobotWorldGraphLayout,
  updateRobotWorldNode,
  updateRobotWorldRelationType,
} from '@/lib/api'
import type {
  AIRobotCard,
  RobotWorldGraph,
  RobotWorldGraphMeta,
  RobotWorldRelationType,
  WorldEdge,
  WorldTimelineEffectChangeTargetType,
  WorldEdgeSnapshot,
  WorldGraphLayout,
  WorldNode,
  WorldNodeSnapshot,
  WorldObjectType,
  WorldTimeline,
  WorldTimelineEffectNodeAttributeChange,
  WorldTimelineEffectRelationChange,
  WorldTimelineEffectRelationDraft,
  WorldTimelineEffect,
} from '@/types/ai'

type GraphWorkspaceMode = 'editor' | 'session'

const props = defineProps<{
  currentRobot: AIRobotCard | null
  graphData?: RobotWorldGraph | null
  mode?: GraphWorkspaceMode
  readOnly?: boolean
  active?: boolean
}>()
const emit = defineEmits<{ (e: 'close'): void }>()

const objectTypeLabel: Record<WorldObjectType, string> = {
  character: '人物',
  organization: '组织',
  location: '地点',
  event: '事件',
  item: '物品',
}
const objectTypeOptions = Object.entries(objectTypeLabel).map(([value, label]) => ({ value: value as WorldObjectType, label }))
const creatableObjectTypeOptions = objectTypeOptions.filter((item) => item.value !== 'event')
const directionalityOptions = [{ label: '单向', value: 'directed' }, { label: '双向', value: 'undirected' }]
const effectChangeTargetOptions = [{ label: '节点内容', value: 'node-content' }, { label: '关系变化', value: 'relation' }]
const effectRelationModeOptions = [{ label: '选择已有关系', value: 'existing' }, { label: '新建关系', value: 'create' }]
const relationEffectFieldMap: NodeField[] = [
  { key: 'relationLabel', label: '显示名称', input: 'text' },
  { key: 'summary', label: '说明', input: 'textarea' },
  { key: 'intensity', label: '强度', input: 'number' },
]

type NodeFieldInput = 'text' | 'textarea' | 'number'
type NodeField = { key: string; label: string; input: NodeFieldInput }

const nodeFieldMap: Record<WorldObjectType, NodeField[]> = {
  character: [
    { key: 'knownFacts', label: '已知事实', input: 'textarea' },
    { key: 'preferencesAndConstraints', label: '偏好和约束', input: 'textarea' },
    { key: 'taskProgress', label: '任务进展', input: 'textarea' },
    { key: 'longTermMemory', label: '长期记忆', input: 'textarea' },
    { key: 'age', label: '年龄', input: 'number' },
    { key: 'gender', label: '性别', input: 'text' },
  ],
  organization: [
    { key: 'knownFacts', label: '已知事实', input: 'textarea' },
    { key: 'preferencesAndConstraints', label: '偏好和约束', input: 'textarea' },
    { key: 'taskProgress', label: '任务进展', input: 'textarea' },
    { key: 'longTermMemory', label: '长期记忆', input: 'textarea' },
    { key: 'orgType', label: '组织类型', input: 'text' },
  ],
  location: [
    { key: 'knownFacts', label: '已知事实', input: 'textarea' },
    { key: 'preferencesAndConstraints', label: '偏好和约束', input: 'textarea' },
    { key: 'taskProgress', label: '任务进展', input: 'textarea' },
    { key: 'longTermMemory', label: '长期记忆', input: 'textarea' },
    { key: 'locationType', label: '地点类型', input: 'text' },
  ],
  event: [],
  item: [
    { key: 'knownFacts', label: '已知事实', input: 'textarea' },
    { key: 'preferencesAndConstraints', label: '偏好和约束', input: 'textarea' },
    { key: 'taskProgress', label: '任务进展', input: 'textarea' },
    { key: 'longTermMemory', label: '长期记忆', input: 'textarea' },
    { key: 'itemType', label: '物品类型', input: 'text' },
  ],
}

const eventTimelineFields: NodeField[] = [{ key: 'yearLabel', label: '年份标签', input: 'text' }, { key: 'monthLabel', label: '月份标签', input: 'text' }, { key: 'dayLabel', label: '日期标签', input: 'text' }, { key: 'timeOfDayLabel', label: '时段标签', input: 'text' }, { key: 'phase', label: '事件阶段', input: 'text' }, { key: 'impactLevel', label: '影响等级', input: 'number' }, { key: 'eventType', label: '事件类型', input: 'text' }]

const activePanel = ref<'graph' | 'relation-types'>('graph')
const loading = ref(false)
const savingNode = ref(false)
const savingEdge = ref(false)
const savingType = ref(false)
const editorVisible = ref(false)
const editorMode = ref<'node' | 'edge' | 'relation-type' | null>(null)
const createMenuVisible = ref(false)
const searchKeyword = ref('')
const rawNodes = ref<WorldNode[]>([])
const rawEdges = ref<WorldEdge[]>([])
const relationTypes = ref<RobotWorldRelationType[]>([])
const selectedNodeId = ref('')
const selectedEdgeId = ref('')
const selectedTypeId = ref('')
const nodeDraft = ref<WorldNode | null>(null)
const edgeDraft = ref<WorldEdge | null>(null)
const typeDraft = ref<RobotWorldRelationType | null>(null)
const nodeTagsInput = ref('')
const typeSourceObjectTypes = ref<WorldObjectType[]>([])
const typeTargetObjectTypes = ref<WorldObjectType[]>([])
const linkingSourceNodeId = ref('')
const linkingTargetNodeId = ref('')
const currentSequenceIndex = ref(0)
const isAutoplaying = ref(false)
const playbackSpeed = ref<'1x' | '2x' | '4x'>('1x')
const autoplayTimer = ref<number | null>(null)
const layoutSaveTimer = ref<number | null>(null)
const activationFitTimer = ref<number | null>(null)
const savingMeta = ref(false)
const metaEditorVisible = ref(false)
const showAllSessionRelations = ref(false)
const pendingLayout = ref<WorldGraphLayout | null>(null)
const lastPersistedLayout = ref<WorldGraphLayout>({ viewportX: 0, viewportY: 0, zoom: 1 })
const fitRequestKey = ref(0)
const timelineEventStripRef = ref<HTMLElement | null>(null)
const timelineEventStripPointerId = ref<number | null>(null)
const timelineEventStripStartX = ref(0)
const timelineEventStripStartScrollLeft = ref(0)
const timelineEventStripDragging = ref(false)
const timelineEventStripSuppressClick = ref(false)
const timelineEventDetailKey = ref('')
const meta = reactive<RobotWorldGraphMeta>({
  robotId: '',
  title: '',
  summary: '',
  graphVersion: 1,
  calendar: { calendarId: 'default-world-calendar', calendarName: '世界历', eras: ['纪元'], monthNames: [], dayNames: [], timeOfDayLabels: [], formatTemplate: '' },
  layout: { viewportX: 0, viewportY: 0, zoom: 1 },
})
const calendarErasInput = ref('')
const calendarMonthNamesInput = ref('')
const calendarDayNamesInput = ref('')
const calendarTimeOfDayLabelsInput = ref('')

const timelineLabelKeys: Array<keyof Pick<WorldTimeline, 'yearLabel' | 'monthLabel' | 'dayLabel' | 'timeOfDayLabel' | 'phase'>> = ['yearLabel', 'monthLabel', 'dayLabel', 'timeOfDayLabel', 'phase']
const playbackSpeedOptions = [
  { label: '1x', value: '1x' },
  { label: '2x', value: '2x' },
  { label: '4x', value: '4x' },
]
const graphMode = computed<GraphWorkspaceMode>(() => props.mode || (props.readOnly ? 'session' : 'editor'))
const isSessionMode = computed(() => graphMode.value === 'session')
const isReadOnly = computed(() => isSessionMode.value || Boolean(props.readOnly))
const timelineCollapsed = ref(isSessionMode.value)
const hasGraphSource = computed(() => Boolean(props.graphData || props.currentRobot?.id))
const showTimelineDock = computed(() => activePanel.value === 'graph')
const emptyStateText = computed(() =>
  isSessionMode.value ? '当前会话还没有消息图谱。' : '当前智能体还没有世界设定图谱。',
)
const showRelationTypeTab = computed(() => !isReadOnly.value)

interface TimelineEventEntry {
  key: string
  eventId: string
  sequenceIndex: number
  name: string
  summary: string
  usesTimelineLabel: boolean
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(toRaw(value))) as T
}

function normalizeNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeString(value: unknown) {
  return String(value ?? '').trim()
}

function formatStringListInput(values: string[]) {
  return (Array.isArray(values) ? values : []).map((item) => normalizeString(item)).filter(Boolean).join('\n')
}

function parseStringListInput(value: string) {
  return String(value || '').split(/\r?\n/).map((item) => normalizeString(item)).filter(Boolean)
}

function syncCalendarInputs() {
  calendarErasInput.value = formatStringListInput(meta.calendar.eras)
  calendarMonthNamesInput.value = formatStringListInput(meta.calendar.monthNames)
  calendarDayNamesInput.value = formatStringListInput(meta.calendar.dayNames)
  calendarTimeOfDayLabelsInput.value = formatStringListInput(meta.calendar.timeOfDayLabels)
}

function compareDisplayText(left: unknown, right: unknown) {
  return normalizeString(left).localeCompare(normalizeString(right), 'zh-CN', { numeric: true, sensitivity: 'base' })
}

function parseChineseNumberToken(token: string) {
  const normalized = token.replace(/两/g, '二').replace(/〇/g, '零')
  const digitMap: Record<string, number> = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
  let total = 0
  let current = 0

  for (const char of normalized) {
    if (char === '千') {
      total += (current || 1) * 1000
      current = 0
      continue
    }
    if (char === '百') {
      total += (current || 1) * 100
      current = 0
      continue
    }
    if (char === '十') {
      total += (current || 1) * 10
      current = 0
      continue
    }
    current = current * 10 + (digitMap[char] ?? 0)
  }

  return total + current
}

function extractTimelineOrderValue(value: unknown) {
  const text = normalizeString(value)
  if (!text) {
    return null
  }

  const arabicMatch = text.match(/\d+/)
  if (arabicMatch) {
    return Number(arabicMatch[0])
  }

  const chineseMatch = text.match(/[零〇一二两三四五六七八九十百千]+/)
  if (chineseMatch) {
    return parseChineseNumberToken(chineseMatch[0])
  }

  return null
}

function compareTimelineLabelValue(left: unknown, right: unknown) {
  const leftOrderValue = extractTimelineOrderValue(left)
  const rightOrderValue = extractTimelineOrderValue(right)
  if (leftOrderValue !== null && rightOrderValue !== null && leftOrderValue !== rightOrderValue) {
    return leftOrderValue - rightOrderValue
  }
  return compareDisplayText(left, right)
}

function normalizeTimelineEffectNodeAttributeChangeClient(value?: Partial<WorldTimelineEffectNodeAttributeChange> | null): WorldTimelineEffectNodeAttributeChange {
  return {
    fieldKey: normalizeString(value?.fieldKey),
    beforeValue: normalizeString(value?.beforeValue),
    afterValue: normalizeString(value?.afterValue),
  }
}

function normalizeTimelineEffectRelationChangeClient(value?: Partial<WorldTimelineEffectRelationChange> | null): WorldTimelineEffectRelationChange {
  return {
    fieldKey: normalizeString(value?.fieldKey),
    beforeValue: normalizeString(value?.beforeValue),
    afterValue: normalizeString(value?.afterValue),
  }
}

function normalizeTimelineEffectRelationDraftClient(value?: Partial<WorldTimelineEffectRelationDraft> | null): WorldTimelineEffectRelationDraft {
  return {
    targetNodeId: normalizeString(value?.targetNodeId),
    relationTypeCode: normalizeString(value?.relationTypeCode),
    relationLabel: normalizeString(value?.relationLabel),
    summary: normalizeString(value?.summary),
    status: normalizeString(value?.status),
    intensity: typeof value?.intensity === 'number' && Number.isFinite(value.intensity) ? Math.max(0, Math.min(100, Math.round(value.intensity))) : null,
  }
}

function normalizeTimelineEffectClient(value?: Partial<WorldTimelineEffect> | null): WorldTimelineEffect {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const legacyTargetKind = normalizeString(source.targetKind) === 'relation' ? 'relation' : 'node'
  const hasStructuredFields =
    Object.prototype.hasOwnProperty.call(source, 'changeTargetType') ||
    Object.prototype.hasOwnProperty.call(source, 'targetNodeId') ||
    Object.prototype.hasOwnProperty.call(source, 'nodeAttributeChanges') ||
    Object.prototype.hasOwnProperty.call(source, 'relationMode') ||
    Object.prototype.hasOwnProperty.call(source, 'relationId') ||
    Object.prototype.hasOwnProperty.call(source, 'relationDraft') ||
    Object.prototype.hasOwnProperty.call(source, 'relationChanges')

  if (!hasStructuredFields) {
    const legacyFieldKey = normalizeString(source.changeKind) || (legacyTargetKind === 'relation' ? 'summary' : 'currentStatus')
    return {
      id: normalizeString(source.id) || `effect-${crypto.randomUUID()}`,
      summary: normalizeString(source.summary),
      targetNodeId: legacyTargetKind === 'node' ? normalizeString(source.targetId) : '',
      changeTargetType: legacyTargetKind === 'relation' ? 'relation' : 'node-content',
      nodeAttributeChanges:
        legacyTargetKind === 'node' && normalizeString(source.targetId)
          ? [normalizeTimelineEffectNodeAttributeChangeClient({ fieldKey: legacyFieldKey, beforeValue: source.beforeValue, afterValue: source.afterValue })]
          : [],
      relationMode: 'existing',
      relationId: legacyTargetKind === 'relation' ? normalizeString(source.targetId) : '',
      relationChanges:
        legacyTargetKind === 'relation' && normalizeString(source.targetId)
          ? [normalizeTimelineEffectRelationChangeClient({ fieldKey: legacyFieldKey, beforeValue: source.beforeValue, afterValue: source.afterValue })]
          : [],
      relationDraft: normalizeTimelineEffectRelationDraftClient(null),
      targetKind: legacyTargetKind,
      targetId: normalizeString(source.targetId),
      changeKind: normalizeString(source.changeKind),
      beforeValue: normalizeString(source.beforeValue),
      afterValue: normalizeString(source.afterValue),
    }
  }

  return {
    id: normalizeString(source.id) || `effect-${crypto.randomUUID()}`,
    summary: normalizeString(source.summary),
    targetNodeId: normalizeString(source.targetNodeId),
    changeTargetType: normalizeString(source.changeTargetType) === 'relation' ? 'relation' : 'node-content',
    nodeAttributeChanges: (Array.isArray(source.nodeAttributeChanges) ? source.nodeAttributeChanges : []).map(normalizeTimelineEffectNodeAttributeChangeClient).filter((item) => item.fieldKey),
    relationMode: normalizeString(source.relationMode) === 'create' ? 'create' : 'existing',
    relationId: normalizeString(source.relationId),
    relationChanges: (Array.isArray(source.relationChanges) ? source.relationChanges : []).map(normalizeTimelineEffectRelationChangeClient).filter((item) => item.fieldKey),
    relationDraft: normalizeTimelineEffectRelationDraftClient(source.relationDraft),
    targetKind: legacyTargetKind,
    targetId: normalizeString(source.targetId),
    changeKind: normalizeString(source.changeKind),
    beforeValue: normalizeString(source.beforeValue),
    afterValue: normalizeString(source.afterValue),
  }
}

function normalizeNodeClient(node: WorldNode): WorldNode {
  return {
    ...node,
    knownFacts: normalizeString(node.knownFacts),
    preferencesAndConstraints: normalizeString(node.preferencesAndConstraints),
    taskProgress: normalizeString(node.taskProgress),
    longTermMemory: normalizeString(node.longTermMemory),
    tags: Array.isArray(node.tags) ? node.tags : [],
    attributes: node.attributes && typeof node.attributes === 'object' && !Array.isArray(node.attributes) ? node.attributes : {},
    timelineSnapshots: Array.isArray(node.timelineSnapshots) ? node.timelineSnapshots : [],
    effects: Array.isArray(node.effects) ? node.effects.map(normalizeTimelineEffectClient) : [],
    timeline: node.objectType === 'event' ? node.timeline || createEmptyTimeline(node.startSequenceIndex || 0) : null,
  }
}

function normalizeEdgeClient(edge: WorldEdge): WorldEdge {
  return {
    ...edge,
    timelineSnapshots: Array.isArray(edge.timelineSnapshots) ? edge.timelineSnapshots : [],
  }
}

function normalizeRelationTypeClient(type: RobotWorldRelationType): RobotWorldRelationType {
  return {
    ...type,
    sourceObjectTypes: Array.isArray(type.sourceObjectTypes) ? type.sourceObjectTypes : [],
    targetObjectTypes: Array.isArray(type.targetObjectTypes) ? type.targetObjectTypes : [],
  }
}

function createResetViewportLayout(): WorldGraphLayout {
  return {
    viewportX: 0,
    viewportY: 0,
    zoom: 1,
  }
}

function mergeAutoLayoutIntoNodes(nodes: WorldNode[], targets: WorldNode[]) {
  const positionedNodes = buildSessionGraphLayout(targets)
  const positionedNodeMap = new Map(positionedNodes.map((node) => [node.id, node.position] as const))
  return nodes.map((node) => {
    const nextPosition = positionedNodeMap.get(node.id)
    return nextPosition ? { ...node, position: nextPosition } : node
  })
}

function applySessionAutoLayout(nodes: WorldNode[]) {
  if (!isSessionMode.value) {
    return nodes
  }

  const visibleNodes = nodes.filter((node) => normalizeNumber(node.startSequenceIndex, 0) <= currentSequenceIndex.value)
  if (!visibleNodes.length) {
    return nodes
  }

  return mergeAutoLayoutIntoNodes(nodes, visibleNodes)
}

function requestSessionViewportFit() {
  if (!isSessionMode.value) {
    return
  }
  const nextLayout = createResetViewportLayout()
  Object.assign(meta.layout, nextLayout)
  lastPersistedLayout.value = cloneValue(nextLayout)
  fitRequestKey.value += 1
}

function scheduleSessionViewportFit(delay = 0) {
  if (!isSessionMode.value || props.active === false) {
    return
  }
  if (activationFitTimer.value) {
    window.clearTimeout(activationFitTimer.value)
  }
  activationFitTimer.value = window.setTimeout(() => {
    requestSessionViewportFit()
    activationFitTimer.value = null
  }, delay)
}

function applyLoadedGraphPresentation() {
  if (isSessionMode.value) {
    currentSequenceIndex.value = timelineMaxSequenceIndex.value
    rawNodes.value = applySessionAutoLayout(rawNodes.value)
    requestSessionViewportFit()
    return
  }

  currentSequenceIndex.value = Math.min(currentSequenceIndex.value, timelineMaxSequenceIndex.value)
}

function hasOwnSnapshotField(value: unknown, key: string): boolean {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, key))
}

function normalizeNodeSnapshot(value?: Partial<WorldNodeSnapshot> | null): WorldNodeSnapshot {
  return {
    sequenceIndex: Math.max(0, Math.round(normalizeNumber(value?.sequenceIndex, 0))),
    name: hasOwnSnapshotField(value, 'name') ? normalizeString(value?.name) : undefined,
    summary: hasOwnSnapshotField(value, 'summary') ? normalizeString(value?.summary) : undefined,
    knownFacts: hasOwnSnapshotField(value, 'knownFacts') ? normalizeString(value?.knownFacts) : undefined,
    preferencesAndConstraints:
      hasOwnSnapshotField(value, 'preferencesAndConstraints') ? normalizeString(value?.preferencesAndConstraints) : undefined,
    taskProgress: hasOwnSnapshotField(value, 'taskProgress') ? normalizeString(value?.taskProgress) : undefined,
    longTermMemory: hasOwnSnapshotField(value, 'longTermMemory') ? normalizeString(value?.longTermMemory) : undefined,
    status: hasOwnSnapshotField(value, 'status') ? normalizeString(value?.status) : undefined,
    tags: hasOwnSnapshotField(value, 'tags')
      ? (Array.isArray(value?.tags) ? value.tags.map((item) => normalizeString(item)).filter(Boolean) : [])
      : undefined,
    attributes: hasOwnSnapshotField(value, 'attributes')
      ? (value?.attributes && typeof value.attributes === 'object' && !Array.isArray(value.attributes)
        ? Object.fromEntries(Object.entries(value.attributes).map(([key, item]) => [key, item ?? '']))
        : {})
      : undefined,
  }
}

function normalizeEdgeSnapshot(value?: Partial<WorldEdgeSnapshot> | null): WorldEdgeSnapshot {
  return {
    sequenceIndex: Math.max(0, Math.round(normalizeNumber(value?.sequenceIndex, 0))),
    relationTypeCode: hasOwnSnapshotField(value, 'relationTypeCode') ? normalizeString(value?.relationTypeCode) : undefined,
    relationLabel: hasOwnSnapshotField(value, 'relationLabel') ? normalizeString(value?.relationLabel) : undefined,
    summary: hasOwnSnapshotField(value, 'summary') ? normalizeString(value?.summary) : undefined,
    status: hasOwnSnapshotField(value, 'status') ? normalizeString(value?.status) : undefined,
    intensity: hasOwnSnapshotField(value, 'intensity')
      ? (typeof value?.intensity === 'number' && Number.isFinite(value.intensity)
        ? Math.max(0, Math.min(100, Math.round(value.intensity)))
        : null)
      : undefined,
  }
}

function createEmptyTimeline(sequenceIndex: number): WorldTimeline {
  return {
    sequenceIndex,
    calendarId: meta.calendar.calendarId || 'default-world-calendar',
    yearLabel: '',
    monthLabel: '',
    dayLabel: '',
    timeOfDayLabel: '',
    phase: '',
    impactLevel: 0,
    eventType: '',
  }
}

function createNodeDraft(objectType: WorldObjectType): WorldNode {
  const count = rawNodes.value.length
  return {
    id: '',
    objectType,
    name: '',
    summary: '',
    knownFacts: '',
    preferencesAndConstraints: '',
    taskProgress: '',
    longTermMemory: '',
    status: '',
    tags: [],
    attributes: {},
    position: { x: 180 + (count % 4) * 180, y: 140 + Math.floor(count / 4) * 120 },
    startSequenceIndex: currentSequenceIndex.value,
    timelineSnapshots: [],
    timeline: objectType === 'event' ? createEmptyTimeline(currentSequenceIndex.value) : null,
    effects: [],
    createdAt: '',
    updatedAt: '',
  }
}

function createRelationTypeDraft(): RobotWorldRelationType {
  return {
    id: '',
    code: '',
    label: '',
    description: '',
    directionality: 'directed',
    sourceObjectTypes: [],
    targetObjectTypes: [],
    isBuiltin: false,
  }
}

function projectNodeAtSequence(node: WorldNode, sequenceIndex: number): WorldNode | null {
  if (sequenceIndex < node.startSequenceIndex) {
    return null
  }
  const projected = cloneValue(node)
  const snapshots = [...(node.timelineSnapshots || [])].sort((left, right) => left.sequenceIndex - right.sequenceIndex).filter((snapshot) => snapshot.sequenceIndex <= sequenceIndex)
  for (const snapshot of snapshots) {
    if (snapshot.name !== undefined) {
      projected.name = snapshot.name
    }
    if (snapshot.summary !== undefined) {
      projected.summary = snapshot.summary
    }
    if (snapshot.knownFacts !== undefined) {
      projected.knownFacts = snapshot.knownFacts
    }
    if (snapshot.preferencesAndConstraints !== undefined) {
      projected.preferencesAndConstraints = snapshot.preferencesAndConstraints
    }
    if (snapshot.taskProgress !== undefined) {
      projected.taskProgress = snapshot.taskProgress
    }
    if (snapshot.longTermMemory !== undefined) {
      projected.longTermMemory = snapshot.longTermMemory
    }
    if (snapshot.status !== undefined) {
      projected.status = snapshot.status
    }
    if (snapshot.tags !== undefined) {
      projected.tags = [...snapshot.tags]
    }
    if (snapshot.attributes !== undefined) {
      projected.attributes = { ...projected.attributes, ...snapshot.attributes }
    }
  }
  return projected
}

function projectEdgeAtSequence(edge: WorldEdge, sequenceIndex: number): WorldEdge | null {
  if (sequenceIndex < edge.startSequenceIndex) {
    return null
  }
  if (typeof edge.endSequenceIndex === 'number' && sequenceIndex > edge.endSequenceIndex) {
    return null
  }
  const projected = cloneValue(edge)
  const snapshots = [...(edge.timelineSnapshots || [])].sort((left, right) => left.sequenceIndex - right.sequenceIndex).filter((snapshot) => snapshot.sequenceIndex <= sequenceIndex)
  for (const snapshot of snapshots) {
    if (snapshot.relationTypeCode !== undefined) {
      projected.relationTypeCode = snapshot.relationTypeCode
    }
    if (snapshot.relationLabel !== undefined) {
      projected.relationLabel = snapshot.relationLabel
    }
    if (snapshot.summary !== undefined) {
      projected.summary = snapshot.summary
    }
    if (snapshot.status !== undefined) {
      projected.status = snapshot.status
    }
    if (snapshot.intensity !== undefined) {
      projected.intensity = snapshot.intensity
    }
  }
  return projected
}

function coerceNodeAttributeEffectValue(node: WorldNode, fieldKey: string, value: string) {
  if (fieldKey === 'currentStatus') {
    return normalizeString(value)
  }
  const field = (nodeFieldMap[node.objectType] || []).find((item) => item.key === fieldKey)
  if (field?.input === 'number') {
    const numericValue = Number(value)
    return Number.isFinite(numericValue) ? numericValue : normalizeString(value)
  }
  return normalizeString(value)
}

function applyNodeEffectChange(node: WorldNode, effect: WorldTimelineEffect) {
  for (const change of effect.nodeAttributeChanges) {
    const fieldKey = normalizeString(change.fieldKey)
    if (!fieldKey) {
      continue
    }
    const nextValue = coerceNodeAttributeEffectValue(node, fieldKey, change.afterValue)
    node.attributes = { ...node.attributes, [fieldKey]: nextValue }
    if (fieldKey === 'currentStatus') {
      node.status = normalizeString(change.afterValue)
    }
  }
}

function applyRelationEffectChange(edge: WorldEdge, effect: WorldTimelineEffect) {
  for (const change of effect.relationChanges) {
    const fieldKey = normalizeString(change.fieldKey)
    if (!fieldKey) {
      continue
    }
    if (fieldKey === 'relationLabel') {
      edge.relationLabel = normalizeString(change.afterValue)
      continue
    }
    if (fieldKey === 'summary') {
      edge.summary = normalizeString(change.afterValue)
      continue
    }
    if (fieldKey === 'status') {
      edge.status = normalizeString(change.afterValue)
      continue
    }
    if (fieldKey === 'intensity') {
      const numericValue = Number(change.afterValue)
      edge.intensity = Number.isFinite(numericValue) ? Math.max(0, Math.min(100, Math.round(numericValue))) : null
    }
  }
}

function buildDerivedEffectEdge(eventNode: WorldNode, effect: WorldTimelineEffect): WorldEdge | null {
  const sourceNodeId = normalizeString(effect.targetNodeId)
  const targetNodeId = normalizeString(effect.relationDraft.targetNodeId)
  const relationTypeCode = normalizeString(effect.relationDraft.relationTypeCode)
  if (!sourceNodeId || !targetNodeId || !relationTypeCode) {
    return null
  }
  const relationType = relationTypes.value.find((item) => item.code === relationTypeCode)
  const eventSequenceIndex = normalizeNumber(eventNode.timeline?.sequenceIndex, eventNode.startSequenceIndex)
  return normalizeEdgeClient({
    id: `derived-effect-${eventNode.id}-${effect.id}`,
    sourceNodeId,
    targetNodeId,
    relationTypeCode,
    relationLabel: normalizeString(effect.relationDraft.relationLabel) || relationType?.label || relationTypeCode,
    summary: normalizeString(effect.relationDraft.summary),
    directionality: relationType?.directionality || 'directed',
    intensity:
      typeof effect.relationDraft.intensity === 'number' && Number.isFinite(effect.relationDraft.intensity)
        ? Math.max(0, Math.min(100, Math.round(effect.relationDraft.intensity)))
        : null,
    status: normalizeString(effect.relationDraft.status),
    startSequenceIndex: eventSequenceIndex,
    endSequenceIndex: null,
    timelineSnapshots: [],
    createdAt: eventNode.createdAt,
    updatedAt: eventNode.updatedAt,
  })
}

const projectedWorldState = computed(() => {
  const nodeMap = new Map(
    rawNodes.value
      .map((node) => projectNodeAtSequence(node, currentSequenceIndex.value))
      .filter((node): node is WorldNode => Boolean(node))
      .map((node) => [node.id, node] as const),
  )
  const edgeMap = new Map(
    rawEdges.value
      .map((edge) => projectEdgeAtSequence(edge, currentSequenceIndex.value))
      .filter((edge): edge is WorldEdge => Boolean(edge))
      .map((edge) => [edge.id, edge] as const),
  )

  const appliedEventNodes = rawNodes.value
    .filter((node) => node.objectType === 'event' && node.timeline)
    .filter((node) => normalizeNumber(node.timeline?.sequenceIndex, node.startSequenceIndex) <= currentSequenceIndex.value)
    .sort((left, right) => normalizeNumber(left.timeline?.sequenceIndex, left.startSequenceIndex) - normalizeNumber(right.timeline?.sequenceIndex, right.startSequenceIndex))

  for (const eventNode of appliedEventNodes) {
    for (const effect of Array.isArray(eventNode.effects) ? eventNode.effects : []) {
      if (effect.changeTargetType === 'node-content') {
        const targetNode = nodeMap.get(effect.targetNodeId)
        if (targetNode) {
          applyNodeEffectChange(targetNode, effect)
        }
        continue
      }

      if (effect.relationMode === 'create') {
        const derivedEdge = buildDerivedEffectEdge(eventNode, effect)
        if (!derivedEdge) {
          continue
        }
        if (!nodeMap.has(derivedEdge.sourceNodeId) || !nodeMap.has(derivedEdge.targetNodeId)) {
          continue
        }
        edgeMap.set(derivedEdge.id, derivedEdge)
        continue
      }

      const targetEdge = edgeMap.get(effect.relationId)
      if (targetEdge) {
        applyRelationEffectChange(targetEdge, effect)
      }
    }
  }

  return {
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()],
  }
})

const currentWorldNodes = computed(() => projectedWorldState.value.nodes)
const canvasNodes = computed(() =>
  isSessionMode.value
    ? currentWorldNodes.value
    : currentWorldNodes.value.filter((node) => node.objectType !== 'event'),
)
const canvasNodeMap = computed(() => new Map(canvasNodes.value.map((node) => [node.id, node])))
const projectedNodeMap = computed(() => new Map(currentWorldNodes.value.map((node) => [node.id, node])))
const futureNodes = computed(() =>
  rawNodes.value
    .filter((node) => node.objectType !== 'event' && node.startSequenceIndex > currentSequenceIndex.value)
    .sort((left, right) => left.startSequenceIndex - right.startSequenceIndex || left.name.localeCompare(right.name, 'zh-CN')),
)
const projectedEdges = computed(() => projectedWorldState.value.edges)
const canvasEdges = computed(() => {
  const visibleNodeIds = new Set(canvasNodes.value.map((node) => node.id))
  return projectedEdges.value
    .filter((edge) => visibleNodeIds.has(edge.sourceNodeId) && visibleNodeIds.has(edge.targetNodeId))
})
const displayedCanvasEdges = computed(() =>
  getRenderableWorldGraphCanvasEdges({
    nodes: currentWorldNodes.value,
    edges: projectedEdges.value,
    currentSequenceIndex: currentSequenceIndex.value,
    showEventNodes: isSessionMode.value,
    selectedNodeId: selectedNodeId.value,
    selectedEdgeId: selectedEdgeId.value,
    linkingSourceNodeId: linkingSourceNodeId.value,
    showAllEdges: isSessionMode.value && showAllSessionRelations.value,
  }),
)
const projectedEdgeMap = computed(() => new Map(canvasEdges.value.map((edge) => [edge.id, edge])))
const timelineVisibilitySummary = computed(() => {
  if (!isSessionMode.value) {
    return `可见对象 ${canvasNodes.value.length} / 关系 ${canvasEdges.value.length}`
  }
  if (showAllSessionRelations.value) {
    return `可见对象 ${canvasNodes.value.length} / 关系 ${displayedCanvasEdges.value.length}`
  }
  return `可见对象 ${canvasNodes.value.length} / 关系 ${displayedCanvasEdges.value.length}（全部 ${canvasEdges.value.length}）`
})
const relationTypeMap = computed(() => new Map(relationTypes.value.map((type) => [type.code, type])))

const rawEventNodes = computed(() =>
  rawNodes.value
    .filter((node) => node.objectType === 'event' && node.timeline)
    .sort((left, right) => normalizeNumber(left.timeline?.sequenceIndex, left.startSequenceIndex) - normalizeNumber(right.timeline?.sequenceIndex, right.startSequenceIndex)),
)

function buildTimelineEventEntries(node: WorldNode): TimelineEventEntry[] {
  if (node.objectType !== 'event' || !node.timeline) {
    return []
  }
  const baseSequenceIndex = normalizeNumber(node.timeline?.sequenceIndex, node.startSequenceIndex)
  const baseProjected = projectNodeAtSequence(node, baseSequenceIndex) || node
  const entries: TimelineEventEntry[] = [{
    key: `${node.id}@${baseSequenceIndex}@base`,
    eventId: node.id,
    sequenceIndex: baseSequenceIndex,
    name: baseProjected.name || node.name || node.id,
    summary: normalizeString(baseProjected.summary),
    usesTimelineLabel: true,
  }]
  const snapshotSequenceIndexes = [...new Set(
    (Array.isArray(node.timelineSnapshots) ? node.timelineSnapshots : [])
      .map((snapshot) => normalizeNumber(snapshot.sequenceIndex, -1))
      .filter((sequenceIndex) => sequenceIndex >= 0 && sequenceIndex !== baseSequenceIndex),
  )].sort((left, right) => left - right)
  for (const sequenceIndex of snapshotSequenceIndexes) {
    const projected = projectNodeAtSequence(node, sequenceIndex) || node
    entries.push({
      key: `${node.id}@${sequenceIndex}@snapshot`,
      eventId: node.id,
      sequenceIndex,
      name: projected.name || node.name || node.id,
      summary: normalizeString(projected.summary),
      usesTimelineLabel: false,
    })
  }
  return entries
}

const allTimelineEventEntries = computed(() =>
  rawEventNodes.value
    .flatMap((node) => buildTimelineEventEntries(node))
    .sort((left, right) =>
      left.sequenceIndex - right.sequenceIndex
      || Number(right.usesTimelineLabel) - Number(left.usesTimelineLabel)
      || compareDisplayText(left.name, right.name)
      || compareDisplayText(left.eventId, right.eventId)),
)

const timelineMaxSequenceIndex = computed(() => {
  const values = [
    0,
    currentSequenceIndex.value,
    ...rawNodes.value.map((node) => node.startSequenceIndex),
    ...rawNodes.value.flatMap((node) => (Array.isArray(node.timelineSnapshots) ? node.timelineSnapshots : []).map((snapshot) => snapshot.sequenceIndex)),
    ...allTimelineEventEntries.value.map((entry) => entry.sequenceIndex),
    ...rawEdges.value.map((edge) => edge.startSequenceIndex),
    ...rawEdges.value.flatMap((edge) => (Array.isArray(edge.timelineSnapshots) ? edge.timelineSnapshots : []).map((snapshot) => snapshot.sequenceIndex)),
  ]
  for (const edge of rawEdges.value) {
    if (typeof edge.endSequenceIndex === 'number') {
      values.push(edge.endSequenceIndex)
    }
  }
  return Math.max(...values.map((value) => Math.max(0, Math.round(value))))
})

const currentTimelineEvents = computed(() =>
  allTimelineEventEntries.value
    .filter((entry) => entry.sequenceIndex === currentSequenceIndex.value)
    .sort(compareTimelineEventOrder),
)

function buildTimelineLabel(eventNode?: WorldNode | null, fallbackSequenceIndex?: number) {
  const timeline = eventNode?.timeline
  if (timeline) {
    const parts = timelineLabelKeys.map((key) => normalizeString(timeline[key])).filter(Boolean)
    if (parts.length) {
      return parts.join(' / ')
    }
  }
  return `时间点 ${fallbackSequenceIndex ?? 0}`
}

function compareTimelineEventOrder(left: TimelineEventEntry, right: TimelineEventEntry) {
  const leftSequenceIndex = left.sequenceIndex
  const rightSequenceIndex = right.sequenceIndex
  if (leftSequenceIndex !== rightSequenceIndex) {
    return leftSequenceIndex - rightSequenceIndex
  }
  if (left.usesTimelineLabel && right.usesTimelineLabel) {
    const leftNode = rawEventNodes.value.find((item) => item.id === left.eventId) || null
    const rightNode = rawEventNodes.value.find((item) => item.id === right.eventId) || null
    for (const key of timelineLabelKeys) {
      const compared = compareTimelineLabelValue(leftNode?.timeline?.[key], rightNode?.timeline?.[key])
      if (compared !== 0) {
        return compared
      }
    }
  }
  const nameCompared = compareDisplayText(left.name, right.name)
  if (nameCompared !== 0) {
    return nameCompared
  }
  return compareDisplayText(left.key, right.key)
}

function getTimelinePointLabel(sequenceIndex: number) {
  const eventEntry = allTimelineEventEntries.value.find((item) => item.sequenceIndex === sequenceIndex) || null
  if (!eventEntry) {
    return buildTimelineLabel(null, sequenceIndex)
  }
  if (!eventEntry.usesTimelineLabel) {
    return `时间点 ${sequenceIndex}`
  }
  const eventNode = rawEventNodes.value.find((item) => item.id === eventEntry.eventId) || null
  return buildTimelineLabel(eventNode, sequenceIndex)
}

function getTimelinePointEventCount(sequenceIndex: number) {
  return allTimelineEventEntries.value.filter((item) => item.sequenceIndex === sequenceIndex).length
}

function getTimelineEventPreviewText(eventEntry: TimelineEventEntry) {
  return normalizeString(eventEntry.summary) || getTimelinePointLabel(eventEntry.sequenceIndex)
}

const currentTimelineLabel = computed(() => getTimelinePointLabel(currentSequenceIndex.value))
const timelineEventDetailEntry = computed(() => {
  if (!timelineEventDetailKey.value) {
    return null
  }
  return allTimelineEventEntries.value.find((item) => item.key === timelineEventDetailKey.value) || null
})
const timelineEventDetailNode = computed(() => {
  if (!timelineEventDetailEntry.value) {
    return null
  }
  const rawEventNode = rawEventNodes.value.find((item) => item.id === timelineEventDetailEntry.value?.eventId) || null
  if (!rawEventNode) {
    return null
  }
  return projectNodeAtSequence(rawEventNode, timelineEventDetailEntry.value.sequenceIndex) || rawEventNode
})
const selectedNodeFields = computed(() => (nodeDraft.value?.objectType ? nodeFieldMap[nodeDraft.value.objectType] || [] : []))
const selectedCanvasNode = computed(() => canvasNodeMap.value.get(selectedNodeId.value) || null)
const selectedCanvasEdge = computed(() => projectedEdgeMap.value.get(selectedEdgeId.value) || null)

function getProjectedNodeById(nodeId: string) {
  return projectedNodeMap.value.get(nodeId) || rawNodes.value.find((node) => node.id === nodeId) || null
}

function getGraphNodeDisplayName(nodeId: string) {
  const node = getProjectedNodeById(nodeId)
  if (!node) {
    return normalizeString(nodeId) || '未命名对象'
  }
  const objectLabel = objectTypeLabel[node.objectType]
  return `${objectLabel}: ${node.name || node.id || '未命名对象'}`
}

function formatSequencePointLabel(value: unknown) {
  const sequenceIndex = normalizeNumber(value, -1)
  if (sequenceIndex < 0) {
    return ''
  }
  return getTimelinePointLabel(sequenceIndex)
}

const selectedNodeDetailItems = computed(() => {
  const node = selectedCanvasNode.value
  if (!node) {
    return []
  }
  const fields = nodeFieldMap[node.objectType] || []
  const detailItems = fields
    .map((field) => {
      const rawValue = ['knownFacts', 'preferencesAndConstraints', 'taskProgress', 'longTermMemory'].includes(field.key)
        ? node[field.key as 'knownFacts' | 'preferencesAndConstraints' | 'taskProgress' | 'longTermMemory']
        : node.attributes?.[field.key]
      const value = rawValue === undefined || rawValue === null || rawValue === '' ? '' : String(rawValue)
      return {
        key: field.key,
        label: field.label,
        value,
      }
    })
    .filter((item) => item.value)

  const statusValue = normalizeString(node.attributes?.currentStatus ?? node.status)
  if (statusValue) {
    detailItems.unshift({
      key: 'currentStatus',
      label: '状态',
      value: statusValue,
    })
  }

  return detailItems
})
const selectedCanvasEdgeSourceName = computed(() =>
  selectedCanvasEdge.value ? getGraphNodeDisplayName(selectedCanvasEdge.value.sourceNodeId) : '',
)
const selectedCanvasEdgeTargetName = computed(() =>
  selectedCanvasEdge.value ? getGraphNodeDisplayName(selectedCanvasEdge.value.targetNodeId) : '',
)
const selectedCanvasEdgeRelationLabel = computed(() => {
  const edge = selectedCanvasEdge.value
  if (!edge) {
    return ''
  }
  return normalizeString(edge.relationLabel) || relationTypeMap.value.get(edge.relationTypeCode)?.label || edge.relationTypeCode
})
const selectedEdgeDetailItems = computed(() => {
  const edge = selectedCanvasEdge.value
  if (!edge) {
    return []
  }

  const detailItems = [
    {
      key: 'relationType',
      label: '关系类型',
      value: selectedCanvasEdgeRelationLabel.value,
    },
    {
      key: 'sourceNode',
      label: '源节点',
      value: selectedCanvasEdgeSourceName.value,
    },
    {
      key: 'targetNode',
      label: '目标节点',
      value: selectedCanvasEdgeTargetName.value,
    },
    {
      key: 'startSequenceIndex',
      label: '起始时间点',
      value: formatSequencePointLabel(edge.startSequenceIndex),
    },
  ]

  const status = normalizeString(edge.status)
  if (status) {
    detailItems.push({
      key: 'status',
      label: '状态',
      value: status,
    })
  }

  if (edge.intensity !== null && edge.intensity !== undefined) {
    detailItems.push({
      key: 'intensity',
      label: '强度',
      value: String(edge.intensity),
    })
  }

  if (typeof edge.endSequenceIndex === 'number' && Number.isFinite(edge.endSequenceIndex)) {
    detailItems.push({
      key: 'endSequenceIndex',
      label: '结束时间点',
      value: formatSequencePointLabel(edge.endSequenceIndex),
    })
  }

  return detailItems.filter((item) => normalizeString(item.value))
})
const eventEffectTargetNodeOptions = computed(() =>
  canvasNodes.value.map((node) => ({
    label: `${objectTypeLabel[node.objectType]}: ${node.name || '未命名对象'}`,
    value: node.id,
  })),
)

function getEffectTargetNode(effect: WorldTimelineEffect) {
  return canvasNodes.value.find((node) => node.id === effect.targetNodeId) || null
}

function getEffectNodeFieldOptions(effect: WorldTimelineEffect) {
  const node = getEffectTargetNode(effect)
  return node ? nodeFieldMap[node.objectType] || [] : []
}

function readEffectNodeFieldCurrentValue(effect: WorldTimelineEffect, fieldKey: string) {
  const node = getEffectTargetNode(effect)
  if (!node) {
    return ''
  }
  const rawValue =
    fieldKey === 'currentStatus'
      ? node.attributes?.currentStatus ?? node.status
      : ['knownFacts', 'preferencesAndConstraints', 'taskProgress', 'longTermMemory'].includes(fieldKey)
        ? node[fieldKey as 'knownFacts' | 'preferencesAndConstraints' | 'taskProgress' | 'longTermMemory']
        : node.attributes?.[fieldKey]
  return rawValue === undefined || rawValue === null ? '' : String(rawValue)
}

function findEffectNodeAttributeChange(effect: WorldTimelineEffect, fieldKey: string) {
  return effect.nodeAttributeChanges.find((item) => item.fieldKey === fieldKey) || null
}

function findEffectRelationChange(effect: WorldTimelineEffect, fieldKey: string) {
  return effect.relationChanges.find((item) => item.fieldKey === fieldKey) || null
}

function getEffectRelationOptions(effect: WorldTimelineEffect) {
  return canvasEdges.value
    .filter((edge) => edge.sourceNodeId === effect.targetNodeId || edge.targetNodeId === effect.targetNodeId)
    .map((edge) => {
      const otherNodeId = edge.sourceNodeId === effect.targetNodeId ? edge.targetNodeId : edge.sourceNodeId
      const otherNode = canvasNodes.value.find((node) => node.id === otherNodeId)
      return {
        label: `${edge.relationLabel || edge.relationTypeCode} · ${otherNode?.name || '未命名对象'}`,
        value: edge.id,
      }
    })
}

function getSelectedEffectRelation(effect: WorldTimelineEffect) {
  return canvasEdges.value.find((edge) => edge.id === effect.relationId) || null
}

function readEffectRelationFieldCurrentValue(effect: WorldTimelineEffect, fieldKey: string) {
  const relation = getSelectedEffectRelation(effect)
  if (!relation) {
    return ''
  }
  const relationRecord: Record<string, string | number | null | undefined> = {
    relationLabel: relation.relationLabel,
    summary: relation.summary,
    status: relation.status,
    intensity: relation.intensity,
  }
  const value = relationRecord[fieldKey]
  return value === undefined || value === null ? '' : String(value)
}

function getEffectCreateRelationTargetNodeOptions(effect: WorldTimelineEffect) {
  return canvasNodes.value
    .filter((node) => node.id !== effect.targetNodeId)
    .map((node) => ({
      label: `${objectTypeLabel[node.objectType]}: ${node.name || '未命名对象'}`,
      value: node.id,
    }))
}

function getEffectCreateRelationTypeOptions(effect: WorldTimelineEffect) {
  const sourceNode = canvasNodes.value.find((node) => node.id === effect.targetNodeId)
  const targetNode = canvasNodes.value.find((node) => node.id === effect.relationDraft.targetNodeId)
  if (!sourceNode || !targetNode) {
    return relationTypes.value.map((type) => ({ label: type.label, value: type.code }))
  }
  return relationTypes.value
    .filter((type) => {
      const sourceAllowed = !type.sourceObjectTypes.length || type.sourceObjectTypes.includes(sourceNode.objectType)
      const targetAllowed = !type.targetObjectTypes.length || type.targetObjectTypes.includes(targetNode.objectType)
      return sourceAllowed && targetAllowed
    })
    .map((type) => ({
      label: type.label,
      value: type.code,
    }))
}

const editorTitle = computed(() => {
  if (editorMode.value === 'node' && nodeDraft.value) {
    return nodeDraft.value.id ? `编辑${objectTypeLabel[nodeDraft.value.objectType]}` : `新增${objectTypeLabel[nodeDraft.value.objectType]}`
  }
  if (editorMode.value === 'edge' && edgeDraft.value) {
    return edgeDraft.value.id ? '编辑关系' : '新增关系'
  }
  if (editorMode.value === 'relation-type' && typeDraft.value) {
    return typeDraft.value.id ? '编辑关系类型' : '新增关系类型'
  }
  return ''
})

const editorSubtitle = computed(() => {
  if (editorMode.value === 'node' && nodeDraft.value) {
    return `当前编辑时间点：${currentTimelineLabel.value}`
  }
  if (editorMode.value === 'edge' && edgeDraft.value) {
    const source = canvasNodeMap.value.get(edgeDraft.value.sourceNodeId)?.name || rawNodes.value.find((node) => node.id === edgeDraft.value?.sourceNodeId)?.name || '源对象'
    const target = canvasNodeMap.value.get(edgeDraft.value.targetNodeId)?.name || rawNodes.value.find((node) => node.id === edgeDraft.value?.targetNodeId)?.name || '目标对象'
    return `${source} -> ${target}`
  }
  if (editorMode.value === 'relation-type' && typeDraft.value) {
    return typeDraft.value.isBuiltin ? '平台内置关系类型只读' : '限制连线时可选择的对象类型'
  }
  return ''
})

const relationTypePickerVisible = computed(() => Boolean(linkingSourceNodeId.value && linkingTargetNodeId.value))
const linkingSourceNode = computed(() => canvasNodeMap.value.get(linkingSourceNodeId.value) || null)
const linkingTargetNode = computed(() => canvasNodeMap.value.get(linkingTargetNodeId.value) || null)
const linkingSourceName = computed(() => linkingSourceNode.value?.name || '源对象')
const linkingTargetName = computed(() => linkingTargetNode.value?.name || '目标对象')

const availableLinkRelationTypes = computed(() => {
  const sourceType = linkingSourceNode.value?.objectType
  const targetType = linkingTargetNode.value?.objectType
  if (!sourceType || !targetType) {
    return []
  }
  return relationTypes.value.filter((type) => {
    const sourceAllowed = !type.sourceObjectTypes.length || type.sourceObjectTypes.includes(sourceType)
    const targetAllowed = !type.targetObjectTypes.length || type.targetObjectTypes.includes(targetType)
    return sourceAllowed && targetAllowed
  })
})

const editableEdgeRelationTypeOptions = computed(() => {
  const draft = edgeDraft.value
  if (!draft) {
    return relationTypes.value.map((item) => ({ label: item.label, value: item.code }))
  }
  const sourceType = rawNodes.value.find((node) => node.id === draft.sourceNodeId)?.objectType || canvasNodeMap.value.get(draft.sourceNodeId)?.objectType
  const targetType = rawNodes.value.find((node) => node.id === draft.targetNodeId)?.objectType || canvasNodeMap.value.get(draft.targetNodeId)?.objectType
  return relationTypes.value
    .filter((type) => {
      const sourceAllowed = !type.sourceObjectTypes.length || !sourceType || type.sourceObjectTypes.includes(sourceType)
      const targetAllowed = !type.targetObjectTypes.length || !targetType || type.targetObjectTypes.includes(targetType)
      return sourceAllowed && targetAllowed
    })
    .map((item) => ({ label: item.label, value: item.code }))
})

const sidebarItems = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (activePanel.value === 'relation-types') {
    return relationTypes.value
      .filter((item) => !keyword || item.label.toLowerCase().includes(keyword) || item.code.toLowerCase().includes(keyword))
      .map((item) => ({ id: item.id, label: item.label, active: selectedTypeId.value === item.id, disabled: false, future: false, onClick: () => selectRelationType(item.id) }))
  }
  const currentItems = canvasNodes.value
    .filter((item) => !keyword || `${item.name} ${item.summary} ${objectTypeLabel[item.objectType]}`.toLowerCase().includes(keyword))
    .map((item) => ({
      id: item.id,
      label: `${objectTypeLabel[item.objectType]} · ${item.name || '未命名对象'}`,
      active: selectedNodeId.value === item.id,
      disabled: false,
      future: false,
      onClick: () => selectNode(item.id),
    }))
  const futureItems = futureNodes.value
    .filter((item) => !keyword || `${item.name} ${item.summary} ${objectTypeLabel[item.objectType]}`.toLowerCase().includes(keyword))
    .map((item) => ({
      id: `future:${item.id}`,
      label: `${objectTypeLabel[item.objectType]} · ${item.name || '未命名对象'} · 时间点 ${item.startSequenceIndex} 生效`,
      active: false,
      disabled: true,
      future: true,
      onClick: () => {},
    }))
  return [...currentItems, ...futureItems]
})

async function loadWorldGraph() {
  if (props.graphData) {
    const nextNodes = (Array.isArray(props.graphData.nodes) ? props.graphData.nodes : []).map(normalizeNodeClient)
    rawEdges.value = (Array.isArray(props.graphData.edges) ? props.graphData.edges : []).map(normalizeEdgeClient)
    relationTypes.value = (Array.isArray(props.graphData.relationTypes) ? props.graphData.relationTypes : []).map(normalizeRelationTypeClient)
    Object.assign(meta, cloneValue(props.graphData.meta))
    lastPersistedLayout.value = cloneValue(props.graphData.meta.layout)
    syncCalendarInputs()
    rawNodes.value = nextNodes
    applyLoadedGraphPresentation()
    return
  }
  if (!props.currentRobot?.id) {
    rawNodes.value = []
    rawEdges.value = []
    relationTypes.value = []
    return
  }
  loading.value = true
  try {
    const response = await getRobotWorldGraph(props.currentRobot.id)
    const nextNodes = (Array.isArray(response.nodes) ? response.nodes : []).map(normalizeNodeClient)
    rawEdges.value = (Array.isArray(response.edges) ? response.edges : []).map(normalizeEdgeClient)
      relationTypes.value = (Array.isArray(response.relationTypes) ? response.relationTypes : []).map(normalizeRelationTypeClient)
      Object.assign(meta, response.meta)
      lastPersistedLayout.value = cloneValue(response.meta.layout)
      syncCalendarInputs()
      rawNodes.value = nextNodes
      applyLoadedGraphPresentation()
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '加载世界设定失败')
  } finally {
    loading.value = false
  }
}

function setCurrentSequenceIndex(sequenceIndex: number) {
  currentSequenceIndex.value = Math.max(0, Math.min(timelineMaxSequenceIndex.value, Math.round(sequenceIndex)))
}

function handleTimelineRangeInput(event: Event) {
  const nextValue = Number((event.target as HTMLInputElement | null)?.value ?? currentSequenceIndex.value)
  setCurrentSequenceIndex(nextValue)
}

function stopAutoplay() {
  isAutoplaying.value = false
  if (autoplayTimer.value) {
    window.clearTimeout(autoplayTimer.value)
    autoplayTimer.value = null
  }
}

function getPlaybackDelay() {
  if (playbackSpeed.value === '4x') {
    return 350
  }
  if (playbackSpeed.value === '2x') {
    return 700
  }
  return 1200
}

function scheduleAutoplayStep() {
  if (!isAutoplaying.value) {
    return
  }
  if (currentSequenceIndex.value >= timelineMaxSequenceIndex.value) {
    stopAutoplay()
    return
  }
  autoplayTimer.value = window.setTimeout(() => {
    setCurrentSequenceIndex(currentSequenceIndex.value + 1)
    scheduleAutoplayStep()
  }, getPlaybackDelay())
}

function moveToPreviousPoint() {
  setCurrentSequenceIndex(currentSequenceIndex.value - 1)
}

function moveToNextPoint() {
  setCurrentSequenceIndex(currentSequenceIndex.value + 1)
}

function toggleTimelineCollapsed() {
  timelineCollapsed.value = !timelineCollapsed.value
}

function toggleAutoplay() {
  if (isAutoplaying.value) {
    stopAutoplay()
    return
  }
  if (currentSequenceIndex.value >= timelineMaxSequenceIndex.value) {
    setCurrentSequenceIndex(0)
  }
  isAutoplaying.value = true
  scheduleAutoplayStep()
}

function restartAutoplay() {
  stopAutoplay()
  setCurrentSequenceIndex(0)
  isAutoplaying.value = true
  scheduleAutoplayStep()
}

function toggleSessionRelationVisibility() {
  if (!isSessionMode.value) {
    return
  }
  showAllSessionRelations.value = !showAllSessionRelations.value
}

function switchPanel(panel: 'graph' | 'relation-types') {
  if (panel === 'relation-types' && isReadOnly.value) {
    return
  }
  activePanel.value = panel
  createMenuVisible.value = false
  searchKeyword.value = ''
}

function closeWorldGraph() {
  emit('close')
}

function openMetaEditor() {
  if (isReadOnly.value) {
    return
  }
  metaEditorVisible.value = true
}

function closeMetaEditor() {
  metaEditorVisible.value = false
}

async function saveGraphMeta() {
  if (isReadOnly.value || !props.currentRobot?.id) {
    return
  }
  savingMeta.value = true
  try {
    const response = await updateRobotWorldGraphMeta(props.currentRobot.id, {
      title: meta.title,
      summary: meta.summary,
      calendar: {
        calendarId: meta.calendar.calendarId,
        calendarName: meta.calendar.calendarName,
        eras: parseStringListInput(calendarErasInput.value),
        monthNames: parseStringListInput(calendarMonthNamesInput.value),
        dayNames: parseStringListInput(calendarDayNamesInput.value),
        timeOfDayLabels: parseStringListInput(calendarTimeOfDayLabelsInput.value),
        formatTemplate: meta.calendar.formatTemplate,
      },
      layout: meta.layout,
    })
    Object.assign(meta, response.meta)
    syncCalendarInputs()
    closeMetaEditor()
    MessagePlugin.success('世界设定已保存')
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '保存世界设定失败')
  } finally {
    savingMeta.value = false
  }
}

function closeEditor() {
  editorVisible.value = false
  editorMode.value = null
  nodeDraft.value = null
  edgeDraft.value = null
  typeDraft.value = null
  nodeTagsInput.value = ''
}

function clearGraphSelection() {
  selectedNodeId.value = ''
  selectedEdgeId.value = ''
  selectedTypeId.value = ''
  if (editorMode.value !== 'relation-type') {
    closeEditor()
  }
}

function openNodeEditorFromProjected(node: WorldNode) {
  nodeDraft.value = cloneValue(node)
  nodeTagsInput.value = nodeDraft.value.tags.join(', ')
  editorVisible.value = true
  editorMode.value = 'node'
}

function openSelectedNodeEditor() {
  if (isReadOnly.value) {
    return
  }
  if (!selectedCanvasNode.value) {
    return
  }
  openNodeEditorFromProjected(selectedCanvasNode.value)
}

function openEdgeEditorFromProjected(edge: WorldEdge) {
  edgeDraft.value = cloneValue(edge)
  editorVisible.value = true
  editorMode.value = 'edge'
}

function openRelationTypeEditor(type: RobotWorldRelationType) {
  typeDraft.value = cloneValue(type)
  typeSourceObjectTypes.value = [...type.sourceObjectTypes]
  typeTargetObjectTypes.value = [...type.targetObjectTypes]
  editorVisible.value = true
  editorMode.value = 'relation-type'
}

function selectNode(nodeId: string) {
  const node = canvasNodeMap.value.get(nodeId)
  if (!node) {
    return
  }
  selectedNodeId.value = nodeId
  selectedEdgeId.value = ''
  selectedTypeId.value = ''
  if (editorMode.value === 'node') {
    closeEditor()
  }
}

function selectEdge(edgeId: string) {
  const edge = projectedEdgeMap.value.get(edgeId) || rawEdges.value.find((item) => item.id === edgeId)
  if (!edge) {
    return
  }
  selectedNodeId.value = ''
  selectedEdgeId.value = edgeId
  selectedTypeId.value = ''
  if (!isReadOnly.value) {
    openEdgeEditorFromProjected(edge)
  }
}

function selectTimelineEvent(entryKey: string) {
  const entry = currentTimelineEvents.value.find((item) => item.key === entryKey)
  if (!entry) {
    return
  }
  if (isSessionMode.value) {
    timelineEventDetailKey.value = entry.key
    return
  }
  if (isReadOnly.value) {
    return
  }
  const node = rawEventNodes.value.find((item) => item.id === entry.eventId)
  if (!node) {
    return
  }
  selectedNodeId.value = ''
  selectedEdgeId.value = ''
  selectedTypeId.value = ''
  openNodeEditorFromProjected(node)
}

function closeTimelineEventDetail() {
  timelineEventDetailKey.value = ''
}

function handleTimelineEventChipClick(entryKey: string, event: MouseEvent) {
  if (timelineEventStripSuppressClick.value) {
    event.preventDefault()
    event.stopPropagation()
    timelineEventStripSuppressClick.value = false
    return
  }
  selectTimelineEvent(entryKey)
}

function handleTimelineEventStripPointerDown(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) {
    return
  }
  const strip = timelineEventStripRef.value
  if (!strip) {
    return
  }

  timelineEventStripPointerId.value = event.pointerId
  timelineEventStripStartX.value = event.clientX
  timelineEventStripStartScrollLeft.value = strip.scrollLeft
  timelineEventStripDragging.value = false

  strip.setPointerCapture?.(event.pointerId)
}

function handleTimelineEventStripPointerMove(event: PointerEvent) {
  const strip = timelineEventStripRef.value
  if (!strip || timelineEventStripPointerId.value !== event.pointerId) {
    return
  }

  const deltaX = event.clientX - timelineEventStripStartX.value
  if (!timelineEventStripDragging.value && Math.abs(deltaX) < 6) {
    return
  }

  timelineEventStripDragging.value = true
  timelineEventStripSuppressClick.value = true
  strip.scrollLeft = timelineEventStripStartScrollLeft.value - deltaX
  event.preventDefault()
}

function handleTimelineEventStripPointerUp(event: PointerEvent) {
  const strip = timelineEventStripRef.value
  if (!strip || timelineEventStripPointerId.value !== event.pointerId) {
    return
  }

  if (strip.hasPointerCapture?.(event.pointerId)) {
    strip.releasePointerCapture?.(event.pointerId)
  }

  timelineEventStripPointerId.value = null
  timelineEventStripStartX.value = 0
  timelineEventStripStartScrollLeft.value = strip.scrollLeft

  if (!timelineEventStripDragging.value) {
    const pointerTarget = document.elementFromPoint(event.clientX, event.clientY)
    const eventChip = pointerTarget instanceof Element ? pointerTarget.closest<HTMLElement>('.timeline-event-chip') : null
    const eventId = eventChip?.dataset.eventId
    if (eventId) {
      timelineEventStripSuppressClick.value = true
      selectTimelineEvent(eventId)
      window.setTimeout(() => {
        timelineEventStripSuppressClick.value = false
      }, 0)
      return
    }
    timelineEventStripSuppressClick.value = false
    return
  }

  timelineEventStripDragging.value = false
  window.setTimeout(() => {
    timelineEventStripSuppressClick.value = false
  }, 0)
}

function startLinkingFromDetail() {
  if (isReadOnly.value) {
    return
  }
  if (!selectedCanvasNode.value) {
    return
  }
  beginLinking(selectedCanvasNode.value.id)
}

function selectRelationType(typeId: string) {
  const type = relationTypes.value.find((item) => item.id === typeId)
  if (!type) {
    return
  }
  selectedNodeId.value = ''
  selectedEdgeId.value = ''
  selectedTypeId.value = typeId
  openRelationTypeEditor(type)
}

function handleSidebarCreate() {
  if (isReadOnly.value) {
    return
  }
  if (activePanel.value === 'relation-types') {
    selectedNodeId.value = ''
    selectedEdgeId.value = ''
    selectedTypeId.value = ''
    openRelationTypeEditor(createRelationTypeDraft())
    return
  }
  createMenuVisible.value = !createMenuVisible.value
}

function handleCreateNode(objectType: WorldObjectType) {
  createMenuVisible.value = false
  openNodeEditorFromProjected(createNodeDraft(objectType))
}

function createEventAtCurrentPoint() {
  if (isReadOnly.value) {
    return
  }
  handleCreateNode('event')
}

function beginLinking(nodeId: string) {
  if (isReadOnly.value) {
    return
  }
  if (!canvasNodeMap.value.has(nodeId)) {
    return
  }
  linkingSourceNodeId.value = nodeId
  linkingTargetNodeId.value = ''
}

function handleLinkTargetPick(nodeId: string) {
  if (!linkingSourceNodeId.value || linkingSourceNodeId.value === nodeId) {
    cancelLinking()
    return
  }
  linkingTargetNodeId.value = nodeId
}

function cancelLinking() {
  linkingSourceNodeId.value = ''
  linkingTargetNodeId.value = ''
}

async function createEdgeWithType(type: RobotWorldRelationType) {
  if (isReadOnly.value || !props.currentRobot?.id || !linkingSourceNodeId.value || !linkingTargetNodeId.value) {
    return
  }
  savingEdge.value = true
  try {
    const response = await createRobotWorldEdge(props.currentRobot.id, {
      sourceNodeId: linkingSourceNodeId.value,
      targetNodeId: linkingTargetNodeId.value,
      relationTypeCode: type.code,
      relationLabel: type.label,
      summary: '',
      directionality: type.directionality,
      intensity: null,
      status: '',
      startSequenceIndex: currentSequenceIndex.value,
      endSequenceIndex: null,
      timelineSnapshots: [],
    })
    rawEdges.value = [...rawEdges.value, normalizeEdgeClient(response.edge)]
    MessagePlugin.success('关系已创建')
    cancelLinking()
    selectEdge(response.edge.id)
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '创建关系失败')
  } finally {
    savingEdge.value = false
  }
}

function readNodeAttribute(key: string) {
  if (!nodeDraft.value) {
    return ''
  }
  if (['knownFacts', 'preferencesAndConstraints', 'taskProgress', 'longTermMemory'].includes(key)) {
    return nodeDraft.value[key as 'knownFacts' | 'preferencesAndConstraints' | 'taskProgress' | 'longTermMemory'] ?? ''
  }
  return nodeDraft.value.attributes?.[key] ?? ''
}

function writeNodeAttribute(key: string, value: unknown, input: NodeFieldInput) {
  if (!nodeDraft.value) {
    return
  }
  if (['knownFacts', 'preferencesAndConstraints', 'taskProgress', 'longTermMemory'].includes(key)) {
    nodeDraft.value[key as 'knownFacts' | 'preferencesAndConstraints' | 'taskProgress' | 'longTermMemory'] = normalizeString(value)
    return
  }
  const nextAttributes = { ...(nodeDraft.value.attributes || {}) }
  nextAttributes[key] = input === 'number' ? (typeof value === 'number' && Number.isFinite(value) ? value : Number(value || 0)) : normalizeString(value)
  nodeDraft.value.attributes = nextAttributes
  if (key === 'currentStatus') {
    nodeDraft.value.status = normalizeString(nextAttributes[key])
  }
}

function readTimelineField(key: string) {
  const timeline = nodeDraft.value?.timeline as Record<string, string | number> | null | undefined
  return timeline?.[key] ?? ''
}

function writeTimelineField(key: string, value: unknown, input: NodeFieldInput) {
  if (!nodeDraft.value || nodeDraft.value.objectType !== 'event') {
    return
  }
  const timeline = { ...(nodeDraft.value.timeline || createEmptyTimeline(currentSequenceIndex.value)) } as Record<string, string | number>
  if (input === 'number') {
    const nextNumber = Math.max(0, Math.round(typeof value === 'number' ? value : Number(value || 0)))
    timeline[key] = key === 'sequenceIndex' ? Math.min(nextNumber, currentSequenceIndex.value + 1) : nextNumber
  } else {
    timeline[key] = normalizeString(value)
  }
  nodeDraft.value.timeline = timeline as unknown as WorldTimeline
}

function addEffect() {
  if (!nodeDraft.value || nodeDraft.value.objectType !== 'event') {
    return
  }
  nodeDraft.value.effects = [
    ...(Array.isArray(nodeDraft.value.effects) ? nodeDraft.value.effects : []),
    normalizeTimelineEffectClient({
      id: `effect-${crypto.randomUUID()}`,
      summary: '',
      targetNodeId: '',
      changeTargetType: 'node-content',
      nodeAttributeChanges: [],
      relationMode: 'existing',
      relationId: '',
      relationChanges: [],
      relationDraft: normalizeTimelineEffectRelationDraftClient(null),
    }),
  ]
}

function updateEffect(effectId: string, key: keyof WorldTimelineEffect, value: unknown) {
  if (!nodeDraft.value || nodeDraft.value.objectType !== 'event') {
    return
  }
  nodeDraft.value.effects = (Array.isArray(nodeDraft.value.effects) ? nodeDraft.value.effects : []).map((effect) => {
    if (effect.id !== effectId) {
      return effect
    }
    if (key === 'targetNodeId') {
      return normalizeTimelineEffectClient({
        ...effect,
        targetNodeId: normalizeString(value),
        nodeAttributeChanges: [],
        relationId: '',
        relationChanges: [],
        relationDraft: normalizeTimelineEffectRelationDraftClient(null),
      })
    }
    if (key === 'changeTargetType') {
      const nextType = normalizeString(value) === 'relation' ? 'relation' : 'node-content'
      return normalizeTimelineEffectClient({
        ...effect,
        changeTargetType: nextType as WorldTimelineEffectChangeTargetType,
        nodeAttributeChanges: [],
        relationMode: 'existing',
        relationId: '',
        relationChanges: [],
        relationDraft: normalizeTimelineEffectRelationDraftClient(null),
      })
    }
    if (key === 'relationMode') {
      return normalizeTimelineEffectClient({
        ...effect,
        relationMode: normalizeString(value) === 'create' ? 'create' : 'existing',
        relationId: '',
        relationChanges: [],
        relationDraft: normalizeTimelineEffectRelationDraftClient(null),
      })
    }
    return normalizeTimelineEffectClient({
      ...effect,
      [key]: normalizeString(value),
    })
  })
}

function removeEffect(effectId: string) {
  if (!nodeDraft.value || nodeDraft.value.objectType !== 'event') {
    return
  }
  nodeDraft.value.effects = (Array.isArray(nodeDraft.value.effects) ? nodeDraft.value.effects : []).filter((effect) => effect.id !== effectId)
}

function toggleEffectNodeAttributeChange(effectId: string, fieldKey: string) {
  if (!nodeDraft.value || nodeDraft.value.objectType !== 'event') {
    return
  }
  nodeDraft.value.effects = nodeDraft.value.effects.map((effect) => {
    if (effect.id !== effectId) {
      return effect
    }
    const existing = findEffectNodeAttributeChange(effect, fieldKey)
    const nextChanges = existing
      ? effect.nodeAttributeChanges.filter((item) => item.fieldKey !== fieldKey)
      : [
          ...effect.nodeAttributeChanges,
          normalizeTimelineEffectNodeAttributeChangeClient({
            fieldKey,
            beforeValue: readEffectNodeFieldCurrentValue(effect, fieldKey),
            afterValue: '',
          }),
        ]
    return normalizeTimelineEffectClient({
      ...effect,
      nodeAttributeChanges: nextChanges,
    })
  })
}

function updateEffectNodeAttributeChange(
  effectId: string,
  fieldKey: string,
  key: keyof WorldTimelineEffectNodeAttributeChange,
  value: unknown,
) {
  if (!nodeDraft.value || nodeDraft.value.objectType !== 'event') {
    return
  }
  nodeDraft.value.effects = nodeDraft.value.effects.map((effect) => {
    if (effect.id !== effectId) {
      return effect
    }
    return normalizeTimelineEffectClient({
      ...effect,
      nodeAttributeChanges: effect.nodeAttributeChanges.map((item) =>
        item.fieldKey === fieldKey
          ? normalizeTimelineEffectNodeAttributeChangeClient({
              ...item,
              [key]: normalizeString(value),
            })
          : item,
      ),
    })
  })
}

function toggleEffectRelationChange(effectId: string, fieldKey: string) {
  if (!nodeDraft.value || nodeDraft.value.objectType !== 'event') {
    return
  }
  nodeDraft.value.effects = nodeDraft.value.effects.map((effect) => {
    if (effect.id !== effectId) {
      return effect
    }
    const existing = findEffectRelationChange(effect, fieldKey)
    const nextChanges = existing
      ? effect.relationChanges.filter((item) => item.fieldKey !== fieldKey)
      : [
          ...effect.relationChanges,
          normalizeTimelineEffectRelationChangeClient({
            fieldKey,
            beforeValue: readEffectRelationFieldCurrentValue(effect, fieldKey),
            afterValue: '',
          }),
        ]
    return normalizeTimelineEffectClient({
      ...effect,
      relationChanges: nextChanges,
    })
  })
}

function updateEffectRelationChange(
  effectId: string,
  fieldKey: string,
  key: keyof WorldTimelineEffectRelationChange,
  value: unknown,
) {
  if (!nodeDraft.value || nodeDraft.value.objectType !== 'event') {
    return
  }
  nodeDraft.value.effects = nodeDraft.value.effects.map((effect) => {
    if (effect.id !== effectId) {
      return effect
    }
    return normalizeTimelineEffectClient({
      ...effect,
      relationChanges: effect.relationChanges.map((item) =>
        item.fieldKey === fieldKey
          ? normalizeTimelineEffectRelationChangeClient({
              ...item,
              [key]: normalizeString(value),
            })
          : item,
      ),
    })
  })
}

function updateEffectRelationDraft(
  effectId: string,
  key: keyof WorldTimelineEffectRelationDraft,
  value: unknown,
) {
  if (!nodeDraft.value || nodeDraft.value.objectType !== 'event') {
    return
  }
  nodeDraft.value.effects = nodeDraft.value.effects.map((effect) => {
    if (effect.id !== effectId) {
      return effect
    }
    const nextDraft = {
      ...effect.relationDraft,
      [key]:
        key === 'intensity'
          ? typeof value === 'number' && Number.isFinite(value)
            ? Math.max(0, Math.min(100, Math.round(value)))
            : null
          : normalizeString(value),
    }
    return normalizeTimelineEffectClient({
      ...effect,
      relationDraft: normalizeTimelineEffectRelationDraftClient(nextDraft),
    })
  })
}

function updateEdgeIntensity(value: number | string | null | undefined) {
  if (!edgeDraft.value) {
    return
  }
  edgeDraft.value.intensity = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : null
}

function buildNodeSnapshotFromDraft(draft: WorldNode): WorldNodeSnapshot {
  return normalizeNodeSnapshot({
    sequenceIndex: currentSequenceIndex.value,
    name: draft.name,
    summary: draft.summary,
    status: normalizeString(draft.attributes.currentStatus ?? draft.status),
    tags: nodeTagsInput.value.split(',').map((item) => normalizeString(item)).filter(Boolean),
    attributes: draft.attributes,
  })
}

function mergeNodeDraftIntoRaw(baseNode: WorldNode | null, draft: WorldNode): WorldNode {
  const nextTags = nodeTagsInput.value.split(',').map((item) => normalizeString(item)).filter(Boolean)
  const nextStatus = normalizeString(draft.attributes.currentStatus ?? draft.status)
  const limitedSequenceIndex = Math.min(
    Math.max(0, normalizeNumber(draft.timeline?.sequenceIndex, currentSequenceIndex.value)),
    currentSequenceIndex.value + 1,
  )
  if (!baseNode) {
    return {
      ...cloneValue(draft),
      tags: nextTags,
      status: nextStatus,
      startSequenceIndex: draft.objectType === 'event' ? limitedSequenceIndex : currentSequenceIndex.value,
      timeline: draft.objectType === 'event' ? { ...createEmptyTimeline(currentSequenceIndex.value), ...(draft.timeline || {}), sequenceIndex: limitedSequenceIndex } : null,
      timelineSnapshots: [],
    }
  }
  const next = cloneValue(baseNode)
  const shouldWriteBase = currentSequenceIndex.value <= next.startSequenceIndex || next.objectType === 'event'
  if (shouldWriteBase) {
    next.name = draft.name
    next.summary = draft.summary
    next.status = nextStatus
    next.tags = nextTags
    next.attributes = { ...draft.attributes }
    if (next.objectType === 'event') {
      next.timeline = { ...createEmptyTimeline(next.startSequenceIndex), ...(next.timeline || {}), ...(draft.timeline || {}), sequenceIndex: limitedSequenceIndex }
      next.startSequenceIndex = limitedSequenceIndex
      next.effects = Array.isArray(draft.effects) ? draft.effects.map(normalizeTimelineEffectClient) : []
    }
    next.timelineSnapshots = next.timelineSnapshots.filter((snapshot) => snapshot.sequenceIndex !== currentSequenceIndex.value)
    return next
  }
  next.timelineSnapshots = [...next.timelineSnapshots.filter((item) => item.sequenceIndex !== currentSequenceIndex.value), buildNodeSnapshotFromDraft(draft)].sort((left, right) => left.sequenceIndex - right.sequenceIndex)
  return next
}

function buildEdgeSnapshotFromDraft(draft: WorldEdge): WorldEdgeSnapshot {
  return normalizeEdgeSnapshot({
    sequenceIndex: currentSequenceIndex.value,
    relationTypeCode: draft.relationTypeCode,
    relationLabel: draft.relationLabel,
    summary: draft.summary,
    status: draft.status,
    intensity: draft.intensity,
  })
}

function mergeEdgeDraftIntoRaw(baseEdge: WorldEdge | null, draft: WorldEdge): WorldEdge {
  if (!baseEdge) {
    return { ...cloneValue(draft), startSequenceIndex: currentSequenceIndex.value, endSequenceIndex: null, timelineSnapshots: [] }
  }
  const next = cloneValue(baseEdge)
  if (currentSequenceIndex.value <= next.startSequenceIndex) {
    next.relationTypeCode = draft.relationTypeCode
    next.relationLabel = draft.relationLabel
    next.summary = draft.summary
    next.status = draft.status
    next.intensity = draft.intensity
    next.timelineSnapshots = next.timelineSnapshots.filter((snapshot) => snapshot.sequenceIndex !== currentSequenceIndex.value)
    return next
  }
  next.timelineSnapshots = [...next.timelineSnapshots.filter((item) => item.sequenceIndex !== currentSequenceIndex.value), buildEdgeSnapshotFromDraft(draft)].sort((left, right) => left.sequenceIndex - right.sequenceIndex)
  return next
}

async function saveNode() {
  if (!props.currentRobot?.id || !nodeDraft.value) {
    return
  }
  const rawNode = nodeDraft.value.id ? rawNodes.value.find((item) => item.id === nodeDraft.value?.id) || null : null
  const payload = mergeNodeDraftIntoRaw(rawNode, nodeDraft.value)
  savingNode.value = true
  try {
    const response = rawNode
      ? await updateRobotWorldNode(props.currentRobot.id, rawNode.id, payload)
      : await createRobotWorldNode(props.currentRobot.id, payload)
    const savedNode = normalizeNodeClient(response.node)
    rawNodes.value = rawNode ? rawNodes.value.map((item) => item.id === savedNode.id ? savedNode : item) : [...rawNodes.value, savedNode]
    selectedNodeId.value = savedNode.objectType === 'event' ? '' : savedNode.id
    openNodeEditorFromProjected(projectNodeAtSequence(savedNode, currentSequenceIndex.value) || savedNode)
    MessagePlugin.success('对象已保存')
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '保存对象失败')
  } finally {
    savingNode.value = false
  }
}

async function removeNode() {
  if (!props.currentRobot?.id || !nodeDraft.value?.id) {
    closeEditor()
    return
  }
  if (!window.confirm('确认删除该对象吗？')) {
    return
  }
  savingNode.value = true
  try {
    await deleteRobotWorldNode(props.currentRobot.id, nodeDraft.value.id)
    rawNodes.value = rawNodes.value.filter((item) => item.id !== nodeDraft.value?.id)
    rawEdges.value = rawEdges.value.filter((edge) => edge.sourceNodeId !== nodeDraft.value?.id && edge.targetNodeId !== nodeDraft.value?.id)
    clearGraphSelection()
    closeEditor()
    MessagePlugin.success('对象已删除')
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '删除对象失败')
  } finally {
    savingNode.value = false
  }
}

async function saveEdge() {
  if (!props.currentRobot?.id || !edgeDraft.value) {
    return
  }
  const rawEdge = edgeDraft.value.id ? rawEdges.value.find((item) => item.id === edgeDraft.value?.id) || null : null
  const payload = mergeEdgeDraftIntoRaw(rawEdge, edgeDraft.value)
  savingEdge.value = true
  try {
    const response = rawEdge
      ? await updateRobotWorldEdge(props.currentRobot.id, rawEdge.id, payload)
      : await createRobotWorldEdge(props.currentRobot.id, payload)
    const savedEdge = normalizeEdgeClient(response.edge)
    rawEdges.value = rawEdge ? rawEdges.value.map((item) => item.id === savedEdge.id ? savedEdge : item) : [...rawEdges.value, savedEdge]
    selectedEdgeId.value = savedEdge.id
    openEdgeEditorFromProjected(projectEdgeAtSequence(savedEdge, currentSequenceIndex.value) || savedEdge)
    MessagePlugin.success('关系已保存')
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '保存关系失败')
  } finally {
    savingEdge.value = false
  }
}

async function removeEdge() {
  if (!props.currentRobot?.id || !edgeDraft.value?.id) {
    closeEditor()
    return
  }
  if (!window.confirm('确认删除该关系吗？')) {
    return
  }
  savingEdge.value = true
  try {
    await deleteRobotWorldEdge(props.currentRobot.id, edgeDraft.value.id)
    rawEdges.value = rawEdges.value.filter((item) => item.id !== edgeDraft.value?.id)
    clearGraphSelection()
    closeEditor()
    MessagePlugin.success('关系已删除')
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '删除关系失败')
  } finally {
    savingEdge.value = false
  }
}

async function saveType() {
  if (!props.currentRobot?.id || !typeDraft.value) {
    return
  }
  const payload: Partial<RobotWorldRelationType> = { ...typeDraft.value, sourceObjectTypes: [...typeSourceObjectTypes.value], targetObjectTypes: [...typeTargetObjectTypes.value] }
  savingType.value = true
  try {
    const response = typeDraft.value.id
      ? await updateRobotWorldRelationType(props.currentRobot.id, typeDraft.value.id, payload)
      : await createRobotWorldRelationType(props.currentRobot.id, payload)
    const savedType = normalizeRelationTypeClient(response.relationType)
    relationTypes.value = typeDraft.value.id ? relationTypes.value.map((item) => item.id === savedType.id ? savedType : item) : [...relationTypes.value, savedType]
    selectedTypeId.value = savedType.id
    openRelationTypeEditor(savedType)
    MessagePlugin.success('关系类型已保存')
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '保存关系类型失败')
  } finally {
    savingType.value = false
  }
}

async function removeType() {
  if (!props.currentRobot?.id || !typeDraft.value?.id || typeDraft.value.isBuiltin) {
    return
  }
  if (!window.confirm('确认删除该关系类型吗？')) {
    return
  }
  savingType.value = true
  try {
    await deleteRobotWorldRelationType(props.currentRobot.id, typeDraft.value.id)
    relationTypes.value = relationTypes.value.filter((item) => item.id !== typeDraft.value?.id)
    selectedTypeId.value = ''
    closeEditor()
    MessagePlugin.success('关系类型已删除')
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '删除关系类型失败')
  } finally {
    savingType.value = false
  }
}

async function persistNodePosition(nodeId: string, x: number, y: number) {
  if (isReadOnly.value || !props.currentRobot?.id) {
    return
  }
  const node = rawNodes.value.find((item) => item.id === nodeId)
  if (!node) {
    return
  }
  const nextNode: WorldNode = { ...cloneValue(node), position: { x, y } }
  rawNodes.value = rawNodes.value.map((item) => item.id === nodeId ? nextNode : item)
  try {
    const response = await updateRobotWorldNode(props.currentRobot.id, nodeId, nextNode)
    rawNodes.value = rawNodes.value.map((item) => item.id === nodeId ? normalizeNodeClient(response.node) : item)
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '保存节点位置失败')
    rawNodes.value = rawNodes.value.map((item) => item.id === nodeId ? node : item)
  }
}

function handleNodeMove(payload: { nodeId: string; x: number; y: number }) {
  if (isReadOnly.value) {
    rawNodes.value = rawNodes.value.map((node) =>
      node.id === payload.nodeId
        ? {
            ...node,
            position: {
              x: Math.round(payload.x),
              y: Math.round(payload.y),
            },
          }
        : node,
    )
    return
  }
  void persistNodePosition(payload.nodeId, payload.x, payload.y)
}

async function autoLayout() {
  if (isReadOnly.value || !props.currentRobot?.id || !rawNodes.value.length) {
    return
  }
  const previousNodes = rawNodes.value
  const targetNodes = rawNodes.value
  if (!targetNodes.length) {
    return
  }
  const nextNodes = mergeAutoLayoutIntoNodes(previousNodes, targetNodes)
  const previousNodeMap = new Map(previousNodes.map((node) => [node.id, node] as const))
  const changedNodes = nextNodes.filter((node) => {
    const previousNode = previousNodeMap.get(node.id)
    return !previousNode || previousNode.position.x !== node.position.x || previousNode.position.y !== node.position.y
  })
  rawNodes.value = nextNodes
  try {
    const results = await Promise.all(changedNodes.map((node) => updateRobotWorldNode(props.currentRobot!.id, node.id, node)))
    const nextMap = new Map(results.map((item) => {
      const node = normalizeNodeClient(item.node)
      return [node.id, node] as const
    }))
    rawNodes.value = rawNodes.value.map((node) => nextMap.get(node.id) || node)
    MessagePlugin.success('布局已更新')
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '自动布局失败')
    void loadWorldGraph()
  }
}

function updateGraphLayout(layout: WorldGraphLayout) {
  if (isReadOnly.value) {
    Object.assign(meta.layout, cloneValue(layout))
    return
  }
  Object.assign(meta.layout, cloneValue(layout))
  pendingLayout.value = cloneValue(layout)
  if (layoutSaveTimer.value) {
    window.clearTimeout(layoutSaveTimer.value)
  }
  layoutSaveTimer.value = window.setTimeout(async () => {
    if (!props.currentRobot?.id || !pendingLayout.value) {
      return
    }
    const nextLayout = cloneValue(pendingLayout.value)
    if (nextLayout.viewportX === lastPersistedLayout.value.viewportX && nextLayout.viewportY === lastPersistedLayout.value.viewportY && nextLayout.zoom === lastPersistedLayout.value.zoom) {
      return
    }
    try {
      const response = await updateRobotWorldGraphLayout(props.currentRobot.id, nextLayout)
      Object.assign(meta.layout, response.meta.layout)
      lastPersistedLayout.value = cloneValue(response.meta.layout)
    } catch (error) {
      MessagePlugin.error(error instanceof Error ? error.message : '保存视图布局失败')
    }
  }, 320)
}

watch(
  () => [props.currentRobot?.id, props.graphData, props.mode, props.readOnly],
  () => {
    if (isSessionMode.value) {
      activePanel.value = 'graph'
    }
    void loadWorldGraph()
  },
  { immediate: true },
)
watch(
  () => graphMode.value,
  (value, previousValue) => {
    if (value !== previousValue) {
      timelineCollapsed.value = value === 'session'
    }
  },
)
watch(
  () => isReadOnly.value,
  (value) => {
    if (value) {
      closeMetaEditor()
    }
  },
)
watch(
  () => props.active,
  (value) => {
    if (!value) {
      if (activationFitTimer.value) {
        window.clearTimeout(activationFitTimer.value)
        activationFitTimer.value = null
      }
      return
    }
    scheduleSessionViewportFit(180)
  },
  { immediate: true },
)
watch(timelineMaxSequenceIndex, (value) => {
  if (currentSequenceIndex.value > value) {
    currentSequenceIndex.value = value
  }
  if (isAutoplaying.value && currentSequenceIndex.value >= value) {
    stopAutoplay()
  }
})
watch(canvasNodes, (nodes) => {
  if (selectedNodeId.value && !nodes.some((node) => node.id === selectedNodeId.value)) {
    selectedNodeId.value = ''
    if (editorMode.value === 'node') {
      closeEditor()
    }
  }
})
watch(projectedEdges, (edges) => {
  if (selectedEdgeId.value && !edges.some((edge) => edge.id === selectedEdgeId.value)) {
    selectedEdgeId.value = ''
    if (editorMode.value === 'edge') {
      closeEditor()
    }
  }
})
watch(timelineEventDetailNode, (value) => {
  if (!value && timelineEventDetailKey.value) {
    timelineEventDetailKey.value = ''
  }
})
watch(typeDraft, (value) => {
  if (!value) {
    typeSourceObjectTypes.value = []
    typeTargetObjectTypes.value = []
    return
  }
  typeSourceObjectTypes.value = [...value.sourceObjectTypes]
  typeTargetObjectTypes.value = [...value.targetObjectTypes]
})
watch(playbackSpeed, () => {
  if (!isAutoplaying.value) {
    return
  }
  stopAutoplay()
  isAutoplaying.value = true
  scheduleAutoplayStep()
})

onMounted(() => {
  if (meta.layout.zoom <= 0) {
    Object.assign(meta.layout, { viewportX: 0, viewportY: 0, zoom: 1 })
  }
})

onBeforeUnmount(() => {
  stopAutoplay()
  if (layoutSaveTimer.value) {
    window.clearTimeout(layoutSaveTimer.value)
  }
  if (activationFitTimer.value) {
    window.clearTimeout(activationFitTimer.value)
  }
})
</script>

<style scoped>
.empty-state,.world-shell{width:100%;height:100%}
.empty-state{display:grid;place-items:center;color:#5f636a;font-size:14px}
.world-shell{display:grid;grid-template-columns:280px minmax(0,1fr);background:#f3f3f3}
.sidebar{display:flex;flex-direction:column;min-height:0;background:rgba(255,255,255,.92);border-right:1px solid rgba(15,23,42,.08)}
.sidebar-tabs{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;padding:18px}
.sidebar-tabs.single{grid-template-columns:1fr}
.sidebar-tab{height:42px;border:0;border-radius:16px;background:#eef0f3;color:#5b6168;font-size:14px;font-weight:600;cursor:pointer;transition:.18s ease}
.sidebar-tab.active{background:#111827;color:#fff}
.sidebar-tools{padding:0 18px 12px}
.world-settings-button{width:100%}
.meta-form{display:grid;gap:4px}
.meta-form-popup{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:16px}
.meta-form-popup :deep(.t-form__item){min-width:0}
.sidebar-search{padding:0 18px 12px}
.sidebar-search :deep(.t-input){border-radius:16px;background:#eef0f3}
.sidebar-list{flex:1;min-height:0;padding:0 10px 12px;overflow:auto}
.sidebar-item{display:flex;align-items:center;width:100%;min-height:48px;margin-bottom:8px;padding:12px 14px;border:0;border-radius:16px;background:transparent;color:#20242a;text-align:left;cursor:pointer;transition:.18s ease}
.sidebar-item:hover,.sidebar-item.active{background:#eef0f3}
.sidebar-item.disabled{cursor:default;opacity:.64}
.sidebar-item.disabled:hover{background:transparent}
.sidebar-item.future{font-style:normal}
.sidebar-footer{position:relative;display:grid;gap:10px;padding:14px 18px 18px;border-top:1px solid rgba(15,23,42,.06)}
.create-menu{position:absolute;right:18px;bottom:122px;display:grid;gap:8px;min-width:152px;padding:10px;border:1px solid rgba(15,23,42,.08);border-radius:18px;background:rgba(255,255,255,.98);box-shadow:0 20px 40px rgba(15,23,42,.12)}
.create-menu-item{height:40px;padding:0 12px;border:0;border-radius:12px;background:#f3f4f6;color:#20242a;text-align:left;cursor:pointer}
.create-button,.close-button{width:100%}
.canvas-area{position:relative;min-width:0;min-height:0;overflow:hidden}
.graph-stage-shell{position:absolute;inset:0;transition:inset .18s ease}
.graph-stage-shell.with-timeline{inset:0 0 176px}
.graph-stage-shell.with-timeline.collapsed{inset:0 0 88px}
.node-detail-panel{position:absolute;top:24px;right:24px;z-index:8;display:flex;flex-direction:column;gap:14px;width:320px;max-height:calc(100% - 48px);padding:18px;border:1px solid rgba(15,23,42,.08);border-radius:24px;background:rgba(255,255,255,.96);box-shadow:0 22px 48px rgba(15,23,42,.12);backdrop-filter:blur(18px)}
.node-detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.node-detail-head strong{display:block;color:#111827;font-size:22px;line-height:1.2}
.node-detail-head small{display:block;margin-top:6px;color:#6b7280;font-size:13px}
.node-detail-type{display:inline-flex;margin-bottom:8px;padding:4px 10px;border-radius:999px;background:#eef0f3;color:#4b5563;font-size:12px;font-weight:600}
.node-detail-actions{display:flex;gap:10px}
.node-detail-body{display:flex;flex-direction:column;gap:14px;overflow:auto}
.node-detail-section{display:flex;flex-direction:column;gap:8px}
.node-detail-section>span{color:#6b7280;font-size:12px;font-weight:600}
.node-detail-section>p{margin:0;color:#111827;font-size:14px;line-height:1.65}
.node-tag-list{display:flex;flex-wrap:wrap;gap:8px}
.node-tag-list em{padding:6px 10px;border-radius:999px;background:#eef0f3;color:#374151;font-size:12px;font-style:normal}
.node-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.node-detail-item{display:flex;flex-direction:column;gap:4px;padding:10px 12px;border-radius:16px;background:#f6f7f9}
.node-detail-item small{color:#6b7280;font-size:12px}
.node-detail-item strong{color:#111827;font-size:14px;line-height:1.5}
.relation-picker-mask,.editor-popup-layer{position:absolute;inset:0;display:grid;place-items:center;background:rgba(17,24,39,.18);z-index:15}
.relation-picker,.editor-popup{width:min(520px,calc(100vw - 48px));overflow:auto;border-radius:28px;background:rgba(255,255,255,.98);box-shadow:0 28px 80px rgba(15,23,42,.2)}
.relation-picker{display:grid;gap:12px;padding:22px}
.editor-popup{display:flex;flex-direction:column;max-height:min(720px,calc(100vh - 140px))}
.meta-editor-popup{width:min(760px,calc(100vw - 48px))}
.timeline-event-detail-popup{display:flex;flex-direction:column;width:min(560px,calc(100vw - 48px));max-height:min(620px,calc(100vh - 140px));border-radius:28px;background:rgba(255,255,255,.98);box-shadow:0 28px 80px rgba(15,23,42,.2);overflow:hidden}
.relation-picker-title{color:#111827;font-size:20px;font-weight:700}
.relation-picker-subtitle{color:#6b7280;font-size:13px}
.relation-picker-item{height:44px;padding:0 14px;border:0;border-radius:14px;background:#eef0f3;color:#111827;text-align:left;cursor:pointer}
.editor-head{padding:18px 22px 8px}
.editor-head strong{display:block;color:#111827;font-size:22px;line-height:1.2}
.editor-head small{display:block;margin-top:8px;color:#6b7280;font-size:13px}
.editor-body{padding:0 22px 20px;overflow:auto}
.editor-actions{display:flex;gap:12px;margin-top:18px}
.effects-section{display:grid;gap:12px}
.effects-head{display:flex;align-items:center;justify-content:space-between;margin-top:8px}
.effect-card{display:grid;gap:10px;padding:14px;border-radius:18px;background:#f3f4f6}
.effect-mode-panel{display:grid;gap:10px}
.effect-mode-title{color:#111827;font-size:13px;font-weight:600}
.effect-mode-switch{display:flex;gap:8px;flex-wrap:wrap}
.effect-mode-chip,.effect-field-toggle{height:34px;padding:0 12px;border:0;border-radius:999px;background:#e5e7eb;color:#374151;cursor:pointer;transition:.18s ease}
.effect-mode-chip.active,.effect-field-toggle.active{background:#111827;color:#fff}
.effect-field-row{display:grid;gap:8px}
.timeline-dock{position:absolute;right:0;bottom:0;left:0;z-index:9;display:grid;gap:16px;min-height:176px;padding:18px 24px 20px;background:linear-gradient(180deg,rgba(243,243,243,.78),rgba(255,255,255,.98));border-top:1px solid rgba(15,23,42,.08);backdrop-filter:blur(18px);transition:min-height .18s ease,padding .18s ease,gap .18s ease}
.timeline-dock.collapsed{gap:10px;min-height:88px;padding:14px 20px 16px}
.timeline-dock.collapsed .timeline-dock-head{align-items:center}
.timeline-dock.collapsed .timeline-current{gap:2px}
.timeline-dock.collapsed .timeline-current strong{font-size:16px}
.timeline-dock-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.timeline-current{display:grid;gap:4px}
.timeline-current span,.timeline-current small{color:#6b7280;font-size:13px}
.timeline-current strong{color:#111827;font-size:18px;font-weight:700}
.timeline-actions{display:flex;flex-wrap:wrap;gap:8px}
.timeline-speed-select{width:92px}
.timeline-range-wrap{display:grid}
.timeline-range{width:100%;position:relative;z-index:1}
.timeline-event-strip{display:flex;gap:10px;overflow-x:auto;cursor:grab;user-select:none;touch-action:pan-x}
.timeline-event-strip:active{cursor:grabbing}
.timeline-event-chip{display:grid;gap:4px;width:220px;min-width:220px;max-width:220px;padding:14px 16px;border:0;border-radius:18px;background:#fff;color:#111827;text-align:left;box-shadow:0 12px 28px rgba(15,23,42,.08);cursor:pointer;flex:0 0 auto}
.timeline-event-summary{display:-webkit-box;width:100%;max-width:100%;overflow:hidden;line-height:1.5;white-space:normal;word-break:break-word;text-overflow:ellipsis;-webkit-box-orient:vertical;-webkit-line-clamp:2}
.timeline-event-detail-body{display:grid;gap:14px}
.timeline-event-chip span,.timeline-event-chip small,.timeline-event-empty,.sidebar-empty{color:#6b7280;font-size:13px}
.timeline-event-chip strong{font-size:15px}
.timeline-event-empty,.sidebar-empty{padding:16px}
@media (max-width:1080px){.world-shell{grid-template-columns:1fr}.sidebar{height:280px;border-right:0;border-bottom:1px solid rgba(15,23,42,.08)}.graph-stage-shell.with-timeline{inset:0 0 228px}.graph-stage-shell.with-timeline.collapsed{inset:0 0 96px}.node-detail-panel{top:16px;right:16px;width:min(320px,calc(100% - 32px));max-height:calc(100% - 32px)}.timeline-dock-head{flex-direction:column}}
@media (max-width:768px){
  .world-shell{grid-template-columns:1fr;grid-template-rows:220px minmax(0,1fr)}
  .sidebar{height:auto;border-right:0;border-bottom:1px solid rgba(15,23,42,.08)}
  .sidebar-tabs{gap:6px;padding:12px}
  .sidebar-tab{height:38px;border-radius:14px;font-size:13px}
  .sidebar-tools{padding:0 12px 10px}
  .sidebar-search{padding:0 12px 10px}
  .sidebar-list{padding:0 8px 10px}
  .sidebar-item{min-height:42px;margin-bottom:6px;padding:10px 12px;border-radius:14px}
  .sidebar-footer{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:12px}
  .create-menu{right:12px;bottom:72px;min-width:140px}
  .graph-stage-shell.with-timeline{inset:0 0 144px}
  .graph-stage-shell.with-timeline.collapsed{inset:0 0 72px}
  .node-detail-panel{top:auto;right:12px;bottom:12px;left:12px;width:auto;max-height:min(42%,320px);padding:14px;border-radius:20px}
  .node-detail-head strong{font-size:18px}
  .node-detail-grid{grid-template-columns:1fr}
  .relation-picker,.editor-popup,.meta-editor-popup{width:calc(100vw - 24px)}
  .editor-popup{max-height:min(760px,calc(100dvh - 24px))}
  .meta-form-popup{grid-template-columns:1fr}
  .timeline-dock{gap:12px;min-height:144px;padding:14px 14px 16px}
  .timeline-dock.collapsed{min-height:72px;padding:12px 14px}
  .timeline-event-chip{width:180px;min-width:180px;max-width:180px;padding:12px 14px}
}
</style>
