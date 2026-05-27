import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Alert, Button, Paper, PasswordInput, SimpleGrid, Stack, Text, TextInput, Title } from "@mantine/core";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { OAuthProviderId, RegisterVendorRequest, TenantSlugAvailabilityResponse } from "@shared";
import { apiRequest, ApiError } from "../api/client";
import SocialAuthButtons from "../components/SocialAuthButtons";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../utils/errors";

const PROVIDER_LABELS: Record<OAuthProviderId, string> = {
  google: "Google",
  facebook: "Facebook"
};

function toTenantSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function RegisterVendorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { completeVendorOnboarding, loading, registerVendor, user } = useAuth();
  const [form, setForm] = useState<RegisterVendorRequest>({
    tenantName: "",
    tenantSlug: "",
    name: "",
    email: "",
    phone: "",
    password: ""
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tenantSlugEdited, setTenantSlugEdited] = useState(false);
  const [tenantSlugStatus, setTenantSlugStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "error"
  >("idle");

  useEffect(() => {
    if (!user) {
      return;
    }

    setForm((current) => ({
      ...current,
      name: current.name || user.name || "",
      email: current.email || user.email || "",
      phone: current.phone || user.phone || ""
    }));
  }, [user]);

  const oauthProviderLabel = useMemo(() => {
    const oauthProvider = searchParams.get("oauth");
    if (oauthProvider === "google" || oauthProvider === "facebook") {
      return PROVIDER_LABELS[oauthProvider];
    }

    return "";
  }, [searchParams]);

  const isAuthenticatedFlow = Boolean(user);
  const hasTenantMemberships = Boolean(user?.tenants?.length);
  const tenantSlugMessage = {
    idle: "Generated from your business name.",
    checking: "Checking tenant slug...",
    available: "Tenant slug is available.",
    taken: "That tenant slug is already taken.",
    error: "Unable to check slug right now. Try again in a moment."
  }[tenantSlugStatus];
  const tenantSlugError =
    tenantSlugStatus === "taken" || tenantSlugStatus === "error" ? tenantSlugMessage : undefined;
  const tenantSlugHelperColor = tenantSlugStatus === "available" ? "green" : "dimmed";
  const canSubmit =
    !submitting &&
    tenantSlugStatus !== "checking" &&
    tenantSlugStatus !== "taken" &&
    tenantSlugStatus !== "error";

  useEffect(() => {
    const slug = form.tenantSlug;

    if (!slug) {
      setTenantSlugStatus("idle");
      return undefined;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setTenantSlugStatus("checking");
      apiRequest<TenantSlugAvailabilityResponse>(
        `/auth/tenant-slug?slug=${encodeURIComponent(slug)}`,
        { signal: controller.signal }
      )
        .then((result) => {
          if (result.slug !== slug) {
            return;
          }

          setTenantSlugStatus(result.available ? "available" : "taken");
        })
        .catch((availabilityError) => {
          if (
            availabilityError instanceof DOMException &&
            availabilityError.name === "AbortError"
          ) {
            return;
          }

          if (availabilityError instanceof ApiError && availabilityError.status === 400) {
            setTenantSlugStatus("idle");
            return;
          }

          setTenantSlugStatus("error");
        });
    }, 400);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [form.tenantSlug]);

  if (loading) {
    return <Paper className="finazze-auth-card" p="xl">Loading session...</Paper>;
  }

  function handleTenantNameChange(value: string) {
    const nextSlug = tenantSlugEdited ? form.tenantSlug : toTenantSlug(value);
    setTenantSlugStatus(nextSlug ? "checking" : "idle");
    setForm((current) => ({
      ...current,
      tenantName: value,
      tenantSlug: tenantSlugEdited ? current.tenantSlug : nextSlug
    }));
  }

  function handleTenantSlugChange(value: string) {
    const nextSlug = toTenantSlug(value);
    setTenantSlugEdited(Boolean(nextSlug));
    setTenantSlugStatus(nextSlug ? "checking" : "idle");
    setForm((current) => ({ ...current, tenantSlug: nextSlug }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!canSubmit) {
      setError(tenantSlugError || "Please wait for tenant slug validation to finish.");
      return;
    }

    setSubmitting(true);

    try {
      if (isAuthenticatedFlow) {
        await completeVendorOnboarding({
          tenantName: form.tenantName,
          tenantSlug: form.tenantSlug,
          name: form.name,
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
            <TextInput label="Business name" name="tenantName" required value={form.tenantName} onChange={(event) => handleTenantNameChange(event.target.value)} />
            <Stack gap={4}>
              <TextInput
                error={tenantSlugError}
                label="Tenant slug"
                name="tenantSlug"
                placeholder="acme-clinic"
                required
                value={form.tenantSlug}
                onChange={(event) => handleTenantSlugChange(event.target.value)}
              />
              {!tenantSlugError ? (
                <Text c={tenantSlugHelperColor} size="xs">
                  {tenantSlugMessage}
                </Text>
              ) : null}
            </Stack>
            <TextInput label="Owner name" name="name" required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            <TextInput label="Email" name="email" required type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
            <TextInput label="Phone" name="phone" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
            {!isAuthenticatedFlow ? (
              <PasswordInput label="Password" name="password" required value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
            ) : null}
          </SimpleGrid>
          <Stack gap="md" mt="md">
            {error ? <Alert color="red">{error}</Alert> : null}
            <Button color="dark" disabled={!canSubmit} type="submit">
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
