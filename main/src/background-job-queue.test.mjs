import assert from 'node:assert/strict'
import test from 'node:test'

import { enqueueBackgroundJob } from './background-job-queue.mjs'

test('runs same-session background jobs sequentially', async () => {
  const trace = []

  const firstJob = enqueueBackgroundJob({
    sessionKey: 'session-1',
    run: async () => {
      trace.push('start-1')
      await new Promise((resolve) => setTimeout(resolve, 20))
      trace.push('end-1')
    },
  })

  const secondJob = enqueueBackgroundJob({
    sessionKey: 'session-1',
    run: async () => {
      trace.push('start-2')
      trace.push('end-2')
    },
  })

  await Promise.all([firstJob, secondJob])

  assert.deepEqual(trace, ['start-1', 'end-1', 'start-2', 'end-2'])
})
