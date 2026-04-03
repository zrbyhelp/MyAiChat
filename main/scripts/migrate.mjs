import 'dotenv/config'

import { initializeDatabase } from '../src/sequelize.mjs'

try {
  await initializeDatabase()
  process.exit(0)
} catch (error) {
  console.error(error)
  process.exit(1)
}
