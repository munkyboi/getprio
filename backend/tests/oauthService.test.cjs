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
      jwtSecret: "test-secret"
    }
  });

  assert.deepEqual(oauthService.buildProviderAvailability(), {
    google: true,
    facebook: false
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
