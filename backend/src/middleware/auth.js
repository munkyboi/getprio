const jwt = require("jsonwebtoken");
const env = require("../config/env");
const userRepository = require("../repositories/users");

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
    const user = await userRepository.findUserById(payload.sub);

    if (!user) {
      const error = new Error("User session is no longer valid.");
      error.statusCode = 401;
      throw error;
    }

    req.user = user;
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
    (membership) => String(membership.tenantId) === String(tenantId)
  );
}

module.exports = {
  authenticate,
  maybeAuthenticate,
  userHasTenantAccess
};
