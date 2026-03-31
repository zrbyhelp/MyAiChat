async function tableExists(context, tableName) {
  try {
    await context.describeTable(tableName)
    return true
  } catch {
    return false
  }
}

async function indexExists(context, tableName, indexName) {
  try {
    const indexes = await context.showIndex(tableName)
    return indexes.some((item) => item.name === indexName)
  } catch {
    return false
  }
}

export async function up({ context, Sequelize }) {
  if (!(await tableExists(context, 'robot_generation_tasks'))) {
    await context.createTable('robot_generation_tasks', {
      id: {
        type: Sequelize.STRING(120),
        allowNull: false,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: 'pending',
      },
      stage: {
        type: Sequelize.STRING(64),
        allowNull: false,
        defaultValue: 'queued',
      },
      progress: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0,
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      source_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
        defaultValue: '',
      },
      source_type: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: '',
      },
      source_size: {
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: 0,
      },
      guidance: {
        type: Sequelize.TEXT('long'),
        allowNull: false,
      },
      model_config_id: {
        type: Sequelize.STRING(120),
        allowNull: false,
        defaultValue: '',
      },
      robot_id: {
        type: Sequelize.STRING(120),
        allowNull: false,
        defaultValue: '',
      },
      document_id: {
        type: Sequelize.STRING(120),
        allowNull: false,
        defaultValue: '',
      },
      stats_json: {
        type: Sequelize.TEXT('long'),
        allowNull: false,
      },
      result_json: {
        type: Sequelize.TEXT('long'),
        allowNull: false,
      },
      error: {
        type: Sequelize.TEXT('long'),
        allowNull: false,
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    })
  }

  if (!(await tableExists(context, 'robot_knowledge_documents'))) {
    await context.createTable('robot_knowledge_documents', {
      id: {
        type: Sequelize.STRING(120),
        allowNull: false,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      robot_id: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: 'processing',
      },
      source_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
        defaultValue: '',
      },
      source_type: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: '',
      },
      source_size: {
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: 0,
      },
      guidance: {
        type: Sequelize.TEXT('long'),
        allowNull: false,
      },
      summary: {
        type: Sequelize.TEXT('long'),
        allowNull: false,
      },
      retrieval_summary: {
        type: Sequelize.TEXT('long'),
        allowNull: false,
      },
      chunk_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      character_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      qdrant_collection: {
        type: Sequelize.STRING(255),
        allowNull: false,
        defaultValue: '',
      },
      embedding_model_config_id: {
        type: Sequelize.STRING(120),
        allowNull: false,
        defaultValue: '',
      },
      embedding_model: {
        type: Sequelize.STRING(255),
        allowNull: false,
        defaultValue: '',
      },
      meta_json: {
        type: Sequelize.TEXT('long'),
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    })
  }

  if (!(await indexExists(context, 'robot_generation_tasks', 'robot_generation_tasks_user_status_idx'))) {
    await context.addIndex('robot_generation_tasks', ['user_id', 'status'], {
      name: 'robot_generation_tasks_user_status_idx',
    })
  }

  if (!(await indexExists(context, 'robot_knowledge_documents', 'robot_knowledge_documents_user_robot_idx'))) {
    await context.addIndex('robot_knowledge_documents', ['user_id', 'robot_id'], {
      name: 'robot_knowledge_documents_user_robot_idx',
    })
  }
}

export async function down({ context }) {
  if (await indexExists(context, 'robot_knowledge_documents', 'robot_knowledge_documents_user_robot_idx')) {
    await context.removeIndex('robot_knowledge_documents', 'robot_knowledge_documents_user_robot_idx')
  }

  if (await indexExists(context, 'robot_generation_tasks', 'robot_generation_tasks_user_status_idx')) {
    await context.removeIndex('robot_generation_tasks', 'robot_generation_tasks_user_status_idx')
  }

  if (await tableExists(context, 'robot_knowledge_documents')) {
    await context.dropTable('robot_knowledge_documents')
  }

  if (await tableExists(context, 'robot_generation_tasks')) {
    await context.dropTable('robot_generation_tasks')
  }
}
