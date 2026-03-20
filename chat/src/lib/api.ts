import type {
  AIModelConfigItem,
  AIRobotCard,
  CapabilitiesResponse,
  DeleteSessionResponse,
  SessionResponse,
  SessionsResponse,
  SessionMemoryState,
  SessionRobotState,
  ModelCapabilities,
  ModelConfigsResponse,
  ModelOption,
  ModelsResponse,
  RobotsResponse,
  TestConnectionResponse,
} from '@/types/ai'

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init)
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed with status ${response.status}`)
  }

  return response.json() as Promise<T>
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
  modelConfigId?: string
  modelLabel?: string
  memory?: Partial<SessionMemoryState>
}) {
  return requestJson<SessionResponse>('/api/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(session),
  })
}

export function updateSessionMemory(sessionId: string, memory: Partial<SessionMemoryState>) {
  return requestJson<SessionResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/memory`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(memory),
  })
}

export function clearSessionMemory(sessionId: string) {
  return requestJson<SessionResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/memory`, {
    method: 'DELETE',
  })
}
