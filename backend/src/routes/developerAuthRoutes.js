const express = require("express");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const db = require("../config/db");
const env = require("../config/env");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticateDeveloper } = require("../middleware/developerAuth");
const authService = require("../services/authService");
const developerAccountRepository = require("../repositories/developerAccounts");
const userRepository = require("../repositories/users");
const sessionService = require("../services/sessionService");
const securityEventService = require("../services/securityEventService");
const {
  clearBrowserSession,
  getRefreshCookie,
  issueBrowserSession,
  parseCookies
} = require("../services/browserSessionService");

const router = express.Router();
const developerAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip || req.socket?.remoteAddress || "unknown"),
  message: { message: "Too many developer authentication requests. Please try again later." }
});

router.use(developerAuthLimiter);

function requestContext(req) {
  return {
    ipAddress: authService.getRequestIp(req),
    userAgent: authService.getUserAgent(req)
  };
}

function userPayload(user) {
  return {
    id: String(user._id),
    name: user.name,
    displayName: user.displayName || "",
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
    mfaEnabled: Boolean(user.mfaEnabled)
  };
}

function developerPayload(membership) {
  return {
    id: membership.developerAccountId,
    role: membership.role,
    status: membership.accountStatus
  };
}

function authResponse(req, res, user, membership, sessionResult) {
  const { csrfToken } = issueBrowserSession(res, sessionResult, {
    secure: env.authCookieSecure,
    csrfSecret: env.csrfSecret,
    accessMaxAgeSeconds: env.accessTokenTtlMinutes * 60,
    surface: "developer"
  });
  const compatibilityRequested =
    env.authBearerCompatibilityEnabled &&
    String(req.headers["x-auth-compatibility"] || "").toLowerCase() === "bearer-v1";

  return {
    user: userPayload(user),
    developerAccount: developerPayload(membership),
    csrfToken,
    sessionExpiresAt: sessionResult.session.inactivityExpiresAt || sessionResult.session.expiresAt,
    ...(compatibilityRequested
      ? { token: sessionResult.accessToken, refreshToken: sessionResult.refreshToken }
      : {})
  };
}

function invalidCredentials() {
  const error = new Error("Invalid email or password.");
  error.statusCode = 401;
  return error;
}

async function verifyDeveloperPassword(req, email, password) {
  const user = await userRepository.findUserByEmail(email);
  if (!user) {
    await authService.recordLoginAttempt({ email, success: false, failureReason: "invalid_credentials", req });
    throw invalidCredentials();
  }

  if (authService.isUserLocked(user)) {
    await authService.recordLockedLoginAttempt({ email, user, req });
    const error = new Error("Your account is temporarily locked. Please try again later.");
    error.statusCode = 423;
    throw error;
  }

  if (!(await authService.verifyPasswordLogin(user, password))) {
    await db.withTransaction(async (client) => {
      await authService.handleFailedPasswordLogin({ email, user, req, client });
    });
    throw invalidCredentials();
  }

  return user;
}

router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const refreshToken = String(
      getRefreshCookie(parseCookies(req.headers.cookie), env.authCookieSecure, "developer") || req.body?.refreshToken || ""
    );
    if (!refreshToken) {
      const error = new Error("refreshToken is required.");
      error.statusCode = 400;
      throw error;
    }

    const session = await sessionService.resolveSessionByRefreshToken(refreshToken);
    if (
      !session ||
      session.surface !== "developer" ||
      session.status !== "active" ||
      new Date(session.expiresAt).getTime() <= Date.now()
    ) {
      const error = new Error("Developer refresh session is no longer valid.");
      error.statusCode = 401;
      throw error;
    }

    const user = await userRepository.findUserById(session.userId);
    const membership = user && await developerAccountRepository.findMembershipByUserId(user._id);
    if (!user || !membership || membership.accountStatus !== "active") {
      const error = new Error("Developer account is not active.");
      error.statusCode = 403;
      error.code = "DEVELOPER_ACCOUNT_INACTIVE";
      throw error;
    }

    const sessionResult = await sessionService.rotateRefreshSession({ session, user });
    await securityEventService.logSecurityEvent({
      userId: user._id,
      sessionId: sessionResult.session._id,
      eventType: "developer_refresh_rotated",
      actorRole: membership.role,
      ipAddress: authService.getRequestIp(req),
      userAgent: authService.getUserAgent(req),
      metadata: {}
    });
    res.json(authResponse(req, res, user, membership, sessionResult));
  })
);

router.post(
  "/enroll",
  asyncHandler(async (req, res) => {
    const email = authService.normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    if (!email || !password) {
      const error = new Error("email and password are required.");
      error.statusCode = 400;
      throw error;
    }

    const user = await verifyDeveloperPassword(req, email, password);
    if (!user.emailVerified) {
      const error = new Error("Verify your GetPrio email before enrolling in the Developer Portal.");
      error.statusCode = 403;
      error.code = "EMAIL_VERIFICATION_REQUIRED";
      throw error;
    }

    const existingAccount = await developerAccountRepository.findAccountByOwnerUserId(user._id);
    if (existingAccount) {
      const error = new Error("This GetPrio account already has a Developer Portal account.");
      error.statusCode = 409;
      error.code = "DEVELOPER_ACCOUNT_EXISTS";
      throw error;
    }

    const context = requestContext(req);
    const result = await db.withTransaction(async (client) => {
      const updatedUser = await authService.handleSuccessfulPasswordLogin({ user, client });
      const membership = await developerAccountRepository.createAccountForOwner(updatedUser._id, { client });
      const sessionResult = await sessionService.createAuthSession({
        user: updatedUser,
        authMethod: "password",
        surface: "developer",
        ...context,
        client
      });
      await authService.recordLoginAttempt({
        email,
        success: true,
        user: updatedUser,
        sessionId: sessionResult.session._id,
        req,
        client
      });
      return { user: updatedUser, membership, sessionResult };
    });

    res.status(201).json(authResponse(req, res, result.user, result.membership, result.sessionResult));
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const email = authService.normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    if (!email || !password) {
      const error = new Error("email and password are required.");
      error.statusCode = 400;
      throw error;
    }

    const user = await verifyDeveloperPassword(req, email, password);
    const membership = await developerAccountRepository.findMembershipByUserId(user._id);
    if (!membership) {
      const error = new Error("Enroll this GetPrio account in the Developer Portal first.");
      error.statusCode = 403;
      error.code = "DEVELOPER_ENROLLMENT_REQUIRED";
      throw error;
    }
    if (membership.accountStatus !== "active") {
      const error = new Error("This Developer Portal account is not active.");
      error.statusCode = 403;
      error.code = "DEVELOPER_ACCOUNT_INACTIVE";
      throw error;
    }

    const context = requestContext(req);
    const result = await db.withTransaction(async (client) => {
      const updatedUser = await authService.handleSuccessfulPasswordLogin({ user, client });
      const sessionResult = await sessionService.createAuthSession({
        user: updatedUser,
        authMethod: "password",
        surface: "developer",
        ...context,
        client
      });
      await authService.recordLoginAttempt({
        email,
        success: true,
        user: updatedUser,
        sessionId: sessionResult.session._id,
        req,
        client
      });
      return { user: updatedUser, sessionResult };
    });

    res.json(authResponse(req, res, result.user, membership, result.sessionResult));
  })
);

router.get("/me", authenticateDeveloper, (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    user: userPayload(req.user),
    developerAccount: developerPayload(req.developerMembership)
  });
});

router.post(
  "/logout",
  authenticateDeveloper,
  asyncHandler(async (req, res) => {
    await sessionService.revokeSessionById(req.auth.sessionId, "logout");
    await securityEventService.logSecurityEvent({
      userId: req.user._id,
      sessionId: req.auth.sessionId,
      eventType: "developer_logout",
      actorRole: req.developerMembership.role,
      ipAddress: authService.getRequestIp(req),
      userAgent: authService.getUserAgent(req),
      metadata: {}
    });
    clearBrowserSession(res, { secure: env.authCookieSecure, surface: "developer" });
    res.status(204).end();
  })
);

module.exports = router;
