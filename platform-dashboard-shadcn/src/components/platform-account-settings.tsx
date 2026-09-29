import { useCallback, useEffect, useState, type FormEvent } from "react"
import { AlertCircle, Check, Copy, KeyRound, LoaderCircle, Mail, ShieldCheck, UserRound } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PlatformAuthError, platformAuth, type PlatformAuthUser, type PlatformEmailChangeDelivery, type PlatformTotpEnrollment } from "@/lib/platform-auth"

type Props = { live: boolean; onPasswordChanged: () => void; onSessionExpired: () => void }
type EmailChangeState = PlatformEmailChangeDelivery & { newEmail: string }

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function PlatformAccountSettings({ live, onPasswordChanged, onSessionExpired }: Props) {
  const [user, setUser] = useState<PlatformAuthUser | null>(null)
  const [loading, setLoading] = useState(live)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [profileName, setProfileName] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [newEmail, setNewEmail] = useState("")
  const [emailCode, setEmailCode] = useState("")
  const [emailChange, setEmailChange] = useState<EmailChangeState | null>(null)
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailMessage, setEmailMessage] = useState<string | null>(null)
  const [currentPassword, setCurrentPassword] = useState("")
  const [nextPassword, setNextPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [enrollment, setEnrollment] = useState<PlatformTotpEnrollment | null>(null)
  const [enrollmentCurrentCode, setEnrollmentCurrentCode] = useState("")
  const [authenticatorCode, setAuthenticatorCode] = useState("")
  const [authenticatorBusy, setAuthenticatorBusy] = useState(false)
  const [authenticatorError, setAuthenticatorError] = useState<string | null>(null)
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [emailOtpPassword, setEmailOtpPassword] = useState("")
  const [emailOtpBusy, setEmailOtpBusy] = useState(false)
  const [emailOtpError, setEmailOtpError] = useState<string | null>(null)
  const [emailOtpMessage, setEmailOtpMessage] = useState<string | null>(null)
  const [copiedRecoveryCodes, setCopiedRecoveryCodes] = useState(false)

  const reportRequestError = useCallback((error: unknown, fallback: string, setError: (message: string) => void) => {
    if (error instanceof PlatformAuthError && error.status === 401) onSessionExpired()
    setError(errorMessage(error, fallback))
  }, [onSessionExpired])

  const syncUser = (nextUser: PlatformAuthUser) => {
    setUser(nextUser)
    setProfileName(nextUser.name || "")
    setDisplayName(nextUser.displayName || "")
  }

  const reloadUser = async () => {
    const session = await platformAuth.getSession()
    syncUser(session.user)
  }

  useEffect(() => {
    if (!live) return
    let mounted = true
    platformAuth.getSession().then((session) => {
      if (mounted) syncUser(session.user)
    }).catch((error: unknown) => {
      if (mounted) reportRequestError(error, "Unable to load your account details.", setLoadError)
    }).finally(() => {
      if (mounted) setLoading(false)
    })
    return () => { mounted = false }
  }, [live, reportRequestError])

  const submitProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setProfileBusy(true); setProfileError(null); setProfileMessage(null)
    try {
      await platformAuth.updateProfile(profileName.trim(), displayName.trim())
      await reloadUser()
      setProfileMessage("Profile updated.")
    } catch (error) {
      reportRequestError(error, "Unable to update your profile.", setProfileError)
    } finally { setProfileBusy(false) }
  }

  const startEmailChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setEmailBusy(true); setEmailError(null); setEmailMessage(null)
    try {
      const delivery = await platformAuth.startEmailChange(newEmail.trim())
      setEmailChange({ ...delivery, newEmail: newEmail.trim() })
      setEmailCode("")
      setEmailMessage(`A verification code was sent to ${delivery.deliveryTarget}.`)
    } catch (error) {
      reportRequestError(error, "Unable to start the email change.", setEmailError)
    } finally { setEmailBusy(false) }
  }

  const verifyEmailCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!emailChange) return
    setEmailBusy(true); setEmailError(null); setEmailMessage(null)
    try {
      if (emailChange.step === "current_email") {
        const delivery = await platformAuth.verifyCurrentEmailChange(emailChange.challengeId, emailCode.trim())
        setEmailChange({ ...delivery, newEmail: emailChange.newEmail })
        setEmailCode("")
        setEmailMessage(`Current email verified. A new code was sent to ${delivery.deliveryTarget}.`)
      } else {
        await platformAuth.verifyNewEmailChange(emailChange.challengeId, emailCode.trim())
        await reloadUser()
        setEmailChange(null); setEmailCode(""); setNewEmail("")
        setEmailMessage("Email address updated and verified.")
      }
    } catch (error) {
      reportRequestError(error, "Unable to verify this code.", setEmailError)
    } finally { setEmailBusy(false) }
  }

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPasswordError(null)
    if (nextPassword !== confirmPassword) { setPasswordError("The new passwords do not match."); return }
    setPasswordBusy(true)
    try {
      await platformAuth.changePassword(currentPassword, nextPassword)
      onPasswordChanged()
    } catch (error) {
      reportRequestError(error, "Unable to change your password.", setPasswordError)
    } finally { setPasswordBusy(false) }
  }

  const startAuthenticator = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAuthenticatorBusy(true); setAuthenticatorError(null); setRecoveryCodes(null)
    try {
      setEnrollment(await platformAuth.startAuthenticatorEnrollment(enrollmentCurrentCode.trim() || undefined))
      setAuthenticatorCode("")
    } catch (error) {
      reportRequestError(error, "Unable to start authenticator setup.", setAuthenticatorError)
    } finally { setAuthenticatorBusy(false) }
  }

  const confirmAuthenticator = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAuthenticatorBusy(true); setAuthenticatorError(null)
    try {
      const result = await platformAuth.confirmAuthenticatorEnrollment(authenticatorCode.trim())
      setRecoveryCodes(result.recoveryCodes)
      setEnrollment(null); setAuthenticatorCode(""); setEnrollmentCurrentCode("")
      await reloadUser()
    } catch (error) {
      reportRequestError(error, "Unable to verify the authenticator code.", setAuthenticatorError)
    } finally { setAuthenticatorBusy(false) }
  }

  const cancelAuthenticator = async () => {
    setAuthenticatorBusy(true); setAuthenticatorError(null)
    try {
      await platformAuth.cancelAuthenticatorEnrollment()
      setEnrollment(null); setAuthenticatorCode(""); setEnrollmentCurrentCode("")
    } catch (error) {
      reportRequestError(error, "Unable to cancel authenticator setup.", setAuthenticatorError)
    } finally { setAuthenticatorBusy(false) }
  }

  const enableEmailOtp = async () => {
    setEmailOtpBusy(true); setEmailOtpError(null); setEmailOtpMessage(null)
    try {
      await platformAuth.enableEmailOtp()
      await reloadUser()
      setEmailOtpMessage("Email one-time codes are enabled.")
    } catch (error) {
      reportRequestError(error, "Unable to enable email one-time codes.", setEmailOtpError)
    } finally { setEmailOtpBusy(false) }
  }

  const disableEmailOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setEmailOtpBusy(true); setEmailOtpError(null); setEmailOtpMessage(null)
    try {
      await platformAuth.disableEmailOtp(emailOtpPassword)
      await reloadUser()
      setEmailOtpPassword("")
      setEmailOtpMessage("Email one-time codes are disabled. Keep another MFA method active for Platform access.")
    } catch (error) {
      reportRequestError(error, "Unable to disable email one-time codes.", setEmailOtpError)
    } finally { setEmailOtpBusy(false) }
  }

  const copyRecoveryCodes = async () => {
    if (!recoveryCodes) return
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"))
      setCopiedRecoveryCodes(true)
    } catch {
      setAuthenticatorError("Clipboard access is unavailable. Select and copy the recovery codes manually.")
    }
  }

  if (loading) return <div className="grid min-h-60 place-items-center text-sm text-muted-foreground"><span className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" />Loading account settings…</span></div>

  return <div className="grid gap-6">
    <div className="grid gap-1"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Your account</p><h1 className="text-3xl font-semibold tracking-tight md:text-4xl">My account</h1><p className="max-w-2xl text-muted-foreground">Manage your profile and the credentials you use to sign in to the Platform.</p></div>
    {!live ? <Alert><AlertCircle /><AlertTitle>Account controls are read-only in fixture mode</AlertTitle><AlertDescription>Switch to an authenticated live Platform session to load and update account details. No profile, password, email, or MFA requests are sent from this preview.</AlertDescription></Alert> : null}
    {loadError ? <Alert variant="destructive"><AlertCircle /><AlertTitle>Could not load account</AlertTitle><AlertDescription>{loadError}</AlertDescription></Alert> : null}
    {live && user ? <Tabs defaultValue="profile" className="w-full">
      <TabsList variant="line" className="h-12 w-full justify-start gap-2 rounded-none p-0 sm:w-fit"><TabsTrigger size="lg" value="profile"><UserRound data-icon="inline-start" />Profile</TabsTrigger><TabsTrigger size="lg" value="security"><ShieldCheck data-icon="inline-start" />Security</TabsTrigger></TabsList>
      <TabsContent value="profile" className="mt-5 grid max-w-3xl gap-4">
        <Card><CardHeader><CardTitle>Profile details</CardTitle><CardDescription>Update the name shown across your Platform account.</CardDescription></CardHeader><CardContent><form onSubmit={submitProfile} className="grid gap-4"><FieldGroup className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="account-name">Full name</FieldLabel><Input id="account-name" autoComplete="name" value={profileName} onChange={(event) => setProfileName(event.target.value)} required maxLength={120} disabled={profileBusy} /></Field><Field><FieldLabel htmlFor="account-display-name">Display name</FieldLabel><Input id="account-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} disabled={profileBusy} /><FieldDescription>Optional. Leave blank to use your full name in the Platform.</FieldDescription></Field></FieldGroup>{profileError ? <FieldError>{profileError}</FieldError> : null}{profileMessage ? <p role="status" className="text-sm text-success">{profileMessage}</p> : null}<div><Button type="submit" disabled={profileBusy || !profileName.trim()}>{profileBusy ? "Saving…" : "Save profile"}</Button></div></form></CardContent></Card>
        <Card><CardHeader><CardTitle>Email address</CardTitle><CardDescription>Your email is used for account notices and can also be an MFA delivery method.</CardDescription></CardHeader><CardContent className="grid gap-4"><div className="flex flex-wrap items-center gap-2"><Mail className="size-4 text-muted-foreground" /><span className="font-medium">{user.email || "No email address on file"}</span>{user.email ? <Badge variant={user.emailVerified ? "success" : "warning"}>{user.emailVerified ? "Verified" : "Not verified"}</Badge> : null}</div>{emailChange ? <form onSubmit={verifyEmailCode} className="grid gap-4 rounded-lg border p-4"><div className="grid gap-1"><p className="text-sm font-medium">{emailChange.step === "current_email" ? "Verify your current email" : "Verify your new email"}</p><p className="text-sm text-muted-foreground">Enter the code sent to {emailChange.deliveryTarget}. This confirms both the old and new addresses before the change is applied.</p></div><Field><FieldLabel htmlFor="email-change-code">Six-digit code</FieldLabel><Input id="email-change-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={emailCode} onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required disabled={emailBusy} /></Field>{emailError ? <FieldError>{emailError}</FieldError> : null}{emailMessage ? <p role="status" className="text-sm text-muted-foreground">{emailMessage}</p> : null}<div className="flex flex-wrap gap-2"><Button type="submit" disabled={emailBusy || emailCode.length !== 6}>{emailBusy ? "Verifying…" : emailChange.step === "current_email" ? "Verify current email" : "Verify new email"}</Button><Button type="button" variant="outline" onClick={() => { setEmailChange(null); setEmailCode(""); setEmailError(null); setEmailMessage(null) }} disabled={emailBusy}>Cancel</Button></div></form> : <form onSubmit={startEmailChange} className="grid gap-4"><Field><FieldLabel htmlFor="new-account-email">Change email address</FieldLabel><Input id="new-account-email" type="email" autoComplete="email" placeholder="name@example.com" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} required disabled={emailBusy} /><FieldDescription>We’ll send one code to your current address, then a second code to the new address.</FieldDescription></Field>{emailError ? <FieldError>{emailError}</FieldError> : null}{emailMessage ? <p role="status" className="text-sm text-success">{emailMessage}</p> : null}<div><Button type="submit" variant="outline" disabled={emailBusy || !newEmail.trim()}>{emailBusy ? "Sending code…" : "Verify and change email"}</Button></div></form>}</CardContent></Card>
      </TabsContent>
      <TabsContent value="security" className="mt-5 grid max-w-3xl gap-4">
        <Card><CardHeader><CardTitle>Password</CardTitle><CardDescription>Changing your password revokes active sessions. You’ll be returned to sign in when it succeeds.</CardDescription></CardHeader><CardContent><form onSubmit={submitPassword} className="grid gap-4"><FieldGroup className="grid gap-4 sm:grid-cols-2"><Field className="sm:col-span-2"><FieldLabel htmlFor="current-password">Current password</FieldLabel><Input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required disabled={passwordBusy || user.hasPassword === false} /></Field><Field><FieldLabel htmlFor="new-password">New password</FieldLabel><Input id="new-password" type="password" autoComplete="new-password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} required disabled={passwordBusy || user.hasPassword === false} /></Field><Field><FieldLabel htmlFor="confirm-password">Confirm new password</FieldLabel><Input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required disabled={passwordBusy || user.hasPassword === false} /></Field></FieldGroup>{user.hasPassword === false ? <FieldDescription>This account does not have a password credential to change. Contact your administrator if you need to add one.</FieldDescription> : null}{passwordError ? <FieldError>{passwordError}</FieldError> : null}<div><Button type="submit" disabled={passwordBusy || user.hasPassword === false || !currentPassword || !nextPassword || !confirmPassword}><KeyRound data-icon="inline-start" />{passwordBusy ? "Changing password…" : "Change password"}</Button></div></form></CardContent></Card>
        <Card><CardHeader><CardTitle>Authenticator app</CardTitle><CardDescription>{user.mfaEnabled ? "Multi-factor authentication is active for this account." : "Add a time-based code from an authenticator app for sign-in."}{user.mfaRequired ? " Platform admin accounts must keep MFA enabled." : ""}</CardDescription></CardHeader><CardContent className="grid gap-4">{recoveryCodes ? <div className="grid gap-3 rounded-lg border border-success/30 bg-success/5 p-4"><div><p className="font-medium">Save your recovery codes now</p><p className="text-sm text-muted-foreground">These are shown only once. Store them somewhere secure; each code can be used once.</p></div><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{recoveryCodes.map((code) => <code key={code} className="rounded bg-muted px-3 py-2 text-sm">{code}</code>)}</div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={copyRecoveryCodes}><Copy data-icon="inline-start" />{copiedRecoveryCodes ? "Copied" : "Copy recovery codes"}</Button><Button type="button" onClick={() => { setRecoveryCodes(null); setCopiedRecoveryCodes(false) }}><Check data-icon="inline-start" />I’ve saved these</Button></div></div> : enrollment ? <><div className="grid gap-2 rounded-lg border bg-muted/20 p-4"><p className="text-sm font-medium">Add this key in your authenticator app</p><p className="text-sm text-muted-foreground">Enter the secret manually, or use an app that accepts an otpauth link. Keep the secret private.</p><Field><FieldLabel htmlFor="totp-secret">Setup key</FieldLabel><Input id="totp-secret" readOnly value={enrollment.secret} onFocus={(event) => event.currentTarget.select()} /></Field><Field><FieldLabel htmlFor="totp-uri">Authenticator link</FieldLabel><Input id="totp-uri" readOnly value={enrollment.otpAuthUri} onFocus={(event) => event.currentTarget.select()} /></Field></div><form onSubmit={confirmAuthenticator} className="grid gap-3"><Field><FieldLabel htmlFor="authenticator-confirm-code">Code from your app</FieldLabel><Input id="authenticator-confirm-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={authenticatorCode} onChange={(event) => setAuthenticatorCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required disabled={authenticatorBusy} /></Field>{authenticatorError ? <FieldError>{authenticatorError}</FieldError> : null}<div className="flex flex-wrap gap-2"><Button type="submit" disabled={authenticatorBusy || authenticatorCode.length !== 6}>{authenticatorBusy ? "Verifying…" : "Verify and enable"}</Button><Button type="button" variant="outline" onClick={cancelAuthenticator} disabled={authenticatorBusy}>Cancel setup</Button></div></form></> : <form onSubmit={startAuthenticator} className="grid gap-3"><Field><FieldLabel htmlFor="current-authenticator-code">Current authenticator code (if replacing)</FieldLabel><Input id="current-authenticator-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={enrollmentCurrentCode} onChange={(event) => setEnrollmentCurrentCode(event.target.value.replace(/\D/g, "").slice(0, 6))} /><FieldDescription>Leave blank for first-time setup. The server will verify a current authenticator code when an existing authenticator must be replaced.</FieldDescription></Field><Button type="submit" variant="outline" disabled={authenticatorBusy}>{authenticatorBusy ? "Preparing…" : user.mfaEnabled ? "Set up or replace authenticator" : "Set up authenticator"}</Button>{authenticatorError ? <FieldError>{authenticatorError}</FieldError> : null}</form>}</CardContent></Card>
        <Card><CardHeader><CardTitle>Email one-time codes</CardTitle><CardDescription>{user.emailVerified ? `Use a code sent to ${user.email || "your verified email"} as an additional sign-in option.` : "Verify your email address before enabling email one-time codes."}</CardDescription></CardHeader><CardContent className="grid gap-4"><div className="flex flex-wrap items-center gap-2"><span className="text-sm">Email OTP</span><Badge variant={user.emailMfaEnabled ? "success" : "secondary"}>{user.emailMfaEnabled ? "Enabled" : "Disabled"}</Badge>{user.mfaRequired ? <Badge variant="outline">MFA required</Badge> : null}</div><p className="text-sm text-muted-foreground">Platform admin accounts must retain at least one MFA method. This control only enables or disables email codes; it does not turn off the authenticator requirement.</p>{emailOtpError ? <FieldError>{emailOtpError}</FieldError> : null}{emailOtpMessage ? <p role="status" className="text-sm text-success">{emailOtpMessage}</p> : null}{user.emailMfaEnabled ? <form onSubmit={disableEmailOtp} className="grid gap-3 sm:max-w-sm"><Field><FieldLabel htmlFor="email-otp-password">Confirm password to disable email OTP</FieldLabel><Input id="email-otp-password" type="password" autoComplete="current-password" value={emailOtpPassword} onChange={(event) => setEmailOtpPassword(event.target.value)} required disabled={emailOtpBusy || user.hasPassword === false} /></Field><Button type="submit" variant="outline" disabled={emailOtpBusy || user.hasPassword === false || !emailOtpPassword}>{emailOtpBusy ? "Updating…" : "Disable email OTP"}</Button></form> : <Button type="button" variant="outline" className="w-fit" onClick={enableEmailOtp} disabled={emailOtpBusy || !user.emailVerified}>{emailOtpBusy ? "Enabling…" : "Enable email OTP"}</Button>}</CardContent></Card>
      </TabsContent>
    </Tabs> : null}
  </div>
}

export { PlatformAccountSettings }
