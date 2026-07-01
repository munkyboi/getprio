import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, Button, Paper, PasswordInput, SimpleGrid, Stack, Text, TextInput, Title } from "@mantine/core";
import { useNavigate, useSearchParams } from "react-router-dom";
import type {
  OAuthProviderId,
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

const vendorSchema = z.object({
  tenantName: z.string().trim().min(2, "Enter your business name."),
  tenantSlug: z.string().trim().min(1, "Enter a tenant slug."),
  name: z.string().trim().min(2, "Enter the owner name."),
  username: z.string().trim().min(3, "Enter a username."),
  email: z.string().trim().email("Enter a valid email address."),
  phone: z.string().trim().optional().or(z.literal("")),
  password: z.string().optional()
});

type VendorFormValues = z.infer<typeof vendorSchema>;

export default function RegisterVendorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { completeVendorOnboarding, loading, registerVendor, token, user } = useAuth();
  const [error, setError] = useState("");
  const [usernameMessage, setUsernameMessage] = useState("");
  const [usernameAvailable, setUsernameAvailable] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [tenantSlugMessage, setTenantSlugMessage] = useState("");
  const [tenantSlugAvailable, setTenantSlugAvailable] = useState(false);
  const [checkingTenantSlug, setCheckingTenantSlug] = useState(false);

  const form = useForm<VendorFormValues>({
    resolver: zodResolver(vendorSchema),
    defaultValues: {
      tenantName: "",
      tenantSlug: "",
      name: "",
      username: "",
      email: "",
      phone: "",
      password: ""
    }
  });

  const tenantName = form.watch("tenantName");
  const tenantSlug = form.watch("tenantSlug");
  const ownerName = form.watch("name");
  const username = form.watch("username");

  useEffect(() => {
    if (!user) {
      return;
    }

    form.setValue("name", form.getValues("name") || user.name || "", { shouldValidate: true });
    form.setValue("username", form.getValues("username") || user.username || buildUsernameFromName(user.name || ""), {
      shouldValidate: true
    });
    form.setValue("email", form.getValues("email") || user.email || "", { shouldValidate: true });
    form.setValue("phone", form.getValues("phone") || user.phone || "", { shouldValidate: true });
  }, [form, user]);

  useEffect(() => {
    if (form.formState.dirtyFields.tenantSlug) {
      return;
    }
    form.setValue("tenantSlug", buildTenantSlugFromName(tenantName), { shouldValidate: true, shouldDirty: false });
  }, [tenantName, form]);

  useEffect(() => {
    if (form.formState.dirtyFields.username) {
      return;
    }
    form.setValue("username", buildUsernameFromName(ownerName), { shouldValidate: true, shouldDirty: false });
  }, [ownerName, form]);

  useEffect(() => {
    const nextTenantSlug = tenantSlug.trim();
    setTenantSlugAvailable(false);

    if (!nextTenantSlug) {
      setTenantSlugMessage("");
      setCheckingTenantSlug(false);
      return undefined;
    }

    if (!isTenantSlugFormatValid(nextTenantSlug)) {
      setTenantSlugMessage("Use 1-48 lowercase letters, numbers, or hyphens.");
      setCheckingTenantSlug(false);
      return undefined;
    }

    setCheckingTenantSlug(true);
    const controller = new AbortController();
    let isCurrent = true;
    const timeout = window.setTimeout(() => {
      apiRequest<TenantSlugAvailabilityResponse>(
        `/auth/tenant-slug-availability?tenantSlug=${encodeURIComponent(nextTenantSlug)}`,
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
  }, [tenantSlug]);

  useEffect(() => {
    const nextUsername = username.trim();
    setUsernameAvailable(false);

    if (!nextUsername) {
      setUsernameMessage("");
      setCheckingUsername(false);
      return undefined;
    }

    if (!isUsernameFormatValid(nextUsername)) {
      setUsernameMessage("Use 3-30 lowercase letters, numbers, or underscores.");
      setCheckingUsername(false);
      return undefined;
    }

    setCheckingUsername(true);
    const controller = new AbortController();
    let isCurrent = true;
    const timeout = window.setTimeout(() => {
      apiRequest<UsernameAvailabilityResponse>(
        `/auth/username-availability?username=${encodeURIComponent(nextUsername)}`,
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
  }, [username, token]);

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

  const handleSubmit = form.handleSubmit(async (values) => {
    setError("");
    if (!usernameAvailable) {
      setError(usernameMessage || "Choose an available username before creating your workspace.");
      return;
    }

    if (!tenantSlugAvailable) {
      setError(tenantSlugMessage || "Choose an available tenant slug before creating your workspace.");
      return;
    }

    try {
      const payload = {
        tenantName: values.tenantName,
        tenantSlug: values.tenantSlug,
        name: values.name,
        username: values.username,
        email: values.email,
        phone: values.phone || ""
      };

      if (isAuthenticatedFlow) {
        await completeVendorOnboarding(payload);
      } else {
        await registerVendor({ ...payload, password: values.password || "" });
      }

      navigate("/dashboard", { replace: true });
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    }
  });

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
                label="Business name"
                required
                error={form.formState.errors.tenantName?.message}
                {...form.register("tenantName", {
                  onChange: (event) => {
                    if (form.formState.dirtyFields.tenantSlug) {
                      return;
                    }
                    form.setValue("tenantSlug", buildTenantSlugFromName(event.target.value), { shouldValidate: true });
                  }
                })}
              />
              <TextInput
                description={checkingTenantSlug ? "Checking tenant slug..." : tenantSlugMessage}
                error={form.formState.errors.tenantSlug?.message || (tenantSlug && tenantSlugMessage && !tenantSlugAvailable ? tenantSlugMessage : undefined)}
                label="Tenant slug"
                placeholder="acme-clinic"
                required
                {...form.register("tenantSlug", {
                  onChange: (event) => {
                    form.setValue("tenantSlug", normalizeTenantSlugInput(event.target.value), { shouldValidate: true });
                  }
                })}
              />
              <TextInput
                label="Owner name"
                required
                error={form.formState.errors.name?.message}
                {...form.register("name", {
                  onChange: (event) => {
                    if (form.formState.dirtyFields.username) {
                      return;
                    }
                    form.setValue("username", buildUsernameFromName(event.target.value), { shouldValidate: true });
                  }
                })}
              />
              <TextInput
                description={checkingUsername ? "Checking username..." : usernameMessage}
                error={form.formState.errors.username?.message || (username && usernameMessage && !usernameAvailable ? usernameMessage : undefined)}
                label="Username"
                placeholder="owner_name"
                required
                {...form.register("username", {
                  onChange: (event) => {
                    form.setValue("username", normalizeUsernameInput(event.target.value), { shouldValidate: true });
                  }
                })}
              />
              <TextInput
                label="Email"
                required
                type="email"
                error={form.formState.errors.email?.message}
                {...form.register("email")}
              />
              <TextInput
                label="Phone"
                error={form.formState.errors.phone?.message}
                {...form.register("phone")}
              />
              {!isAuthenticatedFlow ? (
                <PasswordInput
                  label="Password"
                  required
                  error={form.formState.errors.password?.message}
                  {...form.register("password")}
                />
              ) : null}
            </SimpleGrid>
            <Stack gap="md" mt="md">
              {error ? <Alert color="red">{error}</Alert> : null}
              <Button
                color="dark"
                loading={form.formState.isSubmitting || checkingUsername || checkingTenantSlug || !usernameAvailable || !tenantSlugAvailable}
                type="submit"
              >
                {isAuthenticatedFlow
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
              Publish a QR join point, configure service locations, and start serving from one live workspace.
            </Text>
          </div>
        </Stack>
      </SimpleGrid>
    </Paper>
  );
}
