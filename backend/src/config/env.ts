import path from "path";
import dotenv from "dotenv";

const rootEnvPath = path.resolve(__dirname, "../../../.env");
dotenv.config({ path: rootEnvPath });

const backendEnvPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: backendEnvPath, override: false });

export const port = Number(process.env.PORT || process.env.BACKEND_PORT || 5000);
const frontendPort = Number(process.env.FRONTEND_PORT || 5173);

export const nodeEnv = process.env.NODE_ENV || "development";
export const databaseUrl =
  process.env.DATABASE_URL || "postgresql://prio:prio@127.0.0.1:5432/prio_queue";
export const databaseSsl = process.env.DATABASE_SSL === "true";
export const jwtSecret = process.env.JWT_SECRET || "change-me";
export const serverUrl = process.env.SERVER_URL || `http://localhost:${port}`;
export const clientUrl = process.env.CLIENT_URL || `http://localhost:${frontendPort}`;
export const appBaseUrl = process.env.APP_BASE_URL || `http://localhost:${frontendPort}`;
export const oauthCallbackPath = process.env.OAUTH_CALLBACK_PATH || "/oauth/callback";
export const oauthStateTtlMinutes = Number(process.env.OAUTH_STATE_TTL_MINUTES || 10);
export const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
export const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
export const facebookAppId = process.env.FACEBOOK_APP_ID || "";
export const facebookAppSecret = process.env.FACEBOOK_APP_SECRET || "";
export const smtpHost = process.env.SMTP_HOST || "";
export const smtpPort = Number(process.env.SMTP_PORT || 587);
export const smtpSecure = process.env.SMTP_SECURE === "true";
export const smtpUser = process.env.SMTP_USER || "";
export const smtpPass = process.env.SMTP_PASS || "";
export const smsAccountSid = process.env.TWILIO_ACCOUNT_SID || "";
export const smsAuthToken = process.env.TWILIO_AUTH_TOKEN || "";
export const smsFromNumber = process.env.TWILIO_FROM_NUMBER || "";
export const notificationCooldownMinutes = Number(
  process.env.NOTIFICATION_COOLDOWN_MINUTES || 30
);

const env = {
  nodeEnv,
  port,
  databaseUrl,
  databaseSsl,
  jwtSecret,
  serverUrl,
  clientUrl,
  appBaseUrl,
  oauthCallbackPath,
  oauthStateTtlMinutes,
  googleClientId,
  googleClientSecret,
  facebookAppId,
  facebookAppSecret,
  smtpHost,
  smtpPort,
  smtpSecure,
  smtpUser,
  smtpPass,
  smsAccountSid,
  smsAuthToken,
  smsFromNumber,
  notificationCooldownMinutes
};

export default env;
