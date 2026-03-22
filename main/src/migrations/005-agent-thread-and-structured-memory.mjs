export async function up({ context, Sequelize }) {
  const table = await context.describeTable('sessions')

  if (!table.thread_id) {
    await context.addColumn('sessions', 'thread_id', {
      type: Sequelize.STRING(160),
      allowNull: false,
      defaultValue: '',
    })
  }

  if (!table.structured_memory_json) {
    await context.addColumn('sessions', 'structured_memory_json', {
      type: Sequelize.TEXT('long'),
      allowNull: false,
    })

    await context.sequelize.query(`
      UPDATE sessions
      SET structured_memory_json = '{"updatedAt":"","preferences":[],"facts":[],"tasks":[]}'
      WHERE structured_memory_json IS NULL OR structured_memory_json = ''
    `)
  }
}

export async function down({ context }) {
  const table = await context.describeTable('sessions')

  if (table.structured_memory_json) {
    await context.removeColumn('sessions', 'structured_memory_json')
  }

  if (table.thread_id) {
    await context.removeColumn('sessions', 'thread_id')
  }
}
