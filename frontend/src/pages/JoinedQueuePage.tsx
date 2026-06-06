import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title
} from "@mantine/core";
import { Link, Navigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import type { CancelQueueTicketRequest, QueueSnapshot, StoreHourSummary } from "@shared";
import { API_BASE_URL, apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { buildJoinPath, buildMonitorPath, buildMonitorPathWithTicket } from "../queuePaths";
import { clearJoinedQueueAccess, getJoinedQueueAccess } from "../utils/joinedQueueAccess";
import { getErrorMessage } from "../utils/errors";

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

const weekdayLabels = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

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
  const minute = Number(minuteValue);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return minute ? `${displayHour}:${String(minute).padStart(2, "0")}${period}` : `${displayHour}${period}`;
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

  return `${formatDisplayTime(hour.opensAt)}  •  ${formatDisplayTime(hour.closesAt)}`;
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
  const [searchParams] = useSearchParams();
  const { token, user } = useAuth();
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);
  const [error, setError] = useState("");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [hoursOpened, setHoursOpened] = useState(false);
  const lookupCode = searchParams.get("ticket") || "";
  const tenantSlugValue = tenantSlug || "";

  const prefill = (location.state as { registrationPrefill?: { name?: string; email?: string; phone?: string } } | null)
    ?.registrationPrefill;
  const registrationState = useMemo(
    () => ({
      prefill,
      redirectTo: `${location.pathname}${location.search}${location.hash}`
    }),
    [location.hash, location.pathname, location.search, prefill]
  );
  const missingTenant = !tenantSlugValue;
  const missingLookupCode = !lookupCode;

  const joinPath = buildJoinPath(tenantSlugValue, locationSlug);
  const publicBoardPath = buildMonitorPathWithTicket(tenantSlugValue, lookupCode, locationSlug);
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
  const pageStyle: CSSProperties = theme
    ? {
        backgroundColor: theme.pageBackgroundColor,
        backgroundImage: theme.backgroundImageUrl
          ? `linear-gradient(rgba(255,255,255,0.35), rgba(255,255,255,0.35)), url(${theme.backgroundImageUrl})`
          : undefined,
        backgroundSize: "cover",
        backgroundAttachment: "fixed",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        color: theme.bodyColor,
        margin: "0 calc(50% - 50dvw) -4rem",
        minHeight: "calc(100vh - 81px)",
        maxWidth: "100dvw",
        overflowX: "hidden",
        padding: "3rem 2rem 4rem"
      }
    : {
        margin: "0 calc(50% - 50dvw) -4rem",
        minHeight: "calc(100vh - 81px)",
        maxWidth: "100dvw",
        overflowX: "hidden",
        padding: "3rem 2rem 4rem"
      };
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
  const heroTitle = theme?.heroTitle || businessName;
  const heroSubtitle = theme?.heroSubtitle || locationName;
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
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(getErrorMessage(loadError));
        }
      });

    const eventSource = new EventSource(`${API_BASE_URL}${basePath}/stream${query}`);
    eventSource.onmessage = (event) => {
      setSnapshot(JSON.parse(event.data) as QueueSnapshot);
      setError("");
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

  if (missingTenant) {
    return <Navigate replace to="/" />;
  }

  if (missingLookupCode) {
    return <Navigate replace to={buildMonitorPath(tenantSlugValue, locationSlug)} />;
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
    } catch (cancelError) {
      setError(getErrorMessage(cancelError));
    } finally {
      setCancelSubmitting(false);
    }
  }

  return (
    <Box style={pageStyle}>
      <Stack gap="lg" maw={1180} mx="auto">
        <Modal
          centered
          opened={hoursOpened}
          onClose={() => setHoursOpened(false)}
          title="Business hours"
          size="lg"
        >
          <Table.ScrollContainer minWidth={420}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Day</Table.Th>
                  <Table.Th>Hours</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {locationHours.map((hour) => {
                  const isToday = hour.weekday === todayIndex;
                  return (
                    <Table.Tr key={hour.weekday}>
                      <Table.Td fw={isToday ? 700 : 500}>{weekdayLabels[hour.weekday]}</Table.Td>
                      <Table.Td fw={isToday ? 700 : 400}>{formatHoursLabel(hour)}</Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Modal>
        <Paper p={{ base: "lg", md: "xl" }} shadow="xl" style={cardStyle}>
          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="xl">
            <Stack gap="md" style={{ gridColumn: "span 2" }}>
              {theme?.logoUrl ? (
                <Box
                  alt={`${heroTitle} logo`}
                  component="img"
                  src={theme.logoUrl}
                  style={{ maxHeight: 76, maxWidth: 180, objectFit: "contain" }}
                />
              ) : null}
              <Text c={subheaderColor} fw={800} size="xs" tt="uppercase" lts={2}>
                Queue status
              </Text>
              <Title c={headerColor} order={1} style={{ fontSize: "clamp(3rem, 7vw, 4.5rem)" }}>
                {heroTitle}
              </Title>
              <Title c={headerColor} order={2} style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}>
                {heroSubtitle}
              </Title>
              <Button
                onClick={() => setHoursOpened(true)}
                radius="xl"
                size="md"
                style={buttonStyle}
                w="fit-content"
              >
                View business hours
              </Button>
              <Group mt="lg" gap="sm">
                <Badge radius="xl" size="lg" variant="light">
                  Ticket: {snapshot?.focusTicket?.ticketNumber || lookupCode}
                </Badge>
                <Badge radius="xl" size="lg" variant="light">
                  Waiting: {snapshot?.stats?.waitingCount ?? 0}
                </Badge>
                <Badge radius="xl" size="lg" variant="light">
                  ETA: {snapshot?.focusTicket?.estimatedWaitMinutes ?? snapshot?.stats?.estimatedWaitMinutes ?? 0} mins
                </Badge>
                <Badge color={snapshot?.location?.openStatus.isOpen ? "teal" : "red"} radius="xl" size="lg">
                  {snapshot?.location?.openStatus.isOpen ? "Open" : "Closed"}
                </Badge>
              </Group>
            </Stack>

            <Paper bg="white" p="lg" radius="xl" withBorder>
              <Stack gap="sm">
                <Text c={subheaderColor} fw={800} size="xs" tt="uppercase" lts={2}>
                  Ticket details
                </Text>
                <Title c={headerColor} order={2}>
                  {snapshot?.focusTicket?.ticketNumber || "Loading..."}
                </Title>
                <Text c={bodyColor}>
                  Current status: <strong>{snapshot?.focusTicket?.status || "pending"}</strong>
                </Text>
                <Text c={bodyColor}>
                  {snapshot?.focusTicket?.position
                    ? `You are number ${snapshot.focusTicket.position} in line.`
                    : "You are no longer in the waiting list."}
                </Text>
                <Text c={bodyColor}>
                  Joined at: {snapshot?.focusTicket?.joinedAt ? new Date(snapshot.focusTicket.joinedAt).toLocaleString() : "--"}
                </Text>
                <Group mt="sm">
                  <Button component={Link} radius="xl" style={buttonStyle} to={publicBoardPath}>
                    View live board
                  </Button>
                  {canCancelTicket ? (
                    <Button
                      color="red"
                      loading={cancelSubmitting}
                      onClick={handleCancelTicket}
                      radius="xl"
                      variant="light"
                    >
                      Cancel ticket
                    </Button>
                  ) : null}
                  <Button component={Link} radius="xl" to={joinPath} variant="subtle">
                    Join again
                  </Button>
                </Group>
              </Stack>
            </Paper>
          </SimpleGrid>
        </Paper>

        {!userIsCustomer ? (
          <Paper p="xl" shadow="lg" style={cardStyle}>
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

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          <Paper p="xl" shadow="lg" style={cardStyle}>
            <Stack gap="md">
              <Text c={bodyColor}>Currently serving</Text>
              <Title c={headerColor} order={2}>{snapshot?.current?.ticketNumber || "--"}</Title>
              <Text c={bodyColor} size="sm">
                {snapshot?.current?.customerName
                  ? maskCustomerName(snapshot.current.customerName)
                  : "No active ticket"}
              </Text>
            </Stack>
          </Paper>
          <Paper p="xl" shadow="lg" style={cardStyle}>
            <Stack gap="md">
              <Text c={bodyColor}>Completed today</Text>
              <Title c={headerColor} order={2}>{snapshot?.stats?.servedToday ?? 0}</Title>
              <Text c={bodyColor} size="sm">
                Location: {snapshot?.location?.name || snapshot?.tenant?.name || "--"}
              </Text>
            </Stack>
          </Paper>
        </SimpleGrid>

        <Paper p="xl" shadow="lg" style={cardStyle}>
          <Stack gap="md">
            <Group justify="space-between" align="flex-start">
              <div>
                <Text c={subheaderColor} fw={800} size="xs" tt="uppercase" lts={2}>
                  Up next
                </Text>
                <Title c={headerColor} order={2}>Queue overview</Title>
              </div>
              <Button component={Link} to={joinPath} variant="subtle" style={{ color: theme?.buttonBackgroundColor || undefined }}>
                Join this queue
              </Button>
            </Group>
            <Table.ScrollContainer minWidth={560}>
              <Table verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Ticket</Table.Th>
                    <Table.Th ta="right">Position</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {queueProgressTickets.length ? (
                    queueProgressTickets.map((ticket) => (
                      <Table.Tr key={ticket.id}>
                        <Table.Td>
                          <Text c={headerColor} fw={800}>{ticket.ticketNumber}</Text>
                          <Text c={bodyColor} size="sm">{ticket.customerName}</Text>
                        </Table.Td>
                        <Table.Td ta="right">
                          <Badge radius="xl" variant="light">{ticket.progressLabel}</Badge>
                        </Table.Td>
                      </Table.Tr>
                    ))
                  ) : (
                    <Table.Tr>
                      <Table.Td colSpan={2}>
                        <Text c={bodyColor}>The queue is currently empty.</Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Stack>
        </Paper>
      </Stack>
    </Box>
  );
}
