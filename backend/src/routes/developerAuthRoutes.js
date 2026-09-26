const express = require("express");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const db = require("../config/db");
const env = require("../config/env");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticateDeveloper } = require("../middleware/developerAuth");
const authService = require("../services/authService");
const developerAccountRepository = require("../repositories/developerAccounts");
const userRepository = require("../repositories/users");
const sessionService = require("../services/sessionService");
const securityEventService = require("../services/securityEventService");
const customerRegistrationOtpService = require("../services/customerRegistrationOtpService");
const passwordResetService = require("../services/passwordResetService");
const notificationService = require("../services/notificationService");
const mfaFlowService = require("../services/mfaFlowService");
const {
  clearBrowserSession,
  getRefreshCookie,
  issueBrowserSession,
  parseCookies,
  restoreBrowserCsrf
} = require("../services/browserSessionService");

const router = express.Router();
const developerRegistrationOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip || req.socket?.remoteAddress || "unknown"),
  message: { message: "Too many registration verification requests. Please try again later." }
});
const developerLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip || req.socket?.remoteAddress || "unknown"),
  message: { message: "Too many login attempts. Please try again later." }
});
const developerPasswordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip || req.socket?.remoteAddress || "unknown"),
  message: { message: "Too many password reset requests. Please try again later." }
});

router.use("/register/otp", developerRegistrationOtpLimiter);

function requestContext(req) {
  return {
    ipAddress: authService.getRequestIp(req),
    userAgent: authService.getUserAgent(req)
  };
}

function userPayload(user) {
  return {
    id: String(user._id),
    name: user.name,
    displayName: user.displayName || "",
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
    mfaEnabled: Boolean(user.mfaEnabled),
    emailMfaEnabled: Boolean(user.emailMfaEnabled)
  };
}

function developerPayload(membership) {
  return {
    id: membership.developerAccountId,
    role: membership.role,
    status: membership.accountStatus
  };
}

function authResponse(req, res, user, membership, sessionResult) {
  const accessMaxAgeSeconds = env.developerSessionNoExpiry
    ? env.developerSessionNoExpiryDays * 24 * 60 * 60
    : env.accessTokenTtlMinutes * 60;
  const { csrfToken } = issueBrowserSession(res, sessionResult, {
    secure: env.authCookieSecure,
    csrfSecret: env.csrfSecret,
    accessMaxAgeSeconds,
    surface: "developer"
  });
  const compatibilityRequested =
    env.authBearerCompatibilityEnabled &&
    String(req.headers["x-auth-compatibility"] || "").toLowerCase() === "bearer-v1";

  return {
    user: userPayload(user),
    developerAccount: developerPayload(membership),
    csrfToken,
    sessionExpiresAt: sessionResult.session.inactivityExpiresAt || sessionResult.session.expiresAt,
    ...(compatibilityRequested
      ? { token: sessionResult.accessToken, refreshToken: sessionResult.refreshToken }
      : {})
  };
}

function invalidCredentials() {
  const error = new Error("Invalid email or password.");
  error.statusCode = 401;
  return error;
}

function buildDeveloperPasswordResetUrl(token) {
  const baseUrl = String(env.developerPortalUrl || "").replace(/\/$/, "");
  return `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
}

function validateDeveloperEmail(value) {
  const email = authService.normalizeEmail(value);
  const atIndex = email.indexOf("@");
  if (
    !email ||
    email.length > 254 ||
    atIndex <= 0 ||
    atIndex !== email.lastIndexOf("@") ||
    email.lastIndexOf(".") <= atIndex + 1 ||
    email.endsWith(".") ||
    /\s/.test(email)
  ) {
    const error = new Error("Enter a valid email address.");
    error.statusCode = 400;
    throw error;
  }
  return email;
}

function readDeveloperVerificationCode(value) {
  const code = String(value || "").trim();
  if (!/^\d{6}$/.test(code)) {
    const error = new Error("Enter the six-digit verification code.");
    error.statusCode = 400;
    error.code = "DEVELOPER_REGISTRATION_CODE_INVALID";
    throw error;
  }
  return code;
}

async function verifyDeveloperPassword(req, email, password) {
  const user = await userRepository.findUserByEmail(email);
  if (!user) {
    await authService.recordLoginAttempt({ email, success: false, failureReason: "invalid_credentials", req });
    throw invalidCredentials();
  }

  if (authService.isUserLocked(user)) {
    await authService.recordLockedLoginAttempt({ email, user, req });
    const error = new Error("Your account is temporarily locked. Please try again later.");
    error.statusCode = 423;
    throw error;
  }

  if (!(await authService.verifyPasswordLogin(user, password))) {
    await db.withTransaction(async (client) => {
      await authService.handleFailedPasswordLogin({ email, user, req, client });
    });
    throw invalidCredentials();
  }

  return user;
}

router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const refreshToken = String(
      getRefreshCookie(parseCookies(req.headers.cookie), env.authCookieSecure, "developer") || req.body?.refreshToken || ""
    );
    if (!refreshToken) {
      const error = new Error("refreshToken is required.");
      error.statusCode = 400;
      throw error;
    }

    const session = await sessionService.resolveSessionByRefreshToken(refreshToken);
    if (
      !session ||
      session.surface !== "developer" ||
      session.status !== "active" ||
      (!env.developerSessionNoExpiry && new Date(session.expiresAt).getTime() <= Date.now())
    ) {
      const error = new Error("Developer refresh session is no longer valid.");
      error.statusCode = 401;
      throw error;
    }

    const user = await userRepository.findUserById(session.userId);
    const membership = user && await developerAccountRepository.findMembershipByUserId(user._id);
    if (!user || !membership || membership.accountStatus !== "active") {
      const error = new Error("Developer account is not active.");
      error.statusCode = 403;
      error.code = "DEVELOPER_ACCOUNT_INACTIVE";
      throw error;
    }

    const sessionResult = await sessionService.rotateRefreshSession({ session, user });
    await securityEventService.logSecurityEvent({
      userId: user._id,
      sessionId: sessionResult.session._id,
      eventType: "developer_refresh_rotated",
      actorRole: membership.role,
      ipAddress: authService.getRequestIp(req),
      userAgent: authService.getUserAgent(req),
      metadata: {}
    });
    res.json(authResponse(req, res, user, membership, sessionResult));
  })
);

router.post(
  "/register/otp",
  asyncHandler(async (req, res) => {
    const name = String(req.body?.name || "").trim();
    const email = validateDeveloperEmail(req.body?.email);
    const password = String(req.body?.password || "");
    if (!name || !email || !password) {
      const error = new Error("name, email, and password are required.");
      error.statusCode = 400;
      throw error;
    }
    if (name.length < 2 || name.length > 120) {
      const error = new Error("Enter your name using 2-120 characters.");
      error.statusCode = 400;
      throw error;
    }

    customerRegistrationOtpService.assertValidPassword(password);
    const existingUser = await userRepository.findUserByEmail(email);
    const passwordHash = await bcrypt.hash(password, 10);
    const challenge = existingUser
      ? await customerRegistrationOtpService.restartUnverified({ userId: existingUser._id, name, email, passwordHash, roles: ["developer"], purpose: "developer" })
      : await customerRegistrationOtpService.start({ name, email, passwordHash, roles: ["developer"], purpose: "developer" });
    res.status(201).json(challenge);
  })
);

router.post(
  "/register/otp/verify",
  asyncHandler(async (req, res) => {
    const result = await customerRegistrationOtpService.verify({
      challengeId: req.body?.challengeId,
      code: readDeveloperVerificationCode(req.body?.code),
      purpose: "developer",
      surface: "developer",
      ...requestContext(req),
      onVerified: async ({ user, client }) => ({
        membership: await developerAccountRepository.createAccountForOwner(user._id, { client })
      })
    });
    await authService.recordLoginAttempt({
      email: result.user.email,
      success: true,
      user: result.user,
      sessionId: result.sessionResult.session._id,
      req
    });
    res.status(201).json(authResponse(req, res, result.user, result.membership, result.sessionResult));
  })
);

router.post(
  "/register/otp/resend",
  asyncHandler(async (req, res) => {
    res.json(await customerRegistrationOtpService.resend({
      challengeId: req.body?.challengeId,
      purpose: "developer"
    }));
  })
);

router.post(
  "/login",
  developerLoginLimiter,
  asyncHandler(async (req, res) => {
    const email = authService.normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    if (!email || !password) {
      const error = new Error("email and password are required.");
      error.statusCode = 400;
      throw error;
    }

    const user = await verifyDeveloperPassword(req, email, password);
    const membership = await developerAccountRepository.findMembershipByUserId(user._id);
    if (!membership) {
      const error = new Error("Create a Developer Portal account first.");
      error.statusCode = 403;
      error.code = "DEVELOPER_ENROLLMENT_REQUIRED";
      throw error;
    }
    if (membership.accountStatus !== "active") {
      const error = new Error("This Developer Portal account is not active.");
      error.statusCode = 403;
      error.code = "DEVELOPER_ACCOUNT_INACTIVE";
      throw error;
    }

    const context = requestContext(req);
    const result = await db.withTransaction(async (client) => {
      const updatedUser = await authService.handleSuccessfulPasswordLogin({ user, client });
      const methods = await mfaFlowService.getLoginMethods(updatedUser, { client });
      if (updatedUser.mfaEnabled && !methods.length) {
        const error = new Error("Multi-factor authentication is enabled but no usable method is configured.");
        error.statusCode = 409;
        error.code = "MFA_CONFIGURATION_INVALID";
        throw error;
      }
      if (updatedUser.mfaEnabled) {
        const challenge = await mfaFlowService.issueLoginChallenge({
          user: updatedUser,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent
        }, { client });
        return { user: updatedUser, challenge, methods };
      }
      const sessionResult = await sessionService.createAuthSession({
        user: updatedUser,
        authMethod: "password",
        surface: "developer",
        ...context,
        client
      });
      await authService.recordLoginAttempt({
        email,
        success: true,
        user: updatedUser,
        sessionId: sessionResult.session._id,
        req,
        client
      });
      return { user: updatedUser, sessionResult, methods: [] };
    });

    if (result.challenge) {
      res.json({ mfaRequired: true, challengeToken: result.challenge.token, expiresAt: result.challenge.expiresAt, methods: result.methods });
      return;
    }
    res.json(authResponse(req, res, result.user, membership, result.sessionResult));
  })
);

router.post(
  "/password-reset/request",
  developerPasswordResetLimiter,
  asyncHandler(async (req, res) => {
    const email = authService.normalizeEmail(req.body?.email);
    const user = email ? await userRepository.findUserByEmail(email) : null;
    const membership = user && await developerAccountRepository.findMembershipByUserId(user._id);

    if (user?.email && membership?.accountStatus === "active") {
      const reset = await db.withTransaction(async (client) => passwordResetService.issuePasswordResetToken({ user, req, client }));
      try {
        await notificationService.sendEmail({
          to: user.email,
          subject: "Reset your GetPrio Developer Portal password",
          text: [
            "We received a request to reset your GetPrio Developer Portal password.",
            `Reset link: ${buildDeveloperPasswordResetUrl(reset.token)}`,
            `This link expires at ${new Date(reset.expiresAt).toISOString()}.`,
            "If you did not request this, you can ignore this email."
          ].join("\n\n"),
          emailTemplate: {
            illustration: "account-verification",
            actionLabel: "Reset Developer Portal password",
            actionUrl: buildDeveloperPasswordResetUrl(reset.token)
          },
          purpose: "general",
          metadata: { category: "developer_password_reset" }
        });
      } catch (error) {
        console.warn("[developer-password-reset-email-failed]", error.message);
      }
    }

    res.json({
      success: true,
      message: "If an active Developer Portal account exists for that email, reset instructions have been sent."
    });
  })
);

router.post(
  "/password-reset/confirm",
  developerPasswordResetLimiter,
  asyncHandler(async (req, res) => {
    const token = String(req.body?.token || "").trim();
    const newPassword = String(req.body?.newPassword || "");
    if (!token || !newPassword) {
      const error = new Error("token and newPassword are required.");
      error.statusCode = 400;
      throw error;
    }

    customerRegistrationOtpService.assertValidPassword(newPassword);
    await passwordResetService.resetPassword({
      token,
      newPassword,
      req,
      userGuard: async ({ user, client }) => {
        const membership = await developerAccountRepository.findMembershipByUserId(user._id, { client });
        return membership?.accountStatus === "active";
      }
    });
    res.json({ success: true, message: "Your Developer Portal password has been reset." });
  })
);

router.post(
  "/mfa/email/send",
  developerLoginLimiter,
  asyncHandler(async (req, res) => {
    res.json(await mfaFlowService.issueEmailLoginChallenge({
      challengeToken: String(req.body?.challengeToken || ""),
      ...requestContext(req)
    }));
  })
);

router.post(
  "/mfa/verify",
  developerLoginLimiter,
  asyncHandler(async (req, res) => {
    const result = await mfaFlowService.verifyLoginChallenge({
      challengeToken: String(req.body?.challengeToken || ""),
      code: String(req.body?.code || ""),
      recoveryCode: String(req.body?.recoveryCode || ""),
      method: String(req.body?.method || "totp"),
      surface: "developer"
    });
    const membership = await developerAccountRepository.findMembershipByUserId(result.user._id);
    if (!membership || membership.accountStatus !== "active") {
      const error = new Error("This Developer Portal account is not active.");
      error.statusCode = 403;
      error.code = "DEVELOPER_ACCOUNT_INACTIVE";
      throw error;
    }
    res.json(authResponse(req, res, result.user, membership, result.sessionResult));
  })
);

router.get("/me", authenticateDeveloper, (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    user: userPayload(req.user),
    developerAccount: developerPayload(req.developerMembership),
    // The CSRF cookie is readable by the portal but signed to this server
    // session. Restoring it here lets a freshly loaded tab make a protected
    // mutation without putting a session token in browser storage.
    csrfToken: restoreBrowserCsrf(req, res, {
      secure: env.authCookieSecure,
      csrfSecret: env.csrfSecret,
      surface: "developer"
    })
  });
});

router.post(
  "/password",
  authenticateDeveloper,
  asyncHandler(async (req, res) => {
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");
    const confirmPassword = String(req.body?.confirmPassword || "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      const error = new Error("Current password, new password, and confirmation are required.");
      error.statusCode = 400;
      error.code = "PASSWORD_FIELDS_REQUIRED";
      throw error;
    }
    if (newPassword !== confirmPassword) {
      const error = new Error("New password and confirmation do not match.");
      error.statusCode = 400;
      error.code = "PASSWORD_CONFIRMATION_MISMATCH";
      throw error;
    }

    customerRegistrationOtpService.assertValidPassword(newPassword);
    await passwordResetService.changePassword({
      user: req.user,
      currentPassword,
      newPassword,
      req
    });
    clearBrowserSession(res, { secure: env.authCookieSecure, surface: "developer" });
    res.json({ success: true, message: "Your password has been changed. Please sign in again." });
  })
);

router.post(
  "/mfa/enrollment/start",
  authenticateDeveloper,
  asyncHandler(async (req, res) => {
    res.json(await mfaFlowService.startTotpEnrollment({
      user: req.user,
      session: req.auth.session,
      currentCode: String(req.body?.currentCode || "")
    }));
  })
);

router.post(
  "/mfa/email/enable",
  authenticateDeveloper,
  asyncHandler(async (req, res) => {
    const user = await mfaFlowService.enableEmailMfa({ user: req.user });
    res.json({ success: true, user: userPayload(user), message: "Email OTP is now enabled for sign-in." });
  })
);

router.post(
  "/mfa/email/disable",
  authenticateDeveloper,
  asyncHandler(async (req, res) => {
    const password = String(req.body?.password || "");
    const passwordMatches = req.user.passwordHash && await authService.verifyPasswordLogin(req.user, password);
    if (!passwordMatches) {
      const error = new Error("We could not verify your sign-in details.");
      error.statusCode = 401;
      error.code = "PRIMARY_AUTHENTICATION_INVALID";
      throw error;
    }
    const user = await mfaFlowService.disableEmailMfa({ user: req.user });
    res.json({ success: true, user: userPayload(user), message: "Email OTP has been disabled for sign-in." });
  })
);

router.post(
  "/mfa/enrollment/confirm",
  authenticateDeveloper,
  asyncHandler(async (req, res) => {
    const result = await mfaFlowService.confirmTotpEnrollment({
      user: req.user,
      sessionId: req.auth.sessionId,
      code: String(req.body?.code || "")
    });
    const user = await userRepository.findUserById(req.user._id);
    res.json({
      success: true,
      recoveryCodes: result.recoveryCodes,
      user: userPayload(user),
      message: "Authenticator verification is now enabled. Save your recovery codes somewhere secure."
    });
  })
);

router.post(
  "/mfa/enrollment/cancel",
  authenticateDeveloper,
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
  authenticateDeveloper,
  asyncHandler(async (req, res) => {
    const password = String(req.body?.password || "");
    const passwordMatches = req.user.passwordHash && await authService.verifyPasswordLogin(req.user, password);
    if (!passwordMatches) {
      const error = new Error("We could not verify your sign-in details.");
      error.statusCode = 401;
      error.code = "PRIMARY_AUTHENTICATION_INVALID";
      throw error;
    }
    await mfaFlowService.disableMfa({
      user: req.user,
      sessionId: req.auth.sessionId,
      code: String(req.body?.code || ""),
      recoveryCode: String(req.body?.recoveryCode || ""),
      ipAddress: authService.getRequestIp(req),
      userAgent: authService.getUserAgent(req)
    });
    const user = await userRepository.findUserById(req.user._id);
    res.json({ success: true, user: userPayload(user), message: "Multi-factor authentication has been removed from your account." });
  })
);

router.post(
  "/logout",
  authenticateDeveloper,
  asyncHandler(async (req, res) => {
    await sessionService.revokeSessionById(req.auth.sessionId, "logout");
    await securityEventService.logSecurityEvent({
      userId: req.user._id,
      sessionId: req.auth.sessionId,
      eventType: "developer_logout",
      actorRole: req.developerMembership.role,
      ipAddress: authService.getRequestIp(req),
      userAgent: authService.getUserAgent(req),
      metadata: {}
    });
    clearBrowserSession(res, { secure: env.authCookieSecure, surface: "developer" });
    res.status(204).end();
  })
);

module.exports = router;
