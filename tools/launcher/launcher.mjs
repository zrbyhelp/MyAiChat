import { spawn, spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')
const launcherHome = join(repoRoot, '.launcher')
const logsDir = join(launcherHome, 'logs')
const stateFile = join(launcherHome, 'state.json')

mkdirSync(logsDir, { recursive: true })

const isWindows = process.platform === 'win32'
const npmCommand = isWindows ? 'npm.cmd' : 'npm'
const pnpmCommand = isWindows ? 'pnpm.cmd' : 'pnpm'
const knownServices = ['chat', 'main', 'agent']

const agentPython = detectPythonCommand()

const serviceDefinitions = {
  chat: {
    id: 'chat',
    label: 'Chat',
    cwd: join(repoRoot, 'chat'),
    command: pnpmCommand,
    args: ['dev'],
    shellCommand: 'pnpm dev',
    env: {},
  },
  main: {
    id: 'main',
    label: 'Main',
    cwd: join(repoRoot, 'main'),
    command: npmCommand,
    args: ['run', 'dev'],
    shellCommand: 'npm run dev',
    env: {},
  },
  agent: {
    id: 'agent',
    label: 'Agent',
    cwd: join(repoRoot, 'agent'),
    command: agentPython.command,
    args: [...agentPython.args, '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000', '--reload'],
    shellCommand: `${agentPython.command}${agentPython.args.length ? ` ${agentPython.args.join(' ')}` : ''} -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload`,
    env: {
      AGENT_STORAGE_DRIVER: 'file',
      AGENT_FILE_STORE_DIR: join(repoRoot, 'agent', '.state'),
    },
  },
}

let servicesState = loadState()
const activeChildren = new Map()
let shuttingDown = false

refreshStoredStatuses()
saveState()

function detectPythonCommand() {
  if (process.platform === 'win32') {
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
  if (commandExists('python')) {
    return { command: 'python', args: [] }
  }
  return { command: 'python3', args: [] }
}

function commandExists(command) {
  const probe = process.platform === 'win32' ? 'where' : 'which'
  const result = spawnSync(probe, [command], { stdio: 'ignore' })
  return result.status === 0
}

function loadState() {
  if (!existsSync(stateFile)) {
    return freshState()
  }

  try {
    const parsed = JSON.parse(readFileSync(stateFile, 'utf8'))
    return normalizeState(parsed)
  } catch {
    return freshState()
  }
}

function freshState() {
  return normalizeState({ version: 1, services: {} })
}

function normalizeState(state) {
  const next = {
    version: 1,
    services: {},
  }

  for (const id of knownServices) {
    const current = state?.services?.[id] || {}
    next.services[id] = {
      id,
      status: String(current.status || 'stopped'),
      pid: typeof current.pid === 'number' ? current.pid : null,
      startedAt: typeof current.startedAt === 'string' ? current.startedAt : '',
      lastExitCode:
        typeof current.lastExitCode === 'number' || current.lastExitCode === null
          ? current.lastExitCode
          : null,
      command: current.command || serviceDefinitions[id].command,
      args: Array.isArray(current.args) ? current.args : serviceDefinitions[id].args,
      cwd: current.cwd || serviceDefinitions[id].cwd,
      logFile: current.logFile || logPathFor(id),
    }
  }

  return next
}

function logPathFor(id) {
  return join(logsDir, `${id}.log`)
}

function saveState() {
  writeFileSync(stateFile, `${JSON.stringify(servicesState, null, 2)}\n`)
}

function setServiceState(id, patch) {
  servicesState.services[id] = {
    ...servicesState.services[id],
    ...patch,
  }
  saveState()
}

function printBanner() {
  console.clear()
  console.log('MyAiChat Launcher')
  console.log('Managed services: chat, main, agent')
  console.log('Commands: open <service|all>, restart <service|all>, close <service|all>, status, logs <service>, help, exit')
  console.log('')
}

function printStatus() {
  refreshStoredStatuses()
  console.log('')
  for (const id of knownServices) {
    const service = servicesState.services[id]
    const line = [
      `[${id}]`,
      `status=${service.status}`,
      service.pid ? `pid=${service.pid}` : 'pid=-',
      service.startedAt ? `started=${service.startedAt}` : 'started=-',
    ].join(' ')
    console.log(line)
  }
  console.log('')
}

function refreshStoredStatuses() {
  for (const id of knownServices) {
    const service = servicesState.services[id]
    if (service.pid && !activeChildren.has(id) && !isProcessRunning(service.pid)) {
      servicesState.services[id] = {
        ...service,
        status: 'stopped',
        pid: null,
      }
    }
  }
}

async function openServices(target) {
  const ids = expandTarget(target)
  for (const id of ids) {
    await openService(id)
  }
}

async function restartServices(target) {
  const ids = expandTarget(target)
  for (const id of ids) {
    await restartService(id)
  }
}

async function closeServices(target) {
  const ids = expandTarget(target)
  for (const id of ids) {
    await closeService(id)
  }
}

function expandTarget(target) {
  if (!target || target === 'all') {
    return [...knownServices]
  }
  if (!knownServices.includes(target)) {
    throw new Error(`Unknown service: ${target}`)
  }
  return [target]
}

async function openService(id) {
  const definition = serviceDefinitions[id]
  const serviceState = servicesState.services[id]
  if (activeChildren.has(id)) {
    console.log(`[${id}] already running in current launcher`)
    return
  }
  if (serviceState.status === 'running' && serviceState.pid && isProcessRunning(serviceState.pid)) {
    console.log(`[${id}] already running with pid ${serviceState.pid}`)
    return
  }

  if (serviceState.pid && !isProcessRunning(serviceState.pid)) {
    setServiceState(id, { status: 'stopped', pid: null })
  }

  const logFile = logPathFor(id)
  appendLog(logFile, `\n=== ${new Date().toISOString()} starting ${id} ===\n`)
  setServiceState(id, {
    status: 'starting',
    pid: null,
    command: definition.command,
    args: definition.args,
    cwd: definition.cwd,
    logFile,
  })

  let child
  try {
    const spawnSpec = createSpawnSpec(definition)
    child = spawn(spawnSpec.command, spawnSpec.args, spawnSpec.options)
  } catch (error) {
    setServiceState(id, {
      status: 'errored',
      pid: null,
    })
    appendLog(logFile, `\n=== ${new Date().toISOString()} spawn error ${error instanceof Error ? error.message : String(error)} ===\n`)
    console.error(`[${id}] failed to start: ${error instanceof Error ? error.message : String(error)}`)
    return
  }

  activeChildren.set(id, child)

  if (!isWindows) {
    child.unref()
  }

  child.stdout?.on('data', (chunk) => appendLog(logFile, chunk))
  child.stderr?.on('data', (chunk) => appendLog(logFile, chunk))

  child.on('spawn', () => {
    const startedAt = new Date().toISOString()
    setServiceState(id, {
      status: 'running',
      pid: child.pid ?? null,
      startedAt,
      lastExitCode: null,
    })
    console.log(`[${id}] started (pid ${child.pid ?? '-'})`)
  })

  child.on('exit', (code, signal) => {
    activeChildren.delete(id)
    const status = shuttingDown ? 'stopped' : code === 0 ? 'stopped' : 'errored'
    setServiceState(id, {
      status,
      pid: null,
      lastExitCode: typeof code === 'number' ? code : null,
    })
    appendLog(logFile, `\n=== ${new Date().toISOString()} exited code=${code ?? 'null'} signal=${signal ?? 'null'} ===\n`)
    if (!shuttingDown) {
      console.log(`[${id}] exited (${status})`)
    }
  })

  child.on('error', (error) => {
    activeChildren.delete(id)
    setServiceState(id, {
      status: 'errored',
      pid: null,
    })
    appendLog(logFile, `\n=== ${new Date().toISOString()} error ${error.message} ===\n`)
    console.error(`[${id}] failed to start: ${error.message}`)
  })
}

function createSpawnSpec(definition) {
  const env = {
    ...process.env,
    ...definition.env,
  }

  if (isWindows) {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', definition.shellCommand || `${definition.command} ${definition.args.join(' ')}`],
      options: {
        cwd: definition.cwd,
        env,
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    }
  }

  return {
    command: definition.command,
    args: definition.args,
    options: {
      cwd: definition.cwd,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  }
}

async function restartService(id) {
  await closeService(id)
  await openService(id)
}

async function closeService(id) {
  const currentChild = activeChildren.get(id)
  const currentPid = currentChild?.pid ?? servicesState.services[id].pid

  if (!currentPid) {
    setServiceState(id, { status: 'stopped', pid: null })
    console.log(`[${id}] already stopped`)
    return
  }

  setServiceState(id, { status: 'stopping' })
  await killProcessTree(currentPid)

  if (currentChild) {
    activeChildren.delete(id)
  }

  setServiceState(id, {
    status: 'stopped',
    pid: null,
    lastExitCode: 0,
  })
  console.log(`[${id}] stopped`)
}

function isProcessRunning(pid) {
  if (!pid) {
    return false
  }

  if (process.platform === 'win32') {
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

function killProcessTree(pid) {
  return new Promise((resolvePromise) => {
    if (!pid) {
      resolvePromise()
      return
    }

    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })
      killer.on('exit', () => resolvePromise())
      killer.on('error', () => resolvePromise())
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

    const startedAt = Date.now()
    const timer = setInterval(() => {
      if (!isProcessRunning(pid) || Date.now() - startedAt > 5000) {
        clearInterval(timer)
        if (isProcessRunning(pid)) {
          try {
            process.kill(-pid, 'SIGKILL')
          } catch {
            try {
              process.kill(pid, 'SIGKILL')
            } catch {
              // ignore
            }
          }
        }
        resolvePromise()
      }
    }, 200)
  })
}

function appendLog(filePath, chunk) {
  appendFileSync(filePath, Buffer.isBuffer(chunk) ? chunk : String(chunk))
}

function printHelp() {
  console.log('')
  console.log('open <chat|main|agent|all>     start service(s)')
  console.log('restart <chat|main|agent|all>  restart service(s)')
  console.log('close <chat|main|agent|all>    stop service(s)')
  console.log('status                         show current status')
  console.log('logs <chat|main|agent>         show recent log lines')
  console.log('clear-logs                     remove launcher logs')
  console.log('exit                           stop all managed services and exit')
  console.log('')
}

function showLogs(id) {
  if (!knownServices.includes(id)) {
    throw new Error(`Unknown service: ${id}`)
  }
  const filePath = logPathFor(id)
  if (!existsSync(filePath)) {
    console.log(`[${id}] no logs yet`)
    return
  }
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/).slice(-40)
  console.log(`\n--- ${id} logs ---`)
  console.log(lines.join('\n'))
  console.log('--- end ---\n')
}

function clearLogs() {
  rmSync(logsDir, { recursive: true, force: true })
  mkdirSync(logsDir, { recursive: true })
  for (const id of knownServices) {
    setServiceState(id, { logFile: logPathFor(id) })
  }
  console.log('logs cleared')
}

async function runCommand(argv) {
  const [action, target] = argv
  switch (action) {
    case undefined:
      return false
    case 'open':
      await openServices(target || 'all')
      return true
    case 'restart':
      await restartServices(target || 'all')
      return true
    case 'close':
      await closeServices(target || 'all')
      return true
    case 'status':
      printStatus()
      return true
    case 'logs':
      showLogs(target || 'chat')
      return true
    case 'help':
      printHelp()
      return true
    case 'clear-logs':
      clearLogs()
      return true
    case 'exit':
    case 'quit':
      await shutdown()
      process.exit(0)
      return true
    default:
      console.log(`Unknown command: ${action}`)
      printHelp()
      return true
  }
}

async function shutdown() {
  if (shuttingDown) {
    return
  }
  shuttingDown = true
  const runningIds = [...knownServices].filter((id) => activeChildren.has(id) || servicesState.services[id].pid)
  for (const id of runningIds) {
    try {
      await closeService(id)
    } catch {
      // ignore shutdown cleanup failures
    }
  }
}

process.on('SIGINT', async () => {
  await shutdown()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await shutdown()
  process.exit(0)
})

process.on('exit', () => {
  shuttingDown = true
})

async function main() {
  printBanner()

  const handled = await runCommand(process.argv.slice(2))
  if (handled && process.argv.length > 2) {
    return
  }

  printStatus()
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'launcher> ',
  })

  rl.prompt()
  rl.on('line', async (line) => {
    const trimmed = line.trim()
    if (!trimmed) {
      rl.prompt()
      return
    }

    try {
      await runCommand(trimmed.split(/\s+/))
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
    }
    rl.prompt()
  })

  rl.on('close', async () => {
    await shutdown()
    process.exit(0)
  })
}

await main()
