const businessCategories = require("../repositories/businessCategories");
const express = require("express");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");
const db = require("../config/db");
const tenantRepository = require("../repositories/tenants");
const authSessionRepository = require("../repositories/authSessions");
const userRepository = require("../repositories/users");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate, maybeAuthenticate } = require("../middleware/auth");
const { moderatePublicText } = require("../middleware/moderatePublicText");
const authService = require("../services/authService");
const {
  buildAuthorizationUrl,
  buildClientCallbackUrl,
  buildProviderAvailability,
  createOAuthState,
  exchangeCodeForProfile,
  ensureSupportedProvider,
  getProviderLabel,
  readOAuthState
} = require("../services/oauthService");
const notificationService = require("../services/notificationService");
const passwordResetService = require("../services/passwordResetService");
const securityEventService = require("../services/securityEventService");
const sessionService = require("../services/sessionService");
const subscriptionLifecycleService = require("../services/subscriptionLifecycleService");
const mfaFlowService = require("../services/mfaFlowService");
const customerRegistrationOtpService = require("../services/customerRegistrationOtpService");
const securityRateLimitService = require("../services/securityRateLimitService");
const { userRequiresPrivilegedMfa } = require("../services/mfaService");
const { assertPublicTextFieldsAllowed } = require("../services/contentModeration");
const { normalizePhilippineMobileNumber } = require("../utils/phone");
const env = require("../config/env");
const {
  clearBrowserSession,
  getRefreshCookie,
  issueBrowserSession,
  parseCookies
} = require("../services/browserSessionService");

const router = express.Router();
const authHttpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip || req.socket?.remoteAddress || "unknown"),
  message: { message: "Too many authentication requests. Please try again later." }
});
router.use(authHttpLimiter);
router.use(moderatePublicText);
const OAUTH_INTENTS = new Set(["login", "register_customer", "register_vendor"]);
const normalizeEmail = authService.normalizeEmail;
const authAttemptLimiter = asyncHandler(async (req, _res, next) => {
  const key = crypto.createHash("sha256").update(String(req.ip || req.socket?.remoteAddress || "unknown")).digest("hex");
  await securityRateLimitService.consume({ bucketKey: `auth-attempt:${key}`, limit: 100, windowSeconds: 15 * 60, blockedMessage: "Too many authentication attempts. Please try again later." });
  next();
});
const customerRegistrationOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip || req.socket?.remoteAddress || "unknown"),
  message: { message: "Too many registration verification requests. Please try again later." }
});

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function validateTenantSlug(value) {
  const tenantSlug = normalizeSlug(value);
  if (!tenantSlug || !/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(tenantSlug)) {
    return {
      tenantSlug,
      valid: false,
      message: "Tenant slug must be 1-48 characters using lowercase letters, numbers, or hyphens."
    };
  }

  return {
    tenantSlug,
    valid: true,
    message: ""
  };
}

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function buildUsernameFromName(name, fallback = "user") {
  const base = String(name || fallback || "user")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (base.length >= 3) {
    return base.slice(0, 30);
  }

  return "user";
}

function validateUsername(value) {
  const username = normalizeUsername(value);
  if (!username || !/^[a-z0-9_]{3,30}$/.test(username)) {
    return {
      username,
      valid: false,
      message: "Username must be 3-30 characters using lowercase letters, numbers, or underscores."
    };
  }

  return {
    username,
    valid: true,
    message: ""
  };
}

function validateCustomerEmail(value) {
  const email = normalizeEmail(value);
  const atIndex = email.indexOf("@");
  const lastAtIndex = email.lastIndexOf("@");
  const dotIndex = email.lastIndexOf(".");
  if (
    !email ||
    email.length > 254 ||
    atIndex <= 0 ||
    atIndex !== lastAtIndex ||
    dotIndex <= atIndex + 1 ||
    dotIndex >= email.length - 1 ||
    /\s/.test(email)
  ) {
    const error = new Error("Enter a valid email address.");
    error.statusCode = 400;
    throw error;
  }
  return email;
}

async function assertUsernameAvailable(username, options = {}) {
  const validation = validateUsername(username);
  if (!validation.valid) {
    const error = new Error(validation.message);
    error.statusCode = 400;
    throw error;
  }
  assertPublicTextFieldsAllowed({ Username: validation.username });

  const existingUser = await userRepository.findUserByUsername(validation.username, options);
  if (existingUser) {
    const error = new Error("That username is already taken.");
    error.statusCode = 409;
    throw error;
  }

  return validation.username;
}

async function buildAvailableUsername(name, options = {}) {
  const base = buildUsernameFromName(name);
  const queryOptions = options.client ? { client: options.client } : {};
  const excludeId = options.excludeId ? { excludeId: options.excludeId } : {};
  const baseCandidate = base.slice(0, 30);
  const existingBase = await userRepository.findUserByUsername(baseCandidate, {
    ...queryOptions,
    ...excludeId
  });

  if (!existingBase) {
    return baseCandidate;
  }

  for (let suffix = 2; suffix < 10000; suffix += 1) {
    const suffixText = `_${suffix}`;
    const candidate = `${base.slice(0, 30 - suffixText.length)}${suffixText}`;
    const existingUser = await userRepository.findUserByUsername(candidate, {
      ...queryOptions,
      ...excludeId
    });

    if (!existingUser) {
      return candidate;
    }
  }

  const error = new Error("Could not generate an available username.");
  error.statusCode = 409;
  throw error;
}

function buildAuthResponse(req, res, user, sessionResult) {
  const { csrfToken } = issueBrowserSession(res, sessionResult, {
    secure: env.authCookieSecure,
    csrfSecret: env.csrfSecret,
    accessMaxAgeSeconds: env.accessTokenTtlMinutes * 60
  });
  const compatibilityRequested =
    env.authBearerCompatibilityEnabled &&
    String(req.headers["x-auth-compatibility"] || "").toLowerCase() === "bearer-v1";

  return {
    user,
    csrfToken,
    sessionExpiresAt: sessionResult.session.inactivityExpiresAt || sessionResult.session.expiresAt,
    ...(compatibilityRequested
      ? { token: sessionResult.accessToken, refreshToken: sessionResult.refreshToken }
      : {})
  };
}

function ensureValidIntent(intent) {
  if (!OAUTH_INTENTS.has(intent)) {
    const error = new Error("Unsupported authentication intent.");
    error.statusCode = 400;
    throw error;
  }
}

function formatList(items) {
  if (!items.length) {
    return "";
  }

  if (items.length === 1) {
    return items[0];
  }

  if (items.length === 2) {
    return `${items[0]} or ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, or ${items[items.length - 1]}`;
}

function getOauthProviderLabels(user) {
  return [...new Set((user.oauthAccounts || []).map((account) => getProviderLabel(account.provider)))];
}

function buildExistingAccountMessage(user) {
  const providerLabels = getOauthProviderLabels(user);

  if (providerLabels.length && user.passwordHash) {
    return `That email is already registered. Sign in with your password or continue with ${formatList(providerLabels)}.`;
  }

  if (providerLabels.length) {
    return `That email is already registered. Continue with ${formatList(providerLabels)}.`;
  }

  return "That email is already registered.";
}

function buildFallbackName(provider, email) {
  if (email) {
    return email.split("@")[0] || `${getProviderLabel(provider)} User`;
  }

  return `${getProviderLabel(provider)} User`;
}

function buildOauthAccount(profile) {
  return {
    provider: profile.provider,
    providerUserId: profile.providerUserId,
    email: normalizeEmail(profile.email) || undefined,
    emailVerified: Boolean(profile.emailVerified),
    linkedAt: new Date()
  };
}

async function buildUserPayload(user) {
  const memberships = user.tenantMemberships || [];
  const tenants = await tenantRepository.findTenantsByIds(
    memberships.map((membership) => membership.tenantId)
  );
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
    mfaRequired: Boolean(user.mfaRequired || userRequiresPrivilegedMfa(user)),
    oauthProviders: [...new Set((user.oauthAccounts || []).map((account) => account.provider))],
    lastLoginProvider: user.lastLoginProvider,
    tenants: memberships
      .map((membership) => {
        const tenant = tenantsById.get(String(membership.tenantId));
        if (!tenant) {
          return null;
        }

        return {
          id: String(tenant._id),
          name: tenant.name,
          slug: tenant.slug,
          role: membership.role,
          isActive: membership.isActive !== false
        };
      })
      .filter(Boolean)
  };
}

async function findOrCreateOauthUser(profile) {
  const normalizedEmail = normalizeEmail(profile.email);
  let user = await userRepository.findUserByOauthAccount(profile.provider, profile.providerUserId);

  if (!user && normalizedEmail) {
    user = await userRepository.findUserByEmail(normalizedEmail);
  }

  if (!user) {
    return userRepository.createUser({
      name: profile.name || buildFallbackName(profile.provider, normalizedEmail),
      username: await buildAvailableUsername(profile.name || buildFallbackName(profile.provider, normalizedEmail)),
      email: normalizedEmail || undefined,
      emailVerified: Boolean(profile.emailVerified),
      lastLoginProvider: profile.provider,
      oauthAccounts: [buildOauthAccount(profile)],
      roles: ["customer"]
    });
  }

  const conflictingProviderAccount = (user.oauthAccounts || []).find(
    (account) =>
      account.provider === profile.provider && account.providerUserId !== profile.providerUserId
  );

  if (conflictingProviderAccount) {
    const error = new Error(
      `That email is already linked to another ${getProviderLabel(profile.provider)} account.`
    );
    error.statusCode = 409;
    throw error;
  }

  if (!(user.oauthAccounts || []).some(
    (account) =>
      account.provider === profile.provider && account.providerUserId === profile.providerUserId
  )) {
    user = await userRepository.addOauthAccount(user._id, buildOauthAccount(profile));
  }

  user = await userRepository.updateUser(user._id, {
    name: user.name || profile.name || buildFallbackName(profile.provider, normalizedEmail || user.email),
    username: user.username || (await buildAvailableUsername(
      profile.name || user.name || buildFallbackName(profile.provider, normalizedEmail || user.email),
      { excludeId: user._id }
    )),
    email: user.email || normalizedEmail || null,
    emailVerified: user.emailVerified || Boolean(profile.emailVerified),
    lastLoginProvider: profile.provider,
    roles: [...new Set([...(user.roles || []), "customer"])]
  });

  return user;
}

function getPostOauthPath(intent, provider, user) {
  const hasTenantMemberships = Boolean(user.tenantMemberships?.length);

  if (intent === "register_vendor" && !hasTenantMemberships) {
    return `/register/vendor?oauth=${provider}`;
  }

  if (hasTenantMemberships) {
    return "/dashboard";
  }

  return "/";
}

function redirectOauthError(res, message) {
  const callbackUrl = buildClientCallbackUrl({ error: message });
  if (!callbackUrl) {
    const error = new Error("Unable to build OAuth callback URL.");
    error.statusCode = 500;
    throw error;
  }

  res.redirect(callbackUrl);
}

function getAuthMethodForProvider(provider) {
  return provider === "google" || provider === "facebook" ? provider : "password";
}

router.get("/oauth/providers", (req, res) => {
  res.json({
    providers: buildProviderAvailability()
  });
});

router.get(
  "/username-availability",
  maybeAuthenticate,
  asyncHandler(async (req, res) => {
    const validation = validateUsername(req.query.username);

    if (!validation.valid) {
      res.json({
        username: validation.username,
        available: false,
        valid: false,
        message: validation.message
      });
      return;
    }

    const existingUser = await userRepository.findUserByUsername(validation.username, {
      excludeId: req.user?._id
    });

    res.json({
      username: validation.username,
      available: !existingUser,
      valid: true,
      message: existingUser ? "That username is already taken." : "Username is available."
    });
  })
);

router.get(
  "/tenant-slug-availability",
  asyncHandler(async (req, res) => {
    const validation = validateTenantSlug(req.query.tenantSlug);

    if (!validation.valid) {
      res.json({
        tenantSlug: validation.tenantSlug,
        available: false,
        valid: false,
        message: validation.message
      });
      return;
    }

    const existingTenant = await tenantRepository.findTenantBySlug(validation.tenantSlug);

    res.json({
      tenantSlug: validation.tenantSlug,
      available: !existingTenant,
      valid: true,
      message: existingTenant ? "That tenant slug is already taken." : "Tenant slug is available."
    });
  })
);

router.post(
  "/register/customer/otp",
  customerRegistrationOtpLimiter,
  asyncHandler(async (req, res) => {
    const { name, username, email, password } = req.body || {};
    if (!name || !username || !email || !password) {
      const error = new Error("name, username, email, and password are required.");
      error.statusCode = 400;
      throw error;
    }

    const normalizedName = String(name).trim();
    if (normalizedName.length < 2) {
      const error = new Error("Enter your full name.");
      error.statusCode = 400;
      throw error;
    }
    const normalizedEmail = validateCustomerEmail(email);
    const normalizedUsername = await assertUsernameAvailable(username);
    assertPublicTextFieldsAllowed({ "Account name": name, Username: normalizedUsername });
    customerRegistrationOtpService.assertValidPassword(password);
    const existingUser = await userRepository.findUserByEmail(normalizedEmail);
    if (existingUser) {
      const error = new Error(buildExistingAccountMessage(existingUser));
      error.statusCode = 409;
      throw error;
    }

    const challenge = await customerRegistrationOtpService.start({
      name: normalizedName,
      username: normalizedUsername,
      email: normalizedEmail,
      passwordHash: await bcrypt.hash(password, 10)
    });
    res.status(201).json(challenge);
  })
);

router.post(
  "/register/customer/otp/verify",
  customerRegistrationOtpLimiter,
  asyncHandler(async (req, res) => {
    const result = await customerRegistrationOtpService.verify({
      challengeId: req.body?.challengeId,
      code: req.body?.code,
      ipAddress: authService.getRequestIp(req),
      userAgent: authService.getUserAgent(req)
    });
    await authService.recordLoginAttempt({
      email: result.user.email,
      success: true,
      user: result.user,
      sessionId: result.sessionResult.session._id,
      req
    });
    res.json(buildAuthResponse(
      req,
      res,
      await buildUserPayload(result.user),
      result.sessionResult
    ));
  })
);

router.post(
  "/register/customer/otp/resend",
  customerRegistrationOtpLimiter,
  asyncHandler(async (req, res) => {
    res.json(await customerRegistrationOtpService.resend({
      challengeId: req.body?.challengeId
    }));
  })
);

router.get("/oauth/:provider/start", (req, res) => {
  const provider = String(req.params.provider || "").toLowerCase();
  const intent = String(req.query.intent || "login");

  try {
    ensureSupportedProvider(provider);
    ensureValidIntent(intent);

    const state = createOAuthState({ provider, intent });
    res.redirect(buildAuthorizationUrl(provider, state));
  } catch (error) {
    redirectOauthError(res, error.message || "Unable to start social sign-in.");
  }
});

router.all("/oauth/:provider/callback", async (req, res) => {
  const provider = String(req.params.provider || "").toLowerCase();
  const providerError = req.method === "POST" ? req.body.error : req.query.error;
  const providerErrorReason = req.method === "POST" ? req.body.error_description : req.query.error_description;
  const stateValue = req.method === "POST" ? req.body.state : req.query.state;
  const code = req.method === "POST" ? req.body.code : req.query.code;

  try {
    ensureSupportedProvider(provider);

    if (providerError) {
      throw new Error(providerErrorReason || `${getProviderLabel(provider)} sign-in was cancelled.`);
    }

    const oauthState = readOAuthState(stateValue);
    ensureValidIntent(oauthState.intent);

    if (oauthState.provider !== provider) {
      throw new Error("OAuth provider mismatch. Please try again.");
    }

    const profile = await exchangeCodeForProfile({
      provider,
      code,
      requestBody: req.body
    });

    const user = await findOrCreateOauthUser(profile);
    const next = getPostOauthPath(oauthState.intent, provider, user);
    const sessionResult = await sessionService.createAuthSession({
      user,
      authMethod: getAuthMethodForProvider(provider),
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

    issueBrowserSession(res, sessionResult, {
      secure: env.authCookieSecure,
      csrfSecret: env.csrfSecret,
      accessMaxAgeSeconds: env.accessTokenTtlMinutes * 60
    });

    res.redirect(
      buildClientCallbackUrl({
        next
      })
    );
  } catch (error) {
    redirectOauthError(res, error.message || "Social sign-in failed.");
  }
});

router.post(
  "/register/vendor",
  asyncHandler(async (req, res) => {
    const { tenantName, tenantSlug, category, name, username, email, phone, password } = req.body;
    const normalizedPhone = normalizePhilippineMobileNumber(phone);
    const normalizedCategory = String(category || "").trim();

    if (!tenantName || !tenantSlug || (!normalizedCategory && !req.body.categoryId) || !name || !username || !email || !password) {
      const error = new Error("tenantName, tenantSlug, category, name, username, email, and password are required.");
      error.statusCode = 400;
      throw error;
    }

    const slugValidation = validateTenantSlug(tenantSlug);
    const normalizedSlug = slugValidation.tenantSlug;
    const normalizedEmail = normalizeEmail(email);
    const normalizedUsername = validateUsername(username);

    if (!slugValidation.valid) {
      const error = new Error(slugValidation.message);
      error.statusCode = 400;
      throw error;
    }

    if (!normalizedUsername.valid) {
      const error = new Error(normalizedUsername.message);
      error.statusCode = 400;
      throw error;
    }
    assertPublicTextFieldsAllowed({
      "Business name": tenantName,
      "Business slug": normalizedSlug,
      "Business category": normalizedCategory,
      "Account name": name,
      Username: normalizedUsername.username
    });

    const result = await db.withTransaction(async (client) => {
      const [existingTenant, existingUser, existingUsername] = await Promise.all([
        tenantRepository.findTenantBySlug(normalizedSlug, { client }),
        userRepository.findUserByEmail(normalizedEmail, { client }),
        userRepository.findUserByUsername(normalizedUsername.username, { client })
      ]);

      if (existingTenant) {
        const error = new Error("That tenant slug is already taken.");
        error.statusCode = 409;
        throw error;
      }

      if (existingUser) {
        const error = new Error(buildExistingAccountMessage(existingUser));
        error.statusCode = 409;
        throw error;
      }

      if (existingUsername) {
        const error = new Error("That username is already taken.");
        error.statusCode = 409;
        throw error;
      }

      const selectedCategory = await businessCategories.resolve({ id: req.body.categoryId, label: normalizedCategory }, client);
      if (!selectedCategory) { const error = new Error("Choose an active business category."); error.statusCode = 400; throw error; }
      const tenant = await tenantRepository.createTenant(
        {
          name: tenantName,
          slug: normalizedSlug,
          contactEmail: normalizedEmail,
          contactPhone: normalizedPhone,
          publicProfileCategory: selectedCategory.name,
          businessCategoryId: selectedCategory.id
        },
        { client }
      );
      await subscriptionLifecycleService.assignFreeToApprovedTenant(
        tenant._id,
        { reason: "Automatic Free assignment after vendor registration" },
        { client }
      );

      const user = await userRepository.createUser(
        {
          name,
          username: normalizedUsername.username,
          email: normalizedEmail,
          phone: normalizedPhone,
          passwordHash: await bcrypt.hash(password, 10),
          passwordHashAlgorithm: "bcrypt",
          emailVerified: false,
          lastLoginProvider: "password",
          roles: ["customer", "vendor"],
          tenantMemberships: [{ tenantId: tenant._id, role: "owner" }]
        },
        { client }
      );

      return { user };
    });

    const sessionResult = await sessionService.createAuthSession({
      user: result.user,
      authMethod: "password",
      ipAddress: authService.getRequestIp(req),
      userAgent: authService.getUserAgent(req)
    });

    await authService.recordLoginAttempt({
      email: normalizedEmail,
      success: true,
      user: result.user,
      sessionId: sessionResult.session._id,
      req
    });

    res.status(201).json({
      ...buildAuthResponse(req, res, await buildUserPayload(result.user), sessionResult)
    });
  })
);

router.post(
  "/register/vendor/complete",
  authenticate,
  asyncHandler(async (req, res) => {
    const { tenantName, tenantSlug, category, name, username, email, phone } = req.body;
    const normalizedPhone = normalizePhilippineMobileNumber(phone);
    const normalizedCategory = String(category || "").trim();

    if (!tenantName || !tenantSlug || (!normalizedCategory && !req.body.categoryId)) {
      const error = new Error("tenantName, tenantSlug, and category are required.");
      error.statusCode = 400;
      throw error;
    }

    const slugValidation = validateTenantSlug(tenantSlug);
    const normalizedSlug = slugValidation.tenantSlug;
    const normalizedEmail = normalizeEmail(email) || normalizeEmail(req.user.email);

    if (!slugValidation.valid) {
      const error = new Error(slugValidation.message);
      error.statusCode = 400;
      throw error;
    }

    if (!normalizedEmail) {
      const error = new Error("email is required to finish vendor setup.");
      error.statusCode = 400;
      throw error;
    }

    const resolvedName = String(name || req.user.name || "").trim();
    if (!resolvedName) {
      const error = new Error("name is required to finish vendor setup.");
      error.statusCode = 400;
      throw error;
    }

    const resolvedUsernameInput = username || req.user.username || "";
    const resolvedUsername = validateUsername(resolvedUsernameInput);
    if (!resolvedUsername.valid) {
      const error = new Error(resolvedUsername.message);
      error.statusCode = 400;
      throw error;
    }
    assertPublicTextFieldsAllowed({
      "Business name": tenantName,
      "Business slug": normalizedSlug,
      "Business category": normalizedCategory,
      "Account name": resolvedName,
      Username: resolvedUsername.username
    });

    const user = await db.withTransaction(async (client) => {
      const [existingTenant, conflictingUser, conflictingUsername] = await Promise.all([
        tenantRepository.findTenantBySlug(normalizedSlug, { client }),
        userRepository.findUserByEmail(normalizedEmail, {
          client,
          excludeId: req.user._id
        }),
        userRepository.findUserByUsername(resolvedUsername.username, {
          client,
          excludeId: req.user._id
        })
      ]);

      if (existingTenant) {
        const error = new Error("That tenant slug is already taken.");
        error.statusCode = 409;
        throw error;
      }

      if (conflictingUser) {
        const error = new Error("That email is already associated with another account.");
        error.statusCode = 409;
        throw error;
      }

      if (conflictingUsername) {
        const error = new Error("That username is already taken.");
        error.statusCode = 409;
        throw error;
      }

      const selectedCategory = await businessCategories.resolve({ id: req.body.categoryId, label: normalizedCategory }, client);
      if (!selectedCategory) { const error = new Error("Choose an active business category."); error.statusCode = 400; throw error; }
      const tenant = await tenantRepository.createTenant(
        {
          name: tenantName,
          slug: normalizedSlug,
          contactEmail: normalizedEmail,
          contactPhone: normalizedPhone || req.user.phone,
          publicProfileCategory: selectedCategory.name,
          businessCategoryId: selectedCategory.id
        },
        { client }
      );
      await subscriptionLifecycleService.assignFreeToApprovedTenant(
        tenant._id,
        { actorId: req.user._id, reason: "Automatic Free assignment after vendor registration" },
        { client }
      );

      await userRepository.addTenantMembership(req.user._id, tenant._id, "owner", { client });

      return userRepository.updateUser(
        req.user._id,
        {
          name: resolvedName,
          username: resolvedUsername.username,
          email: normalizedEmail,
          phone: normalizedPhone || req.user.phone,
          roles: [...new Set([...(req.user.roles || []), "customer", "vendor"])]
        },
        { client }
      );
    });

    const sessionResult = await sessionService.createAuthSession({
      user,
      authMethod: "password",
      ipAddress: authService.getRequestIp(req),
      userAgent: authService.getUserAgent(req)
    });

    res.status(201).json({
      ...buildAuthResponse(req, res, await buildUserPayload(user), sessionResult)
    });
  })
);

router.post(
  "/register/customer",
  asyncHandler(async (req, res) => {
    const { name, username, email, phone, password } = req.body;
    const normalizedPhone = normalizePhilippineMobileNumber(phone);

    if (!name || !username || !email || !password) {
      const error = new Error("name, username, email, and password are required.");
      error.statusCode = 400;
      throw error;
    }

    const normalizedEmail = normalizeEmail(email);
    const normalizedUsername = await assertUsernameAvailable(username);
    assertPublicTextFieldsAllowed({ "Account name": name, Username: normalizedUsername });
    const existingUser = await userRepository.findUserByEmail(normalizedEmail);
    if (existingUser) {
      const error = new Error(buildExistingAccountMessage(existingUser));
      error.statusCode = 409;
      throw error;
    }

    const user = await userRepository.createUser({
      name,
      username: normalizedUsername,
      email: normalizedEmail,
      phone: normalizedPhone,
      passwordHash: await bcrypt.hash(password, 10),
      passwordHashAlgorithm: "bcrypt",
      emailVerified: false,
      lastLoginProvider: "password",
      roles: ["customer"]
    });

    const sessionResult = await sessionService.createAuthSession({
      user,
      authMethod: "password",
      ipAddress: authService.getRequestIp(req),
      userAgent: authService.getUserAgent(req)
    });

    await authService.recordLoginAttempt({
      email: normalizedEmail,
      success: true,
      user,
      sessionId: sessionResult.session._id,
      req
    });

    res.status(201).json({
      ...buildAuthResponse(req, res, await buildUserPayload(user), sessionResult)
    });
  })
);

router.post(
  "/login",
  authAttemptLimiter,
  asyncHandler(async (req, res) => {
    const { password } = req.body;
    const loginIdentifier = authService.normalizeLoginIdentifier(req.body.identifier || req.body.email);

    if (!loginIdentifier.identifierValue || !password) {
      const error = new Error("email or username and password are required.");
      error.statusCode = 400;
      throw error;
    }

    const user = loginIdentifier.identifierType === "email"
      ? await userRepository.findUserByEmail(loginIdentifier.identifierValue)
      : await userRepository.findUserByUsername(loginIdentifier.identifierValue);
    if (!user) {
      await authService.recordLoginAttempt({
        identifierType: loginIdentifier.identifierType,
        identifierValue: loginIdentifier.identifierValue,
        success: false,
        failureReason: "invalid_credentials",
        req
      });
      const error = new Error("Invalid email/username or password.");
      error.statusCode = 401;
      throw error;
    }

    const normalizedEmail = normalizeEmail(user.email);
    if (authService.isUserLocked(user)) {
      await authService.recordLockedLoginAttempt({
        email: normalizedEmail,
        user,
        req
      });
      const error = new Error("Your account is temporarily locked. Please try again later.");
      error.statusCode = 423;
      throw error;
    }

    const passwordMatches =
      user.passwordHash && (await authService.verifyPasswordLogin(user, password));
    if (!passwordMatches) {
      const failureResult = await db.withTransaction(async (client) => {
        return authService.handleFailedPasswordLogin({
          email: normalizedEmail,
          user,
          req,
          client
        });
      });

      const error = new Error(
        failureResult.updatedUser?.accountLockedUntil
          ? "Your account is temporarily locked. Please try again later."
          : "Invalid email/username or password."
      );
      error.statusCode = failureResult.updatedUser?.accountLockedUntil ? 423 : 401;
      throw error;
    }

    const updatedUser = await db.withTransaction(async (client) => {
      return authService.handleSuccessfulPasswordLogin({
        user,
        req,
        client
      });
    });
    if (updatedUser.mfaEnabled && userRequiresPrivilegedMfa(updatedUser)) {
      const challenge = await mfaFlowService.issueLoginChallenge({
        user: updatedUser,
        ipAddress: authService.getRequestIp(req),
        userAgent: authService.getUserAgent(req)
      });
      res.json({
        mfaRequired: true,
        challengeToken: challenge.token,
        expiresAt: challenge.expiresAt,
        methods: ["totp", "recovery"]
      });
      return;
    }
    const sessionResult = await sessionService.createAuthSession({
      user: updatedUser,
      authMethod: "password",
      ipAddress: authService.getRequestIp(req),
      userAgent: authService.getUserAgent(req)
    });

    await authService.recordLoginAttempt({
      email: normalizedEmail,
      success: true,
      user: updatedUser,
      sessionId: sessionResult.session._id,
      req
    });

    res.json({
      ...buildAuthResponse(req, res, await buildUserPayload(updatedUser), sessionResult)
    });
  })
);

router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const refreshToken = String(
      getRefreshCookie(parseCookies(req.headers.cookie), env.authCookieSecure) || req.body?.refreshToken || ""
    );
    if (!refreshToken) {
      const error = new Error("refreshToken is required.");
      error.statusCode = 400;
      throw error;
    }

    const session = await sessionService.resolveSessionByRefreshToken(refreshToken);
    if (!session || session.status !== "active" || new Date(session.expiresAt).getTime() <= Date.now()) {
      const error = new Error("Refresh session is no longer valid.");
      error.statusCode = 401;
      throw error;
    }

    const user = await userRepository.findUserById(session.userId);
    if (!user) {
      const error = new Error("Refresh session is no longer valid.");
      error.statusCode = 401;
      throw error;
    }

    const sessionResult = await sessionService.rotateRefreshSession({ session, user });

    await securityEventService.logSecurityEvent({
      userId: user._id,
      sessionId: sessionResult.session._id,
      eventType: "refresh_rotated",
      actorRole: user.roles?.[0] || null,
      ipAddress: authService.getRequestIp(req),
      userAgent: authService.getUserAgent(req),
      metadata: {}
    });

    res.json(buildAuthResponse(req, res, await buildUserPayload(user), sessionResult));
  })
);

router.post(
  "/mfa/verify",
  authAttemptLimiter,
  asyncHandler(async (req, res) => {
    const result = await mfaFlowService.verifyLoginChallenge({
      challengeToken: req.body?.challengeToken,
      code: req.body?.code,
      recoveryCode: req.body?.recoveryCode
    });
    res.json(buildAuthResponse(req, res, await buildUserPayload(result.user), result.sessionResult));
  })
);

router.post(
  "/mfa/enrollment/start",
  authenticate,
  asyncHandler(async (req, res) => {
    res.json(await mfaFlowService.startTotpEnrollment({
      user: req.user,
      session: req.auth.session,
      currentCode: req.body?.currentCode
    }));
  })
);

router.post(
  "/mfa/enrollment/confirm",
  authenticate,
  asyncHandler(async (req, res) => {
    const result = await mfaFlowService.confirmTotpEnrollment({
      user: req.user,
      sessionId: req.auth.sessionId,
      code: req.body?.code
    });
    res.json({
      success: true,
      recoveryCodes: result.recoveryCodes,
      message: "Authenticator verification is now enabled. Save your recovery codes somewhere secure."
    });
  })
);

router.post(
  "/mfa/enrollment/cancel",
  authenticate,
  asyncHandler(async (req, res) => {
    const result = await mfaFlowService.cancelTotpEnrollment({ user: req.user });
    res.json({
      ...result,
      message: "Pending authenticator setup canceled. Your active authenticator was not changed."
    });
  })
);

router.post(
  "/mfa/disable",
  authenticate,
  authAttemptLimiter,
  asyncHandler(async (req, res) => {
    const passwordMatches = req.user.passwordHash &&
      await authService.verifyPasswordLogin(req.user, String(req.body?.password || ""));
    if (!passwordMatches) {
      const error = new Error("We could not verify your sign-in details.");
      error.statusCode = 401;
      error.code = "PRIMARY_AUTHENTICATION_INVALID";
      throw error;
    }

    await mfaFlowService.disableMfa({
      user: req.user,
      sessionId: req.auth.sessionId,
      code: req.body?.code,
      recoveryCode: req.body?.recoveryCode,
      ipAddress: authService.getRequestIp(req),
      userAgent: authService.getUserAgent(req)
    });
    res.json({
      success: true,
      message: "Multi-factor authentication has been removed from your account."
    });
  })
);

router.post(
  "/mfa/step-up",
  authenticate,
  authAttemptLimiter,
  asyncHandler(async (req, res) => {
    const passwordMatches = req.user.passwordHash &&
      await authService.verifyPasswordLogin(req.user, String(req.body?.password || ""));
    if (!passwordMatches) {
      const error = new Error("We could not verify your sign-in details.");
      error.statusCode = 401;
      throw error;
    }
    const mfaRepository = require("../repositories/mfa");
    const { decryptSecret, verifyTotp } = require("../services/mfaService");
    const factor = await mfaRepository.findTotpFactor(req.user._id, "active");
    const secret = factor && decryptSecret(factor, env.mfaEncryptionSecret);
    if (!secret || !verifyTotp(secret, req.body?.code)) {
      const error = new Error("That security code could not be verified. Check the code and try again.");
      error.statusCode = 400;
      error.code = "MFA_CODE_INVALID";
      throw error;
    }
    const session = await authSessionRepository.markRecentAuthentication(req.auth.sessionId);
    res.json({ success: true, verifiedAt: session.mfaVerifiedAt });
  })
);

router.post(
  "/password-reset/request",
  authAttemptLimiter,
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    if (!email) {
      const error = new Error("email is required.");
      error.statusCode = 400;
      throw error;
    }

    const user = await userRepository.findUserByEmail(email);
    if (user?.email) {
      const reset = await db.withTransaction(async (client) => {
        return passwordResetService.issuePasswordResetToken({
          user,
          req,
          client
        });
      });

      await notificationService.sendEmail({
        to: user.email,
        subject: "Reset your GetPrio password",
        text: [
          `We received a request to reset your GetPrio password.`,
          `Reset link: ${reset.resetUrl}`,
          `Reset token: ${reset.token}`,
          `This reset token expires at ${new Date(reset.expiresAt).toISOString()}.`,
          `If you did not request this, you can ignore this email.`
        ].join("\n\n"),
        purpose: "general",
        metadata: {
          category: "password_reset"
        }
      });
    }

    res.json({
      success: true,
      message: "If an account exists for that email, password reset instructions have been sent."
    });
  })
);

router.post(
  "/password-reset/confirm",
  authAttemptLimiter,
  asyncHandler(async (req, res) => {
    const token = String(req.body.token || "").trim();
    const newPassword = String(req.body.newPassword || "");

    if (!token || !newPassword) {
      const error = new Error("token and newPassword are required.");
      error.statusCode = 400;
      throw error;
    }

    await passwordResetService.resetPassword({
      token,
      newPassword,
      req
    });

    res.json({
      success: true,
      message: "Your password has been reset."
    });
  })
);

router.post(
  "/logout",
  maybeAuthenticate,
  asyncHandler(async (req, res) => {
    const refreshToken = String(
      getRefreshCookie(parseCookies(req.headers.cookie), env.authCookieSecure) || req.body?.refreshToken || ""
    );
    let session = null;

    if (refreshToken) {
      session = await sessionService.resolveSessionByRefreshToken(refreshToken);
    } else if (req.auth?.sessionId) {
      session = await authSessionRepository.findSessionById(req.auth.sessionId);
    }

    if (session?.status === "active") {
      await sessionService.revokeSessionById(session._id, "logout");
      await securityEventService.logSecurityEvent({
        userId: session.userId,
        sessionId: session._id,
        eventType: "logout",
        actorRole: req.user?.roles?.[0] || null,
        ipAddress: authService.getRequestIp(req),
        userAgent: authService.getUserAgent(req),
        metadata: {}
      });
    }

    clearBrowserSession(res, { secure: env.authCookieSecure });
    res.json({ success: true });
  })
);

router.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({
      user: await buildUserPayload(req.user),
      sessionExpiresAt: req.auth.session?.inactivityExpiresAt || req.auth.session?.expiresAt || null
    });
  })
);

module.exports = router;
