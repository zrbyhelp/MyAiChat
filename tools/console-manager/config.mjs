import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { getManagerPaths } from './state.mjs'

const { repoRoot } = getManagerPaths()

const envFiles = {
  root: join(repoRoot, '.env'),
  main: join(repoRoot, 'main', '.env'),
  chat: join(repoRoot, 'chat', '.env'),
  upload: join(repoRoot, 'upload', '.env'),
  admin: join(repoRoot, 'admin', '.env'),
}

const envExamples = {
  root: join(repoRoot, '.env.example'),
  main: join(repoRoot, 'main', '.env.example'),
  chat: join(repoRoot, 'chat', '.env.example'),
  upload: join(repoRoot, 'upload', '.env.example'),
  admin: join(repoRoot, 'admin', '.env.example'),
}

const variableTargets = {
  CLERK_SECRET_KEY: ['root', 'main', 'upload'],
  CLERK_PUBLISHABLE_KEY: ['root', 'main', 'upload'],
  VITE_CLERK_PUBLISHABLE_KEY: ['root', 'chat', 'upload'],
  STORAGE_DRIVER: ['main'],
  DB_HOST: ['root', 'main'],
  DB_PORT: ['root', 'main'],
  DB_NAME: ['root', 'main'],
  DB_USER: ['root', 'main'],
  DB_PASSWORD: ['root', 'main'],
  DB_LOGGING: ['main'],
  AGENT_SERVICE_URL: ['root', 'main'],
  AGENT_STORAGE_DRIVER: ['root'],
  AGENT_FILE_STORE_DIR: ['root'],
  PORT: ['root', 'main'],
  CHAT_PORT: ['root'],
  ADMIN_PORT: ['root', 'admin'],
  ADMIN_API_BASE_URL: ['root', 'main'],
  VITE_ADMIN_API_BASE_URL: ['root', 'admin'],
  UPLOAD_PORT: ['root', 'upload'],
  VITE_UPLOAD_BASE_URL: ['chat'],
  JWT_SECRET: ['root', 'main'],
  JWT_ALGO: ['root', 'main'],
  LOG_LEVEL: ['root', 'main'],
  LOG_MAX_DAYS: ['root', 'main'],
  AGENDA_DB_COLLECTION: ['root', 'main'],
  AGENDA_POOL_TIME: ['root', 'main'],
  AGENDA_CONCURRENCY: ['root', 'main'],
  API_BODY_LIMIT: ['root', 'main'],
  DB_SYNC_ALTER: ['root', 'main'],
  MINIO_ENDPOINT: ['root', 'upload'],
  MINIO_PORT: ['root', 'upload'],
  MINIO_USE_SSL: ['root', 'upload'],
  MINIO_ACCESS_KEY: ['root', 'upload'],
  MINIO_SECRET_KEY: ['root', 'upload'],
  MINIO_BUCKET: ['root', 'upload'],
  MINIO_PUBLIC_BASE_URL: ['root', 'upload'],
  MINIO_PUBLIC_READ: ['root', 'upload'],
  UPLOAD_MAX_FILE_SIZE_MB: ['root', 'upload'],
}

export const configGroups = [
  {
    id: 'auth',
    label: '鉴权配置',
    description: 'Clerk 登录相关配置',
    fields: [
      { key: 'CLERK_SECRET_KEY', label: 'Clerk 服务端密钥', sensitive: true },
      { key: 'CLERK_PUBLISHABLE_KEY', label: 'Clerk 公钥' },
      { key: 'VITE_CLERK_PUBLISHABLE_KEY', label: '前端 Clerk 公钥' },
    ],
  },
  {
    id: 'frontend',
    label: '前端配置',
    description: '前端与管理后台端口配置',
    fields: [
      { key: 'CHAT_PORT', label: 'Docker 前端端口' },
      { key: 'ADMIN_PORT', label: '管理后台前端端口' },
      { key: 'VITE_ADMIN_API_BASE_URL', label: '管理后台 API 地址' },
      { key: 'VITE_UPLOAD_BASE_URL', label: '上传服务基地址' },
    ],
  },
  {
    id: 'adminApi',
    label: '后台接口配置',
    description: 'main 内集成的后台接口与鉴权参数',
    fields: [
      { key: 'ADMIN_API_BASE_URL', label: '后台接口基地址' },
      { key: 'JWT_SECRET', label: '后台接口 JWT 密钥', sensitive: true },
      { key: 'JWT_ALGO', label: '后台接口 JWT 算法' },
      { key: 'API_BODY_LIMIT', label: '后台接口请求体限制' },
      { key: 'DB_SYNC_ALTER', label: '后台接口数据库 alter 开关' },
    ],
  },
  {
    id: 'gateway',
    label: '网关配置',
    description: '主服务端口与 agent 接入',
    fields: [
      { key: 'PORT', label: '网关端口' },
      { key: 'AGENT_SERVICE_URL', label: 'agent 服务地址' },
      { key: 'STORAGE_DRIVER', label: '网关存储驱动' },
    ],
  },
  {
    id: 'agent',
    label: '智能体配置',
    description: 'agent 本地存储相关参数',
    fields: [
      { key: 'AGENT_STORAGE_DRIVER', label: 'agent 存储驱动' },
      { key: 'AGENT_FILE_STORE_DIR', label: 'agent 文件存储目录' },
    ],
  },
  {
    id: 'database',
    label: '数据库配置',
    description: 'chat 主业务使用的 MySQL 连接参数',
    fields: [
      { key: 'DB_HOST', label: '数据库主机' },
      { key: 'DB_PORT', label: '数据库端口' },
      { key: 'DB_NAME', label: '数据库名' },
      { key: 'DB_USER', label: '数据库用户' },
      { key: 'DB_PASSWORD', label: '数据库密码', sensitive: true },
      { key: 'DB_LOGGING', label: '数据库日志开关' },
    ],
  },
  {
    id: 'upload',
    label: '上传配置',
    description: '上传服务端口与大小限制',
    fields: [
      { key: 'UPLOAD_PORT', label: '上传服务端口' },
      { key: 'UPLOAD_MAX_FILE_SIZE_MB', label: '上传大小限制(MB)' },
    ],
  },
  {
    id: 'adminApiAdvanced',
    label: '后台接口高级配置',
    description: '日志与任务调度参数',
    fields: [
      { key: 'LOG_LEVEL', label: '日志级别' },
      { key: 'LOG_MAX_DAYS', label: '日志保留天数' },
      { key: 'AGENDA_DB_COLLECTION', label: 'Agenda 集合名' },
      { key: 'AGENDA_POOL_TIME', label: 'Agenda 轮询间隔(ms)' },
      { key: 'AGENDA_CONCURRENCY', label: 'Agenda 并发数' },
    ],
  },
  {
    id: 'minio',
    label: '对象存储配置',
    description: 'MinIO 访问参数',
    fields: [
      { key: 'MINIO_ENDPOINT', label: 'MinIO 主机' },
      { key: 'MINIO_PORT', label: 'MinIO 端口' },
      { key: 'MINIO_USE_SSL', label: '是否启用 SSL' },
      { key: 'MINIO_ACCESS_KEY', label: 'MinIO Access Key' },
      { key: 'MINIO_SECRET_KEY', label: 'MinIO Secret Key', sensitive: true },
      { key: 'MINIO_BUCKET', label: 'Bucket 名称' },
      { key: 'MINIO_PUBLIC_BASE_URL', label: '公开访问基地址' },
      { key: 'MINIO_PUBLIC_READ', label: '是否公开读' },
    ],
  },
]

export const configFieldDefinitions = [
  {
    key: 'CLERK_SECRET_KEY',
    label: 'Clerk 服务端密钥',
    description: '用于 main 和 upload 的 Clerk Secret Key',
    sensitive: true,
    category: 'required',
    validate: 'nonEmpty',
  },
  {
    key: 'CLERK_PUBLISHABLE_KEY',
    label: 'Clerk 公钥',
    description: '后端和上传服务共享的 Clerk Publishable Key',
    sensitive: false,
    category: 'required',
    validate: 'nonEmpty',
  },
  {
    key: 'VITE_CLERK_PUBLISHABLE_KEY',
    label: '前端 Clerk 公钥',
    description: 'chat 前端使用的 Vite Clerk Publishable Key',
    sensitive: false,
    category: 'required',
    validate: 'nonEmpty',
  },
  {
    key: 'PORT',
    label: '网关端口',
    description: 'main 服务监听端口',
    sensitive: false,
    category: 'required',
    validate: 'port',
  },
  {
    key: 'ADMIN_PORT',
    label: '管理后台前端端口',
    description: 'admin 本地与 Docker 对外端口',
    sensitive: false,
    category: 'required',
    validate: 'port',
  },
  {
    key: 'VITE_ADMIN_API_BASE_URL',
    label: '管理后台 API 地址',
    description: 'admin 开发代理指向的 main 地址',
    sensitive: false,
    category: 'required',
    validate: 'url',
  },
  {
    key: 'ADMIN_API_BASE_URL',
    label: '管理后台 API 根地址',
    description: 'main 暴露的后台接口地址',
    sensitive: false,
    category: 'optional',
    validate: 'urlOrEmpty',
  },
  {
    key: 'AGENT_SERVICE_URL',
    label: 'Agent 服务地址',
    description: 'main 调用 agent 的地址',
    sensitive: false,
    category: 'required',
    validate: 'url',
  },
  {
    key: 'STORAGE_DRIVER',
    label: '网关存储驱动',
    description: '可选 file 或 mysql',
    sensitive: false,
    category: 'required',
    validate: 'storageDriver',
  },
  {
    key: 'DB_HOST',
    label: '数据库主机',
    description: 'MySQL 地址',
    sensitive: false,
    category: 'required',
    validate: 'nonEmpty',
  },
  {
    key: 'DB_PORT',
    label: '数据库端口',
    description: 'MySQL 端口',
    sensitive: false,
    category: 'required',
    validate: 'port',
  },
  {
    key: 'DB_NAME',
    label: '数据库名称',
    description: 'MySQL 数据库名',
    sensitive: false,
    category: 'required',
    validate: 'nonEmpty',
  },
  {
    key: 'DB_USER',
    label: '数据库用户',
    description: 'MySQL 用户名',
    sensitive: false,
    category: 'required',
    validate: 'nonEmpty',
  },
  {
    key: 'DB_PASSWORD',
    label: '数据库密码',
    description: 'MySQL 密码',
    sensitive: true,
    category: 'required',
    validate: 'nonEmpty',
  },
  {
    key: 'UPLOAD_PORT',
    label: '上传服务端口',
    description: 'upload 服务监听端口',
    sensitive: false,
    category: 'required',
    validate: 'port',
  },
  {
    key: 'JWT_SECRET',
    label: '后台接口 JWT 密钥',
    description: 'main 内后台接口的 JWT Secret',
    sensitive: true,
    category: 'required',
    validate: 'nonEmpty',
  },
  {
    key: 'JWT_ALGO',
    label: '后台接口 JWT 算法',
    description: 'main 内后台接口的 JWT 算法',
    sensitive: false,
    category: 'optional',
    validate: 'nonEmpty',
  },
  {
    key: 'LOG_LEVEL',
    label: '后台接口日志级别',
    description: 'main 内后台接口日志输出级别',
    sensitive: false,
    category: 'optional',
    validate: 'nonEmpty',
  },
  {
    key: 'LOG_MAX_DAYS',
    label: '后台接口日志保留天数',
    description: '可留空或填写正整数',
    sensitive: false,
    category: 'optional',
    validate: 'positiveIntegerOrEmpty',
  },
  {
    key: 'AGENDA_DB_COLLECTION',
    label: 'Agenda 集合名',
    description: '后台任务集合名称',
    sensitive: false,
    category: 'optional',
    validate: 'nonEmpty',
  },
  {
    key: 'AGENDA_POOL_TIME',
    label: 'Agenda 轮询间隔',
    description: '可留空或填写正整数毫秒值',
    sensitive: false,
    category: 'optional',
    validate: 'positiveIntegerOrEmpty',
  },
  {
    key: 'AGENDA_CONCURRENCY',
    label: 'Agenda 并发数',
    description: '可留空或填写正整数',
    sensitive: false,
    category: 'optional',
    validate: 'positiveIntegerOrEmpty',
  },
  {
    key: 'API_BODY_LIMIT',
    label: '后台接口请求体限制',
    description: '如 20mb',
    sensitive: false,
    category: 'optional',
    validate: 'nonEmpty',
  },
  {
    key: 'DB_SYNC_ALTER',
    label: '后台接口数据库 alter 开关',
    description: '填写 true 或 false',
    sensitive: false,
    category: 'optional',
    validate: 'booleanOrEmpty',
  },
  {
    key: 'MINIO_ENDPOINT',
    label: 'MinIO 主机',
    description: '对象存储地址',
    sensitive: false,
    category: 'required',
    validate: 'nonEmpty',
  },
  {
    key: 'MINIO_PORT',
    label: 'MinIO 端口',
    description: '对象存储端口',
    sensitive: false,
    category: 'required',
    validate: 'port',
  },
  {
    key: 'MINIO_ACCESS_KEY',
    label: 'MinIO Access Key',
    description: '对象存储访问账号',
    sensitive: false,
    category: 'required',
    validate: 'nonEmpty',
  },
  {
    key: 'MINIO_SECRET_KEY',
    label: 'MinIO Secret Key',
    description: '对象存储访问密钥',
    sensitive: true,
    category: 'required',
    validate: 'nonEmpty',
  },
  {
    key: 'MINIO_BUCKET',
    label: 'MinIO Bucket',
    description: '上传使用的桶名称',
    sensitive: false,
    category: 'required',
    validate: 'nonEmpty',
  },
  {
    key: 'CHAT_PORT',
    label: 'Docker 前端端口',
    description: 'Docker 模式下 chat 对外端口',
    sensitive: false,
    category: 'optional',
    validate: 'portOrEmpty',
  },
  {
    key: 'VITE_UPLOAD_BASE_URL',
    label: '前端上传基地址',
    description: 'chat 直接访问 upload 的地址，可留空',
    sensitive: false,
    category: 'optional',
    validate: 'urlOrEmpty',
  },
  {
    key: 'AGENT_STORAGE_DRIVER',
    label: 'Agent 存储驱动',
    description: '可选 file 或 mysql',
    sensitive: false,
    category: 'optional',
    validate: 'storageDriverOrEmpty',
  },
  {
    key: 'AGENT_FILE_STORE_DIR',
    label: 'Agent 文件存储目录',
    description: 'file 模式下 agent 本地目录，可留空',
    sensitive: false,
    category: 'optional',
    validate: 'any',
  },
  {
    key: 'DB_LOGGING',
    label: '数据库日志开关',
    description: '建议填写 true 或 false',
    sensitive: false,
    category: 'optional',
    validate: 'booleanOrEmpty',
  },
  {
    key: 'MINIO_USE_SSL',
    label: 'MinIO 是否启用 SSL',
    description: '填写 true 或 false',
    sensitive: false,
    category: 'optional',
    validate: 'booleanOrEmpty',
  },
  {
    key: 'MINIO_PUBLIC_BASE_URL',
    label: 'MinIO 公网访问地址',
    description: '可留空',
    sensitive: false,
    category: 'optional',
    validate: 'urlOrEmpty',
  },
  {
    key: 'MINIO_PUBLIC_READ',
    label: 'MinIO 是否公开读',
    description: '填写 true 或 false',
    sensitive: false,
    category: 'optional',
    validate: 'booleanOrEmpty',
  },
  {
    key: 'UPLOAD_MAX_FILE_SIZE_MB',
    label: '上传大小限制(MB)',
    description: '可留空或填写正整数',
    sensitive: false,
    category: 'optional',
    validate: 'positiveIntegerOrEmpty',
  },
]

function parseEnvFile(content) {
  const lines = content.split(/\r?\n/)
  return lines.map((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      return { type: 'raw', raw: line }
    }

    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) {
      return { type: 'raw', raw: line }
    }

    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1)
    return {
      type: 'pair',
      key,
      value,
    }
  })
}

function serializeValue(value) {
  return String(value ?? '').replace(/\r?\n/g, '\\n')
}

function readEnvEntries(fileKey) {
  const filePath = envFiles[fileKey]
  if (!existsSync(filePath)) {
    return []
  }
  return parseEnvFile(readFileSync(filePath, 'utf8'))
}

function writeEnvEntries(fileKey, entries) {
  const filePath = envFiles[fileKey]
  const text = `${entries.map((entry) => (entry.type === 'pair' ? `${entry.key}=${entry.value}` : entry.raw)).join('\n')}\n`
  writeFileSync(filePath, text)
}

function upsertValue(entries, key, value) {
  let updated = false
  const next = entries.map((entry) => {
    if (entry.type === 'pair' && entry.key === key) {
      updated = true
      return {
        ...entry,
        value: serializeValue(value),
      }
    }
    return entry
  })

  if (!updated) {
    next.push({ type: 'pair', key, value: serializeValue(value) })
  }

  return next
}

function findValue(entries, key) {
  return entries.find((entry) => entry.type === 'pair' && entry.key === key)?.value ?? ''
}

function readExampleValues() {
  const cache = Object.fromEntries(Object.keys(envExamples).map((fileKey) => [fileKey, parseEnvFile(readFileSync(envExamples[fileKey], 'utf8'))]))
  const values = {}
  for (const field of configFieldDefinitions) {
    values[field.key] = findValue(cache[getPrimaryFileKey(field.key)], field.key)
  }
  return values
}

function getPrimaryFileKey(key) {
  return variableTargets[key]?.[0] || 'root'
}

export function initializeEnvFiles() {
  const results = []
  for (const fileKey of Object.keys(envFiles)) {
    const target = envFiles[fileKey]
    const example = envExamples[fileKey]
    if (existsSync(target)) {
      results.push({ fileKey, created: false, path: target })
      continue
    }
    copyFileSync(example, target)
    results.push({ fileKey, created: true, path: target })
  }
  return results
}

export function readCurrentConfig() {
  const cache = Object.fromEntries(Object.keys(envFiles).map((fileKey) => [fileKey, readEnvEntries(fileKey)]))
  const values = {}
  for (const group of configGroups) {
    for (const field of group.fields) {
      if (field.key in values) {
        continue
      }
      values[field.key] = findValue(cache[getPrimaryFileKey(field.key)], field.key)
    }
  }
  return values
}

export function getConfigFieldDefinitions() {
  return configFieldDefinitions.map((field) => ({ ...field }))
}

export function getConfigWizardFields(category) {
  const currentValues = readCurrentConfig()
  const exampleValues = readExampleValues()
  return configFieldDefinitions
    .filter((field) => !category || field.category === category)
    .map((field) => ({
      ...field,
      currentValue: currentValues[field.key] ?? '',
      defaultValue: exampleValues[field.key] ?? '',
    }))
}

export function getConfigGroupsWithValues() {
  const values = readCurrentConfig()
  return configGroups.map((group) => ({
    ...group,
    fields: group.fields.map((field) => ({
      ...field,
      value: values[field.key] ?? '',
    })),
  }))
}

export function updateConfigGroup(groupId, updates) {
  const group = configGroups.find((item) => item.id === groupId)
  if (!group) {
    throw new Error(`未知配置分组：${groupId}`)
  }

  const touchedKeys = Object.keys(updates).filter((key) => group.fields.some((field) => field.key === key))
  const touchedFiles = new Set(touchedKeys.flatMap((key) => variableTargets[key] || ['root']))
  const cache = Object.fromEntries([...touchedFiles].map((fileKey) => [fileKey, readEnvEntries(fileKey)]))

  for (const key of touchedKeys) {
    for (const fileKey of variableTargets[key] || ['root']) {
      cache[fileKey] = upsertValue(cache[fileKey] || [], key, updates[key])
    }
  }

  for (const fileKey of touchedFiles) {
    writeEnvEntries(fileKey, cache[fileKey])
  }

  return getConfigGroupsWithValues().find((item) => item.id === groupId)
}

export function updateConfigValues(updates) {
  const touchedKeys = Object.keys(updates).filter(Boolean)
  const touchedFiles = new Set(touchedKeys.flatMap((key) => variableTargets[key] || ['root']))
  const cache = Object.fromEntries([...touchedFiles].map((fileKey) => [fileKey, readEnvEntries(fileKey)]))

  for (const key of touchedKeys) {
    for (const fileKey of variableTargets[key] || ['root']) {
      cache[fileKey] = upsertValue(cache[fileKey] || [], key, updates[key])
    }
  }

  for (const fileKey of touchedFiles) {
    writeEnvEntries(fileKey, cache[fileKey])
  }

  return {
    updatedKeys: touchedKeys,
    updatedFiles: [...touchedFiles].map((fileKey) => envFiles[fileKey]),
  }
}

function isValidUrl(value) {
  try {
    const url = new URL(value)
    return Boolean(url.protocol && url.host)
  } catch {
    return false
  }
}

function isValidPort(value) {
  const port = Number(value)
  return Number.isInteger(port) && port > 0 && port <= 65535
}

export function validateConfig() {
  const values = readCurrentConfig()
  const issues = []

  const requiredKeys = [
    'CLERK_SECRET_KEY',
    'CLERK_PUBLISHABLE_KEY',
    'VITE_CLERK_PUBLISHABLE_KEY',
    'AGENT_SERVICE_URL',
    'ADMIN_PORT',
    'VITE_ADMIN_API_BASE_URL',
    'JWT_SECRET',
  ]
  for (const key of requiredKeys) {
    if (!String(values[key] || '').trim()) {
      issues.push({ level: 'error', key, message: `${key} 不能为空` })
    }
  }

  for (const key of ['PORT', 'CHAT_PORT', 'ADMIN_PORT', 'UPLOAD_PORT', 'DB_PORT', 'MINIO_PORT']) {
    const value = values[key]
    if (value && !isValidPort(value)) {
      issues.push({ level: 'error', key, message: `${key} 必须是 1-65535 之间的端口号` })
    }
  }

  const localPorts = ['PORT', 'CHAT_PORT', 'UPLOAD_PORT', 'ADMIN_PORT']
    .map((key) => ({ key, value: String(values[key] || '').trim() }))
    .filter((item) => item.value)
  const duplicates = localPorts.filter(
    (item, index) => localPorts.findIndex((other) => other.value === item.value) !== index,
  )
  for (const item of duplicates) {
    issues.push({ level: 'warning', key: item.key, message: `${item.key} 与其他服务端口重复：${item.value}` })
  }

  if (values.AGENT_SERVICE_URL && !isValidUrl(values.AGENT_SERVICE_URL)) {
    issues.push({ level: 'error', key: 'AGENT_SERVICE_URL', message: 'AGENT_SERVICE_URL 不是合法 URL' })
  }

  if (values.VITE_UPLOAD_BASE_URL && !isValidUrl(values.VITE_UPLOAD_BASE_URL)) {
    issues.push({ level: 'error', key: 'VITE_UPLOAD_BASE_URL', message: 'VITE_UPLOAD_BASE_URL 不是合法 URL' })
  }

  if (values.VITE_ADMIN_API_BASE_URL && !isValidUrl(values.VITE_ADMIN_API_BASE_URL)) {
    issues.push({ level: 'error', key: 'VITE_ADMIN_API_BASE_URL', message: 'VITE_ADMIN_API_BASE_URL 不是合法 URL' })
  }

  if (values.ADMIN_API_BASE_URL && !isValidUrl(values.ADMIN_API_BASE_URL)) {
    issues.push({ level: 'error', key: 'ADMIN_API_BASE_URL', message: 'ADMIN_API_BASE_URL 不是合法 URL' })
  }

  if (values.STORAGE_DRIVER && !['file', 'mysql'].includes(values.STORAGE_DRIVER)) {
    issues.push({ level: 'error', key: 'STORAGE_DRIVER', message: 'STORAGE_DRIVER 只能是 file 或 mysql' })
  }

  if (values.AGENT_STORAGE_DRIVER && !['file', 'mysql'].includes(values.AGENT_STORAGE_DRIVER)) {
    issues.push({ level: 'error', key: 'AGENT_STORAGE_DRIVER', message: 'AGENT_STORAGE_DRIVER 只能是 file 或 mysql' })
  }

  for (const key of ['MINIO_USE_SSL', 'MINIO_PUBLIC_READ', 'DB_LOGGING', 'DB_SYNC_ALTER']) {
    const value = String(values[key] || '').trim().toLowerCase()
    if (value && !['true', 'false'].includes(value)) {
      issues.push({ level: 'warning', key, message: `${key} 建议使用 true 或 false` })
    }
  }

  return {
    ok: issues.every((item) => item.level !== 'error'),
    issues,
    values,
  }
}

export function getEnvFileMap() {
  return { ...envFiles }
}

export function maskValue(value) {
  const text = String(value || '')
  if (!text) {
    return ''
  }
  if (text.length <= 8) {
    return '*'.repeat(text.length)
  }
  return `${text.slice(0, 4)}****${text.slice(-4)}`
}

export function validateConfigValue(rule, value) {
  const text = String(value ?? '').trim()
  switch (rule) {
    case 'any':
      return { ok: true }
    case 'nonEmpty':
      return text ? { ok: true } : { ok: false, message: '不能为空' }
    case 'port':
      return isValidPort(text) ? { ok: true } : { ok: false, message: '必须填写 1-65535 之间的端口号' }
    case 'portOrEmpty':
      return !text || isValidPort(text) ? { ok: true } : { ok: false, message: '必须留空或填写 1-65535 之间的端口号' }
    case 'url':
      return isValidUrl(text) ? { ok: true } : { ok: false, message: '必须填写合法 URL' }
    case 'urlOrEmpty':
      return !text || isValidUrl(text) ? { ok: true } : { ok: false, message: '必须留空或填写合法 URL' }
    case 'storageDriver':
      return ['file', 'mysql'].includes(text) ? { ok: true } : { ok: false, message: '只能填写 file 或 mysql' }
    case 'storageDriverOrEmpty':
      return !text || ['file', 'mysql'].includes(text) ? { ok: true } : { ok: false, message: '只能留空或填写 file / mysql' }
    case 'booleanOrEmpty':
      return !text || ['true', 'false'].includes(text.toLowerCase())
        ? { ok: true }
        : { ok: false, message: '只能留空或填写 true / false' }
    case 'positiveIntegerOrEmpty': {
      const numeric = Number(text)
      return !text || (Number.isInteger(numeric) && numeric > 0)
        ? { ok: true }
        : { ok: false, message: '只能留空或填写正整数' }
    }
    default:
      return { ok: true }
  }
}
