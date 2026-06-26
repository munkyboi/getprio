import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Paper, PasswordInput, SimpleGrid, Stack, Text, TextInput, Title } from "@mantine/core";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import type { RegisterCustomerRequest, UsernameAvailabilityResponse } from "@shared";
import SocialAuthButtons from "../components/SocialAuthButtons";
import { apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../utils/errors";
import { buildUsernameFromName, isUsernameFormatValid, normalizeUsernameInput } from "../utils/usernames";

export default function RegisterCustomerPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { loading, registerCustomer, user } = useAuth();
  const registrationState = (location.state as {
    prefill?: Partial<RegisterCustomerRequest>;
    redirectTo?: string;
  } | null) || null;
  const redirectTo = registrationState?.redirectTo || "/";
  const [form, setForm] = useState<RegisterCustomerRequest>({
    name: registrationState?.prefill?.name || "",
    username: buildUsernameFromName(registrationState?.prefill?.name || ""),
    email: registrationState?.prefill?.email || "",
    phone: registrationState?.prefill?.phone || "",
    password: ""
  });
  const [error, setError] = useState("");
  const [usernameMessage, setUsernameMessage] = useState("");
  const [usernameAvailable, setUsernameAvailable] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user && !user.tenants?.length) {
      navigate(redirectTo, { replace: true });
    }
  }, [navigate, redirectTo, user]);

  useEffect(() => {
    const username = form.username.trim();
    setUsernameAvailable(false);

    if (!username) {
      setUsernameMessage("");
      setCheckingUsername(false);
      return undefined;
    }

    if (!isUsernameFormatValid(username)) {
      setUsernameMessage("Use 3-30 lowercase letters, numbers, or underscores.");
      setCheckingUsername(false);
      return undefined;
    }

    setCheckingUsername(true);
    const controller = new AbortController();
    let isCurrent = true;
    const timeout = window.setTimeout(() => {
      apiRequest<UsernameAvailabilityResponse>(
        `/auth/username-availability?username=${encodeURIComponent(username)}`,
        { signal: controller.signal }
      )
        .then((response) => {
          if (!isCurrent) {
            return;
          }
          setUsernameAvailable(response.available && response.valid);
          setUsernameMessage(response.message);
        })
        .catch((availabilityError) => {
          if (!isCurrent || (availabilityError instanceof DOMException && availabilityError.name === "AbortError")) {
            return;
          }
          setUsernameAvailable(false);
          setUsernameMessage(getErrorMessage(availabilityError));
        })
        .finally(() => {
          if (isCurrent) {
            setCheckingUsername(false);
          }
        });
    }, 300);

    return () => {
      isCurrent = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [form.username]);

  if (loading) {
    return <Paper className="finazze-auth-card" p="xl">Loading session...</Paper>;
  }

  if (user && !user.tenants?.length) {
    return <Navigate to={redirectTo} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!usernameAvailable) {
      setError(usernameMessage || "Choose an available username before creating your account.");
      return;
    }

    setSubmitting(true);

    try {
      await registerCustomer(form);
      navigate(redirectTo, { replace: true });
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
            <TextInput
              name="name"
              label="Name"
              required
              value={form.name}
              onChange={(event) => {
                const nextName = event.target.value;
                setForm((current) => ({
                  ...current,
                  name: nextName,
                  username: usernameEdited ? current.username : buildUsernameFromName(nextName)
                }));
              }}
            />
            <TextInput
              description={checkingUsername ? "Checking username..." : usernameMessage}
              error={form.username && usernameMessage && !usernameAvailable ? usernameMessage : undefined}
              label="Username"
              name="username"
              placeholder="customer_name"
              required
              value={form.username}
              onChange={(event) => {
                setUsernameEdited(true);
                setForm((current) => ({
                  ...current,
                  username: normalizeUsernameInput(event.target.value)
                }));
              }}
            />
            <TextInput name="email" label="Email" required type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
            <TextInput name="phone" label="Phone" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
            <PasswordInput name="password" label="Password" required value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
            {error ? <Alert color="red">{error}</Alert> : null}
            <Button color="dark" disabled={submitting || checkingUsername || !usernameAvailable} type="submit">
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
