const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const path = require("node:path");
const http = require("node:http");

function resolveMockPath(requestPath, baseDir) {
  if (!requestPath.startsWith(".")) {
    return require.resolve(requestPath, { paths: [baseDir] });
  }

  const absoluteBase = path.resolve(baseDir, requestPath);
  for (const candidate of [absoluteBase, `${absoluteBase}.js`, `${absoluteBase}.ts`]) {
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
    for (const [resolvedDependency, original] of originals.entries()) {
      if (original) require.cache[resolvedDependency] = original;
      else delete require.cache[resolvedDependency];
    }
  }
}

function createApp(router) {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/mobile/auth", router);
  app.use((error, _req, res, _next) => {
    res.status(error.statusCode || 500).json({ code: error.code, message: error.message });
  });
  return app;
}

async function withServer(app, callback) {
  const server = await new Promise((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });
  try {
    return await callback(`http://127.0.0.1:${server.address().port}/api/v1/mobile/auth`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function postJsonWithHost(url, host, body) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, {
      method: "POST",
      headers: {
        host,
        "content-type": "application/json"
      }
    }, (response) => {
      let responseBody = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { responseBody += chunk; });
      response.on("end", () => resolve({
        status: response.statusCode,
        json: async () => JSON.parse(responseBody)
      }));
    });
    request.on("error", reject);
    request.end(JSON.stringify(body));
  });
}

function sandboxRecord(overrides = {}) {
  return {
    userId: "41",
    projectId: "project-7",
    isSandboxTestAccount: true,
    status: "active",
    credentialExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides
  };
}

function sandboxUser() {
  return {
    _id: "41",
    name: "Sandbox Tester",
    displayName: "Sandbox Tester",
    username: "sb_abc12345",
    email: "sb-abc12345@test.getprio.invalid",
    roles: ["customer"],
    passwordHash: "hash"
  };
}

test("sandbox login accepts generated email and username credentials", async () => {
  const calls = [];
  const router = requireWithMocks("../mobile/sandboxAuthRoutes.js", {
    "../src/config/db": {
      withTransaction: async (callback) => callback({})
    },
    "../src/config/env": {
      apiEnvironment: "sandbox",
      authCookieSecure: false,
      csrfSecret: "csrf-secret",
      accessTokenTtlMinutes: 15
    },
    "../src/services/authService": {
      getRequestIp: () => "127.0.0.1",
      getUserAgent: () => "sandbox-test-agent",
      verifyPasswordLogin: async () => true,
      isUserLocked: () => false,
      handleSuccessfulPasswordLogin: async ({ user }) => user,
      recordLoginAttempt: async () => {}
    },
    "../src/repositories/sandboxDeveloperAccounts": {
      findByIdentifier: async (identifier) => {
        calls.push({ type: "findByIdentifier", identifier });
        return sandboxRecord();
      },
      findByUserId: async () => sandboxRecord()
    },
    "../src/repositories/users": {
      findUserById: async () => sandboxUser(),
      findUserByUsername: async (username) => {
        calls.push({ type: "findByUsername", username });
        return sandboxUser();
      }
    },
    "../src/services/sessionService": {
      createAuthSession: async (options) => {
        calls.push({ type: "createAuthSession", options });
        return {
          accessToken: "access-token",
          refreshToken: "refresh-token",
          session: {
            _id: "session-1",
            expiresAt: sandboxRecord().credentialExpiresAt,
            inactivityExpiresAt: sandboxRecord().credentialExpiresAt
          }
        };
      }
    },
    "../src/services/browserSessionService": {
      issueBrowserSession: () => {},
      clearBrowserSession: () => {},
      getRefreshCookie: () => null,
      parseCookies: () => ({})
    }
  });

  await withServer(createApp(router), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        identifier: "sb-abc12345@test.getprio.invalid",
        password: "shown-once-password"
      })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.token, "access-token");
    assert.equal(body.refreshToken, "refresh-token");
    assert.equal(body.user.id, "41");
    assert.deepEqual(calls[0], { type: "findByIdentifier", identifier: "sb-abc12345@test.getprio.invalid" });
    assert.equal(calls[1].options.authMethod, "password");
    assert.equal(calls[1].options.deviceLabel, "sandbox-mobile");

    const usernameResponse = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        identifier: "sb_abc12345",
        password: "shown-once-password"
      })
    });
    assert.equal(usernameResponse.status, 200);
    assert.deepEqual(calls.find((call) => call.identifier === "sb_abc12345"), {
      type: "findByIdentifier",
      identifier: "sb_abc12345"
    });
  });
});

test("sandbox auth is unavailable on the production API host", async () => {
  const router = requireWithMocks("../mobile/sandboxAuthRoutes.js", {
    "../src/config/env": { nodeEnv: "production" },
    "../src/services/authService": {},
    "../src/repositories/sandboxDeveloperAccounts": {},
    "../src/repositories/users": {},
    "../src/services/sessionService": {},
    "../src/config/db": {},
    "../src/services/browserSessionService": {}
  });

  await withServer(createApp(router), async (baseUrl) => {
    const response = await postJsonWithHost(`${baseUrl}/login`, "api.getprio.online", {
      identifier: "sb-abc12345@test.getprio.invalid",
      password: "password"
    });
    assert.equal(response.status, 404);
    assert.equal((await response.json()).code, "SANDBOX_AUTH_UNAVAILABLE");
  });
});

test("sandbox login rejects production and expired identities", async () => {
  let repositoryCalls = 0;
  const router = requireWithMocks("../mobile/sandboxAuthRoutes.js", {
    "../src/config/db": {
      withTransaction: async (callback) => callback({})
    },
    "../src/config/env": { apiEnvironment: "sandbox", authCookieSecure: false, csrfSecret: "csrf-secret", accessTokenTtlMinutes: 15 },
    "../src/repositories/sandboxDeveloperAccounts": {
      findByIdentifier: async () => {
        repositoryCalls += 1;
        return sandboxRecord({ credentialExpiresAt: new Date(Date.now() - 1_000).toISOString() });
      }
    },
    "../src/services/authService": {
      verifyPasswordLogin: async () => true,
      isUserLocked: () => false,
      handleSuccessfulPasswordLogin: async ({ user }) => user,
      recordLoginAttempt: async () => {}
    },
    "../src/repositories/users": { findUserById: async () => sandboxUser() },
    "../src/services/sessionService": {},
    "../src/services/browserSessionService": {
      issueBrowserSession: () => {},
      clearBrowserSession: () => {},
      getRefreshCookie: () => null,
      parseCookies: () => ({})
    }
  });

  await withServer(createApp(router), async (baseUrl) => {
    const productionResponse = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier: "customer@example.com", password: "password" })
    });
    assert.equal(productionResponse.status, 400);
    assert.equal((await productionResponse.json()).code, "INVALID_SANDBOX_CREDENTIALS");
    assert.equal(repositoryCalls, 0);

    const expiredResponse = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier: "sb-abc12345@test.getprio.invalid", password: "password" })
    });
    assert.equal(expiredResponse.status, 401);
    assert.equal((await expiredResponse.json()).code, "INVALID_SANDBOX_CREDENTIALS");
  });
});

test("sandbox refresh revalidates the developer test-account realm before rotation", async () => {
  const calls = [];
  const router = requireWithMocks("../mobile/sandboxAuthRoutes.js", {
    "../src/config/db": {
      withTransaction: async (callback) => callback({})
    },
    "../src/config/env": { apiEnvironment: "sandbox", authCookieSecure: false, csrfSecret: "csrf-secret", accessTokenTtlMinutes: 15 },
    "../src/services/authService": { getRequestIp: () => "127.0.0.1", getUserAgent: () => "agent" },
    "../src/repositories/sandboxDeveloperAccounts": {
      findByUserId: async () => sandboxRecord()
    },
    "../src/repositories/users": { findUserById: async () => sandboxUser() },
    "../src/services/sessionService": {
      resolveSessionByRefreshToken: async (token) => ({ _id: "session-1", userId: "41", status: "active", expiresAt: new Date(Date.now() + 60_000).toISOString(), refreshTokenHash: token }),
      rotateRefreshSession: async (options) => {
        calls.push(options);
        return {
          accessToken: "next-access-token",
          refreshToken: "next-refresh-token",
          session: { _id: "session-1", expiresAt: sandboxRecord().credentialExpiresAt, inactivityExpiresAt: sandboxRecord().credentialExpiresAt }
        };
      }
    },
    "../src/services/browserSessionService": {
      issueBrowserSession: () => {},
      clearBrowserSession: () => {},
      getRefreshCookie: () => null,
      parseCookies: () => ({})
    }
  });

  await withServer(createApp(router), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: "refresh-token" })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.token, "next-access-token");
    assert.equal(body.refreshToken, "next-refresh-token");
    assert.equal(calls[0].user.roles[0], "customer");
    assert.equal(calls[0].session._id, "session-1");
  });
});
