function sanitizeBaseUrl(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/+$/, '')
}

function getQdrantBaseUrl() {
  return sanitizeBaseUrl(process.env.QDRANT_URL || 'http://127.0.0.1:6333')
}

function getQdrantHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  }
  const apiKey = String(process.env.QDRANT_API_KEY || '').trim()
  if (apiKey) {
    headers['api-key'] = apiKey
  }
  return headers
}

function encodeCollectionSegment(value) {
  return encodeURIComponent(String(value || '').trim())
}

function safeCollectionToken(value, fallback) {
  const token = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return token || fallback
}

export function resolveKnowledgeCollectionName(provider, model) {
  const prefix = String(process.env.QDRANT_COLLECTION_PREFIX || 'robot_knowledge').trim() || 'robot_knowledge'
  return `${safeCollectionToken(prefix, 'robot_knowledge')}_${safeCollectionToken(provider, 'openai')}_${safeCollectionToken(model, 'embeddings')}`
}

async function requestQdrant(path, init = {}) {
  const response = await fetch(`${getQdrantBaseUrl()}${path}`, {
    method: init.method || 'GET',
    headers: {
      ...getQdrantHeaders(),
      ...(init.headers || {}),
    },
    body: init.body,
  })

  if (!response.ok) {
    throw new Error((await response.text()) || `Qdrant 请求失败：${path}`)
  }

  if (response.status === 204) {
    return null
  }

  return response.json()
}

export async function ensureKnowledgeCollection(collectionName, vectorSize) {
  const normalizedSize = Number(vectorSize || 0)
  if (!Number.isInteger(normalizedSize) || normalizedSize <= 0) {
    throw new Error('向量维度无效，无法初始化 Qdrant collection')
  }

  try {
    await requestQdrant(`/collections/${encodeCollectionSegment(collectionName)}`)
    return
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (!/404|Not found|doesn't exist/i.test(message)) {
      throw error
    }
  }

  await requestQdrant(`/collections/${encodeCollectionSegment(collectionName)}`, {
    method: 'PUT',
    body: JSON.stringify({
      vectors: {
        size: normalizedSize,
        distance: String(process.env.QDRANT_DISTANCE || 'Cosine'),
      },
    }),
  })
}

export async function upsertKnowledgeVectors(collectionName, points, vectorSize) {
  const items = Array.isArray(points) ? points.filter((item) => item?.id && Array.isArray(item?.vector)) : []
  if (!items.length) {
    return
  }
  await ensureKnowledgeCollection(collectionName, vectorSize)
  await requestQdrant(`/collections/${encodeCollectionSegment(collectionName)}/points?wait=true`, {
    method: 'PUT',
    body: JSON.stringify({ points: items }),
  })
}

export async function searchKnowledgeVectors(collectionName, vector, filter, limit = 6) {
  const queryVector = Array.isArray(vector) ? vector : []
  if (!queryVector.length) {
    return []
  }

  const response = await requestQdrant(`/collections/${encodeCollectionSegment(collectionName)}/points/search`, {
    method: 'POST',
    body: JSON.stringify({
      vector: queryVector,
      filter,
      limit: Math.max(1, Math.min(20, Math.round(Number(limit || 0) || 6))),
      with_payload: true,
      with_vector: false,
    }),
  })

  return Array.isArray(response?.result) ? response.result : []
}

function buildModelHeaders(config) {
  const headers = {
    'Content-Type': 'application/json',
  }
  if (String(config?.provider || 'openai') !== 'ollama' && config?.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`
  }
  return headers
}

function getOpenAICompatibleBaseUrl(baseUrl) {
  return sanitizeBaseUrl(baseUrl).replace(/\/v1$/i, '')
}

function getOllamaBaseUrl(baseUrl) {
  return sanitizeBaseUrl(baseUrl).replace(/\/v1$/i, '')
}

async function requestOpenAICompatibleEmbeddings(config, input) {
  const response = await fetch(`${getOpenAICompatibleBaseUrl(config.baseUrl)}/v1/embeddings`, {
    method: 'POST',
    headers: buildModelHeaders(config),
    body: JSON.stringify({
      model: config.model,
      input,
    }),
  })

  if (!response.ok) {
    throw new Error((await response.text()) || 'Embeddings 请求失败')
  }

  const payload = await response.json()
  return Array.isArray(payload?.data) ? payload.data.map((item) => item?.embedding).filter(Array.isArray) : []
}

async function requestOllamaEmbeddings(config, input) {
  const baseUrl = getOllamaBaseUrl(config.baseUrl)
  const requestBody = {
    model: config.model,
    input,
  }

  const tryEndpoints = ['/api/embed', '/api/embeddings']

  let lastError = null
  for (const endpoint of tryEndpoints) {
    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: buildModelHeaders(config),
        body: JSON.stringify(requestBody),
      })
      if (!response.ok) {
        throw new Error((await response.text()) || `Ollama embeddings 请求失败：${endpoint}`)
      }
      const payload = await response.json()
      if (Array.isArray(payload?.embeddings)) {
        return payload.embeddings
      }
      if (Array.isArray(payload?.data)) {
        return payload.data.map((item) => item?.embedding).filter(Array.isArray)
      }
      if (Array.isArray(payload?.embedding)) {
        return [payload.embedding]
      }
      throw new Error(`Ollama embeddings 返回格式无效：${endpoint}`)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Ollama embeddings 请求失败')
}

export async function createEmbeddings(config, input) {
  const normalizedInput = Array.isArray(input) ? input : [input]
  if (!normalizedInput.length) {
    return []
  }
  if (!config?.model) {
    throw new Error('缺少 embedding model，无法生成向量')
  }
  return String(config.provider || 'openai') === 'ollama'
    ? requestOllamaEmbeddings(config, normalizedInput)
    : requestOpenAICompatibleEmbeddings(config, normalizedInput)
}
