const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const express = require("express");

function buildAsyncHandlerMock() {
  return (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function buildAuthMock() {
  return {
    authenticate(req, _res, next) {
      req.user = {
        _id: "user-1",
        name: "Customer One",
        username: "customer_one",
        email: "customer@example.com",
        phone: "09171234567",
        roles: ["customer"],
        emailVerified: true,
        passwordHash: "hash",
        oauthAccounts: [],
        tenantMemberships: []
      };
      req.auth = { sessionId: "session-1" };
      next();
    },
    maybeAuthenticate(req, _res, next) {
      req.user = null;
      req.auth = null;
      next();
    }
  };
}

function buildErrorHandlerMock() {
  return (error, _req, res, _next) => {
    res.status(error.statusCode || 500).json({
      message: error.message || "Unexpected server error."
    });
  };
}

function resolveMockPath(requestPath, baseDir) {
  if (!requestPath.startsWith(".")) {
    return require.resolve(requestPath, { paths: [baseDir] });
  }

  const absoluteBase = path.resolve(baseDir, requestPath);
  const candidates = [
    absoluteBase,
    `${absoluteBase}.js`,
    `${absoluteBase}.ts`,
    path.join(absoluteBase, "index.js"),
    path.join(absoluteBase, "index.ts")
  ];

  for (const candidate of candidates) {
    try {
      return require.resolve(candidate);
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error(`Unable to resolve mock path: ${requestPath}`);
}

function requireWithMocks(targetPath, mocks) {
  const resolvedTarget = require.resolve(targetPath);
  const originals = new Map();

  try {
    for (const [requestPath, mockExports] of Object.entries(mocks)) {
      const resolvedDependency = resolveMockPath(requestPath, path.dirname(resolvedTarget));
      originals.set(resolvedDependency, require.cache[resolvedDependency]);
      require.cache[resolvedDependency] = {
        id: resolvedDependency,
        filename: resolvedDependency,
        loaded: true,
        exports: mockExports
      };
    }

    delete require.cache[resolvedTarget];
    return require(resolvedTarget);
  } finally {
    delete require.cache[resolvedTarget];
    for (const [resolvedDependency, originalEntry] of originals.entries()) {
      if (originalEntry) {
        require.cache[resolvedDependency] = originalEntry;
      } else {
        delete require.cache[resolvedDependency];
      }
    }
  }
}

async function startServer(router, basePath) {
  const app = express();
  app.use(express.json());
  app.use(basePath, router);
  app.use(buildErrorHandlerMock());

  const server = await new Promise((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });

  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}${basePath}`
  };
}

async function stopServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

test("oauth providers endpoint exposes configured availability", async () => {
  const router = requireWithMocks("../src/routes/authRoutes.js", {
    "../config/db": {},
    "../repositories/tenants": {},
    "../repositories/authSessions": {},
    "../repositories/users": {},
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../middleware/auth": {
      authenticate: buildAuthMock().authenticate,
      maybeAuthenticate(req, _res, next) {
        req.user = {
          _id: "user-1",
          roles: ["customer"]
        };
        req.auth = { sessionId: "session-1" };
        next();
      }
    },
    "../services/authService": {
      normalizeEmail: (value) => String(value || "").trim().toLowerCase(),
      getRequestIp: () => null,
      getUserAgent: () => null,
      recordLoginAttempt: async () => {},
      isUserLocked: () => false,
      verifyPasswordLogin: async () => true,
      handleFailedPasswordLogin: async () => ({}),
      handleSuccessfulPasswordLogin: async () => ({})
    },
    "../services/oauthService": {
      buildAuthorizationUrl: () => "",
      buildClientCallbackUrl: () => "",
      buildProviderAvailability: () => ({ google: true, facebook: false }),
      createOAuthState: () => "",
      exchangeCodeForProfile: async () => ({}),
      ensureSupportedProvider: () => {},
      getProviderLabel: (provider) => provider,
      readOAuthState: () => ({ provider: "google", intent: "login" })
    },
    "../services/notificationService": {},
    "../services/passwordResetService": {},
    "../services/securityEventService": { logSecurityEvent: async () => {} },
    "../services/sessionService": {}
  });

  const { server, baseUrl } = await startServer(router, "/api/auth");
  try {
    const response = await fetch(`${baseUrl}/oauth/providers`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.providers, { google: true, facebook: false });
  } finally {
    await stopServer(server);
  }
});

test("login route returns tracked session tokens", async () => {
  const sessionResult = {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    session: { _id: "session-1" }
  };
  let authSessionPayload = null;
  const router = requireWithMocks("../src/routes/authRoutes.js", {
    "../config/db": {
      withTransaction: async (callback) => callback({})
    },
    "../repositories/tenants": {
      findTenantsByIds: async () => []
    },
    "../repositories/authSessions": {},
    "../repositories/users": {
      findUserByEmail: async () => ({
        _id: "user-1",
        email: "customer@example.com",
        username: "customer_one",
        passwordHash: "hash",
        failedLoginCount: 0,
        lastFailedLoginAt: null,
        accountLockedUntil: null,
        lastLoginProvider: "password",
        roles: ["customer"],
        oauthAccounts: [],
        tenantMemberships: []
      }),
      findUserByUsername: async () => null
    },
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../middleware/auth": buildAuthMock(),
    "../services/authService": {
      normalizeEmail: (value) => String(value || "").trim().toLowerCase(),
      normalizeLoginIdentifier: (value) => {
        const identifierValue = String(value || "").trim().toLowerCase();
        return {
          identifierType: identifierValue.includes("@") ? "email" : "username",
          identifierValue
        };
      },
      getRequestIp: () => "127.0.0.1",
      getUserAgent: () => "test-agent",
      recordLoginAttempt: async () => {},
      isUserLocked: () => false,
      verifyPasswordLogin: async () => true,
      handleFailedPasswordLogin: async () => ({}),
      handleSuccessfulPasswordLogin: async ({ user }) => user
    },
    "../services/oauthService": {
      buildAuthorizationUrl: () => "",
      buildClientCallbackUrl: ({ error }) =>
        `https://app.example/oauth/callback#error=${encodeURIComponent(error)}`,
      buildProviderAvailability: () => ({ google: false, facebook: false }),
      createOAuthState: () => "",
      exchangeCodeForProfile: async () => ({}),
      ensureSupportedProvider: () => {},
      getProviderLabel: (provider) => provider,
      readOAuthState: () => ({ provider: "google", intent: "login" })
    },
    "../services/notificationService": {},
    "../services/passwordResetService": {},
    "../services/securityEventService": { logSecurityEvent: async () => {} },
    "../services/sessionService": {
      createAuthSession: async (payload) => {
        authSessionPayload = payload;
        return sessionResult;
      }
    }
  });

  const { server, baseUrl } = await startServer(router, "/api/auth");
  try {
    const response = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "customer@example.com",
        password: "secret"
      })
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.token, "access-token");
    assert.equal(body.refreshToken, "refresh-token");
    assert.equal(body.user.email, "customer@example.com");
    assert.deepEqual(authSessionPayload.authMethod, "password");
    assert.deepEqual(authSessionPayload.ipAddress, "127.0.0.1");
    assert.deepEqual(authSessionPayload.userAgent, "test-agent");
  } finally {
    await stopServer(server);
  }
});

test("login route accepts a unique username as the sign-in identifier", async () => {
  const sessionResult = {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    session: { _id: "session-username" }
  };
  const lookups = [];
  let authSessionPayload = null;
  const router = requireWithMocks("../src/routes/authRoutes.js", {
    "../config/db": {
      withTransaction: async (callback) => callback({})
    },
    "../repositories/tenants": {
      findTenantsByIds: async () => []
    },
    "../repositories/authSessions": {},
    "../repositories/users": {
      findUserByEmail: async (email) => {
        lookups.push(["email", email]);
        return null;
      },
      findUserByUsername: async (username) => {
        lookups.push(["username", username]);
        return {
          _id: "user-1",
          email: "customer@example.com",
          username: "customer_one",
          passwordHash: "hash",
          failedLoginCount: 0,
          lastFailedLoginAt: null,
          accountLockedUntil: null,
          lastLoginProvider: "password",
          roles: ["customer"],
          oauthAccounts: [],
          tenantMemberships: []
        };
      }
    },
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../middleware/auth": buildAuthMock(),
    "../services/authService": {
      normalizeEmail: (value) => String(value || "").trim().toLowerCase(),
      normalizeLoginIdentifier: (value) => {
        const identifierValue = String(value || "").trim().toLowerCase();
        return {
          identifierType: identifierValue.includes("@") ? "email" : "username",
          identifierValue
        };
      },
      getRequestIp: () => "127.0.0.1",
      getUserAgent: () => "test-agent",
      recordLoginAttempt: async () => {},
      isUserLocked: () => false,
      verifyPasswordLogin: async () => true,
      handleFailedPasswordLogin: async () => ({}),
      handleSuccessfulPasswordLogin: async ({ user }) => user
    },
    "../services/oauthService": {
      buildAuthorizationUrl: () => "",
      buildClientCallbackUrl: ({ error }) =>
        `https://app.example/oauth/callback#error=${encodeURIComponent(error)}`,
      buildProviderAvailability: () => ({ google: false, facebook: false }),
      createOAuthState: () => "",
      exchangeCodeForProfile: async () => ({}),
      ensureSupportedProvider: () => {},
      getProviderLabel: (provider) => provider,
      readOAuthState: () => ({ provider: "google", intent: "login" })
    },
    "../services/notificationService": {},
    "../services/passwordResetService": {},
    "../services/securityEventService": { logSecurityEvent: async () => {} },
    "../services/sessionService": {
      createAuthSession: async (payload) => {
        authSessionPayload = payload;
        return sessionResult;
      }
    }
  });

  const { server, baseUrl } = await startServer(router, "/api/auth");
  try {
    const response = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: "Customer_One",
        password: "secret"
      })
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.token, "access-token");
    assert.equal(body.user.username, "customer_one");
    assert.deepEqual(lookups, [["username", "customer_one"]]);
    assert.equal(authSessionPayload.user.username, "customer_one");
  } finally {
    await stopServer(server);
  }
});

test("refresh route rotates refresh tokens and returns a fresh session payload", async () => {
  let rotatedSessionArgs = null;
  const router = requireWithMocks("../src/routes/authRoutes.js", {
    "../config/db": {},
    "../repositories/tenants": {
      findTenantsByIds: async () => []
    },
    "../repositories/authSessions": {
      findSessionById: async () => ({ _id: "session-1", userId: "user-1", status: "active", expiresAt: new Date(Date.now() + 60000) })
    },
    "../repositories/users": {
      findUserById: async () => ({
        _id: "user-1",
        email: "customer@example.com",
        roles: ["customer"],
        oauthAccounts: [],
        tenantMemberships: []
      })
    },
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../middleware/auth": buildAuthMock(),
    "../services/authService": {
      normalizeEmail: (value) => String(value || "").trim().toLowerCase(),
      getRequestIp: () => "127.0.0.1",
      getUserAgent: () => "test-agent",
      recordLoginAttempt: async () => {},
      isUserLocked: () => false,
      verifyPasswordLogin: async () => true,
      handleFailedPasswordLogin: async () => ({}),
      handleSuccessfulPasswordLogin: async () => ({})
    },
    "../services/oauthService": {
      buildAuthorizationUrl: () => "",
      buildClientCallbackUrl: ({ error }) =>
        `https://app.example/oauth/callback#error=${encodeURIComponent(error)}`,
      buildProviderAvailability: () => ({ google: false, facebook: false }),
      createOAuthState: () => "",
      exchangeCodeForProfile: async () => ({}),
      ensureSupportedProvider: () => {},
      getProviderLabel: (provider) => provider,
      readOAuthState: () => ({ provider: "google", intent: "login" })
    },
    "../services/notificationService": {},
    "../services/passwordResetService": {},
    "../services/securityEventService": { logSecurityEvent: async () => {} },
    "../services/sessionService": {
      resolveSessionByRefreshToken: async () => ({ _id: "session-1", userId: "user-1", status: "active", expiresAt: new Date(Date.now() + 60000) }),
      rotateRefreshSession: async ({ session, user }) => {
        rotatedSessionArgs = { session, user };
        return {
          accessToken: "new-access-token",
          refreshToken: "new-refresh-token",
          session
        };
      }
    }
  });

  const { server, baseUrl } = await startServer(router, "/api/auth");
  try {
    const response = await fetch(`${baseUrl}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: "refresh-token" })
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.token, "new-access-token");
    assert.equal(body.refreshToken, "new-refresh-token");
    assert.equal(body.user.email, "customer@example.com");
    assert.equal(rotatedSessionArgs.user._id, "user-1");
  } finally {
    await stopServer(server);
  }
});

test("logout route revokes the current session", async () => {
  let revokedSessionId = null;
  let loggedEvent = null;
  const router = requireWithMocks("../src/routes/authRoutes.js", {
    "../config/db": {},
    "../repositories/tenants": {
      findTenantsByIds: async () => []
    },
    "../repositories/authSessions": {
      findSessionById: async () => ({ _id: "session-1", userId: "user-1", status: "active" })
    },
    "../repositories/users": {},
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../middleware/auth": {
      authenticate: buildAuthMock().authenticate,
      maybeAuthenticate(req, _res, next) {
        req.user = { _id: "user-1", roles: ["customer"] };
        req.auth = { sessionId: "session-1" };
        next();
      }
    },
    "../services/authService": {
      normalizeEmail: (value) => String(value || "").trim().toLowerCase(),
      getRequestIp: () => "127.0.0.1",
      getUserAgent: () => "test-agent",
      recordLoginAttempt: async () => {},
      isUserLocked: () => false,
      verifyPasswordLogin: async () => true,
      handleFailedPasswordLogin: async () => ({}),
      handleSuccessfulPasswordLogin: async () => ({})
    },
    "../services/oauthService": {
      buildAuthorizationUrl: () => "",
      buildClientCallbackUrl: ({ error }) =>
        `https://app.example/oauth/callback#error=${encodeURIComponent(error)}`,
      buildProviderAvailability: () => ({ google: false, facebook: false }),
      createOAuthState: () => "",
      exchangeCodeForProfile: async () => ({}),
      ensureSupportedProvider: () => {},
      getProviderLabel: (provider) => provider,
      readOAuthState: () => ({ provider: "google", intent: "login" })
    },
    "../services/notificationService": {},
    "../services/passwordResetService": {},
    "../services/securityEventService": {
      logSecurityEvent: async (event) => {
        loggedEvent = event;
      }
    },
    "../services/sessionService": {
      revokeSessionById: async (sessionId) => {
        revokedSessionId = sessionId;
      }
    }
  });

  const { server, baseUrl } = await startServer(router, "/api/auth");
  try {
    const response = await fetch(`${baseUrl}/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(revokedSessionId, "session-1");
    assert.equal(loggedEvent.eventType, "logout");
  } finally {
    await stopServer(server);
  }
});

test("password reset request creates a reset token and sends email", async () => {
  let issuedResetToken = null;
  let sentEmail = null;
  const router = requireWithMocks("../src/routes/authRoutes.js", {
    "../config/db": {
      withTransaction: async (callback) => callback({})
    },
    "../repositories/tenants": {
      findTenantsByIds: async () => []
    },
    "../repositories/authSessions": {},
    "../repositories/users": {
      findUserByEmail: async () => ({
        _id: "user-1",
        email: "customer@example.com",
        roles: ["customer"],
        oauthAccounts: [],
        tenantMemberships: []
      })
    },
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../middleware/auth": buildAuthMock(),
    "../services/authService": {
      normalizeEmail: (value) => String(value || "").trim().toLowerCase(),
      getRequestIp: () => "127.0.0.1",
      getUserAgent: () => "test-agent",
      recordLoginAttempt: async () => {},
      isUserLocked: () => false,
      verifyPasswordLogin: async () => true,
      handleFailedPasswordLogin: async () => ({}),
      handleSuccessfulPasswordLogin: async () => ({})
    },
    "../services/oauthService": {
      buildAuthorizationUrl: () => "",
      buildClientCallbackUrl: ({ error }) =>
        `https://app.example/oauth/callback#error=${encodeURIComponent(error)}`,
      buildProviderAvailability: () => ({ google: false, facebook: false }),
      createOAuthState: () => "",
      exchangeCodeForProfile: async () => ({}),
      ensureSupportedProvider: () => {},
      getProviderLabel: (provider) => provider,
      readOAuthState: () => ({ provider: "google", intent: "login" })
    },
    "../services/notificationService": {
      sendEmail: async (email) => {
        sentEmail = email;
      }
    },
    "../services/passwordResetService": {
      issuePasswordResetToken: async () => {
        issuedResetToken = {
          resetUrl: "https://app.example/login?resetToken=reset-token",
          token: "reset-token",
          expiresAt: new Date("2026-06-28T00:30:00.000Z")
        };
        return issuedResetToken;
      }
    },
    "../services/securityEventService": { logSecurityEvent: async () => {} },
    "../services/sessionService": {}
  });

  const { server, baseUrl } = await startServer(router, "/api/auth");
  try {
    const response = await fetch(`${baseUrl}/password-reset/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "customer@example.com" })
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.ok(body.message.includes("If an account exists"));
    assert.equal(issuedResetToken.token, "reset-token");
    assert.equal(sentEmail.to, "customer@example.com");
  } finally {
    await stopServer(server);
  }
});

test("password reset confirm resets the password", async () => {
  let resetArgs = null;
  const router = requireWithMocks("../src/routes/authRoutes.js", {
    "../config/db": {},
    "../repositories/tenants": {
      findTenantsByIds: async () => []
    },
    "../repositories/authSessions": {},
    "../repositories/users": {},
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../middleware/auth": buildAuthMock(),
    "../services/authService": {
      normalizeEmail: (value) => String(value || "").trim().toLowerCase(),
      getRequestIp: () => "127.0.0.1",
      getUserAgent: () => "test-agent",
      recordLoginAttempt: async () => {},
      isUserLocked: () => false,
      verifyPasswordLogin: async () => true,
      handleFailedPasswordLogin: async () => ({}),
      handleSuccessfulPasswordLogin: async () => ({})
    },
    "../services/oauthService": {
      buildAuthorizationUrl: () => "",
      buildClientCallbackUrl: ({ error }) =>
        `https://app.example/oauth/callback#error=${encodeURIComponent(error)}`,
      buildProviderAvailability: () => ({ google: false, facebook: false }),
      createOAuthState: () => "",
      exchangeCodeForProfile: async () => ({}),
      ensureSupportedProvider: () => {},
      getProviderLabel: (provider) => provider,
      readOAuthState: () => ({ provider: "google", intent: "login" })
    },
    "../services/notificationService": {},
    "../services/passwordResetService": {
      resetPassword: async (payload) => {
        resetArgs = payload;
      }
    },
    "../services/securityEventService": { logSecurityEvent: async () => {} },
    "../services/sessionService": {}
  });

  const { server, baseUrl } = await startServer(router, "/api/auth");
  try {
    const response = await fetch(`${baseUrl}/password-reset/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "reset-token",
        newPassword: "new-password"
      })
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(resetArgs.token, "reset-token");
    assert.equal(resetArgs.newPassword, "new-password");
  } finally {
    await stopServer(server);
  }
});

test("oauth start rejects invalid intents and oauth callback rejects provider mismatches", async () => {
  const router = requireWithMocks("../src/routes/authRoutes.js", {
    "../config/db": {
      withTransaction: async (callback) => callback({})
    },
    "../repositories/tenants": {},
    "../repositories/authSessions": {},
    "../repositories/users": {
      findUserByEmail: async () => null,
      findUserByUsername: async () => null,
      createUser: async () => ({ _id: "user-1", roles: ["customer"], tenantMemberships: [] }),
      addOauthAccount: async (_id, account) => ({ _id, oauthAccounts: [account], roles: ["customer"], tenantMemberships: [] }),
      updateUser: async (userId) => ({ _id: userId, roles: ["customer"], tenantMemberships: [] })
    },
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../middleware/auth": buildAuthMock(),
    "../services/authService": {
      normalizeEmail: (value) => String(value || "").trim().toLowerCase(),
      getRequestIp: () => null,
      getUserAgent: () => null,
      recordLoginAttempt: async () => {},
      isUserLocked: () => false,
      verifyPasswordLogin: async () => true,
      handleFailedPasswordLogin: async () => ({}),
      handleSuccessfulPasswordLogin: async ({ user }) => user
    },
    "../services/oauthService": {
      buildAuthorizationUrl: () => "https://oauth.example.com",
      buildClientCallbackUrl: ({ error }) => `https://app.example/oauth/callback#error=${encodeURIComponent(error)}`,
      buildProviderAvailability: () => ({ google: true, facebook: false }),
      createOAuthState: () => "state",
      exchangeCodeForProfile: async () => ({ provider: "google", providerUserId: "1" }),
      ensureSupportedProvider: () => {},
      getProviderLabel: (provider) => provider,
      readOAuthState: () => ({ provider: "facebook", intent: "login" })
    },
    "../services/notificationService": {},
    "../services/passwordResetService": {},
    "../services/securityEventService": { logSecurityEvent: async () => {} },
    "../services/sessionService": {
      createAuthSession: async () => ({ accessToken: "token", refreshToken: "refresh", session: { _id: "session-1" } })
    }
  });

  const { server, baseUrl } = await startServer(router, "/api/auth");
  try {
    const startResponse = await fetch(`${baseUrl}/oauth/google/start?intent=invalid`, {
      redirect: "manual"
    });
    assert.equal(startResponse.status, 302);
    assert.ok((startResponse.headers.get("location") || "").includes("/oauth/callback#error="));

    const callbackResponse = await fetch(`${baseUrl}/oauth/google/callback?state=state&code=abc`, {
      redirect: "manual"
    });
    assert.equal(callbackResponse.status, 302);
    assert.ok((callbackResponse.headers.get("location") || "").includes("/oauth/callback#error="));
  } finally {
    await stopServer(server);
  }
});

test("register customer returns a tracked session and normalized username", async () => {
  let createdUser = null;
  let sessionPayload = null;
  const router = requireWithMocks("../src/routes/authRoutes.js", {
    "../config/db": {
      withTransaction: async (callback) => callback({})
    },
    "../repositories/tenants": {
      findTenantsByIds: async () => []
    },
    "../repositories/authSessions": {},
    "../repositories/users": {
      findUserByEmail: async () => null,
      findUserByUsername: async () => null,
      createUser: async (data) => {
        createdUser = data;
        return {
          _id: "user-1",
          ...data,
          oauthAccounts: [],
          tenantMemberships: []
        };
      }
    },
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../middleware/auth": buildAuthMock(),
    "../services/authService": {
      normalizeEmail: (value) => String(value || "").trim().toLowerCase(),
      getRequestIp: () => "127.0.0.1",
      getUserAgent: () => "test-agent",
      recordLoginAttempt: async () => {},
      isUserLocked: () => false,
      verifyPasswordLogin: async () => true,
      handleFailedPasswordLogin: async () => ({}),
      handleSuccessfulPasswordLogin: async () => ({})
    },
    "../services/oauthService": {
      buildAuthorizationUrl: () => "",
      buildClientCallbackUrl: () => "",
      buildProviderAvailability: () => ({ google: false, facebook: false }),
      createOAuthState: () => "",
      exchangeCodeForProfile: async () => ({}),
      ensureSupportedProvider: () => {},
      getProviderLabel: (provider) => provider,
      readOAuthState: () => ({ provider: "google", intent: "login" })
    },
    "../services/notificationService": {},
    "../services/passwordResetService": {},
    "../services/securityEventService": { logSecurityEvent: async () => {} },
    "../services/sessionService": {
      createAuthSession: async (payload) => {
        sessionPayload = payload;
        return {
          accessToken: "access-token",
          refreshToken: "refresh-token",
          session: { _id: "session-1" }
        };
      }
    }
  });

  const { server, baseUrl } = await startServer(router, "/api/auth");
  try {
    const response = await fetch(`${baseUrl}/register/customer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Customer One",
        username: "Customer_One",
        email: "Customer@Example.com",
        password: "secret"
      })
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.token, "access-token");
    assert.equal(body.refreshToken, "refresh-token");
    assert.equal(body.user.username, "customer_one");
    assert.equal(createdUser.email, "customer@example.com");
    assert.equal(createdUser.username, "customer_one");
    assert.equal(sessionPayload.authMethod, "password");
  } finally {
    await stopServer(server);
  }
});

test("register vendor returns a tracked session and tenant membership", async () => {
  let createdTenant = null;
  let createdUser = null;
  let sessionPayload = null;
  const router = requireWithMocks("../src/routes/authRoutes.js", {
    "../config/db": {
      withTransaction: async (callback) => callback({})
    },
    "../repositories/tenants": {
      findTenantsByIds: async () => [],
      findTenantBySlug: async () => null,
      createTenant: async (data) => {
        createdTenant = data;
        return { _id: "tenant-1", ...data };
      }
    },
    "../repositories/authSessions": {},
    "../repositories/users": {
      findUserByEmail: async () => null,
      findUserByUsername: async () => null,
      createUser: async (data) => {
        createdUser = data;
        return {
          _id: "user-1",
          ...data,
          oauthAccounts: [],
          tenantMemberships: [{ tenantId: "tenant-1", role: "owner", isActive: true }]
        };
      },
      addTenantMembership: async () => {}
    },
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../middleware/auth": buildAuthMock(),
    "../services/authService": {
      normalizeEmail: (value) => String(value || "").trim().toLowerCase(),
      getRequestIp: () => "127.0.0.1",
      getUserAgent: () => "test-agent",
      recordLoginAttempt: async () => {},
      isUserLocked: () => false,
      verifyPasswordLogin: async () => true,
      handleFailedPasswordLogin: async () => ({}),
      handleSuccessfulPasswordLogin: async () => ({})
    },
    "../services/oauthService": {
      buildAuthorizationUrl: () => "",
      buildClientCallbackUrl: ({ error }) =>
        `https://app.example/oauth/callback#error=${encodeURIComponent(error)}`,
      buildProviderAvailability: () => ({ google: false, facebook: false }),
      createOAuthState: () => "",
      exchangeCodeForProfile: async () => ({}),
      ensureSupportedProvider: () => {},
      getProviderLabel: (provider) => provider,
      readOAuthState: () => ({ provider: "google", intent: "login" })
    },
    "../services/notificationService": {},
    "../services/passwordResetService": {},
    "../services/securityEventService": { logSecurityEvent: async () => {} },
    "../services/sessionService": {
      createAuthSession: async (payload) => {
        sessionPayload = payload;
        return {
          accessToken: "access-token",
          refreshToken: "refresh-token",
          session: { _id: "session-1" }
        };
      }
    }
  });

  const { server, baseUrl } = await startServer(router, "/api/auth");
  try {
    const response = await fetch(`${baseUrl}/register/vendor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantName: "Demo Tenant",
        tenantSlug: "Demo Tenant",
        category: "sports",
        name: "Vendor One",
        username: "Vendor_One",
        email: "Vendor@Example.com",
        password: "secret"
      })
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.token, "access-token");
    assert.equal(body.refreshToken, "refresh-token");
    assert.equal(body.user.username, "vendor_one");
    assert.equal(createdTenant.slug, "demo-tenant");
    assert.equal(createdUser.email, "vendor@example.com");
    assert.equal(sessionPayload.authMethod, "password");
  } finally {
    await stopServer(server);
  }
});

test("oauth callback rejects expired state", async () => {
  const router = requireWithMocks("../src/routes/authRoutes.js", {
    "../config/db": {},
    "../repositories/tenants": {
      findTenantsByIds: async () => []
    },
    "../repositories/authSessions": {},
    "../repositories/users": {},
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../middleware/auth": buildAuthMock(),
    "../services/authService": {
      normalizeEmail: (value) => String(value || "").trim().toLowerCase(),
      getRequestIp: () => "127.0.0.1",
      getUserAgent: () => "test-agent",
      recordLoginAttempt: async () => {},
      isUserLocked: () => false,
      verifyPasswordLogin: async () => true,
      handleFailedPasswordLogin: async () => ({}),
      handleSuccessfulPasswordLogin: async () => ({})
    },
    "../services/oauthService": {
      buildAuthorizationUrl: () => "",
      buildClientCallbackUrl: ({ error }) => `https://app.example/oauth/callback#error=${encodeURIComponent(error)}`,
      buildProviderAvailability: () => ({ google: false, facebook: false }),
      createOAuthState: () => "",
      exchangeCodeForProfile: async () => ({}),
      ensureSupportedProvider: () => {},
      getProviderLabel: (provider) => provider,
      readOAuthState: () => {
        const error = new Error("OAuth session expired. Please try again.");
        error.statusCode = 400;
        throw error;
      }
    },
    "../services/notificationService": {},
    "../services/passwordResetService": {},
    "../services/securityEventService": { logSecurityEvent: async () => {} },
    "../services/sessionService": {}
  });

  const { server, baseUrl } = await startServer(router, "/api/auth");
  try {
    const response = await fetch(`${baseUrl}/oauth/google/callback?code=abc&state=expired`, {
      redirect: "manual"
    });
    assert.equal(response.status, 302);
    assert.match(response.headers.get("location") || "", /OAuth%20session%20expired/);
  } finally {
    await stopServer(server);
  }
});
