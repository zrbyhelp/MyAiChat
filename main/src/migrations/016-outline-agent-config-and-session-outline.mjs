async function tableHasColumn(context, tableName, columnName) {
  try {
    const definition = await context.describeTable(tableName)
    return Boolean(definition?.[columnName])
  } catch {
    return false
  }
}

export async function up({ context, Sequelize }) {
  if (!(await tableHasColumn(context, 'robots', 'outline_model_config_id'))) {
    await context.addColumn('robots', 'outline_model_config_id', {
      type: 'VARCHAR(120)',
      allowNull: false,
      defaultValue: '',
    })
  }

  if (!(await tableHasColumn(context, 'sessions', 'robot_outline_model_config_id'))) {
    await context.addColumn('sessions', 'robot_outline_model_config_id', {
      type: 'VARCHAR(120)',
      allowNull: false,
      defaultValue: '',
    })
  }

  if (!(await tableHasColumn(context, 'sessions', 'story_outline'))) {
    await context.addColumn('sessions', 'story_outline', {
      type: Sequelize.TEXT('long'),
      allowNull: true,
    })

    await context.bulkUpdate(
      'sessions',
      { story_outline: '' },
      { story_outline: null },
    )

    await context.changeColumn('sessions', 'story_outline', {
      type: Sequelize.TEXT('long'),
      allowNull: false,
    })
  }
}

export async function down({ context }) {
  if (await tableHasColumn(context, 'sessions', 'story_outline')) {
    await context.removeColumn('sessions', 'story_outline')
  }

  if (await tableHasColumn(context, 'sessions', 'robot_outline_model_config_id')) {
    await context.removeColumn('sessions', 'robot_outline_model_config_id')
  }

  if (await tableHasColumn(context, 'robots', 'outline_model_config_id')) {
    await context.removeColumn('robots', 'outline_model_config_id')
  }
}
