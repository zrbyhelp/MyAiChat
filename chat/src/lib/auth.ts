type TokenGetter = () => Promise<string | null>
type SignedInGetter = () => boolean
type LoadedGetter = () => boolean
type VoidHandler = () => void

let getTokenImpl: TokenGetter = async () => null
let isSignedInImpl: SignedInGetter = () => false
let isLoadedImpl: LoadedGetter = () => false
let openSignInImpl: VoidHandler = () => {}
let onUnauthorizedImpl: VoidHandler = () => {}
let isBridgeConfigured = false

function authDebug(message: string, extra?: Record<string, unknown>) {
  console.debug('[auth]', message, extra || {})
}

async function sleep(ms: number) {
  await new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function waitForAuthBridge(timeoutMs = 20000) {
  if (isBridgeConfigured) {
    authDebug('waitForAuthBridge already configured', { timeoutMs })
    return true
  }

  authDebug('waitForAuthBridge start', { timeoutMs })
  const startedAt = Date.now()
  while (!isBridgeConfigured && Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => window.setTimeout(resolve, 25))
  }

  authDebug('waitForAuthBridge end', {
    configured: isBridgeConfigured,
    elapsedMs: Date.now() - startedAt,
  })
  return isBridgeConfigured
}

export class UnauthorizedError extends Error {
  constructor(message = '请先登录后再继续操作') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

export function configureAuthBridge(options: {
  getToken: TokenGetter
  isSignedIn: SignedInGetter
  isLoaded: LoadedGetter
  openSignIn: VoidHandler
  onUnauthorized?: VoidHandler
}) {
  getTokenImpl = options.getToken
  isSignedInImpl = options.isSignedIn
  isLoadedImpl = options.isLoaded
  openSignInImpl = options.openSignIn
  onUnauthorizedImpl = options.onUnauthorized || options.openSignIn
  isBridgeConfigured = true
  authDebug('configureAuthBridge', {
    configured: isBridgeConfigured,
    loaded: isLoadedImpl(),
    signedIn: isSignedInImpl(),
  })
}

export function isAuthLoadedNow() {
  return isLoadedImpl()
}

export function isSignedInNow() {
  return isSignedInImpl()
}

export function promptSignIn() {
  if (!isAuthLoadedNow() || isSignedInNow()) {
    authDebug('promptSignIn skipped', {
      loaded: isAuthLoadedNow(),
      signedIn: isSignedInNow(),
    })
    return
  }
  authDebug('promptSignIn open')
  openSignInImpl()
}

export function handleUnauthorized() {
  if (!isAuthLoadedNow() || isSignedInNow()) {
    authDebug('handleUnauthorized skipped', {
      loaded: isAuthLoadedNow(),
      signedIn: isSignedInNow(),
    })
    return
  }
  authDebug('handleUnauthorized trigger')
  onUnauthorizedImpl()
}

export async function getAuthorizationToken() {
  const token = await getTokenImpl()
  if (token || !isSignedInNow()) {
    authDebug('getAuthorizationToken first attempt', {
      signedIn: isSignedInNow(),
      hasToken: Boolean(token),
    })
    return token
  }

  authDebug('getAuthorizationToken retry start', {
    signedIn: isSignedInNow(),
  })
  for (const delayMs of [200, 500, 1000, 2000, 3000]) {
    await sleep(delayMs)
    const nextToken = await getTokenImpl()
    authDebug('getAuthorizationToken retry attempt', {
      delayMs,
      hasToken: Boolean(nextToken),
    })
    if (nextToken) {
      return nextToken
    }
  }

  return null
}

export async function waitForAuthReady(timeoutMs = 20000) {
  await waitForAuthBridge(timeoutMs)
  if (isAuthLoadedNow()) {
    authDebug('waitForAuthReady already loaded', { timeoutMs })
    return isAuthLoadedNow()
  }

  authDebug('waitForAuthReady start', { timeoutMs })
  const startedAt = Date.now()
  while (!isAuthLoadedNow() && Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => window.setTimeout(resolve, 50))
  }

  authDebug('waitForAuthReady end', {
    loaded: isAuthLoadedNow(),
    elapsedMs: Date.now() - startedAt,
  })
  return isAuthLoadedNow()
}

export async function createAuthorizedHeaders(initHeaders?: HeadersInit) {
  const headers = new Headers(initHeaders)
  await waitForAuthBridge()
  await waitForAuthReady()
  const token = await getAuthorizationToken()
  authDebug('createAuthorizedHeaders', {
    configured: isBridgeConfigured,
    loaded: isAuthLoadedNow(),
    signedIn: isSignedInNow(),
    hasToken: Boolean(token),
  })
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return headers
}
