import { useEffect, useState } from "react";
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
  const { login, loading, requestPasswordReset, confirmPasswordReset, user } = useAuth();
  const resetToken = searchParams.get("resetToken") || "";
  const passwordChanged = searchParams.get("passwordChanged") === "1";
  const passwordResetSuccess = searchParams.get("reset") === "success";
  const nextPath = getSafeRedirectPath(searchParams.get("next"));
  const [showResetRequest, setShowResetRequest] = useState(false);
  const [error, setError] = useState("");
  const [resetRequestMessage, setResetRequestMessage] = useState("");
  const [resetConfirmMessage, setResetConfirmMessage] = useState("");

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
      navigate(nextPath || "/dashboard", { replace: true });
    }
  }, [navigate, nextPath, user]);

  useEffect(() => {
    resetConfirmForm.setValue("token", resetToken);
  }, [resetToken, resetConfirmForm]);

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
      navigate(nextPath || (result.user.tenants.length ? "/dashboard" : "/"), { replace: true });
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    }
  });

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
            <form onSubmit={handleSignIn}>
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
            </form>
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
            <SocialAuthButtons intent="login" />
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
