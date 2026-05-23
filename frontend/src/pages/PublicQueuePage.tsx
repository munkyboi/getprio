import { useEffect, useState, type CSSProperties } from "react";
import { Badge, Box, Button, Group, Paper, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import QRCode from "react-qr-code";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { QueueSnapshot, StoreHourSummary } from "@shared";
import { API_BASE_URL, apiRequest } from "../api/client";
import { buildJoinPath, buildJoinUrl } from "../queuePaths";
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

export default function PublicQueuePage() {
  const { tenantSlug, locationSlug } = useParams<{ tenantSlug: string; locationSlug?: string }>();
  const [searchParams] = useSearchParams();
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);
  const [error, setError] = useState("");
  const lookupCode = searchParams.get("ticket") || "";
  const tenantSlugValue = tenantSlug || "";
  const joinPath = tenantSlug ? buildJoinPath(tenantSlug, locationSlug) : "/";
  const joinUrl =
    snapshot?.location?.joinUrl ||
    snapshot?.tenant?.joinUrl ||
    buildJoinUrl(window.location.origin, tenantSlugValue, locationSlug);
  const joinQrUrl = `${joinUrl}?source=qr`;
  const vendorIsInactive = snapshot ? !snapshot.tenant.isActive : false;
  const locationIsClosed = snapshot?.location ? !snapshot.location.openStatus.isOpen : false;
  const publicBoardUnavailable = vendorIsInactive || locationIsClosed;
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
        margin: "-2rem calc(50% - 50dvw) -4rem",
        minHeight: "100vh",
        maxWidth: "100dvw",
        overflowX: "hidden",
        padding: "2rem"
      }
    : {
        margin: "-2rem calc(50% - 50dvw) -4rem",
        minHeight: "100vh",
        maxWidth: "100dvw",
        overflowX: "hidden",
        padding: "2rem"
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
  const heroTitle = theme?.heroTitle || snapshot?.location?.name || snapshot?.tenant?.name || tenantSlugValue;
  const heroSubtitle =
    theme?.heroSubtitle ||
    "Customers can monitor their turn remotely and join the line online if the vendor has enabled the public flow.";
  const locationHours = normalizeHours(snapshot?.location?.hours || []);
  const todayIndex = getTodayIndex(snapshot?.location?.timezone);
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
  }, [locationSlug, lookupCode, tenantSlug]);

  return (
    <Box style={pageStyle}>
      <Stack gap="lg" maw={1180} mx="auto">
        <Paper p={{ base: "lg", md: "xl" }} shadow="xl" style={cardStyle}>
          <SimpleGrid cols={{ base: 1, md: publicBoardUnavailable ? 1 : 3 }} spacing="xl">
            <Stack gap="md" style={{ gridColumn: publicBoardUnavailable ? undefined : "span 2" }}>
              {theme?.logoUrl ? (
                <Box
                  alt={`${heroTitle} logo`}
                  component="img"
                  src={theme.logoUrl}
                  style={{ maxHeight: 76, maxWidth: 180, objectFit: "contain" }}
                />
              ) : null}
              <Text c={subheaderColor} fw={800} size="xs" tt="uppercase" lts={2}>
                Live public board
              </Text>
              <Title c={headerColor} order={1} style={{ fontSize: "clamp(3rem, 7vw, 4.5rem)" }}>
                {heroTitle}
              </Title>
              {vendorIsInactive ? (
                <Text c="red" fw={700}>Vendor is not yet active.</Text>
              ) : locationIsClosed ? (
                <Text c="red" fw={700}>This location is currently closed</Text>
              ) : (
                <Text c={bodyColor} maw={760}>{heroSubtitle}</Text>
              )}
              {snapshot?.location ? (
                <Group className="public-board-hours-strip" gap="xl">
                  {locationHours.map((hour) => {
                    const isToday = hour.weekday === todayIndex;
                    return (
                      <Stack
                        className={
                          [
                            "public-board-hours-day",
                            isToday ? "public-board-hours-day-active" : "",
                            hour.isClosed ? "public-board-hours-day-closed" : ""
                          ]
                            .filter(Boolean)
                            .join(" ")
                        }
                        gap={0}
                        key={hour.weekday}
                      >
                        <Text
                          className="public-board-hours-time"
                        >
                          {formatHoursLabel(hour)}
                        </Text>
                        <Text
                          className="public-board-hours-label"
                        >
                          {weekdayLabels[hour.weekday]}
                        </Text>
                      </Stack>
                    );
                  })}
                </Group>
              ) : null}
              {!publicBoardUnavailable ? (
                <Group mt="lg" gap="sm">
                  <Button component={Link} to={joinPath} radius="xl" size="md" style={buttonStyle}>
                    Join this queue
                  </Button>
                  <Badge radius="xl" size="lg" variant="light">Waiting: {snapshot?.stats?.waitingCount ?? 0}</Badge>
                  <Badge radius="xl" size="lg" variant="light">ETA: {snapshot?.stats?.estimatedWaitMinutes ?? 0} mins</Badge>
                  <Badge color={snapshot?.location?.openStatus.isOpen ? "teal" : "red"} radius="xl" size="lg">
                    {snapshot?.location?.openStatus.isOpen ? "Open" : "Closed"}
                  </Badge>
                </Group>
              ) : null}
            </Stack>

            {!publicBoardUnavailable && !lookupCode && !snapshot?.focusTicket ? (
              <Stack align="center" gap="sm">
                <Text c={bodyColor} fw={700}>Scan to join</Text>
                <Paper bg="white" p="md" radius="lg" withBorder>
                  <QRCode size={256} value={joinQrUrl} />
                </Paper>
                <Text c={bodyColor} size="sm">Use your phone camera to open the queue form.</Text>
              </Stack>
            ) : null}
          </SimpleGrid>
        </Paper>

        {error ? <Text c="red" fw={700}>{error}</Text> : null}

        {publicBoardUnavailable ? null : (
          <>
            {lookupCode && snapshot?.focusTicket ? (
              <Paper p="xl" shadow="lg" style={cardStyle}>
                <Stack gap="xs">
                  <Text c={subheaderColor} fw={800} size="xs" tt="uppercase" lts={2}>Your ticket</Text>
                  <Title c={headerColor} order={2}>{snapshot.focusTicket.ticketNumber}</Title>
                  <Text c={bodyColor}>Status: <strong>{snapshot.focusTicket.status}</strong></Text>
                  <Text c={bodyColor}>
                    {snapshot.focusTicket.position
                      ? `You are number ${snapshot.focusTicket.position} in line.`
                      : "You are no longer in the waiting list."}
                  </Text>
                  <Text c={bodyColor}>Estimated wait: {snapshot.focusTicket.estimatedWaitMinutes} mins</Text>
                </Stack>
              </Paper>
            ) : null}

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
              <Paper p="xl" shadow="lg" style={cardStyle}>
                <Stack gap="md">
                  <Text c={bodyColor}>Now serving</Text>
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
                  <Text c={bodyColor}>Served today</Text>
                  <Title c={headerColor} order={2}>{snapshot?.stats?.servedToday ?? 0}</Title>
                  <Text c={bodyColor} size="sm">Updated live for this tenant</Text>
                </Stack>
              </Paper>
            </SimpleGrid>

            <Paper p="xl" shadow="lg" style={cardStyle}>
              <Stack gap="md">
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Text c={subheaderColor} fw={800} size="xs" tt="uppercase" lts={2}>Next in line</Text>
                    <Title c={headerColor} order={2}>Queue progress</Title>
                  </div>
                  <Button component={Link} to={joinPath} variant="subtle" style={{ color: theme?.buttonBackgroundColor || undefined }}>
                    Need a number?
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
          </>
        )}
      </Stack>
    </Box>
  );
}
