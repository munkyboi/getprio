const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");

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

test("oauth service exposes configured provider availability and callback URLs", () => {
  const oauthService = requireWithMocks("../src/services/oauthService.js", {
    "../config/env": {
      googleClientId: "google-client",
      googleClientSecret: "google-secret",
      facebookAppId: "",
      facebookAppSecret: "",
      serverUrl: "https://api.example.com",
      appBaseUrl: "https://app.example.com",
      oauthCallbackPath: "/oauth/callback",
      oauthStateTtlMinutes: 10,
      jwtSecret: "test-secret",
      appleClientId: "com.getprio.getprioMobile",
      appleTeamId: "apple-team",
      appleKeyId: "apple-key",
      applePrivateKey: "-----BEGIN PRIVATE KEY-----\nnot-a-real-key\n-----END PRIVATE KEY-----"
    }
  });

  assert.deepEqual(oauthService.buildProviderAvailability(), {
    google: true,
    facebook: false,
    apple: true
  });

  const callbackUrl = oauthService.buildClientCallbackUrl({
    token: "access-token",
    refreshToken: "refresh-token",
    next: "/dashboard",
    error: ""
  });

  assert.equal(
    callbackUrl,
    "https://app.example.com/oauth/callback#token=access-token&refreshToken=refresh-token&next=%2Fdashboard"
  );

  const state = oauthService.createOAuthState({
    provider: "google",
    intent: "login"
  });
  const parsedState = oauthService.readOAuthState(state);

  assert.equal(parsedState.provider, "google");
  assert.equal(parsedState.intent, "login");
});

test("oauth service builds provider-specific authorization URLs", () => {
  const oauthService = requireWithMocks("../src/services/oauthService.js", {
    "../config/env": {
      googleClientId: "google-client",
      googleClientSecret: "google-secret",
      facebookAppId: "facebook-app",
      facebookAppSecret: "facebook-secret",
      serverUrl: "https://api.example.com",
      appBaseUrl: "https://app.example.com",
      oauthCallbackPath: "/oauth/callback",
      oauthStateTtlMinutes: 10,
      jwtSecret: "test-secret"
    }
  });

  const googleState = oauthService.createOAuthState({
    provider: "google",
    intent: "register_customer"
  });
  const googleUrl = new URL(oauthService.buildAuthorizationUrl("google", googleState));
  assert.equal(googleUrl.origin, "https://accounts.google.com");
  assert.equal(googleUrl.pathname, "/o/oauth2/v2/auth");
  assert.equal(googleUrl.searchParams.get("client_id"), "google-client");
  assert.equal(
    googleUrl.searchParams.get("redirect_uri"),
    "https://api.example.com/api/auth/oauth/google/callback"
  );
  assert.equal(googleUrl.searchParams.get("scope"), "openid email profile");
  assert.equal(googleUrl.searchParams.get("state"), googleState);

  const facebookState = oauthService.createOAuthState({
    provider: "facebook",
    intent: "login"
  });
  const facebookUrl = new URL(oauthService.buildAuthorizationUrl("facebook", facebookState));
  assert.equal(facebookUrl.origin, "https://www.facebook.com");
  assert.equal(facebookUrl.pathname, "/dialog/oauth");
  assert.equal(facebookUrl.searchParams.get("client_id"), "facebook-app");
  assert.equal(
    facebookUrl.searchParams.get("redirect_uri"),
    "https://api.example.com/api/auth/oauth/facebook/callback"
  );
  assert.equal(facebookUrl.searchParams.get("response_type"), "code");
  assert.equal(facebookUrl.searchParams.get("state"), facebookState);
});

test("oauth code exchange preserves the callback URI used by mobile authorization", async () => {
  const oauthService = requireWithMocks("../src/services/oauthService.js", {
    "../config/env": {
      googleClientId: "google-client",
      googleClientSecret: "google-secret",
      facebookAppId: "facebook-app",
      facebookAppSecret: "facebook-secret",
      serverUrl: "https://api.example.com",
      appBaseUrl: "https://app.example.com",
      oauthCallbackPath: "/oauth/callback",
      oauthStateTtlMinutes: 10,
      jwtSecret: "test-secret"
    }
  });
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url) === "https://oauth2.googleapis.com/token") {
      return { ok: true, text: async () => JSON.stringify({ access_token: "google-access" }) };
    }
    if (String(url) === "https://openidconnect.googleapis.com/v1/userinfo") {
      return { ok: true, text: async () => JSON.stringify({ sub: "google-user", email: "google@example.com", email_verified: true }) };
    }
    if (String(url).startsWith("https://graph.facebook.com/oauth/access_token")) {
      return { ok: true, text: async () => JSON.stringify({ access_token: "facebook-access" }) };
    }
    if (String(url).startsWith("https://graph.facebook.com/me")) {
      return { ok: true, text: async () => JSON.stringify({ id: "facebook-user", email: "facebook@example.com", name: "Facebook User" }) };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    await oauthService.exchangeCodeForProfile({
      provider: "google",
      code: "google-code",
      redirectUri: "https://api.example.com/api/v1/mobile/auth/oauth/google/callback"
    });
    await oauthService.exchangeCodeForProfile({
      provider: "facebook",
      code: "facebook-code",
      redirectUri: "https://api.example.com/api/v1/mobile/auth/oauth/facebook/callback"
    });
  } finally {
    global.fetch = originalFetch;
  }

  const googleBody = new URLSearchParams(requests[0].options.body);
  assert.equal(googleBody.get("redirect_uri"), "https://api.example.com/api/v1/mobile/auth/oauth/google/callback");
  const facebookUrl = new URL(requests[2].url);
  assert.equal(facebookUrl.searchParams.get("redirect_uri"), "https://api.example.com/api/v1/mobile/auth/oauth/facebook/callback");
});

test("oauth service rejects unsupported or expired OAuth state", () => {
  const oauthService = requireWithMocks("../src/services/oauthService.js", {
    "../config/env": {
      googleClientId: "google-client",
      googleClientSecret: "google-secret",
      facebookAppId: "facebook-app",
      facebookAppSecret: "facebook-secret",
      serverUrl: "https://api.example.com",
      appBaseUrl: "https://app.example.com",
      oauthCallbackPath: "/oauth/callback",
      oauthStateTtlMinutes: 10,
      jwtSecret: "test-secret"
    }
  });

  assert.throws(() => oauthService.buildAuthorizationUrl("github", "state"), {
    message: "Unsupported OAuth provider."
  });

  assert.throws(() => oauthService.readOAuthState(""), {
    message: "Missing OAuth state."
  });

  assert.throws(() => oauthService.readOAuthState("not-a-valid-jwt"), {
    message: "OAuth session expired. Please try again."
  });
});

test("oauth service verifies Apple identity and exchanges the authorization code", async () => {
  const signingKey = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const applePrivateKey = signingKey.privateKey.export({ type: "pkcs8", format: "pem" });
  const rsaKey = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const keyId = "apple-key";
  const nonce = "nonce-value";
  const identityToken = jwt.sign(
    {
      iss: "https://appleid.apple.com",
      aud: "com.getprio.getprioMobile",
      sub: "apple-user-1",
      nonce,
      email: "relay@privaterelay.appleid.com",
      email_verified: "true"
    },
    rsaKey.privateKey,
    { algorithm: "RS256", keyid: keyId }
  );
  const oauthService = requireWithMocks("../src/services/oauthService.js", {
    "../config/env": {
      googleClientId: "",
      googleClientSecret: "",
      facebookAppId: "",
      facebookAppSecret: "",
      appleClientId: "com.getprio.getprioMobile",
      appleTeamId: "apple-team",
      appleKeyId: keyId,
      applePrivateKey: `"${applePrivateKey.replace(/\n/g, "\\n")}"`,
      serverUrl: "https://api.example.com",
      appBaseUrl: "https://app.example.com",
      oauthCallbackPath: "/oauth/callback",
      oauthStateTtlMinutes: 10,
      jwtSecret: "test-secret"
    }
  });
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (url === "https://appleid.apple.com/auth/keys") {
      return { ok: true, text: async () => JSON.stringify({ keys: [{ ...rsaKey.publicKey.export({ format: "jwk" }), kid: keyId, alg: "RS256", use: "sig" }] }) };
    }
    assert.equal(url, "https://appleid.apple.com/auth/token");
    return { ok: true, text: async () => JSON.stringify({ id_token: identityToken }) };
  };
  try {
    const profile = await oauthService.exchangeAppleCredential({
      identityToken,
      authorizationCode: "authorization-code",
      nonce,
      givenName: "Apple",
      familyName: "Customer"
    });
    assert.deepEqual(profile, {
      provider: "apple",
      providerUserId: "apple-user-1",
      email: "relay@privaterelay.appleid.com",
      emailVerified: true,
      name: "Apple Customer"
    });
  } finally {
    global.fetch = originalFetch;
  }
});
