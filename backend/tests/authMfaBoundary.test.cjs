const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const jwt = require("jsonwebtoken");
const env = require("../src/config/env");

function loadAuth({ user, session }) {
  const target = require.resolve("../src/middleware/auth.js");
  const mocks = {
    "../repositories/authSessions": { findSessionById: async () => session, touchSession: async () => null },
    "../repositories/users": { findUserById: async () => user }
  };
  const originals = new Map();
  try {
    for (const [requestPath, exports] of Object.entries(mocks)) {
      const dependency = require.resolve(requestPath, { paths: [path.dirname(target)] });
      originals.set(dependency, require.cache[dependency]);
      require.cache[dependency] = { id: dependency, filename: dependency, loaded: true, exports };
    }
    delete require.cache[target];
    return require(target);
  } finally {
    delete require.cache[target];
    for (const [dependency, original] of originals) {
      if (original) require.cache[dependency] = original;
      else delete require.cache[dependency];
    }
  }
}

function authenticate(auth, user, originalUrl) {
  const token = jwt.sign({ sub: String(user._id), session_id: "8", roles: user.roles }, env.jwtSecret);
  const req = { headers: { authorization: `Bearer ${token}` }, originalUrl };
  return new Promise((resolve) => auth.authenticate(req, {}, (error) => resolve({ error, req })));
}

const baseSession = {
  _id: "8",
  status: "active",
  expiresAt: new Date(Date.now() + 60_000),
  absoluteExpiresAt: new Date(Date.now() + 60_000),
  inactivityExpiresAt: new Date(Date.now() + 60_000)
};
const privilegedUser = {
  _id: "7",
  roles: ["vendor"],
  tenantMemberships: [{ tenantId: "3", role: "owner", isActive: true }]
};

test("privileged sessions without MFA enrollment cannot access product APIs", async () => {
  const user = { ...privilegedUser, mfaEnabled: false };
  const auth = loadAuth({ user, session: baseSession });
  const denied = await authenticate(auth, user, "/tenant/demo/queue");
  assert.equal(denied.error?.statusCode, 403);
  assert.equal(denied.error?.code, "MFA_ENROLLMENT_REQUIRED");
  const enrollment = await authenticate(auth, user, "/auth/mfa/enrollment/start");
  assert.equal(enrollment.error, undefined);
  const liveMe = await authenticate(auth, user, "/api/auth/me");
  assert.equal(liveMe.error, undefined);
  const liveEnrollment = await authenticate(auth, user, "/api/auth/mfa/enrollment/start");
  assert.equal(liveEnrollment.error, undefined);
  const cancelEnrollment = await authenticate(auth, user, "/api/auth/mfa/enrollment/cancel");
  assert.equal(cancelEnrollment.error, undefined);
});

test("privileged sessions require verified MFA while customers remain unaffected", async () => {
  const privileged = { ...privilegedUser, mfaEnabled: true };
  const unverifiedAuth = loadAuth({ user: privileged, session: { ...baseSession, mfaVerifiedAt: null } });
  const denied = await authenticate(unverifiedAuth, privileged, "/platform/plans");
  assert.equal(denied.error?.code, "MFA_VERIFICATION_REQUIRED");

  const verifiedAuth = loadAuth({ user: privileged, session: { ...baseSession, mfaVerifiedAt: new Date() } });
  assert.equal((await authenticate(verifiedAuth, privileged, "/platform/plans")).error, undefined);

  const customer = { _id: "9", roles: ["customer"], tenantMemberships: [], mfaEnabled: false };
  const customerAuth = loadAuth({ user: customer, session: baseSession });
  assert.equal((await authenticate(customerAuth, customer, "/account")).error, undefined);
});
