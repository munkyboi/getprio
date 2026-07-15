import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconArrowLeft, IconBuildingStore, IconCalendar, IconCheck, IconClock, IconInfoCircle, IconMessageDots, IconSparkles, IconTicket, IconX } from "@tabler/icons-react";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { CancelQueueTicketRequest, QueueJoinPaymentSyncResponse, QueueSnapshot, StoreHourSummary } from "@shared";
import { API_BASE_URL, ApiError, apiRequest } from "../api/client";
import ResourceErrorState from "../components/ResourceErrorState";
import { useAuth } from "../context/AuthContext";
import { buildJoinPath, buildJoinedQueuePathWithTicket, buildMonitorPath } from "../queuePaths";
import ContactForm from "../components/ContactForm";
import { clearJoinedQueueAccess, getJoinedQueueAccess } from "../utils/joinedQueueAccess";
import { getErrorMessage } from "../utils/errors";
import { getTicketStateSummary } from "../utils/queueStatus";

function maskNamePart(namePart: string): string {
  if (!namePart) {
    return "";
  }

  if (namePart.length === 1) {
    return `${namePart[0]}***`;
  }

  return `${namePart[0]}***${namePart[namePart.length - 1]}`;
}

function maskCustomerName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map(maskNamePart)
    .join(" ");
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#ffffff";
  const value = normalized.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${Math.min(1, Math.max(0, alpha))})`;
}

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function toMinutes(value: string): number {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function getTodayIndex(timezone?: string): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "Asia/Manila",
    weekday: "short"
  }).format(new Date());

  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

function formatDisplayTime(value: string): string {
  const [hourValue = "0", minuteValue = "0"] = value.split(":");
  const hour = Number(hourValue);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${minuteValue.padStart(2, "0")} ${period}`;
}

function formatHoursLabel(hour: StoreHourSummary): string {
  if (hour.isClosed) {
    return "Closed";
  }

  if (!hour.opensAt || !hour.closesAt) {
    return "--  •  --";
  }

  if (hour.opensAt === "00:00" && hour.closesAt === "00:00") {
    return "Open 24h";
  }

  const overnightLabel = toMinutes(hour.closesAt) < toMinutes(hour.opensAt) ? " next day" : "";

  return `${formatDisplayTime(hour.opensAt)} - ${formatDisplayTime(hour.closesAt)}${overnightLabel}`;
}

function getBusinessCategoryLabel(category?: string) {
  if (!category) {
    return "Generic Service Business";
  }

  const labels: Record<string, string> = {
    "Health and Wellness": "Wellness & Self-care",
    "Food and Beverage": "Food & Beverage",
    "Retail and E-commerce": "Retail & E-commerce",
    "Sports and Recreation": "Sports & Recreation",
    "Generic Service Business": "Service Business"
  };

  return labels[category] || category;
}

function normalizeHours(hours: StoreHourSummary[] = []): StoreHourSummary[] {
  return Array.from({ length: 7 }, (_, weekday) => {
    const hour = hours.find((item) => item.weekday === weekday);

    return (
      hour || {
        weekday,
        opensAt: "",
        closesAt: "",
        isClosed: false
      }
    );
  });
}

export default function JoinedQueuePage() {
  const { tenantSlug, locationSlug } = useParams<{ tenantSlug: string; locationSlug?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { token, user } = useAuth();
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);
  const [error, setError] = useState("");
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [paymentSyncing, setPaymentSyncing] = useState(false);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelErrorModalOpen, setCancelErrorModalOpen] = useState(false);
  const [hoursOpened, setHoursOpened] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const isMobile = useMediaQuery("(max-width: 48em)");
  const lookupCode = searchParams.get("ticket") || "";
  const paymentId = searchParams.get("payment");
  const paymentStatus = searchParams.get("payment_status");
  const tenantSlugValue = tenantSlug || "";

  const prefill = (location.state as { registrationPrefill?: { name?: string; email?: string; phone?: string } } | null)
    ?.registrationPrefill;
  const registrationState = useMemo(
    () => ({
      prefill,
      redirectTo: `${location.pathname}${location.search}${location.hash}`,
      claimLookupCode: lookupCode
    }),
    [location.hash, location.pathname, location.search, lookupCode, prefill]
  );
  const missingTenant = !tenantSlugValue;
  const shouldAwaitPaymentSync = Boolean(paymentId) && paymentStatus !== "cancelled";
  const missingLookupCode = !lookupCode && !shouldAwaitPaymentSync;

  const joinPath = buildJoinPath(tenantSlugValue, locationSlug);
  const vendorDetailsPath = `/vendors/${tenantSlugValue}`;
  const backLink = user ? "/account/tickets" : "/vendors";
  const backLabel = user ? "Back to queue list" : "Back to vendors";
  const locationHours = normalizeHours(snapshot?.location?.hours || []);
  const todayIndex = getTodayIndex(snapshot?.location?.timezone);
  const theme = snapshot?.publicBoardTheme.theme;
  const cardStyle: CSSProperties = theme
    ? {
        backgroundColor: hexToRgba(theme.cardBackgroundColor, theme.cardAlpha),
        border: `${theme.cardBorderSize}px solid ${theme.cardBorderColor}`,
        borderRadius: theme.cardBorderRadius,
        color: theme.bodyColor
      }
    : {
        backgroundColor: "rgba(255, 250, 244, 0.9)",
        border: "1px solid rgba(234, 220, 207, 0.9)",
        borderRadius: 28
      };
  const themeStyle: CSSProperties | undefined = theme
    ? ({
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
        "--vendor-theme-pill-primary-bg": theme.buttonBackgroundColor,
        "--vendor-theme-pill-primary-text": theme.buttonTextColor,
        "--vendor-theme-pill-secondary-bg": theme.subheaderColor,
        "--vendor-theme-pill-secondary-text": theme.pageBackgroundColor,
        "--vendor-theme-pill-muted-bg": theme.bodyColor,
        "--vendor-theme-pill-muted-text": theme.pageBackgroundColor,
        "--vendor-theme-button-border-width": theme.presetId === "sports" ? "0px" : "1px",
        "--vendor-theme-logo-bg": theme.cardBackgroundColor,
        ...(theme.pageBackgroundImageUrl
          ? {
              "--vendor-theme-page-image": `url(${theme.pageBackgroundImageUrl})`,
              "--vendor-theme-page-image-position": "center",
              "--vendor-theme-page-image-repeat": "no-repeat",
              "--vendor-theme-page-image-size": theme.pageBackgroundImageFit
            }
          : {})
      } as CSSProperties)
    : undefined;
  const buttonStyle: CSSProperties | undefined = theme
    ? {
        background: theme.buttonBackgroundColor,
        borderColor: theme.buttonBorderColor,
        color: theme.buttonTextColor
      }
    : undefined;
  const headerColor = theme?.headerColor || "#24160f";
  const subheaderColor = theme?.subheaderColor || "#8a5c39";
  const bodyColor = theme?.bodyColor || "#3f3027";
  const businessName = snapshot?.tenant?.name || tenantSlugValue;
  const locationName = snapshot?.location?.name || "Main location";
  const locationDetailLabel = [snapshot?.location?.city, snapshot?.location?.province].filter(Boolean).join(", ") || snapshot?.location?.country || "Philippines";
  const heroSubtitle = theme?.heroTitle || "Book ahead or follow your same-day queue ticket.";
  const heroDescription =
    theme?.heroSubtitle ||
    snapshot?.location?.openStatus.summary ||
    "Your queue ticket is linked to this vendor profile, branch, and live service queue.";
  const ticketState = getTicketStateSummary(snapshot?.focusTicket?.status);
  const themedMediaStyle: CSSProperties | undefined = theme
    ? {
        backgroundColor: hexToRgba(theme.cardBackgroundColor, Math.min(1, theme.cardAlpha + 0.08)),
        backgroundImage: theme.backgroundImageUrl
          ? `linear-gradient(rgba(255,255,255,0.08), rgba(255,255,255,0.08)), url(${theme.backgroundImageUrl})`
          : undefined,
        backgroundSize: theme.backgroundImageFit || "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat"
      }
    : undefined;
  const bookingPath = `/vendors/${tenantSlugValue}/book${locationSlug ? `?location=${encodeURIComponent(locationSlug)}` : ""}`;
  const vendorIsInactive = snapshot ? !snapshot.tenant.isActive : false;
  const locationIsClosed = snapshot?.location ? !snapshot.location.openStatus.isOpen : false;
  const queueDayClosed = Boolean(snapshot?.queueDay?.isClosed);
  const queueDayPaused = Boolean(snapshot?.queueDay?.isPaused);
  const ticketIsWaiting = snapshot?.focusTicket?.status === "waiting";
  const canJoinAgain =
    Boolean(snapshot) &&
    !ticketIsWaiting &&
    !vendorIsInactive &&
    !locationIsClosed &&
    !queueDayClosed &&
    !queueDayPaused;
  const queueProgressTickets = [
    ...(snapshot?.current
      ? [
          {
            id: `current-${snapshot.current.id}`,
            ticketNumber: snapshot.current.ticketNumber,
            customerName: maskCustomerName(snapshot.current.customerName),
            progressLabel: "Now serving"
          }
        ]
      : []),
    ...((snapshot?.nextUp || []).map((ticket) => ({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      customerName: maskCustomerName(ticket.customerName),
      progressLabel: `#${ticket.position}`
    })))
  ].slice(0, 10);
  const userIsCustomer = Boolean(user?.roles?.includes("customer"));
  const storedAccess = getJoinedQueueAccess(lookupCode);
  const cancellationContact = {
    customerEmail: user?.email || storedAccess?.customerEmail || prefill?.email || "",
    customerPhone: user?.phone || storedAccess?.customerPhone || prefill?.phone || ""
  };
  const canCancelTicket = snapshot?.focusTicket?.status === "waiting";
  const ownershipVerificationError = "We could not verify that this ticket belongs to you.";

  useEffect(() => {
    if (missingTenant || missingLookupCode) {
      return undefined;
    }

    const basePath = locationSlug
      ? `/public/tenant/${tenantSlugValue}/location/${locationSlug}`
      : `/public/tenant/${tenantSlugValue}`;
    const query = `?lookupCode=${encodeURIComponent(lookupCode)}`;
    let active = true;

    apiRequest<QueueSnapshot>(`${basePath}/queue${query}`)
      .then((data) => {
        if (active) {
          setSnapshot(data);
          setError("");
          setResponseStatus(null);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(getErrorMessage(loadError));
          setResponseStatus(loadError instanceof ApiError ? loadError.status : null);
        }
      });

    const eventSource = new EventSource(`${API_BASE_URL}${basePath}/stream${query}`);
    eventSource.onmessage = (event) => {
      const nextSnapshot = JSON.parse(event.data) as QueueSnapshot;
      if (lookupCode && !nextSnapshot.focusTicket) {
        setError("Queue ticket not found.");
        setResponseStatus(404);
        eventSource.close();
        return;
      }

      setSnapshot(nextSnapshot);
      setError("");
      setResponseStatus(null);
    };
    eventSource.onerror = () => {
      setError("Live updates disconnected. Refresh to reconnect.");
      eventSource.close();
    };

    return () => {
      active = false;
      eventSource.close();
    };
  }, [locationSlug, lookupCode, missingLookupCode, missingTenant, tenantSlugValue]);

  useEffect(() => {
    if (!tenantSlugValue || !paymentId || paymentStatus === "cancelled") {
      return;
    }

    let active = true;
    setPaymentSyncing(true);
    setError("");

    notifications.show({
      color: "blue",
      icon: <IconInfoCircle size={18} />,
      message: "Confirming your queue fee payment...",
      title: "Payment received"
    });

    const basePath = locationSlug
      ? `/public/tenant/${tenantSlugValue}/location/${locationSlug}`
      : `/public/tenant/${tenantSlugValue}`;

    apiRequest<QueueJoinPaymentSyncResponse>(`${basePath}/join-payments/${paymentId}/sync`, {
      method: "POST"
    })
      .then((data) => {
        if (!active) {
          return;
        }

        if (data.paid && data.ticket?.lookupCode) {
          notifications.show({
            color: "teal",
            icon: <IconCheck size={18} />,
            message: "Your ticket has been issued.",
            title: "Joined queue"
          });
          navigate(buildJoinedQueuePathWithTicket(tenantSlugValue, data.ticket.lookupCode, locationSlug), {
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
          setPaymentSyncing(false);
        }
      });

    return () => {
      active = false;
    };
  }, [locationSlug, navigate, paymentId, paymentStatus, tenantSlugValue]);

  if (missingTenant) {
    return <Navigate replace to="/" />;
  }

  if (missingLookupCode) {
    return <Navigate replace to={buildMonitorPath(tenantSlugValue, locationSlug)} />;
  }

  if (responseStatus === 404) {
    return (
      <ResourceErrorState
        backLabel={backLabel}
        backTo={backLink}
        error={error}
        onRetry={() => window.location.reload()}
        resourceName="queue ticket"
        status={responseStatus}
      />
    );
  }

  async function handleCancelTicket() {
    setCancelSubmitting(true);
    setError("");

    try {
      await apiRequest<{ ticket: { lookupCode: string; status: string } }, CancelQueueTicketRequest>(
        `${locationSlug ? `/public/tenant/${tenantSlugValue}/location/${locationSlug}` : `/public/tenant/${tenantSlugValue}`}/tickets/${lookupCode}`,
        {
          method: "DELETE",
          body: cancellationContact,
          token
        }
      );

      clearJoinedQueueAccess(lookupCode);
      setSnapshot((current) =>
        current
          ? {
              ...current,
              focusTicket: current.focusTicket
                ? {
                    ...current.focusTicket,
                    status: "cancelled",
                    position: null
                  }
                : null
            }
          : current
      );
      setCancelConfirmOpen(false);
    } catch (cancelError) {
      const message = getErrorMessage(cancelError);
      if (message === ownershipVerificationError) {
        setCancelConfirmOpen(false);
        setCancelErrorModalOpen(true);
        return;
      }
      setError(message);
    } finally {
      setCancelSubmitting(false);
    }
  }

  return (
    <Stack className="vendor-profile-page" gap="xl" style={themeStyle}>
      <Container size="xl" w="100%">
        <Button className="ticket-page-back-button" component={Link} leftSection={<IconArrowLeft size={18} />} mb="md" to={backLink} variant="subtle" w="fit-content">
          {backLabel}
        </Button>

        <Modal
          centered
          className="customer-modal"
          transitionProps={{ transition: "slide-up", duration: 240, timingFunction: "ease-out" }}
          onClose={() => {
            if (!cancelSubmitting) {
              setCancelConfirmOpen(false);
            }
          }}
          opened={cancelConfirmOpen}
          size="md"
          title="Cancel this ticket?"
        >
          <Stack gap="md">
            <Alert color="red" variant="light">
              Cancelling removes your place in today&apos;s queue. If you still need the service later, you&apos;ll have to join again and may receive a new position.
            </Alert>
            <Text c="dimmed" size="sm">
              This action is optional. Keep the ticket if you still plan to visit the vendor today.
            </Text>
            <Stack className="customer-modal-actions ticket-page-cancel-modal-actions" gap="sm">
              <Button color="red" loading={cancelSubmitting} onClick={handleCancelTicket} size="lg">
                Confirm cancel
              </Button>
            </Stack>
          </Stack>
        </Modal>
        <Modal
        centered
        className="customer-modal"
        transitionProps={{ transition: "slide-up", duration: 240, timingFunction: "ease-out" }}
          onClose={() => setCancelErrorModalOpen(false)}
          opened={cancelErrorModalOpen}
          size="sm"
          title="Unable to cancel ticket"
        >
          <Alert color="red" variant="light">
            {ownershipVerificationError}
          </Alert>
        </Modal>
        <Modal
        centered
        className="customer-modal"
        transitionProps={{ transition: "slide-up", duration: 240, timingFunction: "ease-out" }}
          opened={hoursOpened}
          onClose={() => setHoursOpened(false)}
          title="Business hours"
          size="lg"
        >
          <Paper className="vendor-location-card ticket-hours-modal-card" p="md" style={themeStyle}>
            <Stack gap="sm">
              <Group justify="space-between" wrap="nowrap">
                <div>
                  <Text className="ticket-hours-modal-location-title" fw={800}>{locationName}</Text>
                  <Text className="ticket-hours-modal-location-detail" size="sm">
                    {locationDetailLabel}
                  </Text>
                </div>
              </Group>

              <div className="vendor-hours-card">
                <Group gap={6} mb={6}>
                  <IconClock size={15} />
                  <Text className="ticket-hours-modal-label" fw={800} size="xs">
                    Store hours
                  </Text>
                </Group>
                <div className="vendor-hours-list">
                  {locationHours.map((hour) => {
                    const isToday = hour.weekday === todayIndex;
                    const hoursLabel = formatHoursLabel(hour);
                    const isClosed = hoursLabel === "Closed";

                    return (
                      <div
                        aria-current={isToday ? "date" : undefined}
                        className={[
                          "vendor-hours-row",
                          isClosed ? "vendor-hours-row-muted" : "",
                          isToday ? "vendor-hours-row-today" : ""
                        ].filter(Boolean).join(" ")}
                        key={hour.weekday}
                      >
                        <span className="vendor-hours-day">{weekdayLabels[hour.weekday]}</span>
                        <span className="vendor-hours-time">{hoursLabel}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <Group className="customer-modal-actions" mt="xs">
                <Button className="ticket-hours-modal-primary-action" component={Link} size="sm" to={joinPath} variant="light">
                  Join this queue
                </Button>
                <Button className="ticket-page-card-action" component={Link} size="sm" to={bookingPath} variant="subtle">
                  Book here
                </Button>
              </Group>
            </Stack>
          </Paper>
        </Modal>
        <Modal
        centered
        className="customer-modal contact-vendor-modal"
        transitionProps={{ transition: "slide-up", duration: 240, timingFunction: "ease-out" }}
          fullScreen={isMobile}
          onClose={() => setContactOpen(false)}
          opened={contactOpen}
          radius={isMobile ? 0 : "xl"}
          size="lg"
          title={
            <Stack gap={2} className="contact-modal-title">
              <Text className="contact-form-eyebrow contact-modal-eyebrow">CONTACT VENDOR</Text>
              <Text className="contact-form-title">Send {businessName || "the vendor"} a Message</Text>
            </Stack>
          }
          styles={{
            header: {
              alignItems: "flex-start",
              padding: "1.25rem 1.25rem 0.75rem"
            },
            title: {
              flex: 1,
              marginRight: "1rem",
              minWidth: 0
            },
            close: {
              marginTop: "0.1rem"
            }
          }}
        >
          <ContactForm
            scope="vendor"
            recipientName={businessName || "the vendor"}
            intro="Use this form to ask about this vendor's services, booking details, or public profile."
          />
        </Modal>
        {shouldAwaitPaymentSync || paymentSyncing ? (
          <Alert color="blue" title="Confirming payment">
            We are confirming your queue fee payment and loading your ticket.
          </Alert>
        ) : null}
        <Paper className="vendor-hero-shell ticket-page-hero" p={{ base: "lg", md: "xl" }}>
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={{ base: "xl", lg: 48 }}>
            <Stack gap="lg" justify="flex-start">
              <div>
                <Group gap="sm" wrap="wrap">
                  <Badge className="vendor-theme-badge vendor-theme-badge-primary" size="lg" variant="light">
                    {getBusinessCategoryLabel()}
                  </Badge>
                </Group>
                <Stack gap={4} mt="md">
                  <Title className="vendor-hero-title ticket-page-title" order={1}>
                    {businessName}
                  </Title>
                  <Text className="vendor-hero-subtitle" fw={700} size="lg">
                    {heroSubtitle}
                  </Text>
                </Stack>
              </div>

              <Text className="vendor-hero-description">
                {heroDescription}
              </Text>

              <Stack gap="xs">
                <Group c="dimmed" gap={8} wrap="nowrap">
                  <ThemeIcon className="vendor-theme-icon" radius="xl" size={32} variant="light">
                    <IconInfoCircle size={16} />
                  </ThemeIcon>
                  <Text>{locationName}</Text>
                </Group>
                <Group c="dimmed" gap={8} wrap="nowrap">
                  <ThemeIcon className="vendor-theme-icon" radius="xl" size={32} variant="light">
                    <IconClock size={16} />
                  </ThemeIcon>
                  <Text>{formatHoursLabel(locationHours[todayIndex])}</Text>
                  <Button
                    className="ticket-page-inline-hours-button"
                    leftSection={<IconInfoCircle size={14} />}
                    onClick={() => setHoursOpened(true)}
                    radius="xl"
                    size="xs"
                    variant="subtle"
                  >
                    Business hours
                  </Button>
                </Group>
              </Stack>

              <Group className="customer-action-row" gap="md">
                <Button
                  className="vendor-theme-button"
                  component={Link}
                  leftSection={<IconBuildingStore size={18} />}
                  size="lg"
                  to={vendorDetailsPath}
                >
                  Vendor details
                </Button>
                <Button
                  className="vendor-theme-button vendor-theme-button-ghost"
                  leftSection={<IconMessageDots size={18} />}
                  onClick={() => setContactOpen(true)}
                  size="lg"
                  variant="subtle"
                >
                  Contact vendor
                </Button>
              </Group>

              <Group gap="lg" className="vendor-trust-row">
                <Group gap={8} wrap="nowrap">
                  <ThemeIcon className="vendor-theme-icon" radius="xl" size={32} variant="light">
                    <IconSparkles size={16} />
                  </ThemeIcon>
                  <Text fw={700} size="sm">
                    Verified public profile
                  </Text>
                </Group>
                <Group gap={8} wrap="nowrap">
                  <ThemeIcon className="vendor-theme-icon" radius="xl" size={32} variant="light">
                    <IconClock size={16} />
                  </ThemeIcon>
                  <Text fw={700} size="sm">
                    Same-day queue
                  </Text>
                </Group>
                <Group gap={8} wrap="nowrap">
                  <ThemeIcon className="vendor-theme-icon" radius="xl" size={32} variant="light">
                    <IconCalendar size={16} />
                  </ThemeIcon>
                  <Text fw={700} size="sm">
                    Book ahead
                  </Text>
                </Group>
              </Group>
            </Stack>

            <Paper className="vendor-hero-visual" p="xl" style={themedMediaStyle}>
              <div className="vendor-hero-media-shell">
                <div className="vendor-hero-media-slide is-active">
                  {theme?.logoUrl ? (
                    <div className="vendor-profile-logo-frame">
                      <img alt={`${businessName} logo`} src={theme.logoUrl} />
                    </div>
                  ) : snapshot?.location?.imageUrl ? (
                    <img alt="" className="vendor-profile-image-content" src={snapshot.location.imageUrl} />
                  ) : (
                    <div className="ticket-page-placeholder">
                      <IconTicket size={56} stroke={1.5} />
                      <Text fw={800}>{businessName}</Text>
                    </div>
                  )}
                </div>
              </div>

              <Paper className="vendor-hero-status-card" p="lg">
                <Text fw={800}>
                  {snapshot?.focusTicket?.customerName ? maskCustomerName(snapshot.focusTicket.customerName) : "Your queue ticket"}
                </Text>
                <Text c="dimmed" size="sm">
                  {snapshot?.focusTicket?.lookupCode ? `${snapshot.focusTicket.lookupCode} · ${ticketState.label}` : ticketState.message}
                </Text>
                <SimpleGrid cols={{ base: 1, sm: 2 }} mt="md" spacing="sm">
                  <div className="prio-dashboard-tile">
                    <Text c="dimmed" size="xs">
                      Your Queue Ticket
                    </Text>
                    <Text className="prio-dashboard-number">
                      {snapshot?.focusTicket?.ticketNumber || lookupCode}
                    </Text>
                  </div>
                  <div className="prio-dashboard-tile">
                    <Text c="dimmed" size="xs">
                      Ticket Status
                    </Text>
                    <Text fw={800}>
                      {ticketState.label}
                    </Text>
                  </div>
                  <div className="prio-dashboard-tile">
                    <Text c="dimmed" size="xs">
                      Position
                    </Text>
                    <Text fw={800}>
                      {ticketIsWaiting && snapshot?.focusTicket?.position ? `#${snapshot.focusTicket.position}` : "--"}
                    </Text>
                  </div>
                  <div className="prio-dashboard-tile">
                    <Text c="dimmed" size="xs">
                      ETA
                    </Text>
                    <Text fw={800}>
                      {snapshot?.focusTicket?.estimatedWaitMinutes ?? snapshot?.stats?.estimatedWaitMinutes ?? 0} mins
                    </Text>
                  </div>
                </SimpleGrid>
                <Text c="dimmed" mt="md" size="sm">
                  {ticketState.message}
                </Text>
                {canCancelTicket ? (
                  <Stack className="ticket-page-ticket-actions" gap="sm" mt="md">
                    <Button className="ticket-page-ticket-cancel-action" color="red" leftSection={<IconX size={16} />} onClick={() => setCancelConfirmOpen(true)} radius="xl">
                      Cancel ticket
                    </Button>
                  </Stack>
                ) : null}
                {!ticketIsWaiting ? (
                  <div className="ticket-page-card-actions">
                    <Button
                      className="ticket-page-card-action"
                      component={Link}
                      disabled={!canJoinAgain}
                      leftSection={<IconTicket size={16} />}
                      radius="xl"
                      to={joinPath}
                      variant="subtle"
                    >
                      Join again
                    </Button>
                    <Text className="ticket-page-card-action-separator" fw={700} size="sm">
                      or
                    </Text>
                    <Button className="ticket-page-card-action" component={Link} leftSection={<IconCalendar size={16} />} radius="xl" to={bookingPath} variant="subtle">
                      Start booking
                    </Button>
                  </div>
                ) : null}
              </Paper>
            </Paper>
          </SimpleGrid>
        </Paper>

        {!userIsCustomer ? (
          <Paper className="ticket-page-save-section" p="xl" shadow="lg" style={cardStyle}>
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
              <Stack gap="xs">
                <Text c={subheaderColor} fw={800} size="xs" tt="uppercase" lts={2}>
                  Save this experience
                </Text>
                <Title c={headerColor} order={3}>
                  Create a customer account for faster joins next time.
                </Title>
                <Text c={bodyColor}>
                  Save your contact details, keep your queue activity in one place, and return to this ticket page after registration.
                </Text>
              </Stack>
              <Group align="center" justify="flex-start">
                <Button
                  component={Link}
                  state={registrationState}
                  to="/register/customer"
                  radius="xl"
                  style={buttonStyle}
                >
                  Create customer account
                </Button>
              </Group>
            </SimpleGrid>
          </Paper>
        ) : null}

        {error ? <Alert color="red">{error}</Alert> : null}

        <Paper className="ticket-page-stats-section" px={0} py="xl">
          <Stack gap="md">
            <Group justify="space-between" align="flex-start">
              <div>
                <Text c={subheaderColor} fw={800} size="xs" tt="uppercase" lts={2}>
                  Queue stats
                </Text>
                <Title className="vendor-section-title ticket-page-section-title" order={2}>Queue overview</Title>
              </div>
            </Group>
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
              <Paper className="ticket-page-metric" p="md">
                <Text c={subheaderColor} fw={800} size="xs" tt="uppercase" lts={2}>
                  ETA
                </Text>
                <Title className="ticket-page-metric-value" order={2}>
                  {snapshot?.focusTicket?.estimatedWaitMinutes ?? snapshot?.stats?.estimatedWaitMinutes ?? 0} mins
                </Title>
              </Paper>
              <Paper className="ticket-page-metric" p="md">
                <Text c={subheaderColor} fw={800} size="xs" tt="uppercase" lts={2}>
                  Waiting
                </Text>
                <Title className="ticket-page-metric-value" order={2}>
                  {snapshot?.stats?.waitingCount ?? 0}
                </Title>
              </Paper>
              <Paper className="ticket-page-metric" p="md">
                <Text c={subheaderColor} fw={800} size="xs" tt="uppercase" lts={2}>
                  Completed Today
                </Text>
                <Title className="ticket-page-metric-value" order={2}>
                  {snapshot?.stats?.servedToday ?? 0}
                </Title>
              </Paper>
            </SimpleGrid>
            <Text c={bodyColor} fw={700}>
              Currently serving: {snapshot?.current?.ticketNumber || "--"}
            </Text>
          </Stack>
        </Paper>

        <Paper className="ticket-page-queue-list-section" p="xl" shadow="lg" style={cardStyle}>
          <Stack gap="md">
            <Group justify="space-between" align="flex-start">
              <div>
                <Text c={subheaderColor} fw={800} size="xs" tt="uppercase" lts={2}>
                  Queue list
                </Text>
                <Title className="vendor-section-title ticket-page-section-title" order={2}>Up next and waiting</Title>
              </div>
            </Group>
            <Table.ScrollContainer minWidth={560}>
              <Table verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Ticket</Table.Th>
                    <Table.Th>Customer</Table.Th>
                    <Table.Th ta="right">Position</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {queueProgressTickets.length ? (
                    queueProgressTickets.map((ticket) => (
                      <Table.Tr key={ticket.id}>
                        <Table.Td>
                          <Text c={headerColor} fw={800}>{ticket.ticketNumber}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text c={bodyColor} size="sm">{ticket.customerName}</Text>
                        </Table.Td>
                        <Table.Td ta="right">
                          <Badge radius="xl" variant="light">{ticket.progressLabel}</Badge>
                        </Table.Td>
                      </Table.Tr>
                    ))
                  ) : (
                    <Table.Tr>
                      <Table.Td colSpan={3}>
                        <Text c={bodyColor}>The queue is currently empty.</Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Stack>
        </Paper>
      </Container>
    </Stack>
  );
}
