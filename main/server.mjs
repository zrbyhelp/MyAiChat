import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import dotenv from 'dotenv'

import { createApp } from './src/app.mjs'
import { initializeStorage } from './src/storage.mjs'

const currentDir = dirname(fileURLToPath(import.meta.url))

// Prefer service-local env, then backfill any missing keys from the project root env.
dotenv.config({ path: resolve(currentDir, '.env') })
dotenv.config({ path: resolve(currentDir, '..', '.env') })

const PORT = Number(process.env.PORT || 3000)
const app = createApp()

initializeStorage()
  .then(() => {
    createServer(app).listen(PORT, () => {
      console.log(`AI server running at http://127.0.0.1:${PORT}`)
    })
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
