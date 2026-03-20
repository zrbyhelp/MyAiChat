import { createServer } from 'node:http'

import { createApp } from './src/app.mjs'
import { ensureDataFiles } from './src/storage.mjs'

const PORT = Number(process.env.PORT || 3000)
const app = createApp()

ensureDataFiles()
  .then(() => {
    createServer(app).listen(PORT, () => {
      console.log(`AI server running at http://127.0.0.1:${PORT}`)
    })
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
