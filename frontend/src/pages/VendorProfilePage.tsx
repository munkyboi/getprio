import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Divider,
  FloatingIndicator,
  Group,
  Modal,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Title
} from "@mantine/core";

import { useMediaQuery } from "@mantine/hooks";
import {
  IconArrowLeft,
  IconCalendar,
  IconClock,
  IconEye,
  IconMail,
  IconMapPin,
  IconPhone,
  IconPhoto,
  IconStar,
  IconTicket,
  IconUserPlus
} from "@tabler/icons-react";
import {  getDay } from "date-fns";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type {

  PublicVendorProfile,
  PublicVendorProfileResponse,
  PublicVendorService,
  QueueSnapshot
} from "@shared";
import { apiRequest } from "../api/client";
import ContactForm from "../components/ContactForm";

import { getErrorMessage } from "../utils/errors";
import { formatPhilippineMobileNumber } from "../utils/phones";
import { formatRatingCount } from "../utils/ratings";
import { getQueueStateSummary } from "../utils/queueStatus";
import { resolveVendorProfileMedia } from "../utils/vendorTheme";
import RichCampaignDescription from "../components/RichCampaignDescription";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type BookingOption = "standard";

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

function getBranchAddress(location: PublicVendorProfile["locations"][number]) {
  const parts = [location.addressLine1, location.addressLine2, location.city, location.province].filter(Boolean);
  return parts.length ? parts.join(", ") : location.country || "Philippines";
}

function formatHourRange(location: PublicVendorProfile["locations"][number], weekday: number) {
  const hours = location.hours.filter((entry) => entry.weekday === weekday && !entry.isClosed);

  if (!hours.length) {
    return "Closed";
  }

  return hours.map((hour) => {
    if (hour.opensAt === hour.closesAt) {
      return "Open 24 hours";
    }

    if (!hour.opensAt || !hour.closesAt) {
      return "Hours unavailable";
    }

    const overnightLabel = toMinutes(hour.closesAt) < toMinutes(hour.opensAt) ? " next day" : "";
    return `${formatTimeLabel(hour.opensAt)} - ${formatTimeLabel(hour.closesAt)}${overnightLabel}`;
  }).join(" · ");
}

function getBusinessCategoryLabel(category: string) {
  if (!category) {
    return "Generic Service Business";
  }

  return category;
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
  location,
  currentWeekday,
  selected,
  onSelect
}: {
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
            {location.isPrimary ? <Badge className="vendor-theme-badge vendor-theme-badge-primary" variant="light">Primary</Badge> : null}
            {selected ? <Badge className="vendor-theme-badge vendor-theme-badge-secondary" variant="light">Selected</Badge> : null}
          </Group>
        </Group>
        <div className="vendor-hours-card">
          <Group gap={6} mb={6}>
            <IconClock size={15} />
            <Text fw={800} size="xs">
              Operating hours
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
      </Stack>
    </Paper>
  );
}

export default function VendorProfilePage() {
  const { tenantSlug = "" } = useParams<{ tenantSlug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useMediaQuery("(max-width: 48em)");
  const [contactOpen, setContactOpen] = useState(false);
  const [, setBookingChoiceService] = useState<PublicVendorProfile["services"][number] | null>(null);
  const [imagePreviewService, setImagePreviewService] = useState<PublicVendorProfile["services"][number] | null>(null);
  const [selectedLocationSlug, setSelectedLocationSlug] = useState("");
  const [locationServices, setLocationServices] = useState<Array<PublicVendorProfile["services"][number] & { capacity: number }>>([]);
  const [servicesLoading, setServicesLoading] = useState(false);

  const [bookingOptionRoot, setBookingOptionRoot] = useState<HTMLDivElement | null>(null);
  const [bookingOptionControls, setBookingOptionControls] = useState<Record<BookingOption, HTMLButtonElement | null>>({
    standard: null
  });
  const bookingOptionsRef = useRef<HTMLDivElement | null>(null);
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
  const vendorRatingQuery = useQuery({
    queryKey: ["public-vendor-rating", tenantSlug],
    queryFn: () => apiRequest<{ rating: { average: number; count: number }; reviews: Array<{ id: string; stars: number; comment?: string; vendor_reply?: string; customer_display_name: string; created_at: string }> }>(`/public/vendors/${tenantSlug}/ratings`),
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
  const theme = resolveVendorProfileMedia(
    vendor?.publicBoardTheme?.theme,
    vendor?.businessProfileTheme?.theme
  );
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
        "--vendor-theme-pill-primary-bg": theme.buttonBackgroundColor,
        "--vendor-theme-pill-primary-text": theme.buttonTextColor,
        "--vendor-theme-pill-secondary-bg": theme.subheaderColor,
        "--vendor-theme-pill-secondary-text": theme.pageBackgroundColor,
        "--vendor-theme-pill-muted-bg": theme.bodyColor,
        "--vendor-theme-pill-muted-text": theme.pageBackgroundColor,
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
  const selectedBookingLocationSlug = selectedLocation?.slug || vendor?.location.slug || "";
  const profileSlug = vendor?.slug || tenantSlug;
  const selectedQueueStatusQuery = useQuery({
    queryKey: ["public-vendor-queue-status", profileSlug, selectedBookingLocationSlug],
    queryFn: () => apiRequest<QueueSnapshot>(
      `/public/tenant/${profileSlug}/location/${selectedBookingLocationSlug}/queue`
    ),
    enabled: Boolean(vendor?.capabilities.queue && profileSlug && selectedBookingLocationSlug)
  });
  const selectedQueueStatus = getQueueStateSummary(selectedQueueStatusQuery.data || null);
  const standardBookingTabPath = `/vendors/${profileSlug}`;

  const bookingOption: BookingOption = "standard";

  function buildServiceBookingPath(serviceSlug: string) {
    if (!vendor) {
      return "";
    }

    const params = new URLSearchParams();
    if (selectedBookingLocationSlug) {
      params.set("location", selectedBookingLocationSlug);
    }

    const query = params.toString();
    return `/vendors/${vendor.slug}/book/${serviceSlug}${query ? `?${query}` : ""}`;
  }

  function startServiceBooking(serviceSlug: string) {
    const path = buildServiceBookingPath(serviceSlug);
    if (path) {
      setBookingChoiceService(null);
      navigate(path);
    }
  }

  function handleServiceCardBooking(service: PublicVendorService) {

    startServiceBooking(service.slug);
  }

  function handleBookingOptionChange() {
    if (standardBookingTabPath !== location.pathname) {
      preserveScrollPosition(() => navigate(standardBookingTabPath, { preventScrollReset: true }));
    }
  }

  function preserveScrollPosition(action: () => void) {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    action();

    window.requestAnimationFrame(() => {
      window.scrollTo(scrollX, scrollY);
      window.requestAnimationFrame(() => window.scrollTo(scrollX, scrollY));
    });
  }

  function scrollToBookingOptions() {
    bookingOptionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    bookingOptionsRef.current?.focus({ preventScroll: true });
  }

  const setBookingOptionRootRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      setBookingOptionRoot(node);
    }
  }, []);

  const setStandardBookingOptionRef = useCallback((node: HTMLButtonElement | null) => {
    if (!node) {
      return;
    }

    setBookingOptionControls((current) =>
      current.standard === node ? current : { ...current, standard: node }
    );
  }, []);

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
    if (!vendor?.capabilities.booking || !selectedLocationSlug) {
      setLocationServices([]);
      setServicesLoading(false);
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

  const hasGroupFundedServices = false;

  function renderServiceSelectionList() {
    return (
      <Stack gap="lg">
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
                key={service.slug}
                onClick={() => handleServiceCardBooking(service)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleServiceCardBooking(service);
                  }
                }}
                p="md"
                role="button"
                tabIndex={0}
              >
                <Stack gap="sm">
                  <Group align="flex-start" justify="space-between" wrap="nowrap">
                    <div className="vendor-service-media">
                      {service.imageUrl ? (
                        <button
                          aria-label={`Preview ${service.name} image`}
                          className="vendor-service-media-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setImagePreviewService(service);
                          }}
                          onKeyDown={(event) => {
                            event.stopPropagation();
                          }}
                          type="button"
                        >
                          <img alt="" src={service.imageUrl} />
                          <span className="vendor-service-media-overlay" aria-hidden="true">
                            <IconEye size={22} />
                          </span>
                        </button>
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
                    <Group gap="xs">

                      <Button
                        onClick={(event) => {
                          event.stopPropagation();
                          startServiceBooking(service.slug);
                        }}
                        size="xs"
                        variant="light"
                      >
                        Book
                      </Button>
                    </Group>
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
    );
  }

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
            <Paper className="vendor-hero-shell ticket-page-hero vendor-profile-ticket-hero" p={{ base: "lg", md: "xl" }}>
              <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={{ base: "xl", lg: 48 }}>
                <Stack className="booking-detail-info-panel vendor-profile-ticket-info" gap="lg" justify="flex-start">
                  <div>
                    <Stack gap="sm">
                      <Title className="vendor-hero-title ticket-page-title" order={1}>
                        {vendor.name}
                      </Title>
                    </Stack>
                  </div>

                  {vendor.description ? <RichCampaignDescription className="vendor-hero-description" content={vendor.description} /> : null}

                  <Group gap="sm" wrap="wrap">
                    <Badge className="group-funded-hero-category-badge" size="lg" variant="light">
                      {getBusinessCategoryLabel(vendor.category)}
                    </Badge>
                    <Badge className="vendor-theme-badge vendor-theme-badge-secondary" size="lg" variant="light">
                      Public queue
                    </Badge>
                  </Group>

                  <Paper className="booking-detail-services-card vendor-profile-location-card" p="md">
                    <Stack gap="sm">
                      <Text className="finazze-section-label">Branches</Text>
                      <Stack className="vendor-profile-hero-branches" gap="xs">
                        {vendor.locations.map((branch) => {
                          const isSelected = branch.slug === selectedLocation?.slug;
                          return (
                            <button
                              aria-pressed={isSelected}
                              className="vendor-profile-hero-branch"
                              data-selected={isSelected}
                              key={branch.slug}
                              onClick={() => setSelectedLocationSlug(branch.slug)}
                              type="button"
                            >
                              <Group justify="space-between" gap="sm" wrap="nowrap">
                                <Group gap={8} wrap="nowrap">
                                  <IconMapPin className="booking-detail-meta-icon" size={18} />
                                  <Text fw={700}>{branch.name} · {getBranchLabel(branch)}</Text>
                                </Group>
                                <Badge color={branch.openStatus?.isOpen ? "teal" : "red"} size="sm" variant="light">
                                  {branch.openStatus?.isOpen ? "Open" : "Closed"}
                                </Badge>
                              </Group>
                              <Group c="dimmed" gap={8} mt={4} wrap="nowrap">
                                <IconClock className="booking-detail-meta-icon" size={16} />
                                <Text size="sm">{formatHourRange(branch, currentWeekday)}</Text>
                              </Group>
                            </button>
                          );
                        })}
                      </Stack>
                    </Stack>
                  </Paper>

                </Stack>

                <Paper className="booking-detail-visual-card vendor-profile-ticket-visual" style={themedMediaStyle}>
                  {theme?.logoUrl ? (
                    <div className="booking-detail-logo-frame">
                      <img alt={`${vendor.name} logo`} src={theme.logoUrl} />
                    </div>
                  ) : vendor.imageUrl ? (
                    <div className="booking-detail-logo-frame">
                      <img alt={`${vendor.name} logo`} src={vendor.imageUrl} />
                    </div>
                  ) : (
                    <div className="booking-detail-logo-frame booking-detail-logo-placeholder">
                      <IconTicket size={56} stroke={1.5} />
                    </div>
                  )}

                  <div className="booking-detail-visual-content">
                    <Stack align="center" gap={6}>
                      <Title className="booking-detail-ticket-number" order={2}>{vendor.name}</Title>
                      {vendorRatingQuery.data?.rating.count ? (
                        <Group aria-label={`${vendorRatingQuery.data.rating.count} vendor ratings`} gap={6}>
                          <IconStar color="#ffd000" fill="#ffd000" size={22}/>
                          <Text fw={900}>
                            {vendorRatingQuery.data.rating.average.toFixed(1)} ({formatRatingCount(vendorRatingQuery.data.rating.count)})
                          </Text>
                        </Group>
                      ) : (
                        <Group aria-label="Not yet rated" gap={6}>
                          <IconStar color="currentColor" fill="none" size={22}/>
                          <Text fw={700}>Not yet rated</Text>
                        </Group>
                      )}
                    </Stack>
                    <div className="booking-detail-visual-tile vendor-profile-branch-carousel-card">
                      <div aria-live="polite" className="vendor-profile-branch-carousel" role="status">
                        {selectedLocation ? (
                          <Group
                            className="vendor-profile-branch-carousel-slide is-active"
                            justify="space-between"
                            wrap="nowrap"
                          >
                            <Stack gap={0} miw={0} style={{ flex: "1 1 0" }}>
                              <Text fw={800} truncate="end">{selectedLocation.name}</Text>
                              <Text c="dimmed" size="sm" truncate="end">{getBranchAddress(selectedLocation)}</Text>
                            </Stack>
                            <Badge className="vendor-profile-branch-status" color={selectedLocation.openStatus?.isOpen ? "teal" : "red"} size="lg" variant="filled">
                              {selectedLocation.openStatus?.isOpen ? "Open" : "Closed"}
                            </Badge>
                          </Group>
                        ) : <Text c="dimmed" size="sm">No branch available</Text>}
                      </div>
                    </div>
                    <Stack className="booking-detail-visual-action vendor-profile-ticket-actions" gap="sm">
                      {vendor.capabilities.queue ? (
                        <Button
                          className="vendor-theme-button booking-detail-primary-action"
                          component={Link}
                          leftSection={<IconTicket size={18} />}
                          size="lg"
                          to={selectedBookingLocationSlug ? `/join/${vendor.slug}/${selectedBookingLocationSlug}` : `/join/${vendor.slug}`}
                        >
                          <span className="vendor-profile-join-queue-label">
                            <span>Join queue</span>
                            <Badge
                              className="vendor-profile-join-queue-status"
                              color={selectedQueueStatus.color}
                              radius="xl"
                              size="sm"
                              variant="white"
                            >
                              {selectedQueueStatus.label}
                            </Badge>
                          </span>
                        </Button>
                      ) : null}
                      {vendor.capabilities.booking ? (
                        <Button className="vendor-theme-button vendor-theme-button-ghost" onClick={scrollToBookingOptions} size="lg" variant="subtle">
                          Start booking
                        </Button>
                      ) : null}
                      <Button className="vendor-theme-button vendor-theme-button-ghost" onClick={() => setContactOpen(true)} size="lg" variant="subtle">
                        Contact vendor
                      </Button>
                    </Stack>
                  </div>
                </Paper>
              </SimpleGrid>
            </Paper>

            {vendorRatingQuery.data?.reviews.length ? <Paper p={{ base: "md", sm: "xl" }}><Stack gap="md"><Group justify="space-between"><Title order={2}>Customer reviews</Title><Group gap={6}><IconStar color="#ffd000" fill="#ffd000" size={20}/><Text fw={900}>{vendorRatingQuery.data.rating.average.toFixed(1)} ({formatRatingCount(vendorRatingQuery.data.rating.count)})</Text></Group></Group><SimpleGrid cols={{ base: 1, md: 2 }}>{vendorRatingQuery.data.reviews.map((review) => <Card key={review.id} p="md"><Stack gap="xs"><Group justify="space-between"><Text fw={700}>{review.customer_display_name}</Text><Group gap={4}><IconStar color="#ffd000" fill="#ffd000" size={16}/><Text fw={800}>{review.stars}.0</Text></Group></Group>{review.comment ? <Text>{review.comment}</Text> : null}{review.vendor_reply ? <Alert color="gray" title="Vendor reply">{review.vendor_reply}</Alert> : null}</Stack></Card>)}</SimpleGrid></Stack></Paper> : null}

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
                        />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </Stack>

            {vendor.capabilities.booking ? (
              <Paper className="vendor-info-panel vendor-booking-options-panel" p={{ base: "md", sm: "xl" }} ref={bookingOptionsRef} tabIndex={-1}>
              <Stack gap="lg">
                <div>
                  <Text className="prio-label">Booking options</Text>
                  <Title className="vendor-section-title" order={2}>
                    {hasGroupFundedServices ? "Choose how to book" : "Choose a service"}
                  </Title>
                </div>
                {hasGroupFundedServices ? (
                  <Tabs
                    className="vendor-booking-option-tabs"
                    keepMounted={false}
                    onChange={handleBookingOptionChange}
                    value={bookingOption}
                    variant="none"
                  >
                    <Group align="center" className="vendor-booking-option-toolbar" gap="md">
                      <Tabs.List className="vendor-booking-option-tabs-list" ref={setBookingOptionRootRef}>
                        <Tabs.Tab
                          className="vendor-booking-option-tab"
                          ref={setStandardBookingOptionRef}
                          value="standard"
                        >
                          <span className="vendor-booking-option-tab-content">
                            <IconCalendar aria-hidden size={19} />
                            <span>Standard</span>
                          </span>
                        </Tabs.Tab>

                        <FloatingIndicator
                          className="vendor-booking-option-indicator"
                          parent={bookingOptionRoot}
                          target={bookingOptionControls[bookingOption]}
                        />
                      </Tabs.List>

                    </Group>
                    <Divider className="vendor-booking-option-section-divider" />

                    <Tabs.Panel pt="lg" value="standard">
                      {renderServiceSelectionList()}
                    </Tabs.Panel>

                  </Tabs>
                ) : (
                  renderServiceSelectionList()
                )}
              </Stack>
              </Paper>
            ) : null}

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
                    className="vendor-contact-action customer-primary-action"
                    color="teal"
                    leftSection={<IconUserPlus size={18} />}
                    onClick={() => setContactOpen(true)}
                    size="lg"
                    variant="light"
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
                    {selectedLocation?.contactEmail || selectedLocation?.contactPhone ? (
                      <Stack gap="xs">
                        <Text className="prio-label">Location contact</Text>
                        {selectedLocation?.contactEmail ? (
                          <Button
                            className="vendor-contact-channel"
                            component="a"
                            href={`mailto:${selectedLocation.contactEmail}`}
                            justify="flex-start"
                            leftSection={<IconMail aria-hidden="true" size={18} />}
                            variant="subtle"
                          >
                            {selectedLocation.contactEmail}
                          </Button>
                        ) : null}
                        {selectedLocation?.contactPhone ? (
                          <Button
                            className="vendor-contact-channel"
                            component="a"
                            href={`tel:${selectedLocation.contactPhone}`}
                            justify="flex-start"
                            leftSection={<IconPhone aria-hidden="true" size={18} />}
                            variant="subtle"
                          >
                            {formatPhilippineMobileNumber(selectedLocation.contactPhone)}
                          </Button>
                        ) : null}
                      </Stack>
                    ) : (
                      <Text c="dimmed" size="sm">
                        Direct contact details are not available. Use the contact form to reach this vendor.
                      </Text>
                    )}
                  </Stack>
                </Paper>
              </SimpleGrid>
            </Paper>
          </Stack>
        ) : null}
      </Container>

      <Modal
        centered
        className="customer-modal contact-vendor-modal"
        transitionProps={{ transition: "slide-up", duration: 240, timingFunction: "ease-out" }}
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
      >
        {vendor ? (
          <ContactForm
            scope="vendor"
            recipientName={vendor.name}
            intro="Use this form to ask about this vendor's services, booking details, or public profile."
          />
        ) : null}
      </Modal>

      <Modal
        centered
        className="customer-modal"
        transitionProps={{ transition: "slide-up", duration: 240, timingFunction: "ease-out" }}
        fullScreen={isMobile}
        onClose={() => setImagePreviewService(null)}
        opened={Boolean(imagePreviewService?.imageUrl)}
        radius={isMobile ? 0 : "lg"}
        size="xl"
        title={
          <Stack gap={2}>
            <Text className="contact-form-eyebrow contact-modal-eyebrow">SERVICE IMAGE</Text>
            <Text className="contact-form-title">{imagePreviewService?.name || "Service image"}</Text>
          </Stack>
        }
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
      >
        {imagePreviewService?.imageUrl ? (
          <div className="service-image-preview-shell">
            <img alt={imagePreviewService.name} src={imagePreviewService.imageUrl} />
          </div>
        ) : null}
      </Modal>
    </Stack>
  );
}
