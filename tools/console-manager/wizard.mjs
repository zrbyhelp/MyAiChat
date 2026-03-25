import {
  getConfigWizardFields,
  getEnvFileMap,
  initializeEnvFiles,
  maskValue,
  updateConfigValues,
  validateConfigValue,
} from './config.mjs'
import { renderWizardResult } from './ui.mjs'

function formatValue(field, value) {
  const text = String(value ?? '').trim()
  if (!text) {
    return '(空)'
  }
  return field.sensitive ? maskValue(text) : text
}

function buildSummary(fields, updates) {
  return fields
    .filter((field) => Object.hasOwn(updates, field.key))
    .map((field) => ({
      key: field.key,
      label: field.label,
      value: formatValue(field, updates[field.key]),
    }))
}

async function promptField(ui, field) {
  const hintParts = [
    field.description,
    `当前值：${formatValue(field, field.currentValue)}`,
  ]
  if (field.defaultValue && field.defaultValue !== field.currentValue) {
    hintParts.push(`示例默认值：${formatValue(field, field.defaultValue)}`)
  }

  const defaultValue = String(field.currentValue ?? '')
  return ui.input(`${field.label}\n${hintParts.join('\n')}`, defaultValue, (value) => {
    const validation = validateConfigValue(field.validate, value)
    return validation.ok ? true : `输入无效：${validation.message}`
  })
}

export async function runConfigWizard(ui, options = {}) {
  const { onUpdate } = options
  const emit = (text) => {
    if (typeof onUpdate === 'function') {
      onUpdate(text)
    }
  }

  const initResults = initializeEnvFiles()
  const envFiles = getEnvFileMap()
  const initLines = ['配置文件检查结果']
  for (const result of initResults) {
    initLines.push(`- ${result.created ? '已创建' : '已存在'}: ${envFiles[result.fileKey]}`)
  }
  emit(`\n${initLines.join('\n')}\n`)

  const updates = {}
  const requiredFields = getConfigWizardFields('required')
  for (const field of requiredFields) {
    const answer = await promptField(ui, field)
    updates[field.key] = answer === '' ? String(field.currentValue ?? '') : answer
  }

  const includeOptional = await ui.confirm('关键项已完成，是否继续填写可选项？', false)
  let optionalFields = []
  if (includeOptional) {
    optionalFields = getConfigWizardFields('optional')
    for (const field of optionalFields) {
      const answer = await promptField(ui, field)
      updates[field.key] = answer === '' ? String(field.currentValue ?? '') : answer
    }
  }

  const summary = buildSummary([...requiredFields, ...optionalFields], updates)
  const summaryLines = ['本次将写入以下配置']
  for (const item of summary) {
    summaryLines.push(`- ${item.label} [${item.key}] = ${item.value}`)
  }
  emit(`\n${summaryLines.join('\n')}\n`)

  const shouldSave = await ui.confirm('确认保存以上配置吗？', false)
  if (!shouldSave) {
    return {
      saved: false,
      summary,
      updatedFiles: [],
      output: renderWizardResult({
        saved: false,
        summary,
        updatedFiles: [],
      }),
    }
  }

  const result = updateConfigValues(updates)
  const finalResult = {
    saved: true,
    summary,
    updatedFiles: result.updatedFiles,
  }

  return {
    ...finalResult,
    output: renderWizardResult(finalResult),
  }
}
