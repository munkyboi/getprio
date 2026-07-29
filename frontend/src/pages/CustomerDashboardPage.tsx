import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Progress,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Title
} from "@mantine/core";
import {
  IconBell,
  IconBuildingStore,
  IconCalendarEvent,
  IconCalendarOff,
  IconChevronRight,
  IconMapPin,
  IconSpeakerphone,
  IconStar,
  IconStarFilled,
  IconTicket,
  IconUsersGroup
} from "@tabler/icons-react";
import { Link, Navigate } from "react-router-dom";
import type { QueueSnapshot } from "@shared";
import CustomerAccountLayout from "../components/CustomerAccountLayout";
import { API_BASE_URL, apiRequest } from "../api/client";
import { customerAccountApi } from "../api/customerAccount";
import { useAuth } from "../context/AuthContext";
import { buildJoinedQueuePathWithTicket } from "../queuePaths";
import {
  getCampaignFunding,
  selectActiveCustomerCampaign,
  selectActiveCustomerTicket,
  selectNextCustomerBooking,
  selectRecentCustomerActivity
} from "../utils/customerDashboard";
import { formatBookingScheduleDate, formatBookingScheduleTimeRange, formatDateTime } from "../utils/dates";
import { getErrorMessage } from "../utils/errors";

function formatCurrency(amountCents: number, currency = "PHP") {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(amountCents / 100);
}

function formatDashboardDate(value: Date) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "full"
  }).format(value);
}

function formatRelativeActivity(value: string | Date) {
  const differenceMinutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (differenceMinutes < 1) return "Just now";
  if (differenceMinutes < 60) return `${differenceMinutes} minute${differenceMinutes === 1 ? "" : "s"} ago`;
  const differenceHours = Math.round(differenceMinutes / 60);
  if (differenceHours < 24) return `${differenceHours} hour${differenceHours === 1 ? "" : "s"} ago`;
  return formatDateTime(value);
}

function DashboardLoading() {
  return (
    <Stack className="customer-dashboard" gap="md">
      <Skeleton height={104} radius="lg" />
      <Skeleton height={250} radius="xl" />
      <div className="customer-dashboard__support-grid">
        <Skeleton height={268} radius="xl" />
        <Skeleton height={268} radius="xl" />
      </div>
      <Skeleton height={118} radius="xl" />
    </Stack>
  );
}

export default function CustomerDashboardPage() {
  const { loading, token, user } = useAuth();
  const queryClient = useQueryClient();
  const now = useMemo(() => new Date(), []);
  const accountQuery = useQuery({
    queryKey: ["customer-account", token],
    queryFn: async () => {
      if (!token) throw new Error("Missing authentication token.");
      return customerAccountApi.getOverview(token);
    },
    enabled: Boolean(token)
  });
  const bookingsQuery = useQuery({
    queryKey: ["customer-dashboard-bookings", token],
    queryFn: async () => {
      if (!token) throw new Error("Missing authentication token.");
      return customerAccountApi.getBookings(token, 1, 100);
    },
    enabled: Boolean(token)
  });
  const campaignsQuery = useQuery({
    queryKey: ["customer-dashboard-campaigns", token],
    queryFn: async () => {
      if (!token) throw new Error("Missing authentication token.");
      return customerAccountApi.getCampaigns(token);
    },
    enabled: Boolean(token)
  });
  const refetchCampaigns = campaignsQuery.refetch;

  const account = accountQuery.data?.overview || null;
  const bookings = useMemo(() => bookingsQuery.data?.bookings || [], [bookingsQuery.data?.bookings]);
  const campaigns = useMemo(() => campaignsQuery.data?.campaigns || [], [campaignsQuery.data?.campaigns]);
  const tickets = useMemo(() => account?.tickets || [], [account?.tickets]);
  const nextBooking = useMemo(() => selectNextCustomerBooking(bookings, now), [bookings, now]);
  const activeTicket = useMemo(() => selectActiveCustomerTicket(tickets), [tickets]);
  const activeCampaign = useMemo(() => selectActiveCustomerCampaign(campaigns), [campaigns]);
  const campaignFunding = useMemo(() => getCampaignFunding(activeCampaign), [activeCampaign]);
  const recentActivity = useMemo(
    () => selectRecentCustomerActivity(bookings, tickets),
    [bookings, tickets]
  );
  const queuePath = activeTicket
    ? buildJoinedQueuePathWithTicket(activeTicket.tenantSlug, activeTicket.lookupCode, activeTicket.locationSlug)
    : "/vendors";
  const queueBasePath = activeTicket
    ? `/public/tenant/${encodeURIComponent(activeTicket.tenantSlug)}/location/${encodeURIComponent(activeTicket.locationSlug)}`
    : "";
  const queueQuery = useQuery({
    queryKey: ["customer-dashboard-queue", activeTicket?.lookupCode],
    queryFn: () => apiRequest<QueueSnapshot>(
      `${queueBasePath}/queue?lookupCode=${encodeURIComponent(activeTicket?.lookupCode || "")}`
    ),
    enabled: Boolean(activeTicket && queueBasePath),
    refetchInterval: activeTicket ? 30000 : false
  });

  useEffect(() => {
    if (!activeTicket || !queueBasePath) return undefined;
    const eventSource = new EventSource(
      `${API_BASE_URL}${queueBasePath}/stream?lookupCode=${encodeURIComponent(activeTicket.lookupCode)}`
    );
    eventSource.onmessage = (event) => {
      queryClient.setQueryData(
        ["customer-dashboard-queue", activeTicket.lookupCode],
        JSON.parse(event.data) as QueueSnapshot
      );
    };
    eventSource.onerror = () => eventSource.close();
    return () => eventSource.close();
  }, [activeTicket, queueBasePath, queryClient]);

  useEffect(() => {
    if (!activeCampaign?.publicToken) return undefined;
    const eventSource = new EventSource(
      `${API_BASE_URL}/public/campaigns/${encodeURIComponent(activeCampaign.publicToken)}/stream`
    );
    eventSource.addEventListener("campaign-change", () => {
      void refetchCampaigns();
    });
    eventSource.onerror = () => eventSource.close();
    return () => eventSource.close();
  }, [activeCampaign?.publicToken, refetchCampaigns]);

  if (loading) {
    return (
      <CustomerAccountLayout activeSection="dashboard">
        <DashboardLoading />
      </CustomerAccountLayout>
    );
  }

  if (!user || !token) {
    return <Navigate replace to="/login" />;
  }

  const dashboardLoading = accountQuery.isLoading || bookingsQuery.isLoading || campaignsQuery.isLoading;
  const dashboardError = accountQuery.error || bookingsQuery.error || campaignsQuery.error;
  const firstName = (account?.user.displayName || account?.user.name || user.name || "Customer")
    .trim()
    .split(/\s+/)[0];
  const focusTicket = queueQuery.data?.focusTicket || null;
  const campaignStatusLabel = activeCampaign?.status.replaceAll("_", " ") || "";

  return (
    <CustomerAccountLayout activeSection="dashboard">
      {dashboardLoading ? <DashboardLoading /> : null}

      {!dashboardLoading && dashboardError ? (
        <Alert
          color="red"
          title="Dashboard could not be loaded"
          variant="light"
        >
          <Stack align="flex-start" gap="sm">
            <Text>{getErrorMessage(dashboardError)}</Text>
            <Button
              color="red"
              onClick={() => {
                void accountQuery.refetch();
                void bookingsQuery.refetch();
                void campaignsQuery.refetch();
              }}
              variant="light"
            >
              Try again
            </Button>
          </Stack>
        </Alert>
      ) : null}

      {!dashboardLoading && !dashboardError ? (
        <Stack className="customer-dashboard" gap="md">
          <header className="customer-dashboard__header">
            <div>
              <Text className="finazze-section-label">Next up control center</Text>
              <Title order={1}>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {firstName}</Title>
              <Text c="dimmed">
                Here&apos;s what needs your attention today, {formatDashboardDate(now)}.
              </Text>
            </div>
            <Stack align="flex-end" className="customer-dashboard__rating-block" gap={6}>
              <Text className="finazze-section-label">Your rating</Text>
              {account?.trustRating.count ? (
                <Group aria-label={`Trust rating ${account.trustRating.average.toFixed(1)} from ${account.trustRating.count} ratings`} className="customer-dashboard__rating" gap={7} wrap="nowrap">
                  <IconStarFilled aria-hidden className="customer-dashboard__rating-star customer-dashboard__rating-star--filled" size={24} />
                  <Text fw={900}>{account.trustRating.average.toFixed(1)}</Text>
                  <Text c="dimmed" size="sm">({account.trustRating.count})</Text>
                </Group>
              ) : (
                <Group aria-label="No rating yet" className="customer-dashboard__rating" gap={7} wrap="nowrap">
                  <IconStar aria-hidden className="customer-dashboard__rating-star" size={24} />
                  <Text fw={700}>No rating yet</Text>
                </Group>
              )}
            </Stack>
          </header>

          <Card className="customer-dashboard__next" p="lg">
            {nextBooking ? (
              <div className="customer-dashboard__next-grid">
                <ThemeIcon className="customer-dashboard__icon customer-dashboard__icon--orange" radius="lg" size={72} variant="light">
                  <IconCalendarEvent size={38} stroke={1.7} />
                </ThemeIcon>
                <Stack gap={8}>
                  <Text className="finazze-section-label">Next booking</Text>
                  <Title order={2}>{nextBooking.serviceName}</Title>
                  <Group gap={8} wrap="nowrap">
                    <IconCalendarEvent aria-hidden size={19} />
                    <Text>{formatBookingScheduleDate(nextBooking.scheduledStartAt)} · {formatBookingScheduleTimeRange(nextBooking.scheduledStartAt, nextBooking.scheduledEndAt)}</Text>
                  </Group>
                  <Group c="dimmed" gap={8} wrap="nowrap">
                    <IconBuildingStore aria-hidden size={19} />
                    <Text>{nextBooking.tenantName}</Text>
                  </Group>
                  <Group c="dimmed" gap={8} wrap="nowrap">
                    <IconMapPin aria-hidden size={19} />
                    <Text>{nextBooking.locationName}</Text>
                  </Group>
                </Stack>
                <div className="customer-dashboard__next-actions">
                  <Badge color={nextBooking.status === "confirmed" ? "teal" : "yellow"} variant="light">
                    {nextBooking.status}
                  </Badge>
                  <Button component={Link} fullWidth rightSection={<IconChevronRight size={18} />} to={`/account/bookings/${nextBooking.id}`}>
                    View booking
                  </Button>
                </div>
              </div>
            ) : (
              <div className="customer-dashboard__empty-feature">
                <ThemeIcon className="customer-dashboard__icon customer-dashboard__icon--orange" radius="lg" size={72} variant="light">
                  <IconCalendarOff size={38} stroke={1.7} />
                </ThemeIcon>
                <div>
                  <Text className="finazze-section-label">Next booking</Text>
                  <Title order={2}>Nothing scheduled yet</Title>
                  <Text c="dimmed">Discover a vendor and book your next service.</Text>
                </div>
                <Button component={Link} rightSection={<IconChevronRight size={18} />} to="/vendors">
                  Browse vendors
                </Button>
              </div>
            )}
          </Card>

          <div className="customer-dashboard__support-grid">
            <Card className="customer-dashboard__support-card" p="lg">
              <Stack h="100%" justify="space-between" gap="lg">
                <div>
                  <Text className="finazze-section-label">Live queue status</Text>
                  {activeTicket ? (
                    <>
                      <div className="customer-dashboard__queue-summary">
                        <ThemeIcon className="customer-dashboard__icon customer-dashboard__icon--teal" radius="lg" size={64} variant="light">
                          <IconUsersGroup size={32} stroke={1.7} />
                        </ThemeIcon>
                        <div>
                          <Text c="dimmed" size="sm">{activeTicket.status === "called" ? "Queue status" : "Your position"}</Text>
                          <Title order={2}>{activeTicket.status === "called" ? "Called" : focusTicket?.position ? `#${focusTicket.position}` : "—"}</Title>
                        </div>
                        <div className="customer-dashboard__metric-divider">
                          <Text c="dimmed" size="sm">Estimated wait</Text>
                          <Group align="baseline" gap={5}>
                            <Title order={2}>{focusTicket?.estimatedWaitMinutes ?? "—"}</Title>
                            <Text size="sm">min</Text>
                          </Group>
                        </div>
                      </div>
                      <Text mt="md">{activeTicket.ticketNumber}</Text>
                      <Text c="dimmed" size="sm">{activeTicket.tenantName} · {activeTicket.locationName}</Text>
                    </>
                  ) : (
                    <Group align="flex-start" gap="md" mt="lg" wrap="nowrap">
                      <ThemeIcon className="customer-dashboard__icon customer-dashboard__icon--teal" radius="lg" size={64} variant="light">
                        <IconTicket size={32} stroke={1.7} />
                      </ThemeIcon>
                      <div>
                        <Title order={3}>No live queue ticket</Title>
                        <Text c="dimmed" size="sm">Join a vendor queue when you need same-day service.</Text>
                      </div>
                    </Group>
                  )}
                </div>
                <Button component={Link} justify="space-between" to={queuePath} variant="light">
                  {activeTicket
                    ? queueQuery.isError
                      ? "Open ticket for the latest status"
                      : "Queue updates refresh automatically"
                    : "Browse vendor queues"}
                  <IconChevronRight size={17} />
                </Button>
              </Stack>
            </Card>

            <Card className="customer-dashboard__support-card" p="lg">
              <Stack h="100%" justify="space-between" gap="lg">
                <div>
                  <Text className="finazze-section-label">Active campaign</Text>
                  {activeCampaign ? (
                    <Group className="customer-dashboard__campaign-heading" align="flex-start" justify="space-between" mt="md" wrap="wrap">
                      <Group align="flex-start" gap="md" wrap="nowrap">
                        <ThemeIcon className="customer-dashboard__icon customer-dashboard__icon--amber" radius="lg" size={64} variant="light">
                          <IconSpeakerphone size={32} stroke={1.7} />
                        </ThemeIcon>
                        <div>
                          <Title order={3}>{activeCampaign.title}</Title>
                          <Text c="dimmed" size="sm">Ends {formatDateTime(activeCampaign.deadlineAt)}</Text>
                        </div>
                      </Group>
                      <Badge color={activeCampaign.status === "refund_pending" || activeCampaign.status === "frozen" ? "red" : "teal"} variant="light">
                        {campaignStatusLabel}
                      </Badge>
                    </Group>
                  ) : (
                    <Group align="flex-start" gap="md" mt="lg" wrap="nowrap">
                      <ThemeIcon className="customer-dashboard__icon customer-dashboard__icon--amber" radius="lg" size={64} variant="light">
                        <IconSpeakerphone size={32} stroke={1.7} />
                      </ThemeIcon>
                      <div>
                        <Title order={3}>No active campaign</Title>
                        <Text c="dimmed" size="sm">Create one from an eligible booking or discover a public campaign.</Text>
                      </div>
                    </Group>
                  )}
                </div>
                {activeCampaign ? (
                  <div>
                    <Title order={3}>{formatCurrency(campaignFunding.fundedAmountCents, activeCampaign.currency)} of {formatCurrency(campaignFunding.targetAmountCents, activeCampaign.currency)} funded</Title>
                    <Progress aria-label="Campaign funding progress" color="orange" mt="xs" value={campaignFunding.progressPercent} />
                    <Group justify="space-between" mt="md">
                      <Text size="sm"><strong>{campaignFunding.acceptedContributors} of {activeCampaign.requiredContributors}</strong> contributors</Text>
                      <Button color="orange" component={Link} rightSection={<IconChevronRight size={17} />} size="compact-sm" to={`/account/campaigns/${activeCampaign.id}/manage`} variant="subtle">
                        View campaign
                      </Button>
                    </Group>
                  </div>
                ) : (
                  <Button component={Link} justify="space-between" to="/account/campaigns/discover" variant="light">
                    Discover campaigns
                    <IconChevronRight size={17} />
                  </Button>
                )}
              </Stack>
            </Card>
          </div>

          <Card className="customer-dashboard__notification" p="lg">
            <Group justify="space-between" wrap="nowrap">
              <Group gap="md" wrap="nowrap">
                <ThemeIcon className="customer-dashboard__icon customer-dashboard__icon--amber" radius="md" size={48} variant="light">
                  <IconBell size={24} stroke={1.7} />
                </ThemeIcon>
                <div>
                  <Text className="finazze-section-label">Recent activity</Text>
                  {recentActivity ? (
                    <>
                      <Text fw={700}>{recentActivity.title}</Text>
                      <Text>{recentActivity.body}</Text>
                      <Text c="dimmed" size="sm">{formatRelativeActivity(recentActivity.occurredAt)}</Text>
                    </>
                  ) : (
                    <Text c="dimmed">You&apos;re all caught up. New booking, queue, and campaign activity will appear here.</Text>
                  )}
                </div>
              </Group>
              <Button color="orange" component={Link} rightSection={<IconChevronRight size={17} />} to={recentActivity?.path || "/account/notifications"} variant="subtle">
                {recentActivity ? "View" : "Notification settings"}
              </Button>
            </Group>
          </Card>
        </Stack>
      ) : null}
    </CustomerAccountLayout>
  );
}
