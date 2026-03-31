import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { DataTypes, Sequelize } from 'sequelize'
import { Umzug, SequelizeStorage } from 'umzug'

import { getDatabaseConfig } from './database-config.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

let sequelizeInstance = null
let modelRegistry = null

export function getSequelize() {
  if (sequelizeInstance) {
    return sequelizeInstance
  }

  const config = getDatabaseConfig()
  sequelizeInstance = new Sequelize(config.database, config.username, config.password, {
    host: config.host,
    port: config.port,
    dialect: config.dialect,
    logging: config.logging,
    define: {
      underscored: true,
      freezeTableName: false,
    },
  })

  return sequelizeInstance
}

export function getModels() {
  if (modelRegistry) {
    return modelRegistry
  }

  const sequelize = getSequelize()

  const User = sequelize.define('User', {
    id: {
      type: DataTypes.STRING(120),
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    displayName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'display_name',
    },
    avatarUrl: {
      type: DataTypes.STRING(1024),
      allowNull: true,
      field: 'avatar_url',
    },
  })

  const ModelConfig = sequelize.define('ModelConfig', {
    id: {
      type: DataTypes.STRING(120),
      primaryKey: true,
    },
    userId: {
      type: DataTypes.STRING(120),
      allowNull: true,
      field: 'user_id',
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    provider: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    baseUrl: {
      type: DataTypes.STRING(1024),
      allowNull: false,
    },
    apiKey: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    model: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: '',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    tagsJson: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '[]',
      field: 'tags_json',
    },
    temperature: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_active',
    },
  })

  const Robot = sequelize.define('Robot', {
    id: {
      type: DataTypes.STRING(120),
      primaryKey: true,
    },
    userId: {
      type: DataTypes.STRING(120),
      allowNull: true,
      field: 'user_id',
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    avatar: {
      type: DataTypes.STRING(1024),
      allowNull: false,
      defaultValue: '',
    },
    systemPrompt: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
      field: 'system_prompt',
    },
    commonPrompt: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
      field: 'common_prompt',
    },
    memoryModelConfigId: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: '',
      field: 'memory_model_config_id',
    },
    outlineModelConfigId: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: '',
      field: 'outline_model_config_id',
    },
    knowledgeRetrievalModelConfigId: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: '',
      field: 'knowledge_retrieval_model_config_id',
    },
    numericComputationModelConfigId: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: '',
      field: 'numeric_computation_model_config_id',
    },
    formOptionModelConfigId: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: '',
      field: 'form_option_model_config_id',
    },
    worldGraphModelConfigId: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: '',
      field: 'world_graph_model_config_id',
    },
    imageFetchEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'image_fetch_enabled',
    },
    imageFetchPrompt: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
      field: 'image_fetch_prompt',
    },
    numericComputationEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'numeric_computation_enabled',
    },
    numericComputationPrompt: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
      field: 'numeric_computation_prompt',
    },
    numericComputationSchema: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
      field: 'numeric_computation_schema',
    },
    structuredMemoryInterval: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3,
      field: 'structured_memory_interval',
    },
    structuredMemoryHistoryLimit: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 12,
      field: 'structured_memory_history_limit',
    },
    memorySchemaJson: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
      defaultValue: '{"categories":[]}',
      field: 'memory_schema_json',
    },
    memoryPrompt: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
      field: 'memory_prompt',
    },
  })

  const RobotWorldGraph = sequelize.define('RobotWorldGraph', {
    id: {
      type: DataTypes.STRING(120),
      primaryKey: true,
    },
    userId: {
      type: DataTypes.STRING(120),
      allowNull: false,
      field: 'user_id',
    },
    robotId: {
      type: DataTypes.STRING(120),
      allowNull: false,
      field: 'robot_id',
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: '',
    },
    summary: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    graphVersion: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      field: 'graph_version',
    },
    calendarJson: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
      defaultValue: '{}',
      field: 'calendar_json',
    },
    lastLayoutJson: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
      defaultValue: '{}',
      field: 'last_layout_json',
    },
  })

  const RobotWorldRelationType = sequelize.define('RobotWorldRelationType', {
    id: {
      type: DataTypes.STRING(120),
      primaryKey: true,
    },
    userId: {
      type: DataTypes.STRING(120),
      allowNull: false,
      field: 'user_id',
    },
    robotId: {
      type: DataTypes.STRING(120),
      allowNull: false,
      field: 'robot_id',
    },
    code: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    label: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    directionality: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'directed',
    },
    sourceObjectTypesJson: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '[]',
      field: 'source_object_types_json',
    },
    targetObjectTypesJson: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '[]',
      field: 'target_object_types_json',
    },
    isBuiltin: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_builtin',
    },
  })

  const RobotGenerationTask = sequelize.define('RobotGenerationTask', {
    id: {
      type: DataTypes.STRING(120),
      primaryKey: true,
    },
    userId: {
      type: DataTypes.STRING(120),
      allowNull: false,
      field: 'user_id',
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'pending',
    },
    stage: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: 'queued',
    },
    progress: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    sourceName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: '',
      field: 'source_name',
    },
    sourceType: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: '',
      field: 'source_type',
    },
    sourceSize: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
      field: 'source_size',
    },
    guidance: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
      defaultValue: '',
    },
    modelConfigId: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: '',
      field: 'model_config_id',
    },
    embeddingModelConfigId: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: '',
      field: 'embedding_model_config_id',
    },
    robotId: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: '',
      field: 'robot_id',
    },
    documentId: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: '',
      field: 'document_id',
    },
    statsJson: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
      defaultValue: '{}',
      field: 'stats_json',
    },
    resultJson: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
      defaultValue: '{}',
      field: 'result_json',
    },
    error: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
      defaultValue: '',
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'started_at',
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at',
    },
  })

  const RobotKnowledgeDocument = sequelize.define('RobotKnowledgeDocument', {
    id: {
      type: DataTypes.STRING(120),
      primaryKey: true,
    },
    userId: {
      type: DataTypes.STRING(120),
      allowNull: false,
      field: 'user_id',
    },
    robotId: {
      type: DataTypes.STRING(120),
      allowNull: false,
      field: 'robot_id',
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'processing',
    },
    sourceName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: '',
      field: 'source_name',
    },
    sourceType: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: '',
      field: 'source_type',
    },
    sourceSize: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
      field: 'source_size',
    },
    guidance: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
      defaultValue: '',
    },
    summary: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
      defaultValue: '',
    },
    retrievalSummary: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
      defaultValue: '',
      field: 'retrieval_summary',
    },
    chunkCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'chunk_count',
    },
    characterCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'character_count',
    },
    qdrantCollection: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: '',
      field: 'qdrant_collection',
    },
    embeddingModelConfigId: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: '',
      field: 'embedding_model_config_id',
    },
    embeddingModel: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: '',
      field: 'embedding_model',
    },
    metaJson: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
      defaultValue: '{}',
      field: 'meta_json',
    },
  })

  const Session = sequelize.define('Session', {
    id: {
      type: DataTypes.STRING(120),
      primaryKey: true,
    },
    userId: {
      type: DataTypes.STRING(120),
      allowNull: true,
      field: 'user_id',
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    preview: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_at',
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'updated_at',
    },
    robotName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: '',
      field: 'robot_name',
    },
    robotAvatar: {
      type: DataTypes.STRING(1024),
      allowNull: false,
      defaultValue: '',
      field: 'robot_avatar',
    },
    robotId: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: '',
      field: 'robot_id',
    },
    robotSystemPrompt: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
      field: 'robot_system_prompt',
    },
    robotCommonPrompt: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
      field: 'robot_common_prompt',
    },
    robotMemoryModelConfigId: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: '',
      field: 'robot_memory_model_config_id',
    },
    robotOutlineModelConfigId: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: '',
      field: 'robot_outline_model_config_id',
    },
    robotKnowledgeRetrievalModelConfigId: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: '',
      field: 'robot_knowledge_retrieval_model_config_id',
    },
    robotNumericComputationModelConfigId: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: '',
      field: 'robot_numeric_computation_model_config_id',
    },
    robotFormOptionModelConfigId: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: '',
      field: 'robot_form_option_model_config_id',
    },
    robotWorldGraphModelConfigId: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: '',
      field: 'robot_world_graph_model_config_id',
    },
    robotImageFetchEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'robot_image_fetch_enabled',
    },
    robotImageFetchPrompt: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
      field: 'robot_image_fetch_prompt',
    },
    robotNumericComputationEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'robot_numeric_computation_enabled',
    },
    robotNumericComputationPrompt: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
      field: 'robot_numeric_computation_prompt',
    },
    robotNumericComputationSchema: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
      field: 'robot_numeric_computation_schema',
    },
    robotStructuredMemoryInterval: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3,
      field: 'robot_structured_memory_interval',
    },
    robotStructuredMemoryHistoryLimit: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 12,
      field: 'robot_structured_memory_history_limit',
    },
    robotMemoryPrompt: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
      field: 'robot_memory_prompt',
    },
    modelConfigId: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: '',
      field: 'model_config_id',
    },
    modelLabel: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: '',
      field: 'model_label',
    },
    threadId: {
      type: DataTypes.STRING(160),
      allowNull: false,
      defaultValue: '',
      field: 'thread_id',
    },
    storyOutline: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
      field: 'story_outline',
    },
    memorySummary: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
      field: 'memory_summary',
    },
    memoryUpdatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'memory_updated_at',
    },
    memorySourceMessageCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'memory_source_message_count',
    },
    memoryThreshold: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'memory_threshold',
    },
    memoryRecentMessageLimit: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'memory_recent_message_limit',
    },
    memoryPrompt: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
      field: 'memory_prompt',
    },
    structuredMemoryInterval: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3,
      field: 'structured_memory_interval',
    },
    structuredMemoryHistoryLimit: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 12,
      field: 'structured_memory_history_limit',
    },
    memorySchemaJson: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
      defaultValue: '{"categories":[]}',
      field: 'memory_schema_json',
    },
    structuredMemoryJson: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
      defaultValue: '{"updatedAt":"","preferences":[],"facts":[],"tasks":[]}',
      field: 'structured_memory_json',
    },
    numericStateJson: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
      field: 'numeric_state_json',
    },
    sessionWorldGraphJson: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      field: 'session_world_graph_json',
    },
    promptTokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'prompt_tokens',
    },
    completionTokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'completion_tokens',
    },
  }, {
    timestamps: false,
  })

  const SessionMessage = sequelize.define('SessionMessage', {
    id: {
      type: DataTypes.STRING(120),
      primaryKey: true,
    },
    sessionId: {
      type: DataTypes.STRING(120),
      allowNull: false,
      field: 'session_id',
    },
    sequence: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    role: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
      defaultValue: '',
    },
    reasoning: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
      defaultValue: '',
    },
    suggestionsJson: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
      field: 'suggestions_json',
    },
    formJson: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      field: 'form_json',
    },
    imagesJson: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
      field: 'images_json',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_at',
    },
  }, {
    timestamps: false,
  })

  Session.hasMany(SessionMessage, {
    foreignKey: 'sessionId',
    as: 'messages',
    onDelete: 'CASCADE',
    hooks: true,
  })
  User.hasMany(ModelConfig, {
    foreignKey: 'userId',
    as: 'modelConfigs',
  })
  User.hasMany(Robot, {
    foreignKey: 'userId',
    as: 'robots',
  })
  User.hasMany(RobotWorldGraph, {
    foreignKey: 'userId',
    as: 'robotWorldGraphs',
  })
  User.hasMany(RobotWorldRelationType, {
    foreignKey: 'userId',
    as: 'robotWorldRelationTypes',
  })
  User.hasMany(Session, {
    foreignKey: 'userId',
    as: 'sessions',
  })
  User.hasMany(RobotGenerationTask, {
    foreignKey: 'userId',
    as: 'robotGenerationTasks',
  })
  User.hasMany(RobotKnowledgeDocument, {
    foreignKey: 'userId',
    as: 'robotKnowledgeDocuments',
  })
  ModelConfig.belongsTo(User, {
    foreignKey: 'userId',
    as: 'user',
  })
  Robot.belongsTo(User, {
    foreignKey: 'userId',
    as: 'user',
  })
  Robot.hasOne(RobotWorldGraph, {
    foreignKey: 'robotId',
    sourceKey: 'id',
    as: 'worldGraph',
    onDelete: 'CASCADE',
    hooks: true,
  })
  Robot.hasMany(RobotWorldRelationType, {
    foreignKey: 'robotId',
    sourceKey: 'id',
    as: 'worldRelationTypes',
    onDelete: 'CASCADE',
    hooks: true,
  })
  Robot.hasMany(RobotKnowledgeDocument, {
    foreignKey: 'robotId',
    sourceKey: 'id',
    as: 'knowledgeDocuments',
    onDelete: 'CASCADE',
    hooks: true,
  })
  RobotWorldGraph.belongsTo(User, {
    foreignKey: 'userId',
    as: 'user',
  })
  RobotWorldGraph.belongsTo(Robot, {
    foreignKey: 'robotId',
    targetKey: 'id',
    as: 'robot',
  })
  RobotWorldRelationType.belongsTo(User, {
    foreignKey: 'userId',
    as: 'user',
  })
  RobotWorldRelationType.belongsTo(Robot, {
    foreignKey: 'robotId',
    targetKey: 'id',
    as: 'robot',
  })
  Session.belongsTo(User, {
    foreignKey: 'userId',
    as: 'user',
  })
  RobotGenerationTask.belongsTo(User, {
    foreignKey: 'userId',
    as: 'user',
  })
  RobotKnowledgeDocument.belongsTo(User, {
    foreignKey: 'userId',
    as: 'user',
  })
  RobotKnowledgeDocument.belongsTo(Robot, {
    foreignKey: 'robotId',
    targetKey: 'id',
    as: 'robot',
  })
  SessionMessage.belongsTo(Session, {
    foreignKey: 'sessionId',
    as: 'session',
  })

  modelRegistry = {
    sequelize,
    User,
    ModelConfig,
    Robot,
    RobotWorldGraph,
    RobotWorldRelationType,
    RobotGenerationTask,
    RobotKnowledgeDocument,
    Session,
    SessionMessage,
  }

  return modelRegistry
}

export async function runMigrations() {
  const sequelize = getSequelize()
  const umzug = new Umzug({
    migrations: {
      glob: join(__dirname, 'migrations', '*.mjs').replace(/\\/g, '/'),
      resolve: ({ name, path }) => {
        const migrationUrl = pathToFileURL(path).href
        return {
          name,
          up: async () => {
            const migration = await import(migrationUrl)
            return migration.up({ context: sequelize.getQueryInterface(), Sequelize })
          },
          down: async () => {
            const migration = await import(migrationUrl)
            return migration.down({ context: sequelize.getQueryInterface(), Sequelize })
          },
        }
      },
    },
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize }),
    logger: undefined,
  })

  await umzug.up()
}

export async function initializeDatabase() {
  const sequelize = getSequelize()
  getModels()
  await sequelize.authenticate()
  await runMigrations()
  return sequelize
}
