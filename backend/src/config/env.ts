import path from "path";
import dotenv from "dotenv";

const rootEnvPath = path.resolve(__dirname, "../../../.env");
dotenv.config({ path: rootEnvPath });

const backendEnvPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: backendEnvPath, override: false });

export const port = Number(process.env.PORT || process.env.BACKEND_PORT || 5001);
const frontendPort = Number(process.env.FRONTEND_PORT || 5173);
const platformDashboardPort = Number(process.env.PLATFORM_DASHBOARD_PORT || 7100);

export const nodeEnv = process.env.NODE_ENV || "development";
export const databaseUrl =
  process.env.DATABASE_URL || "postgresql://prio:prio@127.0.0.1:5432/prio_queue";
export const databaseSsl = process.env.DATABASE_SSL === "true";
export const jwtSecret = process.env.JWT_SECRET || "change-me";
export const serverUrl = process.env.SERVER_URL || `http://localhost:${port}`;
export const clientUrl = process.env.CLIENT_URL || `http://localhost:${frontendPort}`;
export const appBaseUrl = process.env.APP_BASE_URL || `http://localhost:${frontendPort}`;
export const platformDashboardUrl =
  process.env.PLATFORM_DASHBOARD_URL || `http://localhost:${platformDashboardPort}`;
export const appTimezone = process.env.APP_TIMEZONE || "Asia/Manila";
export const oauthCallbackPath = process.env.OAUTH_CALLBACK_PATH || "/oauth/callback";
export const oauthStateTtlMinutes = Number(process.env.OAUTH_STATE_TTL_MINUTES || 10);
export const accessTokenTtlMinutes = Number(process.env.ACCESS_TOKEN_TTL_MINUTES || 15);
export const refreshTokenTtlDaysCustomer = Number(
  process.env.REFRESH_TOKEN_TTL_DAYS_CUSTOMER || 30
);
export const refreshTokenTtlDaysVendorStaff = Number(
  process.env.REFRESH_TOKEN_TTL_DAYS_VENDOR_STAFF || 14
);
export const refreshTokenTtlDaysVendorAdmin = Number(
  process.env.REFRESH_TOKEN_TTL_DAYS_VENDOR_ADMIN || 7
);
export const refreshTokenTtlDaysPlatformAdmin = Number(
  process.env.REFRESH_TOKEN_TTL_DAYS_PLATFORM_ADMIN || 7
);
export const loginLockoutThreshold = Number(process.env.LOGIN_LOCKOUT_THRESHOLD || 5);
export const loginLockoutWindowMinutes = Number(
  process.env.LOGIN_LOCKOUT_WINDOW_MINUTES || 15
);
export const loginLockoutDurationMinutes = Number(
  process.env.LOGIN_LOCKOUT_DURATION_MINUTES || 15
);
export const passwordResetTtlMinutes = Number(process.env.PASSWORD_RESET_TTL_MINUTES || 30);
export const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
export const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
export const facebookAppId = process.env.FACEBOOK_APP_ID || "";
export const facebookAppSecret = process.env.FACEBOOK_APP_SECRET || "";
export const smtpHost = process.env.SMTP_HOST || "";
export const smtpPort = Number(process.env.SMTP_PORT || 587);
export const smtpSecure = process.env.SMTP_SECURE === "true";
export const smtpUser = process.env.SMTP_USER || "";
export const smtpPass = process.env.SMTP_PASS || "";
export const resendApiKey = process.env.RESEND_API_KEY || "";
export const resendFromEmail = process.env.RESEND_FROM_EMAIL || "";
export const resendFromName = process.env.RESEND_FROM_NAME || "GetPrio";
export const resendApiUrl = process.env.RESEND_API_URL || "https://api.resend.com/emails";
export const sendgridApiKey = process.env.SENDGRID_API_KEY || "";
export const sendgridFromEmail = process.env.SENDGRID_FROM_EMAIL || "";
export const sendgridFromName = process.env.SENDGRID_FROM_NAME || "GetPrio";
export const sendgridApiUrl =
  process.env.SENDGRID_API_URL || "https://api.sendgrid.com/v3/mail/send";
export const smsAccountSid = process.env.TWILIO_ACCOUNT_SID || "";
export const smsAuthToken = process.env.TWILIO_AUTH_TOKEN || "";
export const smsFromNumber = process.env.TWILIO_FROM_NUMBER || "";
export const paymongoSecretKey = process.env.PAYMONGO_SECRET_KEY || "";
export const paymongoApiUrl = process.env.PAYMONGO_API_URL || "https://api.paymongo.com/v1";
export const paymongoWebhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET || "";
export const paymongoPaymentMethodTypes = (
  process.env.PAYMONGO_PAYMENT_METHOD_TYPES || "card"
)
  .split(",")
  .map((method) => method.trim())
  .filter(Boolean);
export const turnstileSecretKey = process.env.TURNSTILE_SECRET_KEY || "";
export const notificationCooldownMinutes = Number(
  process.env.NOTIFICATION_COOLDOWN_MINUTES || 30
);
export const queueRecoveryGraceMinutes = Number(
  process.env.QUEUE_RECOVERY_GRACE_MINUTES || 30
);
export const b2S3Endpoint = process.env.B2_S3_ENDPOINT || "";
export const b2Region = process.env.B2_REGION || "us-east-005";
export const b2BucketPublicBoard = process.env.B2_BUCKET_PUBLIC_BOARD || "";
export const b2BucketPaymentProof = process.env.B2_BUCKET_PAYMENT_PROOF || "";
export const b2KeyId = process.env.B2_KEY_ID || "";
export const b2ApplicationKey = process.env.B2_APPLICATION_KEY || "";
export const b2PublicBaseUrl = process.env.B2_PUBLIC_BASE_URL || "";

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
  b2PublicBaseUrl
};

export default env;
