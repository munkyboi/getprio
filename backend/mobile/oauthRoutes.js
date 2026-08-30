const crypto = require("node:crypto");
const express = require("express");
const {
  buildAuthorizationUrl,
  createOAuthState,
  ensureSupportedProvider,
  exchangeCodeForProfile,
  getProviderLabel,
  readOAuthState
} = require("../src/services/oauthService");
const authService = require("../src/services/authService");
const sessionService = require("../src/services/sessionService");
const securityEventService = require("../src/services/securityEventService");
const tenantRepository = require("../src/repositories/tenants");
const userRepository = require("../src/repositories/users");
const env = require("../src/config/env");
const asyncHandler = require("../src/middleware/asyncHandler");
const codeRepository = require("./oauthCodeRepository");

const router = express.Router();
const MOBILE_OAUTH_CALLBACK = "/api/mobile/auth/oauth";
const MOBILE_REDIRECT_URI = process.env.MOBILE_OAUTH_REDIRECT_URI || "getprio://oauth/callback";

function requiredQuery(value, label) {
  const text = String(value || "").trim();
  if (!text || text.length > 256) {
    const error = new Error(`${label} is required.`);
    error.statusCode = 400;
    throw error;
  }
  return text;
}

function validCodeChallenge(value) {
  return /^[A-Za-z0-9_-]{43,128}$/.test(String(value || ""));
}

function redirectToMobile(res, params) {
  const uri = new URL(MOBILE_REDIRECT_URI);
  for (const [key, value] of Object.entries(params)) {
    if (value) uri.searchParams.set(key, String(value));
  }
  res.redirect(uri.toString());
}

function buildOauthAccount(profile) {
  return {
    provider: profile.provider,
    providerUserId: profile.providerUserId,
    email: authService.normalizeEmail(profile.email) || undefined,
    emailVerified: Boolean(profile.emailVerified),
    linkedAt: new Date()
  };
}

function buildFallbackName(provider, email) {
  return email ? String(email).split("@")[0] || `${getProviderLabel(provider)} User` : `${getProviderLabel(provider)} User`;
}

async function buildAvailableUsername(name) {
  const base = String(name || "user")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30) || "user";
  const candidateBase = base.length >= 3 ? base : "user";
  if (!await userRepository.findUserByUsername(candidateBase)) return candidateBase;
  for (let suffix = 2; suffix < 10000; suffix += 1) {
    const suffixText = `_${suffix}`;
    const candidate = `${candidateBase.slice(0, 30 - suffixText.length)}${suffixText}`;
    if (!await userRepository.findUserByUsername(candidate)) return candidate;
  }
  const error = new Error("Could not generate an available username.");
  error.statusCode = 409;
  throw error;
}

async function findOrCreateUser(profile) {
  const email = authService.normalizeEmail(profile.email);
  let user = await userRepository.findUserByOauthAccount(profile.provider, profile.providerUserId);
  if (!user && email) user = await userRepository.findUserByEmail(email);
  if (!user) {
    const name = profile.name || buildFallbackName(profile.provider, email);
    return userRepository.createUser({
      name,
      username: await buildAvailableUsername(name),
      email: email || undefined,
      emailVerified: Boolean(profile.emailVerified),
      lastLoginProvider: profile.provider,
      oauthAccounts: [buildOauthAccount(profile)],
      roles: ["customer"]
    });
  }

  const conflicting = (user.oauthAccounts || []).find(
    (account) => account.provider === profile.provider && account.providerUserId !== profile.providerUserId
  );
  if (conflicting) {
    const error = new Error(`That email is already linked to another ${getProviderLabel(profile.provider)} account.`);
    error.statusCode = 409;
    throw error;
  }
  if (!(user.oauthAccounts || []).some((account) => account.provider === profile.provider && account.providerUserId === profile.providerUserId)) {
    user = await userRepository.addOauthAccount(user._id, buildOauthAccount(profile));
  }
  return userRepository.updateUser(user._id, {
    name: user.name || profile.name || buildFallbackName(profile.provider, email || user.email),
    email: user.email || email || null,
    emailVerified: user.emailVerified || Boolean(profile.emailVerified),
    lastLoginProvider: profile.provider,
    roles: [...new Set([...(user.roles || []), "customer"])]
  });
}

async function buildUserPayload(user) {
  const memberships = user.tenantMemberships || [];
  const tenants = await tenantRepository.findTenantsByIds(memberships.map((membership) => membership.tenantId));
  const tenantsById = new Map(tenants.map((tenant) => [String(tenant._id), tenant]));
  return {
    id: String(user._id),
    name: user.name,
    displayName: user.displayName || "",
    avatarUrl: user.avatarUrl || "",
    username: user.username,
    email: user.email,
    phone: user.phone,
    roles: user.roles,
    emailVerified: Boolean(user.emailVerified),
    hasPassword: Boolean(user.passwordHash),
    mfaEnabled: Boolean(user.mfaEnabled),
    mfaRequired: Boolean(user.mfaRequired),
    oauthProviders: [...new Set((user.oauthAccounts || []).map((account) => account.provider))],
    tenants: memberships.map((membership) => {
      const tenant = tenantsById.get(String(membership.tenantId));
      return tenant ? { id: String(tenant._id), name: tenant.name, slug: tenant.slug, role: membership.role, isActive: membership.isActive !== false } : null;
    }).filter(Boolean)
  };
}

router.get(
  "/oauth/:provider/start",
  asyncHandler(async (req, res) => {
    const provider = String(req.params.provider || "").toLowerCase();
    ensureSupportedProvider(provider);
    const state = requiredQuery(req.query.state, "state");
    const codeChallenge = requiredQuery(req.query.code_challenge, "code_challenge");
    if (!validCodeChallenge(codeChallenge)) {
      const error = new Error("A valid PKCE code challenge is required.");
      error.statusCode = 400;
      throw error;
    }
    const signedState = createOAuthState({
      provider,
      intent: "login",
      mobile: true,
      mobileState: state,
      codeChallenge
    });
    res.redirect(buildAuthorizationUrl(provider, signedState, {
      redirectUri: `${String(env.serverUrl).replace(/\/$/, "")}${MOBILE_OAUTH_CALLBACK}/${provider}/callback`
    }));
  })
);

router.all(
  "/oauth/:provider/callback",
  asyncHandler(async (req, res) => {
    const provider = String(req.params.provider || "").toLowerCase();
    const stateValue = req.method === "POST" ? req.body?.state : req.query.state;
    const providerError = req.method === "POST" ? req.body?.error : req.query.error;
    const providerErrorReason = req.method === "POST" ? req.body?.error_description : req.query.error_description;
    try {
      ensureSupportedProvider(provider);
      const oauthState = readOAuthState(stateValue);
      if (!oauthState.mobile || oauthState.provider !== provider) throw new Error("OAuth session is not valid for this mobile app.");
      if (providerError) throw new Error(providerErrorReason || `${getProviderLabel(provider)} sign-in was cancelled.`);
      const code = req.method === "POST" ? req.body?.code : req.query.code;
      const profile = await exchangeCodeForProfile({ provider, code, requestBody: req.body });
      const user = await findOrCreateUser(profile);
      const sessionResult = await sessionService.createAuthSession({
        user,
        authMethod: provider,
        ipAddress: authService.getRequestIp(req),
        userAgent: authService.getUserAgent(req)
      });
      await authService.recordLoginAttempt({
        email: user.email || profile.email || "",
        success: true,
        user,
        sessionId: sessionResult.session._id,
        req
      });
      const oneTimeCode = crypto.randomBytes(32).toString("base64url");
      await codeRepository.deleteExpired();
      await codeRepository.create({
        codeHash: crypto.createHash("sha256").update(oneTimeCode).digest("hex"),
        state: oauthState.mobileState,
        codeChallenge: oauthState.codeChallenge,
        responseBody: {
          token: sessionResult.accessToken,
          refreshToken: sessionResult.refreshToken,
          sessionExpiresAt: sessionResult.session.inactivityExpiresAt || sessionResult.session.expiresAt,
          user: await buildUserPayload(user)
        },
        expiresAt: new Date(Date.now() + 2 * 60 * 1000)
      });
      redirectToMobile(res, { code: oneTimeCode, state: oauthState.mobileState });
    } catch (error) {
      const state = (() => {
        try { return readOAuthState(stateValue).mobileState; } catch { return ""; }
      })();
      redirectToMobile(res, { state, error: error.message || "Social sign-in failed." });
    }
  })
);

router.post(
  "/oauth/exchange",
  asyncHandler(async (req, res) => {
    const code = requiredQuery(req.body?.code, "code");
    const state = requiredQuery(req.body?.state, "state");
    const verifier = requiredQuery(req.body?.codeVerifier, "codeVerifier");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    const stored = await codeRepository.consume(crypto.createHash("sha256").update(code).digest("hex"));
    if (!stored || stored.state !== state || stored.code_challenge !== challenge) {
      const error = new Error("OAuth exchange code is invalid or expired.");
      error.statusCode = 400;
      error.code = "OAUTH_CODE_INVALID";
      throw error;
    }
    res.json(stored.response_body);
  })
);

module.exports = router;
