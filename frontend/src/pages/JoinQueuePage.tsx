import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Paper,
  PinInput,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip
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
  StoreLocationSummary,
  TenantSummary,
  VerifyJoinOtpRequest
} from "@shared";
import { apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { buildMonitorPath, buildMonitorPathWithTicket } from "../queuePaths";
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
          "error-callback": (code?: string) => boolean | void;
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
  const lastAutoSubmittedOtpRef = useRef("");
  const [tenantInfo, setTenantInfo] = useState<TenantSummary | null>(null);
  const [locationInfo, setLocationInfo] = useState<StoreLocationSummary | null>(null);
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
  const [now, setNow] = useState(() => Date.now());
  const tenantSlugValue = tenantSlug || "";
  const monitorPath = tenantSlug ? buildMonitorPath(tenantSlug, locationSlug) : "/";
  const publicApiBase = locationSlug
    ? `/public/tenant/${tenantSlugValue}/location/${locationSlug}`
    : `/public/tenant/${tenantSlugValue}`;
  const joinSource = searchParams.get("source")?.toLowerCase() === "qr" ? "qr" : "online";
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
  const shouldUseTurnstile = joinSource === "qr" && Boolean(turnstileSiteKey);
  const businessName = tenantInfo?.name || tenantSlugValue;
  const locationName = locationInfo?.name || "Primary location";
  const smsFeeApplies = form.notifyBySms && Boolean(tenantInfo?.queueFee?.enabled);
  const queueFeeDisplayAmount = tenantInfo?.queueFee?.displayAmount || "";
  const otpIsComplete = /^\d{6}$/.test(otpCode);
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

    apiRequest<QueueSnapshot>(`${basePath}/queue`)
      .then((data) => {
        setTenantInfo(data.tenant);
        setLocationInfo(data.location);
      })
      .catch((loadError) => {
        setError(getErrorMessage(loadError));
      });
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
          navigate(buildMonitorPathWithTicket(tenantSlugValue, data.ticket.lookupCode, locationSlug), {
            replace: true
          });
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
  }, [locationSlug, navigate, publicApiBase, searchParams, tenantSlugValue]);

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

      try {
        turnstileWidgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
          sitekey: turnstileSiteKey,
          callback: (nextToken) => {
            setTurnstileToken(nextToken);
            setTurnstileReady(true);
            setError("");
          },
          "expired-callback": () => {
            setTurnstileToken("");
            setTurnstileReady(false);
          },
          "error-callback": (code) => {
            setTurnstileToken("");
            setTurnstileReady(false);
            const errorCode = code ? ` Error code: ${code}.` : "";
            setError(`Security verification could not load.${errorCode}`);
            return false;
          }
        });
      } catch (turnstileError) {
        console.error(turnstileError);
        setTurnstileToken("");
        setTurnstileReady(false);
        setError("Security verification could not load. Please refresh and try again.");
      }
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
      if (form.notifyByEmail && !form.customerEmail.trim()) {
        setError("Email is required when email notifications are selected.");
        setSubmitting(false);
        return;
      }
      if (form.notifyBySms && !form.customerPhone.trim()) {
        setError("Phone is required when SMS alerts are selected.");
        setSubmitting(false);
        return;
      }
      if (shouldUseTurnstile && !turnstileToken) {
        setError("Please complete the security check before joining.");
        setSubmitting(false);
        return;
      }

      const data = await apiRequest<RequestJoinOtpResponse | QueueJoinPaymentResponse, JoinQueueRequest>(
        `${publicApiBase}/join-otp`,
        {
          method: "POST",
          token,
          body: buildJoinRequest()
        }
      );

      if ("requiresPayment" in data) {
        handleJoinResult(data);
        return;
      }

      setOtp(data);
      setOtpCode("");
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
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await requestOtp();
  }

  function handleJoinResult(data: QueueJoinPaymentResponse) {
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
      notifications.show({
        color: "teal",
        icon: <IconCheck size={18} />,
        message: "Your ticket has been issued.",
        title: "Joined queue"
      });
      navigate(buildMonitorPathWithTicket(tenantSlugValue, data.ticket.lookupCode, locationSlug), {
        replace: true
      });
      return;
    }

    notifications.show({
      color: "blue",
      icon: <IconInfoCircle size={18} />,
      message: "Your join request is being processed.",
      title: "Join request submitted"
    });
  }

  async function verifyOtpCode(code: string) {
    if (!otp || submitting || !/^\d{6}$/.test(code)) {
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
            code
          }
        }
      );

      handleJoinResult(data);
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await verifyOtpCode(otpCode);
  }

  useEffect(() => {
    if (!otpIsComplete) {
      lastAutoSubmittedOtpRef.current = "";
      return;
    }

    if (!otp || submitting || lastAutoSubmittedOtpRef.current === otpCode) {
      return;
    }

    lastAutoSubmittedOtpRef.current = otpCode;
    void verifyOtpCode(otpCode);
  }, [otp, otpCode, otpIsComplete, submitting]);

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl" className="finazze-join-layout">
      <Paper className="finazze-auth-card finazze-join-card" p={{ base: "xl", md: 44 }}>
        <Stack gap="md">
        <Text className="finazze-section-label">Join queue</Text>
        <Stack gap={2}>
          <Title order={1}>{businessName}</Title>
          <Title c="dimmed" order={2}>{locationName}</Title>
        </Stack>
        <Text c="dimmed">
          Enter your contact details to request a queue ticket. We will verify your contact
          information before issuing the ticket.
        </Text>
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
            <Stack gap={6}>
              <Text fw={600} size="sm">OTP</Text>
              <PinInput
                aria-label="One-time verification code"
                autoFocus
                inputMode="numeric"
                length={6}
                name="otpCode"
                oneTimeCode
                size="lg"
                type="number"
                value={otpCode}
                onChange={setOtpCode}
              />
            </Stack>
            {error ? <Alert color="red">{error}</Alert> : null}
            <Button color="dark" disabled={submitting || !otpIsComplete} type="submit">
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
            <TextInput required label="Name" name="customerName" value={form.customerName} onChange={(event) => setForm((current) => ({ ...current, customerName: event.target.value }))} />
            <TextInput required={form.notifyByEmail} label="Email" name="customerEmail" type="email" value={form.customerEmail} onChange={(event) => setForm((current) => ({ ...current, customerEmail: event.target.value }))} />
            <TextInput required={form.notifyBySms} label="Phone" name="customerPhone" value={form.customerPhone} onChange={(event) => setForm((current) => ({ ...current, customerPhone: event.target.value }))} />
            <Textarea label="Notes" minRows={3} name="notes" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
            <Checkbox
              checked={form.notifyByEmail}
              label="Email me when I am almost next in line"
              name="notifyByEmail"
              onChange={(event) => setForm((current) => ({ ...current, notifyByEmail: event.target.checked }))}
            />
            <Group gap="xs" align="center">
              <Checkbox
                checked={form.notifyBySms}
                label="Send SMS alerts"
                name="notifyBySms"
                onChange={(event) => setForm((current) => ({ ...current, notifyBySms: event.target.checked }))}
              />
              <Tooltip
                label={`SMS alerts incur a small fee of ${queueFeeDisplayAmount || "PHP 0.00"}.`}
                withArrow
              >
                <IconInfoCircle aria-label="SMS fee information" size={16} />
              </Tooltip>
            </Group>
            {smsFeeApplies ? (
              <Alert color="orange" title="Platform fee required">
                This queue requires a platform fee of <strong>{queueFeeDisplayAmount}</strong> for SMS alerts.
                You will continue to payment after contact verification.
              </Alert>
            ) : null}
            {shouldUseTurnstile ? (
              <Paper className="finazze-soft-panel" p="md">
                <div ref={turnstileContainerRef} />
              </Paper>
            ) : null}
            {error ? <Alert color="red">{error}</Alert> : null}
            <Button
              color="dark"
              disabled={submitting || (shouldUseTurnstile && !turnstileReady)}
              type="submit"
            >
              {submitting ? "Sending code..." : smsFeeApplies ? "Proceed to payment" : "Get priority number"}
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
