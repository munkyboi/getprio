import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent
} from "react";
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
import { IconArrowLeft, IconCheck, IconInfoCircle, IconMapPin } from "@tabler/icons-react";
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
import PhilippineMobileInput from "../components/PhilippineMobileInput";
import { buildJoinedQueuePathWithTicket } from "../queuePaths";
import { formatDisplayTime, toTimestamp } from "../utils/dates";
import { saveJoinedQueueAccess } from "../utils/joinedQueueAccess";
import { getErrorMessage } from "../utils/errors";
import { getQueueStateSummary, isQueueAcceptingJoins } from "../utils/queueStatus";

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
  const publicApiBase = locationSlug
    ? `/public/tenant/${tenantSlugValue}/location/${locationSlug}`
    : `/public/tenant/${tenantSlugValue}`;
  const joinSource = searchParams.get("source")?.toLowerCase() === "qr" ? "qr" : "online";
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
  const shouldUseTurnstile = joinSource === "qr" && Boolean(turnstileSiteKey);
  const resendAvailableAtMs = otp ? toTimestamp(otp.resendAvailableAt) : 0;
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
  const canSkipOtp = !form.notifyByEmail;
  const queueIntakePaused = Boolean(queueSnapshot?.queueDay?.isPaused);
  const queueStateBadge = getQueueStateSummary(queueSnapshot);
  const queueJoinUnavailable = !isQueueAcceptingJoins(queueSnapshot);
  const queuePauseMessage =
    queueSnapshot?.queueDay?.pauseReason ||
    "This queue is temporarily paused while the team works through the current line.";
  const queueClosedMessage = queueStateBadge.message;
  const requiresEmail = form.notifyByEmail;
  const pageTitle = tenantInfo?.name || tenantSlugValue;
  const signedInCustomer = Boolean(user?.roles?.includes("customer"));
  const requiresPhone = false;
  const theme = queueSnapshot?.publicBoardTheme?.theme;
  const themeStyle: CSSProperties | undefined = theme
    ? {
        "--vendor-theme-page-bg": theme.pageBackgroundColor,
        "--vendor-theme-card-bg": theme.cardBackgroundColor,
        "--vendor-theme-card-alpha": String(theme.cardAlpha),
        "--vendor-theme-card-border": theme.cardBorderColor,
        "--vendor-theme-header": theme.headerColor,
        "--vendor-theme-subheader": theme.subheaderColor,
        "--vendor-theme-body": theme.bodyColor,
        "--vendor-theme-button-bg": theme.buttonBackgroundColor,
        "--vendor-theme-button-text": theme.buttonTextColor,
        "--vendor-theme-button-border": theme.buttonBorderColor,
        "--vendor-theme-button-border-width": theme.presetId === "sports" ? "0px" : "1px",
        ...(theme.pageBackgroundImageUrl
          ? {
              "--vendor-theme-page-image": `url(${theme.pageBackgroundImageUrl})`,
              "--vendor-theme-page-image-position": "center",
              "--vendor-theme-page-image-repeat": "no-repeat",
              "--vendor-theme-page-image-size": theme.pageBackgroundImageFit
            }
          : {})
      } as CSSProperties
    : undefined;
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
      setError("Live queue updates interrupted. Reconnecting…");
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
      if (queueJoinUnavailable) {
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
      if (queueJoinUnavailable) {
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
    <Stack className="vendor-profile-page join-queue-page" gap="lg" style={themeStyle}>
      <div className="join-queue-frame">
        <Button
          className="join-queue-back"
          color="dark"
          component={Link}
          leftSection={<IconArrowLeft size={18} />}
          to={`/vendors/${tenantSlugValue}`}
          variant="subtle"
        >
          Back to vendor
        </Button>

        <Paper className="vendor-hero-shell join-queue-card" p={{ base: "lg", sm: "xl", md: 48 }}>
          <Stack gap="xl">
            <header className="join-queue-header">
              <Stack gap="sm">
                <Text className="vendor-hero-kicker">Join queue</Text>
                <Title className="vendor-hero-title join-queue-title" order={1}>
                  {pageTitle}
                </Title>
                <Text className="vendor-hero-description">
                  Enter your details to get a priority number for this branch.
                </Text>
              </Stack>

              <Paper className="booking-detail-services-card join-queue-status-card" p="md">
                <Stack gap="sm">
                  <Group className="join-queue-status-top" gap="sm" justify="space-between" wrap="nowrap">
                    {locationName ? (
                      <Group gap="xs" wrap="nowrap">
                        <IconMapPin aria-hidden="true" size={18} />
                        <Text fw={800}>{locationName}</Text>
                      </Group>
                    ) : null}
                    <Badge
                      className="join-queue-status-badge"
                      color={queueStateBadge.color}
                      radius="xl"
                      size="lg"
                      variant="light"
                    >
                      {queueStateBadge.label}
                    </Badge>
                  </Group>
                  <Text className="join-queue-status-message" size="sm">
                    {queueStateBadge.message}
                  </Text>
                </Stack>
              </Paper>
            </header>

            <div className="join-queue-form-section">
              <Stack gap="md">
                <div>
                  <Title className="join-queue-form-title" order={2}>
                    {otp ? "Verify your email" : "Your details"}
                  </Title>
                  <Text className="join-queue-form-intro" c="dimmed" mt={4} size="sm">
                    {otp
                      ? "Enter the code below to finish joining the queue."
                      : signedInCustomer
                        ? "Your saved contact details are prefilled. Changes here only apply to this queue visit."
                        : "We use these details to identify your ticket and send queue updates."}
                  </Text>
                </div>
            {!form.notifyByEmail ? (
              <Text c="dimmed" size="sm">
                Email verification is skipped when almost-next email alerts are off.
              </Text>
            ) : null}
            {queueIntakePaused ? (
              <Alert color="yellow" icon={<IconInfoCircle size={18} />} radius="md" variant="light">
                We are temporarily pausing new joins for this queue while the team catches up with the current line.
                {queueSnapshot?.queueDay?.pauseReason ? ` ${queueSnapshot.queueDay.pauseReason}.` : ""}
                {" "}Please check back shortly.
              </Alert>
            ) : null}
            {queueJoinUnavailable && !queueIntakePaused ? (
              <Alert color="red" icon={<IconInfoCircle size={18} />} radius="md" variant="light">
                {queueStateBadge.message}
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
                      It expires at {formatDisplayTime(otp.expiresAt)}.
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
                    className="vendor-theme-button join-queue-primary-action"
                    color="dark"
                    disabled={submitting || queueJoinUnavailable || otpCode.length !== 6}
                    type="submit"
                  >
                    {submitting ? "Verifying..." : "Verify and join queue"}
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
                    autoComplete="name"
                    value={form.customerName}
                    onChange={(event) => setForm((current) => ({ ...current, customerName: event.target.value }))}
                  />
                  <TextInput
                    name="customerEmail"
                    label="Email"
                    autoComplete="email"
                    required={requiresEmail}
                    type="email"
                    value={form.customerEmail}
                    onChange={(event) => setForm((current) => ({ ...current, customerEmail: event.target.value }))}
                  />
                  <PhilippineMobileInput
                    name="customerPhone"
                    label="Phone"
                    autoComplete="tel"
                    required={requiresPhone}
                    value={form.customerPhone}
                    onChange={(nextValue) => setForm((current) => ({ ...current, customerPhone: nextValue }))}
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
                  {shouldUseTurnstile ? (
                    <Paper className="finazze-soft-panel" p="md">
                      <div ref={turnstileContainerRef} />
                    </Paper>
                  ) : null}
                  {error ? <Alert color="red">{error}</Alert> : null}
                  <Button
                    className="vendor-theme-button customer-primary-action join-queue-primary-action"
                    color="dark"
                    disabled={submitting || queueJoinUnavailable || (shouldUseTurnstile && !turnstileReady)}
                    size="lg"
                    type="submit"
                  >
                    {submitting
                      ? canSkipOtp
                        ? "Joining..."
                        : "Sending code..."
                      : canSkipOtp
                        ? "Get priority number"
                        : "Send verification code"}
                  </Button>
                </Stack>
              </form>
            )}
              </Stack>
            </div>
          </Stack>
        </Paper>
      </div>
    </Stack>
  );
}
