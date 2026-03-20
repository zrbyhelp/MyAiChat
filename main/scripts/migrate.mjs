import 'dotenv/config'

import { initializeDatabase } from '../src/sequelize.mjs'

try {
  await initializeDatabase()
  console.log('Database migrations completed successfully.')
  process.exit(0)
} catch (error) {
  console.error(error)
  process.exit(1)
}
