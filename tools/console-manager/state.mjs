import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(currentDir, '..', '..')
const managerHome = join(repoRoot, '.console-manager')
const logsDir = join(managerHome, 'logs')
const stateFile = join(managerHome, 'state.json')
const serviceIds = ['chat', 'main', 'agent', 'upload']

mkdirSync(logsDir, { recursive: true })

function freshState() {
  return {
    version: 1,
    services: Object.fromEntries(
      serviceIds.map((id) => [
        id,
        {
          id,
          status: 'stopped',
          pid: null,
          startedAt: '',
          command: '',
          cwd: '',
          logFile: logPathFor(id),
          lastExitCode: null,
        },
      ]),
    ),
  }
}

function normalizeState(raw) {
  const base = freshState()
  for (const id of serviceIds) {
    const current = raw?.services?.[id] ?? {}
    base.services[id] = {
      ...base.services[id],
      status: typeof current.status === 'string' ? current.status : 'stopped',
      pid: typeof current.pid === 'number' ? current.pid : null,
      startedAt: typeof current.startedAt === 'string' ? current.startedAt : '',
      command: typeof current.command === 'string' ? current.command : '',
      cwd: typeof current.cwd === 'string' ? current.cwd : '',
      logFile: typeof current.logFile === 'string' ? current.logFile : logPathFor(id),
      lastExitCode:
        typeof current.lastExitCode === 'number' || current.lastExitCode === null
          ? current.lastExitCode
          : null,
    }
  }
  return base
}

export function loadState() {
  if (!existsSync(stateFile)) {
    return freshState()
  }

  try {
    return normalizeState(JSON.parse(readFileSync(stateFile, 'utf8')))
  } catch {
    return freshState()
  }
}

export function saveState(state) {
  writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`)
}

export function updateServiceState(state, id, patch) {
  state.services[id] = {
    ...state.services[id],
    ...patch,
  }
  saveState(state)
}

export function logPathFor(id) {
  return join(logsDir, `${id}.log`)
}

export function getManagerPaths() {
  return {
    repoRoot,
    managerHome,
    logsDir,
    stateFile,
  }
}

export function getServiceIds() {
  return [...serviceIds]
}
