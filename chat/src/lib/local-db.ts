import type { AIModelConfigItem, AIRobotCard, ChatSessionDetail, ChatSessionSummary } from '@/types/ai'

const DB_NAME = 'myaichat-local-cache'
const DB_VERSION = 2
const MODEL_CONFIGS_STORE = 'model-configs'
const ROBOTS_STORE = 'robots'
const SESSIONS_STORE = 'sessions'

type StoreName = typeof MODEL_CONFIGS_STORE | typeof ROBOTS_STORE | typeof SESSIONS_STORE

let dbPromise: Promise<IDBDatabase> | null = null

function openDatabase() {
  if (dbPromise) {
    return dbPromise
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(ROBOTS_STORE)) {
        db.createObjectStore(ROBOTS_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(MODEL_CONFIGS_STORE)) {
        db.createObjectStore(MODEL_CONFIGS_STORE, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('打开本地缓存失败'))
  })

  return dbPromise
}

function createSummary(session: ChatSessionDetail): ChatSessionSummary {
  const lastMessage = session.messages[session.messages.length - 1]
  return {
    id: session.id,
    title: session.title,
    preview: session.preview || lastMessage?.content || '',
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    persistToServer: false,
    robotName: session.robot.name || '当前智能体',
    modelConfigId: session.modelConfigId || '',
    modelLabel: session.modelLabel || '',
    usage: session.usage,
  }
}

async function withStore<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void,
) {
  const db = await openDatabase()
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode)
    const store = transaction.objectStore(storeName)
    action(store, resolve, reject)
    transaction.onerror = () => reject(transaction.error || new Error('本地缓存操作失败'))
  })
}

export async function listLocalRobots() {
  return withStore<AIRobotCard[]>(ROBOTS_STORE, 'readonly', (store, resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => {
      resolve(
        ((request.result || []) as AIRobotCard[]).map((item) => ({
          ...item,
          persistToServer: false,
        })),
      )
    }
    request.onerror = () => reject(request.error || new Error('读取本地智能体失败'))
  })
}

export async function listLocalModelConfigs() {
  return withStore<AIModelConfigItem[]>(MODEL_CONFIGS_STORE, 'readonly', (store, resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => {
      resolve(
        ((request.result || []) as AIModelConfigItem[]).map((item) => ({
          ...item,
          persistToServer: false,
        })),
      )
    }
    request.onerror = () => reject(request.error || new Error('读取本地模型配置失败'))
  })
}

export async function putLocalModelConfig(config: AIModelConfigItem) {
  return withStore<void>(MODEL_CONFIGS_STORE, 'readwrite', (store, resolve, reject) => {
    const request = store.put({
      ...config,
      persistToServer: false,
    })
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error || new Error('保存本地模型配置失败'))
  })
}

export async function deleteLocalModelConfig(id: string) {
  return withStore<void>(MODEL_CONFIGS_STORE, 'readwrite', (store, resolve, reject) => {
    const request = store.delete(id)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error || new Error('删除本地模型配置失败'))
  })
}

export async function getLocalRobot(id: string) {
  return withStore<AIRobotCard | null>(ROBOTS_STORE, 'readonly', (store, resolve, reject) => {
    const request = store.get(id)
    request.onsuccess = () => {
      resolve(request.result ? { ...(request.result as AIRobotCard), persistToServer: false } : null)
    }
    request.onerror = () => reject(request.error || new Error('读取本地智能体失败'))
  })
}

export async function putLocalRobot(robot: AIRobotCard) {
  return withStore<void>(ROBOTS_STORE, 'readwrite', (store, resolve, reject) => {
    const request = store.put({
      ...robot,
      persistToServer: false,
    })
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error || new Error('保存本地智能体失败'))
  })
}

export async function deleteLocalRobot(id: string) {
  return withStore<void>(ROBOTS_STORE, 'readwrite', (store, resolve, reject) => {
    const request = store.delete(id)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error || new Error('删除本地智能体失败'))
  })
}

export async function listLocalSessions() {
  const sessions = await withStore<ChatSessionDetail[]>(SESSIONS_STORE, 'readonly', (store, resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => {
      resolve(
        ((request.result || []) as ChatSessionDetail[]).map((item) => ({
          ...item,
          persistToServer: false,
          memory: {
            ...item.memory,
            persistToServer: false,
          },
        })),
      )
    }
    request.onerror = () => reject(request.error || new Error('读取本地会话失败'))
  })

  return sessions
    .map((session) => createSummary(session))
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
}

export async function getLocalSession(id: string) {
  return withStore<ChatSessionDetail | null>(SESSIONS_STORE, 'readonly', (store, resolve, reject) => {
    const request = store.get(id)
    request.onsuccess = () => {
      const session = request.result as ChatSessionDetail | undefined
      resolve(
        session
          ? {
              ...session,
              persistToServer: false,
              memory: {
                ...session.memory,
                persistToServer: false,
              },
            }
          : null,
      )
    }
    request.onerror = () => reject(request.error || new Error('读取本地会话失败'))
  })
}

export async function putLocalSession(session: ChatSessionDetail) {
  return withStore<void>(SESSIONS_STORE, 'readwrite', (store, resolve, reject) => {
    const request = store.put({
      ...session,
      persistToServer: false,
      memory: {
        ...session.memory,
        persistToServer: false,
      },
    })
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error || new Error('保存本地会话失败'))
  })
}

export async function deleteLocalSession(id: string) {
  return withStore<void>(SESSIONS_STORE, 'readwrite', (store, resolve, reject) => {
    const request = store.delete(id)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error || new Error('删除本地会话失败'))
  })
}
