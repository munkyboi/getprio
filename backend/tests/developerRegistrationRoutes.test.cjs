const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const express = require("express");

function loadRoute(mocks) {
  const target = require.resolve("../src/routes/developerAuthRoutes.js");
  const originals = new Map();
  try {
    for (const [requestPath, value] of Object.entries(mocks)) {
      const resolved = require.resolve(requestPath, { paths: [path.dirname(target)] });
      originals.set(resolved, require.cache[resolved]);
      require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: value };
    }
    delete require.cache[target];
    return require(target);
  } finally {
    delete require.cache[target];
    for (const [resolved, original] of originals) {
      if (original) require.cache[resolved] = original;
      else delete require.cache[resolved];
    }
  }
}

async function withServer(router, run) {
  const app = express();
  app.use(express.json());
  app.use("/api/developer", router);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ message: error.message, code: error.code }));
  const server = await new Promise((resolve) => {
    const next = app.listen(0, () => resolve(next));
  });
  try {
    await run(`http://127.0.0.1:${server.address().port}/api/developer`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("developer registration creates a standalone developer identity after email verification", async () => {
  let startInput;
  let verifyInput;
  let createdAccountFor;
  const user = { _id: "developer-1", name: "Dev One", displayName: "", email: "dev@example.com", emailVerified: true, mfaEnabled: false, roles: ["developer"] };
  const sessionResult = { accessToken: "access", refreshToken: "refresh", session: { _id: "developer-session", expiresAt: new Date(Date.now() + 60_000) } };
  const router = loadRoute({
    "../config/db": { withTransaction: async (fn) => fn({}) },
    "../middleware/asyncHandler": (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next),
    "../middleware/developerAuth": { authenticateDeveloper: (_req, _res, next) => next() },
    "../repositories/users": { findUserByEmail: async () => null },
    "../repositories/developerAccounts": {
      createAccountForOwner: async (userId) => {
        createdAccountFor = userId;
        return { developerAccountId: "account-1", role: "owner", accountStatus: "active" };
      }
    },
    "../services/authService": {
      normalizeEmail: (value) => String(value || "").trim().toLowerCase(), getRequestIp: () => "127.0.0.1", getUserAgent: () => "test-agent",
      recordLoginAttempt: async () => {}, isUserLocked: () => false, verifyPasswordLogin: async () => true,
      handleFailedPasswordLogin: async () => {}, handleSuccessfulPasswordLogin: async ({ user: value }) => value, recordLockedLoginAttempt: async () => {}
    },
    "../services/sessionService": {},
    "../services/securityEventService": { logSecurityEvent: async () => {} },
    "../services/customerRegistrationOtpService": {
      assertValidPassword: () => {},
      start: async (input) => {
        startInput = input;
        return { challengeId: "challenge-1", step: "email_otp", deliveryTarget: "d***@example.com", expiresAt: "2026-09-20T00:00:00.000Z" };
      },
      verify: async (input) => {
        verifyInput = input;
        const extra = await input.onVerified({ user, sessionResult, client: {} });
        return { user, sessionResult, ...extra };
      },
      resend: async () => ({})
    }
  });

  await withServer(router, async (baseUrl) => {
    const start = await fetch(`${baseUrl}/register/otp`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Dev One", email: "dev@example.com", password: "Valid12!" })
    });
    assert.equal(start.status, 201);
    assert.equal((await start.json()).challengeId, "challenge-1");
    assert.equal(startInput.name, "Dev One");
    assert.deepEqual(startInput.roles, ["developer"]);
    assert.equal(startInput.purpose, "developer");

    const verify = await fetch(`${baseUrl}/register/otp/verify`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId: "challenge-1", code: "123456" })
    });
    assert.equal(verify.status, 201);
    const body = await verify.json();
    assert.equal(body.user.email, "dev@example.com");
    assert.equal(body.developerAccount.id, "account-1");
    assert.equal(createdAccountFor, "developer-1");
    assert.equal(verifyInput.purpose, "developer");
    assert.equal(verifyInput.surface, "developer");

    const invalidCode = await fetch(`${baseUrl}/register/otp/verify`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId: "challenge-1", code: "not-a-code" })
    });
    assert.equal(invalidCode.status, 400);
    assert.equal((await invalidCode.json()).code, "DEVELOPER_REGISTRATION_CODE_INVALID");

    const retiredEnrollment = await fetch(`${baseUrl}/enroll`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(retiredEnrollment.status, 404);
  });
});
