async function tableHasColumn(context, tableName, columnName) {
  try {
    const definition = await context.describeTable(tableName)
    return Boolean(definition?.[columnName])
  } catch {
    return false
  }
}

export async function up({ context, Sequelize }) {
  if (!(await tableHasColumn(context, 'sessions', 'session_world_graph_json'))) {
    await context.addColumn('sessions', 'session_world_graph_json', {
      type: Sequelize.TEXT('long'),
      allowNull: true,
    })
  }
}

export async function down({ context }) {
  if (await tableHasColumn(context, 'sessions', 'session_world_graph_json')) {
    await context.removeColumn('sessions', 'session_world_graph_json')
  }
}
