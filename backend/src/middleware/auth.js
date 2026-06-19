const jwt = require("jsonwebtoken");
const env = require("../config/env");
const authSessionRepository = require("../repositories/authSessions");
const userRepository = require("../repositories/users");
const permissions = require("../services/permissions");

function getTokenFromRequest(req) {
  const authorization = req.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice(7);
}

async function loadAuthenticatedUser(req, strict) {
  const token = getTokenFromRequest(req);
  if (!token) {
    if (strict) {
      const error = new Error("Authentication required.");
      error.statusCode = 401;
      throw error;
    }

    req.user = null;
    return;
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const sessionId = payload.session_id ? Number(payload.session_id) : null;
    if (!sessionId) {
      const error = new Error("User session is no longer valid.");
      error.statusCode = 401;
      throw error;
    }

    const session = await authSessionRepository.findSessionById(sessionId);
    if (!session || session.status !== "active" || new Date(session.expiresAt).getTime() <= Date.now()) {
      const error = new Error("User session is no longer valid.");
      error.statusCode = 401;
      throw error;
    }

    const user = await userRepository.findUserById(payload.sub);

    if (!user) {
      const error = new Error("User session is no longer valid.");
      error.statusCode = 401;
      throw error;
    }

    req.user = user;
    req.auth = {
      sessionId: String(session._id)
    };
  } catch (error) {
    error.statusCode = 401;
    throw error;
  }
}

async function authenticate(req, res, next) {
  try {
    await loadAuthenticatedUser(req, true);
    next();
  } catch (error) {
    next(error);
  }
}

async function maybeAuthenticate(req, res, next) {
  try {
    await loadAuthenticatedUser(req, false);
    next();
  } catch (error) {
    next(error);
  }
}

function userHasTenantAccess(user, tenantId) {
  return (user.tenantMemberships || []).some(
    (membership) => String(membership.tenantId) === String(tenantId) && membership.isActive !== false
  );
}

function getTenantRole(user, tenantId) {
  return permissions.getTenantRole(user, tenantId);
}

function userIsTenantOwner(user, tenantId) {
  return permissions.getTenantRole(user, tenantId) === "owner";
}

function assertTenantOwner(user, tenantId) {
  if (permissions.getTenantRole(user, tenantId) === "owner") {
    return;
  }

  const error = new Error("You do not have permission to perform that action.");
  error.statusCode = 403;
  throw error;
}

function assertTenantPermission(user, tenantId, permission) {
  permissions.assertPermission(user, permission, { tenantId });
}

function userIsPlatformAdmin(user) {
  return permissions.userHasPermission(user, "platform.tenants.read");
}

function requirePlatformAdmin(req, _res, next) {
  try {
    permissions.assertPermission(req.user, "platform.tenants.read");
    next();
  } catch (error) {
    next(error);
  }
}

function requirePlatformPermission(permission) {
  return function platformPermissionMiddleware(req, _res, next) {
    try {
      permissions.assertPermission(req.user, permission);
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  authenticate,
  maybeAuthenticate,
  userHasTenantAccess,
  getTenantRole,
  userIsTenantOwner,
  assertTenantOwner,
  assertTenantPermission,
  userIsPlatformAdmin,
  requirePlatformAdmin,
  requirePlatformPermission
};
