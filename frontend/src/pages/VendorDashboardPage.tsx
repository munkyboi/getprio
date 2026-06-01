import { useEffect, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  ColorInput,
  Divider,
  Drawer,
  FileInput,
  Burger,
  Group,
  LoadingOverlay,
  Modal,
  MultiSelect,
  NumberInput,
  Pagination,
  Paper,
  PasswordInput,
  ScrollArea,
  Select,
  SegmentedControl,
  SimpleGrid,
  Slider,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip
} from "@mantine/core";
import {
  IconChartBar,
  IconChevronRight,
  IconClipboardList,
  IconCheck,
  IconHistory,
  IconHomeStats,
  IconInfoCircle,
  IconTrash,
  IconLogout,
  IconQrcode,
  IconSettings,
  IconUserCog,
  IconUsersGroup
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import QRCode from "react-qr-code";
import { Navigate, NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import type {
  BillingOverviewResponse,
  CheckoutSessionResponse,
  CheckoutSyncResponse,
  CloseQueueDayResponse,
  CounterSlugAvailabilityResponse,
  CreateCheckoutRequest,
  CreateWalkInTicketRequest,
  LocationSlugAvailabilityResponse,
  QueueHistoryTicket,
  QueueOverflowResponse,
  QueueOverflowTicket,
  ReopenQueueDayResponse,
  PublicBoardThemeResponse,
  PublicBoardThemeSettings,
  PublicBoardThemeUploadRequest,
  PublicBoardThemeUploadResponse,
  SavePublicBoardThemeRequest,
  QueueSnapshot,
  StoreHourSummary,
  StoreLocationWithHours,
  StoreLocationsResponse,
  ServiceCountersResponse,
  ServiceCounterSummary,
  SaveServiceCounterRequest,
  VendorStaffResponse,
  VendorStaffSummary,
  VendorStaffInvitationSummary,
  AddVendorStaffRequest,
  AddVendorStaffResponse,
  UpdateVendorStaffRequest,
  UpdateVendorStaffResponse,
  UpdateVendorStaffAccessRequest,
  UpdateVendorStaffAccessResponse,
  HistoryExportRange,
  SubscriptionPlanSlug,
  TicketMutationResponse,
  UpdateAccountPasswordRequest,
  UpdateAccountProfileRequest,
  UpdateAccountProfileResponse,
  UpdateTenantSettingsRequest,
  VendorClientsResponse
} from "@shared";
import { API_BASE_URL, apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { buildJoinUrl, buildMonitorUrl } from "../queuePaths";
import { getErrorMessage } from "../utils/errors";

const dashboardSections = new Set([
  "queue",
  "tenants",
  "staff",
  "clients",
  "history",
  "reports",
  "settings",
  "account"
]);
const SERVICE_TREND_USER_LIMIT = 30;
const TABLE_SEARCH_DEBOUNCE_MS = 350;

const emptyWalkIn: CreateWalkInTicketRequest = {
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  notifyByEmail: false,
  notifyBySms: false,
  notes: ""
};

const defaultSettings: UpdateTenantSettingsRequest = {
  queuePrefix: "P",
  averageServiceMinutes: 5,
  notificationThreshold: 2,
  contactEmail: "",
  contactPhone: ""
};

const defaultHours: StoreHourSummary[] = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  opensAt: "09:00",
  closesAt: "17:00",
  isClosed: true
}));

function toSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const emptyLocationForm = {
  name: "",
  slug: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  province: "",
  postalCode: "",
  country: "Philippines",
  contactEmail: "",
  contactPhone: "",
  timezone: "Asia/Manila",
  isPrimary: false,
  isActive: true,
  hours: defaultHours
};

const publicBoardThemePresets: Record<string, PublicBoardThemeSettings> = {
  classic: {
    presetId: "classic",
    heroTitle: "",
    heroSubtitle: "",
    logoUrl: "",
    backgroundImageUrl: "",
    pageBackgroundColor: "#f8efe3",
    cardBackgroundColor: "#fffaf4",
    cardAlpha: 0.9,
    cardBorderSize: 1,
    cardBorderRadius: 28,
    cardBorderColor: "#eadccf",
    headerColor: "#24160f",
    subheaderColor: "#8a5c39",
    bodyColor: "#3f3027",
    buttonBackgroundColor: "#ea6a1f",
    buttonTextColor: "#ffffff",
    buttonBorderColor: "#ea6a1f"
  },
  neura: {
    presetId: "neura",
    heroTitle: "",
    heroSubtitle: "",
    logoUrl: "",
    backgroundImageUrl: "",
    pageBackgroundColor: "#eef1f5",
    cardBackgroundColor: "#ffffff",
    cardAlpha: 0.86,
    cardBorderSize: 1,
    cardBorderRadius: 20,
    cardBorderColor: "#dbe3ed",
    headerColor: "#11151c",
    subheaderColor: "#64748b",
    bodyColor: "#263241",
    buttonBackgroundColor: "#11151c",
    buttonTextColor: "#ffffff",
    buttonBorderColor: "#11151c"
  },
  clinic: {
    presetId: "clinic",
    heroTitle: "",
    heroSubtitle: "",
    logoUrl: "",
    backgroundImageUrl: "",
    pageBackgroundColor: "#eef8f6",
    cardBackgroundColor: "#ffffff",
    cardAlpha: 0.92,
    cardBorderSize: 1,
    cardBorderRadius: 24,
    cardBorderColor: "#c9e1dd",
    headerColor: "#14342f",
    subheaderColor: "#24756b",
    bodyColor: "#28423d",
    buttonBackgroundColor: "#0f766e",
    buttonTextColor: "#ffffff",
    buttonBorderColor: "#0f766e"
  }
};

const defaultPublicBoardTheme = publicBoardThemePresets.classic;

type DashboardSection =
  | "queue"
  | "tenants"
  | "staff"
  | "clients"
  | "history"
  | "reports"
  | "settings"
  | "account";
type DashboardActionResponse = Partial<TicketMutationResponse> & {
  message?: string;
  snapshot?: QueueSnapshot;
};
type SortDirection = "asc" | "desc";
type SortState = { key: string; direction: SortDirection };
type VendorHistoryResponse = {
  historyDays?: number;
  historyLabel?: string;
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  tickets: QueueHistoryTicket[];
};
type ConfirmAction = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
};

const navItems = [
  { section: "queue", label: "Queue", icon: IconClipboardList },
  { section: "tenants", label: "Locations", icon: IconHomeStats },
  { section: "staff", label: "Staff", icon: IconUsersGroup },
  { section: "clients", label: "Clients", icon: IconUsersGroup },
  { section: "history", label: "History", icon: IconHistory },
  { section: "reports", label: "Reports", icon: IconChartBar },
  { section: "settings", label: "Settings", icon: IconSettings },
  { section: "account", label: "Account", icon: IconUserCog }
] as const;
const staffAllowedSections = new Set<DashboardSection>(["queue", "clients", "history", "account"]);
const adminAllowedSections = new Set<DashboardSection>([
  "queue",
  "tenants",
  "staff",
  "clients",
  "history",
  "reports",
  "settings",
  "account"
]);

function getHistoryTimestamp(value: string | Date): number {
  return new Date(value).getTime();
}

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "--" : date.toLocaleString();
}

function formatHistoryDateTime(value: string | Date | null | undefined): string {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  const day = new Intl.DateTimeFormat(undefined, { day: "numeric" }).format(date);
  const month = new Intl.DateTimeFormat(undefined, { month: "long" }).format(date);
  const year = new Intl.DateTimeFormat(undefined, { year: "numeric" }).format(date);
  const timePart = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  })
    .format(date)
    .toLowerCase();

  return `${day} ${month} ${year} ${timePart}`;
}

function formatRelativeDateTime(value: string | Date | null | undefined): string {
  if (!value) {
    return "--";
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return "--";
  }

  const diffSeconds = Math.round((timestamp - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(diffSeconds);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
    ["second", 1]
  ];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const [unit, secondsPerUnit] =
    units.find(([, seconds]) => absoluteSeconds >= seconds) || units[units.length - 1];

  return formatter.format(Math.round(diffSeconds / secondsPerUnit), unit);
}

function renderRelativeDateTime(value: string | Date | null | undefined) {
  const fullDateTime = formatDateTime(value);
  const relativeDateTime = formatRelativeDateTime(value);

  if (fullDateTime === "--") {
    return "--";
  }

  return (
    <Tooltip label={fullDateTime} withArrow>
      <Text component="span" size="sm">
        {relativeDateTime}
      </Text>
    </Tooltip>
  );
}

function formatDate(value: string | Date | null): string {
  return value ? new Date(value).toLocaleDateString() : "";
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [delayMs, value]);

  return debouncedValue;
}

function formatDateKey(value: string | null | undefined): string {
  if (!value || !/^\d{8}$/.test(value)) {
    return "--";
  }

  const date = new Date(Date.UTC(
    Number(value.slice(0, 4)),
    Number(value.slice(4, 6)) - 1,
    Number(value.slice(6, 8))
  ));
  const day = new Intl.DateTimeFormat(undefined, { day: "numeric", timeZone: "UTC" }).format(date);
  const month = new Intl.DateTimeFormat(undefined, { month: "long", timeZone: "UTC" }).format(date);
  const year = new Intl.DateTimeFormat(undefined, { year: "numeric", timeZone: "UTC" }).format(date);

  return `${day} ${month} ${year}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#ffffff";
  const value = normalized.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${Math.min(1, Math.max(0, alpha))})`;
}

function mergeTheme(theme?: Partial<PublicBoardThemeSettings>): PublicBoardThemeSettings {
  return {
    ...defaultPublicBoardTheme,
    ...(theme || {})
  };
}

function MetricCard({
  label,
  value,
  detail,
  tone = "light"
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: "light" | "dark";
}) {
  return (
    <Card className={tone === "dark" ? "neura-card neura-card-dark" : "neura-card"} padding="lg">
      <Stack gap={18}>
        <Text className="neura-label">{label}</Text>
        <Title order={2}>{value}</Title>
        <Text className="neura-muted">{detail}</Text>
      </Stack>
    </Card>
  );
}

function ActivationPanel({ onViewPlans }: { onViewPlans: () => void }) {
  return (
    <Card className="neura-card neura-activation-card" padding="xl">
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
        <Stack gap="md" justify="center">
          <Badge className="neura-soft-badge">Subscription required</Badge>
          <Title order={2}>Choose a plan to unlock this workspace.</Title>
          <Text c="dimmed" maw={620}>
            Queue operations, public links, client data, history, and reports become available after
            the selected tenant has an active plan.
          </Text>
          <Button className="neura-primary-button" onClick={onViewPlans} w="fit-content">
            View plans
          </Button>
        </Stack>
        <img
          alt=""
          className="neura-activation-art"
          src="/illustrations/generated/vendor-onboarding.png"
        />
      </SimpleGrid>
    </Card>
  );
}

function DashboardEmptyState({
  title,
  text
}: {
  title: string;
  text: string;
}) {
  return (
    <Stack className="neura-empty-state" gap="sm">
      <img alt="" className="neura-empty-art" src="/illustrations/generated/dashboard-empty.png" />
      <Text fw={800}>{title}</Text>
      <Text className="neura-muted">{text}</Text>
    </Stack>
  );
}

export default function VendorDashboardPage() {
  const { token, user, loading, logout, refreshUser } = useAuth();
  const { section } = useParams<{ section: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const currentSection = (
    section && dashboardSections.has(section) ? section : "queue"
  ) as DashboardSection;
  const invalidSection = Boolean(section && !dashboardSections.has(section));
  const [selectedTenantSlug, setSelectedTenantSlug] = useState("");
  const [selectedLocationSlug, setSelectedLocationSlug] = useState("");
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);
  const [queueView, setQueueView] = useState<"live" | "overflow">("live");
  const [overflow, setOverflow] = useState<QueueOverflowResponse | null>(null);
  const [locations, setLocations] = useState<StoreLocationWithHours[]>([]);
  const [serviceCounters, setServiceCounters] = useState<ServiceCounterSummary[]>([]);
  const [staff, setStaff] = useState<VendorStaffSummary[]>([]);
  const [pendingStaffInvites, setPendingStaffInvites] = useState<VendorStaffInvitationSummary[]>([]);
  const [staffSeatLimit, setStaffSeatLimit] = useState(0);
  const [counterLimit, setCounterLimit] = useState(0);
  const [activeLocationLimit, setActiveLocationLimit] = useState(1);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [editingLocationSlug, setEditingLocationSlug] = useState("");
  const [locationForm, setLocationForm] = useState(emptyLocationForm);
  const [locationSlugEdited, setLocationSlugEdited] = useState(false);
  const [locationSlugStatus, setLocationSlugStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "error"
  >("idle");
  const [settings, setSettings] = useState<UpdateTenantSettingsRequest>(defaultSettings);
  const [walkInForm, setWalkInForm] = useState<CreateWalkInTicketRequest>(emptyWalkIn);
  const [billing, setBilling] = useState<BillingOverviewResponse | null>(null);
  const [history, setHistory] = useState<VendorHistoryResponse | null>(null);
  const [clients, setClients] = useState<VendorClientsResponse | null>(null);
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);
  const [themeLocation, setThemeLocation] = useState<StoreLocationWithHours | null>(null);
  const [themeForm, setThemeForm] = useState<PublicBoardThemeSettings>(defaultPublicBoardTheme);
  const [applyThemeToAllLocations, setApplyThemeToAllLocations] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "annual">("monthly");
  const [selectedCounterSlug, setSelectedCounterSlug] = useState("");
  const [counterDialogOpen, setCounterDialogOpen] = useState(false);
  const [editingCounterSlug, setEditingCounterSlug] = useState("");
  const [counterForm, setCounterForm] = useState<SaveServiceCounterRequest>({
    name: "",
    slug: "",
    isActive: true,
    assignedUserIds: []
  });
  const [counterSlugEdited, setCounterSlugEdited] = useState(false);
  const [counterSlugStatus, setCounterSlugStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "error"
  >("idle");
  const [staffDialogOpen, setStaffDialogOpen] = useState(false);
  const [staffForm, setStaffForm] = useState<AddVendorStaffRequest>({
    email: "",
    role: "staff"
  });
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [accountProfileForm, setAccountProfileForm] = useState<UpdateAccountProfileRequest>({
    name: "",
    email: "",
    phone: ""
  });
  const [accountPasswordForm, setAccountPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [historyExportFormat, setHistoryExportFormat] = useState<"csv" | "pdf" | null>(null);
  const [historyExportRange, setHistoryExportRange] = useState<HistoryExportRange | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLimit, setHistoryLimit] = useState(25);
  const [historySearch, setHistorySearch] = useState("");
  const [clientPage, setClientPage] = useState(1);
  const [clientLimit, setClientLimit] = useState(25);
  const [clientSearch, setClientSearch] = useState("");
  const [staffSort, setStaffSort] = useState<SortState>({ key: "name", direction: "asc" });
  const [inviteSort, setInviteSort] = useState<SortState>({ key: "expiresAt", direction: "asc" });
  const [clientSort, setClientSort] = useState<SortState>({ key: "latestVisitAt", direction: "desc" });
  const [historySort, setHistorySort] = useState<SortState>({ key: "updatedAt", direction: "desc" });
  const [queueSort, setQueueSort] = useState<SortState>({ key: "position", direction: "asc" });
  const debouncedHistorySearch = useDebouncedValue(
    historySearch.trim(),
    TABLE_SEARCH_DEBOUNCE_MS
  );
  const debouncedClientSearch = useDebouncedValue(
    clientSearch.trim(),
    TABLE_SEARCH_DEBOUNCE_MS
  );
  const hasActiveSubscription = billing?.subscription?.status === "active";
  const selectedLocation =
    locations.find((locationItem) => locationItem.slug === selectedLocationSlug) ||
    snapshot?.location ||
    null;
  const selectedTenantRole =
    user?.tenants.find((tenant) => tenant.slug === selectedTenantSlug)?.role || null;
  const isOwner = selectedTenantRole === "owner";
  const isTenantAdmin = selectedTenantRole === "admin";
  const canManageTenant = isOwner || isTenantAdmin;
  const isEditingLocation = Boolean(editingLocationSlug);
  const locationSlugMessage = {
    idle: "Generated from the location name.",
    checking: "Checking location slug...",
    available: "Location slug is available.",
    taken: "That location slug is already used for this tenant.",
    error: "Unable to check slug right now. Try again in a moment."
  }[locationSlugStatus];
  const locationSlugError =
    locationSlugStatus === "taken" || locationSlugStatus === "error"
      ? locationSlugMessage
      : undefined;
  const locationSlugHelperColor = locationSlugStatus === "available" ? "green" : "dimmed";
  const canSaveLocation =
    busyAction !== "location" &&
    locationSlugStatus !== "checking" &&
    locationSlugStatus !== "taken" &&
    locationSlugStatus !== "error";
  const counterSlugMessage = {
    idle: "Generated from the counter name.",
    checking: "Checking counter slug...",
    available: "Counter slug is available.",
    taken: "That counter slug is already used for this location.",
    error: "Unable to check slug right now. Try again in a moment."
  }[counterSlugStatus];
  const counterSlugError =
    counterSlugStatus === "taken" || counterSlugStatus === "error" ? counterSlugMessage : undefined;
  const counterSlugHelperColor = counterSlugStatus === "available" ? "green" : "dimmed";
  const canSaveCounter =
    busyAction !== "counter-save" &&
    counterSlugStatus !== "checking" &&
    counterSlugStatus !== "taken" &&
    counterSlugStatus !== "error";
  const visibleNavItems = isOwner
    ? navItems
    : navItems.filter((item) =>
        isTenantAdmin
          ? adminAllowedSections.has(item.section)
          : staffAllowedSections.has(item.section)
      );
  const locationQuery = selectedLocationSlug
    ? `?location=${encodeURIComponent(selectedLocationSlug)}`
    : "";
  const locationsQuery = useQuery({
    queryKey: ["vendor", "locations", selectedTenantSlug],
    queryFn: () =>
      apiRequest<StoreLocationsResponse>(`/vendor/tenant/${selectedTenantSlug}/locations`, {
        token
      }),
    enabled: Boolean(selectedTenantSlug && token)
  });
  const dashboardQuery = useQuery({
    queryKey: [
      "vendor",
      "dashboard",
      selectedTenantSlug,
      selectedLocationSlug,
      queueSort.key,
      queueSort.direction
    ],
    queryFn: () =>
      apiRequest<QueueSnapshot>(
        `/vendor/tenant/${selectedTenantSlug}/dashboard${locationQuery}${locationQuery ? "&" : "?"}sort=${encodeURIComponent(queueSort.key)}&direction=${queueSort.direction}`,
        { token }
      ),
    enabled: Boolean(selectedTenantSlug && selectedLocationSlug && token)
  });
  const billingQuery = useQuery({
    queryKey: ["billing", "tenant", selectedTenantSlug],
    queryFn: () =>
      apiRequest<BillingOverviewResponse>(`/billing/tenant/${selectedTenantSlug}/subscription`, {
        token
      }),
    enabled: Boolean(selectedTenantSlug && token)
  });
  const countersQuery = useQuery({
    queryKey: ["vendor", "counters", selectedTenantSlug, selectedLocationSlug],
    queryFn: () =>
      apiRequest<ServiceCountersResponse>(
        `/vendor/tenant/${selectedTenantSlug}/counters?location=${encodeURIComponent(selectedLocationSlug)}`,
        { token }
      ),
    enabled: Boolean(selectedTenantSlug && selectedLocationSlug && token)
  });
  const staffQuery = useQuery({
    queryKey: [
      "vendor",
      "staff",
      selectedTenantSlug,
      staffSort.key,
      staffSort.direction,
      inviteSort.key,
      inviteSort.direction
    ],
    queryFn: () =>
      apiRequest<VendorStaffResponse>(
        `/vendor/tenant/${selectedTenantSlug}/staff?sort=${encodeURIComponent(staffSort.key)}&direction=${staffSort.direction}&inviteSort=${encodeURIComponent(inviteSort.key)}&inviteDirection=${inviteSort.direction}`,
        { token }
      ),
    enabled: Boolean(selectedTenantSlug && token && canManageTenant)
  });
  const historyQuery = useQuery({
    queryKey: [
      "vendor",
      "history",
      selectedTenantSlug,
      selectedLocationSlug,
      historyPage,
      historyLimit,
      historySort.key,
      historySort.direction,
      debouncedHistorySearch
    ],
    queryFn: () => {
      const searchParam = debouncedHistorySearch
        ? `&search=${encodeURIComponent(debouncedHistorySearch)}`
        : "";

      return apiRequest<VendorHistoryResponse>(
        `/vendor/tenant/${selectedTenantSlug}/history?page=${historyPage}&limit=${historyLimit}&location=${encodeURIComponent(selectedLocationSlug)}&sort=${encodeURIComponent(historySort.key)}&direction=${historySort.direction}${searchParam}`,
        { token }
      );
    },
    enabled: Boolean(
      selectedTenantSlug &&
      selectedLocationSlug &&
      token &&
      currentSection === "history" &&
      hasActiveSubscription
    )
  });
  const overflowQuery = useQuery({
    queryKey: ["vendor", "queue", "overflow", selectedTenantSlug, selectedLocationSlug],
    queryFn: () =>
      apiRequest<QueueOverflowResponse>(
        `/vendor/tenant/${selectedTenantSlug}/queue/overflow?location=${encodeURIComponent(selectedLocationSlug)}`,
        { token }
      ),
    enabled: Boolean(
      selectedTenantSlug &&
      selectedLocationSlug &&
      token &&
      currentSection === "queue" &&
      hasActiveSubscription
    )
  });
  const clientsQuery = useQuery({
    queryKey: [
      "vendor",
      "clients",
      selectedTenantSlug,
      selectedLocationSlug,
      clientPage,
      clientLimit,
      clientSort.key,
      clientSort.direction,
      debouncedClientSearch
    ],
    queryFn: () => {
      const searchParam = debouncedClientSearch
        ? `&search=${encodeURIComponent(debouncedClientSearch)}`
        : "";

      return apiRequest<VendorClientsResponse>(
        `/vendor/tenant/${selectedTenantSlug}/clients${locationQuery}${locationQuery ? "&" : "?"}page=${clientPage}&limit=${clientLimit}&sort=${encodeURIComponent(clientSort.key)}&direction=${clientSort.direction}${searchParam}`,
        { token }
      );
    },
    enabled: Boolean(
      selectedTenantSlug &&
      selectedLocationSlug &&
      token &&
      currentSection === "clients" &&
      hasActiveSubscription
    )
  });
  const queryFetching =
    locationsQuery.isFetching ||
    dashboardQuery.isFetching ||
    billingQuery.isFetching ||
    countersQuery.isFetching ||
    staffQuery.isFetching ||
    historyQuery.isFetching ||
    overflowQuery.isFetching ||
    clientsQuery.isFetching;
  const showDashboardOverlay = queryFetching || Boolean(busyAction);

  useEffect(() => {
    if (!user) {
      return;
    }

    setAccountProfileForm({
      name: user.name || "",
      email: user.email || "",
      phone: user.phone || ""
    });
  }, [user]);

  useEffect(() => {
    if (!locationDialogOpen) {
      setLocationSlugStatus("idle");
      return undefined;
    }

    if (editingLocationSlug) {
      setLocationSlugStatus("idle");
      return undefined;
    }

    const slug = locationForm.slug;
    if (!slug || !selectedTenantSlug || !token) {
      setLocationSlugStatus("idle");
      return undefined;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setLocationSlugStatus("checking");
      const params = new URLSearchParams({ slug });
      if (editingLocationSlug) {
        params.set("excludeSlug", editingLocationSlug);
      }

      apiRequest<LocationSlugAvailabilityResponse>(
        `/vendor/tenant/${selectedTenantSlug}/locations/slug-availability?${params.toString()}`,
        { token, signal: controller.signal }
      )
        .then((result) => {
          if (result.slug !== slug) {
            return;
          }

          setLocationSlugStatus(result.available ? "available" : "taken");
        })
        .catch((availabilityError) => {
          if (
            availabilityError instanceof DOMException &&
            availabilityError.name === "AbortError"
          ) {
            return;
          }

          setLocationSlugStatus("error");
        });
    }, 400);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [
    editingLocationSlug,
    locationDialogOpen,
    locationForm.slug,
    selectedTenantSlug,
    token
  ]);

  useEffect(() => {
    if (!counterDialogOpen) {
      setCounterSlugStatus("idle");
      return undefined;
    }

    const slug = counterForm.slug;
    if (!slug || !selectedTenantSlug || !selectedLocationSlug || !token) {
      setCounterSlugStatus("idle");
      return undefined;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setCounterSlugStatus("checking");
      const params = new URLSearchParams({
        location: selectedLocationSlug,
        slug
      });
      if (editingCounterSlug) {
        params.set("excludeSlug", editingCounterSlug);
      }

      apiRequest<CounterSlugAvailabilityResponse>(
        `/vendor/tenant/${selectedTenantSlug}/counters/slug-availability?${params.toString()}`,
        { token, signal: controller.signal }
      )
        .then((result) => {
          if (result.slug !== slug) {
            return;
          }

          setCounterSlugStatus(result.available ? "available" : "taken");
        })
        .catch((availabilityError) => {
          if (
            availabilityError instanceof DOMException &&
            availabilityError.name === "AbortError"
          ) {
            return;
          }

          setCounterSlugStatus("error");
        });
    }, 400);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [
    counterDialogOpen,
    counterForm.slug,
    editingCounterSlug,
    selectedLocationSlug,
    selectedTenantSlug,
    token
  ]);

  useEffect(() => {
    if (!selectedTenantSlug && user?.tenants?.length) {
      setSelectedTenantSlug(user.tenants[0].slug);
    }
  }, [selectedTenantSlug, user]);

  useEffect(() => {
    const data = locationsQuery.data;
    if (!data) {
      return;
    }

    setLocations(data.locations);
    setActiveLocationLimit(data.activeLocationLimit);
    if (!selectedLocationSlug || !data.locations.some((item) => item.slug === selectedLocationSlug)) {
      setSelectedLocationSlug(data.locations.find((item) => item.isPrimary)?.slug || data.locations[0]?.slug || "");
    }
  }, [locationsQuery.data, selectedLocationSlug]);

  useEffect(() => {
    const queryError =
      locationsQuery.error ||
      dashboardQuery.error ||
      billingQuery.error ||
      countersQuery.error ||
      staffQuery.error ||
      historyQuery.error ||
      overflowQuery.error ||
      clientsQuery.error;

    if (queryError) {
      setError(getErrorMessage(queryError));
    }
  }, [
    billingQuery.error,
    clientsQuery.error,
    countersQuery.error,
    dashboardQuery.error,
    historyQuery.error,
    locationsQuery.error,
    overflowQuery.error,
    staffQuery.error
  ]);

  useEffect(() => {
    const data = dashboardQuery.data;
    if (!data) {
      return;
    }

    setSnapshot(data);
    setSettings({
      queuePrefix: data.tenant.queuePrefix,
      averageServiceMinutes: data.tenant.averageServiceMinutes,
      notificationThreshold: data.tenant.notificationThreshold,
      contactEmail: data.tenant.contactEmail || "",
      contactPhone: data.tenant.contactPhone || ""
    });
  }, [dashboardQuery.data]);

  useEffect(() => {
    if (billingQuery.data) {
      setBilling(billingQuery.data);
    }
  }, [billingQuery.data]);

  useEffect(() => {
    const data = countersQuery.data;
    if (!data) {
      return;
    }

    setServiceCounters(data.counters);
    setCounterLimit(data.counterLimit);
    setSelectedCounterSlug((current) =>
      current && data.counters.some((counter) => counter.slug === current && counter.isActive)
        ? current
        : data.counters.find((counter) => counter.isActive)?.slug || ""
    );
  }, [countersQuery.data]);

  useEffect(() => {
    if (!canManageTenant) {
      setStaff([]);
      setPendingStaffInvites([]);
      setStaffSeatLimit(0);
      return;
    }

    const data = staffQuery.data;
    if (!data) {
      return;
    }

    setStaff(data.staff);
    setPendingStaffInvites(data.pendingInvites || []);
    setStaffSeatLimit(data.staffSeatLimit);
  }, [canManageTenant, staffQuery.data]);

  useEffect(() => {
    if (!selectedTenantSlug || !token) {
      return;
    }

    const params = new URLSearchParams(location.search);
    const billingStatus = params.get("billing");
    const checkoutId = params.get("checkout");

    if (billingStatus === "cancelled") {
      showInfoNotification(
        "Checkout cancelled",
        "No changes were made to your subscription."
      );
      navigate(location.pathname, { replace: true });
      return;
    }

    if (billingStatus !== "success" || !checkoutId) {
      return;
    }

    let active = true;
    setError("");
    showInfoNotification(
      "Payment received",
      "Confirming your subscription..."
    );
    setBusyAction("billing-sync");

    apiRequest<CheckoutSyncResponse>(
      `/billing/tenant/${selectedTenantSlug}/checkout/${checkoutId}/sync`,
      {
        method: "POST",
        token
      }
    )
      .then((data) => {
        if (!active) {
          return;
        }

        setBilling(data.billing);
        if (data.paid) {
          showSuccessNotification("Subscription activated", "Your plan is now active.");
        } else {
          showInfoNotification(
            "Payment pending",
            "Payment is still being confirmed. Your plan will update shortly."
          );
        }
        navigate(location.pathname, { replace: true });
      })
      .catch((syncError) => {
        if (active) {
          setError(getErrorMessage(syncError));
        }
      })
      .finally(() => {
        if (active) {
          setBusyAction("");
        }
      });

    return () => {
      active = false;
    };
  }, [location.pathname, location.search, navigate, selectedTenantSlug, token]);

  useEffect(() => {
    if (!selectedTenantSlug || !selectedLocationSlug) {
      return undefined;
    }

    const eventSource = new EventSource(
      `${API_BASE_URL}/public/tenant/${selectedTenantSlug}/location/${selectedLocationSlug}/stream?sort=${encodeURIComponent(queueSort.key)}&direction=${queueSort.direction}`
    );
    eventSource.onmessage = (event) => {
      const payload = JSON.parse(event.data) as QueueSnapshot;
      setSnapshot(payload);
    };
    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [queueSort.direction, queueSort.key, selectedLocationSlug, selectedTenantSlug]);

  useEffect(() => {
    if (historyQuery.data) {
      setHistory(historyQuery.data);
    }
  }, [historyQuery.data]);

  useEffect(() => {
    setHistoryPage(1);
  }, [debouncedHistorySearch, historyLimit, historySort.direction, historySort.key, selectedLocationSlug, selectedTenantSlug]);

  useEffect(() => {
    if (history?.totalPages && historyPage > history.totalPages) {
      setHistoryPage(history.totalPages);
    }
  }, [history?.totalPages, historyPage]);

  useEffect(() => {
    if (!hasActiveSubscription || currentSection !== "queue") {
      setOverflow(null);
      return;
    }

    if (overflowQuery.data) {
      setOverflow(overflowQuery.data);
    }
  }, [currentSection, hasActiveSubscription, overflowQuery.data]);

  useEffect(() => {
    if (clientsQuery.data) {
      setClients(clientsQuery.data);
    }
  }, [clientsQuery.data]);

  useEffect(() => {
    setClientPage(1);
  }, [clientLimit, clientSort.direction, clientSort.key, debouncedClientSearch, selectedLocationSlug, selectedTenantSlug]);

  useEffect(() => {
    if (clients?.totalPages && clientPage > clients.totalPages) {
      setClientPage(clients.totalPages);
    }
  }, [clientPage, clients?.totalPages]);

  const activeSubscription =
    billing?.subscription?.status === "active" ? billing.subscription : null;
  const currentPlan = activeSubscription
    ? billing?.plans.find((plan) => plan.slug === activeSubscription.planSlug)
    : null;
  const effectiveEntitlements = activeSubscription?.entitlements || currentPlan?.entitlements;

  useEffect(() => {
    if (!effectiveEntitlements) {
      setHistoryExportFormat(null);
      setHistoryExportRange(null);
      return;
    }

    const availableFormats = [
      effectiveEntitlements.csvExport ? "csv" : null,
      effectiveEntitlements.pdfExport ? "pdf" : null
    ].filter(Boolean) as Array<"csv" | "pdf">;

    setHistoryExportFormat((current) =>
      current && availableFormats.includes(current) ? current : availableFormats[0] || null
    );
    setHistoryExportRange((current) =>
      current && effectiveEntitlements.allowedHistoryExportRanges.includes(current)
        ? current
        : effectiveEntitlements.allowedHistoryExportRanges[0] || null
    );
  }, [effectiveEntitlements]);

  function showSuccessNotification(title: string, message: string) {
    notifications.show({
      color: "teal",
      icon: <IconCheck size={18} />,
      message,
      title
    });
  }

  function showInfoNotification(title: string, message: string) {
    notifications.show({
      color: "blue",
      icon: <IconInfoCircle size={18} />,
      message,
      title
    });
  }

  const joinUrl =
    snapshot?.location?.joinUrl ||
    snapshot?.tenant.joinUrl ||
    buildJoinUrl(window.location.origin, selectedTenantSlug, selectedLocationSlug);
  const queueLinks = {
    joinUrl,
    qrUrl: `${joinUrl}?source=qr`,
    monitorUrl:
      snapshot?.location?.monitorUrl ||
      snapshot?.tenant.monitorUrl ||
      buildMonitorUrl(window.location.origin, selectedTenantSlug, selectedLocationSlug)
  };
  const ticketLimit =
    activeSubscription?.entitlements.monthlyTickets ||
    currentPlan?.entitlements.monthlyTickets ||
    0;
  const ticketUsage = snapshot?.stats.servedToday ?? 0;
  const emailLimit = activeSubscription?.entitlements.emailAlerts
    ? activeSubscription.entitlements.monthlyTransactionalEmails ??
      currentPlan?.entitlements.monthlyTransactionalEmails
    : 0;
  const emailUsage = snapshot?.usage?.emailsSentThisPeriod ?? 0;
  const serviceTrendBars = useMemo(
    () =>
      (snapshot?.history || [])
        .slice(0, SERVICE_TREND_USER_LIMIT)
        .map((ticket, index, historyItems) => {
          const currentTime = getHistoryTimestamp(ticket.updatedAt);
          const nextTime = historyItems[index + 1]
            ? getHistoryTimestamp(historyItems[index + 1].updatedAt)
            : currentTime - (snapshot?.tenant.averageServiceMinutes || 5) * 60 * 1000;
          const minutes = Math.max(1, Math.round(Math.abs(currentTime - nextTime) / 60000));

          return {
            label: ticket.ticketNumber,
            minutes
          };
        })
        .reverse(),
    [snapshot]
  );
  const averageServiceMinutes = serviceTrendBars.length
    ? Math.round(
        serviceTrendBars.reduce((total, bar) => total + bar.minutes, 0) /
          serviceTrendBars.length
      )
    : 0;
  const trendMax = Math.max(
    ...serviceTrendBars.map((bar) => bar.minutes),
    averageServiceMinutes,
    1
  );

  async function runAction(
    actionName: string,
    request: () => Promise<DashboardActionResponse>
  ): Promise<boolean> {
    setError("");
    setBusyAction(actionName);

    try {
      const data = await request();
      if (data.snapshot) {
        setSnapshot(data.snapshot);
      }
      return true;
    } catch (actionError) {
      setError(getErrorMessage(actionError));
      return false;
    } finally {
      setBusyAction("");
    }
  }

  async function reloadOverflow() {
    const { data } = await overflowQuery.refetch();
    if (data) {
      setOverflow(data);
    }
  }

  function handleCloseQueueDay() {
    if (!selectedTenantSlug || !selectedLocationSlug || !token || snapshot?.closure) {
      return;
    }

    setConfirmAction({
      title: "Close queue for today?",
      message:
        "Waiting tickets will be carried over to the next open queue day. The current called ticket, if any, will be marked unserved. Paid SMS alerts stay active.",
      confirmLabel: "Close queue",
      onConfirm: async () => {
        const data = await apiRequest<CloseQueueDayResponse>(
          `/vendor/tenant/${selectedTenantSlug}/queue/close-day${locationQuery}`,
          {
            method: "POST",
            token,
            body: { reason: "Closed for the day" }
          }
        );
        setSnapshot(data.snapshot);
        await reloadOverflow();
        showSuccessNotification(
          "Queue closed",
          `${data.closure.waitingCarriedCount} waiting ticket(s) carried to ${formatDateKey(data.closure.nextQueueDateKey)}.`
        );
      }
    });
  }

  function handleReopenQueueDay() {
    if (!selectedTenantSlug || !selectedLocationSlug || !token || !snapshot?.closure) {
      return;
    }

    setConfirmAction({
      title: "Reopen queue for today?",
      message:
        "New joins will be allowed again. Tickets already carried to the next open queue day will stay there unless you reschedule them separately.",
      confirmLabel: "Reopen queue",
      onConfirm: async () => {
        const data = await apiRequest<ReopenQueueDayResponse>(
          `/vendor/tenant/${selectedTenantSlug}/queue/reopen-day${locationQuery}`,
          {
            method: "POST",
            token
          }
        );
        setSnapshot(data.snapshot);
        await reloadOverflow();
        showSuccessNotification(
          "Queue reopened",
          "New customers can join again. Carried tickets were left unchanged."
        );
      }
    });
  }

  async function handleRequeueOverflowTicket(ticket: QueueOverflowTicket) {
    const success = await runAction("overflow-requeue", () =>
      apiRequest<DashboardActionResponse>(
        `/vendor/tenant/${selectedTenantSlug}/queue/overflow/${ticket.id}/requeue${locationQuery}`,
        { method: "POST", token }
      )
    );

    if (success) {
      await reloadOverflow();
      showSuccessNotification("Ticket requeued", `${ticket.ticketNumber} is back in today's queue.`);
    }
  }

  async function handleCreateWalkIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const success = await runAction("walk-in", () =>
      apiRequest<TicketMutationResponse, CreateWalkInTicketRequest>(
        `/vendor/tenant/${selectedTenantSlug}/tickets${locationQuery}`,
        {
          method: "POST",
          token,
          body: walkInForm
        }
      )
    );

    if (success) {
      setWalkInForm(emptyWalkIn);
      showSuccessNotification("Ticket issued", "The walk-in ticket was added to the queue.");
    }
  }

  async function reloadCounters() {
    const { data } = await countersQuery.refetch();
    if (data) {
      setServiceCounters(data.counters);
      setCounterLimit(data.counterLimit);
    }
  }

  async function reloadStaff() {
    const { data } = await staffQuery.refetch();
    if (data) {
      setStaff(data.staff);
      setPendingStaffInvites(data.pendingInvites || []);
      setStaffSeatLimit(data.staffSeatLimit);
    }
  }

  function openCounterDialog(counter?: ServiceCounterSummary) {
    setEditingCounterSlug(counter?.slug || "");
    setCounterSlugEdited(Boolean(counter));
    setCounterSlugStatus(counter?.slug ? "checking" : "idle");
    setCounterForm({
      name: counter?.name || "",
      slug: counter?.slug || "",
      isActive: counter?.isActive ?? true,
      assignedUserIds: counter?.assignedUserIds || []
    });
    setCounterDialogOpen(true);
  }

  function handleCounterNameChange(value: string) {
    const nextSlug = counterSlugEdited ? counterForm.slug : toSlug(value);
    setCounterSlugStatus(nextSlug ? "checking" : "idle");
    setCounterForm((current) => ({
      ...current,
      name: value,
      slug: counterSlugEdited ? current.slug : nextSlug
    }));
  }

  function handleCounterSlugChange(value: string) {
    const nextSlug = toSlug(value);
    setCounterSlugEdited(Boolean(nextSlug));
    setCounterSlugStatus(nextSlug ? "checking" : "idle");
    setCounterForm((current) => ({ ...current, slug: nextSlug }));
  }

  async function handleSaveCounter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSaveCounter) {
      setError(counterSlugError || "Please wait for counter slug validation to finish.");
      return;
    }

    setBusyAction("counter-save");
    try {
      if (editingCounterSlug) {
        await apiRequest<{ counter: ServiceCounterSummary }, SaveServiceCounterRequest>(
          `/vendor/tenant/${selectedTenantSlug}/counters/${editingCounterSlug}?location=${encodeURIComponent(selectedLocationSlug)}`,
          { method: "PATCH", token, body: counterForm }
        );
      } else {
        await apiRequest<{ counter: ServiceCounterSummary }, SaveServiceCounterRequest>(
          `/vendor/tenant/${selectedTenantSlug}/counters?location=${encodeURIComponent(selectedLocationSlug)}`,
          { method: "POST", token, body: counterForm }
        );
      }
      await reloadCounters();
      await reloadStaff();
      setCounterDialogOpen(false);
      showSuccessNotification(
        editingCounterSlug ? "Counter updated" : "Counter created",
        `${counterForm.name} is ready for this location.`
      );
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleUpdateCounterStatus(counter: ServiceCounterSummary, isActive: boolean) {
    setBusyAction(`counter-status:${counter.id}`);
    setError("");

    try {
      await apiRequest<{ counter: ServiceCounterSummary }, SaveServiceCounterRequest>(
        `/vendor/tenant/${selectedTenantSlug}/counters/${counter.slug}?location=${encodeURIComponent(selectedLocationSlug)}`,
        {
          method: "PATCH",
          token,
          body: {
            name: counter.name,
            slug: counter.slug,
            isActive,
            assignedUserIds: counter.assignedUserIds
          }
        }
      );
      await reloadCounters();
      await reloadStaff();
      showSuccessNotification(
        isActive ? "Counter enabled" : "Counter disabled",
        `${counter.name} is now ${isActive ? "active" : "inactive"}.`
      );
    } catch (statusError) {
      setError(getErrorMessage(statusError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleDeleteCounterFromDialog() {
    const counter = serviceCounters.find((item) => item.slug === editingCounterSlug);
    if (!counter) {
      return;
    }

    setConfirmAction({
      title: "Delete counter?",
      message: `${counter.name} will be permanently removed from this location.`,
      confirmLabel: "Delete counter",
      onConfirm: async () => {
        await apiRequest<void>(
          `/vendor/tenant/${selectedTenantSlug}/counters/${counter.slug}?location=${encodeURIComponent(selectedLocationSlug)}`,
          { method: "DELETE", token }
        );
        await reloadCounters();
        await reloadStaff();
        setCounterDialogOpen(false);
        showSuccessNotification("Counter deleted", `${counter.name} was removed from this location.`);
      }
    });
  }

  async function handleAddStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction("staff-save");
    try {
      const data = await apiRequest<AddVendorStaffResponse, AddVendorStaffRequest>(
        `/vendor/tenant/${selectedTenantSlug}/staff`,
        { method: "POST", token, body: staffForm }
      );
      await reloadStaff();
      setStaffDialogOpen(false);
      setStaffForm({ email: "", role: "staff" });
      showSuccessNotification("Invitation sent", `Invite sent to ${data.invitation.email}.`);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleResendStaffInvite(invitation: VendorStaffInvitationSummary) {
    setBusyAction(`staff-invite-resend:${invitation.id}`);
    setError("");
    try {
      await apiRequest<AddVendorStaffResponse>(
        `/vendor/tenant/${selectedTenantSlug}/staff-invitations/${invitation.id}/resend`,
        { method: "POST", token }
      );
      await reloadStaff();
      showSuccessNotification("Invitation resent", `Invite resent to ${invitation.email}.`);
    } catch (inviteError) {
      setError(getErrorMessage(inviteError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleRevokeStaffInvite(invitation: VendorStaffInvitationSummary) {
    setConfirmAction({
      title: "Revoke invitation?",
      message: `${invitation.email} will no longer be able to use this invite.`,
      confirmLabel: "Revoke invite",
      onConfirm: async () => {
        await apiRequest<void>(
          `/vendor/tenant/${selectedTenantSlug}/staff-invitations/${invitation.id}`,
          { method: "DELETE", token }
        );
        await reloadStaff();
        showSuccessNotification("Invitation revoked", `${invitation.email} can no longer use that invite.`);
      }
    });
  }

  async function handleUpdateStaffRole(member: VendorStaffSummary, role: "admin" | "staff") {
    setBusyAction(`staff-role:${member.id}`);
    setError("");
    try {
      const data = await apiRequest<UpdateVendorStaffResponse, UpdateVendorStaffRequest>(
        `/vendor/tenant/${selectedTenantSlug}/staff/${member.id}`,
        { method: "PATCH", token, body: { role } }
      );
      setStaff((current) =>
        current.map((staffMember) =>
          staffMember.id === data.userId ? { ...staffMember, role: data.role } : staffMember
        )
      );
      await reloadStaff();
      showSuccessNotification("Staff updated", `${member.name}'s role was updated.`);
    } catch (roleError) {
      setError(getErrorMessage(roleError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleUpdateStaffAccess(member: VendorStaffSummary, isActive: boolean) {
    setBusyAction(`staff-access:${member.id}`);
    setError("");
    try {
      const data = await apiRequest<UpdateVendorStaffAccessResponse, UpdateVendorStaffAccessRequest>(
        `/vendor/tenant/${selectedTenantSlug}/staff/${member.id}/access`,
        { method: "PATCH", token, body: { isActive } }
      );
      setStaff((current) =>
        current.map((staffMember) =>
          staffMember.id === data.userId ? { ...staffMember, isActive: data.isActive } : staffMember
        )
      );
      await reloadStaff();
      showSuccessNotification(
        data.isActive ? "Access enabled" : "Access disabled",
        `${member.name}'s vendor access was updated.`
      );
    } catch (accessError) {
      setError(getErrorMessage(accessError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleRemoveStaff(member: VendorStaffSummary) {
    setConfirmAction({
      title: "Remove staff access?",
      message: `${member.name} will be removed from this tenant.`,
      confirmLabel: "Remove access",
      onConfirm: async () => {
        await apiRequest<void>(`/vendor/tenant/${selectedTenantSlug}/staff/${member.id}`, {
          method: "DELETE",
          token
        });
        await reloadStaff();
        showSuccessNotification("Staff removed", `${member.name} no longer has tenant access.`);
      }
    });
  }

  async function handleConfirmAction() {
    if (!confirmAction) {
      return;
    }

    setBusyAction("confirm-action");
    setError("");

    try {
      await confirmAction.onConfirm();
      setConfirmAction(null);
    } catch (confirmError) {
      setError(getErrorMessage(confirmError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleSaveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const success = await runAction("settings", () =>
      apiRequest<DashboardActionResponse, UpdateTenantSettingsRequest>(
        `/vendor/tenant/${selectedTenantSlug}/settings`,
        {
          method: "PATCH",
          token,
          body: settings
        }
      )
    );

    if (success) {
      showSuccessNotification("Settings saved", "Tenant queue settings were updated.");
    }
  }

  async function handleSaveAccountProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusyAction("account-profile");

    try {
      const data = await apiRequest<UpdateAccountProfileResponse, UpdateAccountProfileRequest>(
        "/account/profile",
        {
          method: "PATCH",
          token,
          body: accountProfileForm
        }
      );
      await refreshUser();
      setAccountProfileForm({
        name: data.user.name || "",
        email: data.user.email || "",
        phone: data.user.phone || ""
      });
      showSuccessNotification("Account updated", "Your personal details were saved.");
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleSaveAccountPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (accountPasswordForm.newPassword !== accountPasswordForm.confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    setBusyAction("account-password");

    try {
      const payload: UpdateAccountPasswordRequest = {
        currentPassword: accountPasswordForm.currentPassword,
        newPassword: accountPasswordForm.newPassword
      };

      await apiRequest<UpdateAccountProfileResponse, UpdateAccountPasswordRequest>(
        "/account/password",
        {
          method: "PATCH",
          token,
          body: payload
        }
      );
      await refreshUser();
      setAccountPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      });
      showSuccessNotification("Password updated", "Use your new password on the next sign-in.");
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleStartCheckout(planSlug: SubscriptionPlanSlug) {
    setError("");
    setBusyAction(`checkout:${planSlug}`);

    try {
      const data = await apiRequest<CheckoutSessionResponse, CreateCheckoutRequest>(
        `/billing/tenant/${selectedTenantSlug}/checkout`,
        {
          method: "POST",
          token,
          body: { planSlug, billingInterval }
        }
      );
      window.location.href = data.checkoutSession.checkoutUrl;
    } catch (checkoutError) {
      setError(getErrorMessage(checkoutError));
      setBusyAction("");
    }
  }

  async function handleHistoryExport(range: string, format: "csv" | "pdf") {
    const response = await fetch(
      `${API_BASE_URL}/vendor/tenant/${selectedTenantSlug}/history/export?location=${encodeURIComponent(selectedLocationSlug)}&range=${range}&format=${format}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    if (!response.ok) {
      throw new Error("Unable to export history.");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selectedTenantSlug}-${range}-history.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function openThemeDialog(locationItem: StoreLocationWithHours) {
    setThemeDialogOpen(true);
    setThemeLocation(locationItem);
    setApplyThemeToAllLocations(false);
    setThemeForm(mergeTheme(snapshot?.publicBoardTheme?.theme));

    if (!token || !selectedTenantSlug) {
      return;
    }

    setBusyAction("theme-load");
    try {
      const data = await apiRequest<PublicBoardThemeResponse>(
        `/vendor/tenant/${selectedTenantSlug}/public-board-theme?location=${encodeURIComponent(locationItem.slug)}`,
        { token }
      );
      setThemeForm(mergeTheme(data.theme));
    } catch (themeError) {
      setError(getErrorMessage(themeError));
    } finally {
      setBusyAction("");
    }
  }

  function setThemeField<K extends keyof PublicBoardThemeSettings>(
    field: K,
    value: PublicBoardThemeSettings[K]
  ) {
    setThemeForm((current) => ({ ...current, [field]: value }));
  }

  function applyThemePreset(presetId: string) {
    const preset = publicBoardThemePresets[presetId] || publicBoardThemePresets.classic;
    setThemeForm((current) => ({
      ...preset,
      heroTitle: current.heroTitle,
      heroSubtitle: current.heroSubtitle,
      logoUrl: current.logoUrl,
      backgroundImageUrl: current.backgroundImageUrl
    }));
  }

  async function uploadThemeAsset(assetType: "background" | "logo", file: File | null) {
    if (!file || !themeLocation || !token) {
      return;
    }

    setError("");
    setBusyAction(`theme-upload:${assetType}`);

    try {
      const data = await apiRequest<PublicBoardThemeUploadResponse, PublicBoardThemeUploadRequest>(
        `/vendor/tenant/${selectedTenantSlug}/public-board-theme/uploads`,
        {
          method: "POST",
          token,
          body: {
            assetType,
            fileName: file.name,
            contentType: file.type,
            sizeBytes: file.size,
            locationSlug: themeLocation.slug
          }
        }
      );
      const uploadResponse = await fetch(data.upload.url, {
        method: data.upload.method,
        headers: data.upload.headers,
        body: file
      });

      if (!uploadResponse.ok) {
        throw new Error("Upload failed. Check the Backblaze bucket CORS and credentials.");
      }

      setThemeField(assetType === "logo" ? "logoUrl" : "backgroundImageUrl", data.asset.publicUrl);
      showSuccessNotification(
        `${assetType === "logo" ? "Logo" : "Background"} uploaded`,
        "The image is ready to use in this public board theme."
      );
    } catch (uploadError) {
      setError(getErrorMessage(uploadError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleSaveTheme() {
    if (!themeLocation || !token) {
      return;
    }

    setError("");
    setBusyAction("theme-save");

    try {
      const data = await apiRequest<PublicBoardThemeResponse, SavePublicBoardThemeRequest>(
        `/vendor/tenant/${selectedTenantSlug}/public-board-theme?location=${encodeURIComponent(themeLocation.slug)}`,
        {
          method: "PATCH",
          token,
          body: {
            theme: themeForm,
            applyToAllLocations: applyThemeToAllLocations
          }
        }
      );
      setThemeForm(mergeTheme(data.theme));
      setSnapshot((current) =>
        current && current.location?.slug === themeLocation.slug
          ? { ...current, publicBoardTheme: data }
          : current
      );
      showSuccessNotification(
        "Theme saved",
        applyThemeToAllLocations
          ? "This theme now applies to all current and future locations."
          : `${themeLocation.name} now uses the saved public board theme.`
      );
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setBusyAction("");
    }
  }

  function renderPlanCards() {
    if (!billing?.plans.length) {
      return <Text c="dimmed">Plans are still loading.</Text>;
    }

    return (
      <Stack gap="md">
        <SegmentedControl
          data={[
            { value: "monthly", label: "Monthly" },
            { value: "annual", label: "Annual" }
          ]}
          name="billingInterval"
          value={billingInterval}
          onChange={(value) => setBillingInterval(value as "monthly" | "annual")}
        />
      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
        {billing.plans.map((plan) => (
          <Card className="neura-plan-card" key={plan.slug} padding="lg">
            <Stack gap="md" h="100%">
              <div>
                <Text className="neura-label">{plan.name}</Text>
                <Title order={3}>
                  {billingInterval === "annual" ? plan.price.annualDisplay : plan.price.monthlyDisplay}
                </Title>
                <Text c="dimmed" size="sm">{plan.bestFor}</Text>
              </div>
              <Stack gap={8} className="neura-feature-list">
                {plan.included.map((item) => (
                  <Text key={item} size="sm">• {item}</Text>
                ))}
              </Stack>
              {plan.checkoutEnabled ? (
                <Button
                  className={plan.slug === "pro" ? "neura-primary-button" : "neura-secondary-button"}
                  disabled={!isOwner || busyAction === `checkout:${plan.slug}`}
                  mt="auto"
                  onClick={() => handleStartCheckout(plan.slug)}
                >
                  {!isOwner
                    ? "Owner only"
                    : busyAction === `checkout:${plan.slug}`
                      ? "Opening..."
                      : "Choose plan"}
                </Button>
              ) : (
                <Button disabled mt="auto" variant="default">
                  Custom quote
                </Button>
              )}
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
      </Stack>
    );
  }

  function renderPlanDialog() {
    return (
      <Modal
        centered
        opened={planDialogOpen}
        onClose={() => setPlanDialogOpen(false)}
        size="xl"
        title="Choose a subscription plan"
      >
        {renderPlanCards()}
      </Modal>
    );
  }

  function renderLocationDialog() {
    const editingLocation = locations.find((item) => item.slug === editingLocationSlug);
    const isEditingPrimaryLocation = Boolean(editingLocation?.isPrimary);
    const canDeleteEditingLocation = isOwner && editingLocationSlug && !editingLocation?.isPrimary;

    return (
      <Modal
        centered
        opened={locationDialogOpen}
        onClose={() => setLocationDialogOpen(false)}
        size="xl"
        title={editingLocationSlug ? "Edit location" : "Add location"}
      >
        <Stack gap={0} style={{ maxHeight: "calc(100dvh - 150px)" }}>
          <ScrollArea.Autosize mah="calc(100dvh - 245px)" type="auto" offsetScrollbars>
            <Stack gap="md" pr="sm">
              <SimpleGrid cols={{ base: 1, md: 2 }}>
                <TextInput
                  label="Location name"
                  name="name"
                  required
                  value={locationForm.name}
                  onChange={(event) => handleLocationNameChange(event.target.value)}
                />
                <Stack gap={4}>
                  <TextInput
                    description={isEditingLocation ? "Set during creation and locked after saving." : undefined}
                    disabled={isEditingLocation}
                    error={locationSlugError}
                    label="Slug"
                    name="slug"
                    required
                    value={locationForm.slug}
                    onChange={(event) => handleLocationSlugChange(event.target.value)}
                  />
                  {!locationSlugError && !isEditingLocation ? (
                    <Text c={locationSlugHelperColor} size="xs">
                      {locationSlugMessage}
                    </Text>
                  ) : null}
                </Stack>
                <TextInput
                  label="Address line 1"
                  name="addressLine1"
                  value={locationForm.addressLine1}
                  onChange={(event) =>
                    setLocationForm((current) => ({ ...current, addressLine1: event.target.value }))
                  }
                />
                <TextInput
                  label="Address line 2"
                  name="addressLine2"
                  value={locationForm.addressLine2}
                  onChange={(event) =>
                    setLocationForm((current) => ({ ...current, addressLine2: event.target.value }))
                  }
                />
                <TextInput
                  label="City"
                  name="city"
                  value={locationForm.city}
                  onChange={(event) =>
                    setLocationForm((current) => ({ ...current, city: event.target.value }))
                  }
                />
                <TextInput
                  label="Province"
                  name="province"
                  value={locationForm.province}
                  onChange={(event) =>
                    setLocationForm((current) => ({ ...current, province: event.target.value }))
                  }
                />
                <TextInput
                  label="Contact email"
                  name="contactEmail"
                  value={locationForm.contactEmail}
                  onChange={(event) =>
                    setLocationForm((current) => ({ ...current, contactEmail: event.target.value }))
                  }
                />
                <TextInput
                  label="Contact phone"
                  name="contactPhone"
                  value={locationForm.contactPhone}
                  onChange={(event) =>
                    setLocationForm((current) => ({ ...current, contactPhone: event.target.value }))
                  }
                />
                <TextInput
                  label="Timezone"
                  name="timezone"
                  value={locationForm.timezone}
                  onChange={(event) =>
                    setLocationForm((current) => ({ ...current, timezone: event.target.value }))
                  }
                />
              </SimpleGrid>
              <Group>
                <Checkbox
                  checked={locationForm.isActive}
                  disabled={isEditingPrimaryLocation}
                  label="Active location"
                  name="isActive"
                  onChange={(event) =>
                    setLocationForm((current) => ({ ...current, isActive: event.target.checked }))
                  }
                />
                <Checkbox
                  checked={locationForm.isPrimary}
                  disabled={isEditingPrimaryLocation}
                  label="Primary location"
                  name="isPrimary"
                  onChange={(event) =>
                    setLocationForm((current) => ({
                      ...current,
                      isActive: event.target.checked ? true : current.isActive,
                      isPrimary: event.target.checked
                    }))
                  }
                />
              </Group>
              <Table.ScrollContainer minWidth={700}>
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Day</Table.Th>
                      <Table.Th>Closed</Table.Th>
                      <Table.Th>Opens</Table.Th>
                      <Table.Th>Closes</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {locationForm.hours.map((hour) => (
                      <Table.Tr key={hour.weekday}>
                        <Table.Td>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][hour.weekday]}</Table.Td>
                        <Table.Td>
                          <Checkbox
                            checked={hour.isClosed}
                            name={`hours.${hour.weekday}.isClosed`}
                            onChange={(event) =>
                              setLocationForm((current) => ({
                                ...current,
                                hours: current.hours.map((item) =>
                                  item.weekday === hour.weekday
                                    ? { ...item, isClosed: event.target.checked }
                                    : item
                                )
                              }))
                            }
                          />
                        </Table.Td>
                        <Table.Td>
                          <TextInput
                            disabled={hour.isClosed}
                            name={`hours.${hour.weekday}.opensAt`}
                            type="time"
                            value={hour.opensAt}
                            onChange={(event) =>
                              setLocationForm((current) => ({
                                ...current,
                                hours: current.hours.map((item) =>
                                  item.weekday === hour.weekday
                                    ? { ...item, opensAt: event.target.value }
                                    : item
                                )
                              }))
                            }
                          />
                        </Table.Td>
                        <Table.Td>
                          <TextInput
                            disabled={hour.isClosed}
                            name={`hours.${hour.weekday}.closesAt`}
                            type="time"
                            value={hour.closesAt}
                            onChange={(event) =>
                              setLocationForm((current) => ({
                                ...current,
                                hours: current.hours.map((item) =>
                                  item.weekday === hour.weekday
                                    ? { ...item, closesAt: event.target.value }
                                    : item
                                )
                              }))
                            }
                          />
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Stack>
          </ScrollArea.Autosize>
          <Group justify="space-between" mt="md" pt="md" style={{ borderTop: "1px solid var(--mantine-color-gray-2)" }}>
            {canDeleteEditingLocation ? (
              <Button color="red" variant="subtle" onClick={handleDeleteLocationFromDialog}>
                Delete location
              </Button>
            ) : (
              <div />
            )}
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setLocationDialogOpen(false)}>
                Cancel
              </Button>
              <Button className="neura-primary-button" disabled={!canSaveLocation} onClick={saveLocation}>
                {busyAction === "location" ? "Saving..." : "Save location"}
              </Button>
            </Group>
          </Group>
        </Stack>
      </Modal>
    );
  }

  function renderActivePlanName() {
    if (!activeSubscription) {
      return "No active plan";
    }

    return (
      <Tooltip
        multiline
        label={
          <Stack gap={8} style={{ maxWidth: 300 }}>
            <Text fw={700}>{currentPlan?.price.monthlyDisplay || activeSubscription.planName}</Text>
            <Text size="sm">
              {activeSubscription.status} via {activeSubscription.provider}
              {activeSubscription.currentPeriodEnd
                ? ` | Renews ${formatDate(activeSubscription.currentPeriodEnd)}`
                : ""}
            </Text>
            {currentPlan?.included.slice(0, 6).map((item) => (
              <Text key={item} size="xs">• {item}</Text>
            ))}
          </Stack>
        }
        position="bottom-start"
      >
        <Text component="span" className="neura-plan-trigger">{activeSubscription.planName}</Text>
      </Tooltip>
    );
  }

  function renderStats() {
    return (
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <MetricCard
          label="Now serving"
          value={snapshot?.current?.ticketNumber || "--"}
          detail={snapshot?.current?.customerName || "No active ticket"}
        />
        <MetricCard
          label="Waiting"
          value={snapshot?.stats?.waitingCount ?? 0}
          detail={`${snapshot?.stats?.estimatedWaitMinutes ?? 0} mins estimated`}
        />
        <MetricCard
          label="Served today"
          value={snapshot?.stats?.servedToday ?? 0}
          detail="Across the selected tenant"
        />
      </SimpleGrid>
    );
  }

  function renderServiceTrend() {
    const chartWidth = 600;
    const chartHeight = 180;
    const chartPadding = 18;
    const chartInnerWidth = chartWidth - chartPadding * 2;
    const chartInnerHeight = chartHeight - chartPadding * 2;
    const barSlotWidth = serviceTrendBars.length
      ? chartInnerWidth / serviceTrendBars.length
      : chartInnerWidth;
    const averageLineY =
      chartPadding + chartInnerHeight - (averageServiceMinutes / trendMax) * chartInnerHeight;

    return (
      <Card className="neura-card neura-card-dark" padding="lg">
        <Group justify="space-between" align="flex-start">
          <div>
            <Text className="neura-label">Service time</Text>
            <Title order={3}>Recent trend</Title>
          </div>
          {averageServiceMinutes ? <Badge variant="white">Avg {averageServiceMinutes}m</Badge> : null}
        </Group>
        <div className="neura-chart">
          {serviceTrendBars.length ? (
            <svg role="img" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
              <title>Last {serviceTrendBars.length} users served today with average service time</title>
              {serviceTrendBars.map((bar, index) => {
                const barHeight = (bar.minutes / trendMax) * chartInnerHeight;
                const x = chartPadding + index * barSlotWidth + barSlotWidth * 0.18;
                const y = chartPadding + chartInnerHeight - barHeight;

                return (
                  <rect
                    className="neura-chart-bar"
                    height={Math.max(4, barHeight)}
                    key={bar.label}
                    rx={6}
                    width={Math.max(6, barSlotWidth * 0.64)}
                    x={x}
                    y={y}
                  >
                    <title>{`${bar.label}: ${bar.minutes} mins`}</title>
                  </rect>
                );
              })}
              <line
                className="neura-chart-line"
                x1={chartPadding}
                x2={chartWidth - chartPadding}
                y1={averageLineY}
                y2={averageLineY}
              />
            </svg>
          ) : (
            <Text c="dimmed">Service trend appears after served tickets.</Text>
          )}
        </div>
      </Card>
    );
  }

  function renderOverflowTable(tickets: QueueOverflowTicket[], kind: "carried" | "unserved") {
    return (
      <Table.ScrollContainer minWidth={760}>
        <Table verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Ticket</Table.Th>
              <Table.Th>Customer</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>SMS</Table.Th>
              <Table.Th>Queue day</Table.Th>
              <Table.Th>{kind === "carried" ? "Carried over" : "Unserved"}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {tickets.length ? (
              tickets.map((ticket) => (
                <Table.Tr key={ticket.id}>
                  <Table.Td>
                    <Text fw={700}>{ticket.ticketNumber}</Text>
                    <Text c="dimmed" size="sm">Carry-over count: {ticket.carryOverCount}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text>{ticket.customerName}</Text>
                    <Text c="dimmed" size="sm">{ticket.customerPhone || "--"}</Text>
                  </Table.Td>
                  <Table.Td><Badge variant="light">{ticket.status}</Badge></Table.Td>
                  <Table.Td>
                    {ticket.notifyBySms ? <Badge color="teal" variant="light">SMS paid</Badge> : "--"}
                  </Table.Td>
                  <Table.Td>{formatDateKey(ticket.queueDateKey)}</Table.Td>
                  <Table.Td>
                    {kind === "carried"
                      ? renderRelativeDateTime(ticket.carriedOverAt)
                      : renderRelativeDateTime(ticket.unservedAt)}
                  </Table.Td>
                  <Table.Td>
                    {kind === "unserved" ? (
                      <Button
                        disabled={busyAction === "overflow-requeue"}
                        onClick={() => handleRequeueOverflowTicket(ticket)}
                        size="xs"
                        variant="default"
                      >
                        Requeue
                      </Button>
                    ) : null}
                  </Table.Td>
                </Table.Tr>
              ))
            ) : (
              <Table.Tr>
                <Table.Td colSpan={7}>
                  <DashboardEmptyState
                    title={kind === "carried" ? "No carried tickets." : "No unserved tickets."}
                    text={
                      kind === "carried"
                        ? "Waiting tickets carried from a previous day will appear here."
                        : "Called tickets left unresolved by rollover will appear here."
                    }
                  />
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    );
  }

  function renderOverflowPanel() {
    return (
      <Card className="neura-card" padding="lg">
        <Stack gap="lg">
          <Group justify="space-between">
            <div>
              <Text className="neura-label">Overflow</Text>
              <Title order={3}>Next-day queue handling</Title>
              <Text c="dimmed" size="sm">
                Carried tickets keep paid SMS privileges. Unserved tickets can be manually requeued.
              </Text>
            </div>
            <Button variant="default" onClick={reloadOverflow}>
              Refresh
            </Button>
          </Group>
          <Stack gap="sm">
            <Group justify="space-between">
              <Title order={4}>Carried over</Title>
              <Badge variant="light">{overflow?.carriedOver.length || 0}</Badge>
            </Group>
            {renderOverflowTable(overflow?.carriedOver || [], "carried")}
          </Stack>
          <Stack gap="sm">
            <Group justify="space-between">
              <Title order={4}>Unserved</Title>
              <Badge variant="light">{overflow?.unserved.length || 0}</Badge>
            </Group>
            {renderOverflowTable(overflow?.unserved || [], "unserved")}
          </Stack>
        </Stack>
      </Card>
    );
  }

  function renderQueuePage() {
    const activeCounters = serviceCounters.filter((counter) => counter.isActive);
    const queueClosedForDay = Boolean(snapshot?.closure);

    return (
      <Stack gap="md">
        {renderStats()}
        {snapshot?.closure ? (
          <Alert color="orange" icon={<IconInfoCircle size={18} />} variant="light">
            <Group justify="space-between" align="center">
              <Text>
                Queue closed for {formatDateKey(snapshot.closure.queueDateKey)}.{" "}
                {snapshot.closure.waitingCarriedCount} waiting ticket(s) were carried to{" "}
                {formatDateKey(snapshot.closure.nextQueueDateKey)} and{" "}
                {snapshot.closure.calledUnservedCount} called ticket(s) were marked unserved.
              </Text>
              <Button
                color="orange"
                disabled={busyAction === "confirm-action"}
                onClick={handleReopenQueueDay}
                size="xs"
                variant="light"
              >
                Reopen queue
              </Button>
            </Group>
          </Alert>
        ) : null}
        <SegmentedControl
          data={[
            { label: "Live queue", value: "live" },
            { label: "Overflow", value: "overflow" }
          ]}
          name="queueView"
          onChange={(value) => setQueueView(value as "live" | "overflow")}
          value={queueView}
        />
        {queueView === "live" ? (
          <>
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
          <Card className="neura-card" padding="lg">
            <Stack gap="md">
              <Group justify="space-between" align="flex-end">
                <Select
                  data={activeCounters.map((counter) => ({
                    label: counter.name,
                    value: counter.slug
                  }))}
                  label="Serving from"
                  name="selectedCounterSlug"
                  placeholder="Select counter"
                  value={selectedCounterSlug || null}
                  onChange={(value) => setSelectedCounterSlug(value || "")}
                />
                <Button
                  color="red"
                  disabled={busyAction === "close-day" || queueClosedForDay}
                  onClick={handleCloseQueueDay}
                  variant="light"
                >
                  Close queue for today
                </Button>
              </Group>
              <Group>
                <Button
                  className="neura-primary-button"
                  disabled={busyAction === "call-next" || !selectedCounterSlug || queueClosedForDay}
                  onClick={async () => {
                    const success = await runAction("call-next", () =>
                      apiRequest<DashboardActionResponse>(
                      `/vendor/tenant/${selectedTenantSlug}/queue/call-next${locationQuery}`,
                        { method: "POST", token, body: { counterSlug: selectedCounterSlug } }
                      )
                    );
                    if (success) {
                      showSuccessNotification("Customer called", "The next ticket is now being served.");
                    }
                  }}
                >
                  {busyAction === "call-next" ? "Calling..." : "Call next"}
                </Button>
                <Button
                  className="neura-secondary-button"
                  disabled={busyAction === "serve-current"}
                  onClick={async () => {
                    const success = await runAction("serve-current", () =>
                      apiRequest<DashboardActionResponse>(
                        `/vendor/tenant/${selectedTenantSlug}/queue/current/serve${locationQuery}`,
                        { method: "POST", token }
                      )
                    );
                    if (success) {
                      showSuccessNotification("Ticket served", "The current ticket was marked as served.");
                    }
                  }}
                >
                  Serve current
                </Button>
                <Button
                  variant="default"
                  disabled={busyAction === "skip-current"}
                  onClick={async () => {
                    const success = await runAction("skip-current", () =>
                      apiRequest<DashboardActionResponse>(
                        `/vendor/tenant/${selectedTenantSlug}/queue/current/skip${locationQuery}`,
                        { method: "POST", token }
                      )
                    );
                    if (success) {
                      showSuccessNotification("Ticket skipped", "The current ticket was skipped.");
                    }
                  }}
                >
                  Skip current
                </Button>
              </Group>
              <Table.ScrollContainer minWidth={420}>
                <Table verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{renderSortHeader(queueSort, setQueueSort, "position", "Up next")}</Table.Th>
                      <Table.Th>{renderSortHeader(queueSort, setQueueSort, "joinChannel", "Channel")}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {snapshot?.nextUp?.length ? (
                      snapshot.nextUp.map((ticket) => (
                        <Table.Tr key={ticket.id}>
                          <Table.Td>
                            <Group gap="xs">
                              <Text fw={700}>{ticket.ticketNumber}</Text>
                              {ticket.carryOverCount > 0 ? (
                                <Badge color="orange" size="sm" variant="light">
                                  Carried over
                                </Badge>
                              ) : null}
                            </Group>
                            <Text c="dimmed" size="sm">{ticket.customerName}</Text>
                          </Table.Td>
                          <Table.Td><Badge variant="light">{ticket.joinChannel}</Badge></Table.Td>
                        </Table.Tr>
                      ))
                    ) : (
                      <Table.Tr>
                        <Table.Td colSpan={2}>
                          <DashboardEmptyState
                            title="No one is waiting right now."
                            text="As customers join from QR or online, the next tickets will appear here."
                          />
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Stack>
          </Card>

          <Card className="neura-card" padding="lg">
            <Stack gap="md">
              <Group justify="space-between">
                <div>
                  <Text className="neura-label">QR and public links</Text>
                  <Title order={3}>Customer self-service entry</Title>
                </div>
                <Button component="a" href={queueLinks.monitorUrl} target="_blank" variant="default">
                  Open board
                </Button>
              </Group>
              <Group align="flex-start" gap="lg">
                <Paper className="neura-qr-card" p="md">
                  <QRCode size={160} value={queueLinks.qrUrl} />
                  <Group gap={6} justify="center" mt="sm">
                    <IconQrcode size={16} />
                    <Text className="neura-label">Join QR</Text>
                  </Group>
                </Paper>
                <Stack flex={1} gap="sm">
                  <TextInput label="Join URL" name="joinUrl" readOnly value={queueLinks.joinUrl} />
                  <TextInput label="QR target" name="qrUrl" readOnly value={queueLinks.qrUrl} />
                  <TextInput label="Monitor URL" name="monitorUrl" readOnly value={queueLinks.monitorUrl} />
                </Stack>
              </Group>
            </Stack>
          </Card>
        </SimpleGrid>

        <Card className="neura-card" padding="lg">
          <form onSubmit={handleCreateWalkIn}>
            <Stack gap="md">
              <Group justify="space-between">
                <div>
                  <Text className="neura-label">Issue walk-in ticket</Text>
                  <Title order={3}>Add customer at counter</Title>
                </div>
                <Button className="neura-primary-button" disabled={busyAction === "walk-in" || queueClosedForDay} type="submit">
                  {busyAction === "walk-in" ? "Issuing..." : "Issue ticket"}
                </Button>
              </Group>
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                <TextInput
                  label="Customer name"
                  name="customerName"
                  required
                  value={walkInForm.customerName}
                  onChange={(event) =>
                    setWalkInForm((current) => ({ ...current, customerName: event.target.value }))
                  }
                />
                <TextInput
                  label="Email"
                  name="customerEmail"
                  type="email"
                  value={walkInForm.customerEmail}
                  onChange={(event) =>
                    setWalkInForm((current) => ({ ...current, customerEmail: event.target.value }))
                  }
                />
                <TextInput
                  label="Phone"
                  name="customerPhone"
                  value={walkInForm.customerPhone}
                  onChange={(event) =>
                    setWalkInForm((current) => ({ ...current, customerPhone: event.target.value }))
                  }
                />
                <Textarea
                  label="Notes"
                  minRows={2}
                  name="notes"
                  value={walkInForm.notes}
                  onChange={(event) =>
                    setWalkInForm((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </SimpleGrid>
              <Group>
                <Checkbox
                  checked={walkInForm.notifyByEmail}
                  label="Send email alerts"
                  name="notifyByEmail"
                  onChange={(event) =>
                    setWalkInForm((current) => ({ ...current, notifyByEmail: event.target.checked }))
                  }
                />
                <Checkbox
                  checked={walkInForm.notifyBySms}
                  label="Send SMS alerts"
                  name="notifyBySms"
                  onChange={(event) =>
                    setWalkInForm((current) => ({ ...current, notifyBySms: event.target.checked }))
                  }
                />
              </Group>
            </Stack>
          </form>
        </Card>
          </>
        ) : (
          renderOverflowPanel()
        )}
      </Stack>
    );
  }

  function renderThemePreview() {
    const previewLocation = themeLocation || selectedLocation;
    const previewBusinessName =
      snapshot?.tenant.name ||
      user?.tenants.find((tenant) => tenant.slug === selectedTenantSlug)?.name ||
      "Business name";
    const previewLocationName = previewLocation?.name || "Location";
    const previewJoinUrl = previewLocation?.joinUrl || queueLinks.joinUrl;
    const cardStyle = {
      backgroundColor: hexToRgba(themeForm.cardBackgroundColor, themeForm.cardAlpha),
      border: `${themeForm.cardBorderSize}px solid ${themeForm.cardBorderColor}`,
      borderRadius: themeForm.cardBorderRadius,
      color: themeForm.bodyColor
    };

    return (
      <Paper
        p="xl"
        style={{
          minHeight: 620,
          color: themeForm.bodyColor,
          backgroundColor: themeForm.pageBackgroundColor,
          backgroundImage: themeForm.backgroundImageUrl
            ? `linear-gradient(rgba(255,255,255,0.42), rgba(255,255,255,0.42)), url(${themeForm.backgroundImageUrl})`
            : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center"
        }}
      >
        <Stack gap="md">
          <Paper p="xl" style={cardStyle}>
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="xl">
              <Stack gap="md" style={{ gridColumn: "span 2" }}>
                {themeForm.logoUrl ? (
                  <img
                    alt={`${previewBusinessName} logo preview`}
                    src={themeForm.logoUrl}
                    style={{ maxHeight: 76, maxWidth: 180, objectFit: "contain" }}
                  />
                ) : null}
                <Text size="xs" tt="uppercase" fw={800} c={themeForm.subheaderColor} lts={1.6}>
                  Live public board
                </Text>
                <Badge color="teal" radius="xl" size="lg" variant="light" w="fit-content">
                  Live
                </Badge>
                <Title order={1} c={themeForm.headerColor} style={{ fontSize: "clamp(3rem, 7vw, 4.5rem)" }}>
                  {previewBusinessName}
                </Title>
                <Title order={2} c={themeForm.subheaderColor} style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)" }}>
                  {previewLocationName}
                </Title>
                <Group mt="sm">
                  <Button
                    style={{
                      background: themeForm.buttonBackgroundColor,
                      borderColor: themeForm.buttonBorderColor,
                      color: themeForm.buttonTextColor
                    }}
                  >
                    Join this queue
                  </Button>
                  <Badge variant="light">Waiting: {snapshot?.stats.waitingCount ?? 0}</Badge>
                  <Badge variant="light">ETA: {snapshot?.stats.estimatedWaitMinutes ?? 0} mins</Badge>
                  <Badge color={previewLocation?.openStatus.isOpen ? "teal" : "red"}>
                    {previewLocation?.openStatus.isOpen ? "Open" : "Closed"}
                  </Badge>
                </Group>
              </Stack>
              <Stack align="center" gap="sm">
                <Text c={themeForm.bodyColor} fw={700}>Scan to join</Text>
                <Paper bg="white" p="md" radius="lg" withBorder>
                  <QRCode size={180} value={`${previewJoinUrl}?source=qr`} />
                </Paper>
                <Text c={themeForm.bodyColor} size="sm" ta="center">Use your phone camera to open the queue form.</Text>
              </Stack>
            </SimpleGrid>
          </Paper>
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <Paper p="lg" style={cardStyle}>
              <Text c={themeForm.subheaderColor}>Now serving</Text>
              <Title order={2} c={themeForm.headerColor}>
                {snapshot?.current?.ticketNumber || "--"}
              </Title>
              <Text c={themeForm.bodyColor}>No active ticket</Text>
            </Paper>
            <Paper p="lg" style={cardStyle}>
              <Text c={themeForm.subheaderColor}>Served today</Text>
              <Title order={2} c={themeForm.headerColor}>
                {snapshot?.stats.servedToday ?? 0}
              </Title>
              <Text c={themeForm.bodyColor}>Updated live for this location</Text>
            </Paper>
          </SimpleGrid>
        </Stack>
      </Paper>
    );
  }

  function updateSort(
    setSort: Dispatch<SetStateAction<SortState>>,
    key: string
  ) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  }

  function renderSortHeader(
    sort: SortState,
    setSort: Dispatch<SetStateAction<SortState>>,
    key: string,
    label: string
  ) {
    return (
      <button className="sortable-table-header" type="button" onClick={() => updateSort(setSort, key)}>
        <span>{label}</span>
        <span>{sort.key === key ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
    );
  }

  function renderThemeDialog() {
    return (
      <Modal
        fullScreen
        opened={themeDialogOpen}
        onClose={() => setThemeDialogOpen(false)}
        title={`Setup public board theme${themeLocation ? `: ${themeLocation.name}` : ""}`}
      >
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="xl">
          <ScrollArea h="calc(100vh - 120px)" offsetScrollbars>
            <Stack gap="md" pr="md">
              <Select
                label="Theme preset"
                data={[
                  { value: "classic", label: "Classic Light" },
                  { value: "neura", label: "Neura Clean" },
                  { value: "clinic", label: "Clinic Calm" }
                ]}
                name="presetId"
                value={themeForm.presetId}
                onChange={(value) => value && applyThemePreset(value)}
              />
              <SimpleGrid cols={{ base: 1, md: 2 }}>
                <FileInput
                  accept="image/png,image/jpeg,image/webp"
                  clearable
                  label="Background image"
                  disabled={busyAction === "theme-upload:background"}
                  name="backgroundImage"
                  onChange={(file) => uploadThemeAsset("background", file)}
                />
                <FileInput
                  accept="image/png,image/jpeg,image/webp"
                  clearable
                  label="Company logo"
                  disabled={busyAction === "theme-upload:logo"}
                  name="logoImage"
                  onChange={(file) => uploadThemeAsset("logo", file)}
                />
              </SimpleGrid>
              <SimpleGrid cols={{ base: 1, md: 2 }}>
                <TextInput
                  label="Background image URL"
                  name="backgroundImageUrl"
                  value={themeForm.backgroundImageUrl}
                  onChange={(event) => setThemeField("backgroundImageUrl", event.target.value)}
                />
                <TextInput
                  label="Logo URL"
                  name="logoUrl"
                  value={themeForm.logoUrl}
                  onChange={(event) => setThemeField("logoUrl", event.target.value)}
                />
              </SimpleGrid>
              <Divider label="Board colors" labelPosition="left" />
              <SimpleGrid cols={{ base: 1, md: 3 }}>
                <ColorInput label="Page background" name="pageBackgroundColor" value={themeForm.pageBackgroundColor} onChange={(value) => setThemeField("pageBackgroundColor", value)} />
                <ColorInput label="Header text" name="headerColor" value={themeForm.headerColor} onChange={(value) => setThemeField("headerColor", value)} />
                <ColorInput label="Subheader text" name="subheaderColor" value={themeForm.subheaderColor} onChange={(value) => setThemeField("subheaderColor", value)} />
                <ColorInput label="Body text" name="bodyColor" value={themeForm.bodyColor} onChange={(value) => setThemeField("bodyColor", value)} />
                <ColorInput label="Button background" name="buttonBackgroundColor" value={themeForm.buttonBackgroundColor} onChange={(value) => setThemeField("buttonBackgroundColor", value)} />
                <ColorInput label="Button text" name="buttonTextColor" value={themeForm.buttonTextColor} onChange={(value) => setThemeField("buttonTextColor", value)} />
              </SimpleGrid>
              <Divider label="Section cards" labelPosition="left" />
              <SimpleGrid cols={{ base: 1, md: 2 }}>
                <ColorInput label="Card background" name="cardBackgroundColor" value={themeForm.cardBackgroundColor} onChange={(value) => setThemeField("cardBackgroundColor", value)} />
                <ColorInput label="Card border" name="cardBorderColor" value={themeForm.cardBorderColor} onChange={(value) => setThemeField("cardBorderColor", value)} />
                <NumberInput label="Border size" min={0} max={12} name="cardBorderSize" value={themeForm.cardBorderSize} onChange={(value) => setThemeField("cardBorderSize", Number(value) || 0)} />
                <NumberInput label="Border radius" min={0} max={48} name="cardBorderRadius" value={themeForm.cardBorderRadius} onChange={(value) => setThemeField("cardBorderRadius", Number(value) || 0)} />
              </SimpleGrid>
              <div>
                <Text size="sm" fw={600}>Card alpha</Text>
                <Slider
                  min={0.15}
                  max={1}
                  name="cardAlpha"
                  step={0.05}
                  value={themeForm.cardAlpha}
                  onChange={(value) => setThemeField("cardAlpha", value)}
                />
              </div>
              <Checkbox
                checked={applyThemeToAllLocations}
                label="Apply to all current and future locations"
                name="applyThemeToAllLocations"
                onChange={(event) => setApplyThemeToAllLocations(event.target.checked)}
              />
              <Group justify="flex-end">
                <Button variant="default" onClick={() => setThemeDialogOpen(false)}>
                  Close
                </Button>
                <Button
                  className="neura-primary-button"
                  disabled={busyAction === "theme-save"}
                  onClick={handleSaveTheme}
                >
                  {busyAction === "theme-save" ? "Saving..." : "Save theme"}
                </Button>
              </Group>
            </Stack>
          </ScrollArea>
          {renderThemePreview()}
        </SimpleGrid>
      </Modal>
    );
  }

  function openLocationDialog(locationItem?: StoreLocationWithHours) {
    if (locationItem) {
      setEditingLocationSlug(locationItem.slug);
      setLocationSlugEdited(true);
      setLocationSlugStatus("idle");
      setLocationForm({
        name: locationItem.name,
        slug: locationItem.slug,
        addressLine1: locationItem.addressLine1,
        addressLine2: locationItem.addressLine2,
        city: locationItem.city,
        province: locationItem.province,
        postalCode: locationItem.postalCode,
        country: locationItem.country,
        contactEmail: locationItem.contactEmail,
        contactPhone: locationItem.contactPhone,
        timezone: locationItem.timezone,
        isPrimary: locationItem.isPrimary,
        isActive: locationItem.isActive,
        hours: locationItem.hours.length ? locationItem.hours : defaultHours
      });
    } else {
      setEditingLocationSlug("");
      setLocationSlugEdited(false);
      setLocationSlugStatus("idle");
      setLocationForm(emptyLocationForm);
    }

    setLocationDialogOpen(true);
  }

  function handleLocationNameChange(value: string) {
    const nextSlug = editingLocationSlug || locationSlugEdited ? locationForm.slug : toSlug(value);
    if (!editingLocationSlug) {
      setLocationSlugStatus(nextSlug ? "checking" : "idle");
    }
    setLocationForm((current) => ({
      ...current,
      name: value,
      slug: editingLocationSlug || locationSlugEdited ? current.slug : nextSlug
    }));
  }

  function handleLocationSlugChange(value: string) {
    if (editingLocationSlug) {
      return;
    }

    const nextSlug = toSlug(value);
    setLocationSlugEdited(Boolean(nextSlug));
    setLocationSlugStatus(nextSlug ? "checking" : "idle");
    setLocationForm((current) => ({ ...current, slug: nextSlug }));
  }

  async function handleUpdateLocationStatus(
    locationItem: StoreLocationWithHours,
    isActive: boolean
  ) {
    if (locationItem.isPrimary && !isActive) {
      setError("Primary locations cannot be disabled.");
      return;
    }

    setBusyAction(`location-status:${locationItem.id}`);
    setError("");

    try {
      const payload = {
        name: locationItem.name,
        addressLine1: locationItem.addressLine1,
        addressLine2: locationItem.addressLine2,
        city: locationItem.city,
        province: locationItem.province,
        postalCode: locationItem.postalCode,
        country: locationItem.country,
        contactEmail: locationItem.contactEmail,
        contactPhone: locationItem.contactPhone,
        timezone: locationItem.timezone,
        isPrimary: locationItem.isPrimary,
        isActive
      };
      const response = await apiRequest<{ location: StoreLocationWithHours }, typeof payload>(
        `/vendor/tenant/${selectedTenantSlug}/locations/${locationItem.slug}`,
        { method: "PATCH", token, body: payload }
      );

      setLocations((current) =>
        current.map((item) => (item.id === response.location.id ? response.location : item))
      );
      showSuccessNotification(
        isActive ? "Location enabled" : "Location disabled",
        `${locationItem.name} is now ${isActive ? "active" : "inactive"}.`
      );
    } catch (statusError) {
      setError(getErrorMessage(statusError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleDeleteLocationFromDialog() {
    const locationItem = locations.find((item) => item.slug === editingLocationSlug);
    if (!locationItem) {
      return;
    }
    if (locationItem.isPrimary) {
      setError("Primary locations cannot be deleted.");
      return;
    }

    setConfirmAction({
      title: "Delete location?",
      message: `${locationItem.name} will be permanently removed with its counters and schedules.`,
      confirmLabel: "Delete location",
      onConfirm: async () => {
        await apiRequest<void>(
          `/vendor/tenant/${selectedTenantSlug}/locations/${locationItem.slug}`,
          { method: "DELETE", token }
        );
        const nextLocations = locations.filter((item) => item.id !== locationItem.id);
        setLocations(nextLocations);
        if (selectedLocationSlug === locationItem.slug) {
          const nextLocation = nextLocations[0];
          setSelectedLocationSlug(nextLocation?.slug || "");
        }
        setLocationDialogOpen(false);
        showSuccessNotification("Location deleted", `${locationItem.name} was removed.`);
      }
    });
  }

  async function saveLocation() {
    if (!canSaveLocation) {
      setError(locationSlugError || "Please wait for location slug validation to finish.");
      return;
    }

    setBusyAction("location");
    setError("");

    try {
      const payload = {
        name: locationForm.name,
        addressLine1: locationForm.addressLine1,
        addressLine2: locationForm.addressLine2,
        city: locationForm.city,
        province: locationForm.province,
        postalCode: locationForm.postalCode,
        country: locationForm.country,
        contactEmail: locationForm.contactEmail,
        contactPhone: locationForm.contactPhone,
        timezone: locationForm.timezone,
        isPrimary: locationForm.isPrimary,
        isActive: locationForm.isActive
      };
      const locationResponse = editingLocationSlug
        ? await apiRequest<{ location: StoreLocationWithHours }, typeof payload>(
            `/vendor/tenant/${selectedTenantSlug}/locations/${editingLocationSlug}`,
            { method: "PATCH", token, body: payload }
          )
        : await apiRequest<
            { location: StoreLocationWithHours },
            typeof payload & { slug: string }
          >(
            `/vendor/tenant/${selectedTenantSlug}/locations`,
            { method: "POST", token, body: { ...payload, slug: locationForm.slug } }
          );

      const hoursResponse = await apiRequest<
        { location: StoreLocationWithHours },
        { hours: StoreHourSummary[] }
      >(
        `/vendor/tenant/${selectedTenantSlug}/locations/${locationResponse.location.slug}/hours`,
        {
          method: "PATCH",
          token,
          body: { hours: locationForm.hours }
        }
      );

      setLocations((current) => {
        const next = current.filter((item) => item.id !== hoursResponse.location.id);
        return [...next, hoursResponse.location].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name));
      });
      setSelectedLocationSlug(hoursResponse.location.slug);
      setLocationDialogOpen(false);
      showSuccessNotification(
        editingLocationSlug ? "Location updated" : "Location created",
        `${hoursResponse.location.name} is ready in your vendor dashboard.`
      );
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setBusyAction("");
    }
  }

  function renderTenantsPage() {
    return (
      <Stack gap="md">
        <Group justify="space-between">
          <div>
            <Text className="neura-label">Locations</Text>
            <Title order={3}>Store locations</Title>
            <Text c="dimmed" size="sm">
              {locations.filter((item) => item.isActive).length}/{activeLocationLimit} active locations
            </Text>
          </div>
          <Button className="neura-primary-button" onClick={() => openLocationDialog()}>
            Add location
          </Button>
        </Group>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        {locations.map((locationItem) => (
          <Card className="neura-card" key={locationItem.id} padding="lg">
            <Stack gap="md">
              <Group justify="space-between">
                <div>
                  <Text className="neura-label">{locationItem.timezone}</Text>
                  <Title order={3}>{locationItem.name}</Title>
                  <Text c="dimmed">
                    {[locationItem.addressLine1, locationItem.city, locationItem.province]
                      .filter(Boolean)
                      .join(", ") || `/${locationItem.slug}`}
                  </Text>
                </div>
                <Group gap="xs">
                  {locationItem.isPrimary ? <Badge>Primary</Badge> : null}
                  <Badge color={locationItem.isActive ? "teal" : "gray"}>
                    {locationItem.isActive ? "Active" : "Inactive"}
                  </Badge>
                  <Badge color={locationItem.openStatus.isOpen ? "teal" : "red"}>
                    {locationItem.openStatus.isOpen ? "Open" : "Closed"}
                  </Badge>
                </Group>
              </Group>
              <Text size="sm" c="dimmed">{locationItem.openStatus.summary}</Text>
              <TextInput label="Join URL" name={`locations.${locationItem.id}.joinUrl`} readOnly value={locationItem.joinUrl} />
              <TextInput label="Monitor URL" name={`locations.${locationItem.id}.monitorUrl`} readOnly value={locationItem.monitorUrl} />
              <Group>
                <Button variant="default" onClick={() => setSelectedLocationSlug(locationItem.slug)}>
                  Select
                </Button>
                <Button variant="default" onClick={() => openLocationDialog(locationItem)}>
                  Edit
                </Button>
                {isOwner && effectiveEntitlements?.brandedQueuePages ? (
                  <Button className="neura-secondary-button" onClick={() => openThemeDialog(locationItem)}>
                    Setup Theme
                  </Button>
                ) : null}
                <Switch
                  checked={locationItem.isActive}
                  disabled={locationItem.isPrimary || busyAction === `location-status:${locationItem.id}`}
                  label="Enabled"
                  name={`locations.${locationItem.id}.isActive`}
                  onChange={(event) =>
                    handleUpdateLocationStatus(locationItem, event.currentTarget.checked)
                  }
                />
              </Group>
            </Stack>
          </Card>
        ))}
        </SimpleGrid>
        <Card className="neura-card" padding="lg">
          <Stack gap="md">
            <Group justify="space-between">
              <div>
                <Text className="neura-label">Counters</Text>
                <Title order={3}>Service counters</Title>
              </div>
              <Badge variant="light">{serviceCounters.length}/{counterLimit}</Badge>
            </Group>
            <SimpleGrid cols={{ base: 1, md: 3 }}>
              {serviceCounters.map((counter) => (
                <Paper key={counter.id} p="md" withBorder>
                  <Group justify="space-between" mb="xs">
                    <Text fw={700}>{counter.name}</Text>
                    <Badge color={counter.isActive ? "teal" : "gray"}>
                      {counter.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </Group>
                  <Text c="dimmed" size="sm">
                    {counter.assignedUserIds
                      .map((userId) => staff.find((member) => member.id === userId)?.name)
                      .filter(Boolean)
                      .join(", ") || "No staff assigned"}
                  </Text>
                  <Group gap="xs" mt="md">
                    <Button size="xs" variant="default" onClick={() => openCounterDialog(counter)}>
                      Edit
                    </Button>
                    <Switch
                      checked={counter.isActive}
                      disabled={busyAction === `counter-status:${counter.id}`}
                      label="Enabled"
                      name={`counters.${counter.id}.isActive`}
                      onChange={(event) =>
                        handleUpdateCounterStatus(counter, event.currentTarget.checked)
                      }
                    />
                  </Group>
                </Paper>
              ))}
            </SimpleGrid>
            <Button
              className="neura-secondary-button"
              disabled={!selectedLocation || serviceCounters.length >= counterLimit}
              onClick={() => openCounterDialog()}
            >
              Add counter
            </Button>
          </Stack>
        </Card>
      </Stack>
    );
  }

  function renderStaffPage() {
    const usedSeats = staff.filter((member) => member.isActive).length + pendingStaffInvites.length;

    return (
      <Stack gap="md">
        <Card className="neura-card" padding="lg">
          <Stack gap="md">
            <Group justify="space-between">
              <div>
                <Text className="neura-label">Staff</Text>
                <Title order={3}>Tenant access</Title>
                <Text c="dimmed" size="sm">
                  {usedSeats}/{staffSeatLimit} staff seats used, including pending invites
                </Text>
              </div>
              <Button
                className="neura-primary-button"
                disabled={usedSeats >= staffSeatLimit}
                onClick={() => setStaffDialogOpen(true)}
              >
                Invite staff
              </Button>
            </Group>
            <Table.ScrollContainer minWidth={720}>
              <Table verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{renderSortHeader(staffSort, setStaffSort, "name", "Name")}</Table.Th>
                    <Table.Th>{renderSortHeader(staffSort, setStaffSort, "contact", "Contact")}</Table.Th>
                    <Table.Th>{renderSortHeader(staffSort, setStaffSort, "status", "Status")}</Table.Th>
                    <Table.Th>{renderSortHeader(staffSort, setStaffSort, "role", "Role")}</Table.Th>
                    <Table.Th>{renderSortHeader(staffSort, setStaffSort, "counters", "Counters")}</Table.Th>
                    <Table.Th>{renderSortHeader(staffSort, setStaffSort, "createdAt", "Date added")}</Table.Th>
                    <Table.Th>{renderSortHeader(staffSort, setStaffSort, "updatedAt", "Updated")}</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {staff.map((member) => (
                    <Table.Tr key={member.id}>
                      <Table.Td fw={700}>{member.name}</Table.Td>
	                      <Table.Td>{member.email || member.phone || "--"}</Table.Td>
                      <Table.Td>
                        <Badge color={member.isActive ? "teal" : "gray"} variant="light">
                          {member.isActive ? "Active" : "Disabled"}
                        </Badge>
                      </Table.Td>
	                      <Table.Td>
	                        {member.role === "owner" ? (
	                          <Badge color="dark" variant="light">Owner</Badge>
	                        ) : !isOwner ? (
	                          <Badge variant="light">{member.role === "admin" ? "Admin" : "Staff"}</Badge>
	                        ) : (
	                          <Select
	                            data={[
	                              { label: "Admin", value: "admin" },
	                              { label: "Staff", value: "staff" }
	                            ]}
	                            name={`staff.${member.id}.role`}
	                            value={member.role}
	                            onChange={(value) =>
	                              value && handleUpdateStaffRole(member, value as "admin" | "staff")
	                            }
	                          />
	                        )}
	                      </Table.Td>
                      <Table.Td>
                        {member.assignedCounterIds
                          .map((counterId) => serviceCounters.find((counter) => counter.id === counterId)?.name)
                          .filter(Boolean)
                          .join(", ") || "--"}
                      </Table.Td>
                      <Table.Td>{renderRelativeDateTime(member.createdAt)}</Table.Td>
                      <Table.Td>{renderRelativeDateTime(member.updatedAt)}</Table.Td>
                      <Table.Td>
                        <Group justify="flex-end" gap="xs">
                          {member.role !== "owner" && (isOwner || (isTenantAdmin && member.role === "staff")) ? (
                            <Switch
                              checked={member.isActive}
                              disabled={busyAction === `staff-access:${member.id}`}
                              label="Enabled"
                              name={`staff.${member.id}.isActive`}
                              onChange={(event) =>
                                handleUpdateStaffAccess(member, event.currentTarget.checked)
                              }
                            />
                          ) : null}
                          {isOwner && member.role !== "owner" ? (
                            <Tooltip label="Remove staff access" withArrow>
                              <ActionIcon
                                aria-label={`Remove ${member.name}`}
                                color="red"
                                onClick={() => handleRemoveStaff(member)}
                                size="lg"
                                variant="light"
                              >
                                <IconTrash size={16} />
                              </ActionIcon>
                            </Tooltip>
                          ) : null}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Stack>
        </Card>

        <Card className="neura-card" padding="lg">
          <Stack gap="md">
            <div>
              <Text className="neura-label">Pending invitations</Text>
              <Title order={3}>Awaiting acceptance</Title>
            </div>
            <Table.ScrollContainer minWidth={640}>
              <Table verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{renderSortHeader(inviteSort, setInviteSort, "email", "Email")}</Table.Th>
                    <Table.Th>{renderSortHeader(inviteSort, setInviteSort, "role", "Role")}</Table.Th>
                    <Table.Th>{renderSortHeader(inviteSort, setInviteSort, "expiresAt", "Expires")}</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {pendingStaffInvites.length ? (
                    pendingStaffInvites.map((invitation) => (
                      <Table.Tr key={invitation.id}>
                        <Table.Td fw={700}>{invitation.email}</Table.Td>
	                        <Table.Td>
	                          <Badge variant="light">{invitation.role === "admin" ? "Admin" : "Staff"}</Badge>
	                        </Table.Td>
                        <Table.Td>{formatDate(invitation.expiresAt)}</Table.Td>
                        <Table.Td>
                          <Group justify="flex-end" gap="xs">
                            <Button
                              disabled={busyAction === `staff-invite-resend:${invitation.id}`}
                              size="xs"
                              variant="light"
                              onClick={() => handleResendStaffInvite(invitation)}
                            >
                              Resend
                            </Button>
                            <Button
                              color="red"
                              disabled={busyAction === `staff-invite-revoke:${invitation.id}`}
                              size="xs"
                              variant="light"
                              onClick={() => handleRevokeStaffInvite(invitation)}
                            >
                              Revoke
                            </Button>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))
                  ) : (
                    <Table.Tr>
                      <Table.Td colSpan={4}>
                        <Text c="dimmed" size="sm">No pending staff invitations.</Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Stack>
        </Card>
      </Stack>
    );
  }

  function renderClientsPage() {
    const totalClientItems = clients?.total ?? clients?.clients.length ?? 0;
    const totalClientPages = clients?.totalPages ?? 1;

    return (
      <Card className="neura-card" padding="lg">
        <Stack gap="md">
          <Group justify="space-between">
            <div>
              <Text className="neura-label">Clients</Text>
              <Title order={3}>Customer history</Title>
            </div>
            <Badge variant="light">{clients?.historyLabel || "History window"}</Badge>
          </Group>
          <Group align="flex-end" justify="space-between">
            <TextInput
              label="Search"
              name="clientSearch"
              placeholder="Customer, contact, ticket, status"
              value={clientSearch}
              onChange={(event) => setClientSearch(event.currentTarget.value)}
            />
            <Select
              data={[
                { value: "10", label: "10 rows" },
                { value: "25", label: "25 rows" },
                { value: "50", label: "50 rows" }
              ]}
              label="Rows per page"
              name="clientLimit"
              value={String(clientLimit)}
              onChange={(value) => {
                setClientLimit(Number(value || 25));
                setClientPage(1);
              }}
            />
          </Group>
          <Table.ScrollContainer minWidth={720}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{renderSortHeader(clientSort, setClientSort, "customerName", "Customer")}</Table.Th>
                  <Table.Th>{renderSortHeader(clientSort, setClientSort, "contact", "Contact")}</Table.Th>
                  <Table.Th>{renderSortHeader(clientSort, setClientSort, "visitCount", "Visits")}</Table.Th>
                  <Table.Th>{renderSortHeader(clientSort, setClientSort, "latestTicketNumber", "Latest ticket")}</Table.Th>
                  <Table.Th>{renderSortHeader(clientSort, setClientSort, "latestVisitAt", "Latest visit")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {clients?.clients.length ? (
                  clients.clients.map((client) => (
                    <Table.Tr key={client.id}>
                      <Table.Td fw={700}>{client.customerName}</Table.Td>
                      <Table.Td>{[client.customerEmail, client.customerPhone].filter(Boolean).join(" | ") || "—"}</Table.Td>
                      <Table.Td>{client.visitCount}</Table.Td>
                      <Table.Td>{client.latestTicketNumber}</Table.Td>
                      <Table.Td>{renderRelativeDateTime(client.latestVisitAt)}</Table.Td>
                    </Table.Tr>
                  ))
                ) : (
                  <Table.Tr>
                    <Table.Td colSpan={5}>
                      <DashboardEmptyState
                        title="No client history yet."
                        text="Client records appear after tickets are created."
                      />
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          <Group justify="space-between">
            <Text c="dimmed" size="sm">
              {totalClientItems
                ? `Showing page ${clientPage} of ${totalClientPages} (${totalClientItems} records)`
                : "No client records"}
            </Text>
            <Pagination
              disabled={totalClientPages <= 1}
              onChange={setClientPage}
              total={totalClientPages}
              value={clientPage}
            />
          </Group>
        </Stack>
      </Card>
    );
  }

  function renderHistoryPage() {
    const tickets = history?.tickets || snapshot?.history || [];
    const totalHistoryItems = history?.total ?? tickets.length;
    const totalHistoryPages = history?.totalPages ?? 1;
    const exportTypeOptions = [
      effectiveEntitlements?.csvExport ? { value: "csv", label: "CSV" } : null,
      effectiveEntitlements?.pdfExport ? { value: "pdf", label: "PDF" } : null
    ].filter(Boolean) as Array<{ value: "csv" | "pdf"; label: string }>;
    const historyRangeOptions =
      effectiveEntitlements?.allowedHistoryExportRanges?.map((range) => ({
        value: range,
        label:
          range === "today"
            ? "Today"
            : range === "week"
              ? "1 Week"
              : range === "month"
                ? "1 Month"
                : range === "quarter"
                  ? "3 Months"
                  : "1 Year"
      })) || [];

    return (
      <Card className="neura-card" padding="lg">
        <Stack gap="md">
          <Group justify="space-between">
            <div>
              <Text className="neura-label">History</Text>
              <Title order={3}>Completed queue activity</Title>
            </div>
            <Badge variant="light">{history?.historyLabel || "Recent history"}</Badge>
          </Group>
          <Group align="flex-end" justify="space-between">
            <Group align="flex-end">
              <TextInput
                label="Search"
                name="historySearch"
                placeholder="Ticket, customer, status"
                value={historySearch}
                onChange={(event) => setHistorySearch(event.currentTarget.value)}
              />
              <Select
                data={[
                  { value: "10", label: "10 rows" },
                  { value: "25", label: "25 rows" },
                  { value: "50", label: "50 rows" }
                ]}
                label="Rows per page"
                name="historyLimit"
                value={String(historyLimit)}
                onChange={(value) => {
                  setHistoryLimit(Number(value || 25));
                  setHistoryPage(1);
                }}
              />
            </Group>
            {canManageTenant && exportTypeOptions.length && historyRangeOptions.length ? (
              <Group align="flex-end">
              <Select
                data={exportTypeOptions}
                label="Export type"
                name="historyExportFormat"
                value={historyExportFormat}
                onChange={(value) => setHistoryExportFormat(value as "csv" | "pdf" | null)}
              />
              <Select
                data={historyRangeOptions}
                label="History length"
                name="historyExportRange"
                value={historyExportRange}
                onChange={(value) => setHistoryExportRange(value as HistoryExportRange | null)}
              />
              <Button
                className="neura-secondary-button"
                disabled={!historyExportFormat || !historyExportRange}
                onClick={() =>
                  historyExportFormat &&
                  historyExportRange &&
                  handleHistoryExport(historyExportRange, historyExportFormat)
                }
              >
                Export
              </Button>
              </Group>
            ) : null}
          </Group>
          <Table.ScrollContainer minWidth={620}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{renderSortHeader(historySort, setHistorySort, "ticketNumber", "Ticket")}</Table.Th>
                  <Table.Th>{renderSortHeader(historySort, setHistorySort, "customerName", "Customer")}</Table.Th>
                  <Table.Th>{renderSortHeader(historySort, setHistorySort, "status", "Status")}</Table.Th>
                  <Table.Th>{renderSortHeader(historySort, setHistorySort, "updatedAt", "Updated")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {tickets.length ? (
                  tickets.map((ticket) => (
                    <Table.Tr key={ticket.id}>
                      <Table.Td fw={700}>{ticket.ticketNumber}</Table.Td>
                      <Table.Td>{ticket.customerName}</Table.Td>
                      <Table.Td><Badge variant="light">{ticket.status}</Badge></Table.Td>
                      <Table.Td>{formatHistoryDateTime(ticket.updatedAt)}</Table.Td>
                    </Table.Tr>
                  ))
                ) : (
                  <Table.Tr>
                    <Table.Td colSpan={4}>
                      <DashboardEmptyState
                        title="No completed queue activity yet."
                        text="Served and skipped tickets will gather here over time."
                      />
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          <Group justify="space-between">
            <Text c="dimmed" size="sm">
              {totalHistoryItems
                ? `Showing page ${historyPage} of ${totalHistoryPages} (${totalHistoryItems} records)`
                : "No history records"}
            </Text>
            <Pagination
              disabled={totalHistoryPages <= 1}
              onChange={setHistoryPage}
              total={totalHistoryPages}
              value={historyPage}
            />
          </Group>
        </Stack>
      </Card>
    );
  }

  function renderReportsPage() {
    return (
      <Stack gap="md">
        {renderStats()}
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
          <Card className="neura-card" padding="lg">
            <Stack gap="md">
              <div>
                <Text className="neura-label">Usage</Text>
                <Title order={3}>Plan consumption</Title>
              </div>
              <SimpleGrid cols={2}>
                <MetricCard label="Tickets" value={`${ticketUsage}/${ticketLimit || "--"}`} detail="Current period" />
                <MetricCard label="Emails" value={`${emailUsage}/${emailLimit ?? "--"}`} detail="Transactional" />
              </SimpleGrid>
            </Stack>
          </Card>
          {renderServiceTrend()}
        </SimpleGrid>
      </Stack>
    );
  }

  function renderSettingsPage() {
    return (
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
          {isOwner ? (
          <Card className="neura-card" padding="lg">
            <Stack gap="md">
              <Group justify="space-between" align="flex-start">
                <div>
                  <Text className="neura-label">Subscription</Text>
                  <Title order={3}>{renderActivePlanName()}</Title>
                  <Text c="dimmed" size="sm">
                    {billing?.subscription
                      ? `${billing.subscription.status} via ${billing.subscription.provider}`
                      : "Choose a plan to unlock tenant entitlements."}
                  </Text>
                </div>
                {billing?.subscription?.currentPeriodEnd ? (
                  <Badge variant="light">Renews {formatDate(billing.subscription.currentPeriodEnd)}</Badge>
                ) : null}
              </Group>
              <SimpleGrid cols={2}>
                <MetricCard label="Tickets" value={`${ticketUsage}/${ticketLimit || "--"}`} detail="Current period" />
                <MetricCard label="Emails" value={`${emailUsage}/${emailLimit ?? "--"}`} detail="Transactional" />
              </SimpleGrid>
            </Stack>
          </Card>
          ) : null}

          <Card className="neura-card" padding="lg">
            <form onSubmit={handleSaveSettings}>
              <Stack gap="md">
                <div>
                  <Text className="neura-label">Tenant settings</Text>
                  <Title order={3}>Queue preferences</Title>
                </div>
                <TextInput
                  label="Queue prefix"
                  maxLength={4}
                  name="queuePrefix"
                  value={settings.queuePrefix}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      queuePrefix: event.target.value.toUpperCase()
                    }))
                  }
                />
                <NumberInput
                  label="Average service minutes"
                  min={1}
                  name="averageServiceMinutes"
                  value={Number(settings.averageServiceMinutes)}
                  onChange={(value) =>
                    setSettings((current) => ({ ...current, averageServiceMinutes: value || 1 }))
                  }
                />
                <NumberInput
                  label="Notify when within"
                  min={1}
                  name="notificationThreshold"
                  value={Number(settings.notificationThreshold)}
                  onChange={(value) =>
                    setSettings((current) => ({ ...current, notificationThreshold: value || 1 }))
                  }
                />
                {isOwner ? (
                  <>
                    <TextInput
                      label="Contact email"
                      name="contactEmail"
                      type="email"
                      value={settings.contactEmail}
                      onChange={(event) =>
                        setSettings((current) => ({ ...current, contactEmail: event.target.value }))
                      }
                    />
                    <TextInput
                      label="Contact phone"
                      name="contactPhone"
                      value={settings.contactPhone}
                      onChange={(event) =>
                        setSettings((current) => ({ ...current, contactPhone: event.target.value }))
                      }
                    />
                  </>
                ) : null}
                <Button className="neura-secondary-button" disabled={busyAction === "settings"} type="submit">
                  {busyAction === "settings" ? "Saving..." : "Save settings"}
                </Button>
              </Stack>
            </form>
          </Card>
        </SimpleGrid>

        {isOwner && !activeSubscription ? <Card className="neura-card" padding="lg">{renderPlanCards()}</Card> : null}
      </Stack>
    );
  }

  function renderAccountPage() {
    return (
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
          <Card className="neura-card" padding="lg">
            <form onSubmit={handleSaveAccountProfile}>
              <Stack gap="md">
                <div>
                  <Text className="neura-label">Personal account</Text>
                  <Title order={3}>Profile details</Title>
                  <Text c="dimmed" size="sm">
                    These details identify you inside vendor workspaces and staff records.
                  </Text>
                </div>
                <TextInput
                  label="Full name"
                  name="name"
                  required
                  value={accountProfileForm.name}
                  onChange={(event) =>
                    setAccountProfileForm((current) => ({
                      ...current,
                      name: event.target.value
                    }))
                  }
                />
                <TextInput
                  label="Email"
                  name="email"
                  required
                  type="email"
                  value={accountProfileForm.email}
                  onChange={(event) =>
                    setAccountProfileForm((current) => ({
                      ...current,
                      email: event.target.value
                    }))
                  }
                />
                <TextInput
                  label="Contact phone"
                  name="phone"
                  value={accountProfileForm.phone}
                  onChange={(event) =>
                    setAccountProfileForm((current) => ({
                      ...current,
                      phone: event.target.value
                    }))
                  }
                />
                <Button
                  className="neura-secondary-button"
                  disabled={busyAction === "account-profile"}
                  type="submit"
                >
                  {busyAction === "account-profile" ? "Saving..." : "Save profile"}
                </Button>
              </Stack>
            </form>
          </Card>

          <Card className="neura-card" padding="lg">
            <form onSubmit={handleSaveAccountPassword}>
              <Stack gap="md">
                <div>
                  <Text className="neura-label">Security</Text>
                  <Title order={3}>Password</Title>
                  <Text c="dimmed" size="sm">
                    Keep your vendor access protected with a private password.
                  </Text>
                </div>
                {user?.hasPassword ? (
                  <PasswordInput
                    label="Current password"
                    name="currentPassword"
                    required
                    value={accountPasswordForm.currentPassword}
                    onChange={(event) =>
                      setAccountPasswordForm((current) => ({
                        ...current,
                        currentPassword: event.target.value
                      }))
                    }
                  />
                ) : null}
                <PasswordInput
                  description="Use at least 8 characters."
                  label="New password"
                  name="newPassword"
                  required
                  value={accountPasswordForm.newPassword}
                  onChange={(event) =>
                    setAccountPasswordForm((current) => ({
                      ...current,
                      newPassword: event.target.value
                    }))
                  }
                />
                <PasswordInput
                  label="Confirm new password"
                  name="confirmPassword"
                  required
                  value={accountPasswordForm.confirmPassword}
                  onChange={(event) =>
                    setAccountPasswordForm((current) => ({
                      ...current,
                      confirmPassword: event.target.value
                    }))
                  }
                />
                <Button
                  className="neura-secondary-button"
                  disabled={busyAction === "account-password"}
                  type="submit"
                >
                  {busyAction === "account-password" ? "Saving..." : "Update password"}
                </Button>
              </Stack>
            </form>
          </Card>
        </SimpleGrid>
      </Stack>
    );
  }

  function renderCounterDialog() {
    return (
      <Modal
        centered
        opened={counterDialogOpen}
        onClose={() => setCounterDialogOpen(false)}
        title={editingCounterSlug ? "Edit counter" : "Add counter"}
      >
        <form onSubmit={handleSaveCounter}>
          <Stack gap="md">
            <TextInput
              label="Counter name"
              name="name"
              required
              value={counterForm.name}
              onChange={(event) => handleCounterNameChange(event.target.value)}
            />
            <Stack gap={4}>
              <TextInput
                error={counterSlugError}
                label="Counter slug"
                name="slug"
                required
                value={counterForm.slug}
                onChange={(event) => handleCounterSlugChange(event.target.value)}
              />
              {!counterSlugError ? (
                <Text c={counterSlugHelperColor} size="xs">
                  {counterSlugMessage}
                </Text>
              ) : null}
            </Stack>
            <Checkbox
              checked={counterForm.isActive}
              label="Active counter"
              name="isActive"
              onChange={(event) =>
                setCounterForm((current) => ({ ...current, isActive: event.target.checked }))
              }
            />
            <MultiSelect
              data={staff.map((member) => ({ label: member.name, value: member.id }))}
              label="Assigned staff"
              name="assignedUserIds"
              value={counterForm.assignedUserIds}
              onChange={(value) =>
                setCounterForm((current) => ({ ...current, assignedUserIds: value }))
              }
            />
            <Group justify="space-between">
              {editingCounterSlug ? (
                <Button color="red" variant="subtle" onClick={handleDeleteCounterFromDialog}>
                  Delete counter
                </Button>
              ) : <div />}
              <Group justify="flex-end">
                <Button variant="default" onClick={() => setCounterDialogOpen(false)}>
                  Cancel
                </Button>
                <Button className="neura-primary-button" disabled={!canSaveCounter} type="submit">
                  {editingCounterSlug ? "Save counter" : "Create counter"}
                </Button>
              </Group>
            </Group>
          </Stack>
        </form>
      </Modal>
    );
  }

  function renderStaffDialog() {
    return (
      <Modal centered opened={staffDialogOpen} onClose={() => setStaffDialogOpen(false)} title="Invite staff">
        <form onSubmit={handleAddStaff}>
          <Stack gap="md">
            <TextInput
              label="Email"
              name="email"
              required
              type="email"
              value={staffForm.email}
              onChange={(event) =>
                setStaffForm((current) => ({ ...current, email: event.target.value }))
              }
            />
            {isOwner ? (
              <Select
                data={[
                  { label: "Staff", value: "staff" },
                  { label: "Admin", value: "admin" }
                ]}
                label="Role"
                name="role"
                value={staffForm.role}
                onChange={(value) =>
                  setStaffForm((current) => ({
                    ...current,
                    role: value === "admin" ? "admin" : "staff"
                  }))
                }
              />
            ) : null}
            <Text c="dimmed" size="sm">
              The invitee can use an existing GetPrio account or register a new one with this email.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setStaffDialogOpen(false)}>
                Cancel
              </Button>
              <Button className="neura-primary-button" disabled={busyAction === "staff-save"} type="submit">
                Send invite
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    );
  }

  function renderConfirmDialog() {
    return (
      <Modal
        centered
        opened={Boolean(confirmAction)}
        onClose={() => setConfirmAction(null)}
        title={confirmAction?.title || "Confirm action"}
      >
        <Stack gap="md">
          <Text c="dimmed">{confirmAction?.message}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              disabled={busyAction === "confirm-action"}
              onClick={handleConfirmAction}
            >
              {busyAction === "confirm-action" ? "Working..." : confirmAction?.confirmLabel || "Confirm"}
            </Button>
          </Group>
        </Stack>
      </Modal>
    );
  }

  function renderDashboardSidebar({ compact = false }: { compact?: boolean } = {}) {
    return (
      <Stack className={compact ? "neura-sidebar-content" : undefined} gap="lg" h="100%">
        <Group gap="sm" className="neura-brand">
          <img alt="GetPrio logo" className="neura-logo" src="/brand/getprio-mark.svg" />
          <div>
            <Text fw={800}>GetPrio</Text>
            <Text size="xs" c="dimmed">Queue Platform</Text>
          </div>
        </Group>

        <ScrollArea className="neura-nav-scroll">
          <Stack gap={8}>
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  className="neura-nav-link"
                  key={item.section}
                  onClick={() => setSidebarOpen(false)}
                  to={`/dashboard/${item.section}`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                  <IconChevronRight className="neura-nav-chevron" size={16} />
                </NavLink>
              );
            })}
          </Stack>
        </ScrollArea>

        <Paper className="neura-sidebar-card" p="md">
          <Group align="flex-start" justify="space-between" gap="sm">
            <div>
              <Text size="xs" c="dimmed">Current tenant</Text>
              <Text fw={700}>{snapshot?.tenant.name || user?.tenants[0]?.name || "Tenant"}</Text>
              <Text size="sm" c="dimmed">{selectedLocation?.name || "Primary location"}</Text>
              <Badge color={activeSubscription ? "teal" : "orange"} mt="sm">
                {activeSubscription ? activeSubscription.planName : "No active plan"}
              </Badge>
            </div>
            <Tooltip label="Log out" withArrow>
              <ActionIcon
                aria-label="Log out"
                className="neura-sidebar-logout"
                color="red"
                onClick={logout}
                radius="xl"
                size={42}
                variant="filled"
              >
                <IconLogout size={20} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Paper>
      </Stack>
    );
  }

  function renderCurrentSection() {
    if (!activeSubscription && currentSection !== "settings" && currentSection !== "account") {
      return <ActivationPanel onViewPlans={() => setPlanDialogOpen(true)} />;
    }

    if (currentSection === "queue") {
      return renderQueuePage();
    }

    if (currentSection === "tenants") {
      return renderTenantsPage();
    }

    if (currentSection === "clients") {
      return renderClientsPage();
    }

    if (currentSection === "staff") {
      return renderStaffPage();
    }

    if (currentSection === "history") {
      return renderHistoryPage();
    }

    if (currentSection === "reports") {
      return renderReportsPage();
    }

    if (currentSection === "account") {
      return renderAccountPage();
    }

    return renderSettingsPage();
  }

  if (loading) {
    return <Card className="neura-card">Loading dashboard...</Card>;
  }

  if (invalidSection) {
    return <Navigate to="/dashboard/queue" replace />;
  }

  if (selectedTenantRole === "staff" && !staffAllowedSections.has(currentSection)) {
    return <Navigate to="/dashboard/queue" replace />;
  }

  if (selectedTenantRole === "admin" && !adminAllowedSections.has(currentSection)) {
    return <Navigate to="/dashboard/queue" replace />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!user.tenants?.length) {
    return (
      <Card className="neura-card neura-no-tenant-card" padding="xl">
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
          <Stack justify="center" gap="md">
            <Text className="neura-label">Workspace access</Text>
            <Title order={1}>No vendor tenants found</Title>
            <Text>Your account does not currently have access to a tenant workspace.</Text>
          </Stack>
          <img
            alt=""
            className="neura-no-tenant-art"
            src="/illustrations/generated/vendor-onboarding.png"
          />
        </SimpleGrid>
      </Card>
    );
  }

  return (
    <div className="neura-shell">
      <aside className="neura-sidebar">
        {renderDashboardSidebar()}
      </aside>

      <Button
        aria-label="Toggle dashboard navigation"
        className="neura-floating-sidebar-toggle"
        onClick={() => setSidebarOpen((current) => !current)}
        variant="filled"
      >
        <Burger
          aria-hidden
          color="#ffffff"
          opened={sidebarOpen}
          size="sm"
        />
      </Button>

      <main className="neura-main">
        <header className="neura-header">
          <Group align="flex-start" gap="md">
            <div>
              <Text className="neura-label">Analytics dashboard</Text>
              <Title order={1}>
                {currentSection === "queue"
                  ? "Live queue"
                  : navItems.find((item) => item.section === currentSection)?.label}
              </Title>
              <Text c="dimmed">Manage service flow, customers, reports, and subscription settings.</Text>
            </div>
          </Group>
          <Select
            className="neura-tenant-select"
            data={user.tenants.map((tenant) => ({ label: tenant.name, value: tenant.slug }))}
            label="Tenant"
            name="selectedTenantSlug"
            value={selectedTenantSlug}
            onChange={(value) => {
              if (value) {
                setSelectedTenantSlug(value);
                setSelectedLocationSlug("");
              }
            }}
          />
          <Select
            className="neura-tenant-select"
            data={locations.map((locationItem) => ({
              label: locationItem.name,
              value: locationItem.slug
            }))}
            label="Location"
            name="selectedLocationSlug"
            value={selectedLocationSlug}
            onChange={(value) => value && setSelectedLocationSlug(value)}
          />
        </header>

        <div style={{ position: "relative" }}>
          <LoadingOverlay
            visible={showDashboardOverlay}
            zIndex={20}
            overlayProps={{ blur: 2, radius: "md" }}
          />
          {error ? <Text c="red" fw={700}>{error}</Text> : null}
          {renderCurrentSection()}
        </div>
      </main>
      {renderPlanDialog()}
      {renderLocationDialog()}
      {renderCounterDialog()}
      {renderStaffDialog()}
      {renderThemeDialog()}
      {renderConfirmDialog()}
      <Drawer
        classNames={{ body: "neura-drawer-body", content: "neura-drawer-content", header: "neura-drawer-header" }}
        hiddenFrom="lg"
        onClose={() => setSidebarOpen(false)}
        opened={sidebarOpen}
        padding="md"
        position="left"
        size={300}
        title="Dashboard"
      >
        {renderDashboardSidebar({ compact: true })}
      </Drawer>
    </div>
  );
}
