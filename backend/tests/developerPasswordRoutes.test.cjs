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
