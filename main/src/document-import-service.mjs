import { createRequire } from 'node:module'
import { extname } from 'node:path'
import { readFile } from 'node:fs/promises'

const require = createRequire(import.meta.url)

function detectSourceType(filename) {
  const extension = extname(String(filename || '').trim()).toLowerCase()
  if (extension === '.pdf') {
    return 'pdf'
  }
  if (extension === '.epub') {
    return 'epub'
  }
  return 'txt'
}

function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

async function parseTxtDocument(filePath) {
  const buffer = await readFile(filePath)
  return normalizeWhitespace(buffer.toString('utf8'))
}

async function parsePdfDocument(filePath) {
  const pdfParseModule = await import('pdf-parse')
  const pdfParse = pdfParseModule.default || pdfParseModule
  const buffer = await readFile(filePath)
  const result = await pdfParse(buffer)
  return normalizeWhitespace(result?.text || '')
}

async function parseEpubDocument(filePath) {
  const epubModule = require('epub2')
  const EPub = epubModule?.EPub || epubModule?.default || epubModule
  if (typeof EPub !== 'function') {
    throw new Error('EPUB 解析器不可用')
  }
  return new Promise((resolve, reject) => {
    const epub = new EPub(filePath)
    epub.on('error', reject)
    epub.on('end', async () => {
      try {
        const chapterIds = Array.isArray(epub.flow) ? epub.flow.map((item) => item?.id).filter(Boolean) : []
        const texts = []
        for (const chapterId of chapterIds) {
          const chapterText = await new Promise((chapterResolve, chapterReject) => {
            epub.getChapter(chapterId, (error, text) => {
              if (error) {
                chapterReject(error)
                return
              }
              chapterResolve(text || '')
            })
          })
          texts.push(stripHtml(chapterText))
        }
        resolve(normalizeWhitespace(texts.join('\n\n')))
      } catch (error) {
        reject(error)
      }
    })
    epub.parse()
  })
}

export async function extractDocumentText(filePath, filename) {
  const sourceType = detectSourceType(filename)
  const text = sourceType === 'pdf'
    ? await parsePdfDocument(filePath)
    : sourceType === 'epub'
      ? await parseEpubDocument(filePath)
      : await parseTxtDocument(filePath)

  return {
    sourceType,
    text: normalizeWhitespace(text),
  }
}

export function chunkDocumentText(text, options = {}) {
  const chunkSize = Math.max(1200, Math.round(Number(options.chunkSize || process.env.ROBOT_IMPORT_CHUNK_SIZE || 4000)))
  const overlap = Math.max(0, Math.min(chunkSize / 3, Math.round(Number(options.overlap || process.env.ROBOT_IMPORT_CHUNK_OVERLAP || 300))))
  const normalizedText = normalizeWhitespace(text)
  if (!normalizedText) {
    return []
  }

  const chunks = []
  let cursor = 0
  while (cursor < normalizedText.length) {
    let end = Math.min(normalizedText.length, cursor + chunkSize)
    if (end < normalizedText.length) {
      const paragraphBreak = normalizedText.lastIndexOf('\n\n', end)
      const lineBreak = normalizedText.lastIndexOf('\n', end)
      const sentenceBreak = Math.max(
        normalizedText.lastIndexOf('。', end),
        normalizedText.lastIndexOf('！', end),
        normalizedText.lastIndexOf('？', end),
        normalizedText.lastIndexOf('.', end),
      )
      const pivot = [paragraphBreak, lineBreak, sentenceBreak]
        .filter((item) => item > cursor + Math.floor(chunkSize * 0.6))
        .sort((left, right) => right - left)[0]
      if (pivot) {
        end = pivot
      }
    }

    const content = normalizedText.slice(cursor, end).trim()
    if (content) {
      chunks.push({
        index: chunks.length,
        start: cursor,
        end,
        text: content,
        characterCount: content.length,
      })
    }

    if (end >= normalizedText.length) {
      break
    }
    cursor = Math.max(end - overlap, cursor + 1)
  }

  return chunks
}
