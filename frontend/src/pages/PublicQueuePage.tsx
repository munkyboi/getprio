import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Box, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconInfoCircle } from "@tabler/icons-react";
import QRCode from "react-qr-code";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { QueueJoinPaymentSyncResponse, QueueListTicket, QueueSnapshot } from "@shared";
import { API_BASE_URL, apiRequest } from "../api/client";
import { buildJoinUrl, buildJoinedQueuePathWithTicket } from "../queuePaths";
import { getErrorMessage } from "../utils/errors";
import { getLocationStatusSummary, getQueueStateSummary, getTicketStateSummary } from "../utils/queueStatus";

function hexToRgba(hex: string, alpha: number): string {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#ffffff";
  const value = normalized.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${Math.min(1, Math.max(0, alpha))})`;
}

function formatClock(timezone?: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone || "Asia/Manila"
  }).format(new Date());
}

function getLocationSubtitle(snapshot: QueueSnapshot | null, fallback: string) {
  const location = snapshot?.location;

  if (!location) {
    return fallback || "Main location";
  }

  const address = [
    location.name,
    location.addressLine1,
    location.city,
    location.province
  ].filter(Boolean);

  return address.length ? address.join(" - ") : location.name || fallback;
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "G";
}

function getEtaLabel(ticket: QueueListTicket, averageServiceMinutes: number) {
  const minutes = Math.max(0, ticket.position * averageServiceMinutes);

  if (!minutes) {
    return "Soon";
  }

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
  }

  return `${minutes}m`;
}

export default function PublicQueuePage() {
  const { tenantSlug, locationSlug } = useParams<{ tenantSlug: string; locationSlug?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);
  const [error, setError] = useState("");
  const [paymentSyncing, setPaymentSyncing] = useState(false);
  const [clockLabel, setClockLabel] = useState(() => formatClock());
  const hasSnapshotRef = useRef(false);
  const lookupCode = searchParams.get("ticket") || "";
  const paymentId = searchParams.get("payment");
  const paymentStatus = searchParams.get("payment_status");
  const tenantSlugValue = tenantSlug || "";
  const joinUrl =
    snapshot?.location?.joinUrl ||
    snapshot?.tenant?.joinUrl ||
    buildJoinUrl(window.location.origin, tenantSlugValue, locationSlug);
  const joinQrUrl = `${joinUrl}?source=qr`;
  const vendorIsInactive = snapshot ? !snapshot.tenant.isActive : false;
  const locationIsClosed = snapshot?.location ? !snapshot.location.openStatus.isOpen : false;
  const queueDayClosed = Boolean(snapshot?.queueDay?.isClosed);
  const queueDayPaused = Boolean(snapshot?.queueDay?.isPaused);
  const theme = snapshot?.publicBoardTheme.theme;
  const businessName = snapshot?.tenant?.name || tenantSlugValue || "GetPrio";
  const heroTitle = theme?.heroTitle || businessName;
  const heroSubtitle = getLocationSubtitle(snapshot, theme?.heroSubtitle || locationSlug || "Main location");
  const queueState = getQueueStateSummary(snapshot);
  const ticketState = getTicketStateSummary(snapshot?.focusTicket?.status);
  const locationState = getLocationStatusSummary(snapshot);
  const canJoinQueue =
    Boolean(snapshot) &&
    !vendorIsInactive &&
    !locationIsClosed &&
    !queueDayClosed &&
    !queueDayPaused;
  const averageServiceMinutes = snapshot?.tenant.averageServiceMinutes || 5;
  const visibleTickets = (snapshot?.nextUp || []).slice(0, 19);
  const topTickets = visibleTickets.slice(0, 3);
  const gridTickets = visibleTickets.slice(3, 19);
  const pageStyle = useMemo(
    () =>
      ({
        "--public-board-bg": theme?.pageBackgroundColor || "#f5efe6",
        "--public-board-card": theme
          ? hexToRgba(theme.cardBackgroundColor, theme.cardAlpha)
          : "rgba(255, 250, 244, 0.9)",
        "--public-board-border": theme?.cardBorderColor || "rgba(33, 25, 20, 0.12)",
        "--public-board-ink": theme?.headerColor || "#211914",
        "--public-board-body": theme?.bodyColor || "#3f3027",
        "--public-board-muted": theme?.subheaderColor || "#786b61",
        "--public-board-primary": theme?.buttonBackgroundColor || "#ff7a1a",
        "--public-board-primary-ink": theme?.buttonTextColor || "#ffffff",
        backgroundColor: theme?.pageBackgroundColor || undefined,
        backgroundImage: theme?.backgroundImageUrl
          ? `linear-gradient(rgba(255,255,255,0.36), rgba(255,255,255,0.36)), url(${theme.backgroundImageUrl})`
          : undefined
      }) as CSSProperties,
    [theme]
  );

  useEffect(() => {
    const intervalId = window.setInterval(
      () => setClockLabel(formatClock(snapshot?.location?.timezone)),
      30_000
    );
    setClockLabel(formatClock(snapshot?.location?.timezone));

    return () => window.clearInterval(intervalId);
  }, [snapshot?.location?.timezone]);

  useEffect(() => {
    if (!tenantSlugValue || !paymentId) {
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
          navigate(
            buildJoinedQueuePathWithTicket(tenantSlugValue, data.ticket.lookupCode, locationSlug),
            { replace: true }
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
          setPaymentSyncing(false);
        }
      });

    return () => {
      active = false;
    };
  }, [locationSlug, navigate, paymentId, paymentStatus, tenantSlugValue]);

  useEffect(() => {
    if (!tenantSlug) {
      return undefined;
    }

    let active = true;
    const query = lookupCode ? `?lookupCode=${encodeURIComponent(lookupCode)}` : "";
    const basePath = locationSlug
      ? `/public/tenant/${tenantSlug}/location/${locationSlug}`
      : `/public/tenant/${tenantSlug}`;

    apiRequest<QueueSnapshot>(`${basePath}/queue${query}`)
      .then((data) => {
        if (active) {
          hasSnapshotRef.current = true;
          setSnapshot(data);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(getErrorMessage(loadError));
        }
      });

    const eventSource = new EventSource(`${API_BASE_URL}${basePath}/stream${query}`);
    eventSource.onmessage = (event) => {
      hasSnapshotRef.current = true;
      setSnapshot(JSON.parse(event.data) as QueueSnapshot);
      setError("");
    };
    eventSource.onerror = () => {
      if (!hasSnapshotRef.current) {
        setError("Live updates disconnected. Refresh to reconnect.");
      }
      eventSource.close();
    };

    return () => {
      active = false;
      eventSource.close();
    };
  }, [locationSlug, lookupCode, tenantSlug]);

  return (
    <Box className="public-board-tv-shell" style={pageStyle}>
      <main className="public-board-tv-frame">
        <section className="public-board-tv-screen">
          <header className="public-board-tv-header">
              {theme?.logoUrl ? (
                <div className="public-board-tv-logo withImage">
                  <img alt={`${heroTitle} logo`} src={theme.logoUrl} />
                </div>
              ) : (
                <div className="public-board-tv-logo">
                  <span>{getInitials(heroTitle)}</span>
                </div>
              )}
            <div className="public-board-tv-title">
              <h1>{heroTitle}</h1>
              <p>{heroSubtitle}</p>
            </div>
            <div className="public-board-tv-clock">
              <strong>{clockLabel}</strong>
              <span>{locationState.label} - {queueState.label}</span>
            </div>
          </header>

          <section className="public-board-tv-main">
            <aside className="public-board-tv-left">
              <section className="public-board-tv-current">
                <div className="public-board-tv-current-inner">
                  <Text className="public-board-tv-eyebrow">Now serving</Text>
                  <strong>{snapshot?.current?.ticketNumber || "--"}</strong>
                  <span>{snapshot?.current ? "Please proceed when called" : "Waiting for next ticket"}</span>
                </div>
              </section>

              <section className="public-board-tv-qr">
                <div className="public-board-tv-qr-code">
                  <QRCode size={124} value={joinQrUrl} />
                </div>
                <div>
                  <Text className="public-board-tv-eyebrow">Join from phone</Text>
                  <h2>{canJoinQueue ? "Scan to get a queue ticket" : "Queue joins unavailable"}</h2>
                  <p>
                    {canJoinQueue
                      ? "No app install required. Customers can monitor their turn live."
                      : queueState.message}
                  </p>
                </div>
              </section>

              <section className="public-board-tv-stats">
                <div>
                  <span>Tickets served today</span>
                  <strong>{snapshot?.stats?.servedToday ?? 0}</strong>
                </div>
                <div>
                  <span>Currently waiting</span>
                  <strong>{snapshot?.stats?.waitingCount ?? 0}</strong>
                </div>
              </section>
            </aside>

            <section className="public-board-tv-queue">
              <div className="public-board-tv-queue-heading">
                <div>
                  <Text className="public-board-tv-eyebrow">Public queue list</Text>
                  <h2>Up next and waiting</h2>
                  <p>Top tickets are emphasized; the rest use compact readable cards instead of a tall table.</p>
                </div>
                <div className="public-board-tv-count">
                  <span>Next visible</span>
                  <strong>{visibleTickets.length}</strong>
                </div>
              </div>

              {paymentSyncing || error || (lookupCode && snapshot?.focusTicket) ? (
                <div className="public-board-tv-alerts">
                  {paymentSyncing ? <p>Confirming payment and issuing your queue ticket.</p> : null}
                  {error ? <p>{error}</p> : null}
                  {lookupCode && snapshot?.focusTicket ? (
                    <p>
                      Ticket {snapshot.focusTicket.ticketNumber}: {ticketState.message}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="public-board-tv-next-strip">
                {topTickets.length ? (
                  topTickets.map((ticket) => (
                    <article className="public-board-tv-next-card" key={ticket.id}>
                      <div>{ticket.position}</div>
                      <span>
                        <strong>{ticket.ticketNumber}</strong>
                        <em>{ticket.position === 1 ? "Next customer" : "On deck"}</em>
                      </span>
                    </article>
                  ))
                ) : (
                  <article className="public-board-tv-next-card public-board-tv-empty-next">
                    <div>0</div>
                    <span>
                      <strong>No tickets</strong>
                      <em>The queue is currently empty</em>
                    </span>
                  </article>
                )}
              </div>

              <div className="public-board-tv-ticket-grid">
                {gridTickets.map((ticket) => (
                  <article className="public-board-tv-ticket-card" key={ticket.id}>
                    <div>{ticket.position}</div>
                    <span>
                      <strong>{ticket.ticketNumber}</strong>
                      <em>Waiting</em>
                    </span>
                    <b>{getEtaLabel(ticket, averageServiceMinutes)}</b>
                  </article>
                ))}
              </div>
            </section>
          </section>
        </section>
      </main>
    </Box>
  );
}
