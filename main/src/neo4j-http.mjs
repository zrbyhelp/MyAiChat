function sanitizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function createBasicAuthHeader(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

function getNeo4jConfig() {
  const uri = sanitizeBaseUrl(process.env.NEO4J_URI || '')
  if (!uri) {
    throw new Error('未配置 NEO4J_URI')
  }
  if (!/^https?:\/\//i.test(uri)) {
    throw new Error('NEO4J_URI 需使用 http/https 协议以支持当前 HTTP 接入方式')
  }

  return {
    uri,
    username: String(process.env.NEO4J_USERNAME || 'neo4j'),
    password: String(process.env.NEO4J_PASSWORD || 'neo4j'),
    database: String(process.env.NEO4J_DATABASE || 'neo4j'),
  }
}

function buildCommitUrl(config) {
  return `${config.uri}/db/${encodeURIComponent(config.database)}/tx/commit`
}

function normalizeNeo4jValue(value) {
  if (value === null || value === undefined) {
    return null
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeNeo4jValue(item))
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeNeo4jValue(item)]),
    )
  }
  return value
}

export async function runNeo4jStatements(statements) {
  const config = getNeo4jConfig()
  const response = await fetch(buildCommitUrl(config), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: createBasicAuthHeader(config.username, config.password),
    },
    body: JSON.stringify({
      statements: statements.map((item) => ({
        statement: item.statement,
        parameters: normalizeNeo4jValue(item.parameters || {}),
      })),
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Neo4j 请求失败：${response.status}`)
  }

  const payload = await response.json()
  if (Array.isArray(payload?.errors) && payload.errors.length) {
    const firstError = payload.errors[0]
    throw new Error(String(firstError?.message || 'Neo4j 查询失败'))
  }

  return payload?.results || []
}

export async function runNeo4jQuery(statement, parameters = {}) {
  const [result] = await runNeo4jStatements([{ statement, parameters }])
  return result || { columns: [], data: [] }
}

export function mapNeo4jRows(result) {
  const columns = Array.isArray(result?.columns) ? result.columns : []
  const rows = Array.isArray(result?.data) ? result.data : []
  return rows.map((item) => {
    const values = Array.isArray(item?.row) ? item.row : []
    return Object.fromEntries(columns.map((column, index) => [column, values[index]]))
  })
}
