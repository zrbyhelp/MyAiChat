export async function up({ context, Sequelize }) {
  await context.addColumn('model_configs', 'access_mode', {
    type: Sequelize.STRING(32),
    allowNull: false,
    defaultValue: 'server',
  })
}

export async function down({ context }) {
  await context.removeColumn('model_configs', 'access_mode')
}
