import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import type { AuthLoginResponse, AuthResponse, EmailMfaChallengeResponse, OAuthProvidersResponse, UserSummary } from "@shared";
import { API_BASE_URL, ApiError, publicAuthRequest } from "../api/client";
import { appUrl, safeSurfaceNext } from "../surfaces/surfaceConfig";
import { publicUniversalAuthEnabled } from "../surfaces/PublicAuthRedirect";
import { getErrorMessage } from "../utils/errors";
import { readPublicAuthTheme } from "./publicAuthTheme";
import { usePublicTheme } from "../surfaces/PublicTheme";
import "./universal-auth.css";

export function authDestination(surface: "customer" | "vendor", user: UserSummary, next?: string | null) {
  if (surface === "vendor" && !user.tenants?.some(tenant => tenant.isActive !== false)) return null;
  if (user.mfaRequired && !user.mfaEnabled) {
    return appUrl(surface, surface === "vendor" ? "/dashboard/account" : "/account/security");
  }
  return appUrl(surface, safeSurfaceNext(next, surface));
}

export default function UniversalAuthPage() {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const app = params.get("app") === "customer" ? "customer" : params.get("app") === "vendor" ? "vendor" : !params.has("app") && location.pathname.endsWith("/customer") ? "customer" : "vendor";
  const register = location.pathname.startsWith("/register");
  const [busy, setBusy] = useState(false);
  const commandVersion = useRef(0);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const publicTheme = usePublicTheme();
  const dark = (publicTheme?.theme ?? readPublicAuthTheme()) === "dark";
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [challenge, setChallenge] = useState("");
  const [originalChallenge, setOriginalChallenge] = useState("");
  const [methods, setMethods] = useState<string[]>([]);
  const [emailMethod, setEmailMethod] = useState(false);
  const [recoveryMethod, setRecoveryMethod] = useState(false);
  const [providers, setProviders] = useState<OAuthProvidersResponse["providers"]>({ google: false, facebook: false, apple: false });
  const [identity, setIdentity] = useState<UserSummary | null>(null);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [categoryError, setCategoryError] = useState("");
  const [categoryRetry, setCategoryRetry] = useState(0);
  useEffect(() => {
    if (!publicUniversalAuthEnabled) return;
    const version = commandVersion.current;
    const controller = new AbortController();
    publicAuthRequest<OAuthProvidersResponse>("/auth/oauth/providers", { signal: controller.signal }).then(data => setProviders(data.providers)).catch(() => {});
    publicAuthRequest<{ user: UserSummary }>("/auth/me", { signal: controller.signal }).catch(async failure => {
      if (!(failure instanceof ApiError) || failure.status !== 401 || controller.signal.aborted) throw failure;
      await publicAuthRequest("/auth/csrf", { signal: controller.signal });
      return publicAuthRequest<AuthResponse>("/auth/refresh", { method: "POST", body: {}, signal: controller.signal });
    }).then(data => { if (commandVersion.current === version) setIdentity(data.user); }).catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => { restart(); setRecovery(false); }, [app, register]);
  useEffect(() => {
    if (!publicUniversalAuthEnabled || !register || app !== "vendor") return;
    const controller = new AbortController(); setCategoryError("");
    publicAuthRequest<{ items: Array<{ id: string; name: string }> }>("/public/business-categories", { signal: controller.signal })
      .then(data => setCategories(data.items)).catch(failure => { if (!controller.signal.aborted) setCategoryError(getErrorMessage(failure)); });
    return () => controller.abort();
  }, [app, register, categoryRetry]);
  const next = safeSurfaceNext(params.get("next"), app);
  function finish(user: UserSummary) {
    const destination = authDestination(app, user, next);
    if (!destination) { setIdentity(user); setError("Your account does not have a Vendor workspace. Choose Customer, or contact your business administrator."); return; }
    window.location.replace(destination);
  }
  function choose(surface: "customer" | "vendor") {
    if (busy || challenge) return;
    const updated = new URLSearchParams(params);
    updated.set("app", surface);
    if (surface !== app) updated.delete("next");
    setParams(updated, { replace: true });
  }
  function restart() { setChallenge(""); setOriginalChallenge(""); setMethods([]); setEmailMethod(false); setRecoveryMethod(false); setError(""); setMessage(""); }
  async function sendEmail() {
    setBusy(true); setError("");
    try {
      const data = await publicAuthRequest<EmailMfaChallengeResponse>("/auth/mfa/email/send", { method: "POST", body: { challengeToken: originalChallenge, surface: app } });
      setChallenge(data.token); setEmailMethod(true); setRecoveryMethod(false); setMessage(`Enter the code sent to ${data.deliveryTarget}.`);
    } catch (failure) { setError(getErrorMessage(failure)); } finally { setBusy(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    commandVersion.current += 1;
    setBusy(true); setError(""); setMessage("");
    try {
      if (recovery) {
        const data = await publicAuthRequest<{ message: string }>("/auth/password-reset/request", { method: "POST", body: { email: values.email, surface: app, next } });
        setMessage(data.message); return;
      }
      if (challenge) {
        const data = await publicAuthRequest<AuthResponse>("/auth/mfa/verify", { method: "POST", body: { challengeToken: challenge, surface: app, ...(recoveryMethod ? { recoveryCode: values.code } : { code: values.code }), ...(emailMethod ? { method: "email" } : {}) } });
        finish(data.user); return;
      }
      const data = await publicAuthRequest<AuthLoginResponse>(register ? `/auth/register/${app}` : "/auth/login", { method: "POST", body: { ...values, surface: app } });
      if ("mfaRequired" in data) { setChallenge(data.challengeToken); setOriginalChallenge(data.challengeToken); setMethods(data.methods); return; }
      finish(data.user);
    } catch (failure) { setError(getErrorMessage(failure)); } finally { setBusy(false); }
  }
  if (!publicUniversalAuthEnabled) return <section className="universal-auth"><h1>Sign in to GetPrio</h1><p>Choose your application.</p><a href={appUrl("vendor", "/login")}>Vendor login</a> <a href={appUrl("customer", "/login")}>Customer login</a></section>;
  const title = challenge ? "Verify your sign-in" : recovery ? "Reset your password" : register ? "Create your GetPrio account" : "Welcome back";
  return <section className="universal-auth" data-theme={dark ? "dark" : "light"}>
    <header><p className="universal-auth-eyebrow">One account. Your next destination.</p><h1>{register ? "Start with GetPrio." : "Make room for what matters."}</h1><p>{register ? "Choose how you’ll use GetPrio, then create your account." : "Sign in to your customer account or manage your business."}</p></header>
    <div className="universal-auth-board"><aside><h2>GetPrio</h2><p>Bookings, queues, and your business in one place.</p><Link to="/">Back to home</Link><p>Your account permissions determine which workspaces you can access.</p></aside>
    <div className="universal-auth-card"><h2>{title}</h2>
      <div role="tablist" aria-label="Choose Customer or Vendor" className="universal-auth-tabs" onKeyDown={event => {
        if (!busy && !challenge && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); const selected = event.key === "Home" ? "customer" : event.key === "End" ? "vendor" : app === "customer" ? "vendor" : "customer"; choose(selected); document.getElementById(`auth-tab-${selected}`)?.focus(); }
      }}>{(["customer", "vendor"] as const).map(surface => <button id={`auth-tab-${surface}`} key={surface} type="button" role="tab" tabIndex={app === surface ? 0 : -1} aria-selected={app === surface} aria-controls="auth-panel" disabled={busy || !!challenge} onClick={() => choose(surface)}>{surface === "customer" ? "Customer" : "Vendor"}</button>)}</div>
      <p className="universal-auth-intent">{app === "vendor" ? "Continue to your Vendor workspace" : "Continue to your Customer dashboard"}</p>
      <div id="auth-panel" role="tabpanel" aria-labelledby={`auth-tab-${app}`}>
      {identity && !register && !challenge && !recovery ? <div className="universal-auth-session"><p>Signed in as {identity.name}.</p><button type="button" disabled={busy} onClick={() => finish(identity)}>Continue to {app === "vendor" ? "Vendor" : "Customer"}</button><button type="button" disabled={busy} onClick={async () => { commandVersion.current += 1; setBusy(true); try { await publicAuthRequest("/auth/logout", { method: "POST", body: {} }); setIdentity(null); setError(""); } catch (failure) { setError(getErrorMessage(failure)); } finally { setBusy(false); } }}>Use another account</button><p>Signing out also ends this shared session in your other GetPrio apps.</p></div> : <form onSubmit={submit} aria-busy={busy}>
      <fieldset disabled={busy}><legend className="universal-auth-sr">{title}</legend>
        {challenge ? <><label htmlFor="auth-code">{recoveryMethod ? "Recovery code" : emailMethod ? "Email code" : "Authenticator code"}</label><input key={`${emailMethod}-${recoveryMethod}`} id="auth-code" name="code" autoComplete={recoveryMethod ? "off" : "one-time-code"} inputMode={recoveryMethod ? "text" : "numeric"} required autoFocus /></> : recovery ? <><label htmlFor="auth-email">Account email</label><input id="auth-email" name="email" type="email" autoComplete="email" required /></> : <>
          {register && <><label htmlFor="auth-name">Your name</label><input id="auth-name" name="name" autoComplete="name" minLength={2} required /><label htmlFor="auth-username">Username</label><input id="auth-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} pattern="[a-z0-9_]{3,30}" title="3–30 lowercase letters, numbers, or underscores" required /><label htmlFor="auth-email">Email</label><input id="auth-email" name="email" type="email" autoComplete="email" required />{app === "vendor" && <><label htmlFor="auth-business">Business name</label><input id="auth-business" name="tenantName" minLength={2} required /><label htmlFor="auth-slug">Business address name</label><input id="auth-slug" name="tenantSlug" autoCapitalize="none" spellCheck={false} pattern="[a-z0-9-]{1,48}" title="1–48 lowercase letters, numbers, or hyphens" required /><label htmlFor="auth-category">Business category</label><select id="auth-category" name="categoryId" required defaultValue=""><option value="" disabled>Choose a business category</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select>{categoryError && <p role="alert">{categoryError} <button type="button" onClick={() => setCategoryRetry(value => value + 1)}>Retry categories</button></p>}</>}</>}
          {!register && <><label htmlFor="auth-identifier">Email or username</label><input id="auth-identifier" name="identifier" autoComplete="username" autoCapitalize="none" spellCheck={false} required /></>}
          <label htmlFor="auth-password">Password</label><input id="auth-password" name="password" type={passwordVisible ? "text" : "password"} autoComplete={register ? "new-password" : "current-password"} minLength={register ? 8 : undefined} required /><button type="button" aria-pressed={passwordVisible} onClick={() => setPasswordVisible(value => !value)}>{passwordVisible ? "Hide password" : "Show password"}</button>
        </>}
        <button className="universal-auth-primary" type="submit">{busy ? "Please wait…" : challenge ? "Verify and continue" : recovery ? "Send reset instructions" : register ? `Create ${app === "vendor" ? "Vendor" : "Customer"} account` : `Continue to ${app === "vendor" ? "Vendor" : "Customer"}`}</button>
      </fieldset></form>}
      {error && <p role="alert" className="universal-auth-error">{error}</p>}{message && <p role="status">{message}</p>}
      {challenge ? <div className="universal-auth-actions">{methods.includes("email") && <button type="button" disabled={busy} onClick={() => void sendEmail()}>Send a new email code</button>}{methods.includes("recovery") && <button type="button" disabled={busy} onClick={() => { setRecoveryMethod(true); setEmailMethod(false); setChallenge(originalChallenge); setMessage(""); }}>Use a recovery code</button>}{methods.includes("totp") && <button type="button" disabled={busy} onClick={() => { setRecoveryMethod(false); setEmailMethod(false); setChallenge(originalChallenge); setMessage(""); }}>Use authenticator</button>}<button type="button" disabled={busy} onClick={restart}>Start over</button></div> : <>
      <button type="button" className="universal-auth-link" disabled={busy} onClick={() => { setRecovery(!recovery); setError(""); setMessage(""); }}>{recovery ? "Back to sign in" : "Forgot your password?"}</button>
      {!recovery && !identity && <div className="universal-auth-actions">{Object.entries(providers).filter(([, enabled]) => enabled).map(([provider]) => <button key={provider} type="button" disabled={busy} onClick={() => { const url = new URL(`${API_BASE_URL}/auth/oauth/${provider}/start`); url.searchParams.set("surface", app); url.searchParams.set("intent", register ? `register_${app}` : "login"); url.searchParams.set("next", next); window.location.assign(url.href); }}>Continue with {provider}</button>)}</div>}
      <p>{register ? "Already have an account?" : "New to GetPrio?"} <Link aria-disabled={busy} onClick={event => { if (busy) event.preventDefault(); }} to={`/${register ? "login" : "register"}?app=${app}&next=${encodeURIComponent(next)}`}>{register ? "Sign in" : "Create an account"}</Link></p></>}
      </div>
    </div></div>
  </section>;
}
