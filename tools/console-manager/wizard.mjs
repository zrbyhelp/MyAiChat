import {
  getConfigWizardFields,
  getEnvFileMap,
  initializeEnvFiles,
  maskValue,
  updateConfigValues,
  validateConfigValue,
} from './config.mjs'

function formatValue(field, value) {
  const text = String(value ?? '')
  if (!text) {
    return '(空)'
  }
  return field.sensitive ? maskValue(text) : text
}

async function askField(ui, field, updates) {
  while (true) {
    ui.print(`\n${field.label}`)
    ui.print(`说明: ${field.description}`)
    ui.print(`当前值: ${formatValue(field, field.currentValue)}`)
    if (field.defaultValue && field.defaultValue !== field.currentValue) {
      ui.print(`示例默认值: ${formatValue(field, field.defaultValue)}`)
    }

    const answer = await ui.ask('输入新值，直接回车保留当前值: ')
    if (answer === '') {
      updates[field.key] = field.currentValue ?? ''
      return
    }

    const validation = validateConfigValue(field.validate, answer)
    if (validation.ok) {
      updates[field.key] = answer.trim()
      return
    }

    ui.print(`输入无效：${validation.message}\n`)
  }
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

export async function runConfigWizard(ui) {
  const initResults = initializeEnvFiles()
  const envFiles = getEnvFileMap()
  ui.print('\n配置文件检查结果')
  for (const result of initResults) {
    ui.print(`- ${result.created ? '已创建' : '已存在'}: ${envFiles[result.fileKey]}`)
  }

  const updates = {}
  const requiredFields = getConfigWizardFields('required')
  for (const field of requiredFields) {
    await askField(ui, field, updates)
  }

  const optionalAnswer = await ui.ask('\n关键项已完成，是否继续填写可选项？(y/N): ')
  let optionalFields = []
  if (['y', 'yes', '是'].includes(optionalAnswer.trim().toLowerCase())) {
    optionalFields = getConfigWizardFields('optional')
    for (const field of optionalFields) {
      await askField(ui, field, updates)
    }
  }

  const summary = buildSummary([...requiredFields, ...optionalFields], updates)
  ui.print('\n本次将写入以下配置')
  for (const item of summary) {
    ui.print(`- ${item.label} [${item.key}] = ${item.value}`)
  }

  const confirm = await ui.ask('\n确认保存以上配置吗？(y/N): ')
  if (!['y', 'yes', '是'].includes(confirm.trim().toLowerCase())) {
    return {
      saved: false,
      summary,
      updatedFiles: [],
    }
  }

  const result = updateConfigValues(updates)
  return {
    saved: true,
    summary,
    updatedFiles: result.updatedFiles,
  }
}
