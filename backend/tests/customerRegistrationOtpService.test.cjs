const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

function requireWithMocks(targetPath, mocks) {
  const resolvedTarget = require.resolve(targetPath);
  const originalLoad = Module._load;
  Module._load = (request, parent, isMain) => Object.hasOwn(mocks, request)
    ? mocks[request]
    : originalLoad.call(Module, request, parent, isMain);
  try {
    delete require.cache[resolvedTarget];
    return require(resolvedTarget);
  } finally {
    Module._load = originalLoad;
    delete require.cache[resolvedTarget];
  }
}

test("customer registration OTP sends a code and only creates a session after verification", async () => {
  const challenges = new Map();
  const sentEmails = [];
  const users = new Map();
  let sessionArgs = null;
  let userSequence = 0;
  const service = requireWithMocks("../src/services/customerRegistrationOtpService.js", {
    "../config/db": {
      withTransaction: async (callback) => callback({})
    },
    "../repositories/customerRegistrationOtps": {
      createChallenge: async (data) => {
        const challenge = {
          id: data.id,
          userId: String(data.userId),
          email: data.email,
          codeHash: data.codeHash,
          codeExpiresAt: data.codeExpiresAt,
          codeAttempts: 0,
          usedAt: null
        };
        challenges.set(challenge.id, challenge);
        return challenge;
      },
      findByIdForUpdate: async (id) => challenges.get(id) || null,
      recordAttempt: async (id) => {
        const challenge = challenges.get(id);
        challenge.codeAttempts += 1;
        return challenge;
      },
      replaceCode: async (id, data) => {
        const challenge = challenges.get(id);
        Object.assign(challenge, data, { codeAttempts: 0 });
        return challenge;
      },
      markUsed: async (id) => {
        const challenge = challenges.get(id);
        if (challenge.usedAt) return null;
        challenge.usedAt = new Date();
        return challenge;
      }
    },
    "../repositories/users": {
      createUser: async (data) => {
        const user = { _id: String(++userSequence), ...data, roles: ["customer"], tenantMemberships: [] };
        users.set(user._id, user);
        return user;
      },
      updateUser: async (id, changes) => {
        const user = users.get(String(id));
        Object.assign(user, changes);
        return user;
      }
    },
    "./notificationService": {
      sendEmail: async (email) => sentEmails.push(email)
    },
    "./sessionService": {
      createAuthSession: async (args) => {
        sessionArgs = args;
        return {
          accessToken: "access-1",
          refreshToken: "refresh-1",
          session: { _id: "session-1", expiresAt: new Date("2026-09-04T10:30:00Z") }
        };
      }
    }
  });

  const pending = await service.start({
    name: "Jane Doe",
    username: "jane_doe",
    email: "jane@example.com",
    passwordHash: "hashed-password"
  });

  assert.equal(pending.step, "email_otp");
  assert.equal(sentEmails.length, 1);
  assert.equal(sessionArgs, null);
  const code = sentEmails[0].text.match(/\b\d{6}\b/)[0];

  const verified = await service.verify({
    challengeId: pending.challengeId,
    code,
    ipAddress: "127.0.0.1",
    userAgent: "test-agent"
  });

  assert.equal(verified.user.emailVerified, true);
  assert.equal(verified.sessionResult.accessToken, "access-1");
  assert.equal(sessionArgs.authMethod, "password");
});

test("customer registration password validation enforces the client requirements", () => {
  const service = requireWithMocks("../src/services/customerRegistrationOtpService.js", {
    "../config/db": {},
    "../repositories/customerRegistrationOtps": {},
    "../repositories/users": {},
    "./notificationService": {},
    "./sessionService": {}
  });

  assert.doesNotThrow(() => service.assertValidPassword("Upper!12"));
  assert.throws(
    () => service.assertValidPassword("upper!1"),
    (error) => error.code === "CUSTOMER_REGISTRATION_PASSWORD_INVALID" && error.statusCode === 400
  );
  assert.throws(
    () => service.assertValidPassword("Upper!1234567890123456789012345678"),
    /6-32 characters/
  );
});
