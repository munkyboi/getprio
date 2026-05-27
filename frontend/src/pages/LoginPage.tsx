import { useEffect, useState, type FormEvent } from "react";
import { Alert, Anchor, Button, Paper, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
import { Navigate, Link, useNavigate, useSearchParams } from "react-router-dom";
import type { LoginRequest } from "@shared";
import SocialAuthButtons from "../components/SocialAuthButtons";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../utils/errors";

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, loading, user } = useAuth();
  const redirectTo = searchParams.get("redirect") || "";
  const safeRedirectTo =
    redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : "";
  const [form, setForm] = useState<LoginRequest>({ email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user && safeRedirectTo) {
      navigate(safeRedirectTo, { replace: true });
      return;
    }

    if (user?.tenants?.length) {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate, safeRedirectTo, user]);

  if (loading) {
    return <Paper className="finazze-auth-card" p="xl">Loading session...</Paper>;
  }

  if (user && !user.tenants?.length && !safeRedirectTo) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const result = await login(form);
      navigate(safeRedirectTo || (result.user.tenants.length ? "/dashboard" : "/"), { replace: true });
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Paper className="finazze-auth-card" p={{ base: "xl", md: 44 }}>
      <Stack gap="lg">
        <div>
          <Text className="finazze-section-label">Sign in</Text>
          <Title order={1}>Access your workspace.</Title>
          <Text c="dimmed" mt="sm">
            Continue to your vendor dashboard or customer account with your secure Prio session.
          </Text>
        </div>
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <TextInput
              label="Email"
              name="email"
              required
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            />
            <PasswordInput
              label="Password"
              name="password"
              required
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            />
            {error ? <Alert color="red">{error}</Alert> : null}
            <Button color="dark" disabled={submitting} size="md" type="submit">
              {submitting ? "Signing in..." : "Sign in"}
            </Button>
          </Stack>
        </form>
        <SocialAuthButtons intent="login" />
        <Text c="dimmed" size="sm">
          New here?{" "}
          <Anchor component={Link} to="/register/vendor">Create a vendor workspace</Anchor> or{" "}
          <Anchor component={Link} to="/register/customer">register as a customer</Anchor>.
        </Text>
      </Stack>
    </Paper>
  );
}
