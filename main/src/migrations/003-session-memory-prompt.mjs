import { DEFAULT_MEMORY_PROMPT } from '../constants.mjs'

export async function up({ context, Sequelize }) {
  const table = await context.describeTable('sessions')
  if (!table.memory_prompt) {
    await context.addColumn('sessions', 'memory_prompt', {
      type: Sequelize.TEXT,
      allowNull: false,
      defaultValue: DEFAULT_MEMORY_PROMPT,
    })
  }
}

export async function down({ context }) {
  await context.removeColumn('sessions', 'memory_prompt')
}
