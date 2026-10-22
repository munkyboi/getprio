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

test("developer MFA routes expose enrollment lifecycle and return updated user state", async () => {
  const calls = [];
  const updatedUser = { _id: "7", name: "Developer Test", displayName: "Developer Test", email: "dev@example.com", emailVerified: true, mfaEnabled: false, emailMfaEnabled: false };
  const router = loadRoute({
    "../config/db": { withTransaction: async (callback) => callback({}) },
    "../middleware/asyncHandler": (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next),
    "../middleware/developerAuth": {
      authenticateDeveloper: (req, _res, next) => {
        req.user = { _id: "7", passwordHash: "hash", roles: ["developer"] };
        req.auth = { sessionId: "session-1", session: { primaryAuthenticatedAt: new Date() } };
        req.developerMembership = { role: "owner" };
        next();
      }
    },
    "../repositories/users": { findUserById: async () => updatedUser },
    "../repositories/developerAccounts": { findMembershipByUserId: async () => ({ developerAccountId: "dev-1", role: "owner", accountStatus: "active" }) },
    "../services/authService": {
      verifyPasswordLogin: async () => true,
      getRequestIp: () => "127.0.0.1",
      getUserAgent: () => "test"
    },
    "../services/sessionService": {},
    "../services/securityEventService": {},
    "../services/customerRegistrationOtpService": { assertValidPassword: () => {} },
    "../services/passwordResetService": {},
    "../services/mfaFlowService": {
      startTotpEnrollment: async (input) => { calls.push(["start", input.currentCode]); return { secret: "SECRET", otpAuthUri: "otpauth://totp/GetPrio:test" }; },
      confirmTotpEnrollment: async (input) => { calls.push(["confirm", input.code]); updatedUser.mfaEnabled = true; return { recoveryCodes: ["ABCDE-12345"] }; },
      cancelTotpEnrollment: async () => { calls.push(["cancel"]); return { success: true, canceled: true }; },
      disableMfa: async (input) => { calls.push(["disable", input.code, input.recoveryCode]); updatedUser.mfaEnabled = false; return { success: true }; },
      enableEmailMfa: async () => { calls.push(["email-enable"]); updatedUser.emailMfaEnabled = true; updatedUser.mfaEnabled = true; return updatedUser; },
      disableEmailMfa: async () => { calls.push(["email-disable"]); updatedUser.emailMfaEnabled = false; updatedUser.mfaEnabled = false; return updatedUser; },
      verifyLoginChallenge: async (input) => { calls.push(["verify", input.surface]); return { user: updatedUser, sessionResult: { session: { _id: "session-1", expiresAt: "2036-01-01T00:00:00.000Z" } } }; }
    },
    "../services/browserSessionService": {
      clearBrowserSession: () => {},
      getRefreshCookie: () => "",
      issueBrowserSession: () => ({ csrfToken: "csrf" }),
      parseCookies: () => ({}),
      restoreBrowserCsrf: () => "csrf"
    }
  });

  await withServer(router, async (baseUrl) => {
    const start = await fetch(`${baseUrl}/mfa/enrollment/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentCode: "123456" }) });
    assert.equal(start.status, 200);
    assert.deepEqual(await start.json(), { secret: "SECRET", otpAuthUri: "otpauth://totp/GetPrio:test" });

    const confirm = await fetch(`${baseUrl}/mfa/enrollment/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "654321" }) });
    assert.equal(confirm.status, 200);
    assert.deepEqual(await confirm.json(), { success: true, recoveryCodes: ["ABCDE-12345"], user: { id: "7", name: "Developer Test", displayName: "Developer Test", email: "dev@example.com", emailVerified: true, mfaEnabled: true, emailMfaEnabled: false }, message: "Authenticator verification is now enabled. Save your recovery codes somewhere secure." });

    const cancel = await fetch(`${baseUrl}/mfa/enrollment/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(cancel.status, 200);
    assert.equal((await cancel.json()).canceled, true);

    const disable = await fetch(`${baseUrl}/mfa/disable`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "password", code: "654321" }) });
    assert.equal(disable.status, 200);
    assert.deepEqual(await disable.json(), { success: true, user: { id: "7", name: "Developer Test", displayName: "Developer Test", email: "dev@example.com", emailVerified: true, mfaEnabled: false, emailMfaEnabled: false }, message: "Multi-factor authentication has been removed from your account." });

    const enableEmail = await fetch(`${baseUrl}/mfa/email/enable`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(enableEmail.status, 200);
    assert.equal((await enableEmail.json()).user.emailMfaEnabled, true);
    const disableEmail = await fetch(`${baseUrl}/mfa/email/disable`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "password" }) });
    assert.equal(disableEmail.status, 200);
    assert.equal((await disableEmail.json()).user.emailMfaEnabled, false);
    const verify = await fetch(`${baseUrl}/mfa/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeToken: "token", method: "email", code: "123456" }) });
    assert.equal(verify.status, 200);
  });

  assert.deepEqual(calls, [["start", "123456"], ["confirm", "654321"], ["cancel"], ["disable", "654321", ""], ["email-enable"], ["email-disable"], ["verify", "developer"]]);
});
