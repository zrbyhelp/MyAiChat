async function tableHasColumn(context, tableName, columnName) {
  try {
    const definition = await context.describeTable(tableName)
    return Boolean(definition?.[columnName])
  } catch {
    return false
  }
}

export async function up({ context }) {
  if (!(await tableHasColumn(context, 'sessions', 'reply_mode'))) {
    await context.addColumn('sessions', 'reply_mode', {
      type: 'VARCHAR(40)',
      allowNull: false,
      defaultValue: 'default',
    })
  }
}

export async function down({ context }) {
  if (await tableHasColumn(context, 'sessions', 'reply_mode')) {
    await context.removeColumn('sessions', 'reply_mode')
  }
}
