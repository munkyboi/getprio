import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  PinInput,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconInfoCircle } from "@tabler/icons-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type {
  JoinQueueRequest,
  QueueJoinPaymentResponse,
  QueueJoinPaymentSyncResponse,
  QueueSnapshot,
  RequestJoinOtpResponse,
  TenantSummary,
  VerifyJoinOtpRequest
} from "@shared";
import { API_BASE_URL, apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { buildJoinedQueuePathWithTicket, buildMonitorPath } from "../queuePaths";
import { saveJoinedQueueAccess } from "../utils/joinedQueueAccess";
import { getErrorMessage } from "../utils/errors";

type JoinQueueFormState = Omit<JoinQueueRequest, "joinChannel" | "turnstileToken">;

function maskSegment(value: string): string {
  if (!value) {
    return "";
  }

  if (value.length === 1) {
    return `${value[0]}****`;
  }

  return `${value[0]}****${value[value.length - 1]}`;
}

function maskEmail(email: string): string {
  const [localPart, domain = ""] = email.split("@");
  const domainParts = domain.split(".").filter(Boolean);
  const visibleSuffix = domainParts[domainParts.length - 1] || "";
  const maskedDomainName = domainParts[0] ? `${domainParts[0][0]}****` : "";

  return `${maskSegment(localPart)}@${maskedDomainName}.${visibleSuffix}`;
}

function maskDeliveryTarget(channel: string, target: string): string {
  if (channel === "email" && target.includes("@")) {
    return maskEmail(target);
  }

  return `ending in ${target.slice(-4)}`;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
        }
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

export default function JoinQueuePage() {
  const { tenantSlug, locationSlug } = useParams<{ tenantSlug: string; locationSlug?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { token, user } = useAuth();
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const [tenantInfo, setTenantInfo] = useState<TenantSummary | null>(null);
  const [locationName, setLocationName] = useState("");
  const [queueSnapshot, setQueueSnapshot] = useState<QueueSnapshot | null>(null);
  const [form, setForm] = useState<JoinQueueFormState>({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    notifyByEmail: true,
    notifyBySms: false,
    notes: ""
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [otp, setOtp] = useState<RequestJoinOtpResponse | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const otpAutoSubmitRef = useRef(false);
  const lastAutoSubmittedOtpRef = useRef<string>("");
  const [now, setNow] = useState(() => Date.now());
  const tenantSlugValue = tenantSlug || "";
  const monitorPath = tenantSlug ? buildMonitorPath(tenantSlug, locationSlug) : "/";
  const publicApiBase = locationSlug
    ? `/public/tenant/${tenantSlugValue}/location/${locationSlug}`
    : `/public/tenant/${tenantSlugValue}`;
  const joinSource = searchParams.get("source")?.toLowerCase() === "qr" ? "qr" : "online";
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
  const shouldUseTurnstile = joinSource === "qr" && Boolean(turnstileSiteKey);
  const resendAvailableAtMs = otp ? new Date(otp.resendAvailableAt).getTime() : 0;
  const resendSecondsRemaining = Math.max(
    0,
    Math.ceil((resendAvailableAtMs - now) / 1000)
  );
  const resendLabel =
    resendSecondsRemaining > 0
      ? `Send new code in ${Math.floor(resendSecondsRemaining / 60)}:${String(
          resendSecondsRemaining % 60
        ).padStart(2, "0")}`
      : "Send new code";
  const queueFeeEnabled = Boolean(tenantInfo?.queueFee?.enabled);
  const smsFeeApplies = Boolean(form.notifyBySms && queueFeeEnabled);
  const canSkipOtp = !form.notifyByEmail && !smsFeeApplies;
  const queueIntakePaused = Boolean(queueSnapshot?.queueDay?.isPaused);
  const queueDayClosed = Boolean(queueSnapshot?.queueDay?.isClosed);
  const queueStateBadge = queueDayClosed
    ? { color: "red", label: "Closed" }
    : queueIntakePaused
      ? { color: "yellow", label: "Paused" }
      : { color: "teal", label: "Open" };
  const queuePauseMessage =
    queueSnapshot?.queueDay?.pauseReason ||
    "This queue is temporarily paused while the team works through the current line.";
  const queueClosedMessage =
    queueSnapshot?.queueDay?.closureReason ||
    "This queue is closed for the day. Please check back during the next service window.";
  const requiresPhone = form.notifyBySms;
  const requiresEmail = form.notifyByEmail;
  const pageTitle = tenantInfo?.name || tenantSlugValue;
  const signedInCustomer = Boolean(user?.roles?.includes("customer"));
  const customerAccountName = signedInCustomer ? user.name || "Customer account" : "";
  const customerAccountEmail = signedInCustomer ? user.email || "" : "";
  const joinedQueueNavigationState = useMemo(
    () => ({
      registrationPrefill: {
        name: form.customerName,
        email: form.customerEmail,
        phone: form.customerPhone
      }
    }),
    [form.customerEmail, form.customerName, form.customerPhone]
  );
  const customerDetailsDescription = signedInCustomer
    ? "Prefilled from your customer account. Changes here only affect this join."
    : undefined;

  useEffect(() => {
    if (user) {
      setForm((current) => ({
        ...current,
        customerName: current.customerName || user.name || "",
        customerEmail: current.customerEmail || user.email || "",
        customerPhone: current.customerPhone || user.phone || ""
      }));
    }
  }, [user]);

  useEffect(() => {
    if (!tenantSlug) {
      return;
    }

    const basePath = locationSlug
      ? `/public/tenant/${tenantSlug}/location/${locationSlug}`
      : `/public/tenant/${tenantSlug}`;
    let active = true;

    apiRequest<QueueSnapshot>(`${basePath}/queue`)
      .then((data) => {
        if (!active) {
          return;
        }
        setQueueSnapshot(data);
        setTenantInfo({
          ...data.tenant
        });
        setLocationName(data.location?.name || "");
        setError("");
      })
      .catch((loadError) => {
        if (active) {
          setError(getErrorMessage(loadError));
        }
      });

    const eventSource = new EventSource(`${API_BASE_URL}${basePath}/stream`);
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data) as QueueSnapshot;
      setQueueSnapshot(data);
      setTenantInfo({
        ...data.tenant
      });
      setLocationName(data.location?.name || "");
      setError("");
    };
    eventSource.onerror = () => {
      setError("Live queue updates disconnected. Refresh to reconnect.");
      eventSource.close();
    };

    return () => {
      active = false;
      eventSource.close();
    };
  }, [locationSlug, tenantSlug]);

  useEffect(() => {
    if (!tenantSlugValue) {
      return;
    }

    const paymentId = searchParams.get("payment");
    const paymentStatus = searchParams.get("payment_status");
    if (!paymentId) {
      return;
    }

    if (paymentStatus === "cancelled") {
      notifications.show({
        color: "blue",
        icon: <IconInfoCircle size={18} />,
        message: "No ticket was issued.",
        title: "Checkout cancelled"
      });
      return;
    }

    let active = true;
    setSubmitting(true);
    setError("");
    notifications.show({
      color: "blue",
      icon: <IconInfoCircle size={18} />,
      message: "Confirming your queue fee payment...",
      title: "Payment received"
    });

    apiRequest<QueueJoinPaymentSyncResponse>(
      `${publicApiBase}/join-payments/${paymentId}/sync`,
      {
        method: "POST"
      }
    )
      .then((data) => {
        if (!active) {
          return;
        }

        if (data.paid && data.ticket?.lookupCode) {
          const prefill = joinedQueueNavigationState.registrationPrefill;
          saveJoinedQueueAccess(data.ticket.lookupCode, {
            customerEmail: prefill.email,
            customerPhone: prefill.phone,
            customerName: prefill.name
          });
          navigate(
            buildJoinedQueuePathWithTicket(tenantSlugValue, data.ticket.lookupCode, locationSlug),
            {
              replace: true,
              state: joinedQueueNavigationState
            }
          );
          return;
        }

        notifications.show({
          color: "blue",
          icon: <IconInfoCircle size={18} />,
          message: "Payment is still being confirmed. Please refresh in a moment.",
          title: "Payment pending"
        });
      })
      .catch((syncError) => {
        if (active) {
          setError(getErrorMessage(syncError));
        }
      })
      .finally(() => {
        if (active) {
          setSubmitting(false);
        }
      });

    return () => {
      active = false;
    };
  }, [joinedQueueNavigationState, locationSlug, navigate, publicApiBase, searchParams, tenantSlugValue]);

  useEffect(() => {
    if (!otp || resendSecondsRemaining <= 0) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [otp, resendSecondsRemaining]);

  useEffect(() => {
    setTurnstileToken("");

    if (!shouldUseTurnstile) {
      setTurnstileReady(true);
      return undefined;
    }

    let active = true;
    setTurnstileReady(false);
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
    );

    function renderTurnstile() {
      if (
        !active ||
        !turnstileContainerRef.current ||
        !window.turnstile ||
        turnstileWidgetIdRef.current
      ) {
        return;
      }

      turnstileWidgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
        sitekey: turnstileSiteKey,
        callback: (nextToken) => {
          setTurnstileToken(nextToken);
          setTurnstileReady(true);
        },
        "expired-callback": () => {
          setTurnstileToken("");
          setTurnstileReady(false);
        },
        "error-callback": () => {
          setTurnstileToken("");
          setTurnstileReady(false);
          setError("Verification could not load. Please refresh and try again.");
        }
      });
    }

    if (window.turnstile) {
      renderTurnstile();
    } else if (existingScript) {
      existingScript.addEventListener("load", renderTurnstile, { once: true });
    } else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", renderTurnstile, { once: true });
      document.head.appendChild(script);
    }

    return () => {
      active = false;
      if (existingScript) {
        existingScript.removeEventListener("load", renderTurnstile);
      }

      if (turnstileWidgetIdRef.current && window.turnstile) {
        window.turnstile.remove(turnstileWidgetIdRef.current);
        turnstileWidgetIdRef.current = null;
      }
    };
  }, [shouldUseTurnstile, turnstileSiteKey]);

  function resetTurnstile() {
    setTurnstileToken("");
    setTurnstileReady(false);

    if (turnstileWidgetIdRef.current && window.turnstile) {
      window.turnstile.reset(turnstileWidgetIdRef.current);
    }
  }

  function restoreCustomerDetails() {
    if (!signedInCustomer) {
      return;
    }

    setForm((current) => ({
      ...current,
      customerName: user.name || "",
      customerEmail: user.email || "",
      customerPhone: user.phone || ""
    }));
  }

  function buildJoinRequest(): JoinQueueRequest {
    return {
      ...form,
      joinChannel: joinSource,
      turnstileToken: shouldUseTurnstile ? turnstileToken : undefined
    };
  }

  async function requestOtp() {
    setSubmitting(true);
    setError("");

    try {
      if (queueDayClosed) {
        setError(queueClosedMessage);
        setSubmitting(false);
        return;
      }

      if (queueIntakePaused) {
        setError(queuePauseMessage);
        setSubmitting(false);
        return;
      }

      if (shouldUseTurnstile && !turnstileToken) {
        setError("Please complete the security check before joining.");
        setSubmitting(false);
        return;
      }

      const data = await apiRequest<RequestJoinOtpResponse, JoinQueueRequest>(
        `${publicApiBase}/join-otp`,
        {
          method: "POST",
          token,
          body: buildJoinRequest()
        }
      );
      setOtp(data);
      setOtpCode("");
      lastAutoSubmittedOtpRef.current = "";
    } catch (submitError) {
      setError(getErrorMessage(submitError));
      if (shouldUseTurnstile) {
        resetTurnstile();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function submitDirectJoin() {
    setSubmitting(true);
    setError("");

    try {
      if (queueDayClosed) {
        setError(queueClosedMessage);
        setSubmitting(false);
        return;
      }

      if (queueIntakePaused) {
        setError(queuePauseMessage);
        setSubmitting(false);
        return;
      }

      if (shouldUseTurnstile && !turnstileToken) {
        setError("Please complete the security check before joining.");
        setSubmitting(false);
        return;
      }

      const data = await apiRequest<QueueJoinPaymentResponse, JoinQueueRequest>(
        `${publicApiBase}/join`,
        {
          method: "POST",
          token,
          body: buildJoinRequest()
        }
      );

      if (data.ticket?.lookupCode) {
        saveJoinedQueueAccess(data.ticket.lookupCode, {
          customerEmail: form.customerEmail,
          customerPhone: form.customerPhone,
          customerName: form.customerName
        });
        notifications.show({
          color: "teal",
          icon: <IconCheck size={18} />,
          message: "Your ticket has been issued.",
          title: "Joined queue"
        });
        navigate(buildJoinedQueuePathWithTicket(tenantSlugValue, data.ticket.lookupCode, locationSlug), {
          replace: true,
          state: joinedQueueNavigationState
        });
        return;
      }
    } catch (submitError) {
      setError(getErrorMessage(submitError));
      if (shouldUseTurnstile) {
        resetTurnstile();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function resendOtp() {
    if (!otp) {
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const data = await apiRequest<RequestJoinOtpResponse>(
        `${publicApiBase}/join-otp/${otp.otpId}/resend`,
        {
          method: "POST"
        }
      );
      setOtp(data);
      setOtpCode("");
      lastAutoSubmittedOtpRef.current = "";
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSkipOtp) {
      await submitDirectJoin();
      return;
    }

    await requestOtp();
  }

  const handleVerifyOtp = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!otp) {
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const data = await apiRequest<QueueJoinPaymentResponse, VerifyJoinOtpRequest>(
        `${publicApiBase}/join-otp/verify`,
        {
          method: "POST",
          body: {
            otpId: otp.otpId,
            code: otpCode
          }
        }
      );

      if (data.requiresPayment && data.checkoutSession?.checkoutUrl) {
        notifications.show({
          color: "blue",
          icon: <IconInfoCircle size={18} />,
          message: `Opening checkout for ${data.queueFee.displayAmount}...`,
          title: "Queue fee required"
        });
        window.location.href = data.checkoutSession.checkoutUrl;
        return;
      }

      if (data.ticket?.lookupCode) {
        saveJoinedQueueAccess(data.ticket.lookupCode, {
          customerEmail: form.customerEmail,
          customerPhone: form.customerPhone,
          customerName: form.customerName
        });
        notifications.show({
          color: "teal",
          icon: <IconCheck size={18} />,
          message: "Your ticket has been issued.",
          title: "Joined queue"
        });
        navigate(buildJoinedQueuePathWithTicket(tenantSlugValue, data.ticket.lookupCode, locationSlug), {
          replace: true,
          state: joinedQueueNavigationState
        });
        return;
      }

      notifications.show({
        color: "blue",
        icon: <IconInfoCircle size={18} />,
        message: "Your join request is being processed.",
        title: "Join request submitted"
      });
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }, [form.customerEmail, form.customerName, form.customerPhone, joinedQueueNavigationState, locationSlug, navigate, otp, otpCode, publicApiBase, tenantSlugValue]);

  useEffect(() => {
    if (!otp || otpCode.length !== 6 || submitting || otpAutoSubmitRef.current) {
      return;
    }

    const submissionKey = `${otp.otpId}:${otpCode}`;
    if (lastAutoSubmittedOtpRef.current === submissionKey) {
      return;
    }

    lastAutoSubmittedOtpRef.current = submissionKey;
    otpAutoSubmitRef.current = true;
    handleVerifyOtp({ preventDefault() {} } as FormEvent<HTMLFormElement>).finally(() => {
      otpAutoSubmitRef.current = false;
    });
  }, [handleVerifyOtp, otp, otpCode, submitting]);

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl" className="finazze-join-layout">
      <Paper className="finazze-auth-card finazze-join-card" p={{ base: "xl", md: 44 }}>
        <Stack gap="md">
          <Text className="finazze-section-label">Join queue</Text>
          <Title order={1}>{pageTitle}</Title>
          {locationName ? <Text fw={700}>{locationName}</Text> : null}
          <Group gap="xs">
            <Badge color={queueStateBadge.color} radius="xl" size="lg" variant="light">
              {queueStateBadge.label}
            </Badge>
            <Text c="dimmed" size="sm">
              {queueDayClosed
                ? "Queue closed for the day"
                : queueIntakePaused
                  ? "New joins temporarily paused"
                  : "Now accepting joins"}
            </Text>
          </Group>
          <Text c="dimmed">
            Join online, then monitor your ticket live from the public board.
          </Text>
          {user?.roles?.includes("customer") ? (
            <Alert color="teal" variant="light">
              <Stack gap={4}>
                <Text fw={700}>Signed in as {customerAccountName}</Text>
                <Text size="sm">
                  We will reuse your saved contact details when possible. You can review your account history anytime from the account page.
                </Text>
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                  <div>
                    <Text c="dimmed" size="xs" tt="uppercase">
                      Name
                    </Text>
                    <Text fw={600}>{user.name || "Customer account"}</Text>
                  </div>
                  <div>
                    <Text c="dimmed" size="xs" tt="uppercase">
                      Email
                    </Text>
                    <Text fw={600}>{customerAccountEmail || "No email on file"}</Text>
                  </div>
                  <div>
                    <Text c="dimmed" size="xs" tt="uppercase">
                      Phone
                    </Text>
                    <Text fw={600}>{user.phone || "No phone on file"}</Text>
                  </div>
                </SimpleGrid>
                <Group gap="md">
                  <Button color="dark" size="xs" variant="light" onClick={restoreCustomerDetails} type="button">
                    Use account details
                  </Button>
                  <Button component={Link} size="xs" to="/account" variant="light">
                    View account
                  </Button>
                </Group>
              </Stack>
            </Alert>
          ) : null}
          {tenantInfo?.queueFee?.enabled ? (
            <Text c="dimmed">
              SMS queue alerts may incur a platform fee of {tenantInfo.queueFee.displayAmount}.
            </Text>
          ) : null}
          {!form.notifyByEmail ? (
            <Text c="dimmed" size="sm">
              Email verification is skipped when almost-next email alerts are off.
              {smsFeeApplies ? " SMS alerts still require verification before payment." : ""}
            </Text>
          ) : null}
          {smsFeeApplies ? (
            <Alert color="blue" variant="light" radius="md">
              SMS updates are convenient, but they carry a small platform fee of{" "}
              {tenantInfo?.queueFee.displayAmount}. You will only be charged if you keep SMS alerts enabled.
            </Alert>
          ) : null}
          {queueIntakePaused ? (
            <Alert color="yellow" icon={<IconInfoCircle size={18} />} radius="md" variant="light">
              We are temporarily pausing new joins for this queue while the team catches up with the current line.
              {queueSnapshot?.queueDay?.pauseReason ? ` ${queueSnapshot.queueDay.pauseReason}.` : ""}
              {" "}Please check back shortly.
            </Alert>
          ) : null}
          {queueDayClosed ? (
            <Alert color="red" icon={<IconInfoCircle size={18} />} radius="md" variant="light">
              This queue is closed for the day.
              {queueSnapshot?.queueDay?.closureReason ? ` ${queueSnapshot.queueDay.closureReason}.` : ""}
              {" "}You can check the live board for updates on when service resumes.
            </Alert>
          ) : null}
          {otp ? (
            <form onSubmit={handleVerifyOtp}>
              <Stack gap="md">
                <Paper className="finazze-soft-panel" p="md">
                  <Text className="finazze-section-label">Verification code</Text>
                  <Text>
                    We sent a 6-digit code to your {otp.deliveryChannel}{" "}
                    {maskDeliveryTarget(otp.deliveryChannel, otp.deliveryTarget)}.
                  </Text>
                  <Text c="dimmed" size="sm">
                    It expires at {new Date(otp.expiresAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit"
                    })}.
                  </Text>
                </Paper>
                <PinInput
                  aria-label="OTP"
                  inputMode="numeric"
                  length={6}
                  name="otpCode"
                  oneTimeCode
                  size="lg"
                  type="number"
                  value={otpCode}
                  onChange={(value) => setOtpCode(value.replace(/\D/g, ""))}
                />
                {error ? <Alert color="red">{error}</Alert> : null}
                <Button
                  color="dark"
                  disabled={submitting || queueIntakePaused || queueDayClosed || otpCode.length !== 6}
                  type="submit"
                >
                  {submitting
                    ? "Verifying..."
                    : smsFeeApplies
                      ? "Verify and continue to payment"
                      : "Verify and join queue"}
                </Button>
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <Button
                    color="dark"
                    disabled={submitting || resendSecondsRemaining > 0}
                    onClick={resendOtp}
                    type="button"
                    variant="outline"
                  >
                    {resendLabel}
                  </Button>
                  <Button
                    color="dark"
                    disabled={submitting}
                    onClick={() => navigate("/")}
                    type="button"
                    variant="subtle"
                  >
                    Cancel
                  </Button>
                </SimpleGrid>
              </Stack>
            </form>
          ) : (
            <form onSubmit={handleSubmit}>
              <Stack gap="md">
                <TextInput
                  name="customerName"
                  required
                  label="Name"
                  description={customerDetailsDescription}
                  value={form.customerName}
                  onChange={(event) => setForm((current) => ({ ...current, customerName: event.target.value }))}
                />
                <TextInput
                  name="customerEmail"
                  label="Email"
                  description={customerDetailsDescription}
                  required={requiresEmail}
                  type="email"
                  value={form.customerEmail}
                  onChange={(event) => setForm((current) => ({ ...current, customerEmail: event.target.value }))}
                />
                <TextInput
                  name="customerPhone"
                  label="Phone"
                  description={customerDetailsDescription}
                  required={requiresPhone}
                  value={form.customerPhone}
                  onChange={(event) => setForm((current) => ({ ...current, customerPhone: event.target.value }))}
                />
                <Textarea
                  name="notes"
                  label="Notes"
                  minRows={3}
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                />
                <Checkbox
                  name="notifyByEmail"
                  checked={form.notifyByEmail}
                  label="Email me when I am almost next in line"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, notifyByEmail: event.target.checked }))
                  }
                />
                <Checkbox
                  name="notifyBySms"
                  checked={form.notifyBySms}
                  label="Send SMS alerts"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, notifyBySms: event.target.checked }))
                  }
                />
                {shouldUseTurnstile ? (
                  <Paper className="finazze-soft-panel" p="md">
                    <div ref={turnstileContainerRef} />
                  </Paper>
                ) : null}
                {error ? <Alert color="red">{error}</Alert> : null}
                <Button
                  color="dark"
                  disabled={submitting || queueIntakePaused || queueDayClosed || (shouldUseTurnstile && !turnstileReady)}
                  type="submit"
                >
                  {submitting
                    ? canSkipOtp
                      ? "Joining..."
                      : "Sending code..."
                    : canSkipOtp
                      ? "Get priority number"
                      : smsFeeApplies
                        ? "Verify and continue"
                        : "Send verification code"}
                </Button>
              </Stack>
            </form>
          )}
        </Stack>
      </Paper>

      <Paper className="finazze-auth-card finazze-join-side" p={{ base: "xl", md: 44 }}>
        <Stack gap="lg">
          <img
            alt=""
            className="join-side-art"
            src="/illustrations/generated/customer-onboarding.png"
          />
          <Text className="finazze-section-label">What happens next</Text>
          {[
            ["1. Ticket issued instantly", "Your ticket number is generated immediately for this tenant."],
            ["2. Monitor online", "After joining, you are redirected to a live board with your ticket highlighted."],
            ["3. Near-turn notification", "Email or SMS alerts are sent when your turn is getting close, based on tenant settings."]
          ].map(([title, text]) => (
            <div key={title}>
              <Title order={3}>{title}</Title>
              <Text c="dimmed">{text}</Text>
            </div>
          ))}
          <Button color="dark" component={Link} to={monitorPath} variant="subtle">
            Open public board instead
          </Button>
        </Stack>
      </Paper>
    </SimpleGrid>
  );
}
