export async function up({ context }) {
  const robotTable = await context.describeTable('robots')
  if (!robotTable.common_prompt) {
    await context.addColumn('robots', 'common_prompt', {
      type: 'TEXT',
      allowNull: false,
      defaultValue: '',
    })
  }

  const sessionTable = await context.describeTable('sessions')
  if (!sessionTable.robot_common_prompt) {
    await context.addColumn('sessions', 'robot_common_prompt', {
      type: 'TEXT',
      allowNull: false,
      defaultValue: '',
    })
  }
}

export async function down({ context }) {
  const sessionTable = await context.describeTable('sessions')
  if (sessionTable.robot_common_prompt) {
    await context.removeColumn('sessions', 'robot_common_prompt')
  }

  const robotTable = await context.describeTable('robots')
  if (robotTable.common_prompt) {
    await context.removeColumn('robots', 'common_prompt')
  }
}
