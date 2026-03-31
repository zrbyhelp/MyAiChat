const DEFAULT_MAX_CONCURRENCY = 2
const parsedConcurrency = Number.parseInt(String(process.env.CHAT_BACKGROUND_JOB_CONCURRENCY || ''), 10)
const MAX_CONCURRENCY = Number.isInteger(parsedConcurrency) && parsedConcurrency > 0
  ? parsedConcurrency
  : DEFAULT_MAX_CONCURRENCY
const DEBUG_LOGS_ENABLED = strToBool(process.env.CHAT_BACKGROUND_JOB_DEBUG)

let nextJobId = 1
let runningCount = 0
const pendingJobs = []
const activeSessionKeys = new Set()

function strToBool(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase())
}

function queueDebugLog(label, payload) {
  if (!DEBUG_LOGS_ENABLED) {
    return
  }
  console.info(label, payload)
}

function resolveSessionKey(value) {
  const text = String(value || '').trim()
  if (text) {
    return text
  }
  return `anonymous:${nextJobId}`
}

function startJob(job) {
  runningCount += 1
  activeSessionKeys.add(job.sessionKey)
  queueDebugLog('[background-queue:started]', {
    id: job.id,
    sessionKey: job.sessionKey,
    pendingCount: pendingJobs.length,
    runningCount,
    maxConcurrency: MAX_CONCURRENCY,
  })

  Promise.resolve()
    .then(() => job.run())
    .then(
      (result) => {
        job.resolve(result)
      },
      (error) => {
        job.reject(error)
      },
    )
    .finally(() => {
      runningCount = Math.max(0, runningCount - 1)
      activeSessionKeys.delete(job.sessionKey)
      queueDebugLog('[background-queue:finished]', {
        id: job.id,
        sessionKey: job.sessionKey,
        pendingCount: pendingJobs.length,
        runningCount,
        maxConcurrency: MAX_CONCURRENCY,
      })
      pumpQueue()
    })
}

function pumpQueue() {
  while (runningCount < MAX_CONCURRENCY) {
    const index = pendingJobs.findIndex((job) => !activeSessionKeys.has(job.sessionKey))
    if (index < 0) {
      return
    }

    const [job] = pendingJobs.splice(index, 1)
    if (!job) {
      return
    }
    startJob(job)
  }
}

export function enqueueBackgroundJob(input) {
  return new Promise((resolve, reject) => {
    const id = nextJobId
    nextJobId += 1
    const sessionKey = resolveSessionKey(input?.sessionKey)
    pendingJobs.push({
      id,
      sessionKey,
      run: typeof input?.run === 'function' ? input.run : async () => null,
      resolve,
      reject,
    })
    queueDebugLog('[background-queue:enqueued]', {
      id,
      sessionKey,
      pendingCount: pendingJobs.length,
      runningCount,
      maxConcurrency: MAX_CONCURRENCY,
    })
    pumpQueue()
  })
}
