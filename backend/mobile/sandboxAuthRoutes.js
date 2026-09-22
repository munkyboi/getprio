const express = require("express");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const db = require("../src/config/db");
const asyncHandler = require("../src/middleware/asyncHandler");
const authService = require("../src/services/authService");
const sandboxAccountRepository = require("../src/repositories/sandboxDeveloperAccounts");
const userRepository = require("../src/repositories/users");
const sessionService = require("../src/services/sessionService");
const env = require("../src/config/env");
const {
  clearBrowserSession,
  getRefreshCookie,
  issueBrowserSession,
  parseCookies
} = require("../src/services/browserSessionService");

const router = express.Router();
const sandboxAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip || req.socket?.remoteAddress || "unknown"),
  message: { message: "Too many Sandbox authentication requests. Please try again later." }
});
router.use(sandboxAuthLimiter);

const SANDBOX_HOSTS = new Set(["sandbox-api.getprio.online", "sandbox.getprio.online"]);
const SANDBOX_USERNAME_PATTERN = /^sb_[a-z0-9]{8}$/;
const SANDBOX_EMAIL_PATTERNS = [
  /^sb-[a-z0-9]{8}@test\.getprio\.invalid$/,
  /^test-[a-z0-9-]+@sandbox\.invalid$/
];

function requestHostname(req) {
  return String(req.hostname || req.headers?.host || "")
    .trim()
    .toLowerCase()
    .split(":")[0];
}

function isSandboxHost(req) {
  const hostname = requestHostname(req);
  return SANDBOX_HOSTS.has(hostname) || hostname === "localhost" || hostname === "127.0.0.1";
}

router.use((req, _res, next) => {
  if (env.nodeEnv === "production" && !isSandboxHost(req)) {
    next(sandboxError("Sandbox authentication is unavailable on this API host.", 404, "SANDBOX_AUTH_UNAVAILABLE"));
    return;
  }
  next();
});

function sandboxError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function requireSandboxTestAccount(account) {
  if (!account || !account.isSandboxTestAccount || account.status !== "active") {
    throw sandboxError("Sandbox test user credentials are invalid.", 401, "INVALID_SANDBOX_CREDENTIALS");
  }
  if (!account.credentialExpiresAt || new Date(account.credentialExpiresAt).getTime() <= Date.now()) {
    throw sandboxError("Sandbox test user credentials are invalid.", 401, "INVALID_SANDBOX_CREDENTIALS");
  }
  return account;
}

function buildUserPayload(user) {
  return {
    id: String(user._id),
    name: user.name,
    displayName: user.displayName || "",
    avatarUrl: user.avatarUrl || "",
    username: user.username,
    email: user.email,
    phone: user.phone,
    roles: ["customer"],
    emailVerified: Boolean(user.emailVerified),
    hasPassword: true,
    mfaEnabled: false,
    mfaRequired: false,
    oauthProviders: [],
    tenants: []
  };
}

function buildMobileAuthResponse(res, user, sessionResult) {
  issueBrowserSession(res, sessionResult, {
    secure: env.authCookieSecure,
    csrfSecret: env.csrfSecret,
    accessMaxAgeSeconds: env.accessTokenTtlMinutes * 60
  });

  return {
    token: sessionResult.accessToken,
    refreshToken: sessionResult.refreshToken,
    sessionExpiresAt: sessionResult.session.inactivityExpiresAt || sessionResult.session.expiresAt,
    user: buildUserPayload(user)
  };
}

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const identifier = String(req.body?.identifier || req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const isUsername = SANDBOX_USERNAME_PATTERN.test(identifier);
    const isEmail = SANDBOX_EMAIL_PATTERNS.some((pattern) => pattern.test(identifier));
    if ((!isUsername && !isEmail) || !password) {
      throw sandboxError("Sandbox test user credentials are required.", 400, "INVALID_SANDBOX_CREDENTIALS");
    }

    const account = requireSandboxTestAccount(await sandboxAccountRepository.findByIdentifier(identifier));
    const user = await userRepository.findUserById(account.userId);
    if (
      !user ||
      (isEmail && user.email?.toLowerCase() !== identifier) ||
      (isUsername && user.username?.toLowerCase() !== identifier)
    ) {
      throw sandboxError("Sandbox test user credentials are invalid.", 401, "INVALID_SANDBOX_CREDENTIALS");
    }

    if (authService.isUserLocked(user)) {
      await authService.recordLockedLoginAttempt({ email: user.email, user, req });
      throw sandboxError("Sandbox test user credentials are invalid.", 401, "INVALID_SANDBOX_CREDENTIALS");
    }

    if (!(await authService.verifyPasswordLogin(user, password))) {
      await db.withTransaction(async (client) => {
        await authService.handleFailedPasswordLogin({ email: user.email, user, req, client });
      });
      throw sandboxError("Sandbox test user credentials are invalid.", 401, "INVALID_SANDBOX_CREDENTIALS");
    }

    const authenticatedUser = await db.withTransaction((client) =>
      authService.handleSuccessfulPasswordLogin({ user, client })
    );
    const sessionResult = await sessionService.createAuthSession({
      user: { ...authenticatedUser, roles: ["customer"], tenantMemberships: [] },
      authMethod: "password",
      ipAddress: authService.getRequestIp(req),
      userAgent: authService.getUserAgent(req),
      deviceLabel: "sandbox-mobile"
    });

    await authService.recordLoginAttempt({
      email: user.email,
      success: true,
      user: authenticatedUser,
      sessionId: sessionResult.session._id,
      req
    });
    res.json(buildMobileAuthResponse(res, authenticatedUser, sessionResult));
  })
);

router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const refreshToken = String(
      getRefreshCookie(parseCookies(req.headers.cookie), env.authCookieSecure) || req.body?.refreshToken || ""
    );
    if (!refreshToken) {
      throw sandboxError("refreshToken is required.", 400, "REFRESH_TOKEN_REQUIRED");
    }

    const session = await sessionService.resolveSessionByRefreshToken(refreshToken);
    if (!session || session.status !== "active" || new Date(session.expiresAt).getTime() <= Date.now()) {
      throw sandboxError("Refresh session is no longer valid.", 401, "SANDBOX_SESSION_INVALID");
    }

    requireSandboxTestAccount(await sandboxAccountRepository.findByUserId(session.userId));
    const user = await userRepository.findUserById(session.userId);
    if (!user) {
      throw sandboxError("Refresh session is no longer valid.", 401, "SANDBOX_SESSION_INVALID");
    }

    const sessionResult = await sessionService.rotateRefreshSession({
      session,
      user: { ...user, roles: ["customer"], tenantMemberships: [] }
    });
    res.json(buildMobileAuthResponse(res, user, sessionResult));
  })
);

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const refreshToken = String(
      getRefreshCookie(parseCookies(req.headers.cookie), env.authCookieSecure) || req.body?.refreshToken || ""
    );
    if (refreshToken) {
      const session = await sessionService.resolveSessionByRefreshToken(refreshToken);
      if (session?.status === "active" && await sandboxAccountRepository.findByUserId(session.userId)) {
        await sessionService.revokeSessionById(session._id, "logout");
      }
    }

    clearBrowserSession(res, { secure: env.authCookieSecure });
    res.json({ success: true });
  })
);

module.exports = router;
