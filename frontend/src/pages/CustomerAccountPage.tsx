import { useEffect, useState, type FormEvent } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  PasswordInput,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import {
  IconCalendarEvent,
  IconId,
  IconListDetails,
  IconLock,
  IconSettings
} from "@tabler/icons-react";
import { Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import type {
  BookingStatus,
  CustomerAccountHistoryResponse,
  CustomerAccountOverviewResponse,
  CustomerBookingsResponse,
  CustomerProfileUpdateRequest,
  CustomerProfileUpdateResponse,
  PasswordChangeRequest,
  TicketStatus
} from "@shared";
import { apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { buildJoinPath, buildJoinedQueuePathWithTicket } from "../queuePaths";
import {
  formatBookingScheduleDate,
  formatBookingScheduleTimeRange,
  formatDateTime
} from "../utils/dates";
import { getErrorMessage } from "../utils/errors";

type AccountSection = "profile" | "tickets" | "bookings" | "settings" | "security";

const ACCOUNT_SECTIONS: Array<{
  key: AccountSection;
  label: string;
  path: string;
  icon: typeof IconId;
}> = [
  { key: "profile", label: "Profile details", path: "/account/profile", icon: IconId },
  { key: "tickets", label: "Queue Tickets", path: "/account/tickets", icon: IconListDetails },
  { key: "bookings", label: "Bookings", path: "/account/bookings", icon: IconCalendarEvent },
  { key: "settings", label: "Settings", path: "/account/settings", icon: IconSettings },
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
  if (section === "tickets" || section === "bookings" || section === "settings" || section === "security") {
    return section;
  }

  return "profile";
}

export default function CustomerAccountPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { changePassword, token, user, loading } = useAuth();
  const activeSection = getActiveSection(location.pathname);
  const isCustomer = user?.roles?.includes("customer") ?? false;
  const [account, setAccount] = useState<CustomerAccountOverviewResponse | null>(null);
  const [history, setHistory] = useState<CustomerAccountHistoryResponse | null>(null);
  const [bookingHistory, setBookingHistory] = useState<CustomerBookingsResponse | null>(null);
  const [error, setError] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileForm, setProfileForm] = useState<CustomerProfileUpdateRequest>({
    name: ""
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordForm, setPasswordForm] = useState<PasswordChangeRequest>({
    currentPassword: "",
    newPassword: ""
  });
  const [changingPassword, setChangingPassword] = useState(false);
  const tickets = history?.tickets || account?.tickets || [];
  const bookings = bookingHistory?.bookings || [];
  const accountUser = account?.user;

  useEffect(() => {
    if (!token) {
      return;
    }

    setError("");
    Promise.all([
      apiRequest<CustomerAccountOverviewResponse>("/account/overview", { token }),
      apiRequest<CustomerAccountHistoryResponse>("/account/history", { token }),
      apiRequest<CustomerBookingsResponse>("/account/bookings", { token })
    ])
      .then(([overview, ticketHistory, customerBookings]) => {
        setAccount(overview);
        setHistory(ticketHistory);
        setBookingHistory(customerBookings);
        setProfileForm({
          name: overview.user.name || ""
        });
      })
      .catch((loadError) => setError(getErrorMessage(loadError)));
  }, [token]);

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
      const response = await apiRequest<CustomerProfileUpdateResponse, CustomerProfileUpdateRequest>(
        "/account/profile",
        {
          method: "PATCH",
          body: profileForm,
          token
        }
      );
      setAccount((current) => current ? { ...current, user: response.user } : current);
      setProfileForm({
        name: response.user.name || ""
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
        <Table.ScrollContainer minWidth={720}>
          <Table verticalSpacing="sm">
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
                  <Table.Tr key={ticket.id}>
                    <Table.Td fw={700}>{ticket.ticketNumber}</Table.Td>
                    <Table.Td>
                      <Button component={Link} size="compact-sm" to={`/vendors/${ticket.tenantSlug}`} variant="subtle">
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
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <Button
                          component={Link}
                          size="xs"
                          to={buildJoinedQueuePathWithTicket(
                            ticket.tenantSlug,
                            ticket.lookupCode,
                            ticket.locationSlug
                          )}
                          variant="light"
                        >
                          Open ticket
                        </Button>
                        <Button
                          component={Link}
                          size="xs"
                          to={buildJoinPath(ticket.tenantSlug, ticket.locationSlug)}
                          variant="subtle"
                        >
                          Join again
                        </Button>
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
        <Table.ScrollContainer minWidth={820}>
          <Table verticalSpacing="sm">
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
                  <Table.Tr key={booking.id}>
                    <Table.Td fw={700}>{booking.reference}</Table.Td>
                    <Table.Td>
                      <Button component={Link} size="compact-sm" to={`/vendors/${booking.tenantSlug}`} variant="subtle">
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
                    <Table.Td>
                      <Button
                        component={Link}
                        size="xs"
                        to={`/account/bookings/${booking.id}`}
                        variant="light"
                      >
                        View booking
                      </Button>
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
      </Stack>
    </Card>
  );

  const renderSettings = () => (
    <Card className="finazze-auth-card customer-account-card" p="xl">
      <Stack gap="lg">
        <div>
          <Text className="finazze-section-label">Settings</Text>
          <Title order={2}>Account details</Title>
          <Text c="dimmed" mt="xs">
            Name can be updated here. Username is assigned at signup, while email and phone changes remain locked behind OTP validation.
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
  );

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
      case "settings":
        return renderSettings();
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
