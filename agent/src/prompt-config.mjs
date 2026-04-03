import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import YAML from 'yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))

let cachedPromptConfig = null
let cachedPromptPathsKey = ''

function getDefaultPromptPaths() {
  return [
    process.env.AGENT_PROMPTS_PATH,
    resolve(__dirname, '..', 'shared', 'prompts.yaml'),
  ].filter(Boolean)
}

export function getPromptConfig() {
  const promptPaths = getDefaultPromptPaths()
  const cacheKey = promptPaths.join('||')
  if (cachedPromptConfig && cacheKey === cachedPromptPathsKey) {
    return cachedPromptConfig
  }

  let lastError = null
  for (const filePath of promptPaths) {
    try {
      const source = readFileSync(filePath, 'utf8')
      cachedPromptConfig = YAML.parse(source) || {}
      cachedPromptPathsKey = cacheKey
      return cachedPromptConfig
    } catch (error) {
      lastError = error
    }
  }

  throw new Error(
    `Prompt config file not found. Tried: ${promptPaths.join(', ')}. ${
      lastError instanceof Error ? lastError.message : ''
    }`.trim(),
  )
}

export function resetPromptConfigCache() {
  cachedPromptConfig = null
  cachedPromptPathsKey = ''
}

export function getPromptDefaults() {
  const config = getPromptConfig()
  return {
    common_prompt: String(config?.defaults?.common_prompt || ''),
    system_prompt: String(config?.defaults?.system_prompt || ''),
  }
}
