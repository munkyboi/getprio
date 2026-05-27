import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Paper, PasswordInput, SimpleGrid, Stack, Text, TextInput, Title } from "@mantine/core";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import type { RegisterCustomerRequest } from "@shared";
import SocialAuthButtons from "../components/SocialAuthButtons";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../utils/errors";

export default function RegisterCustomerPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { loading, registerCustomer, user } = useAuth();
  const redirectTo = searchParams.get("redirect") || "";
  const safeRedirectTo =
    redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : "";
  const [form, setForm] = useState<RegisterCustomerRequest>({
    name: "",
    email: "",
    phone: "",
    password: ""
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user && safeRedirectTo) {
      navigate(safeRedirectTo, { replace: true });
      return;
    }

    if (user && !user.tenants?.length) {
      navigate("/", { replace: true });
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
      await registerCustomer(form);
      navigate(safeRedirectTo || "/", { replace: true });
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Paper className="finazze-auth-card finazze-auth-card-wide onboarding-shell" p={{ base: "xl", md: 44 }}>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing={{ base: "xl", md: 36 }}>
      <Stack gap="lg">
        <div>
          <Text className="finazze-section-label">Customer account</Text>
          <Title order={1}>Queue remotely with saved contact details.</Title>
          <Text c="dimmed" mt="sm">
            Create your profile once, then use it when joining vendor queues online.
          </Text>
        </div>
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <TextInput label="Name" name="name" required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            <TextInput label="Email" name="email" required type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
            <TextInput label="Phone" name="phone" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
            <PasswordInput label="Password" name="password" required value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
            {error ? <Alert color="red">{error}</Alert> : null}
            <Button color="dark" disabled={submitting} type="submit">
              {submitting ? "Creating account..." : "Register account"}
            </Button>
          </Stack>
        </form>
        <SocialAuthButtons intent="register_customer" />
      </Stack>
      <Stack className="onboarding-art-panel" justify="space-between" gap="lg">
        <img
          alt="Illustration of a customer joining a GetPrio queue from a phone"
          className="onboarding-art"
          src="/illustrations/generated/customer-onboarding.png"
        />
        <div>
          <Text className="finazze-section-label">Wait on your terms</Text>
          <Text c="dimmed">
            Save your details once, join faster next time, and get alerted when your turn is near.
          </Text>
        </div>
      </Stack>
      </SimpleGrid>
    </Paper>
  );
}
