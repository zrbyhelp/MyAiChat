import {
  FORM_BLOCK_END,
  FORM_BLOCK_START,
  SUGGESTION_BLOCK_END,
  SUGGESTION_BLOCK_START,
} from './constants.mjs'

export function safeJsonParse(text, fallback = {}) {
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

export function normalizeSuggestionItems(input) {
  const list = Array.isArray(input?.suggestions) ? input.suggestions : Array.isArray(input) ? input : []
  return list
    .map((item) => ({
      title: String(item?.title || item?.t || '').trim(),
      prompt: String(item?.prompt || item?.p || item?.title || item?.t || '').trim(),
    }))
    .filter((item) => item.title)
}

export function normalizeFormOptions(input) {
  const list = Array.isArray(input) ? input : []
  return list
    .map((item) => ({
      label: String(item?.label || item?.l || item?.value || item?.v || '').trim(),
      value: String(item?.value || item?.v || item?.label || item?.l || '').trim(),
    }))
    .filter((item) => item.label && item.value)
}

export function normalizeFormSchema(input) {
  const rawFields = Array.isArray(input?.fields) ? input.fields : Array.isArray(input?.fs) ? input.fs : []
  const fields = rawFields
        .map((field, index) => {
          const fieldType = field?.type || field?.t
          const type = ['input', 'radio', 'checkbox', 'select'].includes(fieldType) ? fieldType : 'input'
          const options = normalizeFormOptions(field?.options || field?.o)
          return {
            name: String(field?.name || field?.n || `field_${index + 1}`).trim(),
            label: String(field?.label || field?.l || field?.name || field?.n || `字段 ${index + 1}`).trim(),
            type,
            placeholder: String(field?.placeholder || field?.p || '').trim(),
            required: Boolean(field?.required ?? field?.r),
            inputType: (field?.inputType || field?.it) === 'number' ? 'number' : 'text',
            multiple: Boolean(field?.multiple ?? field?.m),
            options,
            defaultValue: Array.isArray(field?.defaultValue || field?.d)
              ? (field?.defaultValue || field?.d).map((item) => String(item))
              : typeof (field?.defaultValue ?? field?.d) === 'string'
                ? field.defaultValue ?? field.d
                : type === 'checkbox' || (type === 'select' && (field?.multiple ?? field?.m))
                  ? []
                  : '',
          }
        })
        .filter((field) => field.name && field.label)

  if (!fields.length) {
    return null
  }

  return {
    title: String(input?.title || input?.ti || '请补充信息').trim(),
    description: String(input?.description || input?.de || '').trim(),
    submitText: String(input?.submitText || input?.st || '提交').trim(),
    fields,
  }
}

export function parseSuggestionJson(raw) {
  const source = String(raw || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '')
  if (!source) {
    return []
  }
  const parsed = safeJsonParse(source, null)
  if (Array.isArray(parsed)) {
    return normalizeSuggestionItems(parsed)
  }
  return normalizeSuggestionItems(parsed?.suggestions || parsed?.s)
}

export function parseFormJson(raw) {
  const source = String(raw || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '')
  if (!source) {
    return null
  }
  const parsed = safeJsonParse(source, null)
  return normalizeFormSchema(parsed)
}

export function extractStructuredPayloadsFromText(text) {
  let visibleText = String(text || '')
  let suggestions = []
  let form = null

  const suggestionStart = visibleText.indexOf(SUGGESTION_BLOCK_START)
  const suggestionEnd = visibleText.indexOf(SUGGESTION_BLOCK_END)
  if (suggestionStart !== -1 && suggestionEnd !== -1 && suggestionEnd > suggestionStart) {
    const suggestionRaw = visibleText.slice(suggestionStart + SUGGESTION_BLOCK_START.length, suggestionEnd)
    suggestions = parseSuggestionJson(suggestionRaw)
    visibleText = `${visibleText.slice(0, suggestionStart)}${visibleText.slice(suggestionEnd + SUGGESTION_BLOCK_END.length)}`
  }

  const formStart = visibleText.indexOf(FORM_BLOCK_START)
  const formEnd = visibleText.indexOf(FORM_BLOCK_END)
  if (formStart !== -1 && formEnd !== -1 && formEnd > formStart) {
    const formRaw = visibleText.slice(formStart + FORM_BLOCK_START.length, formEnd)
    form = parseFormJson(formRaw)
    visibleText = `${visibleText.slice(0, formStart)}${visibleText.slice(formEnd + FORM_BLOCK_END.length)}`
  }

  if (suggestions.length) {
    form = null
  }

  return {
    text: visibleText.trim(),
    suggestions,
    form,
  }
}

export function createStructuredStreamParser() {
  return {
    mode: null,
    textBuffer: '',
    suggestionBuffer: '',
    formBuffer: '',
  }
}

function getStructuredStartMatch(buffer) {
  const matches = [
    { type: 'suggestion', marker: SUGGESTION_BLOCK_START, index: buffer.indexOf(SUGGESTION_BLOCK_START) },
    { type: 'form', marker: FORM_BLOCK_START, index: buffer.indexOf(FORM_BLOCK_START) },
  ].filter((item) => item.index !== -1)

  if (!matches.length) {
    return null
  }

  return matches.sort((left, right) => left.index - right.index)[0]
}

export function consumeStructuredStreamChunk(state, chunk) {
  state.textBuffer += String(chunk || '')
  let visibleText = ''
  const maxStartLength = Math.max(SUGGESTION_BLOCK_START.length, FORM_BLOCK_START.length)

  while (state.textBuffer) {
    if (state.mode) {
      const endMarker = state.mode === 'suggestion' ? SUGGESTION_BLOCK_END : FORM_BLOCK_END
      const closeIndex = state.textBuffer.indexOf(endMarker)
      if (closeIndex === -1) {
        const safeLength = state.textBuffer.length - (endMarker.length - 1)
        if (safeLength > 0) {
          if (state.mode === 'suggestion') {
            state.suggestionBuffer += state.textBuffer.slice(0, safeLength)
          } else {
            state.formBuffer += state.textBuffer.slice(0, safeLength)
          }
          state.textBuffer = state.textBuffer.slice(safeLength)
        }
        break
      }

      if (state.mode === 'suggestion') {
        state.suggestionBuffer += state.textBuffer.slice(0, closeIndex)
      } else {
        state.formBuffer += state.textBuffer.slice(0, closeIndex)
      }
      state.textBuffer = state.textBuffer.slice(closeIndex + endMarker.length)
      state.mode = null
      continue
    }

    const nextBlock = getStructuredStartMatch(state.textBuffer)
    if (!nextBlock) {
      const safeLength = state.textBuffer.length - (maxStartLength - 1)
      if (safeLength > 0) {
        visibleText += state.textBuffer.slice(0, safeLength)
        state.textBuffer = state.textBuffer.slice(safeLength)
      }
      break
    }

    visibleText += state.textBuffer.slice(0, nextBlock.index)
    state.textBuffer = state.textBuffer.slice(nextBlock.index + nextBlock.marker.length)
    state.mode = nextBlock.type
  }

  return visibleText
}

export function finalizeStructuredStream(state) {
  let visibleText = ''
  if (state.mode === 'suggestion') {
    state.suggestionBuffer += state.textBuffer
  } else if (state.mode === 'form') {
    state.formBuffer += state.textBuffer
  } else {
    visibleText += state.textBuffer
  }
  state.textBuffer = ''

  const suggestions = parseSuggestionJson(state.suggestionBuffer)
  const form = suggestions.length ? null : parseFormJson(state.formBuffer)

  return {
    text: visibleText,
    suggestions,
    form,
  }
}
