import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Box, Text } from "@mantine/core";
import type { QueueListTicket, QueueSnapshot } from "@shared";
import { buildJoinUrl } from "../queuePaths";
import { resolveVendorProfileMedia } from "../utils/vendorTheme";
import StyledQRCode from "../components/StyledQRCode";
import {
  getLocationStatusSummary,
  getQueueStateSummary,
  isQueueAcceptingJoins
} from "../utils/queueStatus";

function hexToRgba(hex: string, alpha: number): string {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#ffffff";
  const value = normalized.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${Math.min(1, Math.max(0, alpha))})`;
}

function formatClock(date: Date, timezone?: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone || "Asia/Manila"
  }).format(date);
}

function formatCalendarDate(date: Date, timezone?: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: timezone || "Asia/Manila"
  }).formatToParts(date);

  return {
    day: parts.find((part) => part.type === "day")?.value || "",
    month: (parts.find((part) => part.type === "month")?.value || "").toUpperCase()
  };
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

export default function PublicQueuePage({ snapshot }: { snapshot: QueueSnapshot }) {
  const [clockNow, setClockNow] = useState(() => new Date());
  const tenantSlugValue = snapshot.tenant.slug;
  const locationSlug = snapshot.location?.slug;
  const joinUrl =
    snapshot?.location?.joinUrl ||
    snapshot?.tenant?.joinUrl ||
    buildJoinUrl(window.location.origin, tenantSlugValue, locationSlug);
  const joinQrUrl = `${joinUrl}?source=qr`;
  const vendorIsInactive = snapshot ? !snapshot.tenant.isActive : false;
  const locationIsClosed = snapshot?.location ? !snapshot.location.openStatus.isOpen : false;
  const theme = resolveVendorProfileMedia(
    snapshot?.publicBoardTheme.theme,
    snapshot?.businessProfileTheme?.theme
  );
  const businessName = snapshot?.tenant?.name || tenantSlugValue || "GetPrio";
  const heroTitle = businessName;
  const queueState = getQueueStateSummary(snapshot);
  const locationState = getLocationStatusSummary(snapshot);
  const clockLabel = formatClock(clockNow, snapshot?.location?.timezone);
  const calendarDate = formatCalendarDate(clockNow, snapshot?.location?.timezone);
  const canJoinQueue =
    isQueueAcceptingJoins(snapshot) &&
    !vendorIsInactive &&
    !locationIsClosed;
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
    const intervalId = window.setInterval(() => setClockNow(new Date()), 30_000);
    setClockNow(new Date());

    return () => window.clearInterval(intervalId);
  }, []);


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
              <h1>{businessName}</h1>
            </div>
            <div
              aria-label={`Current time ${clockLabel}. Location ${locationState.label}. Queue ${queueState.label}.`}
              className="public-board-tv-clock"
              role="group"
            >
              <div className="public-board-tv-calendar">
                <span>{calendarDate.month}</span>
                <strong>{calendarDate.day}</strong>
              </div>
              <div className="public-board-tv-clock-details">
                <time>{clockLabel}</time>
                <div className="public-board-tv-clock-statuses">
                  <span>
                    Location <strong>{locationState.label}</strong>
                  </span>
                  <i aria-hidden="true" />
                  <span>
                    Queue <strong>{queueState.label}</strong>
                  </span>
                </div>
              </div>
            </div>
          </header>

          <section className="public-board-tv-main">
            <aside className="public-board-tv-left">
              <section className="public-board-tv-current">
                <div className="public-board-tv-current-inner">
                  <Text className="public-board-tv-eyebrow">Now serving</Text>
                  {snapshot.calledTickets?.length ? snapshot.calledTickets.map((ticket) => <div key={ticket.id}>
                    <strong>{ticket.ticketNumber}</strong>
                    <span>{ticket.serviceCounterId ? snapshot.counterDispatch?.find((lane) => lane.serviceCounterId === ticket.serviceCounterId)?.counterName || "Counter" : "Reception"}</span>
                  </div>) : <strong>--</strong>}
                  <span>{snapshot.calledTickets?.length ? "Please proceed to your counter" : "Waiting for next ticket"}</span>
                </div>
              </section>

              <section className="public-board-tv-qr">
                <div className="public-board-tv-qr-code">
                  <StyledQRCode size={124} value={joinQrUrl} />
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
                </div>
                <div className="public-board-tv-count">
                  <span>Next visible</span>
                  <strong>{visibleTickets.length}</strong>
                </div>
              </div>

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
