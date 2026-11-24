import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import type { OAuthProvidersResponse, UserSummary } from "@shared";
import { API_BASE_URL, publicAuthRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { appUrl, safeSurfaceNext, keepSurfaceReturnPath, initialAuthSurface } from "../surfaces/surfaceConfig";
import { publicUniversalAuthEnabled } from "../surfaces/publicAuthEnabled";
import { getErrorMessage } from "../utils/errors";
import { readPublicAuthTheme } from "./publicAuthTheme";
import { usePublicTheme } from "../surfaces/PublicTheme";
import googleIcon from "../assets/auth/google.svg";
import facebookIcon from "../assets/auth/facebook-supplied.png";
import appleLightIcon from "../assets/auth/apple-light.png";
import appleDarkIcon from "../assets/auth/apple-dark.png";
import { IconArrowLeft, IconBuildingStore, IconUser } from "@tabler/icons-react";
import { Button } from "@vendor/components/ui/button";
import { Input } from "@vendor/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@vendor/components/ui/tabs";
import { Field, FieldGroup, FieldLabel } from "@vendor/components/ui/field";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@vendor/components/ui/card";
import { Alert, AlertDescription } from "@vendor/components/ui/alert";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from "@vendor/components/ui/select";
import { VendorPortal } from "@vendor/portal";
import PasswordField from "../marketing/PasswordField";
import "./universal-auth.css";

type BusinessCategory = { id: string; name: string };
type CategoryRequest =
  | { status: "loading" }
  | { status: "ready"; items: BusinessCategory[] }
  | { status: "error"; message: string };

export function hasVendorAccess(user: UserSummary) {
  return user.roles.includes("vendor") || user.tenants.some(tenant => tenant.isActive !== false);
}

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
  const app = initialAuthSurface(location.pathname, params);
  const register = location.pathname.startsWith("/register");
  const [busy, setBusy] = useState(false);
  const commandVersion = useRef(0);
  const authSection = useRef<HTMLElement>(null);
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
  const vendorAccess = !identity || hasVendorAccess(identity);
  const [categoryRequest, setCategoryRequest] = useState<CategoryRequest>({ status: "loading" });
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
    const controller = new AbortController();
    setCategoryRequest({ status: "loading" });
    publicAuthRequest<{ items: BusinessCategory[] }>("/public/business-categories", { signal: controller.signal })
      .then(({ items }) => {
        if (controller.signal.aborted) return;
        setCategoryRequest(items.length > 0
          ? { status: "ready", items }
          : { status: "error", message: "No business categories are available. Please try again." });
      })
      .catch(failure => {
        if (!controller.signal.aborted) {
          setCategoryRequest({ status: "error", message: getErrorMessage(failure) });
        }
      });
    return () => controller.abort();
  }, [app, register, categoryRetry]);
  const vendorRegistration = register && app === "vendor" && !recovery && !challenge;
  const categoryUnavailable = vendorRegistration && categoryRequest.status !== "ready";
  const categories = categoryRequest.status === "ready" ? categoryRequest.items : [];
  const next = safeSurfaceNext(params.get("next"), app);
  useEffect(() => {
    if (!identity || vendorAccess || app !== "vendor") return;
    const updated = new URLSearchParams(params);
    updated.set("app", "customer");
    setParams(updated, { replace: true });
  }, [app, identity, params, setParams, vendorAccess]);
  function finish(user: UserSummary) {
    const destination = authDestination(app, user, next);
    if (!destination) { setError("Your account does not have a Vendor workspace. Choose Customer, or contact your business administrator."); return; }
    window.location.replace(destination);
  }
  function choose(surface: "customer" | "vendor") {
    if (busy || challenge) return;
    const updated = new URLSearchParams(params);
    updated.set("app", surface);
    if (surface !== app && updated.has("next")) {
      const requested = updated.get("next");
      if (!keepSurfaceReturnPath(requested, surface)) updated.delete("next");
    }
    setParams(updated, { replace: true });
  }
  function restart() { setChallenge(""); setOriginalChallenge(""); setMethods([]); setEmailMethod(false); setRecoveryMethod(false); setError(""); setMessage(""); }
  async function sendEmail() {
    setBusy(true); setError("");
    try {
      const data = await publicAuthRequest<{ token: string; deliveryTarget: string }, { challengeToken: string }>("/auth/mfa/email/send", { method: "POST", body: { challengeToken: originalChallenge } });
      setChallenge(data.token); setEmailMethod(true); setRecoveryMethod(false); setMessage(`Enter the code sent to ${data.deliveryTarget}.`);
    } catch (failure) { setError(getErrorMessage(failure)); } finally { setBusy(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || categoryUnavailable) return;
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
  const panel = <>
      {!identity && <p className="universal-auth-intent">{app === "vendor" ? "Continue to your Vendor workspace" : "Continue to your Customer dashboard"}</p>}
      {identity && !register && !challenge && !recovery ? <div className="universal-auth-session"><p>Signed in as {identity.name}.</p><Button type="button" disabled={busy} onClick={() => finish(identity)}>Continue to {app === "vendor" ? "Vendor" : "Customer"}</Button><Button variant="outline" type="button" disabled={busy} onClick={async () => { commandVersion.current += 1; setBusy(true); try { await auth.logout(); setError(""); } catch (failure) { setError(getErrorMessage(failure)); } finally { setBusy(false); } }}>Use another account</Button><p>Signing out also ends this shared session in your other GetPrio apps.</p></div> : <form method="post" onSubmit={submit} aria-busy={busy}>
      <fieldset disabled={busy}><legend className="universal-auth-sr">{title}</legend><FieldGroup>
        {challenge ? <><Field><FieldLabel htmlFor="auth-code">{recoveryMethod ? "Recovery code" : emailMethod ? "Email code" : "Authenticator code"}</FieldLabel><Input key={`${emailMethod}-${recoveryMethod}`} id="auth-code" name="code" autoComplete={recoveryMethod ? "off" : "one-time-code"} inputMode={recoveryMethod ? "text" : "numeric"} required autoFocus /></Field></> : recovery ? <><Field><FieldLabel htmlFor="auth-email">Account email</FieldLabel><Input id="auth-email" name="email" type="email" autoComplete="email" required /></Field></> : <>
          {register && <>
            <Field>
              <FieldLabel htmlFor="auth-name">Your name</FieldLabel>
              <Input id="auth-name" name="name" autoComplete="name" minLength={2} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="auth-username">Username</FieldLabel>
              <Input id="auth-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} pattern="[a-z0-9_]{3,30}" title="3–30 lowercase letters, numbers, or underscores" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="auth-email">Email</FieldLabel>
              <Input id="auth-email" name="email" type="email" autoComplete="email" required />
            </Field>
            {app === "vendor" && <>
              <Field>
                <FieldLabel htmlFor="auth-business">Business name</FieldLabel>
                <Input id="auth-business" name="tenantName" autoComplete="organization" minLength={2} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="auth-slug">Business address name</FieldLabel>
                <Input id="auth-slug" name="tenantSlug" autoCapitalize="none" spellCheck={false} pattern="[a-z0-9\-]{1,48}" title="1–48 lowercase letters, numbers, or hyphens" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="auth-category">Business category</FieldLabel>
                <VendorPortal.Provider value={authSection}>
                  <Select name="categoryId" required disabled={categoryUnavailable || busy} items={categories.map(category => ({ value: category.id, label: category.name }))}>
                    <SelectTrigger id="auth-category" aria-describedby={categoryUnavailable ? "auth-category-status" : undefined}>
                      <SelectValue placeholder="Choose a business category" />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        {categories.map(category => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </VendorPortal.Provider>
                {categoryRequest.status === "loading" && <p className="universal-auth-category-status" id="auth-category-status" role="status">Loading business categories…</p>}
                {categoryRequest.status === "error" && <>
                  <p className="universal-auth-category-status" id="auth-category-status" role="alert">{categoryRequest.message}</p>
                  <Button variant="outline" type="button" className="v:self-start" onClick={() => setCategoryRetry(value => value + 1)}>Retry categories</Button>
                </>}
              </Field>
            </>}
          </>}
          {!register && <><Field><FieldLabel htmlFor="auth-identifier">Email or username</FieldLabel><Input id="auth-identifier" name="identifier" autoComplete="username" autoCapitalize="none" spellCheck={false} required /></Field></>}
          <Field><FieldLabel htmlFor="auth-password">Password</FieldLabel><PasswordField id="auth-password" name="password" autoComplete={register ? "new-password" : "current-password"} minLength={register ? 8 : undefined} required /></Field>
        </>}
        <Button className="universal-auth-primary" type="submit" disabled={categoryUnavailable}>{busy ? "Please wait…" : challenge ? "Verify and continue" : recovery ? "Send reset instructions" : register ? `Create ${app === "vendor" ? "Vendor" : "Customer"} account` : `Continue to ${app === "vendor" ? "Vendor" : "Customer"}`}</Button>
      </FieldGroup></fieldset></form>}
      {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}{message && <Alert role="status"><AlertDescription>{message}</AlertDescription></Alert>}
      {challenge ? <div className="universal-auth-actions">{methods.includes("email") && <Button variant="outline" type="button" disabled={busy} onClick={() => void sendEmail()}>Send a new email code</Button>}{methods.includes("recovery") && <Button variant="outline" type="button" disabled={busy} onClick={() => { setRecoveryMethod(true); setEmailMethod(false); setChallenge(originalChallenge); setMessage(""); }}>Use a recovery code</Button>}{methods.includes("totp") && <Button variant="outline" type="button" disabled={busy} onClick={() => { setRecoveryMethod(false); setEmailMethod(false); setChallenge(originalChallenge); setMessage(""); }}>Use authenticator</Button>}<Button variant="outline" type="button" disabled={busy} onClick={restart}>Start over</Button></div> : <>
      {!identity && <Button variant="link" type="button" className="universal-auth-link" disabled={busy} onClick={() => { setRecovery(!recovery); setError(""); setMessage(""); }}>{recovery ? "Back to sign in" : "Forgot your password?"}</Button>}
      {!recovery && !identity && Object.values(providers).some(Boolean) && <div style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--muted-foreground)", fontSize: 14, marginTop: 20 }}><span aria-hidden="true" style={{ flex: 1, height: 1, backgroundColor: "currentColor", opacity: 0.35 }} /><span>or continue with</span><span aria-hidden="true" style={{ flex: 1, height: 1, backgroundColor: "currentColor", opacity: 0.35 }} /></div>}
      {!recovery && !identity && <div className="universal-auth-actions" style={{ display: "flex", justifyContent: "center", flexWrap: "wrap" }}>{Object.entries(providers).filter(([, enabled]) => enabled).map(([provider]) => { const icon = provider === "google" ? googleIcon : provider === "facebook" ? facebookIcon : provider === "apple" ? (dark ? appleDarkIcon : appleLightIcon) : undefined; const label = `Continue with ${provider.charAt(0).toUpperCase()}${provider.slice(1)}`; return <Button variant="outline" key={provider} type="button" disabled={busy} aria-label={icon ? label : undefined} title={icon ? label : undefined} style={icon ? { width: 48, height: 48, padding: 8, flex: "0 0 48px" } : undefined} onClick={() => { const url = new URL(`${oauthApiBase}/auth/oauth/${provider}/start`); url.searchParams.set("surface", app); url.searchParams.set("intent", register ? `register_${app}` : "login"); url.searchParams.set("next", next); window.location.assign(url.href); }}>{icon ? <img src={icon} alt="" width={32} height={32} style={provider === "facebook" ? { transform: "scale(1.5)" } : undefined} /> : <>Continue with {provider}</>}</Button>; })}</div>}
      </>}
  </>;

  return <section ref={authSection} className="universal-auth" data-theme={dark ? "dark" : "light"}>
    <div className="universal-auth-board">
      <aside className="universal-auth-editorial">
        <h1>{register ? "Start with GetPrio." : "Make room for what matters."}</h1>
        <p className="universal-auth-editorial-lead">Bookings, queues, and your business in one place.</p>
        <img className="universal-auth-graphic" src="/illustrations/public/getprio-auth-reference-redraw.png" alt="Ink illustration of a customer with a phone beside a vendor at a counter" />
        <Link className="universal-auth-home-link" to="/"><IconArrowLeft aria-hidden="true" size={18} />Back to home</Link>
      </aside>
      <Card className="universal-auth-card">
        <CardHeader>
          <CardTitle className="universal-auth-title"><h2>{title}</h2></CardTitle>
          <CardDescription>{register ? "Choose how you’ll use GetPrio, then create your account." : "Choose where you want to continue after signing in."}</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={app} onValueChange={value => { if (value === "customer" || value === "vendor") choose(value); }}>
            <TabsList className="universal-auth-tabs" aria-label="Choose Customer or Vendor">
              <TabsTrigger value="customer" disabled={busy || !!challenge}><IconUser aria-hidden="true" />Customer</TabsTrigger>
              {vendorAccess && <TabsTrigger value="vendor" disabled={busy || !!challenge}><IconBuildingStore aria-hidden="true" />Vendor</TabsTrigger>}
            </TabsList>
            <TabsContent value="customer" keepMounted>{app === "customer" && panel}</TabsContent>
            <TabsContent value="vendor" keepMounted>{app === "vendor" && panel}</TabsContent>
          </Tabs>
        </CardContent>
        {!challenge && !identity && <CardFooter>
          <p>{register ? "Already have an account?" : "New to GetPrio?"} <Link aria-disabled={busy} onClick={event => { if (busy) event.preventDefault(); }} to={`/${register ? "login" : "register"}?app=${app}&next=${encodeURIComponent(next)}`}>{register ? "Sign in" : "Create an account"}</Link></p>
        </CardFooter>}
      </Card>
    </div>
  </section>;
}
