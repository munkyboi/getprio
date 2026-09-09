const env = require("../config/env");

const BRAND = Object.freeze({
  accent: "#FD8501", supportingAccent: "#EA6A1F", background: "#FFFAF4",
  ink: "#282729", text: "#3F3027", muted: "#75685E", paper: "#FFFFFF", border: "#EADCCF"
});
const ILLUSTRATIONS = new Set(["welcome", "account-verification", "booking-confirmation", "queue-update", "reminder"]);

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

function appUrl(path = "") {
  return safeUrl(`${String(env.appBaseUrl || "https://getprio.online").replace(/\/$/, "")}${path}`);
}

function link(label, url) {
  const href = safeUrl(url);
  return href ? `<a href="${escapeHtml(href)}" style="color:${BRAND.text};text-decoration:underline;overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(label)}</a>` : escapeHtml(label);
}

function paragraphs(message) {
  const items = Array.isArray(message) ? message : String(message || "").split(/\n\s*\n/);
  return items.filter(Boolean).map((item) => {
    const content = Array.isArray(item)
      ? item.map((part) => typeof part === "string" ? escapeHtml(part) : link(part.text, part.url)).join("")
      : escapeHtml(item);
    return `<p style="margin:0 0 16px;">${content.replaceAll("\n", "<br>")}</p>`;
  }).join("");
}

function messageText(message) {
  return (Array.isArray(message) ? message : [message]).map((item) => Array.isArray(item)
    ? item.map((part) => typeof part === "string" ? part : `${part.text}${safeUrl(part.url) ? ` (${safeUrl(part.url)})` : ""}`).join("")
    : item);
}

function section(content) {
  return content ? `<tr><td class="email-content" style="padding:0 24px 24px;overflow-wrap:anywhere;word-break:break-word;">${content}</td></tr>` : "";
}

function detailsPanel(details) {
  const rows = details.filter(({ value }) => value !== undefined && value !== null && value !== "");
  if (!rows.length) return "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.background};border:1px solid ${BRAND.border};border-radius:16px;padding:16px 20px;">${rows.map(({ label, value }) => `<tr>
    <td class="detail-label" style="display:block;padding:6px 0 2px;color:${BRAND.muted};font-size:13px;vertical-align:top;">${escapeHtml(label)}</td>
    <td class="detail-value" style="display:block;padding:0 0 8px;font-size:14px;font-weight:700;vertical-align:top;overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(value)}</td>
  </tr>`).join("")}</table>`;
}

function illustrationImage(illustration, hero) {
  if (!ILLUSTRATIONS.has(illustration)) return "";
  const variant = hero ? "hero" : "compact";
  const width = hero ? 504 : 132;
  return `<img src="${escapeHtml(appUrl(`/email/v1/getprio-${illustration}-${variant}.png`))}" alt="" width="${width}" style="display:block;border:0;width:${hero ? "100%" : "132px"};max-width:100%;height:auto;border-radius:${hero ? 20 : 0}px;">`;
}

function codePanel(code, expiryText) {
  if (!code) return "";
  return `<div style="background:${BRAND.background};border:1px solid ${BRAND.border};border-radius:16px;padding:20px;text-align:center;">
    <div style="font-size:11px;font-weight:700;color:${BRAND.muted};letter-spacing:1px;">VERIFICATION CODE</div>
    <div style="font-size:40px;line-height:1.5;font-weight:700;color:${BRAND.ink};letter-spacing:3px;">${escapeHtml(code)}</div>
    ${expiryText ? `<div style="font-size:13px;color:${BRAND.muted};">${escapeHtml(expiryText)}</div>` : ""}
  </div>`;
}

function queuePanel(queue) {
  if (!queue?.number) return "";
  return `<div style="background:${BRAND.background};border:1px solid ${BRAND.border};border-radius:16px;padding:20px;">
    <div style="font-size:11px;font-weight:700;color:${BRAND.muted};letter-spacing:1px;">YOUR QUEUE NUMBER</div>
    <div style="font-size:52px;line-height:1.4;font-weight:700;color:${BRAND.ink};">${escapeHtml(queue.number)}</div>
    ${queue.status ? `<span style="display:inline-block;background:${BRAND.accent};color:${BRAND.ink};border-radius:20px;padding:4px 14px;font-size:13px;font-weight:700;">${escapeHtml(queue.status)}</span>` : ""}
  </div>`;
}

function actionButton(label, url) {
  const href = safeUrl(url);
  if (!href || !label) return "";
  // Table-backed button keeps its fill and full-width hit area in Outlook too.
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="${BRAND.ink}" style="border-radius:999px;mso-padding-alt:16px 24px;">
    <a href="${escapeHtml(href)}" style="display:block;padding:16px 24px;border-radius:999px;background:${BRAND.ink};color:${BRAND.paper};font-size:16px;line-height:22px;font-weight:700;text-decoration:none;text-align:center;">${escapeHtml(label)}</a>
  </td></tr></table>`;
}

function attachmentImage(attachment) {
  const url = safeUrl(attachment?.url);
  return url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(attachment.alt || "Attached screenshot")}" width="504" style="display:block;width:100%;max-width:504px;height:auto;border:1px solid ${BRAND.border};border-radius:16px;">` : "";
}

function plainText(options) {
  const { title, subtitle, greeting, message, details, code, expiryText, queue, actionUrl, actionLabel, secondaryUrl, secondaryLabel, footer, preferencesUrl, unsubscribeUrl } = options;
  return [title, subtitle, greeting, ...messageText(message),
    ...details.filter(({ value }) => value !== undefined && value !== null && value !== "").map(({ label, value }) => `${label}: ${value}`),
    code && `Verification code: ${code}`, code && expiryText,
    queue?.number && `Ticket number: ${queue.number}`, queue?.status && `Current status: ${queue.status}`,
    safeUrl(actionUrl) && `${actionLabel}: ${safeUrl(actionUrl)}`,
    safeUrl(secondaryUrl) && `${secondaryLabel}: ${safeUrl(secondaryUrl)}`, footer,
    "The GetPrio Team", `Contact support: ${appUrl("/contact")}`, appUrl(),
    safeUrl(preferencesUrl) && `Email preferences: ${safeUrl(preferencesUrl)}`,
    safeUrl(unsubscribeUrl) && `Unsubscribe: ${safeUrl(unsubscribeUrl)}`
  ].filter((value) => value !== undefined && value !== null && value !== false && value !== "").join("\n\n");
}

function createBrandedEmail(input) {
  const options = { title: input.subject, details: [], actionLabel: "Open GetPrio", ...input };
  const { subject, title, subtitle, preheader, eyebrow, greeting, message, details, illustration, hero = false,
    code, expiryText, queue, actionLabel, actionUrl, secondaryLabel, secondaryUrl, footer, preferencesUrl, unsubscribeUrl } = options;
  const body = [
    section(`${eyebrow ? `<p style="margin:0 0 8px;font-size:12px;font-weight:700;color:${BRAND.muted};">${escapeHtml(eyebrow)}</p>` : ""}<h1 style="margin:0;font-size:28px;line-height:1.22;color:${BRAND.ink};font-weight:700;">${escapeHtml(title)}</h1>${subtitle ? `<p style="margin:12px 0 0;">${escapeHtml(subtitle)}</p>` : ""}`),
    section(illustrationImage(illustration, hero)),
    section(`${greeting ? `<p style="margin:0 0 16px;font-weight:700;">${escapeHtml(greeting)}</p>` : ""}${paragraphs(message)}`),
    section(detailsPanel(details)), section(codePanel(code, expiryText)), section(queuePanel(queue)), section(attachmentImage(options.attachment)),
    section(actionButton(actionLabel, actionUrl)),
    section(secondaryLabel && safeUrl(secondaryUrl) ? `<p style="margin:0;text-align:center;font-size:14px;font-weight:700;">${link(secondaryLabel, secondaryUrl)}</p>` : ""),
    section(`${footer ? `<p style="margin:0 0 24px;font-size:13px;color:${BRAND.muted};">${escapeHtml(footer)}</p>` : ""}<p style="margin:0;">See you soon,<br><strong>The GetPrio Team</strong></p>`),
    section(`<div style="border-top:1px solid ${BRAND.border};padding-top:24px;text-align:center;font-size:12px;color:${BRAND.muted};">
      ${link("Contact support", appUrl("/contact"))} &nbsp; ${link("getprio.online", appUrl())}<br>
      © ${new Date().getFullYear()} GetPrio. All rights reserved.
      ${safeUrl(preferencesUrl) ? `<br>${link("Email preferences", preferencesUrl)}` : ""}
      ${safeUrl(unsubscribeUrl) ? `<br>${link("Unsubscribe", unsubscribeUrl)}` : ""}</div>`)
  ].join("");
  return { subject, text: plainText(options), html: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>@media screen and (min-width:600px){.email-content{padding-left:48px!important;padding-right:48px!important}.email-content h1{font-size:32px!important}.detail-label,.detail-value{display:table-cell!important;padding:7px 0!important}.detail-label{width:34%;padding-right:16px!important}}</style>
</head><body style="margin:0;padding:0;background:${BRAND.background};color:${BRAND.text};font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:25px;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BRAND.background}"><tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BRAND.paper}" style="max-width:600px;border-radius:20px;border-collapse:separate;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:25px;color:${BRAND.text};">
<tr><td align="center" style="padding:32px 24px 40px;"><img src="${escapeHtml(appUrl("/email/v1/getprio-logo.png?rev=20260909"))}" width="80" height="60" alt="GetPrio" style="display:block;border:0;width:80px;height:60px;"></td></tr>
${body}</table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>` };
}

module.exports = { BRAND, appUrl, createBrandedEmail };
