export async function up({ context, Sequelize }) {
  const robotTable = await context.describeTable('robots')
  if (!robotTable.structured_memory_interval) {
    await context.addColumn('robots', 'structured_memory_interval', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 3,
    })
  }
  if (!robotTable.structured_memory_history_limit) {
    await context.addColumn('robots', 'structured_memory_history_limit', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 12,
    })
  }

  const sessionTable = await context.describeTable('sessions')
  if (!sessionTable.robot_structured_memory_interval) {
    await context.addColumn('sessions', 'robot_structured_memory_interval', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 3,
    })
  }
  if (!sessionTable.robot_structured_memory_history_limit) {
    await context.addColumn('sessions', 'robot_structured_memory_history_limit', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 12,
    })
  }
  if (!sessionTable.structured_memory_interval) {
    await context.addColumn('sessions', 'structured_memory_interval', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 3,
    })
  }
  if (!sessionTable.structured_memory_history_limit) {
    await context.addColumn('sessions', 'structured_memory_history_limit', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 12,
    })
  }
}

export async function down({ context }) {
  const sessionTable = await context.describeTable('sessions')
  if (sessionTable.structured_memory_history_limit) {
    await context.removeColumn('sessions', 'structured_memory_history_limit')
  }
  if (sessionTable.structured_memory_interval) {
    await context.removeColumn('sessions', 'structured_memory_interval')
  }
  if (sessionTable.robot_structured_memory_history_limit) {
    await context.removeColumn('sessions', 'robot_structured_memory_history_limit')
  }
  if (sessionTable.robot_structured_memory_interval) {
    await context.removeColumn('sessions', 'robot_structured_memory_interval')
  }

  const robotTable = await context.describeTable('robots')
  if (robotTable.structured_memory_history_limit) {
    await context.removeColumn('robots', 'structured_memory_history_limit')
  }
  if (robotTable.structured_memory_interval) {
    await context.removeColumn('robots', 'structured_memory_interval')
  }
}
