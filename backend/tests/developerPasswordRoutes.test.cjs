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

test("developer password route validates and changes the signed-in developer password", async () => {
  let changeInput;
  let clearedSurface;
  const router = loadRoute({
    "../config/db": { withTransaction: async (callback) => callback({}) },
    "../middleware/asyncHandler": (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next),
    "../middleware/developerAuth": {
      authenticateDeveloper: (req, _res, next) => {
        req.user = { _id: "7", roles: ["developer"], passwordHash: "hash" };
        req.auth = { sessionId: "session-1" };
        req.developerMembership = { role: "owner" };
        next();
      }
    },
    "../repositories/users": {},
    "../repositories/developerAccounts": {},
    "../services/authService": {},
    "../services/sessionService": {},
    "../services/securityEventService": {},
    "../services/customerRegistrationOtpService": {
      assertValidPassword: (password) => {
        if (password.length < 8) throw Object.assign(new Error("Password is too short."), { statusCode: 400 });
      }
    },
    "../services/mfaFlowService": {},
    "../services/passwordResetService": {
      changePassword: async (input) => { changeInput = input; }
    },
    "../services/browserSessionService": {
      clearBrowserSession: (_res, options) => { clearedSurface = options.surface; },
      getRefreshCookie: () => "",
      issueBrowserSession: () => ({ csrfToken: "csrf" }),
      parseCookies: () => ({}),
      restoreBrowserCsrf: () => "csrf"
    }
  });

  await withServer(router, async (baseUrl) => {
    const missing = await fetch(`${baseUrl}/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(missing.status, 400);
    assert.equal((await missing.json()).code, "PASSWORD_FIELDS_REQUIRED");

    const mismatch = await fetch(`${baseUrl}/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: "old-password", newPassword: "new-password", confirmPassword: "different-password" })
    });
    assert.equal(mismatch.status, 400);
    assert.equal((await mismatch.json()).code, "PASSWORD_CONFIRMATION_MISMATCH");

    const changed = await fetch(`${baseUrl}/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: "old-password", newPassword: "new-password", confirmPassword: "new-password" })
    });
    assert.equal(changed.status, 200);
    assert.deepEqual(await changed.json(), { success: true, message: "Your password has been changed. Please sign in again." });
    assert.equal(changeInput.currentPassword, "old-password");
    assert.equal(changeInput.newPassword, "new-password");
    assert.equal(changeInput.user._id, "7");
    assert.equal(clearedSurface, "developer");
  });
});

test("developer password reset request is generic and only emails active Developer Portal accounts", async () => {
  const sent = [];
  const issued = [];
  const users = new Map([
    ["active@example.com", { _id: "7", email: "active@example.com", roles: ["developer"] }],
    ["customer@example.com", { _id: "8", email: "customer@example.com", roles: ["customer"] }]
  ]);
  const router = loadRoute({
    "../config/db": { withTransaction: async (callback) => callback({}) },
    "../middleware/asyncHandler": (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next),
    "../middleware/developerAuth": { authenticateDeveloper: (_req, _res, next) => next() },
    "../repositories/users": { findUserByEmail: async (email) => users.get(email) || null },
    "../repositories/developerAccounts": { findMembershipByUserId: async (userId) => userId === "7" ? { accountStatus: "active" } : null },
    "../services/authService": { normalizeEmail: (value) => String(value || "").trim().toLowerCase() },
    "../services/passwordResetService": {
      issuePasswordResetToken: async ({ user }) => {
        issued.push(user._id);
        return { token: "reset-token", expiresAt: "2026-09-26T13:00:00.000Z" };
      },
      resetPassword: async () => {}
    },
    "../services/notificationService": { sendEmail: async (input) => { sent.push(input); } },
    "../services/securityEventService": {},
    "../services/customerRegistrationOtpService": {},
    "../services/mfaFlowService": {},
    "../services/sessionService": {},
    "../repositories/passwordResetTokens": {},
    "../services/browserSessionService": {}
  });

  await withServer(router, async (baseUrl) => {
    for (const email of ["active@example.com", "customer@example.com", "unknown@example.com"]) {
      const response = await fetch(`${baseUrl}/password-reset/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        success: true,
        message: "If an active Developer Portal account exists for that email, reset instructions have been sent."
      });
    }
  });

  assert.deepEqual(issued, ["7"]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "active@example.com");
  assert.equal(sent[0].subject, "Reset your GetPrio Developer Portal password");
  assert.deepEqual(sent[0].resendTemplate, {
    id: "getprio-developer-password-reset",
    variables: {
      ACTION_URL: "http://localhost:5174/reset-password?token=reset-token",
      EXPIRY_TEXT: "2026-09-26T13:00:00.000Z"
    }
  });
  assert.equal("text" in sent[0], false);
  assert.equal("emailTemplate" in sent[0], false);
});

test("developer password reset confirmation enforces the Developer Portal account boundary", async () => {
  let resetInput;
  const router = loadRoute({
    "../config/db": {},
    "../middleware/asyncHandler": (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next),
    "../middleware/developerAuth": { authenticateDeveloper: (_req, _res, next) => next() },
    "../repositories/developerAccounts": { findMembershipByUserId: async () => ({ accountStatus: "active" }) },
    "../services/authService": {},
    "../services/passwordResetService": { resetPassword: async (input) => { resetInput = input; } },
    "../services/notificationService": {},
    "../services/securityEventService": {},
    "../services/customerRegistrationOtpService": {
      assertValidPassword: (password) => {
        if (password !== "Strong!12") throw Object.assign(new Error("invalid password"), { statusCode: 400 });
      }
    },
    "../services/mfaFlowService": {},
    "../services/sessionService": {},
    "../repositories/users": {},
    "../repositories/passwordResetTokens": {},
    "../services/browserSessionService": {}
  });

  await withServer(router, async (baseUrl) => {
    const missing = await fetch(`${baseUrl}/password-reset/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "" })
    });
    assert.equal(missing.status, 400);

    const confirmed = await fetch(`${baseUrl}/password-reset/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "reset-token", newPassword: "Strong!12" })
    });
    assert.equal(confirmed.status, 200);
    assert.deepEqual(await confirmed.json(), { success: true, message: "Your Developer Portal password has been reset." });
  });

  assert.equal(resetInput.token, "reset-token");
  assert.equal(resetInput.newPassword, "Strong!12");
  assert.equal(typeof resetInput.userGuard, "function");
});
