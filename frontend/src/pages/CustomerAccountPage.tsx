import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Card,
  Divider,
  FileInput,
  Group,
  Checkbox,
  Modal,
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
  IconExternalLink,
  IconEye,
  IconInfoCircle,
  IconUpload,
  IconRepeat
} from "@tabler/icons-react";
import { Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import QRCode from "react-qr-code";
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
import { showCustomerError, showCustomerSuccess } from "../utils/customerNotifications";
import { isBrowserPushSupported, subscribeToBrowserPush } from "../utils/pushNotifications";
import CustomerAccountLayout, { type CustomerAccountSection } from "../components/CustomerAccountLayout";
import { getTicketStateSummary } from "../utils/queueStatus";

const CUSTOMER_TABLE_PAGE_SIZE = 10;

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
    case "pending_carry_over":
      return "blue";
    case "unserved":
      return "orange";
    case "expired":
      return "red";
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

function formatBookingBundleTotal(amountCents: number, currency = "PHP") {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2
  }).format(amountCents / 100);
}

function getActiveSection(pathname: string): CustomerAccountSection {
  const [, , section] = pathname.split("/");
  if (section === "tickets" || section === "bookings" || section === "campaigns" || section === "group-funded" || section === "settings" || section === "notifications" || section === "security") {
    return section;
  }

  return "settings";
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

function getInitials(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "U";
}

export default function CustomerAccountPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { changePassword, refreshUser, token, user, loading } = useAuth();
  const activeSection = getActiveSection(location.pathname);
  const [profileForm, setProfileForm] = useState<CustomerProfileUpdateRequest>({
    name: "",
    displayName: ""
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [passwordForm, setPasswordForm] = useState<PasswordChangeRequest>({
    currentPassword: "",
    newPassword: ""
  });
  const [changingPassword, setChangingPassword] = useState(false);
  const [mfaSecret, setMfaSecret] = useState("");
  const [mfaUri, setMfaUri] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaRecoveryCodes, setMfaRecoveryCodes] = useState<string[]>([]);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaRemoved, setMfaRemoved] = useState(false);
  const [mfaRemovalOpened, setMfaRemovalOpened] = useState(false);
  const [mfaRemovalPassword, setMfaRemovalPassword] = useState("");
  const [mfaRemovalCode, setMfaRemovalCode] = useState("");
  const [mfaRemovalRecoveryCode, setMfaRemovalRecoveryCode] = useState("");
  const [mfaRemovalAcknowledged, setMfaRemovalAcknowledged] = useState(false);
  const [mfaRemovalBusy, setMfaRemovalBusy] = useState(false);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission>(
    typeof window !== "undefined" && typeof window.Notification !== "undefined"
      ? window.Notification.permission
      : "default"
  );
  const [requestingBrowserPermission, setRequestingBrowserPermission] = useState(false);
  const [browserPushSubscribed, setBrowserPushSubscribed] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState<CustomerNotificationSettings>({
    bookingAlerts: true,
    queueAlerts: true,
    campaignAlerts: true,
    preferredContactMethod: "in_app"
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
  const avatarPreviewUrl = useMemo(
    () => avatarFile ? URL.createObjectURL(avatarFile) : "",
    [avatarFile]
  );

  async function startMfaEnrollment() {
    setMfaBusy(true);
    try {
      const data = await apiRequest<{ secret: string; otpAuthUri: string }>("/auth/mfa/enrollment/start", { method: "POST", token, body: {} });
      setMfaSecret(data.secret); setMfaUri(data.otpAuthUri); setMfaRecoveryCodes([]);
    } catch (mfaError) { showCustomerError(getErrorMessage(mfaError), "Authenticator setup could not start"); }
    finally { setMfaBusy(false); }
  }

  async function confirmMfaEnrollment() {
    setMfaBusy(true);
    try {
      const data = await apiRequest<{ success: boolean; recoveryCodes: string[]; message: string }>("/auth/mfa/enrollment/confirm", { method: "POST", token, body: { code: mfaCode } });
      setMfaRecoveryCodes(data.recoveryCodes);
      setMfaSecret("");
      setMfaUri("");
      setMfaCode("");
      setMfaRemoved(false);
      await Promise.all([
        refreshUser(),
        queryClient.invalidateQueries({ queryKey: ["customer-account", token] })
      ]);
      showCustomerSuccess("Authenticator enabled", "Save your recovery codes before leaving this page.");
    } catch (mfaError) { showCustomerError(getErrorMessage(mfaError), "Code not verified"); }
    finally { setMfaBusy(false); }
  }

  function closeMfaRemoval() {
    if (mfaRemovalBusy) return;
    setMfaRemovalOpened(false);
    setMfaRemovalPassword("");
    setMfaRemovalCode("");
    setMfaRemovalRecoveryCode("");
    setMfaRemovalAcknowledged(false);
  }

  async function removeMfa() {
    setMfaRemovalBusy(true);
    try {
      await apiRequest<{ success: boolean; message: string }, { password: string; code: string; recoveryCode: string }>("/auth/mfa/disable", {
        method: "POST",
        token,
        body: {
          password: mfaRemovalPassword,
          code: mfaRemovalCode,
          recoveryCode: mfaRemovalRecoveryCode
        }
      });
      setMfaRemoved(true);
      setMfaRecoveryCodes([]);
      setMfaRemovalOpened(false);
      setMfaRemovalPassword("");
      setMfaRemovalCode("");
      setMfaRemovalRecoveryCode("");
      setMfaRemovalAcknowledged(false);
      await Promise.all([
        refreshUser(),
        queryClient.invalidateQueries({ queryKey: ["customer-account", token] })
      ]);
      showCustomerSuccess("MFA removed", "Your authenticator and recovery codes are no longer active.");
    } catch (mfaError) {
      showCustomerError(getErrorMessage(mfaError), "MFA could not be removed");
    } finally {
      setMfaRemovalBusy(false);
    }
  }
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
  const groupFundedCampaigns = useMemo(
    () => groupFundedQuery.data?.campaigns || [],
    [groupFundedQuery.data?.campaigns]
  );
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
  const mfaEnabled = !mfaRemoved && Boolean(accountUser?.mfaEnabled || mfaRecoveryCodes.length);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  useEffect(() => {
    if (!accountQuery.data) {
      return;
    }

    setNotificationSettings(accountQuery.data.notificationSettings);
    setProfileForm({
      name: accountQuery.data.overview.user.name || "",
      displayName: accountQuery.data.overview.user.displayName || ""
    });
  }, [accountQuery.data]);

  useEffect(() => {
    if (accountQuery.error) {
      showCustomerError(getErrorMessage(accountQuery.error), "Could not load your account");
      return;
    }

    if (ticketQuery.error && activeSection === "tickets") {
      showCustomerError(getErrorMessage(ticketQuery.error), "Could not load queue tickets");
      return;
    }

    if (bookingQuery.error && activeSection === "bookings") {
      showCustomerError(getErrorMessage(bookingQuery.error), "Could not load bookings");
      return;
    }

    if (groupFundedQuery.error && activeSection === "group-funded") {
      showCustomerError(getErrorMessage(groupFundedQuery.error), "Could not load group-funded campaigns");
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
      showCustomerError("Sign in before enabling browser notifications.", "Sign in required");
      return;
    }

    if (!browserNotificationsSupported || !window.Notification) {
      showCustomerError("This browser does not support browser notifications.", "Browser notifications unavailable");
      return;
    }

    if (!browserNotificationsSecure) {
      showCustomerError("Browser notifications require a secure context such as https:// or localhost.", "Secure context required");
      return;
    }

    setRequestingBrowserPermission(true);
    try {
      const { permission } = await subscribeToBrowserPush({ token });
      setBrowserPermission(permission);
      setBrowserPushSubscribed(true);
      showCustomerSuccess("Browser notifications enabled", "Booking and queue alerts can now appear in this browser.");
    } catch (permissionError) {
      setBrowserPermission(window.Notification.permission);
      showCustomerError(getErrorMessage(permissionError), "Could not enable browser notifications");
    } finally {
      setRequestingBrowserPermission(false);
    }
  }

  async function handleNotificationToggle(
    key: "bookingAlerts" | "queueAlerts" | "campaignAlerts",
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
      showCustomerSuccess("Notification settings saved", "Your notification preferences were updated.");
    } catch (saveError) {
      showCustomerError(getErrorMessage(saveError), "Could not save notification settings");
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
      showCustomerSuccess("Profile updated", response.message);
    } catch (saveError) {
      showCustomerError(getErrorMessage(saveError), "Could not update profile");
    } finally {
      setSavingProfile(false);
    }
  }

  function handleAvatarFileChange(file: File | null) {
    if (file && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setAvatarFile(null);
      showCustomerError("Choose a JPEG, PNG, or WebP image.", "Unsupported profile photo");
      return;
    }
    if (file && file.size > 5 * 1024 * 1024) {
      setAvatarFile(null);
      showCustomerError("Choose an image no larger than 5 MB.", "Profile photo is too large");
      return;
    }
    setAvatarFile(file);
  }

  async function handleAvatarUpload() {
    if (!token || !avatarFile) {
      return;
    }

    setUploadingAvatar(true);
    try {
      const response = await customerAccountApi.uploadAvatar(token, avatarFile);
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
      setAvatarFile(null);
      void refreshUser().catch(() => undefined);
      showCustomerSuccess("Profile photo updated", response.message);
    } catch (uploadError) {
      showCustomerError(getErrorMessage(uploadError), "Could not upload profile photo");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChangingPassword(true);

    try {
      await changePassword(passwordForm);
      setPasswordForm({
        currentPassword: "",
        newPassword: ""
      });
      navigate("/login?passwordChanged=1", { replace: true });
    } catch (changeError) {
      showCustomerError(getErrorMessage(changeError), "Could not change password");
    } finally {
      setChangingPassword(false);
    }
  }

  const renderTickets = () => (
    <Stack gap="lg">
      <div className="customer-section-header">
        <Text className="finazze-section-label">Queue tickets</Text>
        <Title order={1}>Recent queue activity</Title>
        <Text c="dimmed">Review your live and previous same-day queue visits.</Text>
      </div>
      <Card className="finazze-auth-card customer-account-card" p="xl">
        <Stack gap="md">
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
                      <Stack gap={3}>
                        <Badge color={getTicketBadgeColor(ticket.status)} variant="light" w="fit-content">
                          {getTicketStateSummary(ticket.status).label}
                        </Badge>
                        {ticket.status === "pending_carry_over" && ticket.carryOverExpiresAt ? (
                          <Text c="dimmed" size="xs">
                            Retained until {formatDateTime(ticket.carryOverExpiresAt)}
                          </Text>
                        ) : ticket.status === "expired" || ticket.status === "unserved" ? (
                          <Text c="dimmed" size="xs">
                            Final outcome
                          </Text>
                        ) : null}
                      </Stack>
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
    </Stack>
  );

  const renderBookings = () => (
    <Stack gap="lg">
      <div className="customer-section-header">
        <Text className="finazze-section-label">Bookings</Text>
        <Title order={1}>Service booking history</Title>
        <Text c="dimmed">Track upcoming services and review your completed booking requests.</Text>
      </div>
      <Card className="finazze-auth-card customer-account-card" p="xl">
        <Stack gap="md">
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
                bookings.map((booking) => {
                  const isGroupFundedBooking = booking.bookingPaymentSource === "group_funded" || Boolean(booking.groupFundedBookingId);
                  const bookingBundleItems = isGroupFundedBooking && booking.groupFundedCampaign?.bundleItems?.length
                    ? booking.groupFundedCampaign.bundleItems
                    : booking.bundleItems || [];
                  const displayedServiceItems = bookingBundleItems.length
                    ? bookingBundleItems
                    : [{
                        serviceName: booking.serviceName,
                        bookingQuantity: booking.bookingQuantity,
                        priceAmountCents: booking.servicePriceAmountCents,
                        currency: booking.serviceCurrency
                      }];
                  const primaryServiceItem = displayedServiceItems[0];
                  const additionalServiceCount = Math.max(displayedServiceItems.length - 1, 0);
                  const executionModeLabel = booking.executionMode === "sequential" ? "Back-to-back" : "Together";
                  const displayedTotalCents = isGroupFundedBooking && booking.groupFundedCampaign
                    ? Number(booking.groupFundedCampaign.targetAmountCents || 0) + Number(booking.groupFundedCampaign.roundingAdjustmentCents || 0)
                    : displayedServiceItems.reduce((total, item) => total + Number(item.priceAmountCents || 0), 0);

                  return (
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
                      <Stack gap={2}>
                        <Group gap="xs" wrap="nowrap">
                          <Text fw={700}>{primaryServiceItem.serviceName}</Text>
                          {isGroupFundedBooking ? <Badge color="blue" size="xs" variant="light">Campaign</Badge> : null}
                        </Group>
                        <Text c="dimmed" size="sm">
                          Quantity {primaryServiceItem.bookingQuantity}
                          {additionalServiceCount ? ` · +${additionalServiceCount} service${additionalServiceCount === 1 ? "" : "s"}` : ""}
                        </Text>
                        {displayedServiceItems.length > 1 ? (
                          <Text c="dimmed" size="sm">
                            {executionModeLabel} bundle · {formatBookingBundleTotal(displayedTotalCents, primaryServiceItem.currency || booking.serviceCurrency)}
                          </Text>
                        ) : null}
                      </Stack>
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
                  );
                })
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
    </Stack>
  );

  const renderGroupFunded = () => (
    <Stack gap="lg">
      <div className="customer-section-header">
        <Text className="finazze-section-label">Campaigns</Text>
        <Title order={1}>Organizer and contributor campaigns</Title>
        <Text c="dimmed">Manage campaigns you organize and contributions you support.</Text>
      </div>
      <Card className="finazze-auth-card customer-account-card" p="xl">
        <Stack gap="md">
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
    </Stack>
  );

  const renderSettings = () => (
    <Stack gap="lg">
      <div className="customer-section-header">
        <Text className="finazze-section-label">Settings</Text>
        <Title order={1}>Account details</Title>
        <Text c="dimmed">
          Manage the identity and contact details connected to your customer account.
        </Text>
      </div>
      <Card className="finazze-auth-card customer-account-card" p="xl">
      <Stack gap="lg">
        <Group align="center" className="customer-profile-avatar-editor" gap="lg" wrap="nowrap">
          <Avatar
            alt={`${accountUser?.displayName || accountUser?.name || user.name} profile photo`}
            color="orange"
            radius="xl"
            size={96}
            src={avatarPreviewUrl || accountUser?.avatarUrl || undefined}
          >
            {getInitials(accountUser?.displayName || accountUser?.name || user.name)}
          </Avatar>
          <Stack gap="sm" style={{ flex: 1 }}>
            <div>
              <Text fw={700}>Profile photo</Text>
              <Text c="dimmed" size="sm">
                Shown beside your name when you organize or contribute to a campaign.
              </Text>
            </div>
            <Group align="flex-end" gap="sm">
              <FileInput
                accept="image/jpeg,image/png,image/webp"
                aria-label="Choose profile photo"
                clearable
                leftSection={<IconUpload size={16} />}
                onChange={handleAvatarFileChange}
                placeholder="Choose an image"
                value={avatarFile}
              />
              <Button
                disabled={!avatarFile}
                loading={uploadingAvatar}
                onClick={() => void handleAvatarUpload()}
                type="button"
                variant="light"
              >
                Upload photo
              </Button>
            </Group>
            <Text c="dimmed" size="xs">JPEG, PNG, or WebP. Maximum 5 MB.</Text>
          </Stack>
        </Group>
        <Divider />
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
            <Button className="customer-primary-action" color="dark" disabled={savingProfile} size="lg" type="submit">
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
      <Stack gap="lg">
        <div className="customer-section-header">
          <Text className="finazze-section-label">Notifications</Text>
          <Title order={1}>Browser notifications</Title>
          <Text c="dimmed">
            Choose how GetPrio keeps you updated about bookings, queues, and campaigns.
          </Text>
        </div>
        <Card className="finazze-auth-card customer-account-card" p="xl">
          <Stack gap="lg">
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
          <Group className="customer-action-row" gap="sm">
            <Button
              className="customer-primary-action"
              color="dark"
              disabled={
                !browserNotificationsSupported ||
                !browserNotificationsSecure ||
                browserPushSubscribed ||
                requestingBrowserPermission
              }
              onClick={handleRequestBrowserPermission}
              size="lg"
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
          <Checkbox
            checked={notificationSettings.campaignAlerts}
            label="Campaign alerts"
            description="Contribution reviews, deadlines, and reimbursement confirmations."
            disabled={savingNotificationSettings}
            onChange={(event) => handleNotificationToggle("campaignAlerts", event.currentTarget.checked)}
          />
          <Select
            data={[{ value: "in_app", label: "In-app / push" }, { value: "email", label: "Email" }, { value: "sms", label: "SMS" }]}
            label="Preferred contact method"
            value={notificationSettings.preferredContactMethod}
            onChange={async (value) => {
              if (!token || !value) return;
              const next = { ...notificationSettings, preferredContactMethod: value as CustomerNotificationSettings["preferredContactMethod"] };
              setNotificationSettings(next); setSavingNotificationSettings(true);
              try { setNotificationSettings((await customerAccountApi.updateNotificationSettings(token, next)).notificationSettings); }
              finally { setSavingNotificationSettings(false); }
            }}
          />
          </Stack>
        </Card>
      </Stack>
    );
  };

  const renderSecurity = () => (
    <Stack gap="lg">
      <div className="customer-section-header">
        <Text className="finazze-section-label">Security</Text>
        <Title order={1}>Password and authentication</Title>
        <Text c="dimmed">Protect your account and review its authentication settings.</Text>
      </div>
      <Card className="finazze-auth-card customer-account-card" p="xl">
        <Stack gap="md">
          <div>
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
              <Button className="customer-primary-action" color="dark" disabled={changingPassword} size="lg" type="submit">
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
            <Badge color={mfaEnabled ? "teal" : "gray"} variant="light">
              {mfaEnabled ? "Enabled" : "Not enabled"}
            </Badge>
            <Badge color={accountUser?.mfaRequired ? "orange" : "gray"} variant="light">
              {accountUser?.mfaRequired ? "Required" : "Optional"}
            </Badge>
          </Group>
          {mfaRecoveryCodes.length ? <Alert color="teal" title="Save these one-time recovery codes" variant="light"><Stack gap={4}>{mfaRecoveryCodes.map((code) => <Text ff="monospace" key={code}>{code}</Text>)}</Stack></Alert> : null}
          {!mfaEnabled && !mfaSecret && !mfaRecoveryCodes.length ? <Button className="customer-primary-action" color="dark" loading={mfaBusy} onClick={() => void startMfaEnrollment()}>Set up authenticator</Button> : null}
          {mfaSecret ? (
            <Stack gap="md">
              <Stack align="center" gap="sm">
                <Text fw={700} ta="center">Scan with your authenticator app</Text>
                <Text c="dimmed" maw={440} size="sm" ta="center">
                  In Google Authenticator, Microsoft Authenticator, or another TOTP app, add an account and scan this QR code.
                </Text>
                <div aria-label="GetPrio authenticator setup QR code" className="mfa-setup-qr" role="img">
                  <QRCode aria-hidden="true" bgColor="#ffffff" fgColor="#111827" size={192} value={mfaUri} />
                </div>
              </Stack>
              <Alert color="blue" title="Can’t scan the QR code?">
                Open the setup link on this device or enter the secret manually.
                <Text ff="monospace" mt="xs" style={{ overflowWrap: "anywhere" }}>{mfaSecret}</Text>
                <Text component="a" href={mfaUri} mt="xs" style={{ display: "block", overflowWrap: "anywhere" }}>Open authenticator setup</Text>
              </Alert>
              <TextInput autoComplete="one-time-code" inputMode="numeric" label="6-digit authenticator code" maxLength={6} value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ""))}/>
              <Button className="customer-primary-action" color="dark" disabled={mfaCode.length !== 6} loading={mfaBusy} onClick={() => void confirmMfaEnrollment()}>Verify and enable</Button>
            </Stack>
          ) : null}
          {mfaEnabled && !mfaRecoveryCodes.length ? (
            <Stack gap="sm">
              <Alert color="teal" variant="light">Your authenticator is active. You will be asked for a security code during protected sign-ins and sensitive actions.</Alert>
              {!accountUser?.mfaRequired ? <Button color="red" variant="light" onClick={() => setMfaRemovalOpened(true)}>Remove MFA</Button> : null}
            </Stack>
          ) : null}
        </Stack>
      </Card>
      <Modal
        className="customer-modal mfa-removal-modal"
        closeOnClickOutside={!mfaRemovalBusy}
        closeOnEscape={!mfaRemovalBusy}
        opened={mfaRemovalOpened}
        onClose={closeMfaRemoval}
        overlayProps={{ blur: 6, backgroundOpacity: 0.35 }}
        size="lg"
        title={(
          <div>
            <Text className="finazze-section-label">ACCOUNT SECURITY</Text>
            <Title order={3}>Remove multi-factor authentication</Title>
          </div>
        )}
      >
        <Stack className="mfa-removal-modal__shell" gap="md">
          <Alert color="red" title="Your account will be less secure" variant="light">
            Removing MFA revokes your authenticator and every recovery code. Other signed-in sessions will be closed.
          </Alert>
          <Stack className="mfa-removal-modal__main" gap="md">
            <PasswordInput autoComplete="current-password" label="Current password" required value={mfaRemovalPassword} onChange={(event) => setMfaRemovalPassword(event.target.value)} />
            <TextInput autoComplete="one-time-code" description="Use this or an unused recovery code below." inputMode="numeric" label="Current authenticator code" maxLength={6} value={mfaRemovalCode} onChange={(event) => setMfaRemovalCode(event.target.value.replace(/\D/g, ""))}/>
            <TextInput autoComplete="one-time-code" description="Use this only if your authenticator is unavailable." label="Recovery code" value={mfaRemovalRecoveryCode} onChange={(event) => setMfaRemovalRecoveryCode(event.target.value)} />
            <Checkbox checked={mfaRemovalAcknowledged} label="I understand that removing MFA reduces my account security." onChange={(event) => setMfaRemovalAcknowledged(event.target.checked)} />
          </Stack>
          <Group className="mfa-removal-modal__footer" justify="flex-end">
            <Button disabled={mfaRemovalBusy} variant="default" onClick={closeMfaRemoval}>Keep MFA</Button>
            <Button
              color="red"
              disabled={!mfaRemovalPassword || (!mfaRemovalRecoveryCode.trim() && mfaRemovalCode.length !== 6) || !mfaRemovalAcknowledged}
              loading={mfaRemovalBusy}
              onClick={() => void removeMfa()}
            >
              Remove MFA
            </Button>
          </Group>
        </Stack>
      </Modal>
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
        return renderSettings();
    }
  };

  return (
    <CustomerAccountLayout activeSection={activeSection}>
      {renderActiveSection()}
    </CustomerAccountLayout>
  );
}
