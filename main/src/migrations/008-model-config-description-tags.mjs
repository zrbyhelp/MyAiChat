export async function up({ context, Sequelize }) {
  const table = await context.describeTable('model_configs')

  if (!table.description) {
    await context.addColumn('model_configs', 'description', {
      type: Sequelize.TEXT,
      allowNull: false,
      defaultValue: '',
    })
  }

  if (!table.tags_json) {
    await context.addColumn('model_configs', 'tags_json', {
      type: Sequelize.TEXT,
      allowNull: false,
      defaultValue: '[]',
    })
  }
}

export async function down({ context }) {
  const table = await context.describeTable('model_configs')

  if (table.tags_json) {
    await context.removeColumn('model_configs', 'tags_json')
  }

  if (table.description) {
    await context.removeColumn('model_configs', 'description')
  }
}
