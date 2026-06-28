const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

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

function createMockRes() {
  return {
    statusCode: 200,
    jsonBody: null,
    redirectUrl: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.jsonBody = payload;
      return this;
    },
    redirect(url) {
      this.redirectUrl = url;
      return this;
    }
  };
}

function getRouteHandlers(router, method, routePath) {
  const layer = router.stack.find(
    (entry) => entry.route && entry.route.path === routePath && entry.route.stack.length > 0
  );

  if (!layer) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${routePath}`);
  }

  return layer.route.stack.map((stackEntry) => stackEntry.handle);
}

test("oauth start route redirects to the provider authorization URL", () => {
  let capturedProvider = "";
  let capturedState = "";
  const authRoutes = requireWithMocks("../src/routes/authRoutes.js", {
    "../config/db": {},
    "../repositories/tenants": {},
    "../repositories/authSessions": {},
    "../repositories/users": {},
    "../middleware/asyncHandler": (handler) => handler,
    "../middleware/auth": {
      authenticate: (_req, _res, next) => next(),
      maybeAuthenticate: (_req, _res, next) => next()
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
      buildAuthorizationUrl: (provider, state) => {
        capturedProvider = provider;
        capturedState = state;
        return `https://oauth.example/${provider}?state=${encodeURIComponent(state)}`;
      },
      buildClientCallbackUrl: () => "",
      buildProviderAvailability: () => ({ google: true, facebook: false }),
      createOAuthState: (payload) => `state:${payload.provider}:${payload.intent}`,
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

  const [handler] = getRouteHandlers(authRoutes, "get", "/oauth/:provider/start");
  const req = {
    params: { provider: "google" },
    query: { intent: "register_vendor" }
  };
  const res = createMockRes();

  handler(req, res);

  assert.equal(capturedProvider, "google");
  assert.equal(capturedState, "state:google:register_vendor");
  assert.equal(res.redirectUrl, "https://oauth.example/google?state=state%3Agoogle%3Aregister_vendor");
});

test("oauth callback route completes login and redirects with tokens", async () => {
  const sessionResult = {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    session: { _id: "session-1" }
  };
  let receivedProfile = null;
  let receivedCallbackArgs = null;
  const oauthUser = {
    _id: "user-1",
    name: "Customer Example",
    username: "customer_example",
    email: "customer@example.com",
    phone: null,
    roles: ["customer"],
    emailVerified: true,
    passwordHash: null,
    oauthAccounts: [],
    tenantMemberships: []
  };
  const authRoutes = requireWithMocks("../src/routes/authRoutes.js", {
    "../config/db": { withTransaction: async (callback) => callback({}) },
    "../repositories/tenants": {
      findTenantsByIds: async () => []
    },
    "../repositories/authSessions": {},
    "../repositories/users": {
      findUserByOauthAccount: async () => null,
      findUserByEmail: async () => null,
      findUserByUsername: async () => null,
      createUser: async () => oauthUser,
      addOauthAccount: async (_userId, _account) => oauthUser,
      updateUser: async (_userId, _updates) => oauthUser
    },
    "../middleware/asyncHandler": (handler) => handler,
    "../middleware/auth": {
      authenticate: (_req, _res, next) => next(),
      maybeAuthenticate: (_req, _res, next) => next()
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
      buildClientCallbackUrl: (payload) => {
        receivedCallbackArgs = payload;
        return "https://app.example/oauth/callback#token=ok";
      },
      buildProviderAvailability: () => ({ google: true, facebook: false }),
      createOAuthState: () => "",
      exchangeCodeForProfile: async (payload) => {
        receivedProfile = payload;
        return {
          provider: "google",
          providerUserId: "provider-user-1",
          email: "customer@example.com",
          emailVerified: true,
          name: "Customer Example"
        };
      },
      ensureSupportedProvider: () => {},
      getProviderLabel: (provider) => provider,
      readOAuthState: () => ({ provider: "google", intent: "login" })
    },
    "../services/notificationService": {},
    "../services/passwordResetService": {},
    "../services/securityEventService": { logSecurityEvent: async () => {} },
    "../services/sessionService": {
      createAuthSession: async () => sessionResult
    }
  });

  const routeHandlers = getRouteHandlers(authRoutes, "all", "/oauth/:provider/callback");
  const handler = routeHandlers[0];
  const req = {
    method: "GET",
    params: { provider: "google" },
    query: { code: "auth-code", state: "oauth-state" },
    body: {},
    headers: {},
    user: null
  };
  const res = createMockRes();

  await handler(req, res);

  assert.deepEqual(receivedProfile, {
    provider: "google",
    code: "auth-code",
    requestBody: {}
  });
  assert.deepEqual(receivedCallbackArgs, {
    token: "access-token",
    refreshToken: "refresh-token",
    next: "/"
  });
  assert.equal(res.redirectUrl, "https://app.example/oauth/callback#token=ok");
});
