import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Alert, Button, Paper, PasswordInput, SimpleGrid, Stack, Text, TextInput, Title } from "@mantine/core";
import { useNavigate, useSearchParams } from "react-router-dom";
import type {
  OAuthProviderId,
  RegisterVendorRequest,
  TenantSlugAvailabilityResponse,
  UsernameAvailabilityResponse
} from "@shared";
import SocialAuthButtons from "../components/SocialAuthButtons";
import { apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../utils/errors";
import {
  buildTenantSlugFromName,
  buildUsernameFromName,
  isTenantSlugFormatValid,
  isUsernameFormatValid,
  normalizeTenantSlugInput,
  normalizeUsernameInput
} from "../utils/usernames";

const PROVIDER_LABELS: Record<OAuthProviderId, string> = {
  google: "Google",
  facebook: "Facebook"
};

export default function RegisterVendorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { completeVendorOnboarding, loading, registerVendor, token, user } = useAuth();
  const [form, setForm] = useState<RegisterVendorRequest>({
    tenantName: "",
    tenantSlug: "",
    name: "",
    username: "",
    email: "",
    phone: "",
    password: ""
  });
  const [error, setError] = useState("");
  const [usernameMessage, setUsernameMessage] = useState("");
  const [usernameAvailable, setUsernameAvailable] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [tenantSlugMessage, setTenantSlugMessage] = useState("");
  const [tenantSlugAvailable, setTenantSlugAvailable] = useState(false);
  const [checkingTenantSlug, setCheckingTenantSlug] = useState(false);
  const [tenantSlugEdited, setTenantSlugEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }

    setForm((current) => ({
      ...current,
      name: current.name || user.name || "",
      username: current.username || user.username || buildUsernameFromName(user.name || ""),
      email: current.email || user.email || "",
      phone: current.phone || user.phone || ""
    }));
  }, [user]);

  useEffect(() => {
    const tenantSlug = form.tenantSlug.trim();
    setTenantSlugAvailable(false);

    if (!tenantSlug) {
      setTenantSlugMessage("");
      setCheckingTenantSlug(false);
      return undefined;
    }

    if (!isTenantSlugFormatValid(tenantSlug)) {
      setTenantSlugMessage("Use 1-48 lowercase letters, numbers, or hyphens.");
      setCheckingTenantSlug(false);
      return undefined;
    }

    setCheckingTenantSlug(true);
    const controller = new AbortController();
    let isCurrent = true;
    const timeout = window.setTimeout(() => {
      apiRequest<TenantSlugAvailabilityResponse>(
        `/auth/tenant-slug-availability?tenantSlug=${encodeURIComponent(tenantSlug)}`,
        { signal: controller.signal }
      )
        .then((response) => {
          if (!isCurrent) {
            return;
          }
          setTenantSlugAvailable(response.available && response.valid);
          setTenantSlugMessage(response.message);
        })
        .catch((availabilityError) => {
          if (!isCurrent || (availabilityError instanceof DOMException && availabilityError.name === "AbortError")) {
            return;
          }
          setTenantSlugAvailable(false);
          setTenantSlugMessage(getErrorMessage(availabilityError));
        })
        .finally(() => {
          if (isCurrent) {
            setCheckingTenantSlug(false);
          }
        });
    }, 300);

    return () => {
      isCurrent = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [form.tenantSlug]);

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
        { ...(token ? { token } : {}), signal: controller.signal }
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
  }, [form.username, token]);

  const oauthProviderLabel = useMemo(() => {
    const oauthProvider = searchParams.get("oauth");
    if (oauthProvider === "google" || oauthProvider === "facebook") {
      return PROVIDER_LABELS[oauthProvider];
    }

    return "";
  }, [searchParams]);

  if (loading) {
    return <Paper className="finazze-auth-card" p="xl">Loading session...</Paper>;
  }

  const isAuthenticatedFlow = Boolean(user);
  const hasTenantMemberships = Boolean(user?.tenants?.length);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!usernameAvailable) {
      setError(usernameMessage || "Choose an available username before creating your workspace.");
      return;
    }

    if (!tenantSlugAvailable) {
      setError(tenantSlugMessage || "Choose an available tenant slug before creating your workspace.");
      return;
    }

    setSubmitting(true);

    try {
      if (isAuthenticatedFlow) {
        await completeVendorOnboarding({
          tenantName: form.tenantName,
          tenantSlug: form.tenantSlug,
          name: form.name,
          username: form.username,
          email: form.email,
          phone: form.phone
        });
      } else {
        await registerVendor(form);
      }

      navigate("/dashboard", { replace: true });
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
          <Text className="finazze-section-label">
            {isAuthenticatedFlow ? "Vendor workspace" : "Vendor onboarding"}
          </Text>
          <Title order={1}>
            {isAuthenticatedFlow
              ? hasTenantMemberships
                ? "Create another tenant-ready queue workspace."
                : "Finish your tenant workspace."
              : "Create a tenant-ready queue workspace."}
          </Title>
          <Text c="dimmed" mt="sm">
            {isAuthenticatedFlow
              ? oauthProviderLabel
                ? `Signed in with ${oauthProviderLabel}. Finish the workspace details below.`
                : "You're signed in. Finish the workspace details below to create your vendor tenant."
              : "Set up your business profile, queue slug, and owner account in one pass."}
          </Text>
        </div>
        {!isAuthenticatedFlow ? <SocialAuthButtons intent="register_vendor" /> : null}
        <form onSubmit={handleSubmit}>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <TextInput
              name="tenantName"
              label="Business name"
              required
              value={form.tenantName}
              onChange={(event) => {
                const nextTenantName = event.target.value;
                setForm((current) => ({
                  ...current,
                  tenantName: nextTenantName,
                  tenantSlug: tenantSlugEdited ? current.tenantSlug : buildTenantSlugFromName(nextTenantName)
                }));
              }}
            />
            <TextInput
              description={checkingTenantSlug ? "Checking tenant slug..." : tenantSlugMessage}
              error={form.tenantSlug && tenantSlugMessage && !tenantSlugAvailable ? tenantSlugMessage : undefined}
              name="tenantSlug"
              label="Tenant slug"
              placeholder="acme-clinic"
              required
              value={form.tenantSlug}
              onChange={(event) => {
                setTenantSlugEdited(true);
                setForm((current) => ({
                  ...current,
                  tenantSlug: normalizeTenantSlugInput(event.target.value)
                }));
              }}
            />
            <TextInput
              name="ownerName"
              label="Owner name"
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
              placeholder="owner_name"
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
            {!isAuthenticatedFlow ? (
              <PasswordInput name="password" label="Password" required value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
            ) : null}
          </SimpleGrid>
          <Stack gap="md" mt="md">
            {error ? <Alert color="red">{error}</Alert> : null}
            <Button
              color="dark"
              disabled={
                submitting ||
                checkingUsername ||
                checkingTenantSlug ||
                !usernameAvailable ||
                !tenantSlugAvailable
              }
              type="submit"
            >
              {submitting
                ? isAuthenticatedFlow
                  ? "Finishing workspace..."
                  : "Creating workspace..."
                : isAuthenticatedFlow
                  ? hasTenantMemberships
                    ? "Create workspace"
                    : "Finish workspace setup"
                  : "Create workspace"}
            </Button>
          </Stack>
        </form>
      </Stack>
      <Stack className="onboarding-art-panel" justify="space-between" gap="lg">
        <img
          alt="Illustration of a vendor setting up a GetPrio workspace"
          className="onboarding-art"
          src="/illustrations/generated/vendor-onboarding.png"
        />
        <div>
          <Text className="finazze-section-label">What opens up next</Text>
          <Text c="dimmed">
            Publish a QR join point, configure service locations, and start serving from one live
            workspace.
          </Text>
        </div>
      </Stack>
      </SimpleGrid>
    </Paper>
  );
}
