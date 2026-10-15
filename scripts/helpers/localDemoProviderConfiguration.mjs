/* global process */
export function assertLocalDemoProvidersEmpty(effective, source = process.env) {
const providerKeys = ['resendApiKey','sendgridApiKey','smtpHost','smtpUser','smtpPass','smsAccountSid','smsAuthToken','b2KeyId','b2ApplicationKey','paymongoSecretKey','vapidPrivateKey','fcmPrivateKey','fcmSandboxPrivateKey'];
const providerEnvironmentKeys = ['RESEND_API_KEY','SENDGRID_API_KEY','SMTP_HOST','SMTP_USER','SMTP_PASS',
  'TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_FROM_NUMBER','FCM_PROJECT_ID','FCM_CLIENT_EMAIL',
  'FCM_PRIVATE_KEY','FCM_SANDBOX_PROJECT_ID','FCM_SANDBOX_CLIENT_EMAIL','FCM_SANDBOX_PRIVATE_KEY',
  'PAYMONGO_SECRET_KEY','PAYMONGO_SANDBOX_SECRET_KEY','PAYMONGO_LIVE_SECRET_KEY',
  'PAYMONGO_WEBHOOK_SECRET','PAYMONGO_SANDBOX_WEBHOOK_SECRET','PAYMONGO_LIVE_WEBHOOK_SECRET',
  'VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','B2_KEY_ID','B2_APPLICATION_KEY'];
if (providerKeys.some(key => Boolean(effective[key])) || providerEnvironmentKeys.some(key => Boolean(source[key]))) {
  throw new Error('Provider credentials must be empty in the local demo.');
}
}
