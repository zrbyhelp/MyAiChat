type TokenGetter = () => Promise<string | null>
type SignedInGetter = () => boolean
type VoidHandler = () => void

let getTokenImpl: TokenGetter = async () => null
let isSignedInImpl: SignedInGetter = () => false
let openSignInImpl: VoidHandler = () => {}
let onUnauthorizedImpl: VoidHandler = () => {}

export class UnauthorizedError extends Error {
  constructor(message = '请先登录后再继续操作') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

export function configureAuthBridge(options: {
  getToken: TokenGetter
  isSignedIn: SignedInGetter
  openSignIn: VoidHandler
  onUnauthorized?: VoidHandler
}) {
  getTokenImpl = options.getToken
  isSignedInImpl = options.isSignedIn
  openSignInImpl = options.openSignIn
  onUnauthorizedImpl = options.onUnauthorized || options.openSignIn
}

export function isSignedInNow() {
  return isSignedInImpl()
}

export function promptSignIn() {
  openSignInImpl()
}

export function handleUnauthorized() {
  onUnauthorizedImpl()
}

export async function getAuthorizationToken() {
  return getTokenImpl()
}

export async function createAuthorizedHeaders(initHeaders?: HeadersInit) {
  const headers = new Headers(initHeaders)
  const token = await getAuthorizationToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return headers
}
