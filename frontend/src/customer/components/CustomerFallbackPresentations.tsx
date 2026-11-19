import type { ReactNode, ComponentProps } from "react";
import googleIcon from "../assets/auth/google.svg";
import facebookIcon from "../assets/auth/facebook-supplied.png";
import appleLightIcon from "../assets/auth/apple-light.png";
import appleDarkIcon from "../assets/auth/apple-dark.png";
import { forwardRef, useState } from "react";
import { Link } from "react-router-dom";
import type { MaintenancePresentationModel } from "../../components/MaintenanceBoundary";
import type { OAuthCallbackPresentationModel } from "../../pages/OAuthCallbackPage";
import type { CustomerLoginPresentationModel } from "../../pages/LoginPage";
import type { CustomerRegistrationPresentationModel } from "../../pages/RegisterCustomerPage";
import { useAuth } from "../../context/AuthContext";
import { formatPhilippineMobileNumber, normalizePhilippineMobileNumber } from "../../utils/phones";
import { normalizeUsernameInput } from "../../utils/usernames";
import { appUrl } from "../../surfaces/surfaceConfig";
import { Eye, EyeOff, Info, AlertTriangle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Alert, AlertTitle, AlertDescription, Button, Field, FieldLabel, FieldError, FieldDescription, Input, Skeleton } from "./ui";
import { InputGroup, InputGroupInput, InputGroupAddon, InputGroupButton } from "./shadcn/input-group";
import { CustomerOtpField } from "./security/CustomerOtpField";

export function CustomerLoading({ message = "Loading session…" }: { message?: string } = {}) {
  return <Card className="customer-fallback-card" aria-busy="true"><CardContent><p role="status">{message}</p><Skeleton style={{ height: 16, width: "75%" }} /><Skeleton style={{ height: 16, width: "50%", marginTop: 12 }} /></CardContent></Card>;
}
function Notice({ children, title, error = false }: { children?: ReactNode; title?: string; error?: boolean }) {
  return <Alert data-intent={error ? "error" : "info"}>{error ? <AlertTriangle /> : <Info />}{title ? <AlertTitle>{title}</AlertTitle> : null}<AlertDescription>{children}</AlertDescription></Alert>;
}
export function CustomerMaintenance(m: MaintenancePresentationModel) {
  if (m.pending) return <CustomerLoading message="Checking service availability…" />;
  if (m.forced) return <Card className="customer-fallback-card"><CardHeader><h1 ref={m.headingRef} tabIndex={-1}>GetPrio is undergoing maintenance</h1><CardDescription>{m.message}</CardDescription></CardHeader><CardContent className="customer-page-stack"><p>New bookings and queue joins are temporarily paused. Existing tickets, bookings, and vendor services remain available.</p>{m.isError ? <Notice error title="Could not check the latest status">Please try again. Your existing tickets and bookings are unchanged.</Notice> : null}<Button disabled={m.isFetching} onClick={m.onRetry}>Check again</Button><Link to="/login">Staff / admin sign in</Link><Link to="/account/tickets">My existing tickets</Link><Link to="/account/bookings">My existing bookings</Link><p>This page checks automatically and will return to your original page when maintenance ends.</p></CardContent></Card>;
  return <>{m.enabled ? <Notice title="New bookings and queue joins are paused">{m.message} Existing services can continue.</Notice> : null}{m.children}</>;
}
export function CustomerAppFailure({ retry, goHome }: { retry: () => void; goHome: () => void }) {
  return <Card className="customer-fallback-card" role="alert"><CardHeader><CardTitle>Something went wrong</CardTitle><CardDescription>Try again, or return to the home page and continue from there.</CardDescription></CardHeader><CardFooter><Button onClick={retry}>Try again</Button><Button variant="outline" onClick={goHome}>Go home</Button></CardFooter></Card>;
}
export function CustomerNotFound() {
  return <Card><CardHeader><CardTitle>This page took a detour.</CardTitle><CardDescription>The page you’re looking for may have moved, or the link may be out of date.</CardDescription></CardHeader><CardFooter><Button render={<Link to="/" />}>Back to home</Button><Button variant="outline" render={<Link to="/vendors" />}>Browse vendors</Button></CardFooter></Card>;
}
export function CustomerOAuthCallback(m: OAuthCallbackPresentationModel) {
  return <Card className="customer-fallback-card"><CardHeader><CardTitle>{m.error ? "We couldn't finish that sign-in." : "Finalizing your account."}</CardTitle></CardHeader><CardContent className="customer-page-stack">{m.error ? <><Notice error>{m.error}</Notice><p>You can head back to the sign-in screen and try a different provider or use your password instead.</p><Button onClick={m.onRetry}>Return to sign in</Button></> : <CustomerLoading message="Finishing sign-in…" />}</CardContent></Card>;
}
const AuthField = forwardRef<HTMLInputElement, ComponentProps<"input"> & { label: string; error?: string; description?: ReactNode; password?: boolean }>(function AuthField({ label, error, description, password, ...props }, ref) {
  const [shown, setShown] = useState(false);
  return <Field><FieldLabel className="customer-field">{label}{password ? <InputGroup className="customer-password-input"><InputGroupInput ref={ref} {...props} type={shown ? "text" : "password"} aria-invalid={!!error} /><InputGroupAddon align="inline-end"><InputGroupButton type="button" size="icon-sm" aria-label={shown ? "Hide password" : "Show password"} onClick={() => setShown(!shown)}>{shown ? <EyeOff /> : <Eye />}</InputGroupButton></InputGroupAddon></InputGroup> : <Input ref={ref} {...props} aria-invalid={!!error} />}</FieldLabel>{description ? <FieldDescription>{description}</FieldDescription> : null}{error ? <FieldError>{error}</FieldError> : null}</Field>;
})
function CustomerSocial({ intent, returnPath, disabled = false }: { intent: "login" | "register_customer"; returnPath?: string; disabled?: boolean }) {
  const { oauthLoading, oauthProviders, startOAuth } = useAuth();
  return <div className="customer-page-stack"><div style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--muted-foreground)", fontSize: 14, marginTop: 20 }}><span aria-hidden="true" style={{ flex: 1, height: 1, backgroundColor: "currentColor", opacity: 0.35 }} /><span>or continue with</span><span aria-hidden="true" style={{ flex: 1, height: 1, backgroundColor: "currentColor", opacity: 0.35 }} /></div><div style={{ display: "flex", justifyContent: "center", gap: 12 }}>{([['google', 'Google', googleIcon], ['facebook', 'Facebook', facebookIcon], ...(oauthProviders.apple ? [['apple', 'Apple', appleLightIcon] as const] : [])] as const).map(([id, label, icon]) => <Button key={id} type="button" variant="outline" aria-label={`Continue with ${label}`} title={`Continue with ${label}`} style={{ width: 48, height: 48, padding: 8 }} disabled={disabled || oauthLoading || !oauthProviders[id]} onClick={() => startOAuth(id, intent, returnPath)}>{id === "apple" ? <><img src={appleLightIcon} alt="" width={32} height={32} className="dark:hidden" /><img src={appleDarkIcon} alt="" width={32} height={32} className="hidden dark:block" /></> : <img src={icon} alt="" width={32} height={32} style={id === "facebook" ? { transform: "scale(1.5)" } : undefined} />}</Button>)}</div></div>;
}
export function CustomerLoginFallback(m: CustomerLoginPresentationModel) {
  const busy = m.signInForm.formState.isSubmitting || m.resetRequestForm.formState.isSubmitting || m.resetConfirmForm.formState.isSubmitting || m.mfaSubmitting || m.emailMfaSending;
  return <Card className="customer-fallback-card"><CardHeader><CardTitle>{m.resetToken ? "Set a new password." : m.mfaChallengeToken ? "Verify your sign-in." : "Sign in"}</CardTitle><CardDescription>{m.resetToken ? "Choose a new password, then sign back in." : "Continue to your Customer account."}</CardDescription></CardHeader><CardContent className="customer-page-stack">
    {m.error ? <Notice error>{m.error}</Notice> : null}
    {m.resetToken ? <form className="customer-page-stack" onSubmit={m.handlePasswordResetConfirm}><AuthField password label="New password" autoComplete="new-password" required error={m.resetConfirmForm.formState.errors.newPassword?.message} {...m.resetConfirmForm.register('newPassword')} />{m.resetConfirmMessage ? <Notice>{m.resetConfirmMessage}</Notice> : null}<Button disabled={busy} type="submit">Reset password</Button><Button variant="link" onClick={() => { m.setSearchParams(m.vendorLogin && m.nextPath ? {next:m.nextPath} : {}); if(m.vendorLogin)m.resetConfirmForm.reset({token:'',newPassword:''});m.setError('');m.setResetConfirmMessage(''); }}>Back to sign in</Button></form> : <>
      {m.mfaChallengeToken ? <form className="customer-page-stack" onSubmit={m.handleMfaVerification}><Notice>{m.emailMfaActive ? `Enter the six-digit code sent to ${m.emailMfaDeliveryTarget || 'your verified email address'}. It expires in 10 minutes.` : 'Confirm the code from your authenticator app, or use a saved recovery code.'}</Notice><CustomerOtpField key={m.emailMfaActive ? "email-code" : "authenticator-code"} autoFocus label={m.emailMfaActive ? "Email code" : "Authenticator code"} value={m.mfaCode} onChange={value => {m.setMfaCode(value);m.setMfaRecoveryCode('');}} onVerify={() => m.handleMfaVerification()} verificationKey={`${m.mfaChallengeToken}:${m.emailMfaActive}`} disabled={m.mfaSubmitting || m.emailMfaSending} required={!m.mfaRecoveryCode.trim()} error={m.error || undefined} />{!m.emailMfaActive && m.mfaMethods.includes('recovery') ? <AuthField label="Recovery code (optional)" autoComplete="off" value={m.mfaRecoveryCode} onChange={e=>{m.setMfaRecoveryCode(e.currentTarget.value);m.setMfaCode('');}} /> : null}<Button type="submit" disabled={busy || (!m.mfaRecoveryCode.trim() && m.mfaCode.length !== 6)}>Confirm and sign in</Button>{m.mfaMethods.includes('email') ? <Button variant="link" disabled={m.emailMfaSending} onClick={()=>void m.sendEmailOtp()}>{m.emailMfaSending ? 'Sending email OTP…' : m.emailMfaActive && m.emailMfaSent ? 'Resend email OTP' : 'Send email OTP instead'}</Button> : null}{m.emailMfaActive && m.mfaMethods.includes('totp') ? <Button variant="link" onClick={()=>{m.setEmailMfaActive(false);m.setMfaChallengeToken(m.mfaLoginChallengeToken);m.setMfaCode('');m.setMfaRecoveryCode('');m.setError('');}}>Use authenticator app instead</Button> : null}<Button variant="link" onClick={m.returnToSignIn}>Return to sign in</Button></form> : <form className="customer-page-stack" onSubmit={m.handleSignIn}><AuthField label="Email or username" required autoComplete="username" error={m.signInForm.formState.errors.identifier?.message} {...m.signInForm.register('identifier')} /><AuthField password label="Password" required autoComplete="current-password" error={m.signInForm.formState.errors.password?.message} {...m.signInForm.register('password')} /><Button variant="link" onClick={()=>{m.setShowResetRequest(v=>!v);m.setError('');m.setResetRequestMessage('');const id=m.signInForm.getValues('identifier').trim();m.resetRequestForm.setValue('email',id.includes('@')?id:'');}}>Forgot password?</Button>{m.passwordChanged ? <Notice>Password updated. Sign in again with your new password.</Notice> : null}{m.passwordResetSuccess ? <Notice>Password reset complete. Sign in with your new password.</Notice> : null}<Button type="submit" disabled={busy}>Sign in</Button></form>}
      {m.showResetRequest ? <form className="customer-page-stack" onSubmit={m.handlePasswordResetRequest}><AuthField label="Reset email" type="email" required error={m.resetRequestForm.formState.errors.email?.message} {...m.resetRequestForm.register('email')} />{m.resetRequestMessage ? <Notice>{m.resetRequestMessage}</Notice> : null}<Button type="submit" variant="outline" disabled={busy}>Send reset instructions</Button></form> : null}
      <CustomerSocial intent="login" returnPath={m.nextPath || undefined} disabled={m.vendorLogin && (m.signInForm.formState.isSubmitting || m.mfaSubmitting || m.emailMfaSending)} />
    </>}
    <a href={appUrl('marketing','/register?app=customer')}>Create a customer account</a>
  </CardContent></Card>;
}
export function CustomerRegistrationFallback(m: CustomerRegistrationPresentationModel) {
  const {form}=m;
  return <Card className="customer-fallback-card"><CardHeader><CardTitle>Create your Customer account</CardTitle></CardHeader><CardContent className="customer-page-stack"><form className="customer-page-stack" onSubmit={m.handleSubmit}>
    <AuthField label="Name" required error={form.formState.errors.name?.message} {...form.register('name')} />
    <AuthField label="Username" required error={form.formState.errors.username?.message || (m.username && m.usernameMessage && !m.usernameAvailable ? m.usernameMessage : undefined)} description={m.checkingUsername ? 'Checking username…' : m.usernameMessage} {...form.register('username',{onChange:e=>{m.setUsernameManuallyEdited(true);form.setValue('username',normalizeUsernameInput(e.target.value),{shouldValidate:true});}})} />
    <AuthField label="Email" required type="email" error={form.formState.errors.email?.message} {...form.register('email')} />
    <AuthField label="Phone" inputMode="numeric" placeholder="(0917) 123-4567" error={form.formState.errors.phone?.message} value={formatPhilippineMobileNumber(form.watch('phone') || '')} onChange={e=>form.setValue('phone',normalizePhilippineMobileNumber(e.currentTarget.value),{shouldValidate:true})} />
    <AuthField password label="Password" required error={form.formState.errors.password?.message} {...form.register('password')} />
    {m.error ? <Notice error>{m.error}</Notice> : null}<Button type="submit" disabled={form.formState.isSubmitting || m.checkingUsername}>Create account</Button>
  </form><CustomerSocial intent="register_customer" returnPath={m.redirectTo} /><a href={appUrl('marketing','/login?app=customer')}>Already have an account? Sign in</a></CardContent></Card>;
}

export function CustomerBookingUnavailable(m: { error: string; status: number | null; backTo: string; onRetry: () => void }) {
  return <Card><CardHeader><CardTitle>{m.status === 404 ? "This link is unavailable." : "We couldn’t load this page."}</CardTitle><CardDescription>{m.status === 404 ? "The booking may have been removed, or the link may no longer be available." : m.error || "We couldn’t load this booking. Please check your connection and try again."}</CardDescription></CardHeader><CardFooter>{m.status !== 404 ? <Button onClick={m.onRetry}>Try again</Button> : null}<Button variant="outline" render={<Link to={m.backTo} />}>Back to booking list</Button></CardFooter></Card>;
}
export function CustomerArrivalCode(m: { value: string; remainingSeconds: number; loading: boolean; error: string; graphic: ReactNode; onRetry: () => void }) {
  return <div className="customer-page-stack" aria-live="polite">{m.value ? <>{m.graphic}<p>{m.value}</p><p aria-live="off">Refreshes in {m.remainingSeconds}s</p></> : <Notice>{m.loading ? "Loading arrival QR code…" : m.error}</Notice>}{m.error ? <Button type="button" variant="outline" onClick={m.onRetry}>Retry QR code</Button> : null}</div>;
}
export function CustomerArrivalStatus({ message }: { message: string }) { return <Notice>{message}</Notice>; }
