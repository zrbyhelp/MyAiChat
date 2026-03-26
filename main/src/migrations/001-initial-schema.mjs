async function tableExists(context, tableName) {
  try {
    await context.describeTable(tableName)
    return true
  } catch {
    return false
  }
}

export async function up({ context, Sequelize }) {
  if (!(await tableExists(context, 'model_configs'))) {
    await context.createTable('model_configs', {
      id: {
        type: Sequelize.STRING(120),
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      provider: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      base_url: {
        type: Sequelize.STRING(1024),
        allowNull: false,
      },
      api_key: {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: '',
      },
      model: {
        type: Sequelize.STRING(255),
        allowNull: false,
        defaultValue: '',
      },
      temperature: {
        type: Sequelize.FLOAT,
        allowNull: true,
      },
      is_active: {
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
  }

  if (!(await tableExists(context, 'robots'))) {
    await context.createTable('robots', {
      id: {
        type: Sequelize.STRING(120),
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      avatar: {
        type: Sequelize.STRING(1024),
        allowNull: false,
        defaultValue: '',
      },
      system_prompt: {
        type: Sequelize.TEXT,
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
  }

  if (!(await tableExists(context, 'sessions'))) {
    await context.createTable('sessions', {
      id: {
        type: Sequelize.STRING(120),
        primaryKey: true,
        allowNull: false,
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      preview: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      robot_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
        defaultValue: '',
      },
      robot_avatar: {
        type: Sequelize.STRING(1024),
        allowNull: false,
        defaultValue: '',
      },
      robot_system_prompt: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      model_config_id: {
        type: Sequelize.STRING(120),
        allowNull: false,
        defaultValue: '',
      },
      model_label: {
        type: Sequelize.STRING(255),
        allowNull: false,
        defaultValue: '',
      },
      memory_summary: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      memory_updated_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      memory_source_message_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      memory_threshold: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      memory_recent_message_limit: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      prompt_tokens: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      completion_tokens: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    })
  }

  if (!(await tableExists(context, 'session_messages'))) {
    await context.createTable('session_messages', {
      id: {
        type: Sequelize.STRING(120),
        primaryKey: true,
        allowNull: false,
      },
      session_id: {
        type: Sequelize.STRING(120),
        allowNull: false,
        references: {
          model: 'sessions',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      sequence: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      role: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      content: {
        type: Sequelize.TEXT('long'),
        allowNull: false,
      },
      reasoning: {
        type: Sequelize.TEXT('long'),
        allowNull: false,
      },
      suggestions_json: {
        type: Sequelize.TEXT('long'),
        allowNull: false,
      },
      form_json: {
        type: Sequelize.TEXT('long'),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    })
  }

}

export async function down({ context }) {
  await context.dropTable('session_messages')
  await context.dropTable('sessions')
  await context.dropTable('robots')
  await context.dropTable('model_configs')
}
