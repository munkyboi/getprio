const path = require("path");
const dotenv = require("dotenv");

const rootEnvPath = path.resolve(__dirname, "../../../.env");
dotenv.config({ path: rootEnvPath });

const backendEnvPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: backendEnvPath, override: false });

const port = Number(process.env.PORT || process.env.BACKEND_PORT || 5001);
const frontendPort = Number(process.env.FRONTEND_PORT || 5173);
const platformDashboardPort = Number(process.env.PLATFORM_DASHBOARD_PORT || 7100);

const nodeEnv = process.env.NODE_ENV || "development";
const databaseUrl =
  process.env.DATABASE_URL || "postgresql://prio:prio@127.0.0.1:5432/prio_queue";
const databaseSsl = process.env.DATABASE_SSL === "true";
const jwtSecret = process.env.JWT_SECRET || "change-me";
const serverUrl = process.env.SERVER_URL || `http://localhost:${port}`;
const clientUrl = process.env.CLIENT_URL || `http://localhost:${frontendPort}`;
const appBaseUrl = process.env.APP_BASE_URL || `http://localhost:${frontendPort}`;
const platformDashboardUrl =
  process.env.PLATFORM_DASHBOARD_URL || `http://localhost:${platformDashboardPort}`;
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
const paymongoSecretKey = process.env.PAYMONGO_SECRET_KEY || "";
const paymongoApiUrl = process.env.PAYMONGO_API_URL || "https://api.paymongo.com/v1";
const paymongoWebhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET || "";
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

const env = {
  nodeEnv,
  port,
  databaseUrl,
  databaseSsl,
  jwtSecret,
  serverUrl,
  clientUrl,
  appBaseUrl,
  platformDashboardUrl,
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
  vapidSubject
};

module.exports = env;
module.exports.default = env;
