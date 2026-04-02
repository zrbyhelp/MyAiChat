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
  if (!(await tableExists(context, 'graphrag_artifacts'))) {
    await context.createTable('graphrag_artifacts', {
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
        defaultValue: '',
      },
      document_id: {
        type: Sequelize.STRING(120),
        allowNull: false,
        defaultValue: '',
      },
      session_id: {
        type: Sequelize.STRING(120),
        allowNull: false,
        defaultValue: '',
      },
      kind: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: 'extract',
      },
      summary: {
        type: Sequelize.TEXT('long'),
        allowNull: false,
      },
      payload_json: {
        type: Sequelize.TEXT('long'),
        allowNull: false,
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

  if (!(await indexExists(context, 'graphrag_artifacts', 'graphrag_artifacts_user_robot_kind_idx'))) {
    await context.addIndex('graphrag_artifacts', ['user_id', 'robot_id', 'kind'], {
      name: 'graphrag_artifacts_user_robot_kind_idx',
    })
  }

  if (!(await indexExists(context, 'graphrag_artifacts', 'graphrag_artifacts_user_session_kind_idx'))) {
    await context.addIndex('graphrag_artifacts', ['user_id', 'session_id', 'kind'], {
      name: 'graphrag_artifacts_user_session_kind_idx',
    })
  }
}

export async function down({ context }) {
  if (await indexExists(context, 'graphrag_artifacts', 'graphrag_artifacts_user_session_kind_idx')) {
    await context.removeIndex('graphrag_artifacts', 'graphrag_artifacts_user_session_kind_idx')
  }
  if (await indexExists(context, 'graphrag_artifacts', 'graphrag_artifacts_user_robot_kind_idx')) {
    await context.removeIndex('graphrag_artifacts', 'graphrag_artifacts_user_robot_kind_idx')
  }
  if (await tableExists(context, 'graphrag_artifacts')) {
    await context.dropTable('graphrag_artifacts')
  }
}
