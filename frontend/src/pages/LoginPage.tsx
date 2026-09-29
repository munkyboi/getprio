import { useEffect, useState, type FormEvent } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, Anchor, Button, Paper, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
import { Navigate, Link, useNavigate, useSearchParams } from "react-router-dom";
import SocialAuthButtons from "../components/SocialAuthButtons";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../utils/errors";

function getSafeRedirectPath(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}

const signInSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your email address or username."),
  password: z.string().min(1, "Enter your password.")
});

const resetRequestSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.")
});

const resetConfirmSchema = z.object({
  token: z.string().trim().min(1, "Missing reset token."),
  newPassword: z.string().min(8, "Use at least 8 characters.")
});

type SignInValues = z.infer<typeof signInSchema>;
type ResetRequestValues = z.infer<typeof resetRequestSchema>;
type ResetConfirmValues = z.infer<typeof resetConfirmSchema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { login, loading, requestPasswordReset, confirmPasswordReset, verifyMfaChallenge, sendEmailMfaCode, user } = useAuth();
  const resetToken = searchParams.get("resetToken") || "";
  const passwordChanged = searchParams.get("passwordChanged") === "1";
  const passwordResetSuccess = searchParams.get("reset") === "success";
  const nextPath = getSafeRedirectPath(searchParams.get("next"));
  const [showResetRequest, setShowResetRequest] = useState(false);
  const [error, setError] = useState("");
  const [resetRequestMessage, setResetRequestMessage] = useState("");
  const [resetConfirmMessage, setResetConfirmMessage] = useState("");
  const [mfaChallengeToken, setMfaChallengeToken] = useState("");
  const [mfaLoginChallengeToken, setMfaLoginChallengeToken] = useState("");
  const [mfaMethods, setMfaMethods] = useState<Array<"totp" | "recovery" | "email">>([]);
  const [emailMfaActive, setEmailMfaActive] = useState(false);
  const [emailMfaDeliveryTarget, setEmailMfaDeliveryTarget] = useState("");
  const [emailMfaSent, setEmailMfaSent] = useState(false);
  const [emailMfaSending, setEmailMfaSending] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaRecoveryCode, setMfaRecoveryCode] = useState("");
  const [mfaSubmitting, setMfaSubmitting] = useState(false);

  const signInForm = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { identifier: "", password: "" }
  });
  const resetRequestForm = useForm<ResetRequestValues>({
    resolver: zodResolver(resetRequestSchema),
    defaultValues: { email: "" }
  });
  const resetConfirmForm = useForm<ResetConfirmValues>({
    resolver: zodResolver(resetConfirmSchema),
    defaultValues: { token: resetToken, newPassword: "" }
  });

  useEffect(() => {
    if (user?.tenants?.length) {
      navigate(user.mfaRequired && !user.mfaEnabled ? "/dashboard/account" : nextPath || "/dashboard", { replace: true });
    }
  }, [navigate, nextPath, user]);

  useEffect(() => {
    resetConfirmForm.setValue("token", resetToken);
  }, [resetToken, resetConfirmForm]);

  async function sendEmailOtp(challengeToken = mfaLoginChallengeToken) {
    if (!challengeToken || emailMfaSending) return;
    setError("");
    setEmailMfaActive(true);
    setEmailMfaSending(true);
    try {
      const result = await sendEmailMfaCode({ challengeToken });
      setMfaChallengeToken(result.token);
      setEmailMfaDeliveryTarget(result.deliveryTarget);
      setEmailMfaSent(true);
      setMfaCode("");
      setMfaRecoveryCode("");
    } catch (sendError) {
      setEmailMfaSent(false);
      setError(getErrorMessage(sendError));
    } finally {
      setEmailMfaSending(false);
    }
  }

  function returnToSignIn() {
    setMfaChallengeToken("");
    setMfaLoginChallengeToken("");
    setMfaMethods([]);
    setEmailMfaActive(false);
    setEmailMfaDeliveryTarget("");
    setEmailMfaSent(false);
    setMfaCode("");
    setMfaRecoveryCode("");
    setError("");
  }

  if (loading) {
    return <Paper className="finazze-auth-card" p="xl">Loading session...</Paper>;
  }

  if (user && !user.tenants?.length) {
    return <Navigate to={nextPath || "/"} replace />;
  }

  const handleSignIn = signInForm.handleSubmit(async (values) => {
    setError("");
    try {
      const result = await login(values);
      if ("mfaRequired" in result) {
        setMfaChallengeToken(result.challengeToken);
        setMfaLoginChallengeToken(result.challengeToken);
        setMfaMethods(result.methods);
        setEmailMfaActive(false);
        setEmailMfaDeliveryTarget("");
        setEmailMfaSent(false);
        if (result.methods.includes("email") && !result.methods.includes("totp")) {
          void sendEmailOtp(result.challengeToken);
        }
        return;
      }
      navigate(
        result.user.mfaRequired && !result.user.mfaEnabled
          ? "/dashboard/account"
          : nextPath || (result.user.tenants.length ? "/dashboard" : "/"),
        { replace: true }
      );
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    }
  });

  async function handleMfaVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMfaSubmitting(true);
    try {
      const result = await verifyMfaChallenge({
        challengeToken: mfaChallengeToken,
        ...(mfaRecoveryCode.trim() && !emailMfaActive ? { recoveryCode: mfaRecoveryCode } : { code: mfaCode }),
        ...(emailMfaActive ? { method: "email" as const } : {})
      });
      navigate(
        result.user.mfaRequired && !result.user.mfaEnabled
          ? "/dashboard/account"
          : nextPath || (result.user.tenants.length ? "/dashboard" : "/"),
        { replace: true }
      );
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setMfaSubmitting(false);
    }
  }

  const handlePasswordResetRequest = resetRequestForm.handleSubmit(async (values) => {
    setError("");
    setResetRequestMessage("");
    try {
      const result = await requestPasswordReset(values);
      setResetRequestMessage(result.message);
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    }
  });

  const handlePasswordResetConfirm = resetConfirmForm.handleSubmit(async (values) => {
    setError("");
    setResetConfirmMessage("");
    try {
      const result = await confirmPasswordReset(values);
      setResetConfirmMessage(result.message);
      signInForm.setValue("password", "");
      setSearchParams({ reset: "success" });
      resetConfirmForm.reset({ token: "", newPassword: "" });
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    }
  });

  return (
    <Paper className="finazze-auth-card" p={{ base: "xl", md: 44 }}>
      <Stack gap="lg">
        <div>
          <Text className="finazze-section-label">{resetToken ? "Reset password" : "Sign in"}</Text>
          <Title order={1}>{resetToken ? "Set a new password." : "Access your workspace."}</Title>
          <Text c="dimmed" mt="sm">
            {resetToken
              ? "Choose a new password for your account, then sign back in with the updated credentials."
              : "Continue to your vendor dashboard or customer account with your secure Prio session."}
          </Text>
        </div>
        {resetToken ? (
          <form onSubmit={handlePasswordResetConfirm}>
            <Stack gap="md">
              <PasswordInput
                label="New password"
                required
                error={resetConfirmForm.formState.errors.newPassword?.message}
                {...resetConfirmForm.register("newPassword")}
              />
              {error ? <Alert color="red">{error}</Alert> : null}
              {resetConfirmMessage ? <Alert color="teal">{resetConfirmMessage}</Alert> : null}
              <Button className="auth-primary-action" color="dark" loading={resetConfirmForm.formState.isSubmitting} size="lg" type="submit">
                Reset password
              </Button>
              <Anchor
                component="button"
                size="sm"
                type="button"
                onClick={() => {
                  setSearchParams({});
                  setError("");
                  setResetConfirmMessage("");
                }}
              >
                Back to sign in
              </Anchor>
            </Stack>
          </form>
        ) : (
          <>
            {mfaChallengeToken ? (
              <form onSubmit={handleMfaVerification}>
                <Stack gap="md">
                  <Alert color="blue">
                    {emailMfaActive
                      ? `Enter the six-digit code sent to ${emailMfaDeliveryTarget || "your verified email address"}. It expires in 10 minutes.`
                      : "For your security, confirm the code from your authenticator app. You can use one saved recovery code if your authenticator is unavailable."}
                  </Alert>
                  <TextInput
                    key={emailMfaActive ? "email-code" : "authenticator-code"}
                    autoComplete="one-time-code"
                    autoFocus
                    inputMode="numeric"
                    label={emailMfaActive ? "Email code" : "Authenticator code"}
                    maxLength={6}
                    value={mfaCode}
                    onChange={(event) => { setMfaCode(event.currentTarget.value.replace(/\D/g, "")); setMfaRecoveryCode(""); }}
                  />
                  {!emailMfaActive && mfaMethods.includes("recovery") ? (
                    <TextInput
                      label="Recovery code (optional)"
                      value={mfaRecoveryCode}
                      onChange={(event) => { setMfaRecoveryCode(event.currentTarget.value); setMfaCode(""); }}
                    />
                  ) : null}
                  {error ? <Alert color="red">{error}</Alert> : null}
                  <Button className="auth-primary-action" color="dark" loading={mfaSubmitting} size="lg" type="submit">
                    Confirm and sign in
                  </Button>
                  {mfaMethods.includes("totp") && mfaMethods.includes("email") && !emailMfaActive ? (
                    <Anchor component="button" disabled={emailMfaSending} type="button" onClick={() => void sendEmailOtp()}>
                      {emailMfaSending ? "Sending email OTP..." : "Send email OTP instead"}
                    </Anchor>
                  ) : null}
                  {emailMfaActive ? (
                    <>
                      <Anchor component="button" disabled={emailMfaSending} type="button" onClick={() => void sendEmailOtp()}>
                        {emailMfaSending ? "Sending email OTP..." : emailMfaSent ? "Resend email OTP" : "Send email OTP"}
                      </Anchor>
                      {mfaMethods.includes("totp") ? (
                        <Anchor component="button" type="button" onClick={() => {
                          setEmailMfaActive(false);
                          setMfaChallengeToken(mfaLoginChallengeToken);
                          setMfaCode("");
                          setMfaRecoveryCode("");
                          setError("");
                        }}>
                          Use authenticator app instead
                        </Anchor>
                      ) : null}
                    </>
                  ) : null}
                  <Anchor component="button" type="button" onClick={returnToSignIn}>
                    Return to sign in
                  </Anchor>
                </Stack>
              </form>
            ) : <form onSubmit={handleSignIn}>
              <Stack gap="md">
                <TextInput
                  label="Email or username"
                  required
                  autoComplete="username"
                  error={signInForm.formState.errors.identifier?.message}
                  {...signInForm.register("identifier")}
                />
                <PasswordInput
                  label="Password"
                  required
                  error={signInForm.formState.errors.password?.message}
                  {...signInForm.register("password")}
                />
                <Anchor
                  component="button"
                  size="sm"
                  type="button"
                  onClick={() => {
                    setShowResetRequest((current) => !current);
                    setError("");
                    setResetRequestMessage("");
                    const identifier = signInForm.getValues("identifier").trim();
                    resetRequestForm.setValue("email", identifier.includes("@") ? identifier : "");
                  }}
                >
                  Forgot password?
                </Anchor>
                {passwordChanged ? <Alert color="teal">Password updated. Sign in again with your new password.</Alert> : null}
                {passwordResetSuccess ? <Alert color="teal">Password reset complete. Sign in with your new password.</Alert> : null}
                {error ? <Alert color="red">{error}</Alert> : null}
                <Button className="auth-primary-action" color="dark" loading={signInForm.formState.isSubmitting} size="lg" type="submit">
                  Sign in
                </Button>
              </Stack>
            </form>}
            {showResetRequest ? (
              <form onSubmit={handlePasswordResetRequest}>
                <Stack gap="md">
                  <TextInput
                    label="Reset email"
                    required
                    type="email"
                    error={resetRequestForm.formState.errors.email?.message}
                    {...resetRequestForm.register("email")}
                  />
                  {resetRequestMessage ? <Alert color="teal">{resetRequestMessage}</Alert> : null}
                  <Button className="auth-primary-action" color="gray" loading={resetRequestForm.formState.isSubmitting} size="lg" type="submit" variant="light">
                    Send reset instructions
                  </Button>
                </Stack>
              </form>
            ) : null}
            <SocialAuthButtons iconOnly intent="login" />
          </>
        )}
        <Text c="dimmed" size="sm">
          New here?{" "}
          <Anchor component={Link} to="/register/vendor">Create a vendor workspace</Anchor> or{" "}
          <Anchor component={Link} to="/register/customer">register as a customer</Anchor>.
        </Text>
      </Stack>
    </Paper>
  );
}
