export async function up({ context }) {
  const robotTable = await context.describeTable('robots')
  if (!robotTable.world_graph_model_config_id) {
    await context.addColumn('robots', 'world_graph_model_config_id', {
      type: 'VARCHAR(120)',
      allowNull: false,
      defaultValue: '',
    })
  }

  const sessionTable = await context.describeTable('sessions')
  if (!sessionTable.robot_id) {
    await context.addColumn('sessions', 'robot_id', {
      type: 'VARCHAR(120)',
      allowNull: false,
      defaultValue: '',
    })
  }
  if (!sessionTable.robot_world_graph_model_config_id) {
    await context.addColumn('sessions', 'robot_world_graph_model_config_id', {
      type: 'VARCHAR(120)',
      allowNull: false,
      defaultValue: '',
    })
  }
}

export async function down({ context }) {
  const sessionTable = await context.describeTable('sessions')
  if (sessionTable.robot_world_graph_model_config_id) {
    await context.removeColumn('sessions', 'robot_world_graph_model_config_id')
  }
  if (sessionTable.robot_id) {
    await context.removeColumn('sessions', 'robot_id')
  }

  const robotTable = await context.describeTable('robots')
  if (robotTable.world_graph_model_config_id) {
    await context.removeColumn('robots', 'world_graph_model_config_id')
  }
}
