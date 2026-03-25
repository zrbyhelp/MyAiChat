import {
  readCurrentConfig,
  getConfigGroupsWithValues,
  getEnvFileMap,
  initializeEnvFiles,
  updateConfigGroup,
  validateConfig,
} from './config.mjs'
import { installEnvironment } from './installer.mjs'
import {
  createConsoleUi,
  printActionResults,
  printAccessAddresses,
  printBanner,
  printConfigGroupDetail,
  printConfigGroups,
  printInstallResults,
  printLog,
  printMainMenu,
  printStatusTable,
  printValidationResult,
  printWizardResult,
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
    printActionResults('关闭结果', results)
  }
}

async function promptServiceSelection(ui, actionLabel) {
  const services = getServiceDefinitions()
  ui.print(`\n请选择要${actionLabel}的服务，可输入 all / 全部 或逗号分隔的编号。`)
  services.forEach((service, index) => {
    ui.print(`${index + 1}. ${service.label} (${service.id})`)
  })
  ui.print('')
  const answer = await ui.ask(`${actionLabel}目标: `)
  if (!answer) {
    return []
  }
  if (['all', '全部'].includes(answer.toLowerCase())) {
    return services.map((service) => service.id)
  }

  const numericSelection = answer
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  if (numericSelection.every((item) => /^\d+$/.test(item))) {
    const ids = numericSelection.map((item) => services[Number(item) - 1]?.id).filter(Boolean)
    return [...new Set(ids)]
  }

  return parseServiceTarget(answer)
}

async function handleStart(ui) {
  const ids = await promptServiceSelection(ui, '启动')
  if (ids.length === 0) {
    ui.print('\n未选择任何服务。\n')
    return
  }
  const { results } = startServices(ids, loadState())
  printActionResults(`已执行启动：${getServiceSelectionSummary(ids)}`, results)
  printAccessAddresses(buildAccessAddresses(ids))
}

async function handleRestart(ui) {
  const ids = await promptServiceSelection(ui, '重启')
  if (ids.length === 0) {
    ui.print('\n未选择任何服务。\n')
    return
  }
  const { results } = await restartServices(ids, loadState())
  printActionResults(`已执行重启：${getServiceSelectionSummary(ids)}`, results)
  printAccessAddresses(buildAccessAddresses(ids))
}

async function handleStop(ui) {
  const ids = await promptServiceSelection(ui, '停止')
  if (ids.length === 0) {
    ui.print('\n未选择任何服务。\n')
    return
  }
  const { results } = await stopServices(ids, loadState())
  printActionResults(`已执行停止：${getServiceSelectionSummary(ids)}`, results)
}

async function handleLogs(ui) {
  const ids = await promptServiceSelection(ui, '查看日志')
  if (ids.length !== 1) {
    ui.print('\n查看日志时请只选择一个服务。\n')
    return
  }
  const id = ids[0]
  printLog(id, getServiceLabel(id), readRecentLog(id))
}

async function handleInitConfig(ui) {
  const results = initializeEnvFiles()
  const envFiles = getEnvFileMap()
  ui.print('\n配置初始化结果')
  for (const result of results) {
    ui.print(`- ${result.created ? '已创建' : '已存在'}: ${envFiles[result.fileKey]}`)
  }
  ui.print('')
}

async function handleInstallEnvironment(ui) {
  ui.print('\n开始执行一键安装环境，请稍候...\n')
  const result = await installEnvironment()
  printInstallResults(result)
}

async function handleConfigWizard(ui) {
  ui.print('\n开始执行配置向导，请按提示填写。\n')
  const result = await runConfigWizard(ui)
  printWizardResult(result)
}

async function handleConfigManagement(ui) {
  while (true) {
    const groups = getConfigGroupsWithValues()
    printConfigGroups(groups)
    const answer = await ui.ask('选择配置分组编号，或输入 back 返回: ')
    if (!answer || answer.toLowerCase() === 'back') {
      ui.print('')
      return
    }

    const index = Number(answer)
    const group = groups[index - 1]
    if (!group) {
      ui.print('\n无效的配置分组编号。\n')
      continue
    }

    printConfigGroupDetail(group)
    const updates = {}
    for (const field of group.fields) {
      const currentValue = field.value || ''
      const prompt = `${field.label} [当前: ${field.sensitive ? '已隐藏' : currentValue || '(空)'}]，留空保持不变: `
      const nextValue = await ui.ask(prompt)
      if (nextValue !== '') {
        updates[field.key] = nextValue
      }
    }

    if (Object.keys(updates).length === 0) {
      ui.print('\n未修改任何配置项。\n')
      continue
    }

    const updatedGroup = updateConfigGroup(group.id, updates)
    ui.print('\n配置已更新。')
    printConfigGroupDetail(updatedGroup)
  }
}

async function runDirectCommand(action, target) {
  switch (action) {
    case 'status':
      printBanner()
      printStatusTable(getStatusRows(loadState()))
      return true
    case 'start': {
      const ids = parseServiceTarget(target)
      printBanner()
      const { results } = startServices(ids, loadState(), { detachedMode: true })
      printActionResults(`已执行启动：${getServiceSelectionSummary(ids)}`, results)
      printAccessAddresses(buildAccessAddresses(ids))
      return true
    }
    case 'restart': {
      const ids = parseServiceTarget(target)
      printBanner()
      const { results } = await restartServicesDetached(ids, loadState())
      printActionResults(`已执行重启：${getServiceSelectionSummary(ids)}`, results)
      printAccessAddresses(buildAccessAddresses(ids))
      return true
    }
    case 'stop':
    case 'close': {
      const ids = parseServiceTarget(target)
      printBanner()
      const { results } = await stopServices(ids, loadState())
      printActionResults(`已执行停止：${getServiceSelectionSummary(ids)}`, results)
      return true
    }
    case 'logs': {
      const ids = parseServiceTarget(target)
      if (ids.length !== 1) {
        throw new Error('logs 命令只能查看单个服务日志')
      }
      printBanner()
      printLog(ids[0], getServiceLabel(ids[0]), readRecentLog(ids[0]))
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
      printInstallResults(result)
      return true
    }
    case 'wizard-config': {
      printBanner()
      const ui = createConsoleUi()
      try {
        const result = await runConfigWizard(ui)
        printWizardResult(result)
      } finally {
        ui.close()
      }
      return true
    }
    case 'config-check':
      printBanner()
      printValidationResult(validateConfig())
      return true
    default:
      return false
  }
}

async function runInteractiveMode() {
  const ui = createConsoleUi()
  printBanner()
  let shuttingDown = false

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
      printMainMenu()
      const answer = await ui.ask('请输入菜单编号: ')

      if (isExitAnswer(answer)) {
        await performShutdown('已退出控制台管理平台')
        return
      }

      switch (answer) {
        case '1':
          printStatusTable(getStatusRows(loadState()))
          break
        case '2':
          await handleStart(ui)
          break
        case '3':
          await handleRestart(ui)
          break
        case '4':
          await handleStop(ui)
          break
        case '5':
          await handleLogs(ui)
          break
        case '6':
          await handleInstallEnvironment(ui)
          break
        case '7':
          await handleInitConfig(ui)
          break
        case '8':
          await handleConfigWizard(ui)
          break
        case '9':
          await handleConfigManagement(ui)
          break
        case '10':
          printValidationResult(validateConfig())
          break
        default:
          ui.print('\n无效输入，请重新选择。\n')
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
