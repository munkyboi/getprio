const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../config/db");
const tenantRepository = require("../repositories/tenants");
const authSessionRepository = require("../repositories/authSessions");
const userRepository = require("../repositories/users");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate, maybeAuthenticate } = require("../middleware/auth");
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

const router = express.Router();
const OAUTH_INTENTS = new Set(["login", "register_customer", "register_vendor"]);
const normalizeEmail = authService.normalizeEmail;

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildAuthResponse(user, sessionResult) {
  return {
    token: sessionResult.accessToken,
    refreshToken: sessionResult.refreshToken,
    user
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
    email: user.email,
    phone: user.phone,
    roles: user.roles,
    emailVerified: Boolean(user.emailVerified),
    hasPassword: Boolean(user.passwordHash),
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
  res.redirect(buildClientCallbackUrl({ error: message }));
}

function getAuthMethodForProvider(provider) {
  return provider === "google" || provider === "facebook" ? provider : "password";
}

router.get("/oauth/providers", (req, res) => {
  res.json({
    providers: buildProviderAvailability()
  });
});

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

    res.redirect(
      buildClientCallbackUrl({
        token: sessionResult.accessToken,
        refreshToken: sessionResult.refreshToken,
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
    const { tenantName, tenantSlug, name, email, phone, password } = req.body;

    if (!tenantName || !tenantSlug || !name || !email || !password) {
      const error = new Error("tenantName, tenantSlug, name, email, and password are required.");
      error.statusCode = 400;
      throw error;
    }

    const normalizedSlug = normalizeSlug(tenantSlug);
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedSlug) {
      const error = new Error("tenantSlug must contain letters or numbers.");
      error.statusCode = 400;
      throw error;
    }

    const result = await db.withTransaction(async (client) => {
      const [existingTenant, existingUser] = await Promise.all([
        tenantRepository.findTenantBySlug(normalizedSlug, { client }),
        userRepository.findUserByEmail(normalizedEmail, { client })
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

      const tenant = await tenantRepository.createTenant(
        {
          name: tenantName,
          slug: normalizedSlug,
          contactEmail: normalizedEmail,
          contactPhone: phone
        },
        { client }
      );

      const user = await userRepository.createUser(
        {
          name,
          email: normalizedEmail,
          phone,
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
      ...buildAuthResponse(await buildUserPayload(result.user), sessionResult)
    });
  })
);

router.post(
  "/register/vendor/complete",
  authenticate,
  asyncHandler(async (req, res) => {
    const { tenantName, tenantSlug, name, email, phone } = req.body;

    if (!tenantName || !tenantSlug) {
      const error = new Error("tenantName and tenantSlug are required.");
      error.statusCode = 400;
      throw error;
    }

    const normalizedSlug = normalizeSlug(tenantSlug);
    const normalizedEmail = normalizeEmail(email) || normalizeEmail(req.user.email);

    if (!normalizedSlug) {
      const error = new Error("tenantSlug must contain letters or numbers.");
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

    const user = await db.withTransaction(async (client) => {
      const [existingTenant, conflictingUser] = await Promise.all([
        tenantRepository.findTenantBySlug(normalizedSlug, { client }),
        userRepository.findUserByEmail(normalizedEmail, {
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

      const tenant = await tenantRepository.createTenant(
        {
          name: tenantName,
          slug: normalizedSlug,
          contactEmail: normalizedEmail,
          contactPhone: phone || req.user.phone
        },
        { client }
      );

      await userRepository.addTenantMembership(req.user._id, tenant._id, "owner", { client });

      return userRepository.updateUser(
        req.user._id,
        {
          name: resolvedName,
          email: normalizedEmail,
          phone: phone || req.user.phone,
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
      ...buildAuthResponse(await buildUserPayload(user), sessionResult)
    });
  })
);

router.post(
  "/register/customer",
  asyncHandler(async (req, res) => {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !password) {
      const error = new Error("name, email, and password are required.");
      error.statusCode = 400;
      throw error;
    }

    const normalizedEmail = normalizeEmail(email);
    const existingUser = await userRepository.findUserByEmail(normalizedEmail);
    if (existingUser) {
      const error = new Error(buildExistingAccountMessage(existingUser));
      error.statusCode = 409;
      throw error;
    }

    const user = await userRepository.createUser({
      name,
      email: normalizedEmail,
      phone,
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
      ...buildAuthResponse(await buildUserPayload(user), sessionResult)
    });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      const error = new Error("email and password are required.");
      error.statusCode = 400;
      throw error;
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await userRepository.findUserByEmail(normalizedEmail);
    if (!user) {
      await authService.recordLoginAttempt({
        email: normalizedEmail,
        success: false,
        failureReason: "invalid_credentials",
        req
      });
      const error = new Error("Invalid email or password.");
      error.statusCode = 401;
      throw error;
    }

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
          : "Invalid email or password."
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
      ...buildAuthResponse(await buildUserPayload(updatedUser), sessionResult)
    });
  })
);

router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const refreshToken = String(req.body.refreshToken || "");
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

    res.json(buildAuthResponse(await buildUserPayload(user), sessionResult));
  })
);

router.post(
  "/password-reset/request",
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
    const refreshToken = String(req.body.refreshToken || "");
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

    res.json({ success: true });
  })
);

router.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({
      user: await buildUserPayload(req.user)
    });
  })
);

module.exports = router;
