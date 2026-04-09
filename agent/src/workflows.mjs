import { Annotation, END, START, StateGraph } from '@langchain/langgraph'

import {
  addUsage,
  answerNode,
  answerGraphUpdateNode,
  buildGraphRagExtractPrompt,
  buildGraphRagRetrievePrompt,
  buildGraphRagWritebackPrompt,
  buildMemorySchemaPrompt,
  buildRobotGenerationContext,
  buildWorldGraphEvolutionPrompt,
  emptyUsage,
  ensureGeneratedRobotPayload,
  formatStageError,
  graphWritebackLog,
  parseJsonObject,
  storyOutlineNode,
  worldGraphEvolutionNode,
} from './runtime.mjs'
import {
  normalizeGraphRagGraphPayload,
  normalizeGraphRagRetrievePayload,
  normalizeGraphRagWritebackPayload,
  normalizeGeneratedMemorySchemaPayload,
  normalizeGeneratedWorldGraphPatchPayload,
  normalizeRobotGenerationCorePayload,
} from './schemas.mjs'
import { getPromptConfig } from './prompt-config.mjs'

const ContextState = Annotation.Root({
  context: Annotation({
    reducer: (_left, right) => right ?? _left,
    default: () => ({}),
  }),
})

function compileGraph(builder) {
  return builder.compile()
}

export function createStreamWorkflow({ modelClient }) {
  return compileGraph(
    new StateGraph(ContextState)
      .addNode('outline', async ({ context }) => {
        try {
          await context.event_sink?.({ type: 'story_outline_started' })
          const payload = context.story_outline && typeof context.story_outline === 'object'
            ? {
              story_outline: context.story_outline,
              usage: emptyUsage(),
            }
            : await storyOutlineNode(context, modelClient)
          const nextContext = {
            ...context,
            story_outline: payload.story_outline,
            story_outline_stage_completed: true,
            usage: addUsage(context.usage, payload.usage),
          }
          await context.event_sink?.({
            type: 'story_outline_completed',
            story_outline: nextContext.story_outline || {},
          })
          return { context: nextContext }
        } catch (error) {
          throw new Error(formatStageError(context.request, '故事梗概阶段', error))
        }
      })
      .addNode('answer', async ({ context }) => {
        try {
          let finalResponse = ''
          const payload = await answerNode(context, modelClient, async (text) => {
            if (!text) {
              return
            }
            finalResponse += text
            await context.event_sink?.({ type: 'message_delta', text })
          })
          finalResponse = payload.final_response ?? finalResponse
          const nextContext = {
            ...context,
            final_response: finalResponse,
            usage: addUsage(context.usage, payload.usage),
          }
          await context.event_sink?.({ type: 'message_done', text: finalResponse })
          await context.event_sink?.({
            type: 'response_completed',
            threadId: context.thread_id,
            message: finalResponse,
          })
          return { context: nextContext }
        } catch (error) {
          throw new Error(formatStageError(context.request, '主回复阶段', error))
        }
      })
      .addEdge(START, 'outline')
      .addEdge('outline', 'answer')
      .addEdge('answer', END),
  )
}

export function createRobotGenerationWorkflow({ modelClient }) {
  const prompts = getPromptConfig()
  return compileGraph(
    new StateGraph(ContextState)
      .addNode('core', async ({ context }) => {
        const response = await modelClient.invokeStructured(
          context.model_settings,
          prompts.templates.robot_generation.core_system_instruction,
          buildRobotGenerationContext(context.request),
          'robot_generation_core',
          '智能体核心配置',
        )
        return {
          context: {
            ...context,
            core_payload: normalizeRobotGenerationCorePayload(response.data),
            usage: response.usage,
          },
        }
      })
      .addNode('memorySchema', async ({ context }) => {
        const response = await modelClient.invokeStructured(
          context.model_settings,
          prompts.templates.robot_generation.memory_schema_system_instruction,
          buildMemorySchemaPrompt(context.request, context.core_payload),
          'memory_schema',
          '结构化记忆 schema',
        )
        const memorySchema = normalizeGeneratedMemorySchemaPayload(response.data)
        const payload = {
          ...context.core_payload,
          memory_schema: memorySchema,
          world_graph: {},
        }
        ensureGeneratedRobotPayload(payload)
        return {
          context: {
            ...context,
            memory_schema_payload: memorySchema,
            generated_robot_payload: payload,
            usage: addUsage(context.usage, response.usage),
          },
        }
      })
      .addEdge(START, 'core')
      .addEdge('core', 'memorySchema')
      .addEdge('memorySchema', END),
  )
}

export async function runWorldGraphEvolution({ modelClient, modelSettings, request }) {
  const prompts = getPromptConfig()
  const response = await modelClient.invokeStructured(
    modelSettings,
    prompts.templates.robot_generation.world_graph_evolution_system_instruction,
    buildWorldGraphEvolutionPrompt(request),
    'world_graph_patch',
    '世界图谱演化 patch',
  )
  const normalizedPatch = normalizeGeneratedWorldGraphPatchPayload(response.data)
  const patchSummary = {
    title: String(normalizedPatch?.meta?.title || ''),
    upsertRelationTypeCount: Array.isArray(normalizedPatch.upsert_relation_types) ? normalizedPatch.upsert_relation_types.length : 0,
    deleteRelationTypeCount: Array.isArray(normalizedPatch.delete_relation_type_codes) ? normalizedPatch.delete_relation_type_codes.length : 0,
    upsertNodeCount: Array.isArray(normalizedPatch.upsert_nodes) ? normalizedPatch.upsert_nodes.length : 0,
    deleteNodeCount: Array.isArray(normalizedPatch.delete_node_ids) ? normalizedPatch.delete_node_ids.length : 0,
    upsertEdgeCount: Array.isArray(normalizedPatch.upsert_edges) ? normalizedPatch.upsert_edges.length : 0,
    deleteEdgeCount: Array.isArray(normalizedPatch.delete_edge_ids) ? normalizedPatch.delete_edge_ids.length : 0,
    upsertEventCount: Array.isArray(normalizedPatch.upsert_events) ? normalizedPatch.upsert_events.length : 0,
    appendEventEffectCount: Array.isArray(normalizedPatch.append_event_effects) ? normalizedPatch.append_event_effects.length : 0,
  }
  const isEmptyPatch = patchSummary.upsertRelationTypeCount === 0
    && patchSummary.deleteRelationTypeCount === 0
    && patchSummary.upsertNodeCount === 0
    && patchSummary.deleteNodeCount === 0
    && patchSummary.upsertEdgeCount === 0
    && patchSummary.deleteEdgeCount === 0
    && patchSummary.upsertEventCount === 0
    && patchSummary.appendEventEffectCount === 0
  void isEmptyPatch
  return {
    world_graph_patch: normalizedPatch,
    usage: response.usage,
  }
}

export async function runGraphRagExtract({ modelClient, modelSettings, request }) {
  const prompts = getPromptConfig()
  const response = await modelClient.invokeText(
    modelSettings,
    prompts.templates.graphrag.extract_system_instruction,
    buildGraphRagExtractPrompt(request),
  )
  return {
    graphrag_graph: normalizeGraphRagGraphPayload(parseJsonObject(response.text, {})),
    usage: response.usage,
  }
}

export async function runGraphRagRetrieve({ modelClient, modelSettings, request }) {
  const prompts = getPromptConfig()
  const response = await modelClient.invokeText(
    modelSettings,
    prompts.templates.graphrag.retrieve_system_instruction,
    buildGraphRagRetrievePrompt(request),
  )
  return {
    graphrag_retrieval: normalizeGraphRagRetrievePayload(parseJsonObject(response.text, {})),
    usage: response.usage,
  }
}

export async function runGraphRagWriteback({ modelClient, modelSettings, request }) {
  const prompts = getPromptConfig()
  const startedAt = Date.now()
  graphWritebackLog('[agent:graphrag-writeback:start]', {
    sessionId: String(request?.session_id || request?.sessionId || ''),
    promptLength: String(request?.prompt || '').trim().length,
    finalResponseLength: String(request?.final_response || request?.finalResponse || '').trim().length,
  })
  const response = await modelClient.invokeText(
    modelSettings,
    prompts.templates.graphrag.writeback_system_instruction,
    buildGraphRagWritebackPrompt(request),
  )
  const graphragWriteback = normalizeGraphRagWritebackPayload(parseJsonObject(response.text, {}))
  graphWritebackLog('[agent:graphrag-writeback:done]', {
    sessionId: String(request?.session_id || request?.sessionId || ''),
    durationMs: Date.now() - startedAt,
    responseLength: String(response?.text || '').length,
    usage: response.usage,
    graphrag_writeback: graphragWriteback,
    rawResponseText: response?.text || '',
  })
  return {
    graphrag_writeback: graphragWriteback,
    usage: response.usage,
  }
}
