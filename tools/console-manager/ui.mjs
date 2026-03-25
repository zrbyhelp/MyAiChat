import figlet from 'figlet'
import { checkbox, confirm, input, select } from '@inquirer/prompts'
import logUpdate from 'log-update'
import ora from 'ora'

import { maskValue } from './config.mjs'

const bannerText = figlet.textSync('MyAiChat', {
  font: 'Standard',
  horizontalLayout: 'default',
  verticalLayout: 'default',
  whitespaceBreak: true,
})
const bannerColors = [
  '\x1b[38;5;225m',
  '\x1b[38;5;219m',
  '\x1b[38;5;213m',
  '\x1b[38;5;207m',
  '\x1b[38;5;213m',
  '\x1b[38;5;219m',
]
const reset = '\x1b[0m'
const animalAnimations = [
  {
    name: 'cat',
    frames: ['=^.^=', '=^o^=', '=^_^='],
  },
  {
    name: 'rabbit',
    frames: ['(\\_/)', '(/_\\)', '(\\_/)'],
  },
  {
    name: 'bear',
    frames: ['ʕ•ᴥ•ʔ', 'ʕ •ᴥ•ʔ'],
  },
  {
    name: 'dog',
    frames: ['U^ェ^U', 'U＾ェ＾U'],
  },
  {
    name: 'duck',
    frames: ['>(o )___', '>( o)___', '>(o  )___'],
  },
  {
    name: 'fish',
    frames: ['><(((°>', '><((°>'],
  },
  {
    name: 'hamster',
    frames: ['(•ㅅ•)', '( •ㅅ•)', '(•ㅅ• )'],
  },
]

export function createConsoleUi() {
  return {
    async choose(message, choices) {
      return select({
        message,
        choices,
        pageSize: Math.min(Math.max(choices.length, 6), 12),
      })
    },
    async chooseMany(message, choices) {
      return checkbox({
        message,
        choices,
        pageSize: Math.min(Math.max(choices.length, 8), 14),
      })
    },
    async input(message, defaultValue = '', validate) {
      const answer = await input({
        message,
        default: defaultValue,
        validate,
      })
      return String(answer ?? '').trim()
    },
    async confirm(message, defaultValue = false) {
      return confirm({
        message,
        default: defaultValue,
      })
    },
    print(message = '') {
      console.log(message)
    },
    close() {
      return undefined
    },
  }
}

export function printBanner() {
  console.clear()
  const bannerLines = bannerText.split('\n')
  bannerLines.forEach((line, index) => {
    const color = bannerColors[index % bannerColors.length]
    console.log(`${color}${line}${reset}`)
  })
  console.log('')
}

export function printMainMenu() {
  console.log('使用 ↑ ↓ 选择，回车确认；多选场景使用空格勾选')
  console.log('')
}

export function renderConfigGroupDetail(group) {
  const lines = ['', group.label, `${group.description}`]
  for (const field of group.fields) {
    const value = field.sensitive ? maskValue(field.value) : field.value || '(空)'
    lines.push(`- ${field.label} [${field.key}] = ${value}`)
  }
  lines.push('')
  return lines.join('\n')
}

export function renderStatusTable(rows) {
  const lines = ['', '当前服务状态']
  for (const row of rows) {
    lines.push(`- ${row.label}(${row.id}) | 状态: ${row.status} | PID: ${row.pid ?? '-'} | 启动时间: ${row.startedAt || '-'}`)
  }
  lines.push('')
  return lines.join('\n')
}

export function printStatusTable(rows) {
  console.log(renderStatusTable(rows))
}

export function renderActionResults(title, results) {
  const lines = [``, title]
  for (const result of results) {
    lines.push(`- ${result.message}`)
  }
  lines.push('')
  return lines.join('\n')
}

export function printActionResults(title, results) {
  console.log(renderActionResults(title, results))
}

export function renderAccessAddresses(addresses) {
  const lines = ['访问地址']
  if (addresses.length === 0) {
    lines.push('- 当前所选服务没有可展示的访问地址', '')
    return lines.join('\n')
  }

  for (const item of addresses) {
    lines.push(`- ${item.label}(${item.id}): ${item.url}`)
  }
  lines.push('')
  return lines.join('\n')
}

export function printAccessAddresses(addresses) {
  console.log(renderAccessAddresses(addresses))
}

export function renderLog(id, label, lines) {
  const output = [``, `${label}(${id}) 最近日志`]
  if (lines.length === 0) {
    output.push('- 暂无日志')
  } else {
    output.push(...lines)
  }
  output.push('')
  return output.join('\n')
}

export function printLog(id, label, lines) {
  console.log(renderLog(id, label, lines))
}

export function printConfigGroups(groups) {
  console.log('\n配置分组')
  groups.forEach((group, index) => {
    console.log(`${index + 1}. ${group.label} - ${group.description}`)
  })
  console.log('')
}

export function printConfigGroupDetail(group) {
  console.log(renderConfigGroupDetail(group))
}

export function renderValidationResult(result) {
  const lines = ['']
  if (result.issues.length === 0) {
    lines.push('配置校验通过，未发现问题。', '')
    return lines.join('\n')
  }

  lines.push(result.ok ? '配置校验完成，存在警告：' : '配置校验失败，请先处理以下问题：')
  for (const issue of result.issues) {
    lines.push(`- [${issue.level}] ${issue.key}: ${issue.message}`)
  }
  lines.push('')
  return lines.join('\n')
}

export function printValidationResult(result) {
  console.log(renderValidationResult(result))
}

export function renderInstallResults(result) {
  const lines = ['', '环境安装结果']
  for (const item of result.results) {
    const status = item.ok ? '成功' : '失败'
    lines.push(`- ${item.label}: ${status}，${item.summary}`)
    if (item.logFile) {
      lines.push(`  日志: ${item.logFile}`)
    }
  }
  lines.push('')
  return lines.join('\n')
}

export function renderInstallProgress(steps, activeStepId = '') {
  const total = steps.length || 1
  const completed = steps.filter((step) => step.status === 'success' || step.status === 'failed').length
  const filled = Math.min(24, Math.round((completed / total) * 24))
  const bar = `${'█'.repeat(filled)}${'░'.repeat(24 - filled)}`
  const lines = ['', `安装进度 [${bar}] ${completed}/${total}`]

  for (const step of steps) {
    let marker = '·'
    if (step.status === 'running') {
      marker = '>'
    } else if (step.status === 'success') {
      marker = '√'
    } else if (step.status === 'failed') {
      marker = '×'
    }

    let line = `${marker} ${step.label}`
    if (step.status === 'running') {
      line += '：安装中...'
    } else if (step.status === 'success') {
      line += '：已完成'
    } else if (step.status === 'failed') {
      line += '：失败'
    } else {
      line += '：等待中'
    }

    if (step.summary && (step.status === 'success' || step.status === 'failed')) {
      line += `，${step.summary}`
    }
    if (activeStepId && step.id === activeStepId && step.status === 'running') {
      line += ' 请稍候'
    }
    lines.push(`- ${line}`)
  }

  lines.push('')
  return lines.join('\n')
}

function createSeededRandom(seed) {
  let state = Math.abs(Number(seed) || 1) % 2147483647
  if (state === 0) {
    state = 1
  }
  return () => {
    state = (state * 48271) % 2147483647
    return state / 2147483647
  }
}

function buildAnimalParty(seed) {
  const random = createSeededRandom(seed)
  const animals = [...animalAnimations]
    .sort(() => random() - 0.5)
    .slice(0, 2 + Math.floor(random() * 3))
  if (animals.length === 0) {
    return animalAnimations.slice(0, 2)
  }
  return animals
}

function renderAnimalFrame(animals, frameIndex) {
  const topLine = animals
    .map((animal, index) => {
      const frame = animal.frames[(frameIndex + index) % animal.frames.length]
      return `${' '.repeat((frameIndex + index * 2) % 6)}${frame}`
    })
    .join('   ')

  const bottomLine = animals
    .map((_, index) => `${' '.repeat((frameIndex + index) % 8)}˙⋆✦`)
    .join('   ')

  return ['', '小动物正在忙碌中...', topLine, bottomLine, ''].join('\n')
}

export function createOperationAnimator(actionLabel, targetLabel) {
  const seed = Date.now()
  const animals = buildAnimalParty(seed)
  const spinner = ora({
    text: `正在${actionLabel}：${targetLabel}`,
    spinner: 'dots12',
    discardStdin: false,
    hideCursor: false,
  })
  let frameIndex = 0
  let timer = null

  return {
    start() {
      printBanner()
      spinner.start()
      logUpdate(renderAnimalFrame(animals, frameIndex))
      timer = setInterval(() => {
        frameIndex += 1
        logUpdate(renderAnimalFrame(animals, frameIndex))
      }, 120)
    },
    stop() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
      spinner.stop()
      logUpdate.clear()
      logUpdate.done()
    },
    succeed(text) {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
      logUpdate.clear()
      spinner.succeed(text)
      logUpdate.done()
    },
    fail(text) {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
      logUpdate.clear()
      spinner.fail(text)
      logUpdate.done()
    },
  }
}

export function printInstallResults(result) {
  console.log(renderInstallResults(result))
}

export function renderWizardResult(result) {
  const lines = ['']
  if (!result.saved) {
    lines.push('配置向导已取消，未写入任何文件。', '')
    return lines.join('\n')
  }

  lines.push('配置向导已完成，已写入文件：')
  for (const file of result.updatedFiles) {
    lines.push(`- ${file}`)
  }
  lines.push('')
  return lines.join('\n')
}

export function printWizardResult(result) {
  console.log(renderWizardResult(result))
}
