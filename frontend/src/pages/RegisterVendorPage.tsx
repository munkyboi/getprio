import { normalizePhilippineMobileNumber } from "../utils/phones";
import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import {
  ConfigurationInput as TextInput,
  ConfigurationPhone,
  ConfigurationScope,
} from "../vendor/ConfigurationUi";
import { ConfigurationPassword as PasswordInput } from "../vendor/AccountFields";
import {
  OperationAlert,
  OperationButton,
  OperationPanel,
} from "../vendor/OperationsUi";
import { FieldGroup } from "../vendor/components/ui/field";
import { VendorAuthLayout } from "../vendor/VendorAuthLayout";
import { useNavigate, useSearchParams } from "react-router-dom";
import type {
  OAuthProviderId,
  TenantSlugAvailabilityResponse,
  UsernameAvailabilityResponse,
} from "@shared";
import SocialAuthButtons from "../components/SocialAuthButtons";
import { apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../utils/errors";
import { BusinessCategorySelect } from "../components/BusinessCategorySelect";
import {
  buildTenantSlugFromName,
  buildUsernameFromName,
  isTenantSlugFormatValid,
  isUsernameFormatValid,
  normalizeTenantSlugInput,
  normalizeUsernameInput,
} from "../utils/usernames";

const PROVIDER_LABELS: Record<OAuthProviderId, string> = {
  google: "Google",
  facebook: "Facebook",
  apple: "Apple",
};

const vendorSchema = z.object({
  tenantName: z.string().trim().min(2, "Enter your business name."),
  tenantSlug: z.string().trim().min(1, "Enter a tenant slug."),
  category: z.string().trim().min(1, "Choose a business category."),
  name: z.string().trim().min(2, "Enter the owner name."),
  username: z.string().trim().min(3, "Enter a username."),
  email: z.string().trim().email("Enter a valid email address."),
  phone: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine(
      (value) => !value || /^09\d{9}$/.test(value.replace(/\D/g, "")),
      "Use a Philippine mobile number like (0917) 123-4567.",
    ),
  password: z.string().optional(),
});

type VendorFormValues = z.infer<typeof vendorSchema>;

export default function RegisterVendorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    completeVendorOnboarding,
    loading,
    oauthLoading,
    registerVendor,
    token,
    user,
  } = useAuth();
  const [error, setError] = useState("");
  const [usernameMessage, setUsernameMessage] = useState("");
  const [usernameAvailable, setUsernameAvailable] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameManuallyEdited, setUsernameManuallyEdited] = useState(false);
  const [tenantSlugMessage, setTenantSlugMessage] = useState("");
  const [tenantSlugAvailable, setTenantSlugAvailable] = useState(false);
  const [checkingTenantSlug, setCheckingTenantSlug] = useState(false);
  const [tenantSlugManuallyEdited, setTenantSlugManuallyEdited] =
    useState(false);

  const form = useForm<VendorFormValues>({
    resolver: zodResolver(vendorSchema),
    defaultValues: {
      tenantName: "",
      tenantSlug: "",
      category: "",
      name: "",
      username: "",
      email: "",
      phone: "",
      password: "",
    },
  });

  const tenantName =
    useWatch({ control: form.control, name: "tenantName" }) || "";
  const tenantSlug =
    useWatch({ control: form.control, name: "tenantSlug" }) || "";
  const ownerName = useWatch({ control: form.control, name: "name" }) || "";
  const username = useWatch({ control: form.control, name: "username" }) || "";
  const category = useWatch({ control: form.control, name: "category" }) || "";
  const phone = useWatch({ control: form.control, name: "phone" }) || "";

  useEffect(() => {
    if (!user) {
      return;
    }

    form.setValue("name", form.getValues("name") || user.name || "", {
      shouldValidate: true,
    });
    if (!form.getValues("username")) {
      form.setValue(
        "username",
        user.username || buildUsernameFromName(user.name || ""),
        {
          shouldDirty: false,
          shouldValidate: true,
        },
      );
    }
    if (user.username) {
      setUsernameManuallyEdited(true);
    }
    form.setValue("email", form.getValues("email") || user.email || "", {
      shouldValidate: true,
    });
    form.setValue("phone", form.getValues("phone") || normalizePhilippineMobileNumber(user.phone || ""), {
      shouldValidate: true,
    });
  }, [form, user]);

  useEffect(() => {
    if (tenantSlugManuallyEdited) {
      return;
    }
    const nextTenantSlug = buildTenantSlugFromName(tenantName);
    form.setValue("tenantSlug", nextTenantSlug, {
      shouldValidate: Boolean(nextTenantSlug),
      shouldDirty: false,
    });
  }, [form, tenantName, tenantSlugManuallyEdited]);

  useEffect(() => {
    if (usernameManuallyEdited) {
      return;
    }
    const nextUsername = buildUsernameFromName(ownerName);
    form.setValue("username", nextUsername, {
      shouldValidate: Boolean(nextUsername),
      shouldDirty: false,
    });
  }, [form, ownerName, usernameManuallyEdited]);

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
        { signal: controller.signal },
      )
        .then((response) => {
          if (!isCurrent) {
            return;
          }
          setTenantSlugAvailable(response.available && response.valid);
          setTenantSlugMessage(response.message);
        })
        .catch((availabilityError) => {
          if (
            !isCurrent ||
            (availabilityError instanceof DOMException &&
              availabilityError.name === "AbortError")
          ) {
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
      setUsernameMessage(
        "Use 3-30 lowercase letters, numbers, or underscores.",
      );
      setCheckingUsername(false);
      return undefined;
    }

    setCheckingUsername(true);
    const controller = new AbortController();
    let isCurrent = true;
    const timeout = window.setTimeout(() => {
      apiRequest<UsernameAvailabilityResponse>(
        `/auth/username-availability?username=${encodeURIComponent(nextUsername)}`,
        { ...(token ? { token } : {}), signal: controller.signal },
      )
        .then((response) => {
          if (!isCurrent) {
            return;
          }
          setUsernameAvailable(response.available && response.valid);
          setUsernameMessage(response.message);
        })
        .catch((availabilityError) => {
          if (
            !isCurrent ||
            (availabilityError instanceof DOMException &&
              availabilityError.name === "AbortError")
          ) {
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
    return (
      <VendorAuthLayout>
        <p role="status" className="ops-muted">
          Loading session…
        </p>
      </VendorAuthLayout>
    );
  }

  const isAuthenticatedFlow = Boolean(user);
  const hasTenantMemberships = Boolean(user?.tenants?.length);

  const handleSubmit = form.handleSubmit(async (values) => {
    setError("");
    if (!usernameAvailable) {
      setError(
        usernameMessage ||
          "Choose an available username before creating your workspace.",
      );
      return;
    }

    if (!tenantSlugAvailable) {
      setError(
        tenantSlugMessage ||
          "Choose an available tenant slug before creating your workspace.",
      );
      return;
    }

    try {
      const payload = {
        tenantName: values.tenantName,
        tenantSlug: values.tenantSlug,
        category: "",
        categoryId: values.category,
        name: values.name,
        username: values.username,
        email: values.email,
        phone: values.phone || "",
      };

      if (isAuthenticatedFlow) {
        await completeVendorOnboarding(payload);
      } else {
        await registerVendor({ ...payload, password: values.password || "" });
      }

      navigate("/dashboard/account", { replace: true });
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    }
  });

  return (
    <VendorAuthLayout>
      <ConfigurationScope busy={form.formState.isSubmitting || oauthLoading}>
        <div className="vendor-auth-layout">
          <div className="queue-stack">
            <div>
              <p className="vendor-eyebrow">
                {isAuthenticatedFlow
                  ? "Your vendor workspace"
                  : "Build your booking business"}
              </p>
              <h1>
                {isAuthenticatedFlow
                  ? hasTenantMemberships
                    ? "Add another business workspace."
                    : "Finish setting up your workspace."
                  : "Set up your vendor workspace."}
              </h1>
              <p className="ops-muted">
                {isAuthenticatedFlow
                  ? oauthProviderLabel
                    ? `Signed in with ${oauthProviderLabel}. Add the final business details to get started.`
                    : "You're signed in. Add the final business details to get started."
                  : "Create your business profile, choose a shareable link, and start accepting bookings."}
              </p>
            </div>
            {!isAuthenticatedFlow ? (
              <SocialAuthButtons
                vendor
                disabled={form.formState.isSubmitting}
                intent="register_vendor"
              />
            ) : null}
            <OperationPanel>
              <form onSubmit={handleSubmit}>
                <FieldGroup className="config-form-grid">
                  <TextInput
                    label="Business name"
                    required
                    error={form.formState.errors.tenantName?.message}
                    {...form.register("tenantName")}
                  />
                  <BusinessCategorySelect
                    vendor
                    required
                    value={category || null}
                    error={form.formState.errors.category?.message}
                    onChange={(id) =>
                      form.setValue("category", id, { shouldValidate: true })
                    }
                  />
                  <TextInput
                    description={
                      checkingTenantSlug
                        ? "Checking business link..."
                        : tenantSlugMessage
                    }
                    error={
                      form.formState.errors.tenantSlug?.message ||
                      (tenantSlug && tenantSlugMessage && !tenantSlugAvailable
                        ? tenantSlugMessage
                        : undefined)
                    }
                    label="Business link"
                    placeholder="acme-clinic"
                    required
                    {...form.register("tenantSlug", {
                      onChange: (event) => {
                        setTenantSlugManuallyEdited(true);
                        form.setValue(
                          "tenantSlug",
                          normalizeTenantSlugInput(event.target.value),
                          { shouldValidate: true },
                        );
                      },
                    })}
                  />
                  <TextInput
                    label="Your full name"
                    required
                    error={form.formState.errors.name?.message}
                    {...form.register("name")}
                  />
                  <TextInput
                    description={
                      checkingUsername
                        ? "Checking username..."
                        : usernameMessage
                    }
                    error={
                      form.formState.errors.username?.message ||
                      (username && usernameMessage && !usernameAvailable
                        ? usernameMessage
                        : undefined)
                    }
                    label="Username"
                    placeholder="owner_name"
                    required
                    {...form.register("username", {
                      onChange: (event) => {
                        setUsernameManuallyEdited(true);
                        form.setValue(
                          "username",
                          normalizeUsernameInput(event.target.value),
                          { shouldValidate: true },
                        );
                      },
                    })}
                  />
                  <TextInput
                    label="Email"
                    autoComplete="email"
                    required
                    type="email"
                    error={form.formState.errors.email?.message}
                    {...form.register("email")}
                  />
                  <ConfigurationPhone
                    label="Phone (optional)"
                    description="Add a Philippine mobile number for account and booking updates."
                    error={form.formState.errors.phone?.message}
                    value={phone}
                    onChange={(nextValue) =>
                      form.setValue("phone", nextValue, {
                        shouldValidate: true,
                      })
                    }
                  />
                  {!isAuthenticatedFlow ? (
                    <PasswordInput
                      label="Password"
                      autoComplete="new-password"
                      required
                      error={form.formState.errors.password?.message}
                      {...form.register("password")}
                    />
                  ) : null}
                </FieldGroup>
                <div className="queue-stack vendor-auth-actions">
                  {error ? (
                    <OperationAlert
                      color="red"
                      title="Workspace was not created"
                    >
                      {error}
                    </OperationAlert>
                  ) : null}
                  <OperationButton
                    loading={
                      form.formState.isSubmitting ||
                      checkingUsername ||
                      checkingTenantSlug
                    }
                    type="submit"
                  >
                    {isAuthenticatedFlow
                      ? hasTenantMemberships
                        ? "Create workspace"
                        : "Finish workspace setup"
                      : "Create workspace"}
                  </OperationButton>
                </div>
              </form>
            </OperationPanel>
          </div>
          <aside className="vendor-auth-guide">
            <img
              alt="Illustration of a vendor setting up a GetPrio workspace"
              src="/illustrations/generated/vendor-onboarding.png"
            />
            <h2>Everything in one place</h2>
            <p className="ops-muted">
              Manage your business profile, services, availability, team and
              bookings from your workspace.
            </p>
          </aside>
        </div>
      </ConfigurationScope>
    </VendorAuthLayout>
  );
}
