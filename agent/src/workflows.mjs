import { Annotation, END, START, StateGraph } from '@langchain/langgraph'

import {
  addUsage,
  answerNode,
  buildMemorySchemaPrompt,
  buildRobotGenerationContext,
  buildWorldGraphEvolutionPrompt,
  ensureGeneratedRobotPayload,
  formatStageError,
  numericAgentNode,
  storyOutlineNode,
} from './runtime.mjs'
import {
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
      .addNode('numeric', async ({ context }) => {
        try {
          const payload = await numericAgentNode(context, modelClient)
          const nextContext = {
            ...context,
            numeric_state: payload.numeric_state,
            usage: addUsage(context.usage, payload.usage),
          }
          await context.event_sink?.({ type: 'numeric_state_updated', state: nextContext.numeric_state || {} })
          return { context: nextContext }
        } catch (error) {
          throw new Error(formatStageError(context.request, '数值计算阶段', error))
        }
      })
      .addNode('outline', async ({ context }) => {
        try {
          await context.event_sink?.({ type: 'story_outline_started' })
          const payload = await storyOutlineNode(context, modelClient)
          const nextContext = {
            ...context,
            story_outline: payload.story_outline,
            usage: addUsage(context.usage, payload.usage),
          }
          await context.event_sink?.({
            type: 'story_outline_completed',
            story_outline: nextContext.story_outline || '',
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
            numeric_state: nextContext.numeric_state || {},
          })
          return { context: nextContext }
        } catch (error) {
          throw new Error(formatStageError(context.request, '主回复阶段', error))
        }
      })
      .addEdge(START, 'numeric')
      .addEdge('numeric', 'outline')
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
  return {
    world_graph_patch: normalizeGeneratedWorldGraphPatchPayload(response.data),
    usage: response.usage,
  }
}
