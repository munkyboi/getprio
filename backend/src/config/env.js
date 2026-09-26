const path = require("path");
const dotenv = require("dotenv");
const { resolveMobileQrBaseUrl } = require("./mobileQrBaseUrl");
const { resolveDeveloperWebhookConfig } = require("./developerWebhookConfig");
const {
  sandboxAndroidPackageName,
  resolveSandboxTestFlightPublicUrl,
  resolveSandboxAndroidGooglePlayPublicUrl
} = require("./sandboxDistributionLinks");

const rootEnvPath = path.resolve(__dirname, "../../../.env");
dotenv.config({ path: rootEnvPath });

const backendEnvPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: backendEnvPath, override: false });
// Worktree-local overrides are ignored by git and loaded last.
dotenv.config({ path: path.resolve(__dirname, "../../../.env.local"), override: true });
dotenv.config({ path: path.resolve(__dirname, "../../.env.local"), override: true });

const port = Number(process.env.PORT || process.env.BACKEND_PORT || 5001);
const frontendPort = Number(process.env.FRONTEND_PORT || 5173);
const platformDashboardPort = Number(process.env.PLATFORM_DASHBOARD_PORT || 7100);

const nodeEnv = process.env.NODE_ENV || "development";
const databaseUrl =
  process.env.DATABASE_URL || "postgresql://prio:prio@127.0.0.1:5432/prio_queue";
const databaseSsl = process.env.DATABASE_SSL === "true";
const databaseSslCa = process.env.DATABASE_SSL_CA || "";
const databaseSslCaFile = process.env.DATABASE_SSL_CA_FILE || "";
const jwtSecret = process.env.JWT_SECRET || "change-me";
const serverUrl = process.env.SERVER_URL || `http://localhost:${port}`;
const clientUrl = process.env.CLIENT_URL || `http://localhost:${frontendPort}`;
const appBaseUrl = process.env.APP_BASE_URL || `http://localhost:${frontendPort}`;
const emailAssetBaseUrl = process.env.EMAIL_ASSET_BASE_URL || appBaseUrl;
const mobileQrBaseUrl = resolveMobileQrBaseUrl(process.env, appBaseUrl, frontendPort);
const mobilePaymentReturnUrl = process.env.MOBILE_PAYMENT_RETURN_URL || "";
const platformDashboardUrl =
  process.env.PLATFORM_DASHBOARD_URL || `http://localhost:${platformDashboardPort}`;
const developerPortalUrl = process.env.DEVELOPER_PORTAL_URL || (
  nodeEnv === "production" ? "https://developers.getprio.online" : "http://localhost:5174"
);
const sandboxTestFlightPublicUrl = resolveSandboxTestFlightPublicUrl();
const sandboxAndroidGooglePlayPublicUrl = resolveSandboxAndroidGooglePlayPublicUrl();
const appTimezone = process.env.APP_TIMEZONE || "Asia/Manila";
const oauthCallbackPath = process.env.OAUTH_CALLBACK_PATH || "/oauth/callback";
const oauthStateTtlMinutes = Number(process.env.OAUTH_STATE_TTL_MINUTES || 10);
const accessTokenTtlMinutes = Number(process.env.ACCESS_TOKEN_TTL_MINUTES || 15);
const refreshTokenTtlDaysCustomer = Number(process.env.REFRESH_TOKEN_TTL_DAYS_CUSTOMER || 30);
const refreshTokenTtlDaysVendorStaff = Number(
  process.env.REFRESH_TOKEN_TTL_DAYS_VENDOR_STAFF || 14
);
const refreshTokenTtlDaysVendorAdmin = Number(
  process.env.REFRESH_TOKEN_TTL_DAYS_VENDOR_ADMIN || 7
);
const refreshTokenTtlDaysPlatformAdmin = Number(
  process.env.REFRESH_TOKEN_TTL_DAYS_PLATFORM_ADMIN || 7
);
const loginLockoutThreshold = Number(process.env.LOGIN_LOCKOUT_THRESHOLD || 5);
const loginLockoutWindowMinutes = Number(process.env.LOGIN_LOCKOUT_WINDOW_MINUTES || 15);
const loginLockoutDurationMinutes = Number(process.env.LOGIN_LOCKOUT_DURATION_MINUTES || 15);
const passwordResetTtlMinutes = Number(process.env.PASSWORD_RESET_TTL_MINUTES || 30);
const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
const facebookAppId = process.env.FACEBOOK_APP_ID || "";
const facebookAppSecret = process.env.FACEBOOK_APP_SECRET || "";
const appleClientId = process.env.APPLE_CLIENT_ID || "";
const appleTeamId = process.env.APPLE_TEAM_ID || "";
const appleKeyId = process.env.APPLE_KEY_ID || "";
const applePrivateKey = (process.env.APPLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const smtpHost = process.env.SMTP_HOST || "";
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpSecure = process.env.SMTP_SECURE === "true";
const smtpUser = process.env.SMTP_USER || "";
const smtpPass = process.env.SMTP_PASS || "";
const resendApiKey = process.env.RESEND_API_KEY || "";
const resendFromEmail = process.env.RESEND_FROM_EMAIL || "";
const resendFromName = process.env.RESEND_FROM_NAME || "GetPrio";
const resendApiUrl = process.env.RESEND_API_URL || "https://api.resend.com/emails";
const sendgridApiKey = process.env.SENDGRID_API_KEY || "";
const sendgridFromEmail = process.env.SENDGRID_FROM_EMAIL || "";
const sendgridFromName = process.env.SENDGRID_FROM_NAME || "GetPrio";
const sendgridApiUrl = process.env.SENDGRID_API_URL || "https://api.sendgrid.com/v3/mail/send";
const smsAccountSid = process.env.TWILIO_ACCOUNT_SID || "";
const smsAuthToken = process.env.TWILIO_AUTH_TOKEN || "";
const smsFromNumber = process.env.TWILIO_FROM_NUMBER || "";
function resolvePaymongoMode(source = process.env) {
  const configured = String(source.PAYMONGO_MODE || "").trim().toLowerCase();
  if (configured && configured !== "sandbox" && configured !== "live") {
    throw new Error("PAYMONGO_MODE must be either sandbox or live.");
  }
  if (configured) return configured === "sandbox" ? "sandbox" : "live";
  if (String(source.PAYMONGO_SECRET_KEY || "").startsWith("sk_test_")) return "sandbox";
  if (source.PAYMONGO_SANDBOX_SECRET_KEY && !source.PAYMONGO_LIVE_SECRET_KEY) return "sandbox";
  return "live";
}
const paymongoMode = resolvePaymongoMode();
function resolvePaymongoCredentials(source = process.env, mode = resolvePaymongoMode(source)) {
  const selectedSecretKey = mode === "sandbox"
    ? source.PAYMONGO_SANDBOX_SECRET_KEY
    : source.PAYMONGO_LIVE_SECRET_KEY;
  const selectedWebhookSecret = mode === "sandbox"
    ? source.PAYMONGO_SANDBOX_WEBHOOK_SECRET
    : source.PAYMONGO_LIVE_WEBHOOK_SECRET;

  return {
    secretKey: selectedSecretKey || source.PAYMONGO_SECRET_KEY || "",
    webhookSecret: selectedWebhookSecret || source.PAYMONGO_WEBHOOK_SECRET || "",
  };
}
const paymongoCredentials = resolvePaymongoCredentials();
const paymongoSecretKey = paymongoCredentials.secretKey;
if (paymongoSecretKey.startsWith("sk_") && !paymongoSecretKey.startsWith(paymongoMode === "sandbox" ? "sk_test_" : "sk_live_")) {
  throw new Error(`Selected PayMongo secret key does not match PAYMONGO_MODE=${paymongoMode}.`);
}
const paymongoApiUrl = process.env.PAYMONGO_API_URL || "https://api.paymongo.com/v1";
const paymongoWebhookSecret = paymongoCredentials.webhookSecret;
const paymongoPaymentMethodTypes = (process.env.PAYMONGO_PAYMENT_METHOD_TYPES || "card")
  .split(",")
  .map((method) => method.trim())
  .filter(Boolean);
const turnstileSecretKey = process.env.TURNSTILE_SECRET_KEY || "";
const notificationCooldownMinutes = Number(process.env.NOTIFICATION_COOLDOWN_MINUTES || 30);
const queueRecoveryGraceMinutes = Number(process.env.QUEUE_RECOVERY_GRACE_MINUTES || 30);
const b2S3Endpoint = process.env.B2_S3_ENDPOINT || "";
const b2Region = process.env.B2_REGION || "us-east-005";
const b2BucketPublicBoard = process.env.B2_BUCKET_PUBLIC_BOARD || "";
const b2BucketPaymentProof = process.env.B2_BUCKET_PAYMENT_PROOF || "";
const b2KeyId = process.env.B2_KEY_ID || "";
const b2ApplicationKey = process.env.B2_APPLICATION_KEY || "";
const b2PublicBaseUrl = process.env.B2_PUBLIC_BASE_URL || "";
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@getprio.local";
const fcmProjectId = process.env.FCM_PROJECT_ID || "";
const fcmClientEmail = process.env.FCM_CLIENT_EMAIL || "";
const fcmPrivateKey = (process.env.FCM_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const fcmSandboxProjectId = process.env.FCM_SANDBOX_PROJECT_ID || "";
const fcmSandboxClientEmail = process.env.FCM_SANDBOX_CLIENT_EMAIL || "";
const fcmSandboxPrivateKey = (process.env.FCM_SANDBOX_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const rolloutCohort = process.env.ROLLOUT_COHORT || "off";
const csrfSecret = process.env.CSRF_SECRET || jwtSecret;
const authCookieSecure = process.env.AUTH_COOKIE_SECURE
  ? process.env.AUTH_COOKIE_SECURE === "true"
  : nodeEnv === "production";
const authBearerCompatibilityEnabled = process.env.AUTH_BEARER_COMPATIBILITY_ENABLED !== "false";
const sessionInactivityMinutes = Number(process.env.SESSION_INACTIVITY_MINUTES || 10080);
const developerSessionNoExpiry = nodeEnv !== "production" && process.env.DEVELOPER_SESSION_NO_EXPIRY === "true";
const developerSessionNoExpiryDays = Number(process.env.DEVELOPER_SESSION_NO_EXPIRY_DAYS || 3650);
const mfaEncryptionSecret = process.env.MFA_ENCRYPTION_SECRET || jwtSecret;
const mfaRecoveryPepper = process.env.MFA_RECOVERY_PEPPER || jwtSecret;
const developerApiKeyPepper = process.env.DEVELOPER_API_KEY_PEPPER || jwtSecret;
const developerApiReadRateLimitPerMinute = Number(process.env.DEVELOPER_API_READ_RATE_LIMIT_PER_MINUTE || 600);
const developerApiWriteRateLimitPerMinute = Number(process.env.DEVELOPER_API_WRITE_RATE_LIMIT_PER_MINUTE || 120);
const developerWebhookConfig = resolveDeveloperWebhookConfig(process.env, nodeEnv);

const env = {
  nodeEnv,
  port,
  databaseUrl,
  databaseSsl,
  databaseSslCa,
  databaseSslCaFile,
  jwtSecret,
  serverUrl,
  clientUrl,
  appBaseUrl,
  emailAssetBaseUrl,
  mobileQrBaseUrl,
  mobilePaymentReturnUrl,
  platformDashboardUrl,
  developerPortalUrl,
  sandboxTestFlightPublicUrl,
  sandboxAndroidPackageName,
  sandboxAndroidGooglePlayPublicUrl,
  appTimezone,
  oauthCallbackPath,
  oauthStateTtlMinutes,
  accessTokenTtlMinutes,
  refreshTokenTtlDaysCustomer,
  refreshTokenTtlDaysVendorStaff,
  refreshTokenTtlDaysVendorAdmin,
  refreshTokenTtlDaysPlatformAdmin,
  loginLockoutThreshold,
  loginLockoutWindowMinutes,
  loginLockoutDurationMinutes,
  passwordResetTtlMinutes,
  googleClientId,
  googleClientSecret,
  facebookAppId,
  facebookAppSecret,
  appleClientId,
  appleTeamId,
  appleKeyId,
  applePrivateKey,
  smtpHost,
  smtpPort,
  smtpSecure,
  smtpUser,
  smtpPass,
  resendApiKey,
  resendFromEmail,
  resendFromName,
  resendApiUrl,
  sendgridApiKey,
  sendgridFromEmail,
  sendgridFromName,
  sendgridApiUrl,
  smsAccountSid,
  smsAuthToken,
  smsFromNumber,
  paymongoMode,
  paymongoSecretKey,
  paymongoApiUrl,
  paymongoWebhookSecret,
  paymongoPaymentMethodTypes,
  turnstileSecretKey,
  notificationCooldownMinutes,
  queueRecoveryGraceMinutes,
  b2S3Endpoint,
  b2Region,
  b2BucketPublicBoard,
  b2BucketPaymentProof,
  b2KeyId,
  b2ApplicationKey,
  b2PublicBaseUrl,
  vapidPublicKey,
  vapidPrivateKey,
  vapidSubject,
  fcmProjectId,
  fcmClientEmail,
  fcmPrivateKey,
  fcmSandboxProjectId,
  fcmSandboxClientEmail,
  fcmSandboxPrivateKey,
  rolloutCohort,
  csrfSecret,
  authCookieSecure,
  authBearerCompatibilityEnabled,
  sessionInactivityMinutes,
  developerSessionNoExpiry,
  developerSessionNoExpiryDays,
  mfaEncryptionSecret,
  mfaRecoveryPepper,
  developerApiKeyPepper,
  developerApiReadRateLimitPerMinute,
  developerApiWriteRateLimitPerMinute,
  ...developerWebhookConfig
};

module.exports = env;
module.exports.default = env;
module.exports.resolvePaymongoMode = resolvePaymongoMode;
module.exports.resolvePaymongoCredentials = resolvePaymongoCredentials;
module.exports.resolveMobileQrBaseUrl = resolveMobileQrBaseUrl;
module.exports.resolveSandboxTestFlightPublicUrl = resolveSandboxTestFlightPublicUrl;
module.exports.resolveSandboxAndroidGooglePlayPublicUrl = resolveSandboxAndroidGooglePlayPublicUrl;
