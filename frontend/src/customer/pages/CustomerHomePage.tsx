import { customerTicketStatus } from "../utils/customerTicketStatus";
import { useCustomerTheme } from "../CustomerTheme";
import { CustomerLoading } from "../components/CustomerFallbackPresentations";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "../components/shadcn/carousel";
import { customerHomeTicketPath } from "../components/account/ticketOrigin";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  RefreshCw as IconRefresh,
  Check as IconCheck,
  Clock as IconClock,
  Ticket as IconTicket,
} from "lucide-react";
import CustomerDashboardPage, {
  type CustomerDashboardPresentationModel,
} from "../../pages/CustomerDashboardPage";
import { buildJoinedQueuePathWithTicket } from "../../queuePaths";
import { Button, Card, CardHeader, CardTitle, CardContent } from "../components/ui";
import { CustomerFavorites } from "./CustomerFavoritesPage";
import {
  CustomerPage,
  CustomerError,
  StatusBadge,
} from "../components/account/CustomerPage";
function HomeView({ model: m }: { model: CustomerDashboardPresentationModel }) {
  const { theme } = useCustomerTheme();
  const [index, setIndex] = useState(0);
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  useEffect(() => {
    if (!carouselApi) return;
    const update = () => setIndex(carouselApi.selectedScrollSnap());
    carouselApi.on("select", update);
    carouselApi.on("reInit", update);
    update();
    return () => { carouselApi.off("select", update); carouselApi.off("reInit", update); };
  }, [carouselApi]);
  const active = (m.account?.tickets || []).filter((t) =>
    ["waiting", "called"].includes(t.status),
  );
  const selected = Math.min(index, Math.max(0, active.length - 1));
  const ticket = active[selected];
  const focus =
    m.queue?.focusTicket &&
    ticket &&
    m.queue.focusTicket.lookupCode === ticket.lookupCode
      ? m.queue.focusTicket
      : null;
  const liveStatus = customerTicketStatus(focus || ticket);
  const rawStats =
    m.account && "ticketStats" in m.account ? m.account.ticketStats : null;
  const stats =
    rawStats && typeof rawStats === "object"
      ? (rawStats as Record<string, unknown>)
      : null;
  return (
    <CustomerPage
      title={`Welcome back, ${m.firstName}`}
      subtitle="Stay up to date with your queue tickets."
      actions={
        <Button
          variant="ghost"
          size="icon"
          aria-label="Refresh dashboard"
          onClick={m.refresh}
        >
          <IconRefresh />
        </Button>
      }
    >
      {m.loading ? (
        <p role="status">Loading your account…</p>
      ) : m.error ? (
        <CustomerError error={m.error} retry={m.refresh} />
      ) : (
        <>
          {ticket ? (
            <Carousel className="customer-home-carousel" aria-label="Active queue tickets" tabIndex={0} opts={{ align:"start" }} setApi={setCarouselApi} onKeyDown={(event) => {
                if (event.key === "Home" || event.key === "End") {
                  event.preventDefault();
                  carouselApi?.scrollTo(event.key === "Home" ? 0 : Math.max(0, active.length - 1));
                }
              }}>
              <CarouselContent className="customer-home-carousel-track">{active.map((ticket) => {
                const focus = m.queue?.focusTicket?.lookupCode === ticket.lookupCode ? m.queue.focusTicket : null;
                return <CarouselItem key={ticket.id} className="customer-home-carousel-slide">
              <Card className="customer-home-ticket">
                <Link
                  className="customer-ticket-card-hit"
                  aria-label={`Open ticket ${ticket.ticketNumber} at ${ticket.tenantName}`}
                  to={customerHomeTicketPath(
                    buildJoinedQueuePathWithTicket(
                      ticket.tenantSlug,
                      ticket.lookupCode,
                      ticket.locationSlug,
                    ),
                  )}
                />

                <div className="customer-ticket-top">
                  <div className="customer-inline-between">
                    <h2>Active ticket</h2>
                    <StatusBadge status={liveStatus.label} />
                  </div>
                  <h3 className="customer-home-vendor">{ticket.tenantName}</h3>
                  <strong className="customer-ticket-number">
                    #{ticket.ticketNumber}
                  </strong>
                  <p>{ticket.locationName}</p>
                  {focus ? (
                    <div className="customer-two-columns">
                      <div>
                        <strong>
                          {focus.position === null ? "—" : focus.position}
                        </strong>
                        <p>Position</p>
                      </div>
                      <div>
                        <strong>{focus.estimatedWaitMinutes} min</strong>
                        <p>Estimated wait</p>
                      </div>
                    </div>
                  ) : (
                    <p>Open your ticket for the latest queue information.</p>
                  )}
                </div>
                <div className="customer-ticket-tear" aria-hidden="true" />
                <div className="customer-ticket-bottom">
                  <h3>Queue progress</h3>
                  <div className="customer-timeline-row">
                    <span className="customer-timeline-success">
                      <IconCheck />
                    </span>
                    <div>
                      <strong>Joined queue</strong>
                      <p>
                        {new Intl.DateTimeFormat("en-PH", {
                          hour: "numeric",
                          minute: "2-digit",
                        }).format(new Date(ticket.createdAt))}
                      </p>
                    </div>
                  </div>
                  <div className="customer-timeline-row">
                    <span className="customer-timeline-current">
                      <IconClock />
                    </span>
                    <div>
                      <strong>
                        {liveStatus.label}
                      </strong>
                      <p>
                        {liveStatus.key === "waiting" && focus?.position
                          ? `There are ${Math.max(0, focus.position - 1)} people in front of you.`
                          : liveStatus.message}
                      </p>
                    </div>
                  </div>
                  <Button
                    className="customer-home-join-action"
                    variant="outline"
                    render={<Link to="/join" />}
                  >
                    Join another queue
                  </Button>
                </div>
              </Card></CarouselItem>;
              })}</CarouselContent>
              {active.length > 1 ? (
                <div
                  className="customer-carousel-dots"
                  aria-label="Choose active ticket"
                >
                  {active.map((t, i) => (
                    <Button variant="ghost"
                      key={t.id}
                      aria-label={`Ticket ${i + 1} of ${active.length}`}
                      aria-current={selected === i ? "true" : undefined}
                      onClick={() => carouselApi?.scrollTo(i)}
                    >
                      <span aria-hidden="true" />
                    </Button>
                  ))}
                </div>
              ) : null}
              <p className="customer-sr-only" aria-live="polite">
                Ticket {selected + 1} of {active.length}: {ticket.tenantName},{" "}
                {ticket.ticketNumber}
              </p>
            </Carousel>
          ) : (
            <Card className="customer-home-empty"><CardHeader><CardTitle>Active ticket</CardTitle></CardHeader><CardContent>
              <div className="customer-home-empty-art">
                <img src={theme === "dark"
                  ? "/illustrations/generated/dashboard-empty-transparent-dark.png"
                  : "/illustrations/generated/dashboard-empty-transparent.png"} alt="" />
              </div>
              <h2>No active tickets</h2>
              <p>Scan a vendor QR code when you are ready to join.</p>
              <Button render={<Link to="/join" />}>
                <IconTicket />
                Scan to join
              </Button>
            </CardContent></Card>
          )}
          <section className="customer-home-stats">
            <h2>Your stats</h2>
            <div className="customer-two-columns">
              <div>
                <strong>
                  {typeof stats?.joined === "number" ? stats.joined : "—"}
                </strong>
                <p>Tickets joined</p>
              </div>
              <div>
                <strong>
                  {typeof stats?.served === "number" ? stats.served : "—"}
                </strong>
                <p>Tickets served</p>
              </div>
            </div>
          </section>
          <CustomerFavorites compact />
        </>
      )}
    </CustomerPage>
  );
}
export default function CustomerHomePage() {
  return (
    <CustomerDashboardPage
      renderLoading={CustomerLoading}
      renderPresentation={(model) => <HomeView model={model} />}
    />
  );
}
