const crypto = require("node:crypto");
const env = require("../config/env");
const { parseCookies, serializeCookie } = require("./browserSessionService");
const { localBrowserCookiePrefix } = require("./localBrowserCookieProfile");
const providers = new Set(["google", "facebook", "apple"]);

function cookieOptions(provider) {
  if (!providers.has(provider)) throw new Error("Unsupported OAuth provider.");
  const secure = env.authCookieSecure !== false;
  // Apple uses a cross-site form POST. SameSite=None requires HTTPS; do not
  // weaken this cookie to make an insecure local Apple callback appear to work.
  if (provider === "apple" && !secure) throw new Error("Apple browser sign-in requires a secure HTTPS API.");
  return { httpOnly: true, secure, sameSite: provider === "apple" ? "None" : "Lax", maxAge: Math.max(60, Math.min(900, Number(env.oauthStateTtlMinutes || 10) * 60)) };
}
function cookieName(provider) {
  return `${env.authCookieSecure !== false ? "__Host-" : localBrowserCookiePrefix()}prio_oauth_${provider}`;
}
function append(res, value) { res.append("Set-Cookie", value); }
function issueBrowserOAuthBinding(res, provider) {
  const options = cookieOptions(provider);
  const nonce = crypto.randomBytes(32).toString("hex");
  append(res, serializeCookie(cookieName(provider), nonce, options));
  return crypto.createHash("sha256").update(nonce).digest("hex");
}
function clearBrowserOAuthBinding(res, provider) {
  if (!providers.has(provider)) return;
  // Clearing an insecure-local Apple attempt need not mint a usable cookie.
  const secure = env.authCookieSecure !== false;
  append(res, serializeCookie(cookieName(provider), "", { httpOnly: true, secure, sameSite: provider === "apple" && secure ? "None" : "Lax", maxAge: 0 }));
}
function consumeBrowserOAuthBinding(req, res, provider, state) {
  const nonce = parseCookies(req.headers?.cookie)[cookieName(provider)];
  clearBrowserOAuthBinding(res, provider);
  const binding = state?.browserBinding;
  if (!/^[a-f0-9]{64}$/.test(nonce || "") || !/^[a-f0-9]{64}$/.test(binding || "")) throw new Error("Sign-in must finish in the browser where it started. Please try again.");
  const expected = crypto.createHash("sha256").update(nonce).digest();
  const actual = Buffer.from(binding, "hex");
  if (!crypto.timingSafeEqual(expected, actual)) throw new Error("Sign-in must finish in the browser where it started. Please try again.");
}
module.exports = { issueBrowserOAuthBinding, consumeBrowserOAuthBinding, clearBrowserOAuthBinding };
