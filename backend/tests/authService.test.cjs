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

test("auth service normalizes request metadata and records failed login lockout state", async () => {
  const attempts = [];
  const updates = [];
  const events = [];
  const authService = requireWithMocks("../src/services/authService.js", {
    bcryptjs: {
      compare: async () => true
    },
    "../config/env": {
      loginLockoutThreshold: 3,
      loginLockoutWindowMinutes: 15,
      loginLockoutDurationMinutes: 20
    },
    "../repositories/authLoginAttempts": {
      createAttempt: async (data) => {
        attempts.push(data);
      },
      countRecentFailedAttempts: async () => 3
    },
    "../repositories/users": {
      updateUser: async (userId, data) => {
        updates.push({ userId, data });
        return { _id: userId, roles: ["customer"], accountLockedUntil: data.accountLockedUntil };
      }
    },
    "./securityEventService": {
      logSecurityEvent: async (event) => {
        events.push(event);
      }
    }
  });

  const originalNow = Date.now;
  Date.now = () => Date.parse("2026-07-01T00:00:00.000Z");

  try {
    assert.equal(authService.normalizeEmail("  Customer@Example.Com "), "customer@example.com");
    assert.equal(
      authService.getRequestIp({
        headers: {
          "cf-connecting-ip": "",
          "x-forwarded-for": "203.0.113.10, 203.0.113.11",
          "user-agent": "test-agent"
        },
        ip: "127.0.0.1"
      }),
      "203.0.113.10"
    );
    assert.equal(authService.getUserAgent({ headers: { "user-agent": "test-agent" } }), "test-agent");
    assert.equal(authService.getLockoutThreshold(), 3);
    assert.equal(authService.getLockoutWindowMinutes(), 15);
    assert.equal(authService.getLockoutDurationMinutes(), 20);
    assert.equal(
      new Date(Date.parse("2026-07-01T00:00:00.000Z") + authService.getLockoutDurationMinutes() * 60 * 1000).toISOString(),
      "2026-07-01T00:20:00.000Z"
    );
    assert.equal(
      authService.isUserLocked({ accountLockedUntil: "2026-07-01T00:30:00.000Z" }, new Date("2026-07-01T00:00:00.000Z")),
      true
    );
    assert.equal(await authService.verifyPasswordLogin({ passwordHash: "hash" }, "secret"), true);

    const failed = await authService.handleFailedPasswordLogin({
      user: { _id: "user-1", roles: ["customer"], accountLockedUntil: null },
      email: "Customer@Example.Com",
      req: {
        headers: {
          "x-forwarded-for": "203.0.113.10",
          "user-agent": "test-agent"
        },
        ip: "127.0.0.1"
      }
    });

    assert.equal(failed.recentFailedCount, 3);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].userId, "user-1");
    assert.equal(updates[0].data.failedLoginCount, 3);
    assert.ok(updates[0].data.lastFailedLoginAt instanceof Date);
    assert.equal(events.length, 2);
    assert.equal(events[0].eventType, "login_failed");
    assert.equal(events[1].eventType, "lockout_triggered");
    assert.equal(
      new Date(updates[0].data.accountLockedUntil).getTime() - updates[0].data.lastFailedLoginAt.getTime(),
      20 * 60 * 1000
    );
    assert.equal(
      new Date(updates[0].data.accountLockedUntil).getTime() > updates[0].data.lastFailedLoginAt.getTime(),
      true
    );

    const resetUser = await authService.handleSuccessfulPasswordLogin({
      user: {
        _id: "user-2",
        failedLoginCount: 1,
        lastFailedLoginAt: new Date("2026-06-30T23:30:00.000Z"),
        accountLockedUntil: new Date("2026-06-30T23:45:00.000Z"),
        lastLoginProvider: "google"
      }
    });

    assert.equal(resetUser._id, "user-2");
    assert.equal(updates[1].data.failedLoginCount, 0);
    assert.equal(updates[1].data.lastLoginProvider, "password");

    await authService.recordLockedLoginAttempt({
      email: "locked@example.com",
      user: { _id: "user-3", roles: ["vendor"] },
      req: { headers: { "user-agent": "test-agent" }, ip: "127.0.0.1" }
    });

    assert.equal(attempts[1].failureReason, "account_locked");
    assert.equal(events[2].eventType, "login_failed");
    assert.equal(events[3].eventType, "account_locked");
  } finally {
    Date.now = originalNow;
  }
});
