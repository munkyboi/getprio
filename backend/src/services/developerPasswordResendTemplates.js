const { createBrandedEmail } = require("./emailTemplates");

const alias = "getprio-developer-password-reset";
const marker = (key) => `GPVAR_${key}_END`;

function templateContent() {
  const actionMarker = marker("ACTION_URL");
  const expiryMarker = marker("EXPIRY_TEXT");
  const content = createBrandedEmail({
    subject: "Reset your GetPrio Developer Portal password",
    title: "Reset your password",
    subtitle: "Use the button below to choose a new Developer Portal password.",
    message: `We received a request to reset your GetPrio Developer Portal password. This link expires at ${expiryMarker}.`,
    illustration: "account-verification",
    actionLabel: "Reset Developer Portal password",
    actionUrl: `https://getprio.online/${actionMarker}`,
    footer: "If you did not request this, you can ignore this email."
  });

  for (const field of ["html", "text", "subject"]) {
    content[field] = content[field]
      .replaceAll(`https://getprio.online/${actionMarker}`, `{{{ACTION_URL}}}`)
      .replaceAll(expiryMarker, "{{{EXPIRY_TEXT}}}");
  }

  return {
    ...content,
    variables: [
      { key: "ACTION_URL", type: "string" },
      { key: "EXPIRY_TEXT", type: "string" }
    ]
  };
}

function buildTemplateEmail({ resetUrl, expiresAt }) {
  const actionUrl = String(resetUrl || "").trim();
  const expiryText = new Date(expiresAt).toISOString();
  if (!/^https?:\/\//.test(actionUrl) || actionUrl.length > 2000) {
    throw new Error("Invalid developer password reset URL.");
  }
  if (!Number.isFinite(new Date(expiresAt).getTime())) {
    throw new Error("Invalid developer password reset expiry.");
  }

  const subject = "Reset your GetPrio Developer Portal password";
  const fallback = createBrandedEmail({
    subject,
    title: "Reset your password",
    subtitle: "Use the button below to choose a new Developer Portal password.",
    message: `We received a request to reset your GetPrio Developer Portal password. This link expires at ${expiryText}.`,
    illustration: "account-verification",
    actionLabel: "Reset Developer Portal password",
    actionUrl,
    footer: "If you did not request this, you can ignore this email."
  });

  return {
    subject,
    text: fallback.text,
    html: fallback.html,
    resendTemplate: {
      id: alias,
      variables: { ACTION_URL: actionUrl, EXPIRY_TEXT: expiryText }
    }
  };
}

module.exports = { alias, templateContent, buildTemplateEmail };
