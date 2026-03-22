import { DEFAULT_MEMORY_PROMPT } from '../constants.mjs'

export async function up({ context, Sequelize }) {
  await context.addColumn('robots', 'memory_prompt', {
    type: Sequelize.TEXT,
    allowNull: false,
    defaultValue: DEFAULT_MEMORY_PROMPT,
  })

  await context.addColumn('sessions', 'robot_memory_prompt', {
    type: Sequelize.TEXT,
    allowNull: false,
    defaultValue: DEFAULT_MEMORY_PROMPT,
  })
}

export async function down({ context }) {
  await context.removeColumn('sessions', 'robot_memory_prompt')
  await context.removeColumn('robots', 'memory_prompt')
}
