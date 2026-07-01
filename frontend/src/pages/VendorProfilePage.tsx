import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Badge,
  Button,
  Container,
  Divider,
  Group,
  Modal,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  ThemeIcon,
  Title
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconArrowLeft, IconCalendar, IconClock, IconMapPin, IconTicket, IconUserPlus } from "@tabler/icons-react";
import { getDay } from "date-fns";
import { Link, useParams } from "react-router-dom";
import type { PublicVendorProfile, PublicVendorProfileResponse } from "@shared";
import { apiRequest } from "../api/client";
import ContactForm from "../components/ContactForm";
import { getErrorMessage } from "../utils/errors";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toMinutes(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function formatTimeLabel(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  const hour = Number(hours);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${minutes.padStart(2, "0")} ${suffix}`;
}

function getLocationLabel(vendor: PublicVendorProfile) {
  const parts = [
    vendor.location.name,
    vendor.location.city,
    vendor.location.province
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : vendor.location.country || "Philippines";
}

function getBranchLabel(location: PublicVendorProfile["locations"][number]) {
  const parts = [location.city, location.province].filter(Boolean);
  return parts.length ? parts.join(", ") : location.country || "Philippines";
}

function formatHourRange(location: PublicVendorProfile["locations"][number], weekday: number) {
  const hour = location.hours.find((entry) => entry.weekday === weekday);

  if (!hour || hour.isClosed) {
    return "Closed";
  }

  if (hour.opensAt === hour.closesAt) {
    return "Open 24 hours";
  }

  if (!hour.opensAt || !hour.closesAt) {
    return "Hours unavailable";
  }

  const overnightLabel = toMinutes(hour.closesAt) < toMinutes(hour.opensAt) ? " next day" : "";

  return `${formatTimeLabel(hour.opensAt)} - ${formatTimeLabel(hour.closesAt)}${overnightLabel}`;
}

export default function VendorProfilePage() {
  const { tenantSlug = "" } = useParams<{ tenantSlug: string }>();
  const isMobile = useMediaQuery("(max-width: 48em)");
  const [contactOpen, setContactOpen] = useState(false);
  const [selectedLocationSlug, setSelectedLocationSlug] = useState("");
  const currentWeekday = getDay(new Date());
  const {
    data: vendor,
    isPending: loading,
    error
  } = useQuery({
    queryKey: ["public-vendor", tenantSlug],
    queryFn: async () => {
      if (!tenantSlug) {
        throw new Error("Vendor not found.");
      }

      const data = await apiRequest<PublicVendorProfileResponse>(`/public/vendors/${tenantSlug}`);
      return data.vendor;
    },
    enabled: Boolean(tenantSlug)
  });

  const locationLabel = useMemo(() => (vendor ? getLocationLabel(vendor) : ""), [vendor]);
  const selectedLocation = useMemo(() => {
    if (!vendor?.locations.length) {
      return null;
    }

    return (
      vendor.locations.find((location) => location.slug === selectedLocationSlug) ||
      vendor.locations.find((location) => location.isPrimary) ||
      vendor.locations[0]
    );
  }, [selectedLocationSlug, vendor]);
  const theme = vendor?.publicBoardTheme?.theme;
  const hasThemeMedia = Boolean(theme?.backgroundImageUrl || theme?.logoUrl);
  const themedMediaStyle: CSSProperties | undefined = theme?.backgroundImageUrl
    ? {
        backgroundImage: `linear-gradient(rgba(255,255,255,0.18), rgba(255,255,255,0.18)), url(${theme.backgroundImageUrl})`
      }
    : undefined;

  useEffect(() => {
    if (!vendor?.locations.length) {
      return;
    }

    setSelectedLocationSlug((current) => {
      if (current && vendor.locations.some((location) => location.slug === current)) {
        return current;
      }

      return vendor.locations.find((location) => location.isPrimary)?.slug || vendor.locations[0].slug;
    });
  }, [vendor]);

  return (
    <Stack className="vendor-profile-page" gap="xl">
      <Container size="xl" w="100%">
        <Button
          color="dark"
          component={Link}
          leftSection={<IconArrowLeft size={18} />}
          mb="xl"
          to="/vendors"
          variant="subtle"
        >
          Back to vendors
        </Button>

        {loading ? (
          <Paper className="vendor-empty-panel" p="xl">
            <Text c="dimmed" fw={700}>Loading vendor profile...</Text>
          </Paper>
        ) : null}

        {error ? <Alert color="red">{getErrorMessage(error)}</Alert> : null}

        {vendor ? (
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="xl">
            <Stack gap="xl">
              <div>
                <Text className="prio-label">Vendor profile</Text>
                <Group gap="sm" mt="xs">
                  {vendor.category ? <Badge color="orange" size="lg" variant="light">{vendor.category}</Badge> : null}
                  <Badge color="teal" size="lg" variant="light">Public profile</Badge>
                </Group>
                <Title className="prio-section-title" order={1} mt="md">
                  {vendor.name}
                </Title>
                <Group c="dimmed" gap={8} mt="md" wrap="nowrap">
                  <IconMapPin size={18} />
                  <Text>{locationLabel}</Text>
                </Group>
              </div>

              <Text className="prio-lead">
                {vendor.description || "This vendor is preparing detailed service information. You can still continue to the public queue when same-day service is available."}
              </Text>

              <Group>
                <Button
                  color="orange"
                  component={Link}
                  leftSection={<IconTicket size={18} />}
                  size="lg"
                  to={vendor.location.slug ? `/join/${vendor.slug}/${vendor.location.slug}` : `/join/${vendor.slug}`}
                >
                  Join primary queue
                </Button>
                <Button color="dark" component={Link} size="lg" to="/register/customer" variant="outline">
                  Create customer account
                </Button>
                <Button color="teal" onClick={() => setContactOpen(true)} size="lg" variant="light">
                  Contact vendor
                </Button>
              </Group>

              <Divider />

              <Stack gap="md">
                <div>
                  <Text fw={900}>Available locations</Text>
                  <Text c="dimmed" size="sm">
                    Choose a branch to continue into its same-day queue.
                  </Text>
                </div>
                <Tabs
                  className="vendor-location-tabs"
                  keepMounted={false}
                  onChange={(value) => setSelectedLocationSlug(value || "")}
                  value={selectedLocation?.slug || null}
                  variant="pills"
                >
                  <Tabs.List>
                    {vendor.locations.map((location) => (
                      <Tabs.Tab className="vendor-location-tab" key={location.slug} value={location.slug}>
                        {location.name}
                      </Tabs.Tab>
                    ))}
                  </Tabs.List>

                  {vendor.locations.map((location) => (
                    <Tabs.Panel key={location.slug} value={location.slug} pt="md">
                      <Paper className="vendor-location-card" data-selected={location.slug === selectedLocation?.slug ? "true" : undefined} p="md">
                        <Stack gap="xs">
                          <Group justify="space-between" wrap="nowrap">
                            <Text fw={800}>{location.name}</Text>
                            <Group gap="xs" wrap="nowrap">
                              {location.isPrimary ? <Badge color="orange" variant="light">Primary</Badge> : null}
                            </Group>
                          </Group>
                          <Group c="dimmed" gap={6} wrap="nowrap">
                            <IconMapPin size={15} />
                            <Text size="sm">{getBranchLabel(location)}</Text>
                          </Group>
                          <div className="vendor-hours-card">
                            <Group gap={6} mb={6}>
                              <IconClock size={15} />
                              <Text fw={800} size="xs">Store hours</Text>
                            </Group>
                            <div className="vendor-hours-list">
                              {WEEKDAY_LABELS.map((label, weekday) => {
                                const hoursLabel = formatHourRange(location, weekday);
                                const isClosed = hoursLabel === "Closed";
                                const isToday = weekday === currentWeekday;

                                return (
                                  <div
                                    aria-current={isToday ? "date" : undefined}
                                    className={[
                                      "vendor-hours-row",
                                      isClosed ? "vendor-hours-row-muted" : "",
                                      isToday ? "vendor-hours-row-today" : ""
                                    ].filter(Boolean).join(" ")}
                                    key={label}
                                  >
                                    <span className="vendor-hours-day">{label}</span>
                                    <span className="vendor-hours-time">{hoursLabel}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <Button
                            color="orange"
                            component={Link}
                            mt="xs"
                            size="sm"
                            to={`/join/${vendor.slug}/${location.slug}`}
                            variant="light"
                          >
                            Join this queue
                          </Button>
                        </Stack>
                      </Paper>
                    </Tabs.Panel>
                  ))}
                </Tabs>
              </Stack>

            </Stack>

            <Paper className="vendor-profile-panel" p="xl">
              <Stack gap="lg">
                <div
                  className={hasThemeMedia ? "vendor-profile-image vendor-profile-image-themed" : "vendor-profile-image"}
                  style={themedMediaStyle}
                >
                  {theme?.logoUrl ? (
                    <div className="vendor-profile-logo-frame">
                      <img alt={`${vendor.name} logo`} src={theme.logoUrl} />
                    </div>
                  ) : vendor.imageUrl ? (
                    <img alt="" src={vendor.imageUrl} />
                  ) : (
                    <IconTicket size={54} />
                  )}
                </div>
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <Paper className="vendor-profile-action" p="lg">
                    <ThemeIcon color="orange" radius="xl" size={46} variant="light">
                      <IconTicket size={23} />
                    </ThemeIcon>
                    <Title order={4} mt="md">Same-day queue</Title>
                    <Text c="dimmed" size="sm" mt={6}>
                      Continue into the existing GetPrio queue flow for this vendor.
                    </Text>
                  </Paper>
                  <Paper className="vendor-profile-action" p="lg">
                    <ThemeIcon color="teal" radius="xl" size={46} variant="light">
                      <IconCalendar size={23} />
                    </ThemeIcon>
                    <Title order={4} mt="md">Book ahead</Title>
                    <Text c="dimmed" size="sm" mt={6}>
                      Choose a published service and request a preferred schedule.
                    </Text>
                    <Button
                      color="teal"
                      component={Link}
                      mt="md"
                      to={`/vendors/${vendor.slug}/book`}
                      variant="light"
                    >
                      Start booking
                    </Button>
                  </Paper>
                </SimpleGrid>
                <Stack gap="md">
                  <div>
                    <Text fw={900}>Bookable services</Text>
                    <Text c="dimmed" size="sm">
                      Select a service to continue into the customer booking request flow.
                    </Text>
                  </div>
                  {vendor.services.length ? (
                    <SimpleGrid cols={1}>
                      {vendor.services.map((service) => (
                        <Paper className="vendor-location-card" key={service.slug} p="md">
                          <Stack gap="xs">
                            <Group justify="space-between" wrap="nowrap">
                              <Text fw={800}>{service.name}</Text>
                              <Group gap="xs" wrap="nowrap">
                                <Badge color="teal" variant="light">{service.durationMinutes} min</Badge>
                                {service.allowBookingQuantity ? (
                                  <Badge color="blue" variant="light">{service.bookingQuantityLabel || "Units"}</Badge>
                                ) : null}
                                {service.manualPaymentRequired ? (
                                  <Badge color="yellow" variant="light">Manual payment</Badge>
                                ) : null}
                              </Group>
                            </Group>
                            <Text c="dimmed" size="sm">
                              {service.description || "Service details available during booking."}
                            </Text>
                            <Group justify="space-between">
                              <Text fw={800}>
                                {service.priceDisplay || `PHP ${(service.priceAmountCents / 100).toLocaleString()}`}
                              </Text>
                              <Button
                                component={Link}
                                size="xs"
                                to={`/vendors/${vendor.slug}/book/${service.slug}`}
                                variant="light"
                              >
                                Book
                              </Button>
                            </Group>
                          </Stack>
                        </Paper>
                      ))}
                    </SimpleGrid>
                  ) : (
                    <Alert color="yellow" variant="light">
                      This vendor has not published bookable services yet.
                    </Alert>
                  )}
                </Stack>
                  
                <Paper className="vendor-profile-action" p="lg">
                  <Group gap="md" wrap="nowrap">
                    <ThemeIcon color="dark" radius="xl" size={46} variant="light">
                      <IconUserPlus size={23} />
                    </ThemeIcon>
                    <div>
                      <Text fw={900}>Customer profile reuse</Text>
                      <Text c="dimmed" size="sm">
                        Signed-in customers can reuse their contact details when joining queues and future booking flows.
                      </Text>
                    </div>
                  </Group>
                </Paper>
              </Stack>
            </Paper>
          </SimpleGrid>
        ) : null}
      </Container>

      <Modal
        centered
        fullScreen={isMobile}
        onClose={() => setContactOpen(false)}
        opened={contactOpen}
        radius={isMobile ? 0 : "xl"}
        size="lg"
        title={
          <Stack gap={2} className="contact-modal-title">
            <Text className="contact-form-eyebrow contact-modal-eyebrow">CONTACT VENDOR</Text>
            <Text className="contact-form-title">Send {vendor?.name || "the vendor"} a Message</Text>
          </Stack>
        }
        scrollAreaComponent={ScrollArea.Autosize}
        styles={{
          header: {
            alignItems: "flex-start",
            padding: "1.25rem 1.25rem 0.75rem"
          },
          title: {
            flex: 1,
            marginRight: "1rem",
            minWidth: 0
          },
          close: {
            marginTop: "0.1rem"
          }
        }}
        transitionProps={{ transition: "fade", duration: 200 }}
      >
        {vendor ? (
          <ContactForm
            scope="vendor"
            recipientName={vendor.name}
            intro="Use this form to ask about this vendor's services, booking details, or public profile."
          />
        ) : null}
      </Modal>
    </Stack>
  );
}
