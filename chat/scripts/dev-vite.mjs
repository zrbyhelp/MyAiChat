import childProcess from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const originalExec = childProcess.exec

childProcess.exec = function patchedExec(command, options, callback) {
  const normalizedCommand = String(command || '').trim().toLowerCase()
  if (normalizedCommand === 'net use') {
    const cb = typeof options === 'function' ? options : callback
    queueMicrotask(() => cb?.(new Error('net use disabled for local dev'), '', ''))
    return {
      pid: 0,
      kill() {},
    }
  }

  return originalExec.call(this, command, options, callback)
}

process.argv = [
  process.argv[0],
  resolve(import.meta.dirname, '../node_modules/vite/bin/vite.js'),
  ...process.argv.slice(2),
]

const viteCliUrl = pathToFileURL(resolve(import.meta.dirname, '../node_modules/vite/bin/vite.js')).href
await import(viteCliUrl)
