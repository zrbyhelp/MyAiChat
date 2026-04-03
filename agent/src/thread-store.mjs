import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'

import { DataTypes, Sequelize } from 'sequelize'

import { parseThreadState } from './schemas.mjs'

function getDefaultFileDir() {
  return process.env.AGENT_FILE_STORE_DIR || join(os.tmpdir(), 'myaichat-agent')
}

function parseJsonText(value, fallback) {
  if (typeof value !== 'string' || !value.trim()) {
    return fallback
  }
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export class ThreadStore {
  constructor(options = {}) {
    this.mode = options.mode || (String(process.env.AGENT_STORAGE_DRIVER || 'file').trim() === 'mysql' ? 'mysql' : 'file')
    this.fileDir = options.fileDir || getDefaultFileDir()
    this.sequelize = options.sequelize || null
    this.AgentThread = null
    this.ready = false
  }

  async ensureReady() {
    if (this.ready) {
      return
    }

    if (this.mode === 'mysql') {
      await this.ensureMysqlReady()
    } else {
      await mkdir(this.fileDir, { recursive: true })
    }

    this.ready = true
  }

  async ensureMysqlReady() {
    if (!this.sequelize) {
      this.sequelize = new Sequelize(
        process.env.DB_NAME || 'myaichat',
        process.env.DB_USER || 'myaichat',
        process.env.DB_PASSWORD || 'myaichat',
        {
          host: process.env.DB_HOST || '127.0.0.1',
          port: Number(process.env.DB_PORT || 3306),
          dialect: 'mysql',
          logging: false,
        },
      )
    }

    this.AgentThread = this.sequelize.define('AgentThread', {
      threadId: {
        type: DataTypes.STRING(160),
        primaryKey: true,
        field: 'thread_id',
      },
      messagesJson: {
        type: DataTypes.TEXT('long'),
        allowNull: false,
        field: 'messages_json',
      },
      memorySchemaJson: {
        type: DataTypes.TEXT('long'),
        allowNull: false,
        field: 'memory_schema_json',
      },
      structuredMemoryJson: {
        type: DataTypes.TEXT('long'),
        allowNull: false,
        field: 'structured_memory_json',
      },
      storyOutlineText: {
        type: DataTypes.TEXT('long'),
        allowNull: false,
        field: 'story_outline_text',
      },
    }, {
      tableName: 'agent_threads',
      timestamps: false,
    })

    await this.sequelize.authenticate()
    await this.AgentThread.sync()

    const queryInterface = this.sequelize.getQueryInterface()
    const columns = await queryInterface.describeTable('agent_threads')

    if (!columns.memory_schema_json) {
      await queryInterface.addColumn('agent_threads', 'memory_schema_json', {
        type: DataTypes.TEXT('long'),
        allowNull: true,
      })
    }
    if (!columns.story_outline_text) {
      await queryInterface.addColumn('agent_threads', 'story_outline_text', {
        type: DataTypes.TEXT('long'),
        allowNull: true,
      })
    }

    await this.sequelize.query(`
      UPDATE agent_threads
      SET messages_json='[]'
      WHERE messages_json IS NULL OR messages_json = ''
    `)
    await this.sequelize.query(`
      UPDATE agent_threads
      SET memory_schema_json='{"categories":[]}'
      WHERE memory_schema_json IS NULL OR memory_schema_json = ''
    `)
    await this.sequelize.query(`
      UPDATE agent_threads
      SET structured_memory_json='{"updated_at":"","long_term_memory":"","short_term_memory":""}'
      WHERE structured_memory_json IS NULL OR structured_memory_json = ''
    `)
    await this.sequelize.query(`
      UPDATE agent_threads
      SET story_outline_text=''
      WHERE story_outline_text IS NULL
    `)

    await queryInterface.changeColumn('agent_threads', 'messages_json', {
      type: DataTypes.TEXT('long'),
      allowNull: false,
    })
    await queryInterface.changeColumn('agent_threads', 'memory_schema_json', {
      type: DataTypes.TEXT('long'),
      allowNull: false,
    })
    await queryInterface.changeColumn('agent_threads', 'structured_memory_json', {
      type: DataTypes.TEXT('long'),
      allowNull: false,
    })
    await queryInterface.changeColumn('agent_threads', 'story_outline_text', {
      type: DataTypes.TEXT('long'),
      allowNull: false,
    })
  }

  async load(threadId) {
    await this.ensureReady()
    if (!threadId) {
      return null
    }

    if (this.mode === 'mysql') {
      const row = await this.AgentThread.findByPk(threadId)
      if (!row) {
        return null
      }

      return parseThreadState({
        thread_id: row.threadId,
        messages: parseJsonText(row.messagesJson, []),
        memory_schema: parseJsonText(row.memorySchemaJson, { categories: [] }),
        structured_memory: parseJsonText(row.structuredMemoryJson, { updated_at: '', long_term_memory: '', short_term_memory: '' }),
        story_outline: parseJsonText(row.storyOutlineText, {}),
      })
    }

    try {
      const source = await readFile(join(this.fileDir, `${threadId}.json`), 'utf8')
      return parseThreadState(JSON.parse(source))
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') {
        return null
      }
      throw error
    }
  }

  async save(state) {
    await this.ensureReady()
    const normalized = parseThreadState(state)

    if (this.mode === 'mysql') {
      await this.AgentThread.upsert({
        threadId: normalized.thread_id,
        messagesJson: JSON.stringify(normalized.messages),
        memorySchemaJson: JSON.stringify(normalized.memory_schema),
        structuredMemoryJson: JSON.stringify(normalized.structured_memory),
        storyOutlineText: JSON.stringify(normalized.story_outline || {}),
      })
      return
    }

    await writeFile(
      join(this.fileDir, `${normalized.thread_id}.json`),
      `${JSON.stringify(normalized, null, 2)}\n`,
      'utf8',
    )
  }
}
