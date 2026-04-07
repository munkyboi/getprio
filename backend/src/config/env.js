const path = require("path");
const dotenv = require("dotenv");

const rootEnvPath = path.resolve(__dirname, "../../../.env");
dotenv.config({ path: rootEnvPath });

const backendEnvPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: backendEnvPath, override: false });

const port = Number(process.env.PORT || process.env.BACKEND_PORT || 5000);
const frontendPort = Number(process.env.FRONTEND_PORT || 5173);

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port,
  databaseUrl: process.env.DATABASE_URL || "postgresql://prio:prio@127.0.0.1:5432/prio_queue",
  databaseSsl: process.env.DATABASE_SSL === "true",
  jwtSecret: process.env.JWT_SECRET || "change-me",
  serverUrl: process.env.SERVER_URL || `http://localhost:${port}`,
  clientUrl: process.env.CLIENT_URL || `http://localhost:${frontendPort}`,
  appBaseUrl: process.env.APP_BASE_URL || `http://localhost:${frontendPort}`,
  oauthCallbackPath: process.env.OAUTH_CALLBACK_PATH || "/oauth/callback",
  oauthStateTtlMinutes: Number(process.env.OAUTH_STATE_TTL_MINUTES || 10),
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  facebookAppId: process.env.FACEBOOK_APP_ID || "",
  facebookAppSecret: process.env.FACEBOOK_APP_SECRET || "",
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  smsAccountSid: process.env.TWILIO_ACCOUNT_SID || "",
  smsAuthToken: process.env.TWILIO_AUTH_TOKEN || "",
  smsFromNumber: process.env.TWILIO_FROM_NUMBER || "",
  notificationCooldownMinutes: Number(process.env.NOTIFICATION_COOLDOWN_MINUTES || 30)
};
