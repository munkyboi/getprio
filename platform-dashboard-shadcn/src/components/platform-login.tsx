import { useEffect, useRef, useState, type FormEvent } from "react"
import { LockKeyhole, Moon, Sun } from "lucide-react"
import { REGEXP_ONLY_DIGITS } from "input-otp"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp"
import { PlatformAuthError, platformAuth, type PlatformAuthSession, type PlatformMfaMethod } from "@/lib/platform-auth"

export function PlatformLogin({ dark, onToggleTheme, onAuthenticated }: { dark: boolean; onToggleTheme: () => void; onAuthenticated: (session: PlatformAuthSession) => void }) {
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [challengeToken, setChallengeToken] = useState("")
  const [primaryChallengeToken, setPrimaryChallengeToken] = useState("")
  const [methods, setMethods] = useState<PlatformMfaMethod[]>([])
  const [method, setMethod] = useState<PlatformMfaMethod>("totp")
  const [deliveryTarget, setDeliveryTarget] = useState("")
  const [emailSent, setEmailSent] = useState(false)
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const verificationInFlight = useRef(false)
  const otpInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!challengeToken || (method === "email" && !emailSent)) return

    const frame = window.requestAnimationFrame(() => {
      otpInputRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [challengeToken, method, emailSent])

  async function verifyCode(value: string) {
    if (verificationInFlight.current || value.length !== 6 || !challengeToken || (method === "email" && !emailSent)) return
    verificationInFlight.current = true
    setSubmitting(true)
    setError(null)
    try {
      onAuthenticated(await platformAuth.verifyMfa(challengeToken, value, method))
    } catch (verifyError) {
      setError(verifyError instanceof PlatformAuthError ? verifyError.message : "Unable to verify the code. Please try again.")
      setCode("")
    } finally {
      verificationInFlight.current = false
      setSubmitting(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (challengeToken) {
      await verifyCode(code)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const response = await platformAuth.login(identifier, password)
      if ("user" in response) {
        onAuthenticated(response)
      } else {
        const availableMethods: PlatformMfaMethod[] = response.methods?.length ? response.methods : ["totp", "recovery"]
        const initialMethod = availableMethods.includes("totp") ? "totp" : availableMethods.includes("email") ? "email" : "totp"
        setMethods(availableMethods)
        setMethod(initialMethod)
        setPrimaryChallengeToken(response.challengeToken)
        setChallengeToken(response.challengeToken)
        setEmailSent(false)
        setDeliveryTarget("")
      }
    } catch (loginError) {
      setError(loginError instanceof PlatformAuthError ? loginError.message : "Unable to sign in. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  async function sendEmailCode() {
    if (!primaryChallengeToken) return
    setSubmitting(true)
    setError(null)
    try {
      const delivery = await platformAuth.sendEmailMfa(primaryChallengeToken)
      setChallengeToken(delivery.challengeToken)
      setDeliveryTarget(delivery.deliveryTarget)
      setEmailSent(true)
      setMethod("email")
      setCode("")
    } catch (sendError) {
      setError(sendError instanceof PlatformAuthError ? sendError.message : "Unable to send an email code. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  function switchToTotp() {
    setMethod("totp")
    setCode("")
    setError(null)
    setChallengeToken(primaryChallengeToken)
    setDeliveryTarget("")
    setEmailSent(false)
  }

  function resetMfaChallenge() {
    setChallengeToken("")
    setPrimaryChallengeToken("")
    setMethods([])
    setMethod("totp")
    setDeliveryTarget("")
    setEmailSent(false)
    setCode("")
    setError(null)
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="grid w-full max-w-sm gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold"><img src={dark ? "/logo-dark.svg" : "/logo.svg"} alt="" className="size-8 object-contain" /> GetPrio <span className="font-normal text-muted-foreground">Platform</span></div>
          <Button variant="ghost" size="icon" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} onClick={onToggleTheme}>{dark ? <Sun /> : <Moon />}</Button>
        </div>
        <Card>
          <CardHeader>
            <div className="mb-2 grid size-10 place-items-center rounded-lg bg-brand-subtle text-brand"><LockKeyhole className="size-5" /></div>
            <CardTitle>{challengeToken ? "Verify your sign-in" : "Sign in to Platform"}</CardTitle>
            <CardDescription>{challengeToken ? method === "email" ? deliveryTarget ? `Enter the six-digit code sent to ${deliveryTarget}.` : "Send a six-digit code to your verified email address." : "Enter the six-digit code from your authenticator app to finish signing in." : "Use your Platform admin account to access the control plane."}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={submit}>
              {challengeToken ? <>
                {method === "email" && emailSent ? <p className="text-xs text-muted-foreground">A new code was sent. It expires shortly.</p> : null}
                {(method === "totp" || emailSent) ? <label className="grid gap-2 text-sm font-medium">{method === "email" ? "Email code" : "Authenticator code"}<InputOTP ref={otpInputRef} containerClassName="w-full justify-center sm:gap-2" autoFocus maxLength={6} pattern={REGEXP_ONLY_DIGITS} value={code} onChange={setCode} onComplete={(value) => void verifyCode(value)} aria-label={method === "email" ? "Email verification code" : "Authenticator verification code"}>
                  <InputOTPGroup><InputOTPSlot className="size-10 text-base sm:size-12 sm:text-lg" index={0} /><InputOTPSlot className="size-10 text-base sm:size-12 sm:text-lg" index={1} /><InputOTPSlot className="size-10 text-base sm:size-12 sm:text-lg" index={2} /></InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup><InputOTPSlot className="size-10 text-base sm:size-12 sm:text-lg" index={3} /><InputOTPSlot className="size-10 text-base sm:size-12 sm:text-lg" index={4} /><InputOTPSlot className="size-10 text-base sm:size-12 sm:text-lg" index={5} /></InputOTPGroup>
                </InputOTP></label> : null}
              </> : <><label className="grid gap-2 text-sm font-medium">Email or username<Input autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} /></label><label className="grid gap-2 text-sm font-medium">Password<Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label></>}
              {error ? <Alert variant="destructive"><AlertTitle>Sign-in failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
              {challengeToken ? submitting ? <p role="status" aria-live="polite" className="text-center text-sm text-muted-foreground">Verifying code…</p> : null : <Button type="submit" disabled={submitting || !identifier || !password}>{submitting ? "Signing in…" : "Continue"}</Button>}
              {challengeToken && method === "totp" && methods.includes("email") ? <Button type="button" variant="link" className="h-auto justify-self-center px-0 text-sm" onClick={sendEmailCode} disabled={submitting}>{submitting ? "Sending…" : "Send email OTP instead"}</Button> : null}
              {challengeToken && method === "email" && emailSent ? <Button type="button" variant="link" className="h-auto justify-self-center px-0 text-sm" onClick={switchToTotp} disabled={submitting}>Use authenticator app instead</Button> : null}
              {challengeToken ? <Button type="button" variant="ghost" onClick={resetMfaChallenge}>Use a different account</Button> : null}
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground">Platform admin access is protected by the existing session, CSRF, and MFA policies.</p>
      </div>
    </main>
  )
}
