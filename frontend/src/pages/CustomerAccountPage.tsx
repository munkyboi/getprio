import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  ActionIcon,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Checkbox,
  Pagination,
  Select,
  PasswordInput,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import {
  IconCalendarEvent,
  IconExternalLink,
  IconEye,
  IconId,
  IconInfoCircle,
  IconListDetails,
  IconLock,
  IconRepeat,
  IconSettings,
  IconUsers
} from "@tabler/icons-react";
import { Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import type {
  BookingStatus,
  CustomerAccountOverviewResponse,
  GroupFundedCampaignSummary,
  GroupFundedContributionStatus,
  CustomerNotificationSettings,
  CustomerProfileUpdateRequest,
  PasswordChangeRequest,
  UpdateCustomerNotificationSettingsRequest,
  UpdateCustomerNotificationSettingsResponse,
  TicketStatus
} from "@shared";
import { apiRequest } from "../api/client";
import { customerAccountApi } from "../api/customerAccount";
import { useAuth } from "../context/AuthContext";
import { buildJoinPath, buildJoinedQueuePathWithTicket } from "../queuePaths";
import {
  formatBookingScheduleDate,
  formatBookingScheduleTimeRange,
  formatDateTime
} from "../utils/dates";
import { getErrorMessage } from "../utils/errors";
import { isBrowserPushSupported, subscribeToBrowserPush } from "../utils/pushNotifications";

type AccountSection = "profile" | "tickets" | "bookings" | "group-funded" | "settings" | "notifications" | "security";
const CUSTOMER_TABLE_PAGE_SIZE = 10;

const ACCOUNT_SECTIONS: Array<{
  key: AccountSection;
  label: string;
  path: string;
  icon: typeof IconId;
}> = [
  { key: "profile", label: "Profile details", path: "/account/profile", icon: IconId },
  { key: "tickets", label: "Queue Tickets", path: "/account/tickets", icon: IconListDetails },
  { key: "bookings", label: "Bookings", path: "/account/bookings", icon: IconCalendarEvent },
  { key: "group-funded", label: "Group-funded", path: "/account/group-funded", icon: IconUsers },
  { key: "settings", label: "Settings", path: "/account/settings", icon: IconSettings },
  { key: "notifications", label: "Notifications", path: "/account/notifications", icon: IconSettings },
  { key: "security", label: "Security", path: "/account/security", icon: IconLock }
];

function getTicketBadgeColor(status: TicketStatus): "gray" | "red" | "yellow" | "orange" | "teal" | "blue" {
  switch (status) {
    case "waiting":
      return "teal";
    case "called":
      return "blue";
    case "served":
      return "gray";
    case "skipped":
      return "yellow";
    case "cancelled":
      return "red";
    case "unserved":
      return "orange";
    default:
      return "gray";
  }
}

function getBookingBadgeColor(status: BookingStatus): "gray" | "red" | "yellow" | "orange" | "teal" | "blue" {
  switch (status) {
    case "pending":
      return "yellow";
    case "confirmed":
      return "teal";
    case "rescheduled":
      return "blue";
    case "completed":
    case "reviewed":
      return "gray";
    case "canceled":
      return "red";
    case "disputed":
      return "orange";
    default:
      return "gray";
  }
}

function getActiveSection(pathname: string): AccountSection {
  const [, , section] = pathname.split("/");
  if (section === "tickets" || section === "bookings" || section === "group-funded" || section === "settings" || section === "notifications" || section === "security") {
    return section;
  }

  return "profile";
}

function getGroupFundedBadgeColor(status: GroupFundedCampaignSummary["campaignStatus"]): "gray" | "red" | "yellow" | "orange" | "teal" | "blue" {
  switch (status) {
    case "funding":
      return "yellow";
    case "funded":
    case "vendor_review":
    case "replacement_proposed":
      return "blue";
    case "confirmed":
      return "teal";
    case "organizer_canceled":
    case "funding_failed":
    case "vendor_rejected":
    case "vendor_review_expired":
    case "vendor_canceled":
      return "red";
    default:
      return "gray";
  }
}

function getGroupFundedContributionBadgeColor(status: GroupFundedContributionStatus): "gray" | "red" | "yellow" | "orange" | "teal" | "blue" {
  switch (status) {
    case "verified":
      return "teal";
    case "submitted":
    case "pending_proof":
      return "yellow";
    case "rejected":
      return "red";
    case "refund_pending":
      return "orange";
    case "refunded":
      return "blue";
    case "policy_review_required":
      return "orange";
    default:
      return "gray";
  }
}

function getGroupFundedContributionLabel(status: GroupFundedContributionStatus) {
  switch (status) {
    case "verified":
      return "Your proof verified";
    case "submitted":
      return "Your proof submitted";
    case "pending_proof":
      return "Payment proof needed";
    case "rejected":
      return "Your proof rejected";
    case "refund_pending":
      return "Refund pending";
    case "refunded":
      return "Refunded";
    case "policy_review_required":
      return "Policy review";
    default:
      return "Contribution update";
  }
}

function toLocalDateKey(value: string | Date | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function CustomerAccountPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { changePassword, token, user, loading } = useAuth();
  const activeSection = getActiveSection(location.pathname);
  const isCustomer = user?.roles?.includes("customer") ?? false;
  const [error, setError] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileForm, setProfileForm] = useState<CustomerProfileUpdateRequest>({
    name: "",
    displayName: ""
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordForm, setPasswordForm] = useState<PasswordChangeRequest>({
    currentPassword: "",
    newPassword: ""
  });
  const [changingPassword, setChangingPassword] = useState(false);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission>(
    typeof window !== "undefined" && typeof window.Notification !== "undefined"
      ? window.Notification.permission
      : "default"
  );
  const [requestingBrowserPermission, setRequestingBrowserPermission] = useState(false);
  const [browserPushSubscribed, setBrowserPushSubscribed] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState<CustomerNotificationSettings>({
    bookingAlerts: true,
    queueAlerts: true
  });
  const [savingNotificationSettings, setSavingNotificationSettings] = useState(false);
  const [ticketPage, setTicketPage] = useState(1);
  const [bookingPage, setBookingPage] = useState(1);
  const [bookingSearch, setBookingSearch] = useState("");
  const [bookingStatusFilter, setBookingStatusFilter] = useState<"all" | BookingStatus>("all");
  const [bookingDateRange, setBookingDateRange] = useState<[string | null, string | null]>([null, null]);
  const [groupFundedSearch, setGroupFundedSearch] = useState("");
  const [groupFundedStatusFilter, setGroupFundedStatusFilter] = useState<"all" | GroupFundedCampaignSummary["campaignStatus"]>("all");
  const [groupFundedDateRange, setGroupFundedDateRange] = useState<[string | null, string | null]>([null, null]);
  const browserNotificationsSupported = isBrowserPushSupported();
  const browserNotificationsSecure = typeof window !== "undefined" ? window.isSecureContext : false;
  const accountQuery = useQuery({
    queryKey: ["customer-account", token],
    queryFn: async () => {
      if (!token) {
        throw new Error("Missing authentication token.");
      }

      return customerAccountApi.getOverview(token);
    },
    enabled: Boolean(token)
  });
  const account = accountQuery.data?.overview ?? null;
  const ticketQuery = useQuery({
    queryKey: ["customer-account-tickets", token, ticketPage, CUSTOMER_TABLE_PAGE_SIZE],
    queryFn: async () => {
      if (!token) {
        throw new Error("Missing authentication token.");
      }

      return customerAccountApi.getTickets(token, ticketPage, CUSTOMER_TABLE_PAGE_SIZE);
    },
    enabled: Boolean(token && activeSection === "tickets")
  });
  const bookingQuery = useQuery({
    queryKey: [
      "customer-account-bookings",
      token,
      bookingPage,
      CUSTOMER_TABLE_PAGE_SIZE,
      bookingSearch,
      bookingStatusFilter,
      bookingDateRange[0] || "",
      bookingDateRange[1] || ""
    ],
    queryFn: async () => {
      if (!token) {
        throw new Error("Missing authentication token.");
      }

      return customerAccountApi.getBookings(token, bookingPage, CUSTOMER_TABLE_PAGE_SIZE, {
        search: bookingSearch,
        status: bookingStatusFilter,
        scheduledDateFrom: bookingDateRange[0] || "",
        scheduledDateTo: bookingDateRange[1] || ""
      });
    },
    enabled: Boolean(token && activeSection === "bookings")
  });
  const groupFundedQuery = useQuery({
    queryKey: ["customer-account-group-funded", token],
    queryFn: async () => {
      if (!token) {
        throw new Error("Missing authentication token.");
      }

      return customerAccountApi.getGroupFundedCampaigns(token);
    },
    enabled: Boolean(token && activeSection === "group-funded")
  });
  const tickets = ticketQuery.data?.tickets || [];
  const ticketPagination = ticketQuery.data?.pagination || null;
  const bookings = bookingQuery.data?.bookings || [];
  const bookingPagination = bookingQuery.data?.pagination || null;
  const groupFundedCampaigns = groupFundedQuery.data?.campaigns || [];
  const filteredGroupFundedCampaigns = useMemo(() => {
    const search = groupFundedSearch.trim().toLowerCase();
    const from = groupFundedDateRange[0] ? toLocalDateKey(groupFundedDateRange[0]) : "";
    const to = groupFundedDateRange[1] ? toLocalDateKey(groupFundedDateRange[1]) : "";

    return groupFundedCampaigns.filter((campaign) => {
      if (groupFundedStatusFilter !== "all" && campaign.campaignStatus !== groupFundedStatusFilter) {
        return false;
      }

      if (from || to) {
        const scheduledDate = toLocalDateKey(campaign.scheduledStartAt);
        if (from && scheduledDate < from) {
          return false;
        }
        if (to && scheduledDate > to) {
          return false;
        }
      }

      if (!search) {
        return true;
      }

      return [
        campaign.campaignTitle,
        campaign.description,
        campaign.serviceName,
        campaign.locationName,
        campaign.vendorName,
        campaign.organizerDisplayName,
        campaign.campaignStatus
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    });
  }, [groupFundedCampaigns, groupFundedDateRange, groupFundedSearch, groupFundedStatusFilter]);
  const currentAccountPath = `${location.pathname}${location.search}${location.hash}`;

  function openGroupFundedCampaign(campaign: GroupFundedCampaignSummary) {
    navigate(`/group-funded/${campaign.publicToken}`, { state: { from: currentAccountPath } });
  }

  function openTicket(ticket: (typeof tickets)[number]) {
    navigate(buildJoinedQueuePathWithTicket(
      ticket.tenantSlug,
      ticket.lookupCode,
      ticket.locationSlug
    ));
  }

  function openBooking(booking: (typeof bookings)[number]) {
    navigate(`/account/bookings/${booking.id}`);
  }
  const accountUser = account?.user;

  useEffect(() => {
    if (!accountQuery.data) {
      return;
    }

    setError("");
    setNotificationSettings(accountQuery.data.notificationSettings);
    setProfileForm({
      name: accountQuery.data.overview.user.name || "",
      displayName: accountQuery.data.overview.user.displayName || ""
    });
  }, [accountQuery.data]);

  useEffect(() => {
    if (accountQuery.error) {
      setError(getErrorMessage(accountQuery.error));
      return;
    }

    if (ticketQuery.error && activeSection === "tickets") {
      setError(getErrorMessage(ticketQuery.error));
      return;
    }

    if (bookingQuery.error && activeSection === "bookings") {
      setError(getErrorMessage(bookingQuery.error));
      return;
    }

    if (groupFundedQuery.error && activeSection === "group-funded") {
      setError(getErrorMessage(groupFundedQuery.error));
    }
  }, [accountQuery.error, activeSection, bookingQuery.error, groupFundedQuery.error, ticketQuery.error]);

  useEffect(() => {
    if (activeSection !== "bookings") {
      return;
    }

    setBookingPage(1);
  }, [bookingSearch, bookingStatusFilter, bookingDateRange, activeSection]);

  useEffect(() => {
    if (!browserNotificationsSupported) {
      return;
    }

    setBrowserPermission(window.Notification.permission);
  }, [browserNotificationsSupported]);

  async function handleRequestBrowserPermission() {
    if (!token) {
      setError("Sign in before enabling browser notifications.");
      return;
    }

    if (!browserNotificationsSupported || !window.Notification) {
      setError("This browser does not support browser notifications.");
      return;
    }

    if (!browserNotificationsSecure) {
      setError("Browser notifications require a secure context such as https:// or localhost.");
      return;
    }

    setRequestingBrowserPermission(true);
    try {
      const { permission } = await subscribeToBrowserPush({ token });
      setBrowserPermission(permission);
      setBrowserPushSubscribed(true);
    } catch (permissionError) {
      setBrowserPermission(window.Notification.permission);
      setError(getErrorMessage(permissionError));
    } finally {
      setRequestingBrowserPermission(false);
    }
  }

  async function handleNotificationToggle(
    key: keyof CustomerNotificationSettings,
    checked: boolean
  ) {
    if (!token) {
      return;
    }

    const nextSettings = {
      ...notificationSettings,
      [key]: checked
    };

    setNotificationSettings(nextSettings);
    setSavingNotificationSettings(true);

    try {
      const response = await apiRequest<
        UpdateCustomerNotificationSettingsResponse,
        UpdateCustomerNotificationSettingsRequest
      >("/account/notification-settings", {
        method: "PATCH",
        token,
        body: nextSettings
      });
      setNotificationSettings(response.notificationSettings);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
      setNotificationSettings((current) => ({
        ...current,
        [key]: !checked
      }));
    } finally {
      setSavingNotificationSettings(false);
    }
  }

  if (loading) {
    return <Card className="finazze-auth-card">Loading account...</Card>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  async function handleProfileSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      return;
    }

    setProfileError("");
    setProfileMessage("");
    setSavingProfile(true);

    try {
      const response = await customerAccountApi.updateProfile(token, profileForm);
      queryClient.setQueryData<
        {
          overview: CustomerAccountOverviewResponse;
          notificationSettings: CustomerNotificationSettings;
        }
      >(["customer-account", token], (current) =>
        current
          ? {
              ...current,
              overview: {
                ...current.overview,
                user: response.user
              }
            }
          : current
      );
      setProfileForm({
        name: response.user.name || "",
        displayName: response.user.displayName || ""
      });
      setProfileMessage(response.message);
    } catch (saveError) {
      setProfileError(getErrorMessage(saveError));
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");
    setChangingPassword(true);

    try {
      await changePassword(passwordForm);
      setPasswordForm({
        currentPassword: "",
        newPassword: ""
      });
      navigate("/login?passwordChanged=1", { replace: true });
    } catch (changeError) {
      setPasswordError(getErrorMessage(changeError));
    } finally {
      setChangingPassword(false);
    }
  }

  const renderProfile = () => (
    <Card className="finazze-auth-card customer-account-card" p="xl">
      <Stack gap="lg">
        <div>
          <Text className="finazze-section-label">Profile details</Text>
          <Title order={2}>Your customer identity</Title>
          <Text c="dimmed" mt="xs">
            These details identify your signed-in customer account across queue joins and booking requests.
          </Text>
        </div>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <Stack gap={2}>
            <Text fw={700}>Display name</Text>
            <Text c="dimmed">{accountUser?.displayName || "Not set"}</Text>
          </Stack>
          <Stack gap={2}>
            <Text fw={700}>Name</Text>
            <Text c="dimmed">{accountUser?.name || user.name}</Text>
          </Stack>
          <Stack gap={2}>
            <Text fw={700}>Username</Text>
            <Text c="dimmed">{accountUser?.username ? `@${accountUser.username}` : "Not set"}</Text>
          </Stack>
          <Stack gap={2}>
            <Text fw={700}>Email</Text>
            <Text c="dimmed">{accountUser?.email || user.email || "No email on file"}</Text>
          </Stack>
          <Stack gap={2}>
            <Text fw={700}>Phone</Text>
            <Text c="dimmed">{accountUser?.phone || user.phone || "No phone on file"}</Text>
          </Stack>
        </SimpleGrid>
        {isCustomer ? (
          <Alert color="teal" variant="light">
            Your customer profile is reused on join and booking pages so you do not need to retype contact details.
          </Alert>
        ) : null}
      </Stack>
    </Card>
  );

  const renderTickets = () => (
    <Card className="finazze-auth-card customer-account-card" p="xl">
      <Stack gap="md">
        <div>
          <Text className="finazze-section-label">Queue Tickets</Text>
          <Title order={2}>Recent queue activity</Title>
        </div>
        {error ? <Alert color="red">{error}</Alert> : null}
        {ticketQuery.isFetching ? <Text c="dimmed" size="sm">Loading queue tickets...</Text> : null}
        <Table.ScrollContainer minWidth={760}>
          <Table className="neura-customer-table" verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Ticket</Table.Th>
                <Table.Th>Vendor</Table.Th>
                <Table.Th>Location</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Joined</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {tickets.length ? (
                tickets.map((ticket) => (
                  <Table.Tr
                    className="neura-customer-table-row"
                    key={ticket.id}
                    onClick={() => openTicket(ticket)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openTicket(ticket);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <Table.Td>
                      <Stack gap={2}>
                        <Text fw={700}>{ticket.ticketNumber}</Text>
                        <Text c="dimmed" size="sm">Joined queue</Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Button
                        component={Link}
                        onClick={(event) => event.stopPropagation()}
                        size="compact-sm"
                        to={`/vendors/${ticket.tenantSlug}`}
                        variant="subtle"
                      >
                        {ticket.tenantName}
                      </Button>
                    </Table.Td>
                    <Table.Td>{ticket.locationName}</Table.Td>
                    <Table.Td>
                      <Badge color={getTicketBadgeColor(ticket.status)} variant="light">
                        {ticket.status}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{formatDateTime(ticket.createdAt)}</Table.Td>
                    <Table.Td style={{ width: 1, whiteSpace: "nowrap" }}>
                      <Group gap="xs" wrap="nowrap">
                        <Tooltip label="Open ticket" withArrow>
                          <ActionIcon
                            aria-label={`Open ticket ${ticket.ticketNumber}`}
                            component={Link}
                            onClick={(event) => event.stopPropagation()}
                            to={buildJoinedQueuePathWithTicket(
                              ticket.tenantSlug,
                              ticket.lookupCode,
                              ticket.locationSlug
                            )}
                            variant="light"
                          >
                            <IconExternalLink size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Join again" withArrow>
                          <ActionIcon
                            aria-label={`Join ${ticket.tenantName} again`}
                            component={Link}
                            onClick={(event) => event.stopPropagation()}
                            to={buildJoinPath(ticket.tenantSlug, ticket.locationSlug)}
                            variant="subtle"
                          >
                            <IconRepeat size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))
              ) : (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Text c="dimmed">Tickets created while signed in will appear here.</Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {ticketPagination && ticketPagination.totalItems > 0 ? (
          <Group justify="space-between" align="center">
            <Text c="dimmed" size="sm">
              Showing {(ticketPagination.page - 1) * ticketPagination.pageSize + 1}-
              {Math.min(ticketPagination.page * ticketPagination.pageSize, ticketPagination.totalItems)} of{" "}
              {ticketPagination.totalItems}
            </Text>
            {ticketPagination.totalPages > 1 ? (
              <Pagination
                onChange={setTicketPage}
                total={ticketPagination.totalPages}
                value={ticketPage}
              />
            ) : null}
          </Group>
        ) : null}
      </Stack>
    </Card>
  );

  const renderBookings = () => (
    <Card className="finazze-auth-card customer-account-card" p="xl">
      <Stack gap="md">
        <div>
          <Text className="finazze-section-label">Bookings</Text>
          <Title order={2}>Service booking history</Title>
        </div>
        {error ? <Alert color="red">{error}</Alert> : null}
        {bookingQuery.isFetching ? <Text c="dimmed" size="sm">Loading service bookings...</Text> : null}
        <Group align="flex-end" gap="sm">
          <TextInput
            label="Search"
            placeholder="Reference, vendor, service"
            value={bookingSearch}
            onChange={(event) => setBookingSearch(event.target.value)}
          />
          <Select
            data={[
              { label: "All statuses", value: "all" },
              { label: "Pending", value: "pending" },
              { label: "Confirmed", value: "confirmed" },
              { label: "Rescheduled", value: "rescheduled" },
              { label: "Canceled", value: "canceled" },
              { label: "Completed", value: "completed" }
            ]}
            label="Status"
            value={bookingStatusFilter}
            onChange={(value) => setBookingStatusFilter((value || "all") as "all" | BookingStatus)}
          />
          <DatePickerInput
            clearable
            label="Booking date"
            placeholder="Select date range"
            type="range"
            value={bookingDateRange}
            onChange={(value) => setBookingDateRange(value)}
          />
          {bookingDateRange[0] || bookingDateRange[1] || bookingSearch || bookingStatusFilter !== "all" ? (
            <Button
              className="neura-secondary-button"
              onClick={() => {
                setBookingSearch("");
                setBookingStatusFilter("all");
                setBookingDateRange([null, null]);
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </Group>
        <Table.ScrollContainer minWidth={920}>
          <Table className="neura-customer-table" verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Reference</Table.Th>
                <Table.Th>Vendor</Table.Th>
                <Table.Th>Service</Table.Th>
                <Table.Th>Schedule</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Payment</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {bookings.length ? (
                bookings.map((booking) => (
                  <Table.Tr
                    className="neura-customer-table-row"
                    key={booking.id}
                    onClick={() => openBooking(booking)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openBooking(booking);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <Table.Td>
                      <Stack gap={2}>
                        <Text fw={700}>{booking.reference}</Text>
                        <Text c="dimmed" size="sm">Booking request</Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Button
                        component={Link}
                        onClick={(event) => event.stopPropagation()}
                        size="compact-sm"
                        to={`/vendors/${booking.tenantSlug}`}
                        variant="subtle"
                      >
                        {booking.tenantName}
                      </Button>
                    </Table.Td>
                    <Table.Td>
                      <Text>{booking.serviceName}</Text>
                      <Text c="dimmed" size="sm">Quantity {booking.bookingQuantity}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text>{formatBookingScheduleDate(booking.scheduledStartAt)}</Text>
                      <Text c="dimmed" size="sm">
                        {formatBookingScheduleTimeRange(booking.scheduledStartAt, booking.scheduledEndAt)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={getBookingBadgeColor(booking.status)} variant="light">
                        {booking.status}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={booking.paymentStatus === "paid" ? "teal" : "gray"} variant="light">
                        {booking.paymentStatus}
                      </Badge>
                    </Table.Td>
                    <Table.Td style={{ width: 1, whiteSpace: "nowrap" }}>
                      <Tooltip label="View booking" withArrow>
                        <ActionIcon
                          aria-label={`View booking ${booking.reference}`}
                          component={Link}
                          onClick={(event) => event.stopPropagation()}
                          to={`/account/bookings/${booking.id}`}
                          variant="light"
                        >
                          <IconEye size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Table.Td>
                  </Table.Tr>
                ))
              ) : (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Text c="dimmed">Booking requests created from vendor profiles will appear here.</Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {bookingPagination && bookingPagination.totalItems > 0 ? (
          <Group justify="space-between" align="center">
            <Text c="dimmed" size="sm">
              Showing {(bookingPagination.page - 1) * bookingPagination.pageSize + 1}-
              {Math.min(bookingPagination.page * bookingPagination.pageSize, bookingPagination.totalItems)} of{" "}
              {bookingPagination.totalItems}
            </Text>
            {bookingPagination.totalPages > 1 ? (
              <Pagination
                onChange={setBookingPage}
                total={bookingPagination.totalPages}
                value={bookingPage}
              />
            ) : null}
          </Group>
        ) : null}
      </Stack>
    </Card>
  );

  const renderGroupFunded = () => (
    <Card className="finazze-auth-card customer-account-card" p="xl">
      <Stack gap="md">
        <div>
          <Text className="finazze-section-label">Group-funded</Text>
          <Title order={2}>Organizer and contributor campaigns</Title>
        </div>
        {error ? <Alert color="red">{error}</Alert> : null}
        {groupFundedQuery.isFetching ? <Text c="dimmed" size="sm">Loading group-funded campaigns...</Text> : null}
        <Group align="flex-end" gap="sm">
          <TextInput
            label="Search"
            onChange={(event) => setGroupFundedSearch(event.target.value)}
            placeholder="Title, vendor, service"
            value={groupFundedSearch}
          />
          <Select
            data={[
              { label: "All statuses", value: "all" },
              { label: "Funding", value: "funding" },
              { label: "Fully funded", value: "funded" },
              { label: "Vendor review", value: "vendor_review" },
              { label: "Replacement proposed", value: "replacement_proposed" },
              { label: "Confirmed", value: "confirmed" },
              { label: "Canceled", value: "organizer_canceled" },
              { label: "Funding failed", value: "funding_failed" },
              { label: "Vendor rejected", value: "vendor_rejected" }
            ]}
            label="Status"
            onChange={(value) =>
              setGroupFundedStatusFilter((value || "all") as "all" | GroupFundedCampaignSummary["campaignStatus"])
            }
            value={groupFundedStatusFilter}
          />
          <DatePickerInput
            clearable
            label="Booking date"
            onChange={(value) => setGroupFundedDateRange(value)}
            placeholder="Select date range"
            type="range"
            value={groupFundedDateRange}
          />
          {groupFundedDateRange[0] || groupFundedDateRange[1] || groupFundedSearch || groupFundedStatusFilter !== "all" ? (
            <Button
              className="neura-secondary-button"
              onClick={() => {
                setGroupFundedSearch("");
                setGroupFundedStatusFilter("all");
                setGroupFundedDateRange([null, null]);
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </Group>
        <Table.ScrollContainer minWidth={860}>
          <Table className="neura-customer-table" verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Campaign</Table.Th>
                <Table.Th>Schedule</Table.Th>
                <Table.Th>Funding</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredGroupFundedCampaigns.length ? (
                filteredGroupFundedCampaigns.map((campaign) => (
                  <Table.Tr
                    className="neura-customer-table-row"
                    key={campaign.id}
                    onClick={() => openGroupFundedCampaign(campaign)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openGroupFundedCampaign(campaign);
                      }
                    }}
                    role="button"
                    style={{ cursor: "pointer" }}
                    tabIndex={0}
                  >
                    <Table.Td>
                      <Stack gap={2}>
                        <Text fw={700}>{campaign.campaignTitle || campaign.serviceName}</Text>
                        <Text c="dimmed" size="sm">
                          {campaign.vendorName ? `${campaign.vendorName} · ` : ""}
                          {campaign.serviceName} · {campaign.locationName}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Text>{formatBookingScheduleDate(campaign.scheduledStartAt)}</Text>
                      <Text c="dimmed" size="sm">
                        {formatBookingScheduleTimeRange(campaign.scheduledStartAt, campaign.scheduledEndAt)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text>{campaign.paidParticipantCount}/{campaign.requiredContributors} verified</Text>
                      <Text c="dimmed" size="sm">
                        PHP {(campaign.requiredContributionAmountCents / 100).toLocaleString()} each
                      </Text>
                      {campaign.contribution?.contributionStatus === "rejected" ? (
                        <Text c="red" size="sm">
                          Your contribution was not counted.
                        </Text>
                      ) : campaign.contribution?.contributionStatus === "refund_pending" ? (
                        <Text c="orange" size="sm">
                          Your contribution cannot be accepted. Refund pending.
                        </Text>
                      ) : null}
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={4}>
                        <Badge color={getGroupFundedBadgeColor(campaign.campaignStatus)} variant="light" w="fit-content">
                          {campaign.campaignStatus.replace(/_/g, " ")}
                        </Badge>
                        {campaign.contribution ? (
                          <Badge
                            color={getGroupFundedContributionBadgeColor(campaign.contribution.contributionStatus)}
                            variant="light"
                            w="fit-content"
                          >
                            {getGroupFundedContributionLabel(campaign.contribution.contributionStatus)}
                          </Badge>
                        ) : null}
                        {campaign.contribution?.contributionStatus === "rejected" && campaign.contribution.rejectionReason ? (
                          <Text c="dimmed" size="xs">
                            {campaign.contribution.rejectionReason}
                          </Text>
                        ) : null}
                        {campaign.contribution?.contributionStatus === "refund_pending" && campaign.contribution.rejectionReason ? (
                          <Text c="orange" size="xs">
                            {campaign.contribution.rejectionReason} · Refund pending
                          </Text>
                        ) : null}
                      </Stack>
                    </Table.Td>
                    <Table.Td style={{ width: 1, whiteSpace: "nowrap" }}>
                      <Tooltip label="View campaign" withArrow>
                        <ActionIcon
                          aria-label={`View group-funded campaign ${campaign.campaignTitle || campaign.serviceName}`}
                          component={Link}
                          state={{ from: currentAccountPath }}
                          to={`/group-funded/${campaign.publicToken}`}
                          variant="light"
                        >
                          <IconEye size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Table.Td>
                  </Table.Tr>
                ))
              ) : (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Text c="dimmed">
                      {groupFundedCampaigns.length
                        ? "No group-funded campaigns match the current filters."
                        : "Group-funded campaigns you organize or contribute to will appear here."}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {groupFundedCampaigns.length ? (
          <Text c="dimmed" size="sm">
            Showing {filteredGroupFundedCampaigns.length} of {groupFundedCampaigns.length}
          </Text>
        ) : null}
      </Stack>
    </Card>
  );

  const renderSettings = () => (
    <Stack gap="md">
      <Card className="finazze-auth-card customer-account-card" p="xl">
      <Stack gap="lg">
        <div>
          <Text className="finazze-section-label">Settings</Text>
          <Title order={2}>Account details</Title>
          <Text c="dimmed" mt="xs">
            Name can be updated here. Display name is used on public-facing details like group-funded campaigns.
          </Text>
        </div>
        <form onSubmit={handleProfileSave}>
          <Stack gap="md">
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <TextInput
                label="Name"
                name="name"
                required
                value={profileForm.name}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    name: event.target.value
                  }))
                }
              />
              <TextInput
                label={
                  <Group align="center" gap={4} wrap="nowrap">
                    <span>Display name</span>
                    <Tooltip label="Shown publicly, for example: Organized by John S." multiline w={260} withArrow>
                      <ActionIcon aria-label="Display name info" color="gray" size="xs" variant="transparent">
                        <IconInfoCircle size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                }
                maxLength={60}
                name="displayName"
                placeholder={accountUser?.username || accountUser?.name || user.name}
                value={profileForm.displayName || ""}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    displayName: event.target.value
                  }))
                }
              />
              <TextInput
                disabled
                label="Username"
                name="username"
                value={accountUser?.username ? `@${accountUser.username}` : ""}
              />
              <TextInput
                disabled
                label="Email"
                value={accountUser?.email || user.email || ""}
              />
              <TextInput
                disabled
                label="Phone number"
                value={accountUser?.phone || user.phone || ""}
              />
            </SimpleGrid>
            <Alert color="yellow" variant="light">
              Email and phone updates need a dedicated account OTP flow before they can be changed. They are shown read-only here until that validation endpoint exists.
            </Alert>
            {profileError ? <Alert color="red">{profileError}</Alert> : null}
            {profileMessage ? <Alert color="teal">{profileMessage}</Alert> : null}
            <Button color="dark" disabled={savingProfile} type="submit" w="fit-content">
              {savingProfile ? "Saving..." : "Save profile details"}
            </Button>
          </Stack>
        </form>
      </Stack>
      </Card>
    </Stack>
  );

  const renderNotifications = () => {
    const browserNotificationsEnabled = browserPermission === "granted";

    return (
      <Card className="finazze-auth-card customer-account-card" p="xl">
        <Stack gap="lg">
          <div>
            <Text className="finazze-section-label">Notifications</Text>
            <Title order={2}>Browser notifications</Title>
            <Text c="dimmed" mt="xs">
              Email stays on by default. Browser notifications require permission after login and can deliver booking and queue alerts.
            </Text>
          </div>
          <Alert color="blue" variant="light">
            If browser permission is denied, booking and queue alerts will continue by email.
          </Alert>
          <Alert color={browserNotificationsSecure ? "teal" : "yellow"} variant="light">
            {browserNotificationsSupported
              ? browserNotificationsSecure
                ? `Browser notifications are available in this browser. Current permission: ${browserPermission}.`
                : "Browser notifications require a secure context such as https:// or localhost."
              : "This browser does not support browser notifications."}
          </Alert>
          <Group gap="sm">
            <Button
              color="dark"
              disabled={
                !browserNotificationsSupported ||
                !browserNotificationsSecure ||
                browserPushSubscribed ||
                requestingBrowserPermission
              }
              onClick={handleRequestBrowserPermission}
              type="button"
              variant="light"
            >
              {browserPushSubscribed
                ? "Browser notifications synced"
                : requestingBrowserPermission
                  ? "Syncing browser notifications..."
                  : browserPermission === "granted"
                    ? "Sync browser notifications"
                    : "Allow browser notifications"}
            </Button>
            <Text c="dimmed" size="sm">
              {!browserNotificationsSupported
                ? "Use a browser that supports notifications."
                : !browserNotificationsSecure
                  ? "Open this page on https:// or localhost to request permission."
                  : browserPermission === "granted"
                    ? "This browser can receive booking and queue alerts."
                    : browserPermission === "denied"
                      ? "Permission was denied in this browser. You can change it in browser settings."
                      : "Click the button to allow browser notifications for this account."}
            </Text>
          </Group>
          <Checkbox
            checked={browserNotificationsEnabled}
            disabled={!browserNotificationsEnabled}
            label="Browser notifications"
            description={
              browserNotificationsEnabled
                ? "This browser can receive your booking and queue alerts."
                : "Enable browser notifications after login to receive alerts here."
            }
            readOnly
          />
          <Divider label="Customer alerts" labelPosition="center" />
          <Checkbox
            checked={notificationSettings.bookingAlerts}
            label="Booking alerts"
            disabled={savingNotificationSettings}
            onChange={(event) => handleNotificationToggle("bookingAlerts", event.currentTarget.checked)}
          />
          <Checkbox
            checked={notificationSettings.queueAlerts}
            label="Queue alerts"
            disabled={savingNotificationSettings}
            onChange={(event) => handleNotificationToggle("queueAlerts", event.currentTarget.checked)}
          />
        </Stack>
      </Card>
    );
  };

  const renderSecurity = () => (
    <Stack gap="lg">
      <Card className="finazze-auth-card customer-account-card" p="xl">
        <Stack gap="md">
          <div>
            <Text className="finazze-section-label">Security</Text>
            <Title order={2}>Change password</Title>
            <Text c="dimmed" mt="xs">
              Updating your password signs out this session and any other active sessions.
            </Text>
          </div>
          <form onSubmit={handlePasswordChange}>
            <Stack gap="md">
              <PasswordInput
                label="Current password"
                name="currentPassword"
                required
                value={passwordForm.currentPassword}
                onChange={(event) =>
                  setPasswordForm((current) => ({
                    ...current,
                    currentPassword: event.target.value
                  }))
                }
              />
              <PasswordInput
                label="New password"
                name="newPassword"
                required
                value={passwordForm.newPassword}
                onChange={(event) =>
                  setPasswordForm((current) => ({
                    ...current,
                    newPassword: event.target.value
                  }))
                }
              />
              {passwordError ? <Alert color="red">{passwordError}</Alert> : null}
              <Button color="dark" disabled={changingPassword} type="submit" w="fit-content">
                {changingPassword ? "Updating password..." : "Change password"}
              </Button>
            </Stack>
          </form>
        </Stack>
      </Card>
      <Card className="finazze-auth-card customer-account-card" p="xl">
        <Stack gap="md">
          <div>
            <Text className="finazze-section-label">2FA/MFA</Text>
            <Title order={2}>Multi-factor authentication</Title>
          </div>
          <Group gap="sm">
            <Badge color={accountUser?.mfaEnabled ? "teal" : "gray"} variant="light">
              {accountUser?.mfaEnabled ? "Enabled" : "Not enabled"}
            </Badge>
            <Badge color={accountUser?.mfaRequired ? "orange" : "gray"} variant="light">
              {accountUser?.mfaRequired ? "Required" : "Optional"}
            </Badge>
          </Group>
          <Alert color="blue" variant="light">
            MFA enrollment is represented in the account model, but a customer self-service enrollment and verification flow has not been implemented yet.
          </Alert>
        </Stack>
      </Card>
    </Stack>
  );

  const renderActiveSection = () => {
    switch (activeSection) {
      case "tickets":
        return renderTickets();
      case "bookings":
        return renderBookings();
      case "group-funded":
        return renderGroupFunded();
      case "settings":
        return renderSettings();
      case "notifications":
        return renderNotifications();
      case "security":
        return renderSecurity();
      default:
        return renderProfile();
    }
  };

  return (
    <Stack className="customer-account-page" gap="lg">
      <Card className="finazze-auth-card customer-account-card customer-account-hero" p="xl">
        <Group align="flex-start" justify="space-between" gap="lg">
          <Stack gap={4}>
            <Text className="finazze-section-label">Customer account</Text>
            <Title order={1}>{accountUser?.name || user.name}</Title>
            <Text c="dimmed">{accountUser?.username ? `@${accountUser.username}` : "Username not set"}</Text>
          </Stack>
          <Group gap="xs">
            <Badge color={accountUser?.emailVerified ? "teal" : "yellow"} variant="light">
              {accountUser?.emailVerified ? "Email verified" : "Email not verified"}
            </Badge>
            <Badge color={accountUser?.mfaEnabled ? "teal" : "gray"} variant="light">
              {accountUser?.mfaEnabled ? "MFA enabled" : "MFA off"}
            </Badge>
          </Group>
        </Group>
      </Card>

      <div className="customer-account-layout">
        <Card className="customer-account-sidebar" p="md">
          <Stack gap={4}>
            {ACCOUNT_SECTIONS.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.key;

              return (
                <Button
                  component={Link}
                  justify="flex-start"
                  key={section.key}
                  leftSection={<Icon size={18} />}
                  to={section.path}
                  variant={isActive ? "light" : "subtle"}
                  color={isActive ? "orange" : "dark"}
                >
                  {section.label}
                </Button>
              );
            })}
          </Stack>
          <Divider my="md" />
          <Text c="dimmed" size="sm">
            Queue Tickets and Bookings are separated because a booking is scheduled intent, while a queue ticket is live service-day execution.
          </Text>
        </Card>
        <div className="customer-account-content">
          {renderActiveSection()}
        </div>
      </div>
    </Stack>
  );
}
