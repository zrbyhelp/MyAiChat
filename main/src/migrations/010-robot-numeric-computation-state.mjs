export async function up({ context, Sequelize }) {
  const robotTable = await context.describeTable('robots')
  if (!robotTable.numeric_computation_enabled) {
    await context.addColumn('robots', 'numeric_computation_enabled', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    })
  }
  if (!robotTable.numeric_computation_prompt) {
    await context.addColumn('robots', 'numeric_computation_prompt', {
      type: Sequelize.TEXT,
      allowNull: true,
    })
    await context.sequelize.query("UPDATE `robots` SET `numeric_computation_prompt` = '' WHERE `numeric_computation_prompt` IS NULL")
    await context.changeColumn('robots', 'numeric_computation_prompt', {
      type: Sequelize.TEXT,
      allowNull: false,
    })
  }
  if (!robotTable.numeric_computation_schema) {
    await context.addColumn('robots', 'numeric_computation_schema', {
      type: Sequelize.TEXT('long'),
      allowNull: true,
    })
    await context.sequelize.query("UPDATE `robots` SET `numeric_computation_schema` = '[]' WHERE `numeric_computation_schema` IS NULL")
    await context.changeColumn('robots', 'numeric_computation_schema', {
      type: Sequelize.TEXT('long'),
      allowNull: false,
    })
  }

  const sessionTable = await context.describeTable('sessions')
  if (!sessionTable.robot_numeric_computation_enabled) {
    await context.addColumn('sessions', 'robot_numeric_computation_enabled', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    })
  }
  if (!sessionTable.robot_numeric_computation_prompt) {
    await context.addColumn('sessions', 'robot_numeric_computation_prompt', {
      type: Sequelize.TEXT,
      allowNull: true,
    })
    await context.sequelize.query("UPDATE `sessions` SET `robot_numeric_computation_prompt` = '' WHERE `robot_numeric_computation_prompt` IS NULL")
    await context.changeColumn('sessions', 'robot_numeric_computation_prompt', {
      type: Sequelize.TEXT,
      allowNull: false,
    })
  }
  if (!sessionTable.robot_numeric_computation_schema) {
    await context.addColumn('sessions', 'robot_numeric_computation_schema', {
      type: Sequelize.TEXT('long'),
      allowNull: true,
    })
    await context.sequelize.query("UPDATE `sessions` SET `robot_numeric_computation_schema` = '[]' WHERE `robot_numeric_computation_schema` IS NULL")
    await context.changeColumn('sessions', 'robot_numeric_computation_schema', {
      type: Sequelize.TEXT('long'),
      allowNull: false,
    })
  }
  if (!sessionTable.numeric_state_json) {
    await context.addColumn('sessions', 'numeric_state_json', {
      type: Sequelize.TEXT('long'),
      allowNull: true,
    })
    await context.sequelize.query("UPDATE `sessions` SET `numeric_state_json` = '{}' WHERE `numeric_state_json` IS NULL")
    await context.changeColumn('sessions', 'numeric_state_json', {
      type: Sequelize.TEXT('long'),
      allowNull: false,
    })
  }
}

export async function down({ context }) {
  const sessionTable = await context.describeTable('sessions')
  if (sessionTable.numeric_state_json) {
    await context.removeColumn('sessions', 'numeric_state_json')
  }
  if (sessionTable.robot_numeric_computation_schema) {
    await context.removeColumn('sessions', 'robot_numeric_computation_schema')
  }
  if (sessionTable.robot_numeric_computation_prompt) {
    await context.removeColumn('sessions', 'robot_numeric_computation_prompt')
  }
  if (sessionTable.robot_numeric_computation_enabled) {
    await context.removeColumn('sessions', 'robot_numeric_computation_enabled')
  }

  const robotTable = await context.describeTable('robots')
  if (robotTable.numeric_computation_schema) {
    await context.removeColumn('robots', 'numeric_computation_schema')
  }
  if (robotTable.numeric_computation_prompt) {
    await context.removeColumn('robots', 'numeric_computation_prompt')
  }
  if (robotTable.numeric_computation_enabled) {
    await context.removeColumn('robots', 'numeric_computation_enabled')
  }
}
