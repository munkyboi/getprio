import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Container,
  Divider,
  FloatingIndicator,
  Group,
  Modal,
  Paper,
  Pagination,
  Progress,
  ScrollArea,
  SimpleGrid,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconArrowLeft,
  IconCalendar,
  IconClock,
  IconEye,
  IconFlag,
  IconInfoCircle,
  IconMapPin,
  IconPhoto,
  IconSparkles,
  IconTicket,
  IconUserPlus,
  IconUsers
} from "@tabler/icons-react";
import { getDay } from "date-fns";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import QRCode from "react-qr-code";
import type {
  GroupFundedCampaignSummary,
  GroupFundedCampaignsResponse,
  PublicVendorProfile,
  PublicVendorProfileResponse,
  PublicVendorService
} from "@shared";
import { apiRequest } from "../api/client";
import ContactForm from "../components/ContactForm";
import { getErrorMessage } from "../utils/errors";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const GROUP_FUNDED_PUBLIC_PAGE_SIZE = 10;
const GROUP_FUNDED_FILTER_STORAGE_KEY = "getprio:vendor-profile:group-funded-filters:v2";
type BookingOption = "standard" | "group-funded";
type GroupFundedCampaignFilters = {
  search: string;
  ongoing: boolean;
  dateRange: [Date | null, Date | null];
  page: number;
};

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

function formatPaymentAmount(amountCents: number, currency: string) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2
  }).format(amountCents / 100);
}

function getCampaignProgress(campaign: GroupFundedCampaignSummary) {
  if (!campaign.targetAmountCents) {
    return 0;
  }

  return Math.min(100, Math.round((campaign.fundedAmountCents / campaign.targetAmountCents) * 100));
}

function formatScheduleDateTime(value: string | Date) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
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

function parseDateParam(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parsePositivePage(value: string | null) {
  const page = Number(value || 1);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function parseStoredCampaignDate(value: unknown, fallback: Date | null) {
  if (value === "") {
    return null;
  }
  if (typeof value !== "string") {
    return fallback;
  }

  const date = parseDateParam(value);
  if (!date) {
    return fallback;
  }

  return date;
}

function getDefaultGroupFundedCampaignFilters(): GroupFundedCampaignFilters {
  return {
    search: "",
    ongoing: false,
    dateRange: [null, null],
    page: 1
  };
}

function readStoredGroupFundedCampaignFilters(defaultFilters: GroupFundedCampaignFilters): GroupFundedCampaignFilters {
  if (typeof window === "undefined") {
    return defaultFilters;
  }

  try {
    const rawFilters = window.localStorage.getItem(GROUP_FUNDED_FILTER_STORAGE_KEY);
    if (!rawFilters) {
      return defaultFilters;
    }

    const storedFilters = JSON.parse(rawFilters) as {
      search?: unknown;
      ongoing?: unknown;
      from?: unknown;
      to?: unknown;
      page?: unknown;
    };

    return {
      search: typeof storedFilters.search === "string" ? storedFilters.search : defaultFilters.search,
      ongoing: typeof storedFilters.ongoing === "boolean" ? storedFilters.ongoing : defaultFilters.ongoing,
      dateRange: [
        parseStoredCampaignDate(storedFilters.from, defaultFilters.dateRange[0]),
        parseStoredCampaignDate(storedFilters.to, defaultFilters.dateRange[1])
      ],
      page: parsePositivePage(typeof storedFilters.page === "number" ? String(storedFilters.page) : null)
    };
  } catch {
    return defaultFilters;
  }
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
  const [bookingChoiceService, setBookingChoiceService] = useState<PublicVendorProfile["services"][number] | null>(null);
  const [imagePreviewService, setImagePreviewService] = useState<PublicVendorProfile["services"][number] | null>(null);
  const [selectedLocationSlug, setSelectedLocationSlug] = useState("");
  const [locationServices, setLocationServices] = useState<Array<PublicVendorProfile["services"][number] & { capacity: number }>>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [publicCampaigns, setPublicCampaigns] = useState<GroupFundedCampaignSummary[]>([]);
  const [publicCampaignPagination, setPublicCampaignPagination] = useState<GroupFundedCampaignsResponse["pagination"] | null>(null);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [heroMediaMode, setHeroMediaMode] = useState<"logo" | "qr">("logo");
  const [bookingOptionRoot, setBookingOptionRoot] = useState<HTMLDivElement | null>(null);
  const [bookingOptionControls, setBookingOptionControls] = useState<Record<BookingOption, HTMLButtonElement | null>>({
    standard: null,
    "group-funded": null
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
  const standardBookingTabPath = `/vendors/${profileSlug}`;
  const groupFundedBookingTabPath = `/vendors/${profileSlug}/group-funded`;
  const bookingOption: BookingOption = location.pathname.endsWith("/group-funded") ? "group-funded" : "standard";
  const currentVendorPath = `${location.pathname}${location.search}${location.hash}`;
  const campaignMinDate = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }, []);
  const defaultCampaignFilters = useMemo(() => getDefaultGroupFundedCampaignFilters(), []);
  const [campaignFilters, setCampaignFilters] = useState<GroupFundedCampaignFilters>(() =>
    readStoredGroupFundedCampaignFilters(defaultCampaignFilters)
  );
  const campaignPage = campaignFilters.page;
  const campaignSearch = campaignFilters.search;
  const campaignOngoingOnly = campaignFilters.ongoing;
  const campaignDateRange = campaignFilters.dateRange;
  const campaignDateFrom = toLocalDateKey(campaignDateRange[0]);
  const campaignDateTo = toLocalDateKey(campaignDateRange[1]);
  const [campaignSearchDraft, setCampaignSearchDraft] = useState(campaignSearch);

  function buildServiceBookingPath(serviceSlug: string, mode: "standard" | "group-funded" = "standard") {
    if (!vendor) {
      return "";
    }

    const params = new URLSearchParams();
    if (selectedBookingLocationSlug) {
      params.set("location", selectedBookingLocationSlug);
    }
    if (mode === "group-funded") {
      params.set("mode", "group-funded");
    }

    const query = params.toString();
    return `/vendors/${vendor.slug}/book/${serviceSlug}${query ? `?${query}` : ""}`;
  }

  function startServiceBooking(serviceSlug: string, mode: "standard" | "group-funded") {
    const path = buildServiceBookingPath(serviceSlug, mode);
    if (path) {
      setBookingChoiceService(null);
      navigate(path);
    }
  }

  function handleServiceCardBooking(service: PublicVendorService) {
    if (service.groupFunded?.enabled) {
      setBookingChoiceService(service);
      return;
    }

    startServiceBooking(service.slug, "standard");
  }

  function handleBookingOptionChange(value: string | null) {
    const nextOption = value === "group-funded" ? "group-funded" : "standard";
    const nextPath = nextOption === "group-funded" ? groupFundedBookingTabPath : standardBookingTabPath;

    if (nextPath !== location.pathname) {
      preserveScrollPosition(() => navigate(nextPath, { preventScrollReset: true }));
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

  function updateCampaignFilters(updates: {
    search?: string;
    ongoing?: boolean;
    dateRange?: [Date | null, Date | null];
    page?: number;
  }) {
    setCampaignFilters((current) => ({
      search: (updates.search ?? current.search).trim(),
      ongoing: updates.ongoing ?? current.ongoing,
      dateRange: updates.dateRange ?? current.dateRange,
      page: updates.page ?? 1
    }));
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

  const setGroupFundedBookingOptionRef = useCallback((node: HTMLButtonElement | null) => {
    if (!node) {
      return;
    }

    setBookingOptionControls((current) =>
      current["group-funded"] === node ? current : { ...current, "group-funded": node }
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

  useEffect(() => {
    if (!vendor || !selectedLocationSlug) {
      setPublicCampaigns([]);
      setPublicCampaignPagination(null);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      page: String(campaignPage),
      pageSize: String(GROUP_FUNDED_PUBLIC_PAGE_SIZE)
    });

    if (campaignSearch.trim()) {
      params.set("search", campaignSearch.trim());
    }
    if (campaignDateFrom) {
      params.set("scheduledDateFrom", campaignDateFrom);
    }
    if (campaignDateTo) {
      params.set("scheduledDateTo", campaignDateTo);
    }
    if (campaignOngoingOnly) {
      params.set("ongoingOnly", "true");
    }

    setCampaignsLoading(true);
    apiRequest<GroupFundedCampaignsResponse>(
      `/public/vendors/${vendor.slug}/locations/${selectedLocationSlug}/group-funded-campaigns?${params.toString()}`,
      { signal: controller.signal }
    )
      .then((data) => {
        setPublicCampaigns(data.campaigns);
        setPublicCampaignPagination(data.pagination || null);
      })
      .catch((campaignError) => {
        if (!controller.signal.aborted) {
          setPublicCampaigns([]);
          setPublicCampaignPagination(null);
          console.error(campaignError);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setCampaignsLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    campaignDateFrom,
    campaignDateTo,
    campaignOngoingOnly,
    campaignPage,
    campaignSearch,
    selectedLocationSlug,
    vendor
  ]);

  const hasGroupFundedServices = locationServices.some((service) => service.groupFunded?.enabled);
  const firstGroupFundedService = locationServices.find((service) => service.groupFunded?.enabled) || null;
  const campaignFiltersChanged = Boolean(
    campaignSearch ||
    !campaignOngoingOnly ||
    campaignDateFrom ||
    campaignDateTo
  );

  useEffect(() => {
    setCampaignSearchDraft(campaignSearch);
  }, [campaignSearch]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        GROUP_FUNDED_FILTER_STORAGE_KEY,
        JSON.stringify({
          search: campaignSearch,
          ongoing: campaignOngoingOnly,
          from: campaignDateFrom,
          to: campaignDateTo,
          page: campaignPage
        })
      );
    } catch {
      // Persistence is a convenience; filtering should continue if storage is unavailable.
    }
  }, [campaignDateFrom, campaignDateTo, campaignOngoingOnly, campaignPage, campaignSearch]);

  useEffect(() => {
    if (bookingOption !== "group-funded" || campaignSearchDraft === campaignSearch) {
      return;
    }

    const timeout = window.setTimeout(() => {
      updateCampaignFilters({ search: campaignSearchDraft });
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [bookingOption, campaignSearch, campaignSearchDraft]);

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
                      {service.groupFunded?.enabled ? (
                        <Button
                          onClick={(event) => {
                            event.stopPropagation();
                            startServiceBooking(service.slug, "group-funded");
                          }}
                          size="xs"
                          variant="subtle"
                        >
                          Start group-funded
                        </Button>
                      ) : null}
                      <Button
                        onClick={(event) => {
                          event.stopPropagation();
                          startServiceBooking(service.slug, "standard");
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
            <Paper className="vendor-hero-shell" p={{ base: "lg", md: "xl" }}>
              <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={{ base: "xl", lg: 48 }}>
                <Stack gap="lg" justify="center">
                  <div>
                    <Group gap="sm" wrap="wrap">
                      <Badge className="vendor-theme-badge vendor-theme-badge-primary" size="lg" variant="light">
                        {getBusinessCategoryLabel(vendor.category)}
                      </Badge>
                    </Group>
                    <Stack gap="sm" mt="md">
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

                  <Group className="customer-action-row" gap="md">
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
                      onClick={scrollToBookingOptions}
                      size="lg"
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
                        <Tabs.Tab
                          className="vendor-booking-option-tab"
                          ref={setGroupFundedBookingOptionRef}
                          value="group-funded"
                        >
                          <span className="vendor-booking-option-tab-content">
                            <IconUsers aria-hidden size={19} />
                            <span>Group-funded</span>
                          </span>
                        </Tabs.Tab>
                        <FloatingIndicator
                          className="vendor-booking-option-indicator"
                          parent={bookingOptionRoot}
                          target={bookingOptionControls[bookingOption]}
                        />
                      </Tabs.List>
                      {bookingOption === "group-funded" ? (
                        <Button
                          className="vendor-create-campaign-button"
                          disabled={!firstGroupFundedService}
                          leftSection={<IconUsers size={18} />}
                          onClick={() => {
                            if (firstGroupFundedService) {
                              startServiceBooking(firstGroupFundedService.slug, "group-funded");
                            }
                          }}
                        >
                          Create a new campaign
                        </Button>
                      ) : null}
                    </Group>
                    <Divider className="vendor-booking-option-section-divider" />

                    <Tabs.Panel pt="lg" value="standard">
                      {renderServiceSelectionList()}
                    </Tabs.Panel>

                    <Tabs.Panel pt="lg" value="group-funded">
                      <Stack gap="lg">
                        {campaignsLoading ? (
                          <Alert color="blue" variant="light">
                            Loading public group-funded campaigns...
                          </Alert>
                        ) : null}
                        <Stack className="vendor-campaign-filter-stack" gap="sm">
                          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
                          <TextInput
                            label="Search"
                            onChange={(event) => setCampaignSearchDraft(event.target.value)}
                            placeholder="Title, service, organizer"
                            value={campaignSearchDraft}
                          />
                          <DatePickerInput
                            clearable
                            label="Booking date"
                            leftSection={<IconCalendar size={16} />}
                            minDate={campaignMinDate}
                            onChange={(value) => updateCampaignFilters({ dateRange: value as [Date | null, Date | null] })}
                            placeholder="Select date range"
                            type="range"
                            value={campaignDateRange}
                          />
                          </SimpleGrid>
                          <Group className="vendor-campaign-filter-actions" gap="sm" justify="space-between">
                          {campaignFiltersChanged ? (
                            <Button
                              className="neura-secondary-button"
                              onClick={() => {
                                setCampaignSearchDraft("");
                                updateCampaignFilters({
                                    search: "",
                                    ongoing: false,
                                    dateRange: [null, null]
                                  });
                              }}
                            >
                              Reset filters
                            </Button>
                          ) : <span />}
                          <Group className="vendor-campaign-ongoing-toggle" gap={6} wrap="nowrap">
                            <Switch
                              checked={campaignOngoingOnly}
                              label="Show only on-going campaigns"
                              onChange={(event) => updateCampaignFilters({ ongoing: event.currentTarget.checked })}
                            />
                            <Tooltip
                              label="Only shows public campaigns that are still funding, funded, in vendor review, or waiting for replacement-slot action."
                              multiline
                              w={280}
                              withArrow
                            >
                              <ActionIcon
                                aria-label="Show only on-going campaigns info"
                                color="gray"
                                size="xs"
                                variant="transparent"
                              >
                                <IconInfoCircle size={16} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                          </Group>
                        </Stack>
                        <Divider className="vendor-booking-option-section-divider" />
                        {publicCampaigns.length ? (
                          <>
                            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                              {publicCampaigns.map((campaign) => {
                                const campaignPath = `/group-funded/${campaign.publicToken}`;
                                const campaignTitle = campaign.campaignTitle || campaign.serviceName;
                                const campaignBundleItems = campaign.bundleItems?.length
                                  ? campaign.bundleItems
                                  : [{
                                      serviceName: campaign.serviceName,
                                      bookingQuantity: campaign.bookingQuantity,
                                      priceAmountCents: campaign.targetAmountCents,
                                      currency: campaign.currency
                                    }];
                                const isServiceBundle = campaignBundleItems.length > 1;

                                return (
                                  <Paper
                                    className="vendor-service-card"
                                    key={campaign.publicToken}
                                    onClick={() => navigate(campaignPath, { state: { from: currentVendorPath } })}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        navigate(campaignPath, { state: { from: currentVendorPath } });
                                      }
                                    }}
                                    p="md"
                                    role="button"
                                    style={{ cursor: "pointer" }}
                                    tabIndex={0}
                                  >
                                    <Stack gap="sm">
                                      <Group align="flex-start" justify="space-between" wrap="nowrap">
                                        <Stack className="vendor-group-funded-card-copy" gap={4}>
                                          <Text className="vendor-service-title vendor-group-funded-card-title">
                                            {campaignTitle}
                                          </Text>
                                          {campaign.description ? (
                                            <Text className="vendor-group-funded-card-description">
                                              {campaign.description}
                                            </Text>
                                          ) : null}
                                          <Group className="vendor-group-funded-card-service-meta" gap="xs" wrap="wrap">
                                            <Badge color={isServiceBundle ? "teal" : "gray"} variant="light">
                                              {isServiceBundle ? "Service bundle" : "Single service"}
                                            </Badge>
                                            <Text c="dimmed" size="sm">
                                              {campaign.locationName} · {formatScheduleDateTime(campaign.scheduledStartAt)}
                                            </Text>
                                          </Group>
                                        </Stack>
                                        <Badge className="vendor-group-funded-card-status" color="teal" variant="light">
                                          {campaign.campaignStatus.replace(/_/g, " ")}
                                        </Badge>
                                      </Group>
                                      <div className={isServiceBundle ? "vendor-group-funded-card-bundle" : "vendor-group-funded-card-single"}>
                                        {campaignBundleItems.map((item) => (
                                          <div className="vendor-group-funded-card-bundle-item" key={`${item.serviceName}-${item.bookingQuantity}-${item.priceAmountCents}`}>
                                            <Text fw={800} size="sm">
                                              {item.serviceName}
                                            </Text>
                                            <Text c="dimmed" size="xs">
                                              {item.bookingQuantity}x · {formatPaymentAmount(item.priceAmountCents, item.currency)}
                                            </Text>
                                          </div>
                                        ))}
                                      </div>
                                      <Progress value={getCampaignProgress(campaign)} color="teal" />
                                      <Group gap="xs" wrap="wrap">
                                        <Badge leftSection={<IconUsers size={12} />} variant="light">
                                          {campaign.paidParticipantCount}/{campaign.requiredContributors}
                                        </Badge>
                                        <Badge leftSection={<IconFlag size={12} />} color="yellow" variant="light">
                                          {formatPaymentAmount(campaign.requiredContributionAmountCents, campaign.currency)} each
                                        </Badge>
                                        <Badge color="gray" variant="light">
                                          Organized by {campaign.organizerDisplayName}
                                        </Badge>
                                      </Group>
                                      <Group className="vendor-group-funded-card-footer" justify="space-between">
                                        <Text c="dimmed" size="sm">
                                          Deadline {formatScheduleDateTime(campaign.fundingDeadlineAt)}
                                        </Text>
                                        <Button
                                          component={Link}
                                          onClick={(event) => event.stopPropagation()}
                                          size="xs"
                                          state={{ from: currentVendorPath }}
                                          to={campaignPath}
                                          variant="light"
                                        >
                                          View campaign
                                        </Button>
                                      </Group>
                                    </Stack>
                                  </Paper>
                                );
                              })}
                            </SimpleGrid>
                            {publicCampaignPagination && publicCampaignPagination.totalItems > 0 ? (
                              <Group align="center" justify="space-between">
                                <Text c="dimmed" size="sm">
                                  Showing {(publicCampaignPagination.page - 1) * publicCampaignPagination.pageSize + 1}-
                                  {Math.min(
                                    publicCampaignPagination.page * publicCampaignPagination.pageSize,
                                    publicCampaignPagination.totalItems
                                  )} of {publicCampaignPagination.totalItems}
                                </Text>
                                {publicCampaignPagination.totalPages > 1 ? (
                                  <Pagination
                                    onChange={(page) => updateCampaignFilters({ page })}
                                    total={publicCampaignPagination.totalPages}
                                    value={campaignPage}
                                  />
                                ) : null}
                              </Group>
                            ) : null}
                          </>
                        ) : campaignFiltersChanged ? (
                            <Paper withBorder radius="md" p="lg">
                              <Text c="dimmed">No group-funded campaigns match the current filters.</Text>
                            </Paper>
                        ) : (
                          <Paper withBorder radius="md" p="lg">
                            <Stack gap="sm">
                              <Badge color="orange" variant="light" w="fit-content">
                                Be the organizer
                              </Badge>
                              <Title order={3}>Start your group-funded campaign</Title>
                              <Text c="dimmed">
                                No public campaigns are open for this branch yet. Pick a schedule, share the private link,
                                and let contributors help fund the booking before vendor review.
                              </Text>
                              {firstGroupFundedService ? (
                                <Button
                                  className="vendor-create-campaign-button customer-primary-action"
                                  color="orange"
                                  leftSection={<IconUsers size={16} />}
                                  onClick={() => startServiceBooking(firstGroupFundedService.slug, "group-funded")}
                                  size="md"
                                >
                                  Create your campaign now
                                </Button>
                              ) : null}
                            </Stack>
                          </Paper>
                        )}
                      </Stack>
                    </Tabs.Panel>
                  </Tabs>
                ) : (
                  renderServiceSelectionList()
                )}
              </Stack>
            </Paper>

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
        className="customer-modal contact-vendor-modal"
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

      <Modal
        centered
        className="customer-modal booking-choice-modal"
        fullScreen={false}
        onClose={() => setBookingChoiceService(null)}
        opened={Boolean(bookingChoiceService)}
        radius="lg"
        size="min(92vw, 440px)"
        title={
          <Stack gap={2}>
            <Text className="contact-form-eyebrow contact-modal-eyebrow">BOOKING OPTIONS</Text>
            <Text className="contact-form-title">{bookingChoiceService?.name || "Choose how to book"}</Text>
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
        {bookingChoiceService ? (
          <Stack gap="md">
            <Text c="dimmed" size="sm">
              Choose whether to book this service now or start a campaign so contributors can help fund it.
            </Text>
            <Stack className="customer-modal-actions" gap="sm">
              <Button
                color="dark"
                fullWidth
                justify="center"
                leftSection={<IconCalendar size={18} />}
                onClick={() => startServiceBooking(bookingChoiceService.slug, "standard")}
                size="lg"
                variant="light"
              >
                Standard booking
              </Button>
              <Button
                color="orange"
                disabled={!bookingChoiceService.groupFunded?.enabled}
                fullWidth
                justify="center"
                leftSection={<IconUsers size={18} />}
                onClick={() => startServiceBooking(bookingChoiceService.slug, "group-funded")}
                size="lg"
              >
                Start group-funded campaign
              </Button>
            </Stack>
            {!bookingChoiceService.groupFunded?.enabled ? (
              <Alert color="yellow" variant="light">
                Group-funded booking is not enabled for this service at the selected branch.
              </Alert>
            ) : null}
          </Stack>
        ) : null}
      </Modal>

      <Modal
        centered
        className="customer-modal"
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
