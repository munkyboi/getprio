const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function resolveMockPath(requestPath, baseDir) {
  if (!requestPath.startsWith(".")) {
    return require.resolve(requestPath, { paths: [baseDir] });
  }

  const absoluteBase = path.resolve(baseDir, requestPath);
  for (const candidate of [absoluteBase, `${absoluteBase}.js`]) {
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
    return require(targetPath);
  } finally {
    for (const [resolvedDependency, cachedModule] of originals.entries()) {
      if (cachedModule) {
        require.cache[resolvedDependency] = cachedModule;
      } else {
        delete require.cache[resolvedDependency];
      }
    }
  }
}

test("FCM test delivery returns redacted per-installation outcomes", async () => {
  const deactivatedTokens = [];
  const successes = [];
  const originalFetch = global.fetch;
  let fcmCalls = 0;
  global.fetch = async (url) => {
    if (url === "https://oauth2.googleapis.com/token") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: "access-token", expires_in: 3600 })
      };
    }

    fcmCalls += 1;
    return {
      ok: fcmCalls === 1,
      status: fcmCalls === 1 ? 200 : 400,
      json: async () => fcmCalls === 1
        ? { name: "projects/getprio/messages/message-1" }
        : { error: { status: "INVALID_ARGUMENT", message: "invalid token" } }
    };
  };

  try {
    const service = requireWithMocks("../mobile/fcmRegistrationService.js", {
      "../src/config/env": {
        fcmProjectId: "getprio",
        fcmClientEmail: "push@getprio.iam.gserviceaccount.com",
        fcmPrivateKey: "private-key"
      },
      "./pushRegistrationRepository": {
        recordSuccess: async (id) => successes.push(id),
        deactivateByToken: async (token) => deactivatedTokens.push(token)
      },
      jsonwebtoken: {
        sign: () => "signed-assertion"
      }
    });

    const registrations = [{
      id: "registration-1",
      installationId: "install-1",
      platform: "ios",
      token: "secret-device-token"
    }];
    const accepted = await service.sendToRegistrations({
      registrations,
      payload: {
        title: "Test",
        body: "Body",
        eventType: "diagnostic_push",
        notificationId: "notification-1"
      }
    });

    assert.deepEqual(accepted, {
      attempted: 1,
      sent: 1,
      configured: true,
      outcomes: [{
        registrationId: "registration-1",
        installationId: "install-1",
        platform: "ios",
        status: "accepted"
      }]
    });
    assert.equal(Object.hasOwn(accepted.outcomes[0], "token"), false);
    assert.deepEqual(successes, ["registration-1"]);

    const rejected = await service.sendToRegistrations({
      registrations,
      payload: {
        title: "Test",
        body: "Body",
        eventType: "diagnostic_push",
        notificationId: "notification-2"
      }
    });

    assert.equal(rejected.sent, 0);
    assert.deepEqual(rejected.outcomes[0], {
      registrationId: "registration-1",
      installationId: "install-1",
      platform: "ios",
      status: "failed",
      statusCode: 400,
      error: "FCM delivery failed (400)."
    });
    assert.deepEqual(deactivatedTokens, ["secret-device-token"]);
    assert.equal(Object.hasOwn(rejected.outcomes[0], "token"), false);
  } finally {
    global.fetch = originalFetch;
  }
});
