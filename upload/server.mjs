import { randomUUID } from 'node:crypto'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import dotenv from 'dotenv'
import express from 'express'
import multer from 'multer'

import { attachClerkAuth, requireApiAuth } from './src/auth.mjs'
import {
  buildObjectUrl,
  createMinioClient,
  ensureBucket,
  getImageExtensionByMime,
  getMinioConfig,
} from './src/minio.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

dotenv.config({ path: resolve(__dirname, '.env') })
dotenv.config({ path: resolve(__dirname, '..', '.env') })

const UPLOAD_PORT = Number(process.env.UPLOAD_PORT || 3001)
const MAX_FILE_SIZE_MB = Number(process.env.UPLOAD_MAX_FILE_SIZE_MB || 10)
const MAX_FILE_SIZE = Number.isFinite(MAX_FILE_SIZE_MB) && MAX_FILE_SIZE_MB > 0
  ? Math.floor(MAX_FILE_SIZE_MB * 1024 * 1024)
  : 10 * 1024 * 1024

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/avif',
])

const minioConfig = getMinioConfig()
const minioClient = createMinioClient(minioConfig)

function pickObjectKeys(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return []
  }

  return Object.keys(value).slice(0, 30)
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause instanceof Error
        ? {
          name: error.cause.name,
          message: error.cause.message,
          stack: error.cause.stack,
        }
        : error.cause,
    }
  }

  return {
    message: typeof error === 'string' ? error : 'Non-error value thrown',
    detail: error,
  }
}

function logRequestError(error, req) {
  console.error('[upload:error]', {
    timestamp: new Date().toISOString(),
    requestId: req.requestId || null,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userId: req.authUser?.id || null,
    userAgent: req.get('user-agent') || null,
    contentType: req.get('content-type') || null,
    params: req.params || {},
    queryKeys: pickObjectKeys(req.query),
    bodyKeys: pickObjectKeys(req.body),
    error: serializeError(error),
  })
}

const app = express()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
})

app.use(attachClerkAuth)
app.use((req, res, next) => {
  req.requestId = randomUUID()
  res.setHeader('X-Request-Id', req.requestId)
  next()
})
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  next()
})

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/upload/image', requireApiAuth, upload.single('file'), async (req, res, next) => {
  try {
    const file = req.file
    if (!file) {
      res.status(400).json({ message: '缺少上传文件，字段名请使用 file' })
      return
    }

    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      res.status(400).json({ message: `仅支持图片类型：${Array.from(ALLOWED_IMAGE_MIME_TYPES).join(', ')}` })
      return
    }

    const originalExt = extname(file.originalname || '').toLowerCase()
    const extension = getImageExtensionByMime(file.mimetype) || originalExt || '.bin'
    const objectName = `users/${req.authUser.id}/${Date.now()}-${randomUUID()}${extension}`

    const uploadInfo = await minioClient.putObject(
      minioConfig.bucket,
      objectName,
      file.buffer,
      file.size,
      { 'Content-Type': file.mimetype },
    )

    res.json({
      bucket: minioConfig.bucket,
      objectKey: objectName,
      contentType: file.mimetype,
      size: file.size,
      etag: uploadInfo.etag || '',
      url: buildObjectUrl(minioConfig, minioConfig.bucket, objectName),
    })
  } catch (error) {
    next(error)
  }
})

app.use((error, req, res, _next) => {
  if (error?.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({ message: `图片大小不能超过 ${MAX_FILE_SIZE_MB}MB` })
    return
  }
  logRequestError(error, req)
  res.status(500).json({
    message: error instanceof Error ? error.message : '上传服务异常',
    requestId: req.requestId || null,
  })
})

async function bootstrap() {
  await ensureBucket(minioClient, minioConfig.bucket, minioConfig.publicRead)
  app.listen(UPLOAD_PORT)
}

bootstrap().catch((error) => {
  console.error(error)
  process.exit(1)
})
