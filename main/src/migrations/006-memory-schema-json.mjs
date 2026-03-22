export async function up({ context, Sequelize }) {
  const table = await context.describeTable('robots')
  if (!table.memory_schema_json) {
    await context.addColumn('robots', 'memory_schema_json', {
      type: Sequelize.TEXT('long'),
      allowNull: true,
    })
    await context.sequelize.query(
      `UPDATE robots SET memory_schema_json='{"categories":[]}' WHERE memory_schema_json IS NULL OR memory_schema_json = ''`,
    )
  }

  const sessionTable = await context.describeTable('sessions')
  if (!sessionTable.memory_schema_json) {
    await context.addColumn('sessions', 'memory_schema_json', {
      type: Sequelize.TEXT('long'),
      allowNull: true,
    })
    await context.sequelize.query(
      `UPDATE sessions SET memory_schema_json='{"categories":[]}' WHERE memory_schema_json IS NULL OR memory_schema_json = ''`,
    )
  }
}

export async function down({ context }) {
  const table = await context.describeTable('sessions')
  if (table.memory_schema_json) {
    await context.removeColumn('sessions', 'memory_schema_json')
  }

  const robotTable = await context.describeTable('robots')
  if (robotTable.memory_schema_json) {
    await context.removeColumn('robots', 'memory_schema_json')
  }
}
