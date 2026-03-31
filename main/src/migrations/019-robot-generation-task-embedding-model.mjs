async function tableHasColumn(context, tableName, columnName) {
  try {
    const definition = await context.describeTable(tableName)
    return Boolean(definition?.[columnName])
  } catch {
    return false
  }
}

export async function up({ context }) {
  if (!(await tableHasColumn(context, 'robot_generation_tasks', 'embedding_model_config_id'))) {
    await context.addColumn('robot_generation_tasks', 'embedding_model_config_id', {
      type: 'VARCHAR(120)',
      allowNull: false,
      defaultValue: '',
    })
  }
}

export async function down({ context }) {
  if (await tableHasColumn(context, 'robot_generation_tasks', 'embedding_model_config_id')) {
    await context.removeColumn('robot_generation_tasks', 'embedding_model_config_id')
  }
}
