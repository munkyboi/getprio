import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, Button, Paper, PasswordInput, SimpleGrid, Stack, Text, TextInput, Title } from "@mantine/core";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import type { RegisterCustomerRequest, UsernameAvailabilityResponse } from "@shared";
import SocialAuthButtons from "../components/SocialAuthButtons";
import { apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../utils/errors";
import { buildUsernameFromName, isUsernameFormatValid, normalizeUsernameInput } from "../utils/usernames";

const customerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name."),
  username: z.string().trim().min(3, "Enter a username."),
  email: z.string().trim().email("Enter a valid email address."),
  phone: z.string().trim().optional().or(z.literal("")),
  password: z.string().min(8, "Use at least 8 characters.")
});

type CustomerFormValues = z.infer<typeof customerSchema>;

export default function RegisterCustomerPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { loading, registerCustomer, user } = useAuth();
  const registrationState = (location.state as {
    prefill?: Partial<RegisterCustomerRequest>;
    redirectTo?: string;
  } | null) || null;
  const redirectTo = registrationState?.redirectTo || "/";
  const [usernameMessage, setUsernameMessage] = useState("");
  const [usernameAvailable, setUsernameAvailable] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [error, setError] = useState("");

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: registrationState?.prefill?.name || "",
      username: buildUsernameFromName(registrationState?.prefill?.name || ""),
      email: registrationState?.prefill?.email || "",
      phone: registrationState?.prefill?.phone || "",
      password: ""
    }
  });

  const username = form.watch("username");
  const name = form.watch("name");

  useEffect(() => {
    if (user && !user.tenants?.length) {
      navigate(redirectTo, { replace: true });
    }
  }, [navigate, redirectTo, user]);

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
  }, [username]);

  useEffect(() => {
    if (form.formState.isDirty) {
      return;
    }

    form.setValue("username", buildUsernameFromName(name), { shouldDirty: false, shouldValidate: true });
  }, [name]);

  if (loading) {
    return <Paper className="finazze-auth-card" p="xl">Loading session...</Paper>;
  }

  if (user && !user.tenants?.length) {
    return <Navigate to={redirectTo} replace />;
  }

  const handleSubmit = form.handleSubmit(async (values) => {
    setError("");
    if (!usernameAvailable) {
      setError(usernameMessage || "Choose an available username before creating your account.");
      return;
    }

    try {
      await registerCustomer({
        ...values,
        phone: values.phone || ""
      });
      navigate(redirectTo, { replace: true });
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    }
  });

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
                label="Name"
                required
                error={form.formState.errors.name?.message}
                {...form.register("name", {
                  onChange: (event) => {
                    const nextName = event.target.value;
                    if (!form.formState.dirtyFields.username) {
                      form.setValue("username", buildUsernameFromName(nextName), { shouldValidate: true });
                    }
                  }
                })}
              />
              <TextInput
                description={checkingUsername ? "Checking username..." : usernameMessage}
                error={form.formState.errors.username?.message || (username && usernameMessage && !usernameAvailable ? usernameMessage : undefined)}
                label="Username"
                placeholder="customer_name"
                required
                {...form.register("username", {
                  onChange: (event) => form.setValue("username", normalizeUsernameInput(event.target.value), { shouldValidate: true })
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
              <PasswordInput
                label="Password"
                required
                error={form.formState.errors.password?.message}
                {...form.register("password")}
              />
              {error ? <Alert color="red">{error}</Alert> : null}
              <Button color="dark" loading={form.formState.isSubmitting || checkingUsername || !usernameAvailable} type="submit">
                Create account
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
