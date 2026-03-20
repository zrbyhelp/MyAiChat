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

  const ModelConfig = sequelize.define('ModelConfig', {
    id: {
      type: DataTypes.STRING(120),
      primaryKey: true,
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
  })

  const Session = sequelize.define('Session', {
    id: {
      type: DataTypes.STRING(120),
      primaryKey: true,
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
    robotSystemPrompt: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
      field: 'robot_system_prompt',
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
      defaultValue: '[]',
      field: 'suggestions_json',
    },
    formJson: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      field: 'form_json',
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
  SessionMessage.belongsTo(Session, {
    foreignKey: 'sessionId',
    as: 'session',
  })

  modelRegistry = {
    sequelize,
    ModelConfig,
    Robot,
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
