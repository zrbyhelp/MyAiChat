import express from 'express'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const adminRoot = resolve(currentDir, '..', 'admin-api')
const adminRequire = createRequire(resolve(adminRoot, 'package.json'))
const adminModelPaths = [
  './models/carouselCategory.js',
  './models/carouselResource.js',
  './models/dept.js',
  './models/i18nCategory.js',
  './models/menu.js',
  './models/monitorStore.js',
  './models/resourceSystemCategory.js',
  './models/resourceSystemResource.js',
  './models/resourceSystemStorage.js',
  './models/resourceSystemStorageAliyun.js',
  './models/resourceSystemStorageAws.js',
  './models/resourceSystemStorageLocal.js',
  './models/resourceSystemStorageMinio.js',
  './models/resourceSystemStorageQiniu.js',
  './models/resourceSystemStorageTencent.js',
  './models/role.js',
  './models/roleMenu.js',
  './models/surveyQuestionnaire.js',
  './models/surveySubmission.js',
  './models/surveyWorkflowInstance.js',
  './models/surveyWorkflowTemplate.js',
  './models/systemStore.js',
  './models/systemThirdPartyConfig.js',
  './models/user.js',
  './models/userRole.js',
]

let adminCache = null
let adminTableNamesCache = null

function applyAdminTablePrefixes() {
  const { withTablePrefix } = adminRequire('./utils/tableName.js')

  for (const modelPath of adminModelPaths) {
    const model = adminRequire(modelPath).default
    const currentTableName = String(model?.options?.tableName || model?.tableName || '').trim()
    if (!currentTableName) {
      continue
    }
    const nextTableName = withTablePrefix(currentTableName)
    model.tableName = nextTableName
    model.options.tableName = nextTableName
  }
}

function getAdminTableNames() {
  if (adminTableNamesCache) {
    return adminTableNamesCache
  }

  const { withTablePrefix } = adminRequire('./utils/tableName.js')
  adminTableNamesCache = [
    'carousel_categories',
    'carousel_resources',
    'depts',
    'i18n_category',
    'menus',
    'monitor_store',
    'resource_system_categories',
    'resource_system_resources',
    'resource_system_storages',
    'resource_system_storage_aliyun_configs',
    'resource_system_storage_aws_configs',
    'resource_system_storage_local_configs',
    'resource_system_storage_minio_configs',
    'resource_system_storage_qiniu_configs',
    'resource_system_storage_tencent_configs',
    'roles',
    'role_menus',
    'survey_questionnaires',
    'survey_submissions',
    'survey_workflow_instances',
    'survey_workflow_templates',
    'system_store',
    'system_third_party_configs',
    'users',
    'user_roles',
    'seed_history',
    'permissions',
    'role_permissions',
  ].map((tableName) => withTablePrefix(tableName))

  return adminTableNamesCache
}

async function resetLegacyAdminSchemaIfNeeded(sequelize) {
  const [legacyRoleTables] = await sequelize.query("SHOW TABLES LIKE 'admin_roles'")
  const [legacyUserTables] = await sequelize.query("SHOW TABLES LIKE 'admin_users'")
  const [legacyUserRoleTables] = await sequelize.query("SHOW TABLES LIKE 'admin_user_roles'")

  const hasLegacySchemaTables =
    legacyRoleTables.length > 0 && legacyUserTables.length > 0 && legacyUserRoleTables.length > 0

  if (!hasLegacySchemaTables) {
    return
  }

  const [roleIdRows] = await sequelize.query("SHOW COLUMNS FROM `admin_roles` LIKE 'id'")
  const [userIdRows] = await sequelize.query("SHOW COLUMNS FROM `admin_users` LIKE 'id'")
  const [userRoleRows] = await sequelize.query("SHOW COLUMNS FROM `admin_user_roles` LIKE 'role_id'")

  const roleIdType = String(roleIdRows?.[0]?.Type || '').toLowerCase()
  const userIdType = String(userIdRows?.[0]?.Type || '').toLowerCase()
  const userRoleType = String(userRoleRows?.[0]?.Type || '').toLowerCase()

  const looksLegacy =
    roleIdType.includes('varchar') ||
    userIdType.includes('varchar') ||
    userRoleType.includes('varchar')

  if (!looksLegacy) {
    return
  }

  const tableNames = getAdminTableNames()
  const quotedTableNames = tableNames.map((tableName) => `\`${tableName}\``).join(', ')
  console.log('检测到旧版后台前缀表结构，重建 admin_* 表')
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0')
  try {
    await sequelize.query(`DROP TABLE IF EXISTS ${quotedTableNames}`)
  } finally {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1')
  }
}

function loadAdminModules() {
  if (adminCache) {
    return adminCache
  }

  applyAdminTablePrefixes()

  adminCache = {
    cors: adminRequire('cors'),
    config: adminRequire('./config/index.js').default,
    router: adminRequire('./router/index.js').default,
    sequelize: adminRequire('./database/index.js').default,
    responseMiddleware: adminRequire('./middleware/response.js').responseMiddleware,
    initMenuSeedData: adminRequire('./database/seeds/menuSeed.js').initMenuSeedData,
    initRoleSeedData: adminRequire('./database/seeds/roleSeed.js').initRoleSeedData,
    initDeptSeedData: adminRequire('./database/seeds/deptSeed.js').initDeptSeedData,
    initUserSeedData: adminRequire('./database/seeds/userSeed.js').initUserSeedData,
    runSeedOnce: adminRequire('./database/seeds/seedRunner.js').runSeedOnce,
    migrateLegacyCarouselData: adminRequire('./database/seeds/carouselSeed.js').migrateLegacyCarouselData,
    patchCategoryParentIdColumns: adminRequire('./database/seeds/schemaPatch.js').patchCategoryParentIdColumns,
    patchCarouselResourceRefColumns: adminRequire('./database/seeds/schemaPatch.js').patchCarouselResourceRefColumns,
    patchWorkflowInstanceApproverColumns: adminRequire('./database/seeds/schemaPatch.js').patchWorkflowInstanceApproverColumns,
    patchResourceSystemCategoryStorageColumns:
      adminRequire('./database/seeds/schemaPatch.js').patchResourceSystemCategoryStorageColumns,
    patchResourceSystemResourceStorageColumns:
      adminRequire('./database/seeds/schemaPatch.js').patchResourceSystemResourceStorageColumns,
    patchUserProfileColumns: adminRequire('./database/seeds/schemaPatch.js').patchUserProfileColumns,
    patchRoleColumns: adminRequire('./database/seeds/schemaPatch.js').patchRoleColumns,
    patchDeptColumns: adminRequire('./database/seeds/schemaPatch.js').patchDeptColumns,
    patchUserRoleColumns: adminRequire('./database/seeds/schemaPatch.js').patchUserRoleColumns,
    dropLegacyPermissionTables: adminRequire('./database/seeds/schemaPatch.js').dropLegacyPermissionTables,
    appendSystemExceptionLog: adminRequire('./router/monitor.js').appendSystemExceptionLog,
  }

  return adminCache
}

export async function initializeAdminBackoffice() {
  const {
    config,
    sequelize,
    runSeedOnce,
    initMenuSeedData,
    initRoleSeedData,
    initDeptSeedData,
    initUserSeedData,
    migrateLegacyCarouselData,
    patchCategoryParentIdColumns,
    patchCarouselResourceRefColumns,
    patchWorkflowInstanceApproverColumns,
    patchResourceSystemCategoryStorageColumns,
    patchResourceSystemResourceStorageColumns,
    patchUserProfileColumns,
    patchRoleColumns,
    patchDeptColumns,
    patchUserRoleColumns,
    dropLegacyPermissionTables,
    appendSystemExceptionLog,
  } = loadAdminModules()

  try {
    console.log(`后台数据库同步模式: alter=${config.database.syncAlter}`)
    await resetLegacyAdminSchemaIfNeeded(sequelize)
    await sequelize.sync({ alter: config.database.syncAlter })
    await runSeedOnce('drop_legacy_permission_tables_v1', dropLegacyPermissionTables)
    await runSeedOnce('role_columns_patch_v3', patchRoleColumns)
    await runSeedOnce('dept_columns_patch_v1', patchDeptColumns)
    await runSeedOnce('user_profile_columns_patch_v3', patchUserProfileColumns)
    await runSeedOnce('user_role_columns_patch_v1', patchUserRoleColumns)
    await runSeedOnce('category_parent_id_patch_v1', patchCategoryParentIdColumns)
    await runSeedOnce('resource_system_category_storage_columns_patch_v3', patchResourceSystemCategoryStorageColumns)
    await runSeedOnce('resource_system_resource_storage_columns_patch_v1', patchResourceSystemResourceStorageColumns)
    await runSeedOnce('carousel_resource_ref_columns_patch_v1', patchCarouselResourceRefColumns)
    await runSeedOnce('workflow_instance_approver_columns_patch_v1', patchWorkflowInstanceApproverColumns)
    await runSeedOnce('menu_seed_v14', initMenuSeedData)
    await runSeedOnce('role_seed_v7', initRoleSeedData)
    await runSeedOnce('dept_seed_v1', initDeptSeedData)
    await runSeedOnce('user_seed_v1', initUserSeedData)
    await runSeedOnce('carousel_legacy_json_to_db_v1', migrateLegacyCarouselData)
    console.log('后台数据库模型同步成功')
  } catch (error) {
    console.error('后台数据库模型同步失败', error)
    await appendSystemExceptionLog({
      source: '后台数据库',
      message: '后台数据库模型同步失败',
      detail: {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      requestTime: Date.now(),
    }).catch((logError) => {
      console.error('记录后台数据库同步异常日志失败', logError)
    })
    throw error
  }
}

export function attachAdminBackoffice(app) {
  const { cors, config, router, responseMiddleware } = loadAdminModules()

  app.use('/uploads', express.static(resolve(currentDir, '..', 'public', 'uploads')))

  const adminApp = express()
  adminApp.use(cors())
  adminApp.use(express.json({ limit: config.api.bodyLimit }))
  adminApp.use(express.urlencoded({ extended: true, limit: config.api.bodyLimit }))
  adminApp.use((req, _res, next) => {
    req.__requestStartTime = Date.now()
    next()
  })
  adminApp.use(responseMiddleware)
  adminApp.use(router)
  adminApp.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })
  adminApp.use((error, _req, res, _next) => {
    const message = error instanceof Error ? error.message : '后台服务异常'
    if (typeof res.error === 'function') {
      res.error(message, 500)
      return
    }
    res.status(500).json({ message })
  })

  app.use('/admin-api', adminApp)
}
