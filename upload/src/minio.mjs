import { Client as MinioClient } from 'minio'

const IMAGE_MIME_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/avif': '.avif',
}

function parseBool(input, fallback = false) {
  const value = String(input || '').trim().toLowerCase()
  if (!value) {
    return fallback
  }
  return value === '1' || value === 'true' || value === 'yes' || value === 'y'
}

function parsePort(value, fallback) {
  const port = Number(value)
  return Number.isInteger(port) && port > 0 ? port : fallback
}

export function getMinioConfig() {
  const endPoint = String(process.env.MINIO_ENDPOINT || '127.0.0.1').trim()
  const port = parsePort(process.env.MINIO_PORT, 9000)
  const useSSL = parseBool(process.env.MINIO_USE_SSL, false)
  const accessKey = String(process.env.MINIO_ACCESS_KEY || '').trim()
  const secretKey = String(process.env.MINIO_SECRET_KEY || '').trim()
  const bucket = String(process.env.MINIO_BUCKET || 'myaichat-images').trim()
  const publicBaseUrl = String(process.env.MINIO_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '')
  const publicRead = parseBool(process.env.MINIO_PUBLIC_READ, true)

  if (!accessKey || !secretKey) {
    throw new Error('MINIO_ACCESS_KEY 和 MINIO_SECRET_KEY 不能为空')
  }
  if (!bucket) {
    throw new Error('MINIO_BUCKET 不能为空')
  }

  return {
    endPoint,
    port,
    useSSL,
    accessKey,
    secretKey,
    bucket,
    publicBaseUrl,
    publicRead,
  }
}

export function createMinioClient(config) {
  return new MinioClient({
    endPoint: config.endPoint,
    port: config.port,
    useSSL: config.useSSL,
    accessKey: config.accessKey,
    secretKey: config.secretKey,
  })
}

export async function ensureBucket(client, bucket, publicRead = true) {
  const exists = await client.bucketExists(bucket)
  if (!exists) {
    await client.makeBucket(bucket)
  }

  if (!publicRead) {
    return
  }

  const publicReadPolicy = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: {
          AWS: ['*'],
        },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  }
  await client.setBucketPolicy(bucket, JSON.stringify(publicReadPolicy))
}

export function getImageExtensionByMime(mimeType) {
  return IMAGE_MIME_EXTENSIONS[mimeType] || ''
}

export function buildObjectUrl(config, bucket, objectName) {
  if (config.publicBaseUrl) {
    return `${config.publicBaseUrl}/${bucket}/${encodeURI(objectName)}`
  }

  const protocol = config.useSSL ? 'https' : 'http'
  return `${protocol}://${config.endPoint}:${config.port}/${bucket}/${encodeURI(objectName)}`
}
