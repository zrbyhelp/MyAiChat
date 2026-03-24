import { clerkMiddleware, getAuth } from "@clerk/express";

let clerkAuthMiddleware = null;

function getClerkMiddlewareOptions() {
  const secretKey = String(process.env.CLERK_SECRET_KEY || "").trim();
  const publishableKey = String(process.env.CLERK_PUBLISHABLE_KEY || "").trim();

  return {
    secretKey: secretKey || undefined,
    publishableKey: publishableKey || undefined,
  };
}

function getClerkAuthMiddleware() {
  if (!clerkAuthMiddleware) {
    clerkAuthMiddleware = clerkMiddleware(getClerkMiddlewareOptions());
  }

  return clerkAuthMiddleware;
}

function pickDisplayName(claims) {
  const directName = String(claims?.full_name || claims?.name || "").trim();
  if (directName) {
    return directName;
  }

  const parts = [claims?.given_name, claims?.family_name]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return parts.join(" ") || null;
}

function buildAuthUser(req) {
  const auth = getAuth(req);
  const userId = String(auth?.userId || "").trim();
  if (!userId) {
    return null;
  }

  const claims = auth?.sessionClaims || {};
  return {
    id: userId,
    email: String(claims?.email || claims?.email_address || "").trim() || null,
    displayName: pickDisplayName(claims),
    avatarUrl:
      String(claims?.image_url || claims?.picture || "").trim() || null,
  };
}

export function attachClerkAuth(req, res, next) {
  return getClerkAuthMiddleware()(req, res, next);
}

export function requireApiAuth(req, res, next) {
  const authUser = buildAuthUser(req);
  if (!authUser) {
    res.status(401).json({ message: "请先登录后再继续操作" });
    return;
  }

  req.authUser = authUser;
  next();
}
