export function getStorageDriver() {
  return process.env.STORAGE_DRIVER === 'mysql' ? 'mysql' : 'file'
}

export function getDatabaseConfig() {
  return {
    dialect: 'mysql',
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || 'myaichat',
    username: process.env.DB_USER || 'myaichat',
    password: process.env.DB_PASSWORD || 'myaichat',
    logging: false,
  }
}
