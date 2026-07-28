import type {
  CustomerAccountTicketSummary,
  CustomerBookingSummary,
  OrganizerCampaign
} from "@shared";

const ACTIVE_BOOKING_STATUSES = new Set(["pending", "confirmed", "rescheduled"]);
const ACTIVE_TICKET_STATUSES = new Set(["waiting", "called"]);
const ACTIVE_CAMPAIGN_STATUSES = new Set([
  "refund_pending",
  "frozen",
  "collecting",
  "draft",
  "collected"
]);

function timestamp(value: string | Date | null | undefined) {
  if (!value) return 0;
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : 0;
}

export function selectNextCustomerBooking(
  bookings: CustomerBookingSummary[],
  now = new Date()
) {
  const nowTimestamp = now.getTime();

  return [...bookings]
    .filter((booking) => (
      ACTIVE_BOOKING_STATUSES.has(booking.status)
      && timestamp(booking.scheduledEndAt || booking.scheduledStartAt) >= nowTimestamp
    ))
    .sort((left, right) => timestamp(left.scheduledStartAt) - timestamp(right.scheduledStartAt))[0] || null;
}

export function selectActiveCustomerTicket(tickets: CustomerAccountTicketSummary[]) {
  return [...tickets]
    .filter((ticket) => ACTIVE_TICKET_STATUSES.has(ticket.status))
    .sort((left, right) => timestamp(right.updatedAt) - timestamp(left.updatedAt))[0] || null;
}

export function selectActiveCustomerCampaign(campaigns: OrganizerCampaign[]) {
  const statusPriority: Record<string, number> = {
    refund_pending: 0,
    frozen: 1,
    collecting: 2,
    draft: 3,
    collected: 4
  };

  return [...campaigns]
    .filter((campaign) => ACTIVE_CAMPAIGN_STATUSES.has(campaign.status))
    .sort((left, right) => {
      const priorityDifference = (statusPriority[left.status] ?? 99) - (statusPriority[right.status] ?? 99);
      if (priorityDifference) return priorityDifference;
      return timestamp(left.deadlineAt) - timestamp(right.deadlineAt);
    })[0] || null;
}

export function getCampaignFunding(campaign: OrganizerCampaign | null) {
  if (!campaign) {
    return {
      acceptedContributors: 0,
      fundedAmountCents: 0,
      targetAmountCents: 0,
      progressPercent: 0
    };
  }

  const acceptedContributors = Math.max(0, Number(campaign.acceptedContributors || 0));
  const targetAmountCents = Math.max(
    0,
    Number(campaign.contributionFeeCents || 0) * Number(campaign.requiredContributors || 0)
  );
  const fundedAmountCents = Math.max(
    0,
    Number(campaign.acceptedAmountCents ?? acceptedContributors * Number(campaign.contributionFeeCents || 0))
  );

  return {
    acceptedContributors,
    fundedAmountCents,
    targetAmountCents,
    progressPercent: targetAmountCents
      ? Math.min(100, (fundedAmountCents / targetAmountCents) * 100)
      : 0
  };
}

export type CustomerDashboardActivity =
  | {
      kind: "booking";
      occurredAt: string | Date;
      title: string;
      body: string;
      path: string;
    }
  | {
      kind: "ticket";
      occurredAt: string | Date;
      title: string;
      body: string;
      path: string;
    };

export function selectRecentCustomerActivity(
  bookings: CustomerBookingSummary[],
  tickets: CustomerAccountTicketSummary[]
): CustomerDashboardActivity | null {
  const bookingActivities: CustomerDashboardActivity[] = bookings.map((booking) => ({
    kind: "booking",
    occurredAt: booking.updatedAt,
    title: booking.status === "confirmed" ? "Booking confirmed" : "Booking updated",
    body: `${booking.serviceName} at ${booking.tenantName} is ${booking.status}.`,
    path: `/account/bookings/${booking.id}`
  }));
  const ticketActivities: CustomerDashboardActivity[] = tickets.map((ticket) => ({
    kind: "ticket",
    occurredAt: ticket.updatedAt,
    title: ticket.status === "called" ? "It is your turn" : "Queue ticket updated",
    body: `${ticket.ticketNumber} at ${ticket.tenantName} is ${ticket.status}.`,
    path: `/join/${encodeURIComponent(ticket.tenantSlug)}/${encodeURIComponent(ticket.locationSlug)}?ticket=${encodeURIComponent(ticket.lookupCode)}`
  }));

  return [...bookingActivities, ...ticketActivities]
    .sort((left, right) => timestamp(right.occurredAt) - timestamp(left.occurredAt))[0] || null;
}
