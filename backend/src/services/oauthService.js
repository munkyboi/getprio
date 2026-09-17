const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const env = require("../config/env");

const OAUTH_PROVIDERS = {
  google: { id: "google", label: "Google" },
  facebook: { id: "facebook", label: "Facebook" },
  apple: { id: "apple", label: "Apple" }
};

const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys";
let appleKeysCache = { expiresAt: 0, keys: null };

function buildProviderAvailability() {
  return {
    google: Boolean(env.googleClientId && env.googleClientSecret),
    facebook: Boolean(env.facebookAppId && env.facebookAppSecret),
    apple: Boolean(env.appleClientId && env.appleTeamId && env.appleKeyId && env.applePrivateKey)
  };
}

function ensureSupportedProvider(provider) {
  if (!OAUTH_PROVIDERS[provider]) {
    const error = new Error("Unsupported OAuth provider.");
    error.statusCode = 404;
    throw error;
  }
}

function ensureConfiguredProvider(provider) {
  ensureSupportedProvider(provider);

  if (!buildProviderAvailability()[provider]) {
    const error = new Error(`${OAUTH_PROVIDERS[provider].label} sign-in is not configured yet.`);
    error.statusCode = 503;
    throw error;
  }
}

function getProviderLabel(provider) {
  return OAUTH_PROVIDERS[provider]?.label || "OAuth";
}

function getServerOrigin() {
  return String(env.serverUrl || "").replace(/\/$/, "");
}

function getAppOrigin() {
  return String(env.appBaseUrl || "").replace(/\/$/, "");
}

function buildServerCallbackUrl(provider, callbackPath = "/api/auth/oauth") {
  return `${getServerOrigin()}${callbackPath}/${provider}/callback`;
}

function buildClientCallbackUrl({ token, refreshToken, next, error }) {
  const hash = new URLSearchParams();

  if (token) {
    hash.set("token", token);
  }

  if (refreshToken) {
    hash.set("refreshToken", refreshToken);
  }

  if (next) {
    hash.set("next", next);
  }

  if (error) {
    hash.set("error", error);
  }

  return `${getAppOrigin()}${env.oauthCallbackPath}#${hash.toString()}`;
}

function createOAuthState(payload) {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: `${env.oauthStateTtlMinutes}m`
  });
}

function readOAuthState(value) {
  if (!value) {
    const error = new Error("Missing OAuth state.");
    error.statusCode = 400;
    throw error;
  }

  try {
    return jwt.verify(value, env.jwtSecret);
  } catch {
    const error = new Error("OAuth session expired. Please try again.");
    error.statusCode = 400;
    throw error;
  }
}

function buildAuthorizationUrl(provider, state, options = {}) {
  ensureConfiguredProvider(provider);
  const redirectUri = options.redirectUri || buildServerCallbackUrl(provider);

  switch (provider) {
    case "google": {
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.search = new URLSearchParams({
        client_id: env.googleClientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid email profile",
        prompt: "select_account",
        include_granted_scopes: "true",
        state
      }).toString();
      return url.toString();
    }
    case "facebook": {
      const url = new URL("https://www.facebook.com/dialog/oauth");
      url.search = new URLSearchParams({
        client_id: env.facebookAppId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "email,public_profile",
        state
      }).toString();
      return url.toString();
    }
    default:
      ensureSupportedProvider(provider);
      return "";
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();

  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    const error = new Error(data.error_description || data.error?.message || data.message || "OAuth request failed.");
    error.statusCode = response.status;
    throw error;
  }

  return data;
}

function buildFallbackName(provider, email) {
  if (email) {
    const [localPart] = String(email).split("@");
    return localPart || `${getProviderLabel(provider)} User`;
  }

  return `${getProviderLabel(provider)} User`;
}

async function exchangeGoogleCode(code) {
  const tokenData = await fetchJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: buildServerCallbackUrl("google")
    })
  });

  const userInfo = await fetchJson("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`
    }
  });

  return {
    provider: "google",
    providerUserId: String(userInfo.sub),
    email: userInfo.email || "",
    emailVerified: Boolean(userInfo.email_verified),
    name: userInfo.name || buildFallbackName("google", userInfo.email)
  };
}

async function exchangeFacebookCode(code) {
  const tokenUrl = new URL("https://graph.facebook.com/oauth/access_token");
  tokenUrl.search = new URLSearchParams({
    client_id: env.facebookAppId,
    client_secret: env.facebookAppSecret,
    redirect_uri: buildServerCallbackUrl("facebook"),
    code
  }).toString();

  const tokenData = await fetchJson(tokenUrl.toString());

  const profileUrl = new URL("https://graph.facebook.com/me");
  profileUrl.search = new URLSearchParams({
    fields: "id,name,email",
    access_token: tokenData.access_token
  }).toString();

  const userInfo = await fetchJson(profileUrl.toString());

  return {
    provider: "facebook",
    providerUserId: String(userInfo.id),
    email: userInfo.email || "",
    emailVerified: Boolean(userInfo.email),
    name: userInfo.name || buildFallbackName("facebook", userInfo.email)
  };
}

function buildAppleClientSecret() {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: env.appleTeamId,
      iat: now,
      exp: now + 60 * 60 * 24 * 180,
      aud: "https://appleid.apple.com",
      sub: env.appleClientId
    },
    env.applePrivateKey,
    { algorithm: "ES256", keyid: env.appleKeyId }
  );
}

async function getAppleKeys() {
  if (appleKeysCache.keys && appleKeysCache.expiresAt > Date.now()) {
    return appleKeysCache.keys;
  }
  const response = await fetchJson(APPLE_KEYS_URL);
  const keys = Array.isArray(response.keys) ? response.keys : [];
  appleKeysCache = { keys, expiresAt: Date.now() + 60 * 60 * 1000 };
  return keys;
}

async function verifyAppleIdentityToken(identityToken, nonce) {
  const decoded = jwt.decode(identityToken, { complete: true });
  const keyId = decoded?.header?.kid;
  if (!keyId || decoded?.header?.alg !== "RS256") {
    throw Object.assign(new Error("Apple identity token is invalid."), { statusCode: 401 });
  }
  const jwk = (await getAppleKeys()).find((key) => key.kid === keyId);
  if (!jwk) {
    appleKeysCache = { expiresAt: 0, keys: null };
    const refreshedJwk = (await getAppleKeys()).find((key) => key.kid === keyId);
    if (!refreshedJwk) {
      throw Object.assign(new Error("Apple identity token key is unavailable."), { statusCode: 401 });
    }
    return verifyAppleIdentityTokenWithKey(identityToken, nonce, refreshedJwk);
  }
  return verifyAppleIdentityTokenWithKey(identityToken, nonce, jwk);
}

function verifyAppleIdentityTokenWithKey(identityToken, nonce, jwk) {
  let payload;
  try {
    payload = jwt.verify(
      identityToken,
      crypto.createPublicKey({ key: jwk, format: "jwk" }),
      {
        algorithms: ["RS256"],
        issuer: "https://appleid.apple.com",
        audience: env.appleClientId
      }
    );
  } catch {
    throw Object.assign(new Error("Apple identity token could not be verified."), { statusCode: 401 });
  }
  if (nonce && payload.nonce !== nonce) {
    throw Object.assign(new Error("Apple identity token nonce did not match."), { statusCode: 401 });
  }
  if (!payload.sub) {
    throw Object.assign(new Error("Apple identity token has no user identifier."), { statusCode: 401 });
  }
  return payload;
}

async function exchangeAppleAuthorizationCode(authorizationCode) {
  return fetchJson("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.appleClientId,
      client_secret: buildAppleClientSecret(),
      code: authorizationCode,
      grant_type: "authorization_code"
    })
  });
}

async function exchangeAppleCredential({ identityToken, authorizationCode, nonce, givenName, familyName }) {
  ensureConfiguredProvider("apple");
  if (!identityToken || !authorizationCode || !nonce) {
    const error = new Error("Apple sign-in returned incomplete credentials.");
    error.statusCode = 400;
    throw error;
  }
  const identity = await verifyAppleIdentityToken(identityToken, nonce);
  const exchanged = await exchangeAppleAuthorizationCode(authorizationCode);
  if (exchanged.id_token) {
    const exchangedIdentity = await verifyAppleIdentityToken(exchanged.id_token, nonce);
    if (exchangedIdentity.sub !== identity.sub) {
      throw Object.assign(new Error("Apple credentials belong to different users."), { statusCode: 401 });
    }
  }
  const emailVerified = identity.email_verified === true || identity.email_verified === "true";
  return {
    provider: "apple",
    providerUserId: String(identity.sub),
    email: identity.email || "",
    emailVerified,
    name: [givenName, familyName].filter(Boolean).join(" ")
  };
}

async function exchangeCodeForProfile({ provider, code }) {
  ensureConfiguredProvider(provider);

  if (!code) {
    const error = new Error(`${getProviderLabel(provider)} did not return an authorization code.`);
    error.statusCode = 400;
    throw error;
  }

  switch (provider) {
    case "google":
      return exchangeGoogleCode(code);
    case "facebook":
      return exchangeFacebookCode(code);
    case "apple":
      throw new Error("Apple sign-in uses the native credential exchange.");
    default:
      ensureSupportedProvider(provider);
      return null;
  }
}

module.exports = {
  OAUTH_PROVIDERS,
  buildAuthorizationUrl,
  buildClientCallbackUrl,
  buildProviderAvailability,
  createOAuthState,
  exchangeCodeForProfile,
  exchangeAppleCredential,
  ensureConfiguredProvider,
  ensureSupportedProvider,
  getProviderLabel,
  readOAuthState
};
