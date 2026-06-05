import { useEffect, useState, type FormEvent } from "react";
import { Alert, Anchor, Button, Paper, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
import { Navigate, Link, useNavigate, useSearchParams } from "react-router-dom";
import type { LoginRequest, PasswordResetConfirmRequest, PasswordResetRequest } from "@shared";
import SocialAuthButtons from "../components/SocialAuthButtons";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../utils/errors";

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { login, loading, requestPasswordReset, confirmPasswordReset, user } = useAuth();
  const [form, setForm] = useState<LoginRequest>({ email: "", password: "" });
  const [resetRequestForm, setResetRequestForm] = useState<PasswordResetRequest>({ email: "" });
  const [resetConfirmForm, setResetConfirmForm] = useState<PasswordResetConfirmRequest>({
    token: searchParams.get("resetToken") || "",
    newPassword: ""
  });
  const [error, setError] = useState("");
  const [resetRequestMessage, setResetRequestMessage] = useState("");
  const [resetConfirmMessage, setResetConfirmMessage] = useState("");
  const [showResetRequest, setShowResetRequest] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requestingReset, setRequestingReset] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const resetToken = searchParams.get("resetToken") || "";
  const passwordChanged = searchParams.get("passwordChanged") === "1";
  const passwordResetSuccess = searchParams.get("reset") === "success";

  useEffect(() => {
    if (user?.tenants?.length) {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate, user]);

  useEffect(() => {
    setResetConfirmForm((current) => ({
      ...current,
      token: resetToken
    }));
  }, [resetToken]);

  if (loading) {
    return <Paper className="finazze-auth-card" p="xl">Loading session...</Paper>;
  }

  if (user && !user.tenants?.length) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const result = await login(form);
      navigate(result.user.tenants.length ? "/dashboard" : "/", { replace: true });
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasswordResetRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResetRequestMessage("");
    setRequestingReset(true);

    try {
      const result = await requestPasswordReset(resetRequestForm);
      setResetRequestMessage(result.message);
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setRequestingReset(false);
    }
  }

  async function handlePasswordResetConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResetConfirmMessage("");
    setConfirmingReset(true);

    try {
      const result = await confirmPasswordReset(resetConfirmForm);
      setResetConfirmMessage(result.message);
      setForm((current) => ({
        ...current,
        password: ""
      }));
      setSearchParams({ reset: "success" });
      setResetConfirmForm({
        token: "",
        newPassword: ""
      });
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setConfirmingReset(false);
    }
  }

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
                value={resetConfirmForm.newPassword}
                onChange={(event) =>
                  setResetConfirmForm((current) => ({
                    ...current,
                    newPassword: event.target.value
                  }))
                }
              />
              {error ? <Alert color="red">{error}</Alert> : null}
              {resetConfirmMessage ? <Alert color="teal">{resetConfirmMessage}</Alert> : null}
              <Button color="dark" disabled={confirmingReset} size="md" type="submit">
                {confirmingReset ? "Updating password..." : "Reset password"}
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
            <form onSubmit={handleSubmit}>
              <Stack gap="md">
                <TextInput
                  label="Email"
                  required
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                />
                <PasswordInput
                  label="Password"
                  required
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                />
                <Anchor
                  component="button"
                  size="sm"
                  type="button"
                  onClick={() => {
                    setShowResetRequest((current) => !current);
                    setError("");
                    setResetRequestMessage("");
                    setResetRequestForm({
                      email: form.email
                    });
                  }}
                >
                  Forgot password?
                </Anchor>
                {passwordChanged ? (
                  <Alert color="teal">Password updated. Sign in again with your new password.</Alert>
                ) : null}
                {passwordResetSuccess ? (
                  <Alert color="teal">Password reset complete. Sign in with your new password.</Alert>
                ) : null}
                {error ? <Alert color="red">{error}</Alert> : null}
                <Button color="dark" disabled={submitting} size="md" type="submit">
                  {submitting ? "Signing in..." : "Sign in"}
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
                    value={resetRequestForm.email}
                    onChange={(event) =>
                      setResetRequestForm({
                        email: event.target.value
                      })
                    }
                  />
                  {resetRequestMessage ? <Alert color="teal">{resetRequestMessage}</Alert> : null}
                  <Button color="gray" disabled={requestingReset} size="md" type="submit" variant="light">
                    {requestingReset ? "Sending reset link..." : "Send reset instructions"}
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
