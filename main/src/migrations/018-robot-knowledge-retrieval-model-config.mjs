async function tableHasColumn(context, tableName, columnName) {
  try {
    const definition = await context.describeTable(tableName)
    return Boolean(definition?.[columnName])
  } catch {
    return false
  }
}

export async function up({ context }) {
  if (!(await tableHasColumn(context, 'robots', 'knowledge_retrieval_model_config_id'))) {
    await context.addColumn('robots', 'knowledge_retrieval_model_config_id', {
      type: 'VARCHAR(120)',
      allowNull: false,
      defaultValue: '',
    })
  }

  if (!(await tableHasColumn(context, 'sessions', 'robot_knowledge_retrieval_model_config_id'))) {
    await context.addColumn('sessions', 'robot_knowledge_retrieval_model_config_id', {
      type: 'VARCHAR(120)',
      allowNull: false,
      defaultValue: '',
    })
  }
}

export async function down({ context }) {
  if (await tableHasColumn(context, 'sessions', 'robot_knowledge_retrieval_model_config_id')) {
    await context.removeColumn('sessions', 'robot_knowledge_retrieval_model_config_id')
  }

  if (await tableHasColumn(context, 'robots', 'knowledge_retrieval_model_config_id')) {
    await context.removeColumn('robots', 'knowledge_retrieval_model_config_id')
  }
}
