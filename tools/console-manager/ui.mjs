import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

import { maskValue } from './config.mjs'

export function createConsoleUi() {
  const rl = readline.createInterface({ input, output })

  return {
    async ask(question) {
      return (await rl.question(question)).trim()
    },
    print(message = '') {
      console.log(message)
    },
    close() {
      rl.close()
    },
  }
}

export function printBanner() {
  console.clear()
  console.log('========================================')
  console.log(' MyAiChat 控制台管理平台')
  console.log(' 中文友好 | 批量启动 | 配置分组管理')
  console.log('========================================')
  console.log('')
}

export function printMainMenu() {
  console.log('主菜单')
  console.log('1. 查看服务状态')
  console.log('2. 启动服务')
  console.log('3. 重启服务')
  console.log('4. 停止服务')
  console.log('5. 查看服务日志')
  console.log('6. 一键安装环境')
  console.log('7. 初始化配置文件')
  console.log('8. 一键引导填写配置文件')
  console.log('9. 管理配置分组')
  console.log('10. 校验配置')
  console.log('11. 退出')
  console.log('')
}

export function printStatusTable(rows) {
  console.log('')
  console.log('当前服务状态')
  for (const row of rows) {
    console.log(
      `- ${row.label}(${row.id}) | 状态: ${row.status} | PID: ${row.pid ?? '-'} | 启动时间: ${row.startedAt || '-'}`,
    )
  }
  console.log('')
}

export function printActionResults(title, results) {
  console.log(`\n${title}`)
  for (const result of results) {
    console.log(`- ${result.message}`)
  }
  console.log('')
}

export function printAccessAddresses(addresses) {
  console.log('访问地址')
  if (addresses.length === 0) {
    console.log('- 当前所选服务没有可展示的访问地址')
    console.log('')
    return
  }

  for (const item of addresses) {
    console.log(`- ${item.label}(${item.id}): ${item.url}`)
  }
  console.log('')
}

export function printLog(id, label, lines) {
  console.log(`\n${label}(${id}) 最近日志`)
  if (lines.length === 0) {
    console.log('- 暂无日志')
  } else {
    for (const line of lines) {
      console.log(line)
    }
  }
  console.log('')
}

export function printConfigGroups(groups) {
  console.log('\n配置分组')
  groups.forEach((group, index) => {
    console.log(`${index + 1}. ${group.label} - ${group.description}`)
  })
  console.log('')
}

export function printConfigGroupDetail(group) {
  console.log(`\n${group.label}`)
  for (const field of group.fields) {
    const value = field.sensitive ? maskValue(field.value) : field.value || '(空)'
    console.log(`- ${field.label} [${field.key}] = ${value}`)
  }
  console.log('')
}

export function printValidationResult(result) {
  console.log('')
  if (result.issues.length === 0) {
    console.log('配置校验通过，未发现问题。')
    console.log('')
    return
  }

  console.log(result.ok ? '配置校验完成，存在警告：' : '配置校验失败，请先处理以下问题：')
  for (const issue of result.issues) {
    console.log(`- [${issue.level}] ${issue.key}: ${issue.message}`)
  }
  console.log('')
}

export function printInstallResults(result) {
  console.log('\n环境安装结果')
  for (const item of result.results) {
    const status = item.ok ? '成功' : '失败'
    console.log(`- ${item.label}: ${status}，${item.summary}`)
    if (item.logFile) {
      console.log(`  日志: ${item.logFile}`)
    }
  }
  console.log('')
}

export function printWizardResult(result) {
  console.log('')
  if (!result.saved) {
    console.log('配置向导已取消，未写入任何文件。')
    console.log('')
    return
  }

  console.log('配置向导已完成，已写入文件：')
  for (const file of result.updatedFiles) {
    console.log(`- ${file}`)
  }
  console.log('')
}
