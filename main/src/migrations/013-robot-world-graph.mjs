async function tableExists(context, tableName) {
  try {
    await context.describeTable(tableName)
    return true
  } catch {
    return false
  }
}

export async function up({ context, Sequelize }) {
  if (!(await tableExists(context, 'robot_world_graphs'))) {
    await context.createTable('robot_world_graphs', {
      id: {
        type: Sequelize.STRING(120),
        primaryKey: true,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      robot_id: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false,
        defaultValue: '',
      },
      summary: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      graph_version: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      calendar_json: {
        type: Sequelize.TEXT('long'),
        allowNull: false,
      },
      last_layout_json: {
        type: Sequelize.TEXT('long'),
        allowNull: false,
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
    await context.addIndex('robot_world_graphs', ['user_id', 'robot_id'], {
      unique: true,
      name: 'robot_world_graphs_user_robot_unique',
    })
  }

  if (!(await tableExists(context, 'robot_world_relation_types'))) {
    await context.createTable('robot_world_relation_types', {
      id: {
        type: Sequelize.STRING(120),
        primaryKey: true,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      robot_id: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      code: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      label: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      directionality: {
        type: Sequelize.STRING(24),
        allowNull: false,
        defaultValue: 'directed',
      },
      source_object_types_json: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      target_object_types_json: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      is_builtin: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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
    await context.addIndex('robot_world_relation_types', ['user_id', 'robot_id', 'code'], {
      unique: true,
      name: 'robot_world_relation_types_user_robot_code_unique',
    })
  }
}

export async function down({ context }) {
  if (await tableExists(context, 'robot_world_relation_types')) {
    await context.dropTable('robot_world_relation_types')
  }
  if (await tableExists(context, 'robot_world_graphs')) {
    await context.dropTable('robot_world_graphs')
  }
}
