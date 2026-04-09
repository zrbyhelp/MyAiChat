import type {
  AIModelConfigItem,
  AIRobotCard,
  CapabilitiesResponse,
  DeleteSessionResponse,
  SessionResponse,
  SessionBackgroundStatusResponse,
  SessionsResponse,
  MemorySchemaState,
  ReplyMode,
  SessionMemoryState,
  SessionRobotState,
  ModelCapabilities,
  ModelConfigsResponse,
  ModelOption,
  ModelsResponse,
  RobotWorldGraph,
  RobotWorldGraphMeta,
  RobotWorldRelationType,
  RobotGenerationTaskResponse,
  RobotKnowledgeDocumentResponse,
  RobotKnowledgeDocumentsResponse,
  RobotGenerationExtractionDetail,
  RobotsResponse,
  TestConnectionResponse,
  WorldEdge,
  WorldNode,
  WorldTimelineEffect,
} from '@/types/ai'
import { UnauthorizedError, createAuthorizedHeaders, handleUnauthorized, isSignedInNow, waitForAuthReady } from '@/lib/auth'

async function requestWithAuth(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))
  const requestInit = async () => ({
    ...init,
    headers: await createAuthorizedHeaders(init?.headers),
  })

  let response = await fetch(input, await requestInit())
  if (response.status === 401) {
    await waitForAuthReady()
    if (isSignedInNow()) {
      await sleep(800)
      response = await fetch(input, await requestInit())
    }
  }
  if (response.status === 401) {
    handleUnauthorized()
    throw new UnauthorizedError()
  }
  return response
}

async function parseErrorMessage(response: Response) {
  let message = await response.text()
  try {
    const payload = JSON.parse(message) as { message?: string }
    message = payload.message || message
  } catch {
    // 回退到原始响应文本
  }
  return message || `Request failed with status ${response.status}`
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await requestWithAuth(input, init)
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response))
  }

  return response.json() as Promise<T>
}

function resolveUploadImageEndpoint() {
  const baseUrl = String(import.meta.env.VITE_UPLOAD_BASE_URL || '').trim().replace(/\/+$/, '')
  if (baseUrl) {
    return `${baseUrl}/api/upload/image`
  }
  return `${window.location.protocol}//${window.location.hostname}:3001/api/upload/image`
}

export interface UploadImageResponse {
  bucket: string
  objectKey: string
  contentType: string
  size: number
  etag: string
  url: string
}

export async function uploadImageFile(file: File) {
  const formData = new FormData()
  formData.append('file', file)

  const response = await requestWithAuth(resolveUploadImageEndpoint(), {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response))
  }

  const payload = (await response.json()) as UploadImageResponse
  if (!payload?.url) {
    throw new Error('上传成功但未返回图片 URL')
  }
  return payload
}

export function getModelConfigs() {
  return requestJson<ModelConfigsResponse>('/api/model-configs')
}

export function saveModelConfigs(configs: AIModelConfigItem[], activeModelConfigId: string) {
  return requestJson<ModelConfigsResponse>('/api/model-configs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ configs, activeModelConfigId }),
  })
}

export function testModelConnection(config: AIModelConfigItem) {
  return requestJson<TestConnectionResponse>('/api/model-configs/test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  })
}

export function getRobots() {
  return requestJson<RobotsResponse>('/api/robots')
}

export function saveRobots(robots: AIRobotCard[]) {
  return requestJson<RobotsResponse>('/api/robots', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ robots }),
  })
}

export function listRobotKnowledgeDocuments(robotId: string) {
  return requestJson<RobotKnowledgeDocumentsResponse>(`/api/robots/${encodeURIComponent(robotId)}/knowledge-documents`)
}

export async function uploadRobotKnowledgeDocument(
  robotId: string,
  file: File,
  embeddingModelConfigId = '',
) {
  const formData = new FormData()
  formData.append('file', file)
  if (embeddingModelConfigId) {
    formData.append('embeddingModelConfigId', embeddingModelConfigId)
  }

  const response = await requestWithAuth(`/api/robots/${encodeURIComponent(robotId)}/knowledge-documents`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response))
  }

  return response.json() as Promise<RobotKnowledgeDocumentResponse>
}

export async function createRobotGenerationTask(
  file: File,
  guidance: string,
  modelConfigId = '',
  embeddingModelConfigId = '',
  extractionDetail?: Partial<RobotGenerationExtractionDetail>,
) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('guidance', guidance)
  if (modelConfigId) {
    formData.append('modelConfigId', modelConfigId)
  }
  if (embeddingModelConfigId) {
    formData.append('embeddingModelConfigId', embeddingModelConfigId)
  }
  if (extractionDetail) {
    const entries: Array<[string, number | undefined]> = [
      ['targetSegmentChars', extractionDetail.targetSegmentChars],
      ['maxEntitiesPerSegment', extractionDetail.maxEntitiesPerSegment],
      ['maxRelationsPerSegment', extractionDetail.maxRelationsPerSegment],
      ['maxEventsPerSegment', extractionDetail.maxEventsPerSegment],
      ['entityImportanceThreshold', extractionDetail.entityImportanceThreshold],
      ['relationImportanceThreshold', extractionDetail.relationImportanceThreshold],
      ['eventImportanceThreshold', extractionDetail.eventImportanceThreshold],
    ]
    for (const [key, value] of entries) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        formData.append(key, String(value))
      }
    }
  }

  const response = await requestWithAuth('/api/robots/generation-tasks', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response))
  }

  return response.json() as Promise<RobotGenerationTaskResponse>
}

export function getRobotGenerationTask(taskId: string) {
  return requestJson<RobotGenerationTaskResponse>(`/api/robots/generation-tasks/${encodeURIComponent(taskId)}`)
}

export function cancelRobotGenerationTask(taskId: string) {
  return requestJson<RobotGenerationTaskResponse>(`/api/robots/generation-tasks/${encodeURIComponent(taskId)}`, {
    method: 'DELETE',
  })
}

export async function getModels(provider: string, baseUrl: string, apiKey: string) {
  const search = new URLSearchParams({
    provider,
    baseUrl,
  })

  if (apiKey) {
    search.set('apiKey', apiKey)
  }

  const data = await requestJson<ModelsResponse>(`/api/models?${search.toString()}`)
  return data.models as ModelOption[]
}

export async function getCapabilities(provider: string, model: string) {
  const search = new URLSearchParams({
    provider,
    model,
  })

  const data = await requestJson<CapabilitiesResponse>(`/api/capabilities?${search.toString()}`)
  return data.capabilities as ModelCapabilities
}

export function getSessions() {
  return requestJson<SessionsResponse>('/api/sessions')
}

export function getSession(sessionId: string) {
  return requestJson<SessionResponse>(`/api/sessions/${encodeURIComponent(sessionId)}`)
}

export function getSessionBackgroundStatus(sessionId: string) {
  return requestJson<SessionBackgroundStatusResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/background-status`)
}

export function deleteSession(sessionId: string) {
  const encodedSessionId = encodeURIComponent(sessionId)
  return requestJson<DeleteSessionResponse>(`/api/sessions/${encodedSessionId}`, {
    method: 'DELETE',
  }).catch(() =>
    requestJson<DeleteSessionResponse>(`/api/sessions/${encodedSessionId}/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: '{}',
    }))
}

export function upsertSession(session: {
  id?: string
  title?: string
  robot?: SessionRobotState
  memory?: SessionMemoryState
  storyOutline?: import('@/types/ai').StoryOutlineState
  modelConfigId?: string
  modelLabel?: string
  replyMode?: ReplyMode
  memorySchema?: MemorySchemaState
  worldGraph?: RobotWorldGraph | null
  persistToServer?: boolean
}) {
  return requestJson<SessionResponse>('/api/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(session),
  })
}

export function getRobotWorldGraph(robotId: string) {
  return requestJson<RobotWorldGraph>(`/api/robots/${encodeURIComponent(robotId)}/world-graph`)
}

export function replaceRobotWorldGraph(robotId: string, graph: RobotWorldGraph) {
  return requestJson<RobotWorldGraph>(`/api/robots/${encodeURIComponent(robotId)}/world-graph`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(graph),
  })
}

export function updateRobotWorldGraphMeta(robotId: string, meta: Partial<RobotWorldGraphMeta>) {
  return requestJson<{ meta: RobotWorldGraphMeta }>(`/api/robots/${encodeURIComponent(robotId)}/world-graph/meta`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(meta),
  })
}

export function updateRobotWorldGraphLayout(
  robotId: string,
  layout: RobotWorldGraphMeta['layout'],
) {
  return requestJson<{ meta: RobotWorldGraphMeta }>(`/api/robots/${encodeURIComponent(robotId)}/world-graph/layout`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(layout),
  })
}

export function createRobotWorldRelationType(robotId: string, relationType: Partial<RobotWorldRelationType>) {
  return requestJson<{ relationType: RobotWorldRelationType }>(
    `/api/robots/${encodeURIComponent(robotId)}/world-graph/relation-types`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(relationType),
    },
  )
}

export function updateRobotWorldRelationType(
  robotId: string,
  typeId: string,
  relationType: Partial<RobotWorldRelationType>,
) {
  return requestJson<{ relationType: RobotWorldRelationType }>(
    `/api/robots/${encodeURIComponent(robotId)}/world-graph/relation-types/${encodeURIComponent(typeId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(relationType),
    },
  )
}

export function deleteRobotWorldRelationType(robotId: string, typeId: string) {
  return requestJson<{ deletedTypeId: string }>(
    `/api/robots/${encodeURIComponent(robotId)}/world-graph/relation-types/${encodeURIComponent(typeId)}`,
    {
      method: 'DELETE',
    },
  )
}

export function createRobotWorldNode(robotId: string, node: Partial<WorldNode>) {
  return requestJson<{ node: WorldNode }>(`/api/robots/${encodeURIComponent(robotId)}/world-graph/nodes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(node),
  })
}

export function updateRobotWorldNode(robotId: string, nodeId: string, node: Partial<WorldNode>) {
  return requestJson<{ node: WorldNode }>(
    `/api/robots/${encodeURIComponent(robotId)}/world-graph/nodes/${encodeURIComponent(nodeId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(node),
    },
  )
}

export function deleteRobotWorldNode(robotId: string, nodeId: string) {
  return requestJson<{ deletedNodeId: string }>(
    `/api/robots/${encodeURIComponent(robotId)}/world-graph/nodes/${encodeURIComponent(nodeId)}`,
    {
      method: 'DELETE',
    },
  )
}

export function createRobotWorldEdge(robotId: string, edge: Partial<WorldEdge>) {
  return requestJson<{ edge: WorldEdge }>(`/api/robots/${encodeURIComponent(robotId)}/world-graph/edges`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(edge),
  })
}

export function updateRobotWorldEdge(robotId: string, edgeId: string, edge: Partial<WorldEdge>) {
  return requestJson<{ edge: WorldEdge }>(
    `/api/robots/${encodeURIComponent(robotId)}/world-graph/edges/${encodeURIComponent(edgeId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(edge),
    },
  )
}

export function deleteRobotWorldEdge(robotId: string, edgeId: string) {
  return requestJson<{ deletedEdgeId: string }>(
    `/api/robots/${encodeURIComponent(robotId)}/world-graph/edges/${encodeURIComponent(edgeId)}`,
    {
      method: 'DELETE',
    },
  )
}

export function updateRobotTimelineOrder(robotId: string, eventIds: string[]) {
  return requestJson<{ events: WorldNode[] }>(
    `/api/robots/${encodeURIComponent(robotId)}/world-graph/timeline/order`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ eventIds }),
    },
  )
}

export function createRobotTimelineEffect(
  robotId: string,
  eventId: string,
  effect: Partial<WorldTimelineEffect>,
) {
  return requestJson<{ event: WorldNode }>(
    `/api/robots/${encodeURIComponent(robotId)}/world-graph/timeline/events/${encodeURIComponent(eventId)}/effects`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(effect),
    },
  )
}

export function updateRobotTimelineEffect(
  robotId: string,
  effectId: string,
  effect: Partial<WorldTimelineEffect>,
) {
  return requestJson<{ event: WorldNode }>(
    `/api/robots/${encodeURIComponent(robotId)}/world-graph/timeline/effects/${encodeURIComponent(effectId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(effect),
    },
  )
}

export function deleteRobotTimelineEffect(robotId: string, effectId: string) {
  return requestJson<{ deletedEffectId: string; event: WorldNode }>(
    `/api/robots/${encodeURIComponent(robotId)}/world-graph/timeline/effects/${encodeURIComponent(effectId)}`,
    {
      method: 'DELETE',
    },
  )
}
