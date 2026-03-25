import {
  getConfigFieldDefinitions,
  readCurrentConfig,
  getConfigGroupsWithValues,
  getEnvFileMap,
  initializeEnvFiles,
  updateConfigGroup,
  validateConfig,
  validateConfigValue,
} from './config.mjs'
import { installEnvironment } from './installer.mjs'
import {
  createOperationAnimator,
  createConsoleUi,
  printBanner,
  printMainMenu,
  renderActionResults,
  renderAccessAddresses,
  renderConfigGroupDetail,
  renderInstallProgress,
  renderInstallResults,
  renderLog,
  renderStatusTable,
  renderValidationResult,
  renderWizardResult,
} from './ui.mjs'
import {
  getServiceDefinitions,
  getServiceLabel,
  getServiceSelectionSummary,
  getStatusRows,
  parseServiceTarget,
  readRecentLog,
  restartServices,
  restartServicesDetached,
  shutdownManagedServices,
  startServices,
  stopServices,
} from './services.mjs'
import { loadState } from './state.mjs'
import { runConfigWizard } from './wizard.mjs'

function extractAddressFromLog(id) {
  const lines = readRecentLog(id, 120)
  if (id === 'chat') {
    const line = [...lines].reverse().find((item) => item.includes('Local:') && item.includes('http'))
    if (!line) {
      return ''
    }
    const match = line.match(/https?:\/\/[^\s/]+(?::\d+)?\/?/i)
    return match?.[0]?.replace(/\/$/, '') || ''
  }

  if (id === 'main') {
    const line = [...lines].reverse().find((item) => item.includes('running at http'))
    const match = line?.match(/https?:\/\/[^\s/]+(?::\d+)?/i)
    return match?.[0] || ''
  }

  if (id === 'agent') {
    const line = [...lines].reverse().find((item) => item.includes('Uvicorn running on http'))
    const match = line?.match(/https?:\/\/[^\s/]+(?::\d+)?/i)
    return match?.[0] || ''
  }

  if (id === 'upload') {
    const line = [...lines].reverse().find((item) => item.includes('running at http'))
    const match = line?.match(/https?:\/\/[^\s/]+(?::\d+)?/i)
    return match?.[0] || ''
  }

  return ''
}

function buildAccessAddresses(ids) {
  const config = readCurrentConfig()
  const port = String(config.PORT || '3000').trim() || '3000'
  const uploadPort = String(config.UPLOAD_PORT || '3001').trim() || '3001'
  let agentServiceUrl = String(config.AGENT_SERVICE_URL || 'http://127.0.0.1:8000').trim() || 'http://127.0.0.1:8000'
  try {
    const parsed = new URL(agentServiceUrl)
    if (parsed.hostname === 'agent') {
      parsed.hostname = '127.0.0.1'
      agentServiceUrl = parsed.toString().replace(/\/$/, '')
    }
  } catch {
    agentServiceUrl = 'http://127.0.0.1:8000'
  }

  const addressMap = {
    chat: {
      id: 'chat',
      label: '前端',
      url: extractAddressFromLog('chat') || 'http://127.0.0.1:5173',
    },
    main: {
      id: 'main',
      label: '网关',
      url: extractAddressFromLog('main') || `http://127.0.0.1:${port}`,
    },
    agent: {
      id: 'agent',
      label: '智能体',
      url: extractAddressFromLog('agent') || agentServiceUrl,
    },
    upload: {
      id: 'upload',
      label: '上传',
      url: extractAddressFromLog('upload') || `http://127.0.0.1:${uploadPort}`,
    },
  }

  return ids.map((id) => addressMap[id]).filter(Boolean)
}

function parseArgs(argv) {
  const [action, target] = argv
  return {
    action: action ? String(action).toLowerCase() : '',
    target: target || '',
  }
}

function isExitAnswer(answer) {
  return ['11', 'exit', 'quit', '退出'].includes(answer.toLowerCase())
}

async function shutdownInteractiveSession(ui, reason = '退出控制台') {
  ui.print(`\n${reason}，正在同步关闭受管服务...\n`)
  const { results } = await shutdownManagedServices()
  if (results.length > 0) {
    ui.print(renderActionResults('关闭结果', results))
  }
}

async function promptServiceSelection(ui, actionLabel) {
  const services = getServiceDefinitions()
  const selections = await ui.chooseMany(`请选择要${actionLabel}的服务`, [
    { name: '全部服务', value: '__ALL__' },
    ...services.map((service) => ({
      name: `${service.label} (${service.id})`,
      value: service.id,
    })),
    { name: '返回上一级', value: '__BACK__' },
  ])

  if (!Array.isArray(selections) || selections.length === 0 || selections.includes('__BACK__')) {
    return []
  }

  if (selections.includes('__ALL__')) {
    return services.map((service) => service.id)
  }
  return [...new Set(selections)]
}

async function runWithOperationAnimation(setLastOutput, actionLabel, targetLabel, task) {
  const animator = createOperationAnimator(actionLabel, targetLabel)
  animator.start()
  const startedAt = Date.now()

  try {
    const result = await Promise.resolve().then(task)
    const elapsed = Date.now() - startedAt
    if (elapsed < 700) {
      await new Promise((resolve) => setTimeout(resolve, 700 - elapsed))
    }
    animator.succeed(`正在${actionLabel}：${targetLabel}`)
    return result
  } catch (error) {
    animator.fail(`${actionLabel}失败：${targetLabel}`)
    throw error
  } finally {
    animator.stop()
    if (typeof setLastOutput === 'function') {
      setLastOutput('')
    }
  }
}

async function handleStart(ui, setLastOutput) {
  const ids = await promptServiceSelection(ui, '启动')
  if (ids.length === 0) {
    return '\n未选择任何服务。\n'
  }
  const targetLabel = getServiceSelectionSummary(ids)
  const { results } = await runWithOperationAnimation(setLastOutput, '启动', targetLabel, () =>
    startServices(ids, loadState()),
  )
  return `${renderActionResults(`已执行启动：${getServiceSelectionSummary(ids)}`, results)}${renderAccessAddresses(buildAccessAddresses(ids))}`
}

async function handleRestart(ui, setLastOutput) {
  const ids = await promptServiceSelection(ui, '重启')
  if (ids.length === 0) {
    return '\n未选择任何服务。\n'
  }
  const targetLabel = getServiceSelectionSummary(ids)
  const { results } = await runWithOperationAnimation(setLastOutput, '重启', targetLabel, () =>
    restartServices(ids, loadState()),
  )
  return `${renderActionResults(`已执行重启：${getServiceSelectionSummary(ids)}`, results)}${renderAccessAddresses(buildAccessAddresses(ids))}`
}

async function handleStop(ui, setLastOutput) {
  const ids = await promptServiceSelection(ui, '停止')
  if (ids.length === 0) {
    return '\n未选择任何服务。\n'
  }
  const targetLabel = getServiceSelectionSummary(ids)
  const { results } = await runWithOperationAnimation(setLastOutput, '停止', targetLabel, () =>
    stopServices(ids, loadState()),
  )
  return renderActionResults(`已执行停止：${getServiceSelectionSummary(ids)}`, results)
}

async function handleLogs(ui) {
  const services = getServiceDefinitions()
  const selected = await ui.choose('请选择要查看日志的服务', [
    ...services.map((service) => ({
      name: `${service.label} (${service.id})`,
      value: service.id,
    })),
    { name: '返回上一级', value: '__BACK__' },
  ])
  if (!selected || selected === '__BACK__') {
    return ''
  }
  return renderLog(selected, getServiceLabel(selected), readRecentLog(selected))
}

async function handleInitConfig(ui) {
  const results = initializeEnvFiles()
  const envFiles = getEnvFileMap()
  const lines = ['\n配置初始化结果']
  for (const result of results) {
    lines.push(`- ${result.created ? '已创建' : '已存在'}: ${envFiles[result.fileKey]}`)
  }
  lines.push('')
  return lines.join('\n')
}

async function handleConfigWizard(ui, onUpdate) {
  const result = await runConfigWizard(ui, { onUpdate })
  return result.output || renderWizardResult(result)
}

async function handleConfigManagement(ui, onUpdate) {
  const fieldDefinitions = Object.fromEntries(getConfigFieldDefinitions().map((field) => [field.key, field]))

  while (true) {
    const groups = getConfigGroupsWithValues()
    const selected = await ui.choose('请选择配置分组', [
      ...groups.map((group) => ({
        name: `${group.label} - ${group.description}`,
        value: group.id,
      })),
      { name: '返回上一级', value: '__BACK__' },
    ])
    if (!selected || selected === '__BACK__') {
      return ''
    }
    const group = groups.find((item) => item.id === selected)
    if (!group) {
      return ''
    }

    const detailOutput = renderConfigGroupDetail(group)
    if (typeof onUpdate === 'function') {
      onUpdate(detailOutput)
    }
    const updates = {}
    for (const field of group.fields) {
      const currentValue = String(field.value || '')
      const definition = fieldDefinitions[field.key]
      const nextValue = await ui.input(
        `${field.label}\n当前值：${field.sensitive ? '已隐藏' : currentValue || '(空)'}\n直接回车保留当前值`,
        currentValue,
        (value) => {
          const validation = validateConfigValue(definition?.validate || 'any', value)
          return validation.ok ? true : `输入无效：${validation.message}`
        },
      )
      if (nextValue !== currentValue) {
        updates[field.key] = nextValue
      }
    }

    if (Object.keys(updates).length === 0) {
      return '\n未修改任何配置项。\n'
    }

    const updatedGroup = updateConfigGroup(group.id, updates)
    const lines = ['\n配置已更新。', '', updatedGroup.label]
    for (const field of updatedGroup.fields) {
      const value = field.sensitive ? '已隐藏' : field.value || '(空)'
      lines.push(`- ${field.label} [${field.key}] = ${value}`)
    }
    lines.push('')
    return lines.join('\n')
  }
}

async function runDirectCommand(action, target) {
  switch (action) {
    case 'status':
      printBanner()
      console.log(renderStatusTable(getStatusRows(loadState())))
      return true
    case 'start': {
      const ids = parseServiceTarget(target)
      printBanner()
      const { results } = startServices(ids, loadState(), { detachedMode: true })
      console.log(renderActionResults(`已执行启动：${getServiceSelectionSummary(ids)}`, results))
      console.log(renderAccessAddresses(buildAccessAddresses(ids)))
      return true
    }
    case 'restart': {
      const ids = parseServiceTarget(target)
      printBanner()
      const { results } = await restartServicesDetached(ids, loadState())
      console.log(renderActionResults(`已执行重启：${getServiceSelectionSummary(ids)}`, results))
      console.log(renderAccessAddresses(buildAccessAddresses(ids)))
      return true
    }
    case 'stop':
    case 'close': {
      const ids = parseServiceTarget(target)
      printBanner()
      const { results } = await stopServices(ids, loadState())
      console.log(renderActionResults(`已执行停止：${getServiceSelectionSummary(ids)}`, results))
      return true
    }
    case 'logs': {
      const ids = parseServiceTarget(target)
      if (ids.length !== 1) {
        throw new Error('logs 命令只能查看单个服务日志')
      }
      printBanner()
      console.log(renderLog(ids[0], getServiceLabel(ids[0]), readRecentLog(ids[0])))
      return true
    }
    case 'init-config': {
      printBanner()
      const results = initializeEnvFiles()
      const envFiles = getEnvFileMap()
      console.log('配置初始化结果')
      for (const result of results) {
        console.log(`- ${result.created ? '已创建' : '已存在'}: ${envFiles[result.fileKey]}`)
      }
      console.log('')
      return true
    }
    case 'install-env': {
      printBanner()
      const result = await installEnvironment()
      console.log(renderInstallResults(result))
      return true
    }
    case 'wizard-config': {
      printBanner()
      const ui = createConsoleUi()
      try {
        const result = await runConfigWizard(ui)
        console.log(renderWizardResult(result))
      } finally {
        ui.close()
      }
      return true
    }
    case 'config-check':
      printBanner()
      console.log(renderValidationResult(validateConfig()))
      return true
    default:
      return false
  }
}

async function runInteractiveMode() {
  const ui = createConsoleUi()
  let shuttingDown = false
  let lastOutput = ''

  const redraw = () => {
    printBanner()
    if (lastOutput) {
      ui.print(lastOutput)
    }
    printMainMenu()
  }

  const setLastOutput = (value) => {
    lastOutput = value
    redraw()
  }

  const performShutdown = async (reason) => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    try {
      await shutdownInteractiveSession(ui, reason)
    } finally {
      ui.close()
    }
  }

  const sigintHandler = async () => {
    await performShutdown('收到中断信号')
    process.exit(0)
  }

  const sigtermHandler = async () => {
    await performShutdown('收到终止信号')
    process.exit(0)
  }

  process.on('SIGINT', sigintHandler)
  process.on('SIGTERM', sigtermHandler)

  try {
    while (true) {
      redraw()
      const answer = await ui.choose('请选择操作', [
        { name: '查看服务状态', value: '1' },
        { name: '启动服务', value: '2' },
        { name: '重启服务', value: '3' },
        { name: '停止服务', value: '4' },
        { name: '查看服务日志', value: '5' },
        { name: '一键安装环境', value: '6' },
        { name: '初始化配置文件', value: '7' },
        { name: '一键引导填写配置文件', value: '8' },
        { name: '管理配置分组', value: '9' },
        { name: '校验配置', value: '10' },
        { name: '退出', value: '11' },
      ])

      if (isExitAnswer(String(answer))) {
        await performShutdown('已退出控制台管理平台')
        return
      }

      switch (answer) {
        case '1':
          lastOutput = renderStatusTable(getStatusRows(loadState()))
          break
        case '2':
          lastOutput = await handleStart(ui, setLastOutput)
          break
        case '3':
          lastOutput = await handleRestart(ui, setLastOutput)
          break
        case '4':
          lastOutput = await handleStop(ui, setLastOutput)
          break
        case '5':
          lastOutput = await handleLogs(ui)
          break
        case '6':
          lastOutput = await installEnvironment(({ steps, activeStepId }) => {
            setLastOutput(renderInstallProgress(steps, activeStepId))
          }).then((result) => renderInstallResults(result))
          break
        case '7':
          lastOutput = await handleInitConfig(ui)
          break
        case '8':
          lastOutput = await handleConfigWizard(ui, setLastOutput)
          break
        case '9':
          lastOutput = await handleConfigManagement(ui, setLastOutput)
          break
        case '10':
          lastOutput = renderValidationResult(validateConfig())
          break
        default:
          lastOutput = '\n无效输入，请重新选择。\n'
          break
      }
    }
  } finally {
    process.off('SIGINT', sigintHandler)
    process.off('SIGTERM', sigtermHandler)
    if (!shuttingDown) {
      ui.close()
    }
  }
}

async function main() {
  const { action, target } = parseArgs(process.argv.slice(2))
  const handled = await runDirectCommand(action, target || 'all')
  if (handled) {
    process.exit(0)
  }
  await runInteractiveMode()
}

await main()
