import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import dotenv from 'dotenv'

import { createApp } from './src/app.mjs'
import { initializeAdminBackoffice } from './src/admin-backoffice.mjs'
import { initializeRobotGenerationService } from './src/robot-generation-service.mjs'
import { initializeStorage } from './src/storage.mjs'

const currentDir = dirname(fileURLToPath(import.meta.url))

// Prefer service-local env, then backfill any missing keys from the project root env.
dotenv.config({ path: resolve(currentDir, '.env') })
dotenv.config({ path: resolve(currentDir, '..', '.env') })

const PORT = Number(process.env.PORT || 3000)
const app = createApp()

initializeStorage()
  .then(() => initializeAdminBackoffice())
  .then(() => initializeRobotGenerationService())
  .then(() => {
    createServer(app).listen(PORT)
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
