import { useEffect, useState, type CSSProperties } from "react";
import { Alert, Badge, Box, Button, Group, Paper, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import QRCode from "react-qr-code";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { QueueSnapshot } from "@shared";
import { API_BASE_URL, apiRequest } from "../api/client";
import { buildJoinPath, buildJoinUrl } from "../queuePaths";
import { getErrorMessage } from "../utils/errors";

type SortDirection = "asc" | "desc";
type SortState = { key: string; direction: SortDirection };

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

export default function PublicQueuePage() {
  const { tenantSlug, locationSlug } = useParams<{ tenantSlug: string; locationSlug?: string }>();
  const [searchParams] = useSearchParams();
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);
  const [error, setError] = useState("");
  const [liveStatus, setLiveStatus] = useState<"connecting" | "connected" | "reconnecting">("connecting");
  const [sort, setSort] = useState<SortState>({ key: "position", direction: "asc" });
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
  const queueClosedForDay = Boolean(snapshot?.closure);
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
  const businessName = snapshot?.tenant?.name || tenantSlugValue;
  const locationName = snapshot?.location?.name || "Primary location";
  const queueProgressTickets = [
    ...(snapshot?.current
      ? [
          {
            id: `current-${snapshot.current.id}`,
            ticketNumber: snapshot.current.ticketNumber,
            customerName: maskCustomerName(snapshot.current.customerName),
            progressLabel: "Now serving",
            carryOverCount: 0
          }
        ]
      : []),
    ...((snapshot?.nextUp || []).map((ticket) => ({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      customerName: maskCustomerName(ticket.customerName),
      progressLabel: `#${ticket.position}`,
      carryOverCount: ticket.carryOverCount
    })))
  ].slice(0, 10);

  useEffect(() => {
    if (!tenantSlug) {
      return undefined;
    }

    let active = true;
    const params = new URLSearchParams({
      sort: sort.key,
      direction: sort.direction
    });
    if (lookupCode) {
      params.set("lookupCode", lookupCode);
    }
    const query = `?${params.toString()}`;
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

    setLiveStatus("connecting");
    const eventSource = new EventSource(`${API_BASE_URL}${basePath}/stream${query}`);
    eventSource.onopen = () => {
      setLiveStatus("connected");
      setError("");
    };
    eventSource.onmessage = (event) => {
      setSnapshot(JSON.parse(event.data) as QueueSnapshot);
      setLiveStatus("connected");
      setError("");
    };
    eventSource.onerror = () => {
      setLiveStatus("reconnecting");
      setError("Live updates are reconnecting.");
    };

    return () => {
      active = false;
      eventSource.close();
    };
  }, [locationSlug, lookupCode, sort.direction, sort.key, tenantSlug]);

  function handleSortChange(key: string) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  }

  function renderSortHeader(key: string, label: string) {
    return (
      <button className="sortable-table-header" type="button" onClick={() => handleSortChange(key)}>
        <span>{label}</span>
        <span>{sort.key === key ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
    );
  }

  return (
    <Box style={pageStyle}>
      <Stack gap="lg" maw={1180} mx="auto">
        <Paper p={{ base: "lg", md: "xl" }} shadow="xl" style={cardStyle}>
          <SimpleGrid cols={{ base: 1, md: publicBoardUnavailable ? 1 : 3 }} spacing="xl">
            <Stack gap="md" style={{ gridColumn: publicBoardUnavailable ? undefined : "span 2" }}>
              {theme?.logoUrl ? (
                <Box
                  alt={`${businessName} logo`}
                  component="img"
                  src={theme.logoUrl}
                  style={{ maxHeight: 76, maxWidth: 180, objectFit: "contain" }}
                />
              ) : null}
              <Text c={subheaderColor} fw={800} size="xs" tt="uppercase" lts={2}>
                Live public board
              </Text>
              <Badge
                color={liveStatus === "connected" ? "teal" : "orange"}
                radius="xl"
                size="lg"
                variant="light"
                w="fit-content"
              >
                {liveStatus === "connected" ? "Live" : liveStatus === "connecting" ? "Connecting" : "Reconnecting"}
              </Badge>
              <Title c={headerColor} order={1} style={{ fontSize: "clamp(3rem, 7vw, 4.5rem)" }}>
                {businessName}
              </Title>
              <Title c={subheaderColor} order={2} style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)" }}>
                {locationName}
              </Title>
              {vendorIsInactive ? (
                <Text c="red" fw={700}>Vendor is not yet active.</Text>
              ) : locationIsClosed ? (
                <Text c="red" fw={700}>This location is currently closed</Text>
              ) : queueClosedForDay ? (
                <Text c="red" fw={700}>
                  This queue is closed for today and resumes on the next open queue day.
                </Text>
              ) : null}
              {!publicBoardUnavailable ? (
                <Group mt="lg" gap="sm">
                  <Button
                    component={Link}
                    disabled={queueClosedForDay}
                    to={joinPath}
                    radius="xl"
                    size="md"
                    style={buttonStyle}
                  >
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

            {!publicBoardUnavailable && !queueClosedForDay && !lookupCode && !snapshot?.focusTicket ? (
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

        {!publicBoardUnavailable && queueClosedForDay ? (
          <Alert color="orange" icon={<IconInfoCircle size={18} />} variant="light">
            New joins are paused for today. Existing waiting tickets may be carried into the next
            open queue day, and paid SMS alerts remain active.
          </Alert>
        ) : null}

        {publicBoardUnavailable ? null : (
          <>
            {lookupCode && snapshot?.focusTicket ? (
              <Paper p="xl" shadow="lg" style={cardStyle}>
                <Stack gap="xs">
                  <Text c={subheaderColor} fw={800} size="xs" tt="uppercase" lts={2}>Your ticket</Text>
                  <Group gap="xs">
                    <Title c={headerColor} order={2}>{snapshot.focusTicket.ticketNumber}</Title>
                    {snapshot.focusTicket.carryOverCount > 0 ? (
                      <Badge color="orange" radius="xl" variant="light">
                        Carried over
                      </Badge>
                    ) : null}
                    {snapshot.focusTicket.notifyBySms ? (
                      <Badge color="teal" radius="xl" variant="light">
                        SMS alerts enabled
                      </Badge>
                    ) : null}
                  </Group>
                  <Text c={bodyColor}>Status: <strong>{snapshot.focusTicket.status}</strong></Text>
                  <Text c={bodyColor}>
                    {snapshot.focusTicket.position
                      ? `You are number ${snapshot.focusTicket.position} in line.`
                      : "You are no longer in the waiting list."}
                  </Text>
                  <Text c={bodyColor}>Estimated wait: {snapshot.focusTicket.estimatedWaitMinutes} mins</Text>
                  <Alert color="blue" icon={<IconInfoCircle size={18} />} mt="sm" variant="light">
                    If your ticket is not served today, waiting tickets may be carried into the next queue day.
                    Paid SMS alerts stay active for carried tickets.
                  </Alert>
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
                        <Table.Th>{renderSortHeader("ticketNumber", "Ticket")}</Table.Th>
                        <Table.Th ta="right">{renderSortHeader("position", "Position")}</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {queueProgressTickets.length ? (
                        queueProgressTickets.map((ticket) => (
                          <Table.Tr key={ticket.id}>
                            <Table.Td>
                              <Group gap="xs">
                                <Text c={headerColor} fw={800}>{ticket.ticketNumber}</Text>
                                {ticket.carryOverCount > 0 ? (
                                  <Badge color="orange" size="sm" variant="light">
                                    Carried over
                                  </Badge>
                                ) : null}
                              </Group>
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
