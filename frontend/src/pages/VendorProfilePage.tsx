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
import {
  IconArrowLeft,
  IconCalendar,
  IconClock,
  IconMapPin,
  IconPhoto,
  IconSparkles,
  IconTicket,
  IconUserPlus
} from "@tabler/icons-react";
import { getDay } from "date-fns";
import { Link, useParams } from "react-router-dom";
import QRCode from "react-qr-code";
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

function getLocationLabel(location: PublicVendorProfile["locations"][number] | PublicVendorProfile["location"]) {
  const parts = [location.name, location.city, location.province].filter(Boolean);
  return parts.length ? parts.join(", ") : location.country || "Philippines";
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

function getBusinessCategoryLabel(category: string) {
  if (!category) {
    return "Generic Service Business";
  }

  const labels: Record<string, string> = {
    "Health and Wellness": "Wellness & Self-care",
    "Food and Beverage": "Food & Beverage",
    "Retail and E-commerce": "Retail & E-commerce",
    "Sports and Recreation": "Sports & Recreation",
    "Generic Service Business": "Service Business"
  };

  return labels[category] || category;
}

function EmptyArtBox({ label }: { label: string }) {
  return (
    <div className="vendor-empty-art" aria-label={label} role="img">
      <span className="vendor-empty-art-corner vendor-empty-art-corner-top-left" />
      <span className="vendor-empty-art-corner vendor-empty-art-corner-top-right" />
      <span className="vendor-empty-art-corner vendor-empty-art-corner-bottom-left" />
      <span className="vendor-empty-art-corner vendor-empty-art-corner-bottom-right" />
      <IconPhoto size={42} stroke={1.5} />
      <Text c="dimmed" fw={700} mt="sm" size="sm">
        {label}
      </Text>
    </div>
  );
}

function LocationCardContent({
  vendorSlug,
  location,
  currentWeekday,
  selected,
  onSelect
}: {
  vendorSlug: string;
  location: PublicVendorProfile["locations"][number];
  currentWeekday: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Paper
      className="vendor-location-card"
      data-selected={selected ? "true" : undefined}
      onClick={onSelect}
      p="md"
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <div>
            <Text fw={800}>{location.name}</Text>
            <Text c="dimmed" size="sm">
              {getBranchLabel(location)}
            </Text>
          </div>
          <Group gap="xs" wrap="nowrap">
            {location.isPrimary ? <Badge color="orange" variant="light">Primary</Badge> : null}
            {selected ? <Badge color="teal" variant="light">Selected</Badge> : null}
          </Group>
        </Group>
        <div className="vendor-hours-card">
          <Group gap={6} mb={6}>
            <IconClock size={15} />
            <Text fw={800} size="xs">
              Store hours
            </Text>
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
        <Group>
          <Button
            color="orange"
            component={Link}
            size="sm"
            to={`/join/${vendorSlug}/${location.slug}`}
            variant="light"
          >
            Join this queue
          </Button>
          <Button color="dark" component={Link} size="sm" to={`/vendors/${vendorSlug}/book?location=${encodeURIComponent(location.slug)}`} variant="subtle">
            Book here
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

export default function VendorProfilePage() {
  const { tenantSlug = "" } = useParams<{ tenantSlug: string }>();
  const isMobile = useMediaQuery("(max-width: 48em)");
  const [contactOpen, setContactOpen] = useState(false);
  const [selectedLocationSlug, setSelectedLocationSlug] = useState("");
  const [locationServices, setLocationServices] = useState<Array<PublicVendorProfile["services"][number] & { capacity: number }>>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [heroMediaMode, setHeroMediaMode] = useState<"logo" | "qr">("logo");
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
  const locationLabel = useMemo(
    () => (selectedLocation ? getLocationLabel(selectedLocation) : vendor ? getLocationLabel(vendor.location) : ""),
    [selectedLocation, vendor]
  );
  const theme = vendor?.publicBoardTheme?.theme;
  const heroJoinUrl =
    vendor
      ? `${window.location.origin}/join/${vendor.slug}${selectedLocation?.slug ? `/${selectedLocation.slug}` : ""}`
      : "";
  const themeStyle: CSSProperties | undefined = theme
    ? {
        "--vendor-theme-page-bg": theme.pageBackgroundColor,
        "--vendor-theme-card-bg": theme.cardBackgroundColor,
        "--vendor-theme-card-alpha": String(theme.cardAlpha),
        "--vendor-theme-card-border": theme.cardBorderColor,
        "--vendor-theme-header": theme.headerColor,
        "--vendor-theme-subheader": theme.subheaderColor,
        "--vendor-theme-body": theme.bodyColor,
        "--vendor-theme-button-bg": theme.buttonBackgroundColor,
        "--vendor-theme-button-text": theme.buttonTextColor,
        "--vendor-theme-button-border": theme.buttonBorderColor,
        "--vendor-theme-button-border-width": theme.presetId === "sports" ? "0px" : "1px",
        "--vendor-theme-logo-bg": theme.cardBackgroundColor,
        ...(theme.pageBackgroundImageUrl
          ? {
              "--vendor-theme-page-image": `url(${theme.pageBackgroundImageUrl})`,
              "--vendor-theme-page-image-position": "center",
              "--vendor-theme-page-image-repeat": "no-repeat",
              "--vendor-theme-page-image-size": theme.pageBackgroundImageFit
            }
          : {})
      } as CSSProperties
    : undefined;
  const themedMediaStyle: CSSProperties | undefined = theme?.backgroundImageUrl
    ? {
        backgroundImage: `linear-gradient(rgba(255,255,255,0.08), rgba(255,255,255,0.08)), url(${theme.backgroundImageUrl})`,
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: theme.backgroundImageFit
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

  useEffect(() => {
    setHeroMediaMode("logo");

    if (!theme?.logoUrl && !heroJoinUrl) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setHeroMediaMode((current) => (current === "logo" ? "qr" : "logo"));
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [heroJoinUrl, theme?.logoUrl]);

  useEffect(() => {
    if (!vendor || !selectedLocationSlug) {
      setLocationServices([]);
      return;
    }

    const controller = new AbortController();
    setServicesLoading(true);

    apiRequest<{ services: Array<PublicVendorProfile["services"][number] & { capacity: number }> }>(
      `/public/vendors/${vendor.slug}/locations/${selectedLocationSlug}/services`,
      { signal: controller.signal }
    )
      .then((data) => {
        setLocationServices(data.services);
      })
      .catch((serviceError) => {
        if (!controller.signal.aborted) {
          setLocationServices([]);
          console.error(serviceError);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setServicesLoading(false);
        }
      });

    return () => controller.abort();
  }, [selectedLocationSlug, vendor]);

  return (
    <Stack className="vendor-profile-page" gap="xl" style={themeStyle}>
      <Container size="xl" w="100%">
        <Button
          color="dark"
          component={Link}
          leftSection={<IconArrowLeft size={18} />}
          mb="md"
          to="/vendors"
          variant="subtle"
        >
          Back to vendors
        </Button>

        {loading ? (
          <Paper className="vendor-empty-panel" p="xl">
            <Text c="dimmed" fw={700}>
              Loading vendor profile...
            </Text>
          </Paper>
        ) : null}

        {error ? <Alert color="red">{getErrorMessage(error)}</Alert> : null}

        {vendor ? (
          <Stack gap="xl">
            <Paper className="vendor-hero-shell" p={{ base: "lg", md: "xl" }}>
              <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={{ base: "xl", lg: 48 }}>
                <Stack gap="lg" justify="center">
                  <div>
                    <Group gap="sm" wrap="wrap">
                      <Badge className="vendor-theme-badge vendor-theme-badge-primary" size="lg" variant="light">
                        {getBusinessCategoryLabel(vendor.category)}
                      </Badge>
                    </Group>
                    <Stack gap={4} mt="md">
                      <Title className="vendor-hero-title" order={1}>
                        {vendor.name}
                      </Title>
                      <Text className="vendor-hero-subtitle" fw={700} size="lg">
                        {theme?.heroTitle || "Book ahead or join the public queue when same-day service is available."}
                      </Text>
                    </Stack>
                  </div>

                  <Text className="vendor-hero-description">
                    {theme?.heroSubtitle ||
                      vendor.description ||
                      "This vendor is preparing detailed service information. You can still continue to the public queue when same-day service is available."}
                  </Text>

                  <Stack gap="xs">
                    <Group c="dimmed" gap={8} wrap="nowrap">
                      <IconMapPin size={18} />
                      <Text>{locationLabel}</Text>
                    </Group>
                    {selectedLocation ? (
                      <Group c="dimmed" gap={8} wrap="nowrap">
                        <IconClock size={18} />
                        <Text>{formatHourRange(selectedLocation, currentWeekday)}</Text>
                      </Group>
                    ) : null}
                  </Stack>

                  <Group gap="md">
                    <Button
                      className="vendor-theme-button"
                      component={Link}
                      leftSection={<IconTicket size={18} />}
                      size="lg"
                      to={vendor.location.slug ? `/join/${vendor.slug}/${vendor.location.slug}` : `/join/${vendor.slug}`}
                    >
                      Join queue
                    </Button>
                    <Button
                      className="vendor-theme-button vendor-theme-button-outline"
                      component={Link}
                      size="lg"
                      to={`/vendors/${vendor.slug}/book?location=${encodeURIComponent(selectedLocation?.slug || vendor.location.slug || "")}`}
                      variant="outline"
                    >
                      Start booking
                    </Button>
                    <Button className="vendor-theme-button vendor-theme-button-ghost" onClick={() => setContactOpen(true)} size="lg" variant="subtle">
                      Contact vendor
                    </Button>
                  </Group>

                  <Group gap="lg" className="vendor-trust-row">
                    <Group gap={8} wrap="nowrap">
                      <ThemeIcon className="vendor-theme-icon" radius="xl" size={32} variant="light">
                        <IconSparkles size={16} />
                      </ThemeIcon>
                      <Text fw={700} size="sm">
                        Verified public profile
                      </Text>
                    </Group>
                    <Group gap={8} wrap="nowrap">
                      <ThemeIcon className="vendor-theme-icon" radius="xl" size={32} variant="light">
                        <IconClock size={16} />
                      </ThemeIcon>
                      <Text fw={700} size="sm">
                        Same-day queue
                      </Text>
                    </Group>
                    <Group gap={8} wrap="nowrap">
                      <ThemeIcon className="vendor-theme-icon" radius="xl" size={32} variant="light">
                        <IconCalendar size={16} />
                      </ThemeIcon>
                      <Text fw={700} size="sm">
                        Book ahead
                      </Text>
                    </Group>
                  </Group>
                </Stack>

                <Paper className="vendor-hero-visual" p="xl" style={themedMediaStyle}>
                  <div className="vendor-hero-media-shell">
                    <div className={`vendor-hero-media-slide vendor-hero-media-slide-logo ${heroMediaMode === "logo" ? "is-active" : ""}`}>
                      {theme?.logoUrl ? (
                        <div className="vendor-profile-logo-frame">
                          <img alt={`${vendor.name} logo`} src={theme.logoUrl} />
                        </div>
                      ) : vendor.imageUrl ? (
                        <img alt="" className="vendor-profile-image-content" src={vendor.imageUrl} />
                      ) : (
                        <EmptyArtBox label="Vendor image placeholder" />
                      )}
                    </div>

                    <div className={`vendor-hero-media-slide vendor-hero-media-slide-qr ${heroMediaMode === "qr" ? "is-active" : ""}`}>
                      <div className="vendor-hero-qr-panel">
                        <div className="vendor-hero-qr-code">
                          <QRCode aria-label="Join queue QR code" value={heroJoinUrl || window.location.href} />
                        </div>
                        <div className="vendor-hero-qr-copy">
                          <Text className="vendor-hero-qr-kicker">Scan to join</Text>
                          <Text className="vendor-hero-qr-title" fw={900}>
                            Queue QR
                          </Text>
                          <Text c="dimmed" size="sm">
                            Scan this code to join the public queue for the selected branch.
                          </Text>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Paper className="vendor-hero-status-card" p="lg">
                    <Text fw={800}>Public queue status</Text>
                    <Text c="dimmed" size="sm">
                      {selectedLocation ? `${selectedLocation.name} • ${formatHourRange(selectedLocation, currentWeekday)}` : "Choose a branch to continue."}
                    </Text>
                    <SimpleGrid cols={2} mt="md" spacing="sm">
                      <div className="prio-dashboard-tile">
                        <Text c="dimmed" size="xs">
                          Queue entry
                        </Text>
                        <Text className="prio-dashboard-number">Open</Text>
                      </div>
                      <div className="prio-dashboard-tile">
                        <Text c="dimmed" size="xs">
                          Booking
                        </Text>
                        <Text fw={800}>Available</Text>
                      </div>
                    </SimpleGrid>
                  </Paper>
                </Paper>
              </SimpleGrid>
            </Paper>

            <Stack gap="md">
              <div>
                <Text className="prio-label">Locations</Text>
                <Title className="vendor-section-title" order={2}>
                  Choose a branch
                </Title>
              </div>
              {isMobile ? (
                <Tabs
                  className="vendor-location-tabs"
                  keepMounted={false}
                  onChange={(value) => setSelectedLocationSlug(value || "")}
                  value={selectedLocation?.slug || null}
                  variant="pills"
                >
                  <Tabs.List className="vendor-location-tabs-list">
                    {vendor.locations.map((location) => (
                      <Tabs.Tab className="vendor-location-tab" key={location.slug} value={location.slug}>
                        {location.name}
                      </Tabs.Tab>
                    ))}
                  </Tabs.List>

                  {vendor.locations.map((location) => (
                    <Tabs.Panel key={location.slug} value={location.slug} pt="md">
                      <LocationCardContent
                        currentWeekday={currentWeekday}
                        location={location}
                        onSelect={() => setSelectedLocationSlug(location.slug)}
                        selected={location.slug === selectedLocation?.slug}
                        vendorSlug={vendor.slug}
                      />
                    </Tabs.Panel>
                  ))}
                </Tabs>
              ) : (
                <ScrollArea className="vendor-location-carousel" offsetScrollbars scrollbarSize={8} type="auto">
                  <div className="vendor-location-carousel-track">
                    {vendor.locations.map((location) => (
                      <div className="vendor-location-carousel-slide" key={location.slug}>
                        <LocationCardContent
                          currentWeekday={currentWeekday}
                          location={location}
                          onSelect={() => setSelectedLocationSlug(location.slug)}
                          selected={location.slug === selectedLocation?.slug}
                          vendorSlug={vendor.slug}
                        />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </Stack>

            <SimpleGrid cols={{ base: 1, lg: 1 }} spacing="xl">
              <Paper className="vendor-info-panel" p="xl">
                <Stack gap="lg">
                  <Title className="vendor-section-title" order={2}>
                    Select a service
                  </Title>
                  <Text c="dimmed" size="sm">
                    {selectedLocation
                      ? `These services are available at ${selectedLocation.name}.`
                      : "Select a branch to load the matching services."}
                  </Text>
                  {servicesLoading ? (
                    <Alert color="blue" variant="light">
                      Loading services for this branch...
                    </Alert>
                  ) : null}
                  {locationServices.length ? (
                    <Stack gap="md">
                      {locationServices.map((service) => (
                        <Paper
                          className="vendor-service-card"
                          component={Link}
                          key={service.slug}
                          p="md"
                          to={`/vendors/${vendor.slug}/book/${service.slug}?location=${encodeURIComponent(selectedLocation?.slug || vendor.location.slug || "")}`}
                        >
                          <Stack gap="sm">
                            <Group align="flex-start" justify="space-between" wrap="nowrap">
                              <div className="vendor-service-media">
                                {service.imageUrl ? (
                                  <img alt="" src={service.imageUrl} />
                                ) : (
                                  <EmptyArtBox label="Service image placeholder" />
                                )}
                              </div>
                              <div className="vendor-service-copy">
                                <Text className="vendor-service-title">{service.name}</Text>
                                <Text c="dimmed" size="sm">
                                  {service.description || "Service details available during booking."}
                                </Text>
                                <Group gap="xs" mt="xs" wrap="wrap">
                                  <Badge color="teal" variant="light">
                                    {service.durationMinutes} min
                                  </Badge>
                                  {service.allowBookingQuantity ? (
                                    <Badge color="blue" variant="light">
                                      {service.bookingQuantityLabel || "Units"}
                                    </Badge>
                                  ) : null}
                                  {service.manualPaymentRequired ? (
                                    <Badge color="yellow" variant="light">
                                      Manual payment
                                    </Badge>
                                  ) : null}
                                </Group>
                              </div>
                            </Group>
                            <Group justify="space-between" mt="xs">
                              <Text fw={800}>{service.priceDisplay || `PHP ${(service.priceAmountCents / 100).toLocaleString()}`}</Text>
                              <Button component={Link} size="xs" to={`/vendors/${vendor.slug}/book/${service.slug}?location=${encodeURIComponent(selectedLocation?.slug || vendor.location.slug || "")}`} variant="light">
                                Book
                              </Button>
                            </Group>
                          </Stack>
                        </Paper>
                      ))}
                    </Stack>
                  ) : (
                    <Alert color="yellow" variant="light">
                      {selectedLocation ? "This branch has no published services yet." : "This vendor has not published bookable services yet."}
                    </Alert>
                  )}
                </Stack>
              </Paper>
            </SimpleGrid>

            <Paper className="vendor-info-panel" p="xl">
              <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="xl">
                <Stack gap="md">
                  <Title className="vendor-section-title" order={2}>
                    Keep the conversation open
                  </Title>
                  <Text c="dimmed">
                    Use this form to ask about services, booking details, or public profile information.
                  </Text>
                  <Button
                    color="teal"
                    leftSection={<IconUserPlus size={18} />}
                    onClick={() => setContactOpen(true)}
                    variant="light"
                    w="fit-content"
                  >
                    Contact vendor
                  </Button>
                </Stack>
                <Paper className="vendor-contact-card" p="lg">
                  <Stack gap="sm">
                    <Text fw={800}>{selectedLocation?.name || vendor.location.name}</Text>
                    <Text c="dimmed" size="sm">
                      {locationLabel}
                    </Text>
                    <Divider my="xs" />
                    <Text size="sm">Address and channel details can be surfaced here.</Text>
                    <Text size="sm">This is the placeholder block for contact methods and expectations.</Text>
                  </Stack>
                </Paper>
              </SimpleGrid>
            </Paper>
          </Stack>
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
