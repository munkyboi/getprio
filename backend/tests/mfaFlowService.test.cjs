const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function resolveMockPath(requestPath, baseDir) {
  return require.resolve(path.resolve(baseDir, requestPath));
}

function requireWithMocks(targetPath, mocks) {
  const resolvedTarget = require.resolve(targetPath);
  const originals = new Map();
  try {
    for (const [requestPath, exports] of Object.entries(mocks)) {
      const resolvedDependency = resolveMockPath(requestPath, path.dirname(resolvedTarget));
      originals.set(resolvedDependency, require.cache[resolvedDependency]);
      require.cache[resolvedDependency] = {
        id: resolvedDependency,
        filename: resolvedDependency,
        loaded: true,
        exports
      };
    }
    delete require.cache[resolvedTarget];
    return require(resolvedTarget);
  } finally {
    delete require.cache[resolvedTarget];
    for (const [resolvedDependency, original] of originals) {
      if (original) require.cache[resolvedDependency] = original;
      else delete require.cache[resolvedDependency];
    }
  }
}

test("customer MFA removal revokes credentials and session assurance", async () => {
  const mfaService = require("../src/services/mfaService");
  const encryptionSecret = "test-encryption-secret";
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  const factor = {
    _id: "factor-1",
    ...mfaService.encryptSecret(secret, encryptionSecret)
  };
  const state = {
    userUpdate: null,
    credentialsRevoked: false,
    assuranceCleared: false,
    otherSessionsRevoked: false,
    securityEvent: null,
    email: null
  };
  const service = requireWithMocks("../src/services/mfaFlowService.js", {
    "../config/db": { withTransaction: async (callback) => callback({ id: "tx" }) },
    "../config/env": { mfaEncryptionSecret: encryptionSecret, mfaRecoveryPepper: "pepper" },
    "../repositories/authSessions": {
      clearMfaVerification: async () => { state.assuranceCleared = true; },
      revokeOtherSessionsForUser: async () => { state.otherSessionsRevoked = true; }
    },
    "../repositories/mfa": {
      findTotpFactor: async () => factor,
      consumeRecoveryCode: async () => false,
      revokeFactorsAndRecoveryCodes: async () => { state.credentialsRevoked = true; }
    },
    "../repositories/users": {
      updateUser: async (_userId, update) => { state.userUpdate = update; }
    },
    "./notificationService": {
      sendEmail: async (email) => { state.email = email; }
    },
    "./securityEventService": {
      logSecurityEvent: async (event) => { state.securityEvent = event; }
    },
    "./sessionService": {}
  });

  const result = await service.disableMfa({
    user: {
      _id: "user-1",
      email: "customer@example.com",
      mfaEnabled: true,
      roles: ["customer"],
      tenantMemberships: []
    },
    sessionId: "session-1",
    code: mfaService.generateTotp(secret),
    ipAddress: "127.0.0.1",
    userAgent: "test-agent"
  });

  assert.deepEqual(result, { success: true });
  assert.deepEqual(state.userUpdate, { mfaEnabled: false, mfaRequired: false });
  assert.equal(state.credentialsRevoked, true);
  assert.equal(state.assuranceCleared, true);
  assert.equal(state.otherSessionsRevoked, true);
  assert.equal(state.securityEvent.eventType, "mfa_disabled");
  assert.equal(state.email.purpose, "security_mfa_disabled");
});

test("an account role that requires MFA cannot disable it", async () => {
  const service = requireWithMocks("../src/services/mfaFlowService.js", {
    "../config/db": { withTransaction: async () => { throw new Error("transaction should not start"); } },
    "../config/env": { mfaEncryptionSecret: "secret", mfaRecoveryPepper: "pepper" },
    "../repositories/authSessions": {},
    "../repositories/mfa": {},
    "../repositories/users": {},
    "./notificationService": {},
    "./securityEventService": {},
    "./sessionService": {}
  });

  await assert.rejects(
    () => service.disableMfa({
      user: {
        _id: "admin-1",
        mfaEnabled: true,
        roles: ["platform_admin"],
        tenantMemberships: []
      },
      sessionId: "session-1",
      code: "123456"
    }),
    (error) => error.statusCode === 403 && error.code === "MFA_REQUIRED_FOR_ROLE"
  );
});

test("email MFA issues a one-time login challenge and accepts its OTP", async () => {
  const state = { created: null, email: null, consumed: false, authSession: null };
  const service = requireWithMocks("../src/services/mfaFlowService.js", {
    "../config/db": { withTransaction: async (callback) => callback({ id: "tx" }) },
    "../config/env": { mfaEncryptionSecret: "secret", mfaRecoveryPepper: "pepper" },
    "../repositories/authSessions": {},
    "../repositories/mfa": {
      findChallengeByTokenHash: async () => state.created || {
        _id: "login-1", userId: "7", challengeType: "login", primaryAuthenticatedAt: new Date(), ipAddress: "127.0.0.1", userAgent: "test", attemptCount: 0, expiresAt: new Date(Date.now() + 300000), usedAt: null
      },
      createChallenge: async (challenge) => { state.created = { ...challenge, _id: "email-1", attemptCount: 0, usedAt: null }; },
      consumeChallenge: async () => { state.consumed = true; return true; },
      recordChallengeFailure: async () => {},
      findTotpFactor: async () => null,
      consumeRecoveryCode: async () => false
    },
    "../repositories/users": {
      findUserById: async () => ({ _id: "7", email: "dev@example.com", emailVerified: true, emailMfaEnabled: true, lastLoginProvider: "password" })
    },
    "./notificationService": { sendEmail: async (email) => { state.email = email; } },
    "./securityEventService": {},
    "./sessionService": { createAuthSession: async (input) => { state.authSession = input; return { session: { _id: "session-1", expiresAt: new Date() }, accessToken: "access", refreshToken: "refresh" }; } }
  });

  const issued = await service.issueEmailLoginChallenge({ challengeToken: "login-token", ipAddress: "127.0.0.1", userAgent: "test" });
  assert.equal(issued.deliveryTarget, "d***@example.com");
  assert.match(state.email.text, /\b\d{6}\b/);
  const code = state.email.text.match(/\b\d{6}\b/)[0];
  const verified = await service.verifyLoginChallenge({ challengeToken: issued.token, method: "email", code });
  assert.equal(state.consumed, true);
  assert.equal(verified.user.email, "dev@example.com");
  assert.equal(state.authSession.surface, "app");
});
