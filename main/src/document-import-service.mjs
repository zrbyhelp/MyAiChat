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
  if (extension === '.md' || extension === '.markdown') {
    return 'md'
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

function normalizeMarkdownLine(value) {
  return String(value || '')
    .replace(/\t/g, '  ')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \f\v]+$/g, '')
}

function compactMarkdownInline(value) {
  return String(value || '')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '图片：$1 $2')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1（$2）')
    .replace(/`([^`]+)`/g, ' $1 ')
    .replace(/[*_~#]+/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildMarkdownBlockText(kind, titlePath, content, extra = {}) {
  const sectionLabel = titlePath.length ? `章节：${titlePath.join(' / ')}` : '章节：文档开头'
  const normalizedContent = String(content || '').trim()
  if (!normalizedContent) {
    return ''
  }

  if (kind === 'heading') {
    const depth = Math.max(1, Number(extra.depth || 1) || 1)
    return `${sectionLabel}\n标题层级：H${depth}\n标题：${normalizedContent}`
  }
  if (kind === 'list') {
    return `${sectionLabel}\n内容类型：列表\n${normalizedContent}`
  }
  if (kind === 'quote') {
    return `${sectionLabel}\n内容类型：引用\n${normalizedContent}`
  }
  if (kind === 'code') {
    const language = String(extra.language || '').trim()
    return `${sectionLabel}\n内容类型：代码块${language ? `（${language}）` : ''}\n${normalizedContent}`
  }
  if (kind === 'table') {
    return `${sectionLabel}\n内容类型：表格\n${normalizedContent}`
  }
  return `${sectionLabel}\n内容类型：段落\n${normalizedContent}`
}

function createMarkdownBlock(blocks, kind, titlePath, content, extra = {}) {
  const text = buildMarkdownBlockText(kind, titlePath, content, extra)
  if (!text) {
    return
  }
  blocks.push({
    kind,
    titlePath: [...titlePath],
    text,
    characterCount: text.length,
  })
}

function parseMarkdownTable(tableLines) {
  const rows = (Array.isArray(tableLines) ? tableLines : [])
    .map((line) => normalizeMarkdownLine(line).trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\|/, '').replace(/\|$/, ''))
    .map((line) => line.split('|').map((cell) => compactMarkdownInline(cell)))
    .filter((cells) => cells.some(Boolean))

  if (!rows.length) {
    return ''
  }

  const filteredRows = rows.filter((cells, index) => {
    if (index !== 1) {
      return true
    }
    return !cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')))
  })

  return filteredRows
    .map((cells, index) => `第 ${index + 1} 行：${cells.filter(Boolean).join(' | ')}`)
    .join('\n')
}

function parseMarkdownSemanticBlocks(markdown) {
  const lines = String(markdown || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')

  const blocks = []
  const titlePath = []
  let paragraphLines = []
  let listLines = []
  let quoteLines = []
  let tableLines = []
  let codeLines = []
  let codeFence = ''
  let codeLanguage = ''

  const flushParagraph = () => {
    if (!paragraphLines.length) {
      return
    }
    createMarkdownBlock(
      blocks,
      'paragraph',
      titlePath,
      compactMarkdownInline(paragraphLines.join(' ')),
    )
    paragraphLines = []
  }

  const flushList = () => {
    if (!listLines.length) {
      return
    }
    const content = listLines
      .map((line) => normalizeMarkdownLine(line))
      .map((line) => line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, '').trim())
      .map((line, index) => `${index + 1}. ${compactMarkdownInline(line)}`)
      .filter((line) => !/^\d+\.\s*$/.test(line))
      .join('\n')
    createMarkdownBlock(blocks, 'list', titlePath, content)
    listLines = []
  }

  const flushQuote = () => {
    if (!quoteLines.length) {
      return
    }
    const content = quoteLines
      .map((line) => normalizeMarkdownLine(line).replace(/^\s*>\s?/, ''))
      .map((line) => compactMarkdownInline(line))
      .filter(Boolean)
      .join('\n')
    createMarkdownBlock(blocks, 'quote', titlePath, content)
    quoteLines = []
  }

  const flushTable = () => {
    if (!tableLines.length) {
      return
    }
    createMarkdownBlock(blocks, 'table', titlePath, parseMarkdownTable(tableLines))
    tableLines = []
  }

  const flushCode = () => {
    if (!codeLines.length) {
      codeFence = ''
      codeLanguage = ''
      return
    }
    const content = codeLines
      .map((line) => normalizeMarkdownLine(line))
      .join('\n')
      .trim()
    createMarkdownBlock(blocks, 'code', titlePath, content, { language: codeLanguage })
    codeLines = []
    codeFence = ''
    codeLanguage = ''
  }

  const flushAllTextualBlocks = () => {
    flushParagraph()
    flushList()
    flushQuote()
    flushTable()
  }

  for (const rawLine of lines) {
    const line = normalizeMarkdownLine(rawLine)
    const trimmed = line.trim()

    if (codeFence) {
      if (trimmed.startsWith(codeFence)) {
        flushCode()
      } else {
        codeLines.push(line)
      }
      continue
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      flushAllTextualBlocks()
      const depth = headingMatch[1].length
      const headingText = compactMarkdownInline(headingMatch[2])
      titlePath.splice(depth - 1)
      titlePath[depth - 1] = headingText
      createMarkdownBlock(blocks, 'heading', titlePath, headingText, { depth })
      continue
    }

    const fenceMatch = trimmed.match(/^(```+|~~~+)\s*([^`]*)$/)
    if (fenceMatch) {
      flushAllTextualBlocks()
      codeFence = fenceMatch[1]
      codeLanguage = compactMarkdownInline(fenceMatch[2])
      codeLines = []
      continue
    }

    if (!trimmed) {
      flushAllTextualBlocks()
      continue
    }

    if (/^\s*>/.test(line)) {
      flushParagraph()
      flushList()
      flushTable()
      quoteLines.push(line)
      continue
    }

    if (/^\s*(?:[-*+]|\d+\.)\s+/.test(line)) {
      flushParagraph()
      flushQuote()
      flushTable()
      listLines.push(line)
      continue
    }

    if (trimmed.includes('|')) {
      flushParagraph()
      flushList()
      flushQuote()
      tableLines.push(line)
      continue
    }

    flushList()
    flushQuote()
    flushTable()
    paragraphLines.push(line)
  }

  flushAllTextualBlocks()
  flushCode()

  return blocks
}

async function parseTxtDocument(filePath) {
  const buffer = await readFile(filePath)
  return normalizeWhitespace(buffer.toString('utf8'))
}

async function parseMarkdownDocument(filePath) {
  const buffer = await readFile(filePath)
  const rawMarkdown = buffer.toString('utf8')
  const semanticBlocks = parseMarkdownSemanticBlocks(rawMarkdown)
  const text = normalizeWhitespace(
    semanticBlocks.length
      ? semanticBlocks.map((item) => item.text).join('\n\n')
      : compactMarkdownInline(rawMarkdown),
  )

  return {
    text,
    semanticBlocks,
    semanticMeta: {
      blockCount: semanticBlocks.length,
      headingCount: semanticBlocks.filter((item) => item.kind === 'heading').length,
      listCount: semanticBlocks.filter((item) => item.kind === 'list').length,
      quoteCount: semanticBlocks.filter((item) => item.kind === 'quote').length,
      codeBlockCount: semanticBlocks.filter((item) => item.kind === 'code').length,
      tableCount: semanticBlocks.filter((item) => item.kind === 'table').length,
    },
  }
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
  const parsed = sourceType === 'pdf'
    ? { text: await parsePdfDocument(filePath) }
    : sourceType === 'epub'
      ? { text: await parseEpubDocument(filePath) }
      : sourceType === 'md'
        ? await parseMarkdownDocument(filePath)
        : { text: await parseTxtDocument(filePath) }

  return {
    sourceType,
    text: normalizeWhitespace(parsed?.text || ''),
    semanticBlocks: Array.isArray(parsed?.semanticBlocks) ? parsed.semanticBlocks : [],
    semanticMeta: parsed?.semanticMeta && typeof parsed.semanticMeta === 'object' ? parsed.semanticMeta : {},
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
