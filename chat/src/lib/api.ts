import type {
  AIModelConfigItem,
  AIRobotCard,
  CapabilitiesResponse,
  DeleteSessionResponse,
  SessionResponse,
  SessionsResponse,
  MemorySchemaState,
  SessionMemoryState,
  SessionRobotState,
  ModelCapabilities,
  ModelConfigsResponse,
  ModelOption,
  ModelsResponse,
  RobotsResponse,
  TestConnectionResponse,
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
  modelConfigId?: string
  modelLabel?: string
  memorySchema?: MemorySchemaState
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
