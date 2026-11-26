/* global process */
export function assertLocalDemoProvidersEmpty(effective, source = process.env, options = {}) {
const providerKeys = ['googleClientId','googleClientSecret','facebookAppId','facebookAppSecret','appleClientId','appleTeamId','appleKeyId','applePrivateKey','resendApiKey','sendgridApiKey','smtpHost','smtpUser','smtpPass','smsAccountSid','smsAuthToken','b2KeyId','b2ApplicationKey','b2S3Endpoint','b2BucketPublicBoard','b2BucketPaymentProof','b2PublicBaseUrl','paymongoSecretKey','vapidPrivateKey','fcmPrivateKey','fcmSandboxPrivateKey'];
const providerEnvironmentKeys = ['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','FACEBOOK_APP_ID','FACEBOOK_APP_SECRET','APPLE_CLIENT_ID','APPLE_TEAM_ID','APPLE_KEY_ID','APPLE_PRIVATE_KEY','RESEND_API_KEY','SENDGRID_API_KEY','SMTP_HOST','SMTP_USER','SMTP_PASS',
  'TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_FROM_NUMBER','FCM_PROJECT_ID','FCM_CLIENT_EMAIL',
  'FCM_PRIVATE_KEY','FCM_SANDBOX_PROJECT_ID','FCM_SANDBOX_CLIENT_EMAIL','FCM_SANDBOX_PRIVATE_KEY',
  'PAYMONGO_SECRET_KEY','PAYMONGO_SANDBOX_SECRET_KEY','PAYMONGO_LIVE_SECRET_KEY',
  'PAYMONGO_WEBHOOK_SECRET','PAYMONGO_SANDBOX_WEBHOOK_SECRET','PAYMONGO_LIVE_WEBHOOK_SECRET',
  'VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','B2_KEY_ID','B2_APPLICATION_KEY','B2_S3_ENDPOINT','B2_BUCKET_PUBLIC_BOARD','B2_BUCKET_PAYMENT_PROOF','B2_PUBLIC_BASE_URL'];
const mailKeys = new Set(['resendApiKey', 'smtpHost', 'smtpUser', 'smtpPass', 'RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'RESEND_FROM_NAME', 'RESEND_API_URL', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_PORT', 'SMTP_SECURE']);
const configuredProviderKeys = providerKeys.filter(key => Boolean(effective[key]) && !(options.allowMailTransport && mailKeys.has(key)));
const configuredProviderEnvironmentKeys = providerEnvironmentKeys.filter(key => Boolean(source[key]) && !(options.allowMailTransport && mailKeys.has(key)));
if (configuredProviderKeys.length || configuredProviderEnvironmentKeys.length) {
  throw new Error('Provider credentials must be empty in the local demo.');
}
if (options.allowMailTransport && (source.RESEND_API_KEY || source.RESEND_FROM_EMAIL || source.RESEND_API_URL || effective.resendApiKey || effective.resendFromEmail || effective.resendApiUrl || source.SMTP_HOST || source.SMTP_USER || source.SMTP_PASS || effective.smtpHost || effective.smtpUser || effective.smtpPass)) {
  const apiKey = source.RESEND_API_KEY || effective.resendApiKey;
  const fromEmail = source.RESEND_FROM_EMAIL || effective.resendFromEmail;
  const apiUrl = source.RESEND_API_URL || effective.resendApiUrl || 'https://api.resend.com/emails';
  let parsed;
  try { parsed = new URL(apiUrl); } catch { throw new Error('Local mail transport URL is invalid.'); }
  if (!apiKey || fromEmail !== 'hello@getprio.online' || parsed.protocol !== 'https:' || parsed.hostname !== 'api.resend.com' || parsed.pathname !== '/emails') {
    throw new Error('Local mail transport must use the approved Resend endpoint and sender.');
  }
  if (source.SMTP_HOST || source.SMTP_USER || source.SMTP_PASS || effective.smtpHost || effective.smtpUser || effective.smtpPass) {
    throw new Error('Local mail transport cannot mix SMTP and Resend credentials.');
  }
}
}
