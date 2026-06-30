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

test("password reset service issues tokens, resets passwords, and rejects invalid flows", async () => {
  const resetTokens = new Map([
    [
      "token-row",
      {
        id: "token-row",
        user_id: "user-1",
        tokenHash: "token-hash",
        expires_at: new Date("2026-07-01T01:00:00.000Z"),
        used_at: null
      }
    ]
  ]);
  const invalidatedUsers = [];
  const createdTokens = [];
  const markedUsed = [];
  const revokedSessions = [];
  const securityEvents = [];
  const updatedUsers = [];
  const lookedUpUsers = [];
  const validTokenHash = "397a2a9c5bf5e2ccec38c2596b682bb1bd05fe6e4ecea6c10cf42755ff225403";
  const usersModulePath = require.resolve("../src/repositories/users.js");
  const authServiceModulePath = require.resolve("../src/services/authService.js");

  const passwordResetService = requireWithMocks("../src/services/passwordResetService.js", {
    bcryptjs: {
      hash: async (value) => `hash:${value}`
    },
    "../config/db": {
      withTransaction: async (callback) => callback({})
    },
    "../config/env": {
      clientUrl: "https://app.example.com",
      passwordResetTtlMinutes: 30
    },
    "../repositories/passwordResetTokens": {
      invalidateUnusedTokensForUser: async (userId) => {
        invalidatedUsers.push(String(userId));
      },
      createResetToken: async (data) => {
        createdTokens.push(data);
      },
      findByTokenHash: async (hash) => (hash === validTokenHash ? resetTokens.get("token-row") : null),
      markTokenUsed: async (id) => {
        markedUsed.push(String(id));
      }
    },
    "../repositories/users": {
      findUserById: async (userId) => {
        lookedUpUsers.push(String(userId));
        return { _id: String(userId), roles: ["customer"], email: "customer@example.com" };
      },
      updateUser: async (userId, data) => {
        updatedUsers.push({ userId: String(userId), data });
        return { _id: String(userId), roles: ["customer"], email: "customer@example.com" };
      }
    },
    "./sessionService": {
      revokeAllSessionsForUser: async (userId, reason) => {
        revokedSessions.push({ userId: String(userId), reason });
      }
    },
    "./securityEventService": {
      logSecurityEvent: async (event) => {
        securityEvents.push(event);
      }
    },
    "./authService": {
      verifyPasswordLogin: async (user, password) => password === "current-password" && Boolean(user.passwordHash)
    }
  });

  const originalNow = Date.now;
  Date.now = () => Date.parse("2026-07-01T00:00:00.000Z");

  try {
    assert.equal(
      passwordResetService.buildPasswordResetUrl("abc/123?x=y"),
      "https://app.example.com/login?resetToken=abc%2F123%3Fx%3Dy"
    );

    const issued = await passwordResetService.issuePasswordResetToken({
      user: { _id: "user-1", roles: ["customer"], email: "customer@example.com" },
      req: {
        headers: {
          "cf-connecting-ip": "203.0.113.10",
          "user-agent": "test-agent"
        },
        ip: "127.0.0.1"
      }
    });

    assert.equal(issued.token.length > 0, true);
    assert.equal(invalidatedUsers[0], "user-1");
    assert.equal(createdTokens[0].userId, "user-1");
    assert.equal(securityEvents[0].eventType, "password_reset_requested");
    assert.equal(issued.resetUrl.startsWith("https://app.example.com/login?resetToken="), true);

    await assert.rejects(
      () => passwordResetService.resetPassword({ token: "missing", newPassword: "new-password" }),
      (error) => error.statusCode === 400
    );

    const originalUsersModule = require.cache[usersModulePath];
    require.cache[usersModulePath] = {
      id: usersModulePath,
      filename: usersModulePath,
      loaded: true,
      exports: {
        findUserById: async (userId) => {
          lookedUpUsers.push(String(userId));
          return { _id: String(userId), roles: ["customer"], email: "customer@example.com" };
        },
        updateUser: async (userId, data) => {
          updatedUsers.push({ userId: String(userId), data });
          return { _id: String(userId), roles: ["customer"], email: "customer@example.com" };
        }
      }
    };

    const resetResult = await passwordResetService.resetPassword({
      token: "valid-token",
      newPassword: "new-password",
      req: {
        headers: {
          "cf-connecting-ip": "203.0.113.10",
          "user-agent": "test-agent"
        },
        ip: "127.0.0.1"
      }
    });

    assert.equal(resetResult._id, "user-1");
    assert.equal(lookedUpUsers.includes("user-1"), true);
    assert.equal(updatedUsers[0].data.passwordHash, "hash:new-password");
    assert.equal(markedUsed[0], "token-row");
    assert.deepEqual(revokedSessions[0], {
      userId: "user-1",
      reason: "password_reset"
    });
    assert.equal(securityEvents[1].eventType, "password_reset_completed");

    await assert.rejects(
      () =>
        passwordResetService.changePassword({
          user: { _id: "user-2", roles: ["customer"] },
          currentPassword: "current-password",
          newPassword: "new-password"
        }),
      (error) => error.statusCode === 400
    );

    await assert.rejects(
      () =>
        passwordResetService.changePassword({
          user: { _id: "user-3", roles: ["customer"], passwordHash: "hash" },
          currentPassword: "wrong-password",
          newPassword: "new-password"
        }),
      (error) => error.statusCode === 401
    );

    const originalAuthModule = require.cache[authServiceModulePath];
    require.cache[authServiceModulePath] = {
      id: authServiceModulePath,
      filename: authServiceModulePath,
      loaded: true,
      exports: {
        verifyPasswordLogin: async (user, password) => password === "current-password" && Boolean(user.passwordHash)
      }
    };

    const changed = await passwordResetService.changePassword({
      user: { _id: "user-4", roles: ["customer"], passwordHash: "hash" },
      currentPassword: "current-password",
      newPassword: "new-password",
      req: {
        headers: { "user-agent": "test-agent" },
        ip: "127.0.0.1"
      }
    });

    assert.equal(changed._id, "user-4");
    assert.equal(updatedUsers[1].data.passwordHash, "hash:new-password");
    assert.equal(revokedSessions[1].reason, "password_changed");
    assert.equal(securityEvents[2].eventType, "password_changed");
    if (originalAuthModule) {
      require.cache[authServiceModulePath] = originalAuthModule;
    } else {
      delete require.cache[authServiceModulePath];
    }
    if (originalUsersModule) {
      require.cache[usersModulePath] = originalUsersModule;
    } else {
      delete require.cache[usersModulePath];
    }
  } finally {
    Date.now = originalNow;
  }
});
