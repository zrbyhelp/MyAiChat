async function tableExists(context, tableName) {
  try {
    await context.describeTable(tableName)
    return true
  } catch {
    return false
  }
}

async function columnExists(context, tableName, columnName) {
  try {
    const table = await context.describeTable(tableName)
    return Boolean(table[columnName])
  } catch {
    return false
  }
}

async function indexExists(context, tableName, indexName) {
  try {
    const indexes = await context.showIndex(tableName)
    return indexes.some((index) => index.name === indexName)
  } catch {
    return false
  }
}

export async function up({ context, Sequelize }) {
  if (!(await tableExists(context, 'users'))) {
    await context.createTable('users', {
      id: {
        type: Sequelize.STRING(120),
        primaryKey: true,
        allowNull: false,
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      display_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      avatar_url: {
        type: Sequelize.STRING(1024),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    })
  }

  if (!(await columnExists(context, 'model_configs', 'user_id'))) {
    await context.addColumn('model_configs', 'user_id', {
      type: Sequelize.STRING(120),
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })
  }

  if (!(await columnExists(context, 'robots', 'user_id'))) {
    await context.addColumn('robots', 'user_id', {
      type: Sequelize.STRING(120),
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })
  }

  if (!(await columnExists(context, 'sessions', 'user_id'))) {
    await context.addColumn('sessions', 'user_id', {
      type: Sequelize.STRING(120),
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })
  }

  if (!(await indexExists(context, 'model_configs', 'model_configs_user_id_idx'))) {
    await context.addIndex('model_configs', ['user_id'], { name: 'model_configs_user_id_idx' })
  }
  if (!(await indexExists(context, 'robots', 'robots_user_id_idx'))) {
    await context.addIndex('robots', ['user_id'], { name: 'robots_user_id_idx' })
  }
  if (!(await indexExists(context, 'sessions', 'sessions_user_id_updated_at_idx'))) {
    await context.addIndex('sessions', ['user_id', 'updated_at'], { name: 'sessions_user_id_updated_at_idx' })
  }
}

export async function down({ context }) {
  await context.removeIndex('sessions', 'sessions_user_id_updated_at_idx')
  await context.removeIndex('robots', 'robots_user_id_idx')
  await context.removeIndex('model_configs', 'model_configs_user_id_idx')
  await context.removeColumn('sessions', 'user_id')
  await context.removeColumn('robots', 'user_id')
  await context.removeColumn('model_configs', 'user_id')
  await context.dropTable('users')
}
