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

export function ensureAssistantSuggestionFallback(suggestions, form) {
  const normalizedSuggestions = normalizeSuggestionItems(suggestions)
  const normalizedForm = normalizeFormSchema(form)
  if (normalizedSuggestions.length || normalizedForm?.fields?.length) {
    return normalizedSuggestions
  }
  return [{ title: '继续', prompt: '继续' }]
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

const ASSISTANT_INPUT_REQUEST_PATTERNS = [
  /请(?:先)?(?:继续)?(?:填写|补充|输入|提供|描述|说明|写下|回复|提交)/u,
  /需要你(?:先)?(?:填写|补充|输入|提供|描述|说明|回复|提交)/u,
  /麻烦你(?:先)?(?:填写|补充|输入|提供|描述|说明|回复|提交)/u,
  /请把.+?(?:告诉我|写下来|填一下|发给我|回复我)/u,
  /把.+?(?:告诉我|写下来|填一下|发给我|回复我)/u,
  /告诉我.+?(?:内容|信息|资料|设定|想法|需求|原因|经历|背景|细节)/u,
  /补充一下/u,
  /填写一下/u,
  /输入一下/u,
  /提供一下/u,
  /描述一下/u,
  /说明一下/u,
]

const ASSISTANT_CHOICE_PROMPT_PATTERNS = [
  /请选择/u,
  /选一个/u,
  /选哪(?:个|种|条|项|边)/u,
  /你想要哪(?:个|种|条|一步|项)/u,
  /你希望我继续哪(?:个|种|条|一步|项)/u,
  /下面(?:这)?几个方向/u,
  /从.+?中选择/u,
  /以下哪(?:个|种|条|项)/u,
]

function normalizeAssistantTextForIntent(text) {
  return String(text || '').replace(/\s+/gu, ' ').trim()
}

export function shouldPreferAssistantForm(text) {
  const normalizedText = normalizeAssistantTextForIntent(text)
  if (!normalizedText) {
    return false
  }
  return ASSISTANT_INPUT_REQUEST_PATTERNS.some((pattern) => pattern.test(normalizedText))
}

export function shouldPreferAssistantSuggestions(text) {
  const normalizedText = normalizeAssistantTextForIntent(text)
  if (!normalizedText) {
    return false
  }
  return ASSISTANT_CHOICE_PROMPT_PATTERNS.some((pattern) => pattern.test(normalizedText))
}

function createGenericAssistantForm(text) {
  const normalizedText = String(text || '').trim()
  return {
    title: '请补充信息',
    description: normalizedText,
    submitText: '提交',
    fields: [
      {
        name: 'content',
        label: '补充内容',
        type: 'input',
        placeholder: '请按上文要求填写',
        required: true,
        inputType: 'text',
        multiple: false,
        options: [],
        defaultValue: '',
      },
    ],
  }
}

export function reconcileAssistantStructuredOutput(text, suggestions, form) {
  const normalizedText = String(text || '').trim()
  const normalizedSuggestions = normalizeSuggestionItems(suggestions)
  const normalizedForm = normalizeFormSchema(form)
  const prefersForm = shouldPreferAssistantForm(normalizedText)
  const prefersSuggestions = shouldPreferAssistantSuggestions(normalizedText)

  if (prefersForm) {
    return {
      text: normalizedText,
      suggestions: [],
      form: normalizedForm?.fields?.length ? normalizedForm : createGenericAssistantForm(normalizedText),
    }
  }

  if (normalizedForm?.fields?.length) {
    return {
      text: normalizedText,
      suggestions: [],
      form: normalizedForm,
    }
  }

  if (normalizedSuggestions.length) {
    return {
      text: normalizedText,
      suggestions: normalizedSuggestions,
      form: null,
    }
  }

  return {
    text: normalizedText,
    suggestions: prefersSuggestions ? [{ title: '继续', prompt: '继续' }] : ensureAssistantSuggestionFallback([], null),
    form: null,
  }
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
