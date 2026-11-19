import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import type { OAuthProvidersResponse, UserSummary } from "@shared";
import { API_BASE_URL, publicAuthRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { appUrl, safeSurfaceNext } from "../surfaces/surfaceConfig";
import { publicUniversalAuthEnabled } from "../surfaces/publicAuthEnabled";
import { getErrorMessage } from "../utils/errors";
import { readPublicAuthTheme } from "./publicAuthTheme";
import { usePublicTheme } from "../surfaces/PublicTheme";
import googleIcon from "../assets/auth/google.svg";
import facebookIcon from "../assets/auth/facebook-supplied.png";
import appleLightIcon from "../assets/auth/apple-light.png";
import appleDarkIcon from "../assets/auth/apple-dark.png";
import { IconBuildingStore, IconUser } from "@tabler/icons-react";
import { Button } from "@vendor/components/ui/button";
import { Input } from "@vendor/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@vendor/components/ui/tabs";
import { Field, FieldGroup, FieldLabel } from "@vendor/components/ui/field";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@vendor/components/ui/card";
import { Alert, AlertDescription } from "@vendor/components/ui/alert";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from "@vendor/components/ui/select";
import PasswordField from "../marketing/PasswordField";
import "./universal-auth.css";

export function authDestination(surface: "customer" | "vendor", user: UserSummary, next?: string | null) {
  if (surface === "vendor" && !user.tenants?.some(tenant => tenant.isActive !== false)) return null;
  if (user.mfaRequired && !user.mfaEnabled) {
    return appUrl(surface, surface === "vendor" ? "/dashboard/account" : "/account/security");
  }
  return appUrl(surface, safeSurfaceNext(next, surface));
}

export default function UniversalAuthPage() {
  const auth = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const app = params.get("app") === "customer" ? "customer" : params.get("app") === "vendor" ? "vendor" : !params.has("app") && location.pathname.endsWith("/customer") ? "customer" : "vendor";
  const register = location.pathname.startsWith("/register");
  const [busy, setBusy] = useState(false);
  const commandVersion = useRef(0);
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
  const identity = auth.user;
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [categoryError, setCategoryError] = useState("");
  const [categoryRetry, setCategoryRetry] = useState(0);
  const localCustomerOAuth = import.meta.env.VITE_LOCAL_SURFACES === "1" && app === "customer" && typeof window !== "undefined" && window.location.hostname === "localhost" && window.location.port === "5190";
  const oauthApiBase = localCustomerOAuth ? "http://localhost:5390/api" : API_BASE_URL;
  useEffect(() => {
    if (!publicUniversalAuthEnabled) return;
    const controller = new AbortController();
    setProviders({ google: false, facebook: false, apple: false });
    const discovery = localCustomerOAuth
      ? fetch(`${oauthApiBase}/auth/oauth/providers`, { signal: controller.signal, credentials: "include" }).then(response => { if (!response.ok) throw new Error("OAuth providers unavailable"); return response.json() as Promise<OAuthProvidersResponse & { browserProviders?: OAuthProvidersResponse["providers"] }>;  })
      : publicAuthRequest<OAuthProvidersResponse>("/auth/oauth/providers", { signal: controller.signal });
    discovery.then(data => { if (!controller.signal.aborted) setProviders(localCustomerOAuth ? ((data as OAuthProvidersResponse & { browserProviders?: OAuthProvidersResponse["providers"] }).browserProviders || data.providers) : data.providers); }).catch(() => {});
    return () => controller.abort();
  }, [localCustomerOAuth, oauthApiBase]);
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
    if (!destination) { setError("Your account does not have a Vendor workspace. Choose Customer, or contact your business administrator."); return; }
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
      const data = await auth.sendEmailMfaCode({ challengeToken: originalChallenge });
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
        const data = await auth.requestPasswordReset({ email: String(values.email), next });
        setMessage(data.message); return;
      }
      if (challenge) {
        const data = await auth.verifyMfaChallenge({ challengeToken: challenge, ...(recoveryMethod ? { recoveryCode: String(values.code) } : { code: String(values.code) }), ...(emailMethod ? { method: "email" as const } : {}) });
        finish(data.user); return;
      }
      const account = { name: String(values.name || ""), username: String(values.username || ""), email: String(values.email || ""), phone: "", password: String(values.password || "") };
      const data = register ? (app === "customer" ? await auth.registerCustomer(account) : await auth.registerVendor({ ...account, tenantName: String(values.tenantName || ""), tenantSlug: String(values.tenantSlug || ""), categoryId: String(values.categoryId || ""), category: "" })) : await auth.login({ identifier: String(values.identifier || ""), password: String(values.password || "") });
      if ("mfaRequired" in data) { setChallenge(data.challengeToken); setOriginalChallenge(data.challengeToken); setMethods(data.methods); return; }
      finish(data.user);
    } catch (failure) { setError(getErrorMessage(failure)); } finally { setBusy(false); }
  }
  if (!publicUniversalAuthEnabled) return <section className="universal-auth"><h1>Sign in to GetPrio</h1><p>Choose your application.</p><a href={appUrl("vendor", "/login")}>Vendor login</a> <a href={appUrl("customer", "/login")}>Customer login</a></section>;
  const title = challenge ? "Verify your sign-in" : recovery ? "Reset your password" : register ? "Create your GetPrio account" : "Welcome back";
  return <section className="universal-auth" data-theme={dark ? "dark" : "light"}>
    <button type="button" className="universal-auth-theme-toggle" onClick={publicTheme?.toggleTheme} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}>{dark ? "☀" : "☾"}</button>
    <div className="universal-auth-board"><aside className="universal-auth-editorial"><h1>{register ? "Start with GetPrio." : "Make room for what matters."}</h1><p className="universal-auth-editorial-lead">Bookings, queues, and your business in one place.</p><img className="universal-auth-graphic" src="/illustrations/public/getprio-auth-reference-redraw.png" alt="Ink illustration of a customer with a phone beside a vendor at a counter" /><Link to="/">Back to home</Link></aside>
    <Card className="universal-auth-card"><CardHeader><CardTitle className="universal-auth-title">{title}</CardTitle><CardDescription>{register ? "Choose how you’ll use GetPrio, then create your account." : "Choose where you want to continue after signing in."}</CardDescription></CardHeader><CardContent>
      <Tabs value={app} onValueChange={value => choose(value as "customer" | "vendor")}><TabsList className="universal-auth-tabs" aria-label="Choose Customer or Vendor">{(["customer", "vendor"] as const).map(surface => <TabsTrigger id={`auth-tab-${surface}`} key={surface} value={surface} disabled={busy || !!challenge}>{surface === "customer" ? <IconUser aria-hidden="true" /> : <IconBuildingStore aria-hidden="true" />}{surface === "customer" ? "Customer" : "Vendor"}</TabsTrigger>)}</TabsList>
      <p className="universal-auth-intent">{app === "vendor" ? "Continue to your Vendor workspace" : "Continue to your Customer dashboard"}</p>
      <TabsContent id="auth-panel" value={app}>
      {identity && !register && !challenge && !recovery ? <div className="universal-auth-session"><p>Signed in as {identity.name}.</p><Button type="button" disabled={busy} onClick={() => finish(identity)}>Continue to {app === "vendor" ? "Vendor" : "Customer"}</Button><Button variant="outline" type="button" disabled={busy} onClick={async () => { commandVersion.current += 1; setBusy(true); try { await auth.logout(); setError(""); } catch (failure) { setError(getErrorMessage(failure)); } finally { setBusy(false); } }}>Use another account</Button><p>Signing out also ends this shared session in your other GetPrio apps.</p></div> : <form onSubmit={submit} aria-busy={busy}>
      <fieldset disabled={busy}><legend className="universal-auth-sr">{title}</legend><FieldGroup>
        {challenge ? <><Field><FieldLabel htmlFor="auth-code">{recoveryMethod ? "Recovery code" : emailMethod ? "Email code" : "Authenticator code"}</FieldLabel><Input key={`${emailMethod}-${recoveryMethod}`} id="auth-code" name="code" autoComplete={recoveryMethod ? "off" : "one-time-code"} inputMode={recoveryMethod ? "text" : "numeric"} required autoFocus /></Field></> : recovery ? <><Field><FieldLabel htmlFor="auth-email">Account email</FieldLabel><Input id="auth-email" name="email" type="email" autoComplete="email" required /></Field></> : <>
          {register && <><Field><FieldLabel htmlFor="auth-name">Your name</FieldLabel><Input id="auth-name" name="name" autoComplete="name" minLength={2} required /></Field><Field><FieldLabel htmlFor="auth-username">Username</FieldLabel><Input id="auth-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} pattern="[a-z0-9_]{3,30}" title="3–30 lowercase letters, numbers, or underscores" required /></Field><Field><FieldLabel htmlFor="auth-email">Email</FieldLabel><Input id="auth-email" name="email" type="email" autoComplete="email" required /></Field>{app === "vendor" && <><Field><FieldLabel htmlFor="auth-business">Business name</FieldLabel><Input id="auth-business" name="tenantName" minLength={2} required /></Field><Field><FieldLabel htmlFor="auth-slug">Business address name</FieldLabel><Input id="auth-slug" name="tenantSlug" autoCapitalize="none" spellCheck={false} pattern="[a-z0-9-]{1,48}" title="1–48 lowercase letters, numbers, or hyphens" required /></Field><Field><FieldLabel htmlFor="auth-category">Business category</FieldLabel><Select name="categoryId" required defaultValue="" items={categories.map(category => ({ value: category.id, label: category.name }))}><SelectTrigger id="auth-category"><SelectValue placeholder="Choose a business category" /></SelectTrigger><SelectContent><SelectGroup>{categories.map(category => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>{categoryError && <p role="alert">{categoryError} <Button variant="outline" type="button" onClick={() => setCategoryRetry(value => value + 1)}>Retry categories</Button></p>}</>}</>}
          {!register && <><Field><FieldLabel htmlFor="auth-identifier">Email or username</FieldLabel><Input id="auth-identifier" name="identifier" autoComplete="username" autoCapitalize="none" spellCheck={false} required /></Field></>}
          <Field><FieldLabel htmlFor="auth-password">Password</FieldLabel><PasswordField id="auth-password" name="password" autoComplete={register ? "new-password" : "current-password"} minLength={register ? 8 : undefined} required /></Field>
        </>}
        <Button className="universal-auth-primary" type="submit">{busy ? "Please wait…" : challenge ? "Verify and continue" : recovery ? "Send reset instructions" : register ? `Create ${app === "vendor" ? "Vendor" : "Customer"} account` : `Continue to ${app === "vendor" ? "Vendor" : "Customer"}`}</Button>
      </FieldGroup></fieldset></form>}
      {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}{message && <Alert role="status"><AlertDescription>{message}</AlertDescription></Alert>}
      {challenge ? <div className="universal-auth-actions">{methods.includes("email") && <Button variant="outline" type="button" disabled={busy} onClick={() => void sendEmail()}>Send a new email code</Button>}{methods.includes("recovery") && <Button variant="outline" type="button" disabled={busy} onClick={() => { setRecoveryMethod(true); setEmailMethod(false); setChallenge(originalChallenge); setMessage(""); }}>Use a recovery code</Button>}{methods.includes("totp") && <Button variant="outline" type="button" disabled={busy} onClick={() => { setRecoveryMethod(false); setEmailMethod(false); setChallenge(originalChallenge); setMessage(""); }}>Use authenticator</Button>}<Button variant="outline" type="button" disabled={busy} onClick={restart}>Start over</Button></div> : <>
      <Button variant="link" type="button" className="universal-auth-link" disabled={busy} onClick={() => { setRecovery(!recovery); setError(""); setMessage(""); }}>{recovery ? "Back to sign in" : "Forgot your password?"}</Button>
      {!recovery && !identity && app === "customer" && Object.values(providers).some(Boolean) && <div style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--muted-foreground)", fontSize: 14, marginTop: 20 }}><span aria-hidden="true" style={{ flex: 1, height: 1, backgroundColor: "currentColor", opacity: 0.35 }} /><span>or continue with</span><span aria-hidden="true" style={{ flex: 1, height: 1, backgroundColor: "currentColor", opacity: 0.35 }} /></div>}
      {!recovery && !identity && <div className="universal-auth-actions" style={app === "customer" ? { display: "flex", justifyContent: "center", flexWrap: "wrap" } : undefined}>{Object.entries(providers).filter(([, enabled]) => enabled).map(([provider]) => { const icon = app === "customer" && provider === "google" ? googleIcon : app === "customer" && provider === "facebook" ? facebookIcon : app === "customer" && provider === "apple" ? (dark ? appleDarkIcon : appleLightIcon) : undefined; const label = `Continue with ${provider.charAt(0).toUpperCase()}${provider.slice(1)}`; return <Button variant="outline" key={provider} type="button" disabled={busy || provider === "apple"} aria-label={icon ? label : undefined} title={icon ? label : undefined} style={icon ? { width: 48, height: 48, padding: 8, flex: "0 0 48px" } : undefined} onClick={() => { const url = new URL(`${oauthApiBase}/auth/oauth/${provider}/start`); url.searchParams.set("surface", app); url.searchParams.set("intent", register ? `register_${app}` : "login"); url.searchParams.set("next", next); window.location.assign(url.href); }}>{icon ? <img src={icon} alt="" width={32} height={32} style={provider === "facebook" ? { transform: "scale(1.5)" } : undefined} /> : <>Continue with {provider}</>}</Button>; })}</div>}
      </>}
      </TabsContent></Tabs></CardContent>{!challenge && <CardFooter><p>{register ? "Already have an account?" : "New to GetPrio?"} <Link aria-disabled={busy} onClick={event => { if (busy) event.preventDefault(); }} to={`/${register ? "login" : "register"}?app=${app}&next=${encodeURIComponent(next)}`}>{register ? "Sign in" : "Create an account"}</Link></p></CardFooter>}</Card></div>
  </section>;
}
