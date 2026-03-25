import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

import { getManagerPaths, getServiceIds, loadState, logPathFor, saveState, updateServiceState } from './state.mjs'

const { repoRoot } = getManagerPaths()
const isWindows = process.platform === 'win32'
const npmCommand = isWindows ? 'npm.cmd' : 'npm'
const pnpmCommand = isWindows ? 'pnpm.cmd' : 'pnpm'
const activeChildren = new Map()
let shutdownInProgress = null

function quoteWindowsArg(value) {
  const text = String(value ?? '')
  if (text.length === 0) {
    return '""'
  }
  if (!/[\s"]/u.test(text)) {
    return text
  }
  return `"${text.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`
}

function commandExists(command) {
  const probe = isWindows ? 'where' : 'which'
  const result = spawnSync(probe, [command], { stdio: 'ignore' })
  return result.status === 0
}

function detectPython() {
  if (isWindows) {
    if (commandExists('python')) {
      return { command: 'python', args: [] }
    }
    if (commandExists('py')) {
      return { command: 'py', args: ['-3'] }
    }
    return { command: 'python', args: [] }
  }

  if (commandExists('python3')) {
    return { command: 'python3', args: [] }
  }
  return { command: 'python', args: [] }
}

const pythonCommand = detectPython()

const serviceDefinitions = {
  chat: {
    id: 'chat',
    label: '前端',
    cwd: join(repoRoot, 'chat'),
    command: pnpmCommand,
    args: ['dev'],
    env: {},
  },
  main: {
    id: 'main',
    label: '网关',
    cwd: join(repoRoot, 'main'),
    command: npmCommand,
    args: ['run', 'dev'],
    env: {},
  },
  agent: {
    id: 'agent',
    label: '智能体',
    cwd: join(repoRoot, 'agent'),
    command: pythonCommand.command,
    args: [...pythonCommand.args, '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000', '--reload'],
    env: {
      AGENT_STORAGE_DRIVER: 'file',
      AGENT_FILE_STORE_DIR: join(repoRoot, 'agent', '.state'),
    },
  },
  upload: {
    id: 'upload',
    label: '上传',
    cwd: join(repoRoot, 'upload'),
    command: npmCommand,
    args: ['run', 'dev'],
    env: {},
  },
}

function listServiceResidualPids(id) {
  if (!isWindows) {
    return []
  }

  if (id === 'chat') {
    const result = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        "$patterns = @('dev-vite.mjs','vite.config.mjs'); Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine -like '*dev-vite.mjs*' } | Select-Object -ExpandProperty ProcessId",
      ],
      { encoding: 'utf8', windowsHide: true },
    )
    if (result.status !== 0) {
      return []
    }
    return String(result.stdout || '')
      .split(/\r?\n/)
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0)
  }

  if (id === 'main') {
    return listListeningPidsByPort(3000)
  }

  if (id === 'upload') {
    return listListeningPidsByPort(3001)
  }

  if (id === 'agent') {
    return listListeningPidsByPort(8000)
  }

  return []
}

function listListeningPidsByPort(port) {
  const result = spawnSync('netstat', ['-ano'], { encoding: 'utf8', windowsHide: true })
  if (result.status !== 0) {
    return []
  }
  return String(result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes(`:${port}`) && line.includes('LISTENING'))
    .map((line) => Number(line.split(/\s+/).at(-1)))
    .filter((pid) => Number.isInteger(pid) && pid > 0)
}

function stderrLogPathFor(id) {
  return logPathFor(id).replace(/\.log$/i, '.err.log')
}

function spawnDetachedViaPowerShell(definition, logFile) {
  const envCommands = Object.entries(definition.env || {})
    .map(([key, value]) => `$env:${key} = '${String(value ?? '').replace(/'/g, "''")}'`)
    .join('; ')
  const commandLine = [definition.command, ...definition.args].map((part) => `'${String(part).replace(/'/g, "''")}'`).join(', ')
  const script = [
    '$ErrorActionPreference = "Stop"',
    envCommands,
    `$p = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d','/s','/c', ${[definition.command, ...definition.args].map((part) => `'${String(part).replace(/'/g, "''")}'`).join(" + ' ' + ")}) -WorkingDirectory '${definition.cwd.replace(/'/g, "''")}' -WindowStyle Hidden -RedirectStandardOutput '${logFile.replace(/'/g, "''")}' -RedirectStandardError '${stderrLogPathFor(definition.id).replace(/'/g, "''")}' -PassThru`,
    'Write-Output $p.Id',
  ]
    .filter(Boolean)
    .join('; ')

  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
  })

  if (result.status !== 0) {
    throw new Error(String(result.stderr || result.stdout || 'Start-Process 启动失败').trim())
  }

  const pid = Number(String(result.stdout || '').trim())
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error('未获取到后台进程 PID')
  }

  return {
    pid,
    unref() {},
  }
}

function spawnManagedCommand(definition, logFile) {
  mkdirSync(dirname(logFile), { recursive: true })
  appendLog(logFile, `\n=== ${new Date().toISOString()} 启动 ${definition.id} ===\n`)
  appendLog(stderrLogPathFor(definition.id), `\n=== ${new Date().toISOString()} 启动 ${definition.id} ===\n`)

  if (isWindows) {
    const env = {
      ...process.env,
      ...definition.env,
    }
    const commandLine = [definition.command, ...definition.args].map(quoteWindowsArg).join(' ')
    const child = spawn('cmd.exe', ['/d', '/s', '/c', commandLine], {
      cwd: definition.cwd,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env,
    })
    child.stdout?.on('data', (chunk) => appendLog(logFile, chunk))
    child.stderr?.on('data', (chunk) => appendLog(stderrLogPathFor(definition.id), chunk))
    return child
  }

  const child = spawn(definition.command, definition.args, {
    cwd: definition.cwd,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ...definition.env,
    },
  })
  child.stdout?.on('data', (chunk) => appendLog(logFile, chunk))
  child.stderr?.on('data', (chunk) => appendLog(stderrLogPathFor(definition.id), chunk))
  return child
}

function attachChildLifecycle(id, child, state) {
  activeChildren.set(id, child)
  child.on('exit', (code) => {
    activeChildren.delete(id)
    updateServiceState(state, id, {
      status: typeof code === 'number' && code === 0 ? 'stopped' : 'errored',
      pid: null,
      lastExitCode: typeof code === 'number' ? code : null,
    })
  })
  child.on('error', (error) => {
    activeChildren.delete(id)
    updateServiceState(state, id, {
      status: 'errored',
      pid: null,
    })
    appendLog(logPathFor(id), `\n=== ${new Date().toISOString()} 进程错误 ${error.message} ===\n`)
  })
}

export function getServiceDefinitions() {
  return Object.values(serviceDefinitions).map((service) => ({ ...service }))
}

export function getServiceLabel(id) {
  return serviceDefinitions[id]?.label || id
}

export function getServiceSelectionSummary(ids) {
  return ids.map((id) => `${getServiceLabel(id)}(${id})`).join('、')
}

export function parseServiceTarget(input) {
  const allIds = getServiceIds()
  const normalized = String(input || '').trim()
  if (!normalized || normalized.toLowerCase() === 'all' || normalized === '全部') {
    return allIds
  }

  const tokens = normalized.split(',').map((item) => item.trim()).filter(Boolean)
  const aliases = {
    chat: 'chat',
    前端: 'chat',
    main: 'main',
    网关: 'main',
    agent: 'agent',
    智能体: 'agent',
    upload: 'upload',
    上传: 'upload',
  }

  const ids = []
  for (const token of tokens) {
    const mapped = aliases[token] || aliases[token.toLowerCase()]
    if (!mapped || !allIds.includes(mapped)) {
      throw new Error(`未知服务标识：${token}`)
    }
    if (!ids.includes(mapped)) {
      ids.push(mapped)
    }
  }
  return ids
}

export function isProcessRunning(pid) {
  if (!pid) {
    return false
  }

  if (isWindows) {
    const result = spawnSync('tasklist', ['/FI', `PID eq ${pid}`], { encoding: 'utf8' })
    return result.status === 0 && result.stdout.includes(String(pid))
  }

  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function refreshState(state = loadState()) {
  for (const id of getServiceIds()) {
    const service = state.services[id]
    if (activeChildren.has(id)) {
      continue
    }
    if (service.pid && !isProcessRunning(service.pid)) {
      state.services[id] = {
        ...service,
        status: service.status === 'running' ? 'stopped' : service.status,
        pid: null,
      }
    }
  }
  saveState(state)
  return state
}

export function getStatusRows(state = loadState()) {
  const nextState = refreshState(state)
  return getServiceIds().map((id) => {
    const definition = serviceDefinitions[id]
    const current = nextState.services[id]
    return {
      id,
      label: definition.label,
      status: current.status,
      pid: current.pid,
      startedAt: current.startedAt,
      logFile: current.logFile || logPathFor(id),
    }
  })
}

export function startServices(ids, state = loadState(), options = {}) {
  const nextState = refreshState(state)
  const results = []
  const detachedMode = options.detachedMode === true

  for (const id of ids) {
    const definition = serviceDefinitions[id]
    const current = nextState.services[id]
    if (activeChildren.has(id) || (current.pid && isProcessRunning(current.pid))) {
      results.push({ id, ok: true, skipped: true, message: `${definition.label} 已在运行` })
      continue
    }

    const logFile = logPathFor(id)
    try {
      const child =
        detachedMode && isWindows
          ? spawnDetachedViaPowerShell(definition, logFile)
          : spawnManagedCommand(definition, logFile)
      child.unref()
      updateServiceState(nextState, id, {
        status: 'running',
        pid: child.pid ?? null,
        startedAt: new Date().toISOString(),
        command: [definition.command, ...definition.args].join(' '),
        cwd: definition.cwd,
        logFile,
        lastExitCode: null,
      })
      if (!detachedMode && typeof child.on === 'function') {
        attachChildLifecycle(id, child, nextState)
      }
      results.push({ id, ok: true, skipped: false, message: `${definition.label} 已启动` })
    } catch (error) {
      updateServiceState(nextState, id, {
        status: 'errored',
        pid: null,
        command: [definition.command, ...definition.args].join(' '),
        cwd: definition.cwd,
        logFile,
      })
      appendLog(logFile, `\n=== ${new Date().toISOString()} 启动失败 ${error instanceof Error ? error.message : String(error)} ===\n`)
      results.push({
        id,
        ok: false,
        skipped: false,
        message: `${definition.label} 启动失败：${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }

  return {
    state: nextState,
    results,
  }
}

function killProcessTree(pid) {
  return new Promise((resolvePromise) => {
    if (!pid) {
      resolvePromise()
      return
    }

    if (isWindows) {
      const child = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })
      child.on('exit', () => {
        const startedAt = Date.now()
        const timer = setInterval(() => {
          if (!isProcessRunning(pid) || Date.now() - startedAt > 5000) {
            clearInterval(timer)
            resolvePromise()
          }
        }, 200)
      })
      child.on('error', () => resolvePromise())
      return
    }

    try {
      process.kill(-pid, 'SIGTERM')
    } catch {
      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        resolvePromise()
        return
      }
    }

    setTimeout(() => resolvePromise(), 800)
  })
}

export async function stopServices(ids, state = loadState()) {
  const nextState = refreshState(state)
  const results = []

  for (const id of ids) {
    const definition = serviceDefinitions[id]
    const current = nextState.services[id]
    const activeChild = activeChildren.get(id)
    const residualPids = listServiceResidualPids(id).filter((pid) => pid !== current.pid && pid !== activeChild?.pid)

    if (!activeChildren.has(id) && (!current.pid || !isProcessRunning(current.pid)) && residualPids.length === 0) {
      updateServiceState(nextState, id, {
        status: 'stopped',
        pid: null,
      })
      results.push({ id, ok: true, skipped: true, message: `${definition.label} 当前未运行` })
      continue
    }

    updateServiceState(nextState, id, { status: 'stopping' })
    if (activeChild?.pid) {
      await killProcessTree(activeChild.pid)
      activeChildren.delete(id)
    } else if (current.pid) {
      await killProcessTree(current.pid)
    }

    for (const residualPid of residualPids) {
      await killProcessTree(residualPid)
    }

    updateServiceState(nextState, id, {
      status: 'stopped',
      pid: null,
      lastExitCode: 0,
    })
    appendLog(current.logFile || logPathFor(id), `\n=== ${new Date().toISOString()} 手动停止 ${definition.id} ===\n`)
    results.push({ id, ok: true, skipped: false, message: `${definition.label} 已停止` })
  }

  return {
    state: nextState,
    results,
  }
}

export async function restartServices(ids, state = loadState()) {
  const stopped = await stopServices(ids, state)
  const started = startServices(ids, stopped.state)
  return {
    state: started.state,
    results: [...stopped.results, ...started.results],
  }
}

export async function restartServicesDetached(ids, state = loadState()) {
  const stopped = await stopServices(ids, state)
  const started = startServices(ids, stopped.state, { detachedMode: true })
  return {
    state: started.state,
    results: [...stopped.results, ...started.results],
  }
}

export async function shutdownManagedServices() {
  if (shutdownInProgress) {
    return shutdownInProgress
  }

  shutdownInProgress = stopServices(getServiceIds(), loadState())
    .catch(() => ({
      state: loadState(),
      results: [],
    }))
    .finally(() => {
      shutdownInProgress = null
    })

  return shutdownInProgress
}

export function readRecentLog(id, lineCount = 40) {
  const filePath = logPathFor(id)
  const errorLogFile = stderrLogPathFor(id)
  const segments = []
  if (existsSync(filePath)) {
    segments.push(readFileSync(filePath, 'utf8'))
  }
  if (existsSync(errorLogFile)) {
    segments.push(readFileSync(errorLogFile, 'utf8'))
  }
  if (segments.length === 0) {
    return []
  }
  return segments.join('\n').split(/\r?\n/).slice(-lineCount)
}

function appendLog(filePath, content) {
  appendFileSync(filePath, String(content))
}
