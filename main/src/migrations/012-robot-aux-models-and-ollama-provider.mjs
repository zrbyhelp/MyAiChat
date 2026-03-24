export async function up({ context }) {
  const robotTable = await context.describeTable('robots')
  if (!robotTable.memory_model_config_id) {
    await context.addColumn('robots', 'memory_model_config_id', {
      type: 'VARCHAR(120)',
      allowNull: false,
      defaultValue: '',
    })
  }
  if (!robotTable.numeric_computation_model_config_id) {
    await context.addColumn('robots', 'numeric_computation_model_config_id', {
      type: 'VARCHAR(120)',
      allowNull: false,
      defaultValue: '',
    })
  }
  if (!robotTable.form_option_model_config_id) {
    await context.addColumn('robots', 'form_option_model_config_id', {
      type: 'VARCHAR(120)',
      allowNull: false,
      defaultValue: '',
    })
  }

  const sessionTable = await context.describeTable('sessions')
  if (!sessionTable.robot_memory_model_config_id) {
    await context.addColumn('sessions', 'robot_memory_model_config_id', {
      type: 'VARCHAR(120)',
      allowNull: false,
      defaultValue: '',
    })
  }
  if (!sessionTable.robot_numeric_computation_model_config_id) {
    await context.addColumn('sessions', 'robot_numeric_computation_model_config_id', {
      type: 'VARCHAR(120)',
      allowNull: false,
      defaultValue: '',
    })
  }
  if (!sessionTable.robot_form_option_model_config_id) {
    await context.addColumn('sessions', 'robot_form_option_model_config_id', {
      type: 'VARCHAR(120)',
      allowNull: false,
      defaultValue: '',
    })
  }
}

export async function down({ context }) {
  const sessionTable = await context.describeTable('sessions')
  if (sessionTable.robot_form_option_model_config_id) {
    await context.removeColumn('sessions', 'robot_form_option_model_config_id')
  }
  if (sessionTable.robot_numeric_computation_model_config_id) {
    await context.removeColumn('sessions', 'robot_numeric_computation_model_config_id')
  }
  if (sessionTable.robot_memory_model_config_id) {
    await context.removeColumn('sessions', 'robot_memory_model_config_id')
  }

  const robotTable = await context.describeTable('robots')
  if (robotTable.form_option_model_config_id) {
    await context.removeColumn('robots', 'form_option_model_config_id')
  }
  if (robotTable.numeric_computation_model_config_id) {
    await context.removeColumn('robots', 'numeric_computation_model_config_id')
  }
  if (robotTable.memory_model_config_id) {
    await context.removeColumn('robots', 'memory_model_config_id')
  }
}
