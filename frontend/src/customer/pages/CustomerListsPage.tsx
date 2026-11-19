import { customerTicketStatus } from "../utils/customerTicketStatus";
import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Ticket as IconTicket,
  CalendarDays as IconCalendar,
  ChevronRight as IconChevronRight,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { customerAccountApi } from "../../api/customerAccount";
import { buildJoinedQueuePathWithTicket } from "../../queuePaths";
import {
  formatDateTime,
  formatBookingScheduleDate,
  formatBookingScheduleTimeRange,
} from "../../utils/dates";
import { getErrorMessage } from "../../utils/errors";
import {
  CustomerPage,
  CustomerError,
  StatusBadge,
} from "../components/account/CustomerPage";
export default function CustomerListsPage() {
  const { user, token, loading } = useAuth();
  const overview = useQuery({
    queryKey: ["customer-account", token],
    queryFn: () => customerAccountApi.getOverview(token!),
    enabled: !!token,
  });
  const bookings = useQuery({
    queryKey: ["customer-lists-bookings", token],
    queryFn: () => customerAccountApi.getBookings(token!, 1, 100),
    enabled: !!token,
  });
  if (loading) return <p role="status">Loading…</p>;
  if (!user || !token) return <Navigate to="/login" replace />;
  const tickets = (overview.data?.overview.tickets || []).filter((t) =>
    ["waiting", "called"].includes(t.status),
  );
  const next = (bookings.data?.bookings || []).filter((b) =>
    ["pending", "confirmed", "rescheduled"].includes(b.status),
  );
  return (
    <CustomerPage
      title="Tickets and bookings"
      subtitle="Keep track of your queue tickets and scheduled visits."
    >
      <div className="customer-overview-grid">
        {[
          {
            title: "Queue tickets",
            text: "Your queue visits",
            path: "/account/tickets",
            icon: IconTicket,
          },
          {
            title: "Bookings",
            text: "Your scheduled visits",
            path: "/account/bookings",
            icon: IconCalendar,
          },
        ].map((c) => (
          <Link
            className="customer-record-card customer-overview-card"
            key={c.path}
            to={c.path}
          >
            <div className="customer-inline-between">
              <h2>{c.title}</h2>
              <IconChevronRight />
            </div>
            <p>{c.text}</p>
            <c.icon className="customer-overview-icon" />
          </Link>
        ))}
      </div>
      {overview.isLoading || bookings.isLoading ? (
        <p role="status">Loading visits…</p>
      ) : null}
      {overview.error || bookings.error ? (
        <CustomerError
          error={getErrorMessage(overview.error || bookings.error)}
          retry={() => {
            void overview.refetch();
            void bookings.refetch();
          }}
        />
      ) : null}
      <section className="customer-record-list">
        <h2>Active queue tickets</h2>
        {tickets.map((t) => (
          <Link
            className="customer-visit-row"
            to={buildJoinedQueuePathWithTicket(
              t.tenantSlug,
              t.lookupCode,
              t.locationSlug,
            )}
            key={t.id}
          >
            <IconTicket />
            <div>
              <strong>{t.tenantName}</strong>
              <p>Ticket {t.ticketNumber}</p>
              <p>{t.locationName}</p>
              <small>Joined {formatDateTime(t.createdAt)}</small>
            </div>
            <StatusBadge status={customerTicketStatus(t).label} />
            <IconChevronRight />
          </Link>
        ))}
        {!overview.isLoading && !overview.error && !tickets.length ? (
          <p>No active queue tickets.</p>
        ) : null}
      </section>
      <section className="customer-record-list">
        <h2>Upcoming bookings</h2>
        {next.map((b) => (
          <Link
            className="customer-visit-row"
            to={`/account/bookings/${b.id}`}
            key={b.id}
          >
            <IconCalendar />
            <div>
              <strong>{b.tenantName}</strong>
              <p>{b.reference}</p>
              <p>{b.locationName}</p>
              <p>{b.serviceName}</p>
              <small>
                {formatBookingScheduleDate(b.scheduledStartAt)} ·{" "}
                {formatBookingScheduleTimeRange(
                  b.scheduledStartAt,
                  b.scheduledEndAt,
                )}
              </small>
            </div>
            <div>
              <StatusBadge status={b.status} />
              <StatusBadge status={b.paymentStatus} />
            </div>
            <IconChevronRight />
          </Link>
        ))}
        {!bookings.isLoading && !bookings.error && !next.length ? (
          <p>No upcoming bookings.</p>
        ) : null}
      </section>
    </CustomerPage>
  );
}
