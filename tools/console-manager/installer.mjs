import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

import { initializeEnvFiles } from './config.mjs'
import { getManagerPaths } from './state.mjs'

const { managerHome, repoRoot } = getManagerPaths()
const installLogsDir = join(managerHome, 'install-logs')
const isWindows = process.platform === 'win32'
const npmCommand = isWindows ? 'npm.cmd' : 'npm'
const pnpmCommand = isWindows ? 'pnpm.cmd' : 'pnpm'

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

function detectPythonSpec() {
  if (isWindows) {
    return [
      { command: 'python', args: ['-m', 'pip', 'install', '-r', 'requirements.txt'] },
      { command: 'py', args: ['-3', '-m', 'pip', 'install', '-r', 'requirements.txt'] },
    ]
  }
  return [
    { command: 'python3', args: ['-m', 'pip', 'install', '-r', 'requirements.txt'] },
    { command: 'python', args: ['-m', 'pip', 'install', '-r', 'requirements.txt'] },
  ]
}

function stepDefinitions() {
  return [
    {
      id: 'config-init',
      label: '初始化配置文件',
      run: async () => {
        const results = initializeEnvFiles()
        return {
          ok: true,
          summary: results.map((item) => `${item.created ? '已创建' : '已存在'} ${item.path}`).join('；'),
        }
      },
    },
    {
      id: 'main-install',
      label: '安装 main 依赖',
      command: npmCommand,
      args: ['install'],
      cwd: join(repoRoot, 'main'),
    },
    {
      id: 'chat-install',
      label: '安装 chat 依赖',
      command: pnpmCommand,
      args: ['install'],
      cwd: join(repoRoot, 'chat'),
    },
    {
      id: 'upload-install',
      label: '安装 upload 依赖',
      command: npmCommand,
      args: ['install'],
      cwd: join(repoRoot, 'upload'),
    },
    {
      id: 'agent-install',
      label: '安装 agent Python 依赖',
      run: async () => {
        let lastError = null
        for (const spec of detectPythonSpec()) {
          const result = await runCommandStep({
            id: 'agent-install',
            label: '安装 agent Python 依赖',
            command: spec.command,
            args: spec.args,
            cwd: join(repoRoot, 'agent'),
          })
          if (result.ok) {
            return result
          }
          lastError = result
        }
        return lastError || {
          ok: false,
          summary: '未找到可用的 Python / pip',
          logFile: '',
        }
      },
    },
  ]
}

function logFilePathFor(id) {
  mkdirSync(installLogsDir, { recursive: true })
  return join(installLogsDir, `${id}.log`)
}

function runCommandStep(step) {
  return new Promise((resolve) => {
    const logFile = logFilePathFor(step.id)
    writeFileSync(logFile, `=== ${new Date().toISOString()} ${step.label} ===\n`)

    const child = isWindows
      ? spawn('cmd.exe', ['/d', '/s', '/c', [step.command, ...step.args].map(quoteWindowsArg).join(' ')], {
          cwd: step.cwd,
          env: process.env,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        })
      : spawn(step.command, step.args, {
          cwd: step.cwd,
          env: process.env,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        })

    let output = ''
    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString()
      output += text
      writeFileSync(logFile, text, { flag: 'a' })
    })
    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString()
      output += text
      writeFileSync(logFile, text, { flag: 'a' })
    })

    child.on('exit', (code) => {
      resolve({
        ok: code === 0,
        summary: code === 0 ? '安装完成' : `安装失败，退出码 ${code ?? 'null'}`,
        logFile,
        output: output.trim(),
      })
    })

    child.on('error', (error) => {
      writeFileSync(logFile, `\n${error.message}\n`, { flag: 'a' })
      resolve({
        ok: false,
        summary: error.message,
        logFile,
        output: output.trim(),
      })
    })
  })
}

export async function installEnvironment() {
  const results = []
  for (const step of stepDefinitions()) {
    if (typeof step.run === 'function') {
      const result = await step.run()
      results.push({
        id: step.id,
        label: step.label,
        ...result,
      })
      continue
    }

    const result = await runCommandStep(step)
    results.push({
      id: step.id,
      label: step.label,
      ...result,
    })
  }

  return {
    ok: results.every((item) => item.ok),
    results,
  }
}
