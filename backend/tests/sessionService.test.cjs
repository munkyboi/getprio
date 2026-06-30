const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const jwt = require("jsonwebtoken");

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

test("session service uses role-based refresh TTLs and hashes refresh tokens", async () => {
  const createCalls = [];
  const rotateCalls = [];
  const sessionService = requireWithMocks("../src/services/sessionService.js", {
    "../config/env": {
      jwtSecret: "test-secret",
      accessTokenTtlMinutes: 15,
      refreshTokenTtlDaysCustomer: 30,
      refreshTokenTtlDaysVendorStaff: 14,
      refreshTokenTtlDaysVendorAdmin: 7,
      refreshTokenTtlDaysPlatformAdmin: 3
    },
    "../repositories/authSessions": {
      createSession: async (data) => {
        createCalls.push(data);
        return {
          _id: "session-1",
          userId: String(data.userId),
          refreshTokenHash: data.refreshTokenHash,
          status: "active",
          authMethod: data.authMethod,
          expiresAt: data.expiresAt
        };
      },
      rotateSessionRefreshToken: async (sessionId, refreshTokenHash, expiresAt) => {
        rotateCalls.push({ sessionId, refreshTokenHash, expiresAt });
        return {
          _id: String(sessionId),
          userId: "user-1",
          refreshTokenHash,
          status: "active",
          authMethod: "password",
          expiresAt
        };
      },
      revokeSession: async () => null,
      revokeAllSessionsForUser: async () => null,
      findSessionByRefreshTokenHash: async (hash) => ({ _id: "session-1", refreshTokenHash: hash })
    }
  });

  const fixedNow = Date.parse("2026-07-01T00:00:00.000Z");
  const originalNow = Date.now;
  Date.now = () => fixedNow;

  try {
    const created = await sessionService.createAuthSession({
      user: {
        _id: "user-1",
        roles: ["customer"],
        tenantMemberships: []
      },
      authMethod: "password",
      ipAddress: "127.0.0.1",
      userAgent: "test-agent",
      deviceLabel: "browser"
    });

    assert.equal(createCalls.length, 1);
    assert.equal(createCalls[0].userId, "user-1");
    assert.equal(createCalls[0].authMethod, "password");
    assert.equal(createCalls[0].ipAddress, "127.0.0.1");
    assert.equal(createCalls[0].deviceLabel, "browser");
    assert.match(created.refreshToken, /^[a-f0-9]{96}$/);
    assert.equal(created.session._id, "session-1");
    assert.equal(created.accessToken, jwt.sign(
      { sub: "user-1", session_id: "session-1", roles: ["customer"] },
      "test-secret",
      { expiresIn: "15m" }
    ));
    assert.equal(new Date(createCalls[0].expiresAt).toISOString(), "2026-07-31T00:00:00.000Z");

    const rotated = await sessionService.rotateRefreshSession({
      session: { _id: "session-1" },
      user: {
        _id: "user-1",
        roles: ["platform_admin"],
        tenantMemberships: []
      }
    });

    assert.equal(rotateCalls.length, 1);
    assert.equal(rotateCalls[0].sessionId, "session-1");
    assert.match(rotateCalls[0].refreshTokenHash, /^[a-f0-9]{64}$/);
    assert.equal(new Date(rotateCalls[0].expiresAt).toISOString(), "2026-07-04T00:00:00.000Z");
    assert.equal(rotated.accessToken, jwt.sign(
      { sub: "user-1", session_id: "session-1", roles: ["platform_admin"] },
      "test-secret",
      { expiresIn: "15m" }
    ));

    assert.equal(
      sessionService.hashOpaqueToken("abc123"),
      "6ca13d52ca70c883e0f0bb101e425a89e8624de51db2d2392593af6a84118090"
    );
    assert.deepEqual(
      await sessionService.resolveSessionByRefreshToken("refresh-token"),
      {
        _id: "session-1",
        refreshTokenHash: sessionService.hashOpaqueToken("refresh-token")
      }
    );
  } finally {
    Date.now = originalNow;
  }
});
