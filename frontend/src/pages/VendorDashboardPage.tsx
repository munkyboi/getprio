import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  ActionIcon,
  Badge,
  Burger,
  Button,
  Card,
  Checkbox,
  ColorInput,
  Divider,
  Drawer,
  FileInput,
  Image,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  Notification,
  Pagination,
  Paper,
  Portal,
  ScrollArea,
  Select,
  SegmentedControl,
  SimpleGrid,
  Slider,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
  Box
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import {
  IconBellRinging,
  IconChartBar,
  IconBriefcase,
  IconCalendar,
  IconCalendarCheck,
  IconChevronRight,
  IconAlertTriangle,
  IconClipboardList,
  IconCheck,
  IconExternalLink,
  IconHistory,
  IconHomeStats,
  IconInfoCircle,
  IconLogout,
  IconPencil,
  IconQrcode,
  IconTrash,
  IconX,
  IconSettings,
  IconUsersGroup
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { addDays, differenceInMinutes } from "date-fns";
import QRCode from "react-qr-code";
import { Navigate, NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import type {
  BillingOverviewResponse,
  CreateWalkInTicketRequest,
  QueueHistoryTicket,
  QueueListTicket,
  PublicBoardThemeSettings,
  QueueSnapshot,
  StoreHourSummary,
  StoreLocationWithHours,
  ServiceCounterSummary,
  SaveServiceCounterRequest,
  VendorStaffSummary,
  AddVendorStaffRequest,
  HistoryExportRange,
  SubscriptionPlanSlug,
  TicketMutationResponse,
  UpdateTenantSettingsRequest,
  SaveVendorAvailabilityBlockRequest,
  SaveVendorAvailabilityExceptionRequest,
  SaveVendorServiceRequest,
  TenantNotificationSettings,
  VendorAvailabilityBlockSummary,
  VendorAvailabilityExceptionSummary,
  VendorBookingSummary,
  BookingSlotSummary,
  VendorClientsResponse,
  VendorServiceSummary,
  UpdateVendorBookingStatusRequest,
  PaginationMetadata
} from "@shared";
import { API_BASE_URL } from "../api/client";
import PhilippineMobileInput from "../components/PhilippineMobileInput";
import * as vendorDashboardBookings from "../api/vendorDashboardBookings";
import * as vendorDashboardQueue from "../api/vendorDashboardQueue";
import * as vendorDashboardCatalog from "../api/vendorDashboardCatalog";
import * as vendorDashboardOperations from "../api/vendorDashboardOperations";
import * as vendorDashboardBilling from "../api/vendorDashboardBilling";
import * as vendorDashboardBootstrap from "../api/vendorDashboardBootstrap";
import * as vendorDashboardExport from "../api/vendorDashboardExport";
import { useAuth } from "../context/AuthContext";
import { ConfirmActionModal } from "../components/ConfirmActionModal";
import { shouldEnableVendorDashboardBootstrap } from "../lib/vendorDashboardBootstrap";
import { buildJoinUrl, buildMonitorUrl } from "../queuePaths";
import {
  formatDateInputValue,
  formatDateTime,
  formatBookingScheduleDateTime,
  formatBookingScheduleTimeRange,
  formatDisplayDate,
  toTimestamp
} from "../utils/dates";
import { getErrorMessage } from "../utils/errors";
import { isBrowserPushSupported, subscribeToBrowserPush } from "../utils/pushNotifications";
import { checkServiceSlugAvailability } from "../api/vendorDashboardCatalog";
import { checkCounterSlugAvailability } from "../api/vendorDashboardOperations";

const dashboardSections = new Set(["queue", "tenants", "services", "bookings", "staff", "clients", "history", "reports", "settings"]);
const SERVICE_TREND_USER_LIMIT = 30;

function IconActionButton({
  label,
  color = "gray",
  onClick,
  children,
  disabled = false
}: {
  label: string;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <Tooltip label={label} withArrow>
      <ActionIcon aria-label={label} color={color} disabled={disabled} onClick={onClick} variant="light">
        {children}
      </ActionIcon>
    </Tooltip>
  );
}

function buildServiceSlug(value: string) {
  const source = String(value || "").trim().toLowerCase();
  let normalizedSlug = "";
  let previousWasDash = false;

  for (const char of source) {
    const isAlphaNumeric = (char >= "a" && char <= "z") || (char >= "0" && char <= "9");
    if (isAlphaNumeric) {
      normalizedSlug += char;
      previousWasDash = false;
    } else if (!previousWasDash && normalizedSlug.length > 0) {
      normalizedSlug += "-";
      previousWasDash = true;
    }
  }

  if (normalizedSlug.endsWith("-")) {
    normalizedSlug = normalizedSlug.slice(0, -1);
  }

  normalizedSlug = normalizedSlug.slice(0, 80);

  return normalizedSlug;
}

function buildCounterSlug(value: string) {
  return buildServiceSlug(value);
}

function buildLocationSlug(value: string) {
  return buildServiceSlug(value);
}

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
  autoPauseEnabled: false,
  autoPauseThreshold: 20,
  autoResumeEnabled: false,
  autoResumeVacancyPercent: 20,
  contactEmail: "",
  contactPhone: ""
};

const defaultNotificationSettings = {
  queueJoin: true,
  bookingIntake: true,
  paymentProofReview: true,
  bookingStatusChanges: true
};

const defaultHours: StoreHourSummary[] = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  opensAt: "09:00",
  closesAt: "17:00",
  isClosed: true
}));

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
  paymentMethodLabel: "",
  paymentAccountDisplayName: "",
  paymentAccountIdentifierDisplay: "",
  paymentQrImageUrl: "",
  paymentQrActive: false,
  isPrimary: false,
  isActive: true,
  hours: defaultHours
};

const emptyServiceForm: SaveVendorServiceRequest = {
  name: "",
  slug: "",
  description: "",
  durationMinutes: 30,
  allowBookingQuantity: false,
  bookingQuantityLabel: "Units",
  manualPaymentRequired: false,
  bookingCapacityScope: "service",
  priceAmountCents: 0,
  priceDisplay: "",
  isActive: true,
  sortOrder: 0
};

const emptyAvailabilityBlockForm: SaveVendorAvailabilityBlockRequest = {
  locationSlug: "",
  serviceSlug: "",
  weekday: 1,
  startsAt: "09:00",
  endsAt: "17:00",
  capacity: 1,
  isActive: true,
  notes: ""
};

const emptyAvailabilityExceptionForm: SaveVendorAvailabilityExceptionRequest = {
  locationSlug: "",
  serviceSlug: "",
  exceptionDate: "",
  startsAt: "",
  endsAt: "",
  isAvailable: false,
  capacity: null,
  reason: ""
};

const weekdayOptions = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" }
];

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

type DashboardSection = "queue" | "tenants" | "services" | "bookings" | "staff" | "clients" | "history" | "reports" | "settings";
type QueueView = "current" | "overflow" | "recovery";
type ClientSort = "latestVisitDesc" | "latestVisitAsc" | "nameAsc" | "nameDesc" | "visitsDesc" | "visitsAsc";
type HistorySort = "updatedDesc" | "updatedAsc" | "ticketAsc" | "ticketDesc" | "customerAsc" | "customerDesc";
type BookingStatusFilter = "all" | "pending" | "confirmed" | "rescheduled" | "canceled";

const CLIENTS_PAGE_SIZE = 10;
const HISTORY_PAGE_SIZE = 10;

type DashboardActionResponse = Partial<TicketMutationResponse> & {
  message?: string;
  snapshot?: QueueSnapshot;
};
type VendorHistoryResponse = {
  historyDays?: number;
  historyLabel?: string;
  tickets: QueueHistoryTicket[];
};

const navItems = [
  { section: "queue", label: "Queue", icon: IconClipboardList },
  { section: "tenants", label: "Locations", icon: IconHomeStats },
  { section: "services", label: "Services", icon: IconBriefcase },
  { section: "bookings", label: "Bookings", icon: IconCalendarCheck },
  { section: "staff", label: "Staff", icon: IconUsersGroup },
  { section: "clients", label: "Clients", icon: IconUsersGroup },
  { section: "history", label: "History", icon: IconHistory },
  { section: "reports", label: "Reports", icon: IconChartBar },
  { section: "settings", label: "Settings", icon: IconSettings }
] as const;
const dashboardSectionDescriptions: Record<DashboardSection, string> = {
  queue: "Run the live queue, manage intake, and move customers through service.",
  tenants: "Configure locations, counters, and the public entry points for each branch.",
  services: "Manage bookable services, durations, pricing, and public availability state.",
  bookings: "Review incoming service requests and manage confirmation, rescheduling, or cancellation.",
  staff: "Manage workspace access, roles, and operating status for your team.",
  clients: "Review recent customer activity and returning queue visitors.",
  history: "Inspect completed ticket activity and export queue records.",
  reports: "Track queue usage, service pace, and plan consumption over time.",
  settings: "Adjust subscription, contact details, and queue behavior for this workspace."
};
const adminAllowedSections = new Set<DashboardSection>([
  "queue",
  "tenants",
  "services",
  "bookings",
  "staff",
  "clients",
  "history",
  "reports",
  "settings"
]);
const staffAllowedSections = new Set<DashboardSection>(["queue", "bookings", "clients", "history"]);

function getHistoryTimestamp(value: string | Date): number {
  return toTimestamp(value);
}

function formatDate(value: string | Date | null): string {
  return formatDisplayDate(value);
}

function formatBytes(sizeBytes: number | null): string {
  if (!sizeBytes) {
    return "Unknown size";
  }

  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getTodayDateInputValue(): string {
  return formatDateInputValue();
}

function getBookingBadgeColor(status: VendorBookingSummary["status"]): "gray" | "red" | "yellow" | "orange" | "teal" | "blue" {
  switch (status) {
    case "pending":
      return "yellow";
    case "confirmed":
      return "teal";
    case "rescheduled":
      return "blue";
    case "canceled":
      return "red";
    case "disputed":
      return "orange";
    case "completed":
    case "reviewed":
    default:
      return "gray";
  }
}

function isCheckedInBookingTicket(ticket: {
  servicePriorityBand?: string;
  linkedBookingReference?: string | null;
}) {
  return ticket.servicePriorityBand === "checked_in_booking" || Boolean(ticket.linkedBookingReference);
}

function getMinutesFromNow(value: string | Date): number {
  return differenceInMinutes(new Date(), new Date(value));
}

function getBookingCheckInState(booking: VendorBookingSummary) {
  const minutesFromStart = getMinutesFromNow(booking.scheduledStartAt);
  return {
    isTooEarly: minutesFromStart < -15,
    isLate: minutesFromStart > 15,
    isEligibleStatus: ["confirmed", "rescheduled"].includes(booking.status),
    minutesFromStart
  };
}

function QueueIntakeGauge({
  waitingCount,
  threshold,
  resumeWaitingCount,
  autoResumeEnabled,
  stateLabel,
  state
}: {
  waitingCount: number;
  threshold: number;
  resumeWaitingCount: number | null;
  autoResumeEnabled: boolean;
  stateLabel: string;
  state: "open" | "near_limit" | "paused";
}) {
  const ratio = Math.max(0, Math.min(waitingCount / threshold, 1));
  const color = state === "paused" ? "#e03131" : state === "near_limit" ? "#f08c00" : "#12b886";
  const radius = 46;
  const stroke = 12;
  const circumference = Math.PI * radius;
  const offset = circumference * (1 - ratio);
  const remaining = Math.max(threshold - waitingCount, 0);

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap={8} align="center">
        <Text className="neura-label">Queue intake</Text>
        <svg aria-hidden="true" height="96" viewBox="0 0 140 90" width="140">
          <path
            d="M 24 70 A 46 46 0 0 1 116 70"
            fill="none"
            stroke="#ebe4da"
            strokeLinecap="round"
            strokeWidth={stroke}
          />
          <path
            d="M 24 70 A 46 46 0 0 1 116 70"
            fill="none"
            pathLength={circumference}
            stroke={color}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            strokeWidth={stroke}
          />
          <text fill="#24160f" fontSize="18" fontWeight="700" textAnchor="middle" x="70" y="56">
            {waitingCount}/{threshold}
          </text>
          <text fill="#6f6259" fontSize="10" textAnchor="middle" x="70" y="68">
            {stateLabel}
          </text>
          <text fill="#8a7b70" fontSize="9" textAnchor="start" x="18" y="84">
            0
          </text>
          <text fill="#8a7b70" fontSize="9" textAnchor="end" x="122" y="84">
            {threshold}
          </text>
        </svg>
        <Text c="dimmed" size="sm" ta="center">
          {state === "paused"
            ? autoResumeEnabled && resumeWaitingCount !== null
              ? `Queue will reopen automatically at ${resumeWaitingCount} waiting tickets or below.`
              : "Queue intake is paused until a staff member resumes it."
            : remaining === 0
              ? "Threshold reached."
              : `${remaining} slot${remaining === 1 ? "" : "s"} before auto-pause.`}
        </Text>
      </Stack>
    </Paper>
  );
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
  const { token, user, loading, logout } = useAuth();
  const { section } = useParams<{ section: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentSection = (
    section && dashboardSections.has(section) ? section : "queue"
  ) as DashboardSection;
  const invalidSection = Boolean(section && !dashboardSections.has(section));
  const [selectedTenantSlug, setSelectedTenantSlug] = useState("");
  const [selectedLocationSlug, setSelectedLocationSlug] = useState("");
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);
  const [locations, setLocations] = useState<StoreLocationWithHours[]>([]);
  const [services, setServices] = useState<VendorServiceSummary[]>([]);
  const [availabilityBlocks, setAvailabilityBlocks] = useState<VendorAvailabilityBlockSummary[]>([]);
  const [availabilityExceptions, setAvailabilityExceptions] = useState<VendorAvailabilityExceptionSummary[]>([]);
  const [serviceCounters, setServiceCounters] = useState<ServiceCounterSummary[]>([]);
  const [staff, setStaff] = useState<VendorStaffSummary[]>([]);
  const [staffSeatLimit, setStaffSeatLimit] = useState(0);
  const [counterLimit, setCounterLimit] = useState(0);
  const [activeLocationLimit, setActiveLocationLimit] = useState(1);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [editingLocationSlug, setEditingLocationSlug] = useState("");
  const [editingLocationId, setEditingLocationId] = useState("");
  const [locationForm, setLocationForm] = useState(emptyLocationForm);
  const [locationSlugManuallyEdited, setLocationSlugManuallyEdited] = useState(false);
  const [locationSlugMessage, setLocationSlugMessage] = useState("");
  const [locationSlugAvailable, setLocationSlugAvailable] = useState(false);
  const [checkingLocationSlug, setCheckingLocationSlug] = useState(false);
  const [paymentQrUploadFile, setPaymentQrUploadFile] = useState<File | null>(null);
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [editingServiceSlug, setEditingServiceSlug] = useState("");
  const [editingServiceId, setEditingServiceId] = useState("");
  const [serviceForm, setServiceForm] = useState<SaveVendorServiceRequest>(emptyServiceForm);
  const [serviceSlugManuallyEdited, setServiceSlugManuallyEdited] = useState(false);
  const [serviceSlugMessage, setServiceSlugMessage] = useState("");
  const [serviceSlugAvailable, setServiceSlugAvailable] = useState(false);
  const [checkingServiceSlug, setCheckingServiceSlug] = useState(false);
  const [servicesTab, setServicesTab] = useState<"catalog" | "weekly" | "exceptions">("catalog");
  const [availabilityBlockDialogOpen, setAvailabilityBlockDialogOpen] = useState(false);
  const [editingAvailabilityBlockId, setEditingAvailabilityBlockId] = useState("");
  const [availabilityBlockForm, setAvailabilityBlockForm] = useState<SaveVendorAvailabilityBlockRequest>(emptyAvailabilityBlockForm);
  const [availabilityExceptionDialogOpen, setAvailabilityExceptionDialogOpen] = useState(false);
  const [editingAvailabilityExceptionId, setEditingAvailabilityExceptionId] = useState("");
  const [availabilityExceptionForm, setAvailabilityExceptionForm] = useState<SaveVendorAvailabilityExceptionRequest>(emptyAvailabilityExceptionForm);
  const [availabilityExceptionBlockEntireDay, setAvailabilityExceptionBlockEntireDay] = useState(false);
  const [settings, setSettings] = useState<UpdateTenantSettingsRequest>(defaultSettings);
  const [vendorNotificationSettings, setVendorNotificationSettings] = useState<TenantNotificationSettings>(defaultNotificationSettings);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission>(
    typeof window !== "undefined" && typeof window.Notification !== "undefined"
      ? window.Notification.permission
      : "default"
  );
  const [requestingBrowserPermission, setRequestingBrowserPermission] = useState(false);
  const [browserPushSubscribed, setBrowserPushSubscribed] = useState(false);
  const [savingNotificationSettings, setSavingNotificationSettings] = useState(false);
  const browserNotificationsSupported = isBrowserPushSupported();
  const browserNotificationsSecure = typeof window !== "undefined" ? window.isSecureContext : false;
  const [walkInForm, setWalkInForm] = useState<CreateWalkInTicketRequest>(emptyWalkIn);
  const [billing, setBilling] = useState<BillingOverviewResponse | null>(null);
  const [history, setHistory] = useState<VendorHistoryResponse | null>(null);
  const [clients, setClients] = useState<VendorClientsResponse | null>(null);
  const [vendorBookings, setVendorBookings] = useState<VendorBookingSummary[]>([]);
  const knownBookingIdsRef = useRef<Set<string> | null>(null);
  const [bookingAlertIds, setBookingAlertIds] = useState<string[]>([]);
  const knownBookingAlertIdsRef = useRef<Set<string> | null>(null);
  const [bookingAlertBookings, setBookingAlertBookings] = useState<VendorBookingSummary[]>([]);
  const dismissedBookingAlertIdsRef = useRef<Set<string>>(new Set());
  const knownQueueTicketIdsRef = useRef<Set<string> | null>(null);
  const [queueAlertIds, setQueueAlertIds] = useState<string[]>([]);
  const dismissedQueueAlertIdsRef = useRef<Set<string>>(new Set());
  const [bookingDetailModalId, setBookingDetailModalId] = useState<string | null>(null);
  const [bookingDetailOpen, setBookingDetailOpen] = useState(false);
  const [bookingDetailLoading, setBookingDetailLoading] = useState(false);
  const [bookingDetailBooking, setBookingDetailBooking] = useState<VendorBookingSummary | null>(null);
  const [bookingDetailError, setBookingDetailError] = useState("");
  const [paymentRejectionReason, setPaymentRejectionReason] = useState("");
  const [confirmAction, setConfirmAction] = useState<null | {
    title: string;
    description: string;
    confirmLabel: string;
    confirmColor?: "red" | "orange" | "blue" | "dark";
    onConfirm: () => Promise<void>;
  }>(null);
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
  const [editingCounterId, setEditingCounterId] = useState("");
  const [counterSlugManuallyEdited, setCounterSlugManuallyEdited] = useState(false);
  const [counterSlugMessage, setCounterSlugMessage] = useState("");
  const [counterSlugAvailable, setCounterSlugAvailable] = useState(false);
  const [checkingCounterSlug, setCheckingCounterSlug] = useState(false);
  const [counterForm, setCounterForm] = useState<SaveServiceCounterRequest>({
    name: "",
    slug: "",
    isActive: true,
    assignedUserIds: []
  });
  const [staffDialogOpen, setStaffDialogOpen] = useState(false);
  const [staffForm, setStaffForm] = useState<AddVendorStaffRequest>({
    email: "",
    role: "staff"
  });
  const [historyExportFormat, setHistoryExportFormat] = useState<"csv" | "pdf" | null>(null);
  const [historyExportRange, setHistoryExportRange] = useState<HistoryExportRange | null>(null);
  const [queueView, setQueueView] = useState<QueueView>("current");
  const [clientsSearch, setClientsSearch] = useState("");
  const [clientsSort, setClientsSort] = useState<ClientSort>("latestVisitDesc");
  const [clientsPage, setClientsPage] = useState(1);
  const [historySearch, setHistorySearch] = useState("");
  const [historySort, setHistorySort] = useState<HistorySort>("updatedDesc");
  const [historyPage, setHistoryPage] = useState(1);
  const [bookingSearch, setBookingSearch] = useState("");
  const [bookingStatusFilter, setBookingStatusFilter] = useState<BookingStatusFilter>("all");
  const [bookingDateRange, setBookingDateRange] = useState<[Date | null, Date | null]>(() => [
    new Date(`${getTodayDateInputValue()}T00:00:00`),
    addDays(new Date(`${getTodayDateInputValue()}T00:00:00`), 14)
  ]);
  const [bookingPage, setBookingPage] = useState(1);
  const [bookingPagination, setBookingPagination] = useState<PaginationMetadata | null>(null);

  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [reschedulingBooking, setReschedulingBooking] = useState<VendorBookingSummary | null>(null);
  const [rescheduleStartAt, setRescheduleStartAt] = useState("");
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleSlots, setRescheduleSlots] = useState<BookingSlotSummary[]>([]);
  const [rescheduleSlotsLoading, setRescheduleSlotsLoading] = useState(false);
  const [rescheduleSlotsError, setRescheduleSlotsError] = useState("");
  const [rescheduleBlockModalOpen, setRescheduleBlockModalOpen] = useState(false);
  const hasActiveSubscription = billing?.subscription?.status === "active";
  const selectedLocation =
    locations.find((locationItem) => locationItem.slug === selectedLocationSlug) ||
    snapshot?.location ||
    null;
  const selectedTenantRole =
    user?.tenants.find((tenant) => tenant.slug === selectedTenantSlug)?.role || null;
  const isOwner = selectedTenantRole === "owner";
  const isAdmin = selectedTenantRole === "admin";
  const canManageQueueDay = isOwner || isAdmin;
  const canManageContactSettings = isOwner;
  const canExportHistory = isOwner || isAdmin;
  const canAdminBookings = isOwner || isAdmin;
  const canOperateBookingQueue = Boolean(selectedTenantRole);
  const confirmBusy = Boolean(confirmAction && busyAction);
  const visibleNavItems = isOwner
    ? navItems
    : isAdmin
      ? navItems.filter((item) => adminAllowedSections.has(item.section))
      : navItems.filter((item) => staffAllowedSections.has(item.section));
  const locationQuery = selectedLocationSlug
    ? `?location=${encodeURIComponent(selectedLocationSlug)}`
    : "";
  const dashboardBootstrapQuery = useQuery({
    queryKey: ["vendor-dashboard-bootstrap", token, selectedTenantSlug, selectedLocationSlug, locationQuery],
    queryFn: async () => {
      if (!token || !selectedTenantSlug) {
        throw new Error("Missing dashboard context.");
      }

      return vendorDashboardBootstrap.getBootstrap(token, selectedTenantSlug, locationQuery);
    },
    enabled: shouldEnableVendorDashboardBootstrap(token, selectedTenantSlug)
  });
  const staffQuery = useQuery({
    queryKey: ["vendor-dashboard-staff", token, selectedTenantSlug],
    queryFn: async () => {
      if (!token || !selectedTenantSlug) {
        throw new Error("Missing dashboard context.");
      }

      return vendorDashboardOperations.getStaff(token, selectedTenantSlug);
    },
    enabled: Boolean(token && selectedTenantSlug)
  });
  const servicesQuery = useQuery({
    queryKey: ["vendor-dashboard-services", token, selectedTenantSlug, isOwner, isAdmin],
    queryFn: async () => {
      if (!token || !selectedTenantSlug) {
        throw new Error("Missing dashboard context.");
      }

      return vendorDashboardCatalog.getServices(token, selectedTenantSlug);
    },
    enabled: Boolean(token && selectedTenantSlug && (isOwner || isAdmin))
  });
  const availabilityQuery = useQuery({
    queryKey: ["vendor-dashboard-availability", token, selectedTenantSlug, selectedLocationSlug, isOwner, isAdmin],
    queryFn: async () => {
      if (!token || !selectedTenantSlug || !selectedLocationSlug) {
        throw new Error("Missing dashboard context.");
      }

      return vendorDashboardCatalog.getAvailability(token, selectedTenantSlug, selectedLocationSlug);
    },
    enabled: Boolean(token && selectedTenantSlug && selectedLocationSlug && (isOwner || isAdmin))
  });
  const countersQuery = useQuery({
    queryKey: ["vendor-dashboard-counters", token, selectedTenantSlug, selectedLocationSlug],
    queryFn: async () => {
      if (!token || !selectedTenantSlug || !selectedLocationSlug) {
        throw new Error("Missing dashboard context.");
      }

      return vendorDashboardCatalog.getCounters(token, selectedTenantSlug, selectedLocationSlug);
    },
    enabled: Boolean(token && selectedTenantSlug && selectedLocationSlug)
  });
  const historyQuery = useQuery({
    queryKey: ["vendor-dashboard-history", token, selectedTenantSlug, selectedLocationSlug, currentSection, hasActiveSubscription],
    queryFn: async () => {
      if (!token || !selectedTenantSlug || !selectedLocationSlug) {
        throw new Error("Missing dashboard context.");
      }

      return vendorDashboardOperations.getHistory(token, selectedTenantSlug, selectedLocationSlug);
    },
    enabled: Boolean(token && selectedTenantSlug && selectedLocationSlug && currentSection === "history" && hasActiveSubscription)
  });
  const clientsQuery = useQuery({
    queryKey: ["vendor-dashboard-clients", token, selectedTenantSlug, selectedLocationSlug, currentSection, hasActiveSubscription, locationQuery],
    queryFn: async () => {
      if (!token || !selectedTenantSlug || !selectedLocationSlug) {
        throw new Error("Missing dashboard context.");
      }

      return vendorDashboardOperations.getClients(token, selectedTenantSlug, locationQuery);
    },
    enabled: Boolean(token && selectedTenantSlug && selectedLocationSlug && currentSection === "clients" && hasActiveSubscription)
  });
  const bookingListQuery = useQuery({
    queryKey: [
      "vendor-dashboard-bookings",
      token,
      selectedTenantSlug,
      selectedLocationSlug,
      bookingPage,
      bookingSearch,
      bookingStatusFilter,
      bookingDateRange
    ],
    queryFn: async () => {
      if (!token || !selectedTenantSlug || !selectedLocationSlug) {
        throw new Error("Missing dashboard context.");
      }

      return vendorDashboardBookings.getBookings(token, selectedTenantSlug, selectedLocationSlug, bookingPage, bookingSearch, bookingStatusFilter, [
        bookingDateRange[0] ? formatDateInputValue(bookingDateRange[0]) : null,
        bookingDateRange[1] ? formatDateInputValue(bookingDateRange[1]) : null
      ]);
    },
    enabled: Boolean(token && selectedTenantSlug && selectedLocationSlug && currentSection === "bookings" && hasActiveSubscription && canOperateBookingQueue)
  });
  const bookingAlertsQuery = useQuery({
    queryKey: ["vendor-dashboard-booking-alerts", token, selectedTenantSlug, selectedLocationSlug],
    queryFn: async () => {
      if (!token || !selectedTenantSlug || !selectedLocationSlug) {
        throw new Error("Missing dashboard context.");
      }

      return vendorDashboardBookings.getBookingAlerts(token, selectedTenantSlug, selectedLocationSlug);
    },
    enabled: Boolean(token && selectedTenantSlug && selectedLocationSlug && hasActiveSubscription && canOperateBookingQueue),
    refetchInterval: 15000
  });

  useEffect(() => {
    if (!bookingDetailOpen || !bookingDetailModalId || !token || !selectedTenantSlug) {
      return;
    }

    let active = true;
    setBookingDetailLoading(true);
    setBookingDetailError("");
    setBookingDetailBooking(null);

    vendorDashboardBookings
      .getBookingDetail(token, selectedTenantSlug, bookingDetailModalId, selectedLocationSlug || undefined)
      .then((response) => {
        if (active) {
          setBookingDetailBooking(response.booking);
        }
      })
      .catch((detailError) => {
        if (active) {
          setBookingDetailError(getErrorMessage(detailError));
        }
      })
      .finally(() => {
        if (active) {
          setBookingDetailLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [bookingDetailModalId, bookingDetailOpen, selectedLocationSlug, selectedTenantSlug, token]);

  useEffect(() => {
    if (!rescheduleDialogOpen || !reschedulingBooking || !rescheduleDate || !token || !selectedTenantSlug) {
      return;
    }

    let active = true;
    setRescheduleSlotsLoading(true);
    setRescheduleSlotsError("");

    vendorDashboardBookings
      .getRescheduleSlots(token, selectedTenantSlug, reschedulingBooking.id, rescheduleDate)
      .then((response) => {
        if (!active) {
          return;
        }
        setRescheduleSlots(response.slots);
        if (!response.slots.some((slot) => String(slot.startAt) === rescheduleStartAt)) {
          setRescheduleStartAt("");
        }
      })
      .catch((slotsError) => {
        if (active) {
          setRescheduleSlots([]);
          setRescheduleSlotsError(getErrorMessage(slotsError));
        }
      })
      .finally(() => {
        if (active) {
          setRescheduleSlotsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [rescheduleDate, rescheduleDialogOpen, rescheduleStartAt, reschedulingBooking, selectedTenantSlug, token]);

  useEffect(() => {
    if (!selectedTenantSlug && user?.tenants?.length) {
      setSelectedTenantSlug(user.tenants[0].slug);
    }
  }, [selectedTenantSlug, user]);

  useEffect(() => {
    if (!dashboardBootstrapQuery.data) {
      return;
    }

    const { locationsResponse, snapshotResponse, billingResponse, notificationSettings } = dashboardBootstrapQuery.data;
    setError("");
    setLocations(locationsResponse.locations);
    setActiveLocationLimit(locationsResponse.activeLocationLimit);
    if (!selectedLocationSlug || !locationsResponse.locations.some((item) => item.slug === selectedLocationSlug)) {
      setSelectedLocationSlug(locationsResponse.locations.find((item) => item.isPrimary)?.slug || locationsResponse.locations[0]?.slug || "");
    }
    setSnapshot(snapshotResponse);
    setSettings({
      queuePrefix: snapshotResponse.tenant.queuePrefix,
      averageServiceMinutes: snapshotResponse.tenant.averageServiceMinutes,
      notificationThreshold: snapshotResponse.tenant.notificationThreshold,
      autoPauseEnabled: snapshotResponse.tenant.autoPauseEnabled,
      autoPauseThreshold: snapshotResponse.tenant.autoPauseThreshold ?? 20,
      autoResumeEnabled: snapshotResponse.tenant.autoResumeEnabled,
      autoResumeVacancyPercent: snapshotResponse.tenant.autoResumeVacancyPercent ?? 20,
      contactEmail: snapshotResponse.tenant.contactEmail || "",
      contactPhone: snapshotResponse.tenant.contactPhone || ""
    });
    setBilling(billingResponse);
    setVendorNotificationSettings(notificationSettings);
  }, [dashboardBootstrapQuery.data, selectedLocationSlug]);

  useEffect(() => {
    if (dashboardBootstrapQuery.error) {
      setError(getErrorMessage(dashboardBootstrapQuery.error));
    }
  }, [dashboardBootstrapQuery.error]);

  useEffect(() => {
    if (!staffQuery.data) {
      return;
    }

    setStaff(staffQuery.data.staff);
    setStaffSeatLimit(staffQuery.data.staffSeatLimit);
  }, [staffQuery.data]);

  useEffect(() => {
    if (!servicesQuery.data) {
      return;
    }

    setServices(servicesQuery.data.services);
  }, [servicesQuery.data]);

  useEffect(() => {
    if (!availabilityQuery.data) {
      return;
    }

    setAvailabilityBlocks(availabilityQuery.data.blocks);
    setAvailabilityExceptions(availabilityQuery.data.exceptions);
  }, [availabilityQuery.data]);

  useEffect(() => {
    if (!countersQuery.data) {
      return;
    }

    setServiceCounters(countersQuery.data.counters);
    setCounterLimit(countersQuery.data.counterLimit);
  }, [countersQuery.data]);

  useEffect(() => {
    if (!historyQuery.data) {
      return;
    }

    setHistory(historyQuery.data);
  }, [historyQuery.data]);

  useEffect(() => {
    if (!clientsQuery.data) {
      return;
    }

    setClients(clientsQuery.data);
  }, [clientsQuery.data]);

  useEffect(() => {
    if (!bookingListQuery.data) {
      return;
    }

    syncVendorBookings(bookingListQuery.data.bookings);
    setBookingPagination(bookingListQuery.data.pagination || null);
  }, [bookingListQuery.data]);

  useEffect(() => {
    if (!bookingAlertsQuery.data) {
      return;
    }

    syncBookingAlerts(bookingAlertsQuery.data.bookings, { detectNew: true });
  }, [bookingAlertsQuery.data]);

  useEffect(() => {
    if (!browserNotificationsSupported) {
      return;
    }

    setBrowserPermission(window.Notification.permission);
  }, [browserNotificationsSupported]);

  async function handleRequestBrowserPermission() {
    if (!token || !selectedTenantSlug) {
      notifications.show({
        color: "red",
        title: "Sign in required",
        message: "Sign in and select a tenant before enabling browser notifications."
      });
      return;
    }

    if (!browserNotificationsSupported || !window.Notification) {
      notifications.show({
        color: "red",
        title: "Browser notifications unavailable",
        message: "This browser does not support notifications."
      });
      return;
    }

    if (!browserNotificationsSecure) {
      notifications.show({
        color: "yellow",
        title: "Secure context required",
        message: "Open this page on https:// or localhost to request browser notifications."
      });
      return;
    }

    setRequestingBrowserPermission(true);
    try {
      const { permission } = await subscribeToBrowserPush({ token, tenantSlug: selectedTenantSlug });
      setBrowserPermission(permission);
      setBrowserPushSubscribed(true);
      notifications.show({
        color: "teal",
        title: "Browser notifications enabled",
        message: "This browser is subscribed to vendor operational alerts."
      });
    } catch (permissionError) {
      setBrowserPermission(window.Notification.permission);
      notifications.show({
        color: "red",
        title: "Browser notifications unavailable",
        message: getErrorMessage(permissionError)
      });
    } finally {
      setRequestingBrowserPermission(false);
    }
  }

  async function handleVendorNotificationToggle(
    key: keyof TenantNotificationSettings,
    checked: boolean
  ) {
    if (!token || !selectedTenantSlug) {
      return;
    }

    const nextSettings = {
      ...vendorNotificationSettings,
      [key]: checked
    };

    setVendorNotificationSettings(nextSettings);
    setSavingNotificationSettings(true);

    try {
      const response = await vendorDashboardOperations.updateNotificationSettings(token, selectedTenantSlug, nextSettings);
      setVendorNotificationSettings(response.notificationSettings);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
      setVendorNotificationSettings((current) => ({
        ...current,
        [key]: !checked
      }));
    } finally {
      setSavingNotificationSettings(false);
    }
  }

  useEffect(() => {
    if (!selectedTenantSlug || !selectedLocationSlug || !token) {
      return;
    }

    vendorDashboardCatalog.getCounters(token, selectedTenantSlug, selectedLocationSlug)
      .then((data) => {
        setServiceCounters(data.counters);
        setCounterLimit(data.counterLimit);
        setSelectedCounterSlug((current) =>
          current && data.counters.some((counter) => counter.slug === current && counter.isActive)
            ? current
            : data.counters.find((counter) => counter.isActive)?.slug || ""
        );
      })
      .catch(() => {
        setServiceCounters([]);
        setCounterLimit(0);
      });
  }, [selectedLocationSlug, selectedTenantSlug, token]);

  useEffect(() => {
    if (!selectedTenantSlug || !token) {
      return;
    }

    vendorDashboardOperations.getStaff(token, selectedTenantSlug)
      .then((data) => {
        setStaff(data.staff);
        setStaffSeatLimit(data.staffSeatLimit);
      })
      .catch(() => {
        setStaff([]);
        setStaffSeatLimit(0);
      });
  }, [selectedTenantSlug, token]);

  useEffect(() => {
    if (!selectedTenantSlug || !token || !(isOwner || isAdmin)) {
      setServices([]);
      return;
    }

    vendorDashboardCatalog.getServices(token, selectedTenantSlug)
      .then((data) => {
        setServices(data.services);
      })
      .catch(() => {
        setServices([]);
      });
  }, [isAdmin, isOwner, selectedTenantSlug, token]);

  useEffect(() => {
    if (!selectedTenantSlug || !selectedLocationSlug || !token || !(isOwner || isAdmin)) {
      setAvailabilityBlocks([]);
      setAvailabilityExceptions([]);
      return;
    }

    vendorDashboardCatalog.getAvailability(token, selectedTenantSlug, selectedLocationSlug)
      .then((data) => {
        setAvailabilityBlocks(data.blocks);
        setAvailabilityExceptions(data.exceptions);
      })
      .catch(() => {
        setAvailabilityBlocks([]);
        setAvailabilityExceptions([]);
      });
  }, [isAdmin, isOwner, selectedLocationSlug, selectedTenantSlug, token]);

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

    vendorDashboardOperations.syncCheckout(token, selectedTenantSlug, checkoutId)
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
      `${API_BASE_URL}/public/tenant/${selectedTenantSlug}/location/${selectedLocationSlug}/stream`
    );
    eventSource.onmessage = (event) => {
      const payload = JSON.parse(event.data) as QueueSnapshot;
      setSnapshot(payload);
      syncQueueAlerts(payload.nextUp || [], { detectNew: true });
      if (currentSection === "bookings" && token && hasActiveSubscription && canOperateBookingQueue) {
        void queryClient.invalidateQueries({
          queryKey: [
            "vendor-dashboard-bookings",
            token,
            selectedTenantSlug,
            selectedLocationSlug,
            bookingPage,
            bookingSearch,
            bookingStatusFilter,
            bookingDateRange
          ]
        });
      }
    };
    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [
    canOperateBookingQueue,
    currentSection,
    hasActiveSubscription,
    selectedLocationSlug,
    selectedTenantSlug,
    token
  ]);

  useEffect(() => {
    if (!selectedTenantSlug || !selectedLocationSlug || !token || currentSection !== "history" || !hasActiveSubscription) {
      return undefined;
    }

    let active = true;

    vendorDashboardOperations.getHistory(token, selectedTenantSlug, selectedLocationSlug)
      .then((data) => {
        if (active) {
          setHistory(data);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(getErrorMessage(loadError));
        }
      });

    return () => {
      active = false;
    };
  }, [currentSection, hasActiveSubscription, selectedLocationSlug, selectedTenantSlug, token]);

  useEffect(() => {
    if (!selectedTenantSlug || !selectedLocationSlug || !token || currentSection !== "clients" || !hasActiveSubscription) {
      return undefined;
    }

    let active = true;

    vendorDashboardOperations.getClients(token, selectedTenantSlug, locationQuery)
      .then((data) => {
        if (active) {
          setClients(data);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(getErrorMessage(loadError));
        }
      });

    return () => {
      active = false;
    };
  }, [currentSection, hasActiveSubscription, locationQuery, selectedLocationSlug, selectedTenantSlug, token]);

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

  useEffect(() => {
    setBookingAlertIds([]);
    setBookingAlertBookings([]);
    knownBookingAlertIdsRef.current = null;
    setQueueAlertIds([]);
    knownQueueTicketIdsRef.current = null;
    dismissedBookingAlertIdsRef.current = new Set();
    dismissedQueueAlertIdsRef.current = new Set();
  }, [selectedLocationSlug, selectedTenantSlug]);

  useEffect(() => {
    if (!selectedTenantSlug) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const storageKey = getDismissedAlertStorageKey(selectedTenantSlug, selectedLocationSlug || null);
    const rawValue = window.sessionStorage.getItem(storageKey);
    if (!rawValue) {
      dismissedBookingAlertIdsRef.current = new Set();
      dismissedQueueAlertIdsRef.current = new Set();
      return;
    }

    try {
      const parsed = JSON.parse(rawValue) as {
        booking?: string[];
        queue?: string[];
      };

      dismissedBookingAlertIdsRef.current = new Set(
        Array.isArray(parsed.booking) ? parsed.booking.filter((value) => typeof value === "string") : []
      );
      dismissedQueueAlertIdsRef.current = new Set(
        Array.isArray(parsed.queue) ? parsed.queue.filter((value) => typeof value === "string") : []
      );
    } catch {
      dismissedBookingAlertIdsRef.current = new Set();
      dismissedQueueAlertIdsRef.current = new Set();
    }
  }, [selectedLocationSlug, selectedTenantSlug]);

  function persistDismissedAlerts() {
    if (typeof window === "undefined" || !selectedTenantSlug) {
      return;
    }

    const storageKey = getDismissedAlertStorageKey(selectedTenantSlug, selectedLocationSlug || null);
    const payload = {
      booking: Array.from(dismissedBookingAlertIdsRef.current),
      queue: Array.from(dismissedQueueAlertIdsRef.current)
    };

    window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
  }

  function showSuccessNotification(title: string, message: string) {
    notifications.show({
      color: "teal",
      icon: <IconCheck size={18} />,
      message,
      title
    });
  }

  function syncVendorBookings(bookings: VendorBookingSummary[], options: { detectNew?: boolean } = {}) {
    const nextIds = new Set(bookings.map((booking) => booking.id));
    const previousIds = knownBookingIdsRef.current;

    setVendorBookings(bookings);

    if (options.detectNew && previousIds) {
      const newPendingIds = bookings
        .filter((booking) => booking.status === "pending" && !previousIds.has(booking.id))
        .map((booking) => booking.id);

      if (newPendingIds.length) {
        setBookingAlertIds((current) => [...new Set([...current, ...newPendingIds])]);
      }
    }

    setBookingAlertIds((current) =>
      current.filter((bookingId) => {
        const found = bookings.find((booking) => booking.id === bookingId);
        if (found) {
          return found.status === "pending";
        }
        return true;
      })
    );
    knownBookingIdsRef.current = nextIds;
  }

  function clearBookingAlert(bookingId: string) {
    dismissedBookingAlertIdsRef.current.add(bookingId);
    setBookingAlertIds((current) => current.filter((item) => item !== bookingId));
    persistDismissedAlerts();
  }

  function syncBookingAlerts(bookings: VendorBookingSummary[], options: { detectNew?: boolean } = {}) {
    const nextIds = new Set(bookings.map((booking) => booking.id));
    const previousIds = knownBookingAlertIdsRef.current;
    const dismissedIds = dismissedBookingAlertIdsRef.current;

    setBookingAlertBookings(bookings);

    if (options.detectNew && previousIds) {
      const newPendingIds = bookings
        .filter(
          (booking) =>
            booking.status === "pending" &&
            !previousIds.has(booking.id) &&
            !dismissedIds.has(booking.id)
        )
        .map((booking) => booking.id);

      if (newPendingIds.length) {
        setBookingAlertIds((current) => [...new Set([...current, ...newPendingIds])]);
      }
    }

    setBookingAlertIds((current) =>
      current.filter((bookingId) => {
        const found = bookings.find((booking) => booking.id === bookingId);
        if (found) {
          return found.status === "pending";
        }
        return true;
      })
    );

    knownBookingAlertIdsRef.current = nextIds;
  }

  function syncQueueAlerts(nextUp: QueueListTicket[], options: { detectNew?: boolean } = {}) {
    const nextIds = new Set(nextUp.map((ticket) => ticket.id));
    const previousIds = knownQueueTicketIdsRef.current;
    const dismissedIds = dismissedQueueAlertIdsRef.current;

    if (options.detectNew && previousIds) {
      const newWaitingIds = nextUp
        .filter(
          (ticket) =>
            ticket.status === "waiting" &&
            !previousIds.has(ticket.id) &&
            !dismissedIds.has(ticket.id)
        )
        .map((ticket) => ticket.id);

      if (newWaitingIds.length) {
        setQueueAlertIds((current) => [...new Set([...current, ...newWaitingIds])]);
      }
    }

    setQueueAlertIds((current) =>
      current.filter((ticketId) => {
        const found = nextUp.find((ticket) => ticket.id === ticketId);
        if (found) {
          return found.status === "waiting";
        }
        return true;
      })
    );

    knownQueueTicketIdsRef.current = nextIds;
  }

  function clearQueueAlert(ticketId: string) {
    dismissedQueueAlertIdsRef.current.add(ticketId);
    setQueueAlertIds((current) => current.filter((item) => item !== ticketId));
    persistDismissedAlerts();
  }

  function showInfoNotification(title: string, message: string) {
    notifications.show({
      color: "blue",
      icon: <IconInfoCircle size={18} />,
      message,
      title
    });
  }

function isRecoveryWindowActive(value?: string | Date | null) {
  if (!value) {
    return false;
  }

  return toTimestamp(value) > Date.now();
}

function getDismissedAlertStorageKey(tenantSlug: string, locationSlug: string | null): string {
  return `getprio.vendor-dashboard.dismissed-alerts:${tenantSlug}:${locationSlug || "primary"}`;
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
  const historyTickets = useMemo(() => history?.tickets || snapshot?.history || [], [history, snapshot]);
  const serviceTrendBars = useMemo(
    () =>
      historyTickets
        .filter((ticket) => ticket.status === "served")
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
    [historyTickets, snapshot?.tenant.averageServiceMinutes]
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
  const overflowTickets = useMemo(() => snapshot?.overflow || [], [snapshot]);
  const currentQueueTickets = useMemo(
    () => (snapshot?.nextUp || []).filter((ticket) => !ticket.isCarriedOver),
    [snapshot]
  );
  const recoverableTickets = useMemo(
    () =>
      (snapshot?.recovery || [])
        .sort((a, b) => getHistoryTimestamp(b.updatedAt) - getHistoryTimestamp(a.updatedAt))
        .slice(0, 10),
    [snapshot]
  );
  const filteredClients = useMemo(() => {
    const query = clientsSearch.trim().toLowerCase();
    const items = [...(clients?.clients || [])].filter((client) => {
      if (!query) {
        return true;
      }

      return [
        client.customerName,
        client.customerEmail,
        client.customerPhone,
        client.latestTicketNumber,
        client.latestStatus
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });

    items.sort((a, b) => {
      switch (clientsSort) {
        case "nameAsc":
          return a.customerName.localeCompare(b.customerName);
        case "nameDesc":
          return b.customerName.localeCompare(a.customerName);
        case "visitsAsc":
          return a.visitCount - b.visitCount;
        case "visitsDesc":
          return b.visitCount - a.visitCount;
        case "latestVisitAsc":
          return getHistoryTimestamp(a.latestVisitAt) - getHistoryTimestamp(b.latestVisitAt);
        case "latestVisitDesc":
        default:
          return getHistoryTimestamp(b.latestVisitAt) - getHistoryTimestamp(a.latestVisitAt);
      }
    });

    return items;
  }, [clients, clientsSearch, clientsSort]);
  const paginatedClients = useMemo(() => {
    const start = (clientsPage - 1) * CLIENTS_PAGE_SIZE;
    return filteredClients.slice(start, start + CLIENTS_PAGE_SIZE);
  }, [clientsPage, filteredClients]);
  const clientsTotalPages = Math.max(1, Math.ceil(filteredClients.length / CLIENTS_PAGE_SIZE));

  const filteredHistoryTickets = useMemo(() => {
    const query = historySearch.trim().toLowerCase();
    const items = [...historyTickets].filter((ticket) => {
      if (!query) {
        return true;
      }

      return [ticket.ticketNumber, ticket.customerName, ticket.status, ticket.lookupCode]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });

    items.sort((a, b) => {
      switch (historySort) {
        case "ticketAsc":
          return a.ticketNumber.localeCompare(b.ticketNumber);
        case "ticketDesc":
          return b.ticketNumber.localeCompare(a.ticketNumber);
        case "customerAsc":
          return a.customerName.localeCompare(b.customerName);
        case "customerDesc":
          return b.customerName.localeCompare(a.customerName);
        case "updatedAsc":
          return getHistoryTimestamp(a.updatedAt) - getHistoryTimestamp(b.updatedAt);
        case "updatedDesc":
        default:
          return getHistoryTimestamp(b.updatedAt) - getHistoryTimestamp(a.updatedAt);
      }
    });

    return items;
  }, [historySearch, historySort, historyTickets]);
  const paginatedHistoryTickets = useMemo(() => {
    const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
    return filteredHistoryTickets.slice(start, start + HISTORY_PAGE_SIZE);
  }, [filteredHistoryTickets, historyPage]);
  const historyTotalPages = Math.max(1, Math.ceil(filteredHistoryTickets.length / HISTORY_PAGE_SIZE));
  const filteredBookings = useMemo(() => vendorBookings, [vendorBookings]);
  const activeBookingAlerts = useMemo(
    () =>
      bookingAlertIds
        .map((bookingId) => bookingAlertBookings.find((booking) => booking.id === bookingId))
        .filter((booking): booking is VendorBookingSummary => Boolean(booking && booking.status === "pending")),
    [bookingAlertBookings, bookingAlertIds]
  );
  const activeQueueAlerts = useMemo(
    () =>
      queueAlertIds
        .map((ticketId) => snapshot?.nextUp.find((ticket) => ticket.id === ticketId))
        .filter((ticket): ticket is QueueListTicket => Boolean(ticket && ticket.status === "waiting")),
    [queueAlertIds, snapshot?.nextUp]
  );
  const queueDayClosed = Boolean(snapshot?.queueDay?.isClosed);
  const queueDayPaused = Boolean(snapshot?.queueDay?.isPaused);
  const intakeState = snapshot?.queueIntake || null;
  const restoreBlockedByThreshold = Boolean(
    intakeState?.autoPauseEnabled &&
      intakeState.autoPauseThreshold &&
      intakeState.currentWaitingCount >= intakeState.autoPauseThreshold
  );
  const serviceOptions = useMemo(
    () => [
      { value: "", label: "All services" },
      ...services
        .filter((service) => service.isActive)
        .map((service) => ({ value: service.slug, label: service.name }))
    ],
    [services]
  );
  const serviceSlugById = useMemo(
    () => new Map(services.map((service) => [service.id, service.slug])),
    [services]
  );
  const serviceNameById = useMemo(
    () => new Map(services.map((service) => [service.id, service.name])),
    [services]
  );

  useEffect(() => {
    setClientsPage(1);
  }, [clientsSearch, clientsSort, clients]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historySearch, historySort, history]);

  useEffect(() => {
    setBookingPage(1);
  }, [bookingSearch, bookingStatusFilter, bookingDateRange]);

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

  async function handleCreateWalkIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const success = await runAction("walk-in", () =>
      vendorDashboardQueue.createWalkInTicket(token, selectedTenantSlug, locationQuery, walkInForm)
    );

    if (success) {
      setWalkInForm(emptyWalkIn);
      showSuccessNotification("Ticket issued", "The walk-in ticket was added to the queue.");
    }
  }

  async function reloadCounters() {
    await queryClient.invalidateQueries({
      queryKey: ["vendor-dashboard-counters", token, selectedTenantSlug, selectedLocationSlug]
    });
  }

  async function reloadStaff() {
    await queryClient.invalidateQueries({ queryKey: ["vendor-dashboard-staff", token, selectedTenantSlug] });
  }

  async function reloadServices() {
    await queryClient.invalidateQueries({
      queryKey: ["vendor-dashboard-services", token, selectedTenantSlug, isOwner, isAdmin]
    });
  }

  async function reloadAvailability() {
    await queryClient.invalidateQueries({
      queryKey: ["vendor-dashboard-availability", token, selectedTenantSlug, selectedLocationSlug, isOwner, isAdmin]
    });
  }

  async function reloadBookings() {
    await queryClient.invalidateQueries({
      queryKey: [
        "vendor-dashboard-bookings",
        token,
        selectedTenantSlug,
        selectedLocationSlug,
        bookingPage,
        bookingSearch,
        bookingStatusFilter,
        bookingDateRange
      ]
    });
  }

  async function reloadDashboardSnapshot() {
    await queryClient.invalidateQueries({
      queryKey: ["vendor-dashboard-bootstrap", token, selectedTenantSlug, selectedLocationSlug, locationQuery]
    });
  }

  async function handleUpdateBookingStatus(
    booking: VendorBookingSummary,
    status: UpdateVendorBookingStatusRequest["status"]
  ) {
    setBusyAction(`booking-status:${booking.id}:${status}`);
    setError("");

    try {
      const response = await vendorDashboardBookings.updateBookingStatus(token, selectedTenantSlug, booking.id, status);
      setVendorBookings((current) =>
        current.map((item) => (item.id === response.booking.id ? response.booking : item))
      );
      clearBookingAlert(response.booking.id);
      showSuccessNotification(
        status === "confirmed" ? "Booking confirmed" : "Booking canceled",
        `${response.booking.reference} was ${status}.`
      );
      return true;
    } catch (updateError) {
      setError(getErrorMessage(updateError));
      return false;
    } finally {
      setBusyAction("");
    }
  }

  function openRescheduleDialog(booking: VendorBookingSummary) {
    if (booking.status === "pending" && booking.paymentStatus === "pending") {
      setRescheduleBlockModalOpen(true);
      return;
    }

    setReschedulingBooking(booking);
    setRescheduleDate(formatDateInputValue(booking.scheduledStartAt));
    setRescheduleStartAt(String(booking.scheduledStartAt));
    setRescheduleSlots([]);
    setRescheduleSlotsError("");
    setRescheduleDialogOpen(true);
  }

  async function handleRescheduleBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reschedulingBooking || !rescheduleStartAt) {
      return;
    }

    setBusyAction(`booking-reschedule:${reschedulingBooking.id}`);
    setError("");

    try {
      const response = await vendorDashboardBookings.rescheduleBooking(
        token,
        selectedTenantSlug,
        reschedulingBooking.id,
        new Date(rescheduleStartAt).toISOString()
      );
      setVendorBookings((current) =>
        current.map((item) => (item.id === response.booking.id ? response.booking : item))
      );
      clearBookingAlert(response.booking.id);
      setRescheduleDialogOpen(false);
      setReschedulingBooking(null);
      setRescheduleDate("");
      setRescheduleStartAt("");
      setRescheduleSlots([]);
      await reloadBookings();
      await reloadDashboardSnapshot();
      showSuccessNotification("Booking rescheduled", `${response.booking.reference} has a new schedule.`);
    } catch (rescheduleError) {
      setError(getErrorMessage(rescheduleError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleCheckInBooking(booking: VendorBookingSummary, overrideWindow = false) {
    setBusyAction(`booking-check-in:${booking.id}${overrideWindow ? ":override" : ""}`);
    setError("");

    try {
      const response = await vendorDashboardBookings.checkInBooking(
        token,
        selectedTenantSlug,
        booking.id,
        {
          overrideWindow,
          overrideReason: overrideWindow ? "Late check-in override from vendor dashboard" : undefined
        },
        locationQuery
      );
      setVendorBookings((current) =>
        current.map((item) => (item.id === response.booking.id ? response.booking : item))
      );
      clearBookingAlert(response.booking.id);
      await reloadDashboardSnapshot();
      await reloadBookings();
      showSuccessNotification(
        "Booking checked in",
        `${response.booking.reference} is now live as ticket ${response.ticket.ticketNumber}.`
      );
    } catch (checkInError) {
      setError(getErrorMessage(checkInError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleMarkBookingNoShow(booking: VendorBookingSummary) {
    setBusyAction(`booking-no-show:${booking.id}`);
    setError("");

    try {
      const response = await vendorDashboardBookings.markBookingNoShow(token, selectedTenantSlug, booking.id, locationQuery);
      setVendorBookings((current) =>
        current.map((item) => (item.id === response.booking.id ? response.booking : item))
      );
      clearBookingAlert(response.booking.id);
      await reloadBookings();
      showSuccessNotification("Booking marked no-show", `${response.booking.reference} was canceled as a no-show.`);
    } catch (noShowError) {
      setError(getErrorMessage(noShowError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleViewBookingPaymentProof(booking: VendorBookingSummary) {
    if (!booking.paymentProof) {
      return;
    }

    setBusyAction(`booking-proof:${booking.id}`);
    setError("");

    try {
      const response = await vendorDashboardBookings.getBookingPaymentProof(token, selectedTenantSlug, booking.id);
      window.open(response.access.url, "_blank", "noopener,noreferrer");
    } catch (proofError) {
      setError(getErrorMessage(proofError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleVerifyBookingPayment(booking: VendorBookingSummary) {
    setBusyAction(`booking-payment-verify:${booking.id}`);
    setError("");

    try {
      const response = await vendorDashboardBookings.verifyBookingPayment(token, selectedTenantSlug, booking.id);
      setVendorBookings((current) =>
        current.map((item) => (item.id === response.booking.id ? response.booking : item))
      );
      setBookingDetailBooking(response.booking);
      setPaymentRejectionReason("");
      await reloadBookings();
      showSuccessNotification("Payment verified", `${response.booking.reference} can now be confirmed.`);
    } catch (verifyError) {
      setError(getErrorMessage(verifyError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleRejectBookingPayment(booking: VendorBookingSummary) {
    const reason = paymentRejectionReason.trim();
    if (!reason) {
      setError("A customer-visible rejection reason is required.");
      return false;
    }

    setBusyAction(`booking-payment-reject:${booking.id}`);
    setError("");

    try {
      const response = await vendorDashboardBookings.rejectBookingPayment(token, selectedTenantSlug, booking.id, { reason });
      setVendorBookings((current) =>
        current.map((item) => (item.id === response.booking.id ? response.booking : item))
      );
      setBookingDetailBooking(response.booking);
      setPaymentRejectionReason("");
      clearBookingAlert(response.booking.id);
      await reloadBookings();
      showSuccessNotification("Payment rejected", `${response.booking.reference} was canceled.`);
      return true;
    } catch (rejectError) {
      setError(getErrorMessage(rejectError));
      return false;
    } finally {
      setBusyAction("");
    }
  }

  function openServiceDialog(service?: VendorServiceSummary) {
    setEditingServiceSlug(service?.slug || "");
    setEditingServiceId(service?.id || "");
    setServiceSlugManuallyEdited(Boolean(service?.slug));
    setServiceSlugMessage("");
    setServiceSlugAvailable(false);
    setCheckingServiceSlug(false);
    setServiceForm({
      name: service?.name || "",
      slug: service?.slug || "",
      description: service?.description || "",
      durationMinutes: service?.durationMinutes || 30,
      allowBookingQuantity: service?.allowBookingQuantity || false,
      bookingQuantityLabel: service?.bookingQuantityLabel || "Units",
      manualPaymentRequired: service?.manualPaymentRequired || false,
      bookingCapacityScope: service?.bookingCapacityScope || "service",
      priceAmountCents: service?.priceAmountCents || 0,
      priceDisplay: service?.priceDisplay || "",
      isActive: service?.isActive ?? true,
      sortOrder: service?.sortOrder || 0
    });
    setServiceDialogOpen(true);
  }

  useEffect(() => {
    if (!serviceDialogOpen || serviceSlugManuallyEdited) {
      return;
    }

    const nextSlug = buildServiceSlug(serviceForm.name);
    setServiceForm((current) => ({ ...current, slug: nextSlug }));
  }, [serviceDialogOpen, serviceForm.name, serviceSlugManuallyEdited]);

  useEffect(() => {
    if (!serviceDialogOpen) {
      return undefined;
    }

    const nextSlug = buildServiceSlug(serviceForm.slug || "");
    setServiceSlugAvailable(false);

    if (!nextSlug) {
      setServiceSlugMessage("");
      setCheckingServiceSlug(false);
      return undefined;
    }

    setCheckingServiceSlug(true);
    const controller = new AbortController();
    let isCurrent = true;
    const timeout = window.setTimeout(() => {
      checkServiceSlugAvailability(token, selectedTenantSlug, nextSlug, editingServiceId || undefined)
        .then((response) => {
          if (!isCurrent) {
            return;
          }
          setServiceSlugAvailable(response.available && response.valid);
          setServiceSlugMessage(response.message);
        })
        .catch((availabilityError) => {
          if (!isCurrent || (availabilityError instanceof DOMException && availabilityError.name === "AbortError")) {
            return;
          }
          setServiceSlugAvailable(false);
          setServiceSlugMessage(getErrorMessage(availabilityError));
        })
        .finally(() => {
          if (isCurrent) {
            setCheckingServiceSlug(false);
          }
        });
    }, 300);

    return () => {
      isCurrent = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [serviceDialogOpen, serviceForm.slug, token, selectedTenantSlug, editingServiceId]);

  async function handleSaveService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction("service-save");
    setError("");

    try {
      if (!serviceSlugAvailable) {
        setError(serviceSlugMessage || "Choose an available service slug before saving.");
        return;
      }

      if (editingServiceSlug) {
        await vendorDashboardCatalog.saveService(token, selectedTenantSlug, editingServiceSlug, serviceForm);
      } else {
        await vendorDashboardCatalog.saveService(token, selectedTenantSlug, null, serviceForm);
      }
      await reloadServices();
      await reloadBookings();
      setServiceDialogOpen(false);
      showSuccessNotification(
        editingServiceSlug ? "Service updated" : "Service created",
        `${serviceForm.name} is ready for booking setup.`
      );
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleToggleServiceActive(service: VendorServiceSummary, isActive: boolean) {
    setBusyAction(`service-status:${service.slug}`);
    setError("");

    try {
      const response = await vendorDashboardCatalog.saveService(token, selectedTenantSlug, service.slug, {
        name: service.name,
        slug: service.slug,
        description: service.description,
        durationMinutes: service.durationMinutes,
        allowBookingQuantity: service.allowBookingQuantity,
        bookingQuantityLabel: service.bookingQuantityLabel,
        manualPaymentRequired: service.manualPaymentRequired,
        bookingCapacityScope: service.bookingCapacityScope,
        priceAmountCents: service.priceAmountCents,
        priceDisplay: service.priceDisplay,
        isActive,
        sortOrder: service.sortOrder
      });
      setServices((current) =>
        current.map((item) => (item.id === response.service.id ? response.service : item))
      );
      await reloadBookings();
      showSuccessNotification(
        isActive ? "Service enabled" : "Service disabled",
        `${response.service.name} is now ${isActive ? "active" : "inactive"}.`
      );
    } catch (toggleError) {
      setError(getErrorMessage(toggleError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleDeleteService(service: VendorServiceSummary) {
    setBusyAction(`service-delete:${service.slug}`);
    setError("");

    try {
      await vendorDashboardCatalog.deactivateService(token, selectedTenantSlug, service.slug);
      setServices((current) => current.filter((item) => item.slug !== service.slug));
      await reloadBookings();
      showSuccessNotification("Service deleted", `${service.name} was removed from the catalog.`);
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setBusyAction("");
    }
  }

  function getServiceLabel(serviceId: string | null) {
    return serviceId ? serviceNameById.get(serviceId) || "Service-specific" : "All services";
  }

  function openAvailabilityBlockDialog(block?: VendorAvailabilityBlockSummary) {
    setEditingAvailabilityBlockId(block?.id || "");
    setAvailabilityBlockForm({
      locationSlug: selectedLocationSlug,
      serviceSlug: block?.serviceId ? serviceSlugById.get(block.serviceId) || "" : "",
      weekday: block?.weekday ?? 1,
      startsAt: block?.startsAt || "09:00",
      endsAt: block?.endsAt || "17:00",
      capacity: block?.capacity || 1,
      isActive: block?.isActive ?? true,
      notes: block?.notes || ""
    });
    setAvailabilityBlockDialogOpen(true);
  }

  async function handleSaveAvailabilityBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction("availability-block-save");
    setError("");

    try {
      const body = {
        ...availabilityBlockForm,
        locationSlug: selectedLocationSlug
      };
      if (editingAvailabilityBlockId) {
        await vendorDashboardCatalog.saveAvailabilityBlock(token, selectedTenantSlug, editingAvailabilityBlockId, body);
      } else {
        await vendorDashboardCatalog.saveAvailabilityBlock(token, selectedTenantSlug, null, body);
      }
      await reloadAvailability();
      await reloadBookings();
      setAvailabilityBlockDialogOpen(false);
      showSuccessNotification(
        editingAvailabilityBlockId ? "Availability updated" : "Availability added",
        "The weekly availability rule was saved."
      );
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleToggleAvailabilityBlockActive(block: VendorAvailabilityBlockSummary, isActive: boolean) {
    setBusyAction(`availability-block-status:${block.id}`);
    setError("");

    try {
      const response = await vendorDashboardCatalog.saveAvailabilityBlock(token, selectedTenantSlug, block.id, {
        locationSlug: selectedLocationSlug,
        serviceSlug: block.serviceId ? serviceSlugById.get(block.serviceId) || "" : "",
        weekday: block.weekday,
        startsAt: block.startsAt,
        endsAt: block.endsAt,
        capacity: block.capacity,
        isActive,
        notes: block.notes
      });
      setAvailabilityBlocks((current) =>
        current.map((item) => (item.id === response.block.id ? response.block : item))
      );
      await reloadBookings();
      showSuccessNotification(
        isActive ? "Availability enabled" : "Availability disabled",
        `${response.block.notes || "The weekly rule"} is now ${isActive ? "active" : "inactive"}.`
      );
    } catch (toggleError) {
      setError(getErrorMessage(toggleError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleToggleAvailabilityExceptionActive(
    exception: VendorAvailabilityExceptionSummary,
    isAvailable: boolean
  ) {
    setBusyAction(`availability-exception-status:${exception.id}`);
    setError("");

    try {
      const response = await vendorDashboardCatalog.saveAvailabilityException(token, selectedTenantSlug, exception.id, {
        locationSlug: selectedLocationSlug,
        serviceSlug: exception.serviceId ? serviceSlugById.get(exception.serviceId) || "" : "",
        exceptionDate: formatDateInputValue(exception.exceptionDate),
        startsAt: exception.startsAt,
        endsAt: exception.endsAt,
        isAvailable,
        capacity: exception.capacity,
        reason: exception.reason
      });
      setAvailabilityExceptions((current) =>
        current.map((item) => (item.id === response.exception.id ? response.exception : item))
      );
      await reloadBookings();
      showSuccessNotification(
        isAvailable ? "Exception enabled" : "Exception blocked",
        `${response.exception.reason || "The availability exception"} is now ${isAvailable ? "available" : "blocked"}.`
      );
    } catch (toggleError) {
      setError(getErrorMessage(toggleError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleDeleteAvailabilityBlock(block: VendorAvailabilityBlockSummary) {
    setBusyAction(`availability-block-delete:${block.id}`);
    setError("");

    try {
      await vendorDashboardCatalog.deleteAvailabilityBlock(token, selectedTenantSlug, block.id);
      setAvailabilityBlocks((current) => current.filter((item) => item.id !== block.id));
      await reloadBookings();
      showSuccessNotification("Weekly rule deleted", "The recurring availability rule was removed.");
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setBusyAction("");
    }
  }

  function openAvailabilityExceptionDialog(exception?: VendorAvailabilityExceptionSummary) {
    setEditingAvailabilityExceptionId(exception?.id || "");
    const blockEntireDay = Boolean(
      exception &&
        !exception.isAvailable &&
        !exception.startsAt &&
        !exception.endsAt
    );
    setAvailabilityExceptionForm({
      locationSlug: selectedLocationSlug,
      serviceSlug: exception?.serviceId ? serviceSlugById.get(exception.serviceId) || "" : "",
      exceptionDate: exception?.exceptionDate ? formatDateInputValue(exception.exceptionDate) : "",
      startsAt: blockEntireDay ? "" : exception?.startsAt || "",
      endsAt: blockEntireDay ? "" : exception?.endsAt || "",
      isAvailable: exception?.isAvailable ?? false,
      capacity: exception?.capacity ?? null,
      reason: exception?.reason || ""
    });
    setAvailabilityExceptionBlockEntireDay(blockEntireDay);
    setAvailabilityExceptionDialogOpen(true);
  }

  async function handleSaveAvailabilityException(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction("availability-exception-save");
    setError("");

    try {
      const startsAt = availabilityExceptionBlockEntireDay ? "" : availabilityExceptionForm.startsAt;
      const endsAt = availabilityExceptionBlockEntireDay ? "" : availabilityExceptionForm.endsAt;
      const body = {
        ...availabilityExceptionForm,
        startsAt,
        endsAt,
        locationSlug: selectedLocationSlug
      };
      if (editingAvailabilityExceptionId) {
        await vendorDashboardCatalog.saveAvailabilityException(
          token,
          selectedTenantSlug,
          editingAvailabilityExceptionId,
          body
        );
      } else {
        await vendorDashboardCatalog.saveAvailabilityException(token, selectedTenantSlug, null, body);
      }
      await reloadAvailability();
      await reloadBookings();
      setAvailabilityExceptionDialogOpen(false);
      showSuccessNotification(
        editingAvailabilityExceptionId ? "Exception updated" : "Exception added",
        "The date-specific availability rule was saved."
      );
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleDeleteAvailabilityException(exception: VendorAvailabilityExceptionSummary) {
    setBusyAction(`availability-exception-delete:${exception.id}`);
    setError("");

    try {
      await vendorDashboardCatalog.deleteAvailabilityException(token, selectedTenantSlug, exception.id);
      setAvailabilityExceptions((current) => current.filter((item) => item.id !== exception.id));
      await reloadBookings();
      showSuccessNotification("Exception removed", "The date-specific rule was removed.");
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setBusyAction("");
    }
  }

  function openCounterDialog(counter?: ServiceCounterSummary) {
    setEditingCounterSlug(counter?.slug || "");
    setEditingCounterId(counter?.id || "");
    setCounterSlugManuallyEdited(Boolean(counter?.slug));
    setCounterSlugMessage("");
    setCounterSlugAvailable(false);
    setCheckingCounterSlug(false);
    setCounterForm({
      name: counter?.name || "",
      slug: counter?.slug || "",
      isActive: counter?.isActive ?? true,
      assignedUserIds: counter?.assignedUserIds || []
    });
    setCounterDialogOpen(true);
  }

  useEffect(() => {
    if (!counterDialogOpen || counterSlugManuallyEdited) {
      return;
    }

    const nextSlug = buildCounterSlug(counterForm.name);
    setCounterForm((current) => ({ ...current, slug: nextSlug }));
  }, [counterDialogOpen, counterForm.name, counterSlugManuallyEdited]);

  useEffect(() => {
    if (!counterDialogOpen) {
      return undefined;
    }

    const nextSlug = buildCounterSlug(counterForm.slug || "");
    setCounterSlugAvailable(false);

    if (!nextSlug) {
      setCounterSlugMessage("");
      setCheckingCounterSlug(false);
      return undefined;
    }

    setCheckingCounterSlug(true);
    const controller = new AbortController();
    let isCurrent = true;
    const timeout = window.setTimeout(() => {
      checkCounterSlugAvailability(
        token,
        selectedTenantSlug,
        selectedLocationSlug,
        nextSlug,
        editingCounterId || undefined
      )
        .then((response) => {
          if (!isCurrent) {
            return;
          }
          setCounterSlugAvailable(response.available && response.valid);
          setCounterSlugMessage(response.message);
        })
        .catch((availabilityError) => {
          if (!isCurrent || (availabilityError instanceof DOMException && availabilityError.name === "AbortError")) {
            return;
          }
          setCounterSlugAvailable(false);
          setCounterSlugMessage(getErrorMessage(availabilityError));
        })
        .finally(() => {
          if (isCurrent) {
            setCheckingCounterSlug(false);
          }
        });
    }, 300);

    return () => {
      isCurrent = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [counterDialogOpen, counterForm.slug, token, selectedTenantSlug, selectedLocationSlug, editingCounterId]);

  async function handleSaveCounter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction("counter-save");
    setError("");
    try {
      if (!counterSlugAvailable) {
        setError(counterSlugMessage || "Choose an available counter slug before saving.");
        return;
      }
      await vendorDashboardCatalog.saveCounter(
        token,
        selectedTenantSlug,
        selectedLocationSlug,
        editingCounterSlug || null,
        counterForm
      );
      await reloadCounters();
      await reloadBookings();
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

  async function handleDeleteCounter(counter: ServiceCounterSummary) {
    await vendorDashboardCatalog.deleteCounter(token, selectedTenantSlug, selectedLocationSlug, counter.slug);
    await reloadCounters();
    await reloadBookings();
    showSuccessNotification("Counter removed", `${counter.name} was removed from this location.`);
  }

  async function handleAddStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction("staff-save");
    try {
      await vendorDashboardOperations.addStaff(token, selectedTenantSlug, staffForm);
      await reloadStaff();
      await reloadBookings();
      setStaffDialogOpen(false);
      setStaffForm({ email: "", role: "staff" });
      showSuccessNotification("Staff added", "The staff member now has access to this tenant.");
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleUpdateStaffRole(member: VendorStaffSummary, role: "owner" | "admin" | "staff") {
    await vendorDashboardOperations.updateStaff(token, selectedTenantSlug, member.id, { role });
    await reloadStaff();
    await reloadBookings();
    showSuccessNotification("Staff updated", `${member.name}'s role was updated.`);
  }

  async function handleUpdateStaffStatus(member: VendorStaffSummary, isActive: boolean) {
    await vendorDashboardOperations.updateStaff(token, selectedTenantSlug, member.id, { isActive });
    await reloadStaff();
    await reloadBookings();
    showSuccessNotification(
      isActive ? "Staff enabled" : "Staff disabled",
      `${member.name} was ${isActive ? "enabled" : "disabled"} for this tenant.`
    );
  }

  async function handleRemoveStaff(member: VendorStaffSummary) {
    await vendorDashboardOperations.removeStaff(token, selectedTenantSlug, member.id);
    await reloadStaff();
    await reloadBookings();
    showSuccessNotification("Staff removed", `${member.name} no longer has tenant access.`);
  }

  function openConfirmAction(action: NonNullable<typeof confirmAction>) {
    setConfirmAction(action);
  }

  function closeConfirmAction() {
    setConfirmAction(null);
  }

  async function handleToggleLocationActive(locationItem: StoreLocationWithHours, isActive: boolean) {
    setBusyAction(`location-status:${locationItem.slug}`);
    setError("");
    try {
      const response = await vendorDashboardOperations.updateLocation(token, selectedTenantSlug, locationItem.slug, { isActive });
      setLocations((current) =>
        current
          .map((item) => (item.id === response.location.id ? response.location : item))
          .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name))
      );
      showSuccessNotification(
        isActive ? "Location enabled" : "Location disabled",
        `${response.location.name} is now ${isActive ? "active" : "inactive"}.`
      );
    } catch (toggleError) {
      setError(getErrorMessage(toggleError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleToggleCounterActive(counter: ServiceCounterSummary, isActive: boolean) {
    setBusyAction(`counter-status:${counter.slug}`);
    setError("");
    try {
      const response = await vendorDashboardCatalog.saveCounter(
        token,
        selectedTenantSlug,
        selectedLocationSlug,
        counter.slug,
        {
          name: counter.name,
          slug: counter.slug,
          isActive,
          assignedUserIds: counter.assignedUserIds
        }
      );
      setServiceCounters((current) =>
        current.map((item) => (item.id === response.counter.id ? response.counter : item))
      );
      showSuccessNotification(
        isActive ? "Counter enabled" : "Counter disabled",
        `${response.counter.name} is now ${isActive ? "active" : "inactive"}.`
      );
    } catch (toggleError) {
      setError(getErrorMessage(toggleError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleSaveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const success = await runAction("settings", () => vendorDashboardOperations.updateSettings(token, selectedTenantSlug, settings));

    if (success) {
      showSuccessNotification("Settings saved", "Tenant queue settings were updated.");
    }
  }

  async function handleStartCheckout(planSlug: SubscriptionPlanSlug) {
    setError("");
    setBusyAction(`checkout:${planSlug}`);

    try {
      const data = await vendorDashboardBilling.startCheckout(token, selectedTenantSlug, {
        planSlug,
        billingInterval
      });
      window.location.href = data.checkoutSession.checkoutUrl;
    } catch (checkoutError) {
      setError(getErrorMessage(checkoutError));
      setBusyAction("");
    }
  }

  async function handleHistoryExport(range: string, format: "csv" | "pdf") {
    const response = await vendorDashboardExport.exportHistory(
      token,
      selectedTenantSlug,
      selectedLocationSlug,
      range,
      format
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
      const data = await vendorDashboardOperations.getTheme(token, selectedTenantSlug, locationItem.slug);
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
      const data = await vendorDashboardOperations.uploadThemeAsset(
        token,
        selectedTenantSlug,
        themeLocation.slug,
        assetType,
        file
      );

      if (!data.asset?.publicUrl) {
        throw new Error("Upload completed without a usable asset URL.");
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

  async function uploadLocationPaymentQr(file: File | null) {
    if (!file || !token) {
      return;
    }

    const locationSlug = locationForm.slug.trim();
    if (!locationSlug) {
      setError("Location slug is required before uploading a payment QR.");
      setPaymentQrUploadFile(null);
      return;
    }

    setError("");
    setBusyAction("payment-qr-upload");

    try {
      const data = await vendorDashboardOperations.uploadLocationPaymentQr(
        token,
        selectedTenantSlug,
        locationSlug,
        file
      );
      if (!data.asset?.publicUrl) {
        throw new Error("Payment QR upload completed without a usable image URL.");
      }

      setLocationForm((current) => ({
        ...current,
        paymentQrImageUrl: data.asset.publicUrl
      }));
      showSuccessNotification("Payment QR uploaded", "The QR image is ready to save with this location.");
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
      const data = await vendorDashboardOperations.saveTheme(token, selectedTenantSlug, themeLocation.slug, {
        theme: themeForm,
        applyToAllLocations: applyThemeToAllLocations
      });
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
                  disabled={busyAction === `checkout:${plan.slug}`}
                  mt="auto"
                  onClick={() => handleStartCheckout(plan.slug)}
                >
                  {busyAction === `checkout:${plan.slug}` ? "Opening..." : "Choose plan"}
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
    return (
      <Modal
        centered
        opened={locationDialogOpen}
        onClose={() => setLocationDialogOpen(false)}
        size="xl"
        title={editingLocationSlug ? "Edit location" : "Add location"}
      >
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <TextInput
              name="locationName"
              label="Location name"
              required
              value={locationForm.name}
              onChange={(event) => {
                const nextName = event.target.value;
                setLocationForm((current) => ({
                  ...current,
                  name: nextName,
                  slug: locationSlugManuallyEdited ? current.slug : buildLocationSlug(nextName)
                }));
              }}
            />
            <TextInput
              name="locationSlug"
              label="Slug"
              required
              description={checkingLocationSlug ? "Checking slug availability..." : locationSlugMessage}
              error={
                !locationSlugAvailable && locationForm.slug
                  ? locationSlugMessage || "That location slug is already taken for this vendor."
                  : undefined
              }
              value={locationForm.slug}
              onChange={(event) => {
                setLocationSlugManuallyEdited(true);
                setLocationForm((current) => ({ ...current, slug: buildLocationSlug(event.target.value) }));
              }}
            />
            <TextInput
              name="addressLine1"
              label="Address line 1"
              value={locationForm.addressLine1}
              onChange={(event) =>
                setLocationForm((current) => ({ ...current, addressLine1: event.target.value }))
              }
            />
            <TextInput
              name="addressLine2"
              label="Address line 2"
              value={locationForm.addressLine2}
              onChange={(event) =>
                setLocationForm((current) => ({ ...current, addressLine2: event.target.value }))
              }
            />
            <TextInput
              name="city"
              label="City"
              value={locationForm.city}
              onChange={(event) =>
                setLocationForm((current) => ({ ...current, city: event.target.value }))
              }
            />
            <TextInput
              name="province"
              label="Province"
              value={locationForm.province}
              onChange={(event) =>
                setLocationForm((current) => ({ ...current, province: event.target.value }))
              }
            />
            <TextInput
              name="locationContactEmail"
              label="Contact email"
              value={locationForm.contactEmail}
              onChange={(event) =>
                setLocationForm((current) => ({ ...current, contactEmail: event.target.value }))
              }
            />
            <PhilippineMobileInput
              name="locationContactPhone"
              label="Contact phone"
              value={locationForm.contactPhone}
              onChange={(nextValue) =>
                setLocationForm((current) => ({ ...current, contactPhone: nextValue }))
              }
            />
            <TextInput
              name="timezone"
              label="Timezone"
              value={locationForm.timezone}
              onChange={(event) =>
                setLocationForm((current) => ({ ...current, timezone: event.target.value }))
              }
            />
          </SimpleGrid>
          <Divider label="Manual payment QR" labelPosition="left" />
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <TextInput
              name="paymentMethodLabel"
              label="Payment method"
              placeholder="GCash, Maya, BPI InstaPay"
              value={locationForm.paymentMethodLabel}
              onChange={(event) =>
                setLocationForm((current) => ({ ...current, paymentMethodLabel: event.target.value }))
              }
            />
            <TextInput
              name="paymentAccountDisplayName"
              label="Account display name"
              placeholder="Business or account name"
              value={locationForm.paymentAccountDisplayName}
              onChange={(event) =>
                setLocationForm((current) => ({ ...current, paymentAccountDisplayName: event.target.value }))
              }
            />
            <TextInput
              name="paymentAccountIdentifierDisplay"
              label="Masked account identifier"
              placeholder="0917 *** 1234 or account suffix"
              value={locationForm.paymentAccountIdentifierDisplay}
              onChange={(event) =>
                setLocationForm((current) => ({
                  ...current,
                  paymentAccountIdentifierDisplay: event.target.value
                }))
              }
            />
            <Stack gap="xs">
              <FileInput
                accept="image/jpeg,image/png,image/webp"
                clearable
                disabled={busyAction === "payment-qr-upload"}
                label="QR image"
                leftSection={<IconQrcode size={16} />}
                onChange={(file) => {
                  setPaymentQrUploadFile(file);
                  void uploadLocationPaymentQr(file);
                }}
                placeholder={locationForm.paymentQrImageUrl ? "Replace QR image" : "Upload QR image"}
                value={paymentQrUploadFile}
              />
              {locationForm.paymentQrImageUrl ? (
                <Image
                  alt="Payment QR preview"
                  fit="contain"
                  h={120}
                  radius="sm"
                  src={locationForm.paymentQrImageUrl}
                  w={120}
                />
              ) : null}
            </Stack>
          </SimpleGrid>
          <Switch
            name="paymentQrActive"
            checked={locationForm.paymentQrActive}
            label="Enable manual payment QR for this location"
            onChange={(event) =>
              setLocationForm((current) => ({ ...current, paymentQrActive: event.currentTarget.checked }))
            }
          />
          <Group>
            <Switch
              name="isActiveLocation"
              checked={locationForm.isActive}
              label="Enable location"
              onChange={(event) =>
                setLocationForm((current) => ({ ...current, isActive: event.currentTarget.checked }))
              }
            />
            <Checkbox
              name="isPrimaryLocation"
              checked={locationForm.isPrimary}
              label="Primary location"
              onChange={(event) =>
                setLocationForm((current) => ({ ...current, isPrimary: event.target.checked }))
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
                        name={`hours.${hour.weekday}.isClosed`}
                        checked={hour.isClosed}
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
                        name={`hours.${hour.weekday}.opensAt`}
                        disabled={hour.isClosed}
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
                        name={`hours.${hour.weekday}.closesAt`}
                        disabled={hour.isClosed}
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
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setLocationDialogOpen(false)}>
              Cancel
            </Button>
            <Button className="neura-primary-button" disabled={busyAction === "location"} onClick={saveLocation}>
              {busyAction === "location" ? "Saving..." : "Save location"}
            </Button>
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

  function renderQueuePage() {
    const activeCounters = serviceCounters.filter((counter) => counter.isActive);
    const activeTicket = snapshot?.current || null;

    return (
      <Stack gap="md">
        {renderStats()}
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
          <Card className="neura-card" padding="lg">
            <Stack gap="md">
              <Group justify="space-between" align="flex-start">
                <SegmentedControl
                  data={[
                    { value: "current", label: "Current queue" },
                    { value: "overflow", label: "Overflow queue" },
                    { value: "recovery", label: "Missed recovery" }
                  ]}
                  value={queueView}
                  onChange={(value) => setQueueView(value as QueueView)}
                />
                <Stack gap={6} align="flex-end">
                  <Badge color={queueDayClosed ? "red" : queueDayPaused ? "yellow" : "teal"} variant="light">
                    {queueDayClosed ? "Queue day closed" : queueDayPaused ? "Queue intake paused" : "Queue day open"}
                  </Badge>
                  <Group gap="xs" justify="flex-end">
                    {queueDayClosed ? null : queueDayPaused ? (
                      <Button
                        color="yellow"
                        variant="light"
                        disabled={busyAction === "queue-resume"}
                        onClick={async () => {
                          const success = await runAction("queue-resume", () =>
                            vendorDashboardQueue.resumeQueueDay(token, selectedTenantSlug, locationQuery)
                          );
                          if (success) {
                            showSuccessNotification("Queue resumed", "Customers can join this queue again.");
                          }
                        }}
                      >
                        {busyAction === "queue-resume" ? "Resuming..." : "Resume intake"}
                      </Button>
                    ) : (
                      <Button
                        color="yellow"
                        variant="light"
                        disabled={busyAction === "queue-pause"}
                        onClick={async () => {
                          const success = await runAction("queue-pause", () =>
                            vendorDashboardQueue.pauseQueueDay(token, selectedTenantSlug, locationQuery)
                          );
                          if (success) {
                            showSuccessNotification("Queue paused", "New joins are paused while staff continues serving the active queue.");
                          }
                        }}
                      >
                        {busyAction === "queue-pause" ? "Pausing..." : "Pause intake"}
                      </Button>
                    )}
                  {canManageQueueDay ? (
                    queueDayClosed ? (
                      <Button
                        className="neura-primary-button"
                        disabled={busyAction === "queue-reopen"}
                        onClick={async () => {
                          const success = await runAction("queue-reopen", () =>
                            vendorDashboardQueue.reopenQueueDay(token, selectedTenantSlug, locationQuery)
                          );
                          if (success) {
                            showSuccessNotification("Queue reopened", "Customers can join and staff can resume service.");
                            setQueueView("current");
                          }
                        }}
                      >
                        {busyAction === "queue-reopen" ? "Reopening..." : "Reopen queue"}
                      </Button>
                    ) : (
                      <Button
                        color="red"
                        variant="light"
                        disabled={busyAction === "queue-close"}
                        onClick={async () => {
                          const success = await runAction("queue-close", () =>
                            vendorDashboardQueue.closeQueueDay(token, selectedTenantSlug, locationQuery)
                          );
                          if (success) {
                            showSuccessNotification("Queue closed", "Waiting tickets were carried over and active tickets were marked unserved.");
                            setQueueView("overflow");
                          }
                        }}
                      >
                        {busyAction === "queue-close" ? "Closing..." : "Close queue"}
                      </Button>
                    )
                  ) : null}
                  </Group>
                </Stack>
              </Group>
              {queueView === "current" ? (
                <>
                  <Group justify="space-between" align="flex-end">
                    <Select
                      data={activeCounters.map((counter) => ({
                        label: counter.name,
                        value: counter.slug
                      }))}
                      label="Serving from"
                      placeholder="Select counter"
                      value={selectedCounterSlug || null}
                      onChange={(value) => setSelectedCounterSlug(value || "")}
                    />
                    {snapshot?.queueDay?.closureReason ? (
                      <Text c="dimmed" size="sm" maw={280} ta="right">
                        {snapshot.queueDay.closureReason}
                      </Text>
                    ) : null}
                  </Group>
                  <Group>
                    <Button
                      className="neura-primary-button"
                      disabled={busyAction === "call-next" || !selectedCounterSlug || queueDayClosed}
                      onClick={async () => {
                        const success = await runAction("call-next", () =>
                          vendorDashboardQueue.callNextTicket(token, selectedTenantSlug, locationQuery, selectedCounterSlug)
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
                      disabled={busyAction === "serve-current" || !activeTicket}
                      onClick={async () => {
                        const success = await runAction("serve-current", () =>
                          vendorDashboardQueue.serveCurrentTicket(token, selectedTenantSlug, locationQuery)
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
                      disabled={busyAction === "skip-current" || !activeTicket}
                      onClick={async () => {
                        const success = await runAction("skip-current", () =>
                          vendorDashboardQueue.skipCurrentTicket(token, selectedTenantSlug, locationQuery)
                        );
                        if (success) {
                          showSuccessNotification("Ticket skipped", "The current ticket was skipped.");
                          setQueueView("current");
                        }
                      }}
                    >
                      Skip current
                    </Button>
                  </Group>
                  <SimpleGrid cols={{ base: 1, sm: intakeState?.autoPauseEnabled ? 3 : 2 }} spacing="md">
                    <Paper withBorder radius="md" p="md">
                      <Text className="neura-label">Now serving</Text>
                      <Group gap="xs">
                        <Title order={3}>{activeTicket?.ticketNumber || "--"}</Title>
                        {activeTicket && isCheckedInBookingTicket(activeTicket) ? (
                          <Badge color="blue" variant="light">Booking</Badge>
                        ) : null}
                      </Group>
                      <Text c="dimmed" size="sm">
                        {activeTicket?.customerName || "No active ticket"}
                      </Text>
                      {activeTicket?.linkedBookingReference ? (
                        <Text c="dimmed" size="xs">
                          Booking {activeTicket.linkedBookingReference}
                        </Text>
                      ) : null}
                    </Paper>
                    <Paper withBorder radius="md" p="md">
                      <Text className="neura-label">Queue day</Text>
                      <Title order={3}>{queueDayClosed ? "Closed" : queueDayPaused ? "Paused" : "Open"}</Title>
                      <Text c="dimmed" size="sm">
                        {queueDayClosed && snapshot?.queueDay?.closedAt
                          ? `Closed ${formatDateTime(snapshot.queueDay.closedAt)}`
                          : queueDayPaused && snapshot?.queueDay?.pausedAt
                            ? `Paused ${formatDateTime(snapshot.queueDay.pausedAt)}`
                            : "Customers can continue joining this queue"}
                      </Text>
                    </Paper>
                    {intakeState?.autoPauseEnabled && intakeState.autoPauseThreshold ? (
                      <QueueIntakeGauge
                        waitingCount={intakeState.currentWaitingCount}
                        threshold={intakeState.autoPauseThreshold}
                        resumeWaitingCount={intakeState.resumeWaitingCount}
                        autoResumeEnabled={intakeState.autoResumeEnabled}
                        state={
                          intakeState.state === "paused"
                            ? "paused"
                            : intakeState.state === "near_limit"
                              ? "near_limit"
                              : "open"
                        }
                        stateLabel={intakeState.stateLabel}
                      />
                    ) : null}
                  </SimpleGrid>
                  <Table.ScrollContainer minWidth={420}>
                    <Table verticalSpacing="sm">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>ID</Table.Th>
                          <Table.Th>Up next</Table.Th>
                          <Table.Th>Channel</Table.Th>
                          <Table.Th>Source</Table.Th>
                          <Table.Th>Joined</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {currentQueueTickets.length ? (
                          currentQueueTickets.map((ticket) => (
                            <Table.Tr key={ticket.id}>
                              <Table.Td fw={700}>{ticket.id}</Table.Td>
                              <Table.Td>
                                <Text fw={700}>{ticket.ticketNumber}</Text>
                                <Text c="dimmed" size="sm">{ticket.customerName}</Text>
                                {ticket.linkedBookingReference ? (
                                  <Text c="dimmed" size="xs">Booking {ticket.linkedBookingReference}</Text>
                                ) : null}
                              </Table.Td>
                              <Table.Td><Badge variant="light">{ticket.joinChannel}</Badge></Table.Td>
                              <Table.Td>
                                <Group gap={6}>
                                  {isCheckedInBookingTicket(ticket) ? (
                                    <Badge color="blue" variant="light">Booking</Badge>
                                  ) : null}
                                  <Badge color={ticket.isCarriedOver ? "orange" : "gray"} variant="light">
                                    {ticket.isCarriedOver ? "Carry-over" : "Same-day"}
                                  </Badge>
                                </Group>
                              </Table.Td>
                              <Table.Td>{formatDateTime(ticket.createdAt)}</Table.Td>
                            </Table.Tr>
                          ))
                        ) : (
                          <Table.Tr>
                            <Table.Td colSpan={5}>
                              <DashboardEmptyState
                                title="No one is waiting right now."
                                text="Fresh same-day joins will appear here once the carry-over backlog is cleared."
                              />
                            </Table.Td>
                          </Table.Tr>
                        )}
                      </Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                </>
              ) : queueView === "overflow" ? (
                <>
                  <Group justify="space-between" align="flex-start">
                    <div>
                      <Text className="neura-label">Overflow queue</Text>
                      <Title order={3}>Carried-over tickets</Title>
                    </div>
                    <Badge variant="light">
                      {overflowTickets.length} ticket{overflowTickets.length === 1 ? "" : "s"}
                    </Badge>
                  </Group>
                  <Table.ScrollContainer minWidth={420}>
                    <Table verticalSpacing="sm">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>ID</Table.Th>
                          <Table.Th>Ticket</Table.Th>
                          <Table.Th>Channel</Table.Th>
                          <Table.Th>Priority</Table.Th>
                          <Table.Th>Carried over</Table.Th>
                          <Table.Th>Joined</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {overflowTickets.length ? (
                          overflowTickets.map((ticket) => (
                            <Table.Tr key={ticket.id}>
                              <Table.Td fw={700}>{ticket.id}</Table.Td>
                              <Table.Td>
                                <Text fw={700}>{ticket.ticketNumber}</Text>
                                <Text c="dimmed" size="sm">{ticket.customerName}</Text>
                              </Table.Td>
                              <Table.Td><Badge variant="light">{ticket.joinChannel}</Badge></Table.Td>
                              <Table.Td>
                                <Badge color="orange" variant="light">
                                  carry_over
                                </Badge>
                              </Table.Td>
                              <Table.Td>{ticket.carriedOverAt ? formatDateTime(ticket.carriedOverAt) : "--"}</Table.Td>
                              <Table.Td>{formatDateTime(ticket.createdAt)}</Table.Td>
                            </Table.Tr>
                          ))
                        ) : (
                          <Table.Tr>
                            <Table.Td colSpan={6}>
                              <DashboardEmptyState
                                title="No overflow tickets."
                                text="Waiting tickets carried over from a previous queue day will appear here."
                              />
                            </Table.Td>
                          </Table.Tr>
                        )}
                      </Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                </>
              ) : (
                <>
                  <Group justify="space-between" align="flex-start">
                    <div>
                      <Text className="neura-label">Missed ticket recovery</Text>
                      <Title order={3}>Skipped tickets</Title>
                    </div>
                    <Badge variant="light">
                      {recoverableTickets.length} ticket{recoverableTickets.length === 1 ? "" : "s"}
                    </Badge>
                  </Group>
                  {queueDayClosed || queueDayPaused || restoreBlockedByThreshold ? (
                    <Alert color={queueDayClosed ? "red" : "yellow"} variant="light" radius="md">
                      {queueDayClosed
                        ? "Missed tickets cannot be restored while the queue day is closed."
                        : queueDayPaused
                          ? "Missed tickets cannot be restored while queue intake is paused."
                          : `Missed tickets cannot be restored while the queue is at its intake threshold of ${intakeState?.autoPauseThreshold} waiting tickets.`}
                    </Alert>
                  ) : null}
                  <Table.ScrollContainer minWidth={620}>
                    <Table verticalSpacing="sm">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>ID</Table.Th>
                          <Table.Th>Ticket</Table.Th>
                          <Table.Th>Joined</Table.Th>
                          <Table.Th>Recovery</Table.Th>
                          <Table.Th>Action</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {recoverableTickets.length ? (
                          recoverableTickets.map((ticket) => {
                            const priorityRecovery = isRecoveryWindowActive(ticket.rejoinDeadlineAt);

                            return (
                              <Table.Tr key={ticket.id}>
                                <Table.Td fw={700}>{ticket.id}</Table.Td>
                                <Table.Td>
                                  <Text fw={700}>{ticket.ticketNumber}</Text>
                                  <Text c="dimmed" size="sm">{ticket.customerName}</Text>
                                </Table.Td>
                                <Table.Td>{formatDateTime(ticket.createdAt)}</Table.Td>
                                <Table.Td>
                                  <Badge color={priorityRecovery ? "blue" : "gray"} variant="light">
                                    {priorityRecovery ? "recovery" : "normal"}
                                  </Badge>
                                  <Text c="dimmed" size="sm" mt={4}>
                                    {ticket.rejoinDeadlineAt
                                      ? priorityRecovery
                                        ? `Priority until ${formatDateTime(ticket.rejoinDeadlineAt)}`
                                        : `Recovery expired ${formatDateTime(ticket.rejoinDeadlineAt)}`
                                      : "No recovery deadline"}
                                  </Text>
                                </Table.Td>
                                <Table.Td>
                                  <Button
                                    disabled={
                                      busyAction === `restore-${ticket.id}` ||
                                      !ticket.lookupCode ||
                                      queueDayClosed ||
                                      queueDayPaused ||
                                      restoreBlockedByThreshold
                                    }
                                    onClick={async () => {
                                      const success = await runAction(`restore-${ticket.id}`, () =>
                                        vendorDashboardQueue.restoreSkippedTicket(
                                          token,
                                          selectedTenantSlug,
                                          ticket.id,
                                          locationQuery,
                                          ticket.lookupCode || ""
                                        )
                                      );

                                      if (success) {
                                        showSuccessNotification(
                                          "Ticket restored",
                                          priorityRecovery
                                            ? "The skipped ticket was restored with recovery priority."
                                            : "The skipped ticket was restored at normal priority."
                                        );
                                        setQueueView("current");
                                      }
                                    }}
                                    size="xs"
                                    variant="light"
                                  >
                                    Restore
                                  </Button>
                                </Table.Td>
                              </Table.Tr>
                            );
                          })
                        ) : (
                          <Table.Tr>
                            <Table.Td colSpan={5}>
                              <DashboardEmptyState
                                title="No skipped tickets to recover."
                                text="Skipped tickets will appear here while they are still relevant for operator recovery."
                              />
                            </Table.Td>
                          </Table.Tr>
                        )}
                      </Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                </>
              )}
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
                  <TextInput label="Join URL" readOnly value={queueLinks.joinUrl} />
                  <TextInput label="QR target" readOnly value={queueLinks.qrUrl} />
                  <TextInput label="Monitor URL" readOnly value={queueLinks.monitorUrl} />
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
                <Button
                  className="neura-primary-button"
                  disabled={busyAction === "walk-in" || queueDayClosed || queueDayPaused}
                  type="submit"
                >
                  {queueDayClosed
                    ? "Queue closed"
                    : queueDayPaused
                      ? "Intake paused"
                      : busyAction === "walk-in"
                        ? "Issuing..."
                        : "Issue ticket"}
                </Button>
              </Group>
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                <TextInput
                  name="walkInCustomerName"
                  label="Customer name"
                  required
                  disabled={queueDayClosed || queueDayPaused}
                  value={walkInForm.customerName}
                  onChange={(event) =>
                    setWalkInForm((current) => ({ ...current, customerName: event.target.value }))
                  }
                />
                <TextInput
                  name="walkInCustomerEmail"
                  label="Email"
                  type="email"
                  disabled={queueDayClosed || queueDayPaused}
                  value={walkInForm.customerEmail}
                  onChange={(event) =>
                    setWalkInForm((current) => ({ ...current, customerEmail: event.target.value }))
                  }
                />
                <PhilippineMobileInput
                  name="walkInCustomerPhone"
                  label="Phone"
                  disabled={queueDayClosed || queueDayPaused}
                  value={walkInForm.customerPhone}
                  onChange={(nextValue) =>
                    setWalkInForm((current) => ({ ...current, customerPhone: nextValue }))
                  }
                />
                <Textarea
                  name="walkInNotes"
                  label="Notes"
                  minRows={2}
                  disabled={queueDayClosed || queueDayPaused}
                  value={walkInForm.notes}
                  onChange={(event) =>
                    setWalkInForm((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </SimpleGrid>
              <Group>
                <Checkbox
                  name="walkInNotifyByEmail"
                  disabled={queueDayClosed}
                  checked={walkInForm.notifyByEmail}
                  label="Send email alerts"
                  onChange={(event) =>
                    setWalkInForm((current) => ({ ...current, notifyByEmail: event.target.checked }))
                  }
                />
              </Group>
            </Stack>
          </form>
        </Card>
      </Stack>
    );
  }

  function renderThemePreview() {
    const previewLocation = themeLocation || selectedLocation;
    const cardStyle = {
      backgroundColor: hexToRgba(themeForm.cardBackgroundColor, themeForm.cardAlpha),
      border: `${themeForm.cardBorderSize}px solid ${themeForm.cardBorderColor}`,
      borderRadius: themeForm.cardBorderRadius
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
            {themeForm?.logoUrl ? (
              <Box style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <Box
                  alt="Company logo preview"
                  component="img"
                  src={themeForm.logoUrl}
                  style={{ width: 'min(240px, 20dvw)', objectFit: "contain", aspectRatio: 1.5 }}
                />
              </Box>
            ) : null}
          <Paper p="xl" style={cardStyle}>
            <Group justify="space-between" align="flex-start">
              <div>
                <Text size="xs" tt="uppercase" fw={800} c={themeForm.subheaderColor} lts={1.6}>
                  Live public board
                </Text>
                <Title order={1} c={themeForm.headerColor}>
                  {themeForm.heroTitle || previewLocation?.name || snapshot?.tenant.name || "Public board"}
                </Title>
                <Title c={themeForm.headerColor} order={2} style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}>
                {themeForm.heroSubtitle ||
                    "Customers can monitor their turn remotely and join the line online."}
                </Title>
              </div>
            </Group>
            <Group mt="xl">
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
              <Badge color={previewLocation?.openStatus.isOpen ? "teal" : "red"}>
                {previewLocation?.openStatus.isOpen ? "Open" : "Closed"}
              </Badge>
            </Group>
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
                value={themeForm.presetId}
                onChange={(value) => value && applyThemePreset(value)}
              />
              <SimpleGrid cols={{ base: 1, md: 2 }}>
                <TextInput
                  name="heroTitle"
                  label="Hero title"
                  value={themeForm.heroTitle}
                  placeholder={themeLocation?.name || "Public board title"}
                  onChange={(event) => setThemeField("heroTitle", event.target.value)}
                />
                <TextInput
                  name="heroSubtitle"
                  label="Hero subtitle"
                  value={themeForm.heroSubtitle}
                  placeholder="Customers can monitor their turn remotely."
                  onChange={(event) => setThemeField("heroSubtitle", event.target.value)}
                />
              </SimpleGrid>
              <SimpleGrid cols={{ base: 1, md: 2 }}>
                <FileInput
                  name="backgroundImageFile"
                  accept="image/png,image/jpeg,image/webp"
                  clearable
                  label="Background image"
                  disabled={busyAction === "theme-upload:background"}
                  onChange={(file) => uploadThemeAsset("background", file)}
                />
                <FileInput
                  name="logoFile"
                  accept="image/png,image/jpeg,image/webp"
                  clearable
                  label="Company logo"
                  disabled={busyAction === "theme-upload:logo"}
                  onChange={(file) => uploadThemeAsset("logo", file)}
                />
              </SimpleGrid>
              <SimpleGrid cols={{ base: 1, md: 2 }}>
                <TextInput
                  name="backgroundImageUrl"
                  label="Background image URL"
                  value={themeForm.backgroundImageUrl}
                  onChange={(event) => setThemeField("backgroundImageUrl", event.target.value)}
                />
                <TextInput
                  name="logoUrl"
                  label="Logo URL"
                  value={themeForm.logoUrl}
                  onChange={(event) => setThemeField("logoUrl", event.target.value)}
                />
              </SimpleGrid>
              <Divider label="Board colors" labelPosition="left" />
              <SimpleGrid cols={{ base: 1, md: 3 }}>
                <ColorInput name="pageBackgroundColor" label="Page background" value={themeForm.pageBackgroundColor} onChange={(value) => setThemeField("pageBackgroundColor", value)} />
                <ColorInput name="headerColor" label="Header text" value={themeForm.headerColor} onChange={(value) => setThemeField("headerColor", value)} />
                <ColorInput name="subheaderColor" label="Subheader text" value={themeForm.subheaderColor} onChange={(value) => setThemeField("subheaderColor", value)} />
                <ColorInput name="bodyColor" label="Body text" value={themeForm.bodyColor} onChange={(value) => setThemeField("bodyColor", value)} />
                <ColorInput name="buttonBackgroundColor" label="Button background" value={themeForm.buttonBackgroundColor} onChange={(value) => setThemeField("buttonBackgroundColor", value)} />
                <ColorInput name="buttonTextColor" label="Button text" value={themeForm.buttonTextColor} onChange={(value) => setThemeField("buttonTextColor", value)} />
              </SimpleGrid>
              <Divider label="Section cards" labelPosition="left" />
              <SimpleGrid cols={{ base: 1, md: 2 }}>
                <ColorInput name="cardBackgroundColor" label="Card background" value={themeForm.cardBackgroundColor} onChange={(value) => setThemeField("cardBackgroundColor", value)} />
                <ColorInput name="cardBorderColor" label="Card border" value={themeForm.cardBorderColor} onChange={(value) => setThemeField("cardBorderColor", value)} />
                <NumberInput name="cardBorderSize" label="Border size" min={0} max={12} value={themeForm.cardBorderSize} onChange={(value) => setThemeField("cardBorderSize", Number(value) || 0)} />
                <NumberInput name="cardBorderRadius" label="Border radius" min={0} max={48} value={themeForm.cardBorderRadius} onChange={(value) => setThemeField("cardBorderRadius", Number(value) || 0)} />
              </SimpleGrid>
              <div>
                <Text size="sm" fw={600}>Card alpha</Text>
                <Slider
                  min={0.15}
                  max={1}
                  step={0.05}
                  value={themeForm.cardAlpha}
                  onChange={(value) => setThemeField("cardAlpha", value)}
                />
              </div>
              <Checkbox
                name="applyThemeToAllLocations"
                checked={applyThemeToAllLocations}
                label="Apply to all current and future locations"
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
    setPaymentQrUploadFile(null);
    if (locationItem) {
      setEditingLocationSlug(locationItem.slug);
      setEditingLocationId(locationItem.id);
      setLocationSlugManuallyEdited(Boolean(locationItem.slug));
      setLocationSlugMessage("");
      setLocationSlugAvailable(false);
      setCheckingLocationSlug(false);
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
        paymentMethodLabel: locationItem.paymentMethodLabel,
        paymentAccountDisplayName: locationItem.paymentAccountDisplayName,
        paymentAccountIdentifierDisplay: locationItem.paymentAccountIdentifierDisplay,
        paymentQrImageUrl: locationItem.paymentQrImageUrl,
        paymentQrActive: locationItem.paymentQrActive,
        isPrimary: locationItem.isPrimary,
        isActive: locationItem.isActive,
        hours: locationItem.hours.length ? locationItem.hours : defaultHours
      });
    } else {
      setEditingLocationSlug("");
      setEditingLocationId("");
      setLocationSlugManuallyEdited(false);
      setLocationSlugMessage("");
      setLocationSlugAvailable(false);
      setCheckingLocationSlug(false);
      setLocationForm(emptyLocationForm);
    }

    setLocationDialogOpen(true);
  }

  useEffect(() => {
    if (!locationDialogOpen || locationSlugManuallyEdited) {
      return;
    }

    const nextSlug = buildLocationSlug(locationForm.name);
    setLocationForm((current) => ({ ...current, slug: nextSlug }));
  }, [locationDialogOpen, locationForm.name, locationSlugManuallyEdited]);

  useEffect(() => {
    if (!locationDialogOpen) {
      return undefined;
    }

    const nextSlug = buildLocationSlug(locationForm.slug || "");
    setLocationSlugAvailable(false);

    if (!nextSlug) {
      setLocationSlugMessage("");
      setCheckingLocationSlug(false);
      return undefined;
    }

    setCheckingLocationSlug(true);
    const controller = new AbortController();
    let isCurrent = true;
    const timeout = window.setTimeout(() => {
      vendorDashboardOperations
        .checkLocationSlugAvailability(
          token,
          selectedTenantSlug,
          nextSlug,
          editingLocationId || undefined
        )
        .then((response) => {
          if (!isCurrent) {
            return;
          }
          setLocationSlugAvailable(response.available && response.valid);
          setLocationSlugMessage(response.message);
        })
        .catch((availabilityError) => {
          if (!isCurrent || (availabilityError instanceof DOMException && availabilityError.name === "AbortError")) {
            return;
          }
          setLocationSlugAvailable(false);
          setLocationSlugMessage(getErrorMessage(availabilityError));
        })
        .finally(() => {
          if (isCurrent) {
            setCheckingLocationSlug(false);
          }
        });
    }, 300);

    return () => {
      isCurrent = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [locationDialogOpen, locationForm.slug, token, selectedTenantSlug, editingLocationId]);

  async function saveLocation() {
    setBusyAction("location");
    setError("");

    try {
      if (!locationSlugAvailable) {
        setError(locationSlugMessage || "Choose an available location slug before saving.");
        return;
      }
      const payload = {
        name: locationForm.name,
        slug: locationForm.slug,
        addressLine1: locationForm.addressLine1,
        addressLine2: locationForm.addressLine2,
        city: locationForm.city,
        province: locationForm.province,
        postalCode: locationForm.postalCode,
        country: locationForm.country,
        contactEmail: locationForm.contactEmail,
        contactPhone: locationForm.contactPhone,
        timezone: locationForm.timezone,
        paymentMethodLabel: locationForm.paymentMethodLabel,
        paymentAccountDisplayName: locationForm.paymentAccountDisplayName,
        paymentAccountIdentifierDisplay: locationForm.paymentAccountIdentifierDisplay,
        paymentQrImageUrl: locationForm.paymentQrImageUrl,
        paymentQrActive: locationForm.paymentQrActive,
        isPrimary: locationForm.isPrimary,
        isActive: locationForm.isActive
      };
      const locationResponse = await vendorDashboardOperations.saveLocation(
        token,
        selectedTenantSlug,
        editingLocationSlug || null,
        payload
      );

      const hoursResponse = await vendorDashboardOperations.saveLocationHours(
        token,
        selectedTenantSlug,
        locationResponse.location.slug,
        locationForm.hours
      );

      setLocations((current) => {
        const next = current.filter((item) => item.id !== hoursResponse.location.id);
        return [...next, hoursResponse.location].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name));
      });
      setSelectedLocationSlug(hoursResponse.location.slug);
      setLocationDialogOpen(false);
      setPaymentQrUploadFile(null);
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
                  <Badge color={locationItem.openStatus.isOpen ? "teal" : "red"}>
                    {locationItem.openStatus.isOpen ? "Open" : "Closed"}
                  </Badge>
                  {locationItem.paymentQrActive ? (
                    <Badge color="yellow" variant="light">Payment QR</Badge>
                  ) : null}
                </Group>
              </Group>
              {locationItem.paymentQrActive ? (
                <Text size="sm" c="dimmed">
                  {locationItem.paymentMethodLabel} · {locationItem.paymentAccountDisplayName}
                </Text>
              ) : null}
              <Switch
                checked={locationItem.isActive}
                disabled={busyAction === `location-status:${locationItem.slug}`}
                label={locationItem.isActive ? "Location enabled" : "Location disabled"}
                onChange={(event) => handleToggleLocationActive(locationItem, event.currentTarget.checked)}
              />
              <Text size="sm" c="dimmed">{locationItem.openStatus.summary}</Text>
              <TextInput label="Join URL" readOnly value={locationItem.joinUrl} />
              <TextInput label="Monitor URL" readOnly value={locationItem.monitorUrl} />
              <Group>
                <Button variant="default" onClick={() => setSelectedLocationSlug(locationItem.slug)}>
                  Select
                </Button>
                <Button variant="default" onClick={() => openLocationDialog(locationItem)}>
                  Edit
                </Button>
                {effectiveEntitlements?.brandedQueuePages ? (
                  <Button className="neura-secondary-button" onClick={() => openThemeDialog(locationItem)}>
                    Setup Theme
                  </Button>
                ) : null}
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
                    <Switch
                      checked={counter.isActive}
                      disabled={busyAction === `counter-status:${counter.slug}`}
                      label={counter.isActive ? "Enabled" : "Disabled"}
                      onChange={(event) => handleToggleCounterActive(counter, event.currentTarget.checked)}
                    />
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
                    <Button
                      color="red"
                      size="xs"
                      variant="light"
                      onClick={() =>
                        openConfirmAction({
                          title: "Remove counter?",
                          description: "This will permanently remove the counter from the location.",
                          confirmLabel: "Remove counter",
                          confirmColor: "red",
                          onConfirm: async () => {
                            await handleDeleteCounter(counter);
                          }
                        })
                      }
                    >
                      Remove
                    </Button>
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

  function renderServiceDialog() {
    return (
      <Modal
        centered
        opened={serviceDialogOpen}
        onClose={() => setServiceDialogOpen(false)}
        size="xl"
        title={
          <Stack gap={2}>
            <Text className="service-dialog__modal-eyebrow">{editingServiceSlug ? "EDIT" : "ADD"} SERVICE</Text>
            <Text className="service-dialog__modal-title">
              {serviceForm.name ? `Service: ${serviceForm.name}` : "Service: New service"}
            </Text>
          </Stack>
        }
        overlayProps={{ blur: 6, backgroundOpacity: 0.35 }}
        scrollAreaComponent={ScrollArea.Autosize}
      >
        <form onSubmit={handleSaveService}>
          <Stack gap="lg">
            <Group justify="space-between" align="flex-start" className="service-dialog__header">
              <div>
                <Text c="dimmed" size="sm">
                  Configure booking details, pricing, and the service&apos;s availability state.
                </Text>
              </div>
              <Badge variant="light" color="orange">
                Vendor admin
              </Badge>
            </Group>

            <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
              <Card className="service-dialog__panel" withBorder radius="xl" p="md">
                <Stack gap="md">
                  <div>
                    <Text className="service-dialog__label">Basics</Text>
                    <Text fw={700}>Identity and timing</Text>
                  </div>
                  <TextInput
                    label="Service name"
                    required
                    value={serviceForm.name}
                    onChange={(event) => {
                      const nextName = event.target.value;
                      setServiceForm((current) => ({
                        ...current,
                        name: nextName,
                        slug: serviceSlugManuallyEdited ? current.slug : buildServiceSlug(nextName)
                      }));
                    }}
                  />
                  <TextInput
                    label="Slug"
                    description={checkingServiceSlug ? "Checking slug availability..." : serviceSlugMessage}
                    error={
                      !serviceSlugAvailable && serviceForm.slug
                        ? serviceSlugMessage || "That service slug is already taken for this vendor."
                        : undefined
                    }
                    value={serviceForm.slug || ""}
                    onChange={(event) => {
                      setServiceSlugManuallyEdited(true);
                      setServiceForm((current) => ({ ...current, slug: buildServiceSlug(event.target.value) }));
                    }}
                  />
                  <NumberInput
                    label="Duration"
                    min={5}
                    max={480}
                    required
                    suffix=" min"
                    value={serviceForm.durationMinutes}
                    onChange={(value) =>
                      setServiceForm((current) => ({
                        ...current,
                        durationMinutes: Number(value) || 30
                      }))
                    }
                  />
                  <NumberInput
                    label="Display order"
                    value={serviceForm.sortOrder || 0}
                    onChange={(value) =>
                      setServiceForm((current) => ({ ...current, sortOrder: Number(value) || 0 }))
                    }
                  />
                </Stack>
              </Card>

              <Card className="service-dialog__panel" withBorder radius="xl" p="md">
                <Stack gap="md">
                  <div>
                    <Text className="service-dialog__label">Pricing</Text>
                    <Text fw={700}>Payment and display rules</Text>
                  </div>
                  <NumberInput
                    decimalScale={2}
                    fixedDecimalScale
                    label="Price"
                    min={0}
                    prefix="PHP "
                    value={(serviceForm.priceAmountCents || 0) / 100}
                    onChange={(value) =>
                      setServiceForm((current) => ({
                        ...current,
                        priceAmountCents: Math.max(0, Math.round((Number(value) || 0) * 100))
                      }))
                    }
                  />
                  <TextInput
                    label="Price display override"
                    placeholder="Leave blank to auto-format"
                    value={serviceForm.priceDisplay || ""}
                    onChange={(event) =>
                      setServiceForm((current) => ({ ...current, priceDisplay: event.target.value }))
                    }
                  />
                  <Switch
                    checked={serviceForm.manualPaymentRequired === true}
                    label="Require manual payment"
                    description="Customers must submit payment reference and proof before vendor confirmation."
                    onChange={(event) =>
                      setServiceForm((current) => ({
                        ...current,
                        manualPaymentRequired: event.currentTarget.checked
                      }))
                    }
                  />
                  <Switch
                    checked={serviceForm.allowBookingQuantity === true}
                    label="Allow units"
                    onChange={(event) =>
                      setServiceForm((current) => ({
                        ...current,
                        allowBookingQuantity: event.currentTarget.checked,
                        bookingQuantityLabel: event.currentTarget.checked
                          ? current.bookingQuantityLabel || "Units"
                          : current.bookingQuantityLabel
                      }))
                    }
                  />
                  {serviceForm.allowBookingQuantity ? (
                    <TextInput
                      label="Unit label"
                      maxLength={40}
                      required
                      value={serviceForm.bookingQuantityLabel || "Units"}
                      onChange={(event) =>
                        setServiceForm((current) => ({
                          ...current,
                          bookingQuantityLabel: event.target.value
                        }))
                      }
                    />
                  ) : null}
                  <Select
                    allowDeselect={false}
                    data={[
                      {
                        value: "service",
                        label: "Same service only"
                      },
                      {
                        value: "location",
                        label: "All services at this branch"
                      }
                    ]}
                    label="Booking capacity"
                    description="Controls whether overlapping bookings from other services can consume this service's slot capacity."
                    value={serviceForm.bookingCapacityScope || "service"}
                    onChange={(value) =>
                      setServiceForm((current) => ({
                        ...current,
                        bookingCapacityScope: value === "location" ? "location" : "service"
                      }))
                    }
                  />
                </Stack>
              </Card>
            </SimpleGrid>

            <Card className="service-dialog__panel" withBorder radius="xl" p="md">
              <Stack gap="md">
                <div>
                  <Text className="service-dialog__label">Notes</Text>
                  <Text fw={700}>Description and activation</Text>
                </div>
                <Textarea
                  autosize
                  label="Description"
                  minRows={4}
                  value={serviceForm.description || ""}
                  onChange={(event) =>
                    setServiceForm((current) => ({ ...current, description: event.target.value }))
                  }
                />
                <Switch
                  checked={serviceForm.isActive !== false}
                  label="Active service"
                  onChange={(event) =>
                    setServiceForm((current) => ({ ...current, isActive: event.currentTarget.checked }))
                  }
                />
              </Stack>
            </Card>

            <Group justify="space-between" align="center" className="service-dialog__footer">
              <Text c="dimmed" size="sm">
                {editingServiceSlug
                  ? "Update this service and keep the catalog ready for booking flows."
                  : "Create the service before exposing it to customers and queue scheduling."}
              </Text>
              <Group gap="sm">
                <Button variant="default" onClick={() => setServiceDialogOpen(false)}>
                  Cancel
                </Button>
                <Button className="neura-primary-button" disabled={busyAction === "service-save"} type="submit">
                  {busyAction === "service-save" ? "Saving..." : "Save service"}
                </Button>
              </Group>
            </Group>
          </Stack>
        </form>
      </Modal>
    );
  }

  function renderAvailabilityBlockDialog() {
    return (
      <Modal
        centered
        opened={availabilityBlockDialogOpen}
        onClose={() => setAvailabilityBlockDialogOpen(false)}
        size="xl"
        title={
          <Stack gap={2}>
            <Text className="service-dialog__modal-eyebrow">WEEKLY AVAILABILITY</Text>
            <Text className="service-dialog__modal-title">
              {availabilityBlockForm.weekday
                ? `Rule: ${weekdayOptions.find((day) => day.value === String(availabilityBlockForm.weekday))?.label || "New rule"}`
                : "Rule: New availability"}
            </Text>
          </Stack>
        }
        overlayProps={{ blur: 6, backgroundOpacity: 0.35 }}
        scrollAreaComponent={ScrollArea.Autosize}
      >
        <form onSubmit={handleSaveAvailabilityBlock}>
          <Stack gap="lg">
            <Group justify="space-between" align="flex-start" className="service-dialog__header">
              <div>
                <Text c="dimmed" size="sm">
                  Define recurring weekly hours for a location, with optional service scoping and notes.
                </Text>
              </div>
              <Badge variant="light" color="orange">
                Vendor admin
              </Badge>
            </Group>

            <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
              <Card className="service-dialog__panel" withBorder radius="xl" p="md">
                <Stack gap="md">
                  <div>
                    <Text className="service-dialog__label">Schedule</Text>
                    <Text fw={700}>Day and time range</Text>
                  </div>
                  <Select
                    data={weekdayOptions}
                    label="Day"
                    required
                    value={String(availabilityBlockForm.weekday)}
                    onChange={(value) =>
                      setAvailabilityBlockForm((current) => ({ ...current, weekday: Number(value || 1) }))
                    }
                  />
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                    <TextInput
                      label="Starts"
                      required
                      type="time"
                      value={availabilityBlockForm.startsAt}
                      onChange={(event) =>
                        setAvailabilityBlockForm((current) => ({ ...current, startsAt: event.target.value }))
                      }
                    />
                    <TextInput
                      label="Ends"
                      required
                      type="time"
                      value={availabilityBlockForm.endsAt}
                      onChange={(event) =>
                        setAvailabilityBlockForm((current) => ({ ...current, endsAt: event.target.value }))
                      }
                    />
                  </SimpleGrid>
                  <NumberInput
                    label="Capacity"
                    min={1}
                    max={100}
                    value={availabilityBlockForm.capacity}
                    onChange={(value) =>
                      setAvailabilityBlockForm((current) => ({ ...current, capacity: Number(value) || 1 }))
                    }
                  />
                </Stack>
              </Card>

              <Card className="service-dialog__panel" withBorder radius="xl" p="md">
                <Stack gap="md">
                  <div>
                    <Text className="service-dialog__label">Scope</Text>
                    <Text fw={700}>Service and state</Text>
                  </div>
                  <Select
                    data={serviceOptions}
                    label="Service"
                    value={availabilityBlockForm.serviceSlug || ""}
                    onChange={(value) =>
                      setAvailabilityBlockForm((current) => ({ ...current, serviceSlug: value || "" }))
                    }
                  />
                  <Switch
                    checked={availabilityBlockForm.isActive !== false}
                    label="Active weekly rule"
                    onChange={(event) =>
                      setAvailabilityBlockForm((current) => ({
                        ...current,
                        isActive: event.currentTarget.checked
                      }))
                    }
                  />
                </Stack>
              </Card>
            </SimpleGrid>

            <Card className="service-dialog__panel" withBorder radius="xl" p="md">
              <Stack gap="md">
                <div>
                  <Text className="service-dialog__label">Notes</Text>
                  <Text fw={700}>Internal guidance</Text>
                </div>
                <Textarea
                  autosize
                  label="Notes"
                  minRows={3}
                  value={availabilityBlockForm.notes || ""}
                  onChange={(event) =>
                    setAvailabilityBlockForm((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </Stack>
            </Card>

            <Group justify="space-between" align="center" className="service-dialog__footer">
              <Text c="dimmed" size="sm">
                {editingAvailabilityBlockId
                  ? "Update the weekly rule and keep the schedule aligned with the current location."
                  : "Create the rule before exposing it in the weekly availability table."}
              </Text>
              <Group gap="sm">
                <Button variant="default" onClick={() => setAvailabilityBlockDialogOpen(false)}>
                  Cancel
                </Button>
                <Button className="neura-primary-button" disabled={busyAction === "availability-block-save"} type="submit">
                  {busyAction === "availability-block-save" ? "Saving..." : "Save availability"}
                </Button>
              </Group>
            </Group>
          </Stack>
        </form>
      </Modal>
    );
  }

  function renderAvailabilityExceptionDialog() {
    return (
      <Modal
        centered
        opened={availabilityExceptionDialogOpen}
        onClose={() => setAvailabilityExceptionDialogOpen(false)}
        size="xl"
        title={
          <Stack gap={2}>
            <Text className="service-dialog__modal-eyebrow">DATE EXCEPTION</Text>
            <Text className="service-dialog__modal-title">
              {availabilityExceptionForm.exceptionDate
                ? `Exception: ${formatDate(availabilityExceptionForm.exceptionDate)}`
                : "Exception: New exception"}
            </Text>
          </Stack>
        }
        overlayProps={{ blur: 6, backgroundOpacity: 0.35 }}
        scrollAreaComponent={ScrollArea.Autosize}
      >
        <form onSubmit={handleSaveAvailabilityException}>
          <Stack gap="lg">
            <Group justify="space-between" align="flex-start" className="service-dialog__header">
              <div>
                <Text c="dimmed" size="sm">
                  Override recurring availability for a specific date with optional time and capacity changes.
                </Text>
              </div>
              <Badge variant="light" color="orange">
                Vendor admin
              </Badge>
            </Group>

            <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
              <Card className="service-dialog__panel" withBorder radius="xl" p="md">
                <Stack gap="md">
                  <div>
                    <Text className="service-dialog__label">Schedule</Text>
                    <Text fw={700}>Date and timing</Text>
                  </div>
                  <DatePickerInput
                    label="Date"
                    clearable={false}
                    leftSection={<IconCalendar size={16} />}
                    placeholder="Select date"
                    required
                    value={availabilityExceptionForm.exceptionDate || null}
                    onChange={(value) =>
                      setAvailabilityExceptionForm((current) => ({
                        ...current,
                        exceptionDate: value || ""
                      }))
                    }
                  />
                  <Checkbox
                    checked={availabilityExceptionBlockEntireDay}
                    label={
                      <Group gap={6} align="center" wrap="nowrap">
                        <Text span size="sm">
                          Block entire day
                        </Text>
                        <Tooltip label="Marks the selected date as unavailable for every service and time slot." withArrow>
                          <ActionIcon aria-label="Block entire day help" variant="subtle">
                            <IconInfoCircle size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    }
                    onChange={(event) =>
                      setAvailabilityExceptionBlockEntireDay(event.currentTarget.checked)
                    }
                  />
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                    <div>
                      <TextInput
                        label="Starts"
                        type="time"
                        disabled={availabilityExceptionBlockEntireDay}
                        value={availabilityExceptionForm.startsAt || ""}
                        onChange={(event) =>
                          setAvailabilityExceptionForm((current) => ({ ...current, startsAt: event.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <TextInput
                        label="Ends"
                        type="time"
                        disabled={availabilityExceptionBlockEntireDay}
                        value={availabilityExceptionForm.endsAt || ""}
                        onChange={(event) =>
                          setAvailabilityExceptionForm((current) => ({ ...current, endsAt: event.target.value }))
                        }
                      />
                    </div>
                  </SimpleGrid>
                  <NumberInput
                    label="Capacity override"
                    min={1}
                    max={100}
                    labelProps={{
                      children: (
                        <Group gap={6} wrap="nowrap">
                          <span>Capacity override</span>
                          <Tooltip label="Overrides the normal capacity for this date or time window." withArrow>
                            <ActionIcon aria-label="Capacity override help" variant="subtle">
                              <IconInfoCircle size={16} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      )
                    }}
                    value={availabilityExceptionForm.capacity ?? undefined}
                    onChange={(value) =>
                      setAvailabilityExceptionForm((current) => ({
                        ...current,
                        capacity: value === "" || value === null ? null : Number(value)
                      }))
                    }
                  />
                </Stack>
              </Card>

              <Card className="service-dialog__panel" withBorder radius="xl" p="md">
                <Stack gap="md">
                  <div>
                    <Text className="service-dialog__label">Scope</Text>
                    <Text fw={700}>Service and availability</Text>
                  </div>
                  <Select
                    data={serviceOptions}
                    label="Service"
                    value={availabilityExceptionForm.serviceSlug || ""}
                    onChange={(value) =>
                      setAvailabilityExceptionForm((current) => ({ ...current, serviceSlug: value || "" }))
                    }
                  />
                  <Divider />
                  <Text c="dimmed" size="sm">
                    Choose whether this exception blocks availability or opens a specific date for booking.
                  </Text>
                  <Switch
                    checked={availabilityExceptionForm.isAvailable}
                    label="Allow bookings on this date"
                    onChange={(event) =>
                      setAvailabilityExceptionForm((current) => ({
                        ...current,
                        isAvailable: event.currentTarget.checked
                      }))
                    }
                  />
                </Stack>
              </Card>
            </SimpleGrid>

            <Card className="service-dialog__panel" withBorder radius="xl" p="md">
              <Stack gap="md">
                <div>
                  <Text className="service-dialog__label">Notes</Text>
                  <Text fw={700}>Reason and context</Text>
                </div>
                <Textarea
                  autosize
                  label="Reason"
                  minRows={3}
                  value={availabilityExceptionForm.reason || ""}
                  onChange={(event) =>
                    setAvailabilityExceptionForm((current) => ({ ...current, reason: event.target.value }))
                  }
                />
              </Stack>
            </Card>

            <Group justify="space-between" align="center" className="service-dialog__footer">
              <Text c="dimmed" size="sm">
                {editingAvailabilityExceptionId
                  ? "Update the exception and keep the date-specific availability aligned."
                  : "Create the exception before exposing it in the availability exceptions table."}
              </Text>
              <Group gap="sm">
                <Button variant="default" onClick={() => setAvailabilityExceptionDialogOpen(false)}>
                  Cancel
                </Button>
                <Button className="neura-primary-button" disabled={busyAction === "availability-exception-save"} type="submit">
                  {busyAction === "availability-exception-save" ? "Saving..." : "Save exception"}
                </Button>
              </Group>
            </Group>
          </Stack>
        </form>
      </Modal>
    );
  }

  function renderServicesPage() {
    const activeServices = services.filter((service) => service.isActive).length;

    return (
      <Stack gap="lg">
        <SimpleGrid cols={{ base: 1, md: 3 }}>
          <MetricCard
            detail="Visible to future booking flows."
            label="Active services"
            value={activeServices}
          />
          <MetricCard
            detail="Inactive services stay available for reporting history."
            label="Draft or disabled"
            value={services.length - activeServices}
          />
          <Card className="neura-card" padding="lg">
            <Stack gap="md">
              <Text className="neura-label">Catalog controls</Text>
              <Title order={3}>Service setup</Title>
              <Button className="neura-primary-button" onClick={() => openServiceDialog()}>
                Add service
              </Button>
            </Stack>
          </Card>
        </SimpleGrid>

        <Card className="neura-card" padding="lg">
          <Tabs value={servicesTab} onChange={(value) => setServicesTab((value as typeof servicesTab) || "catalog")}>
            <Tabs.List>
              <Tabs.Tab value="catalog">Service catalog</Tabs.Tab>
              <Tabs.Tab value="weekly">Weekly availability</Tabs.Tab>
              <Tabs.Tab value="exceptions">Availability exceptions</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel pt="lg" value="catalog">
              <Stack gap="md">
                <Group justify="space-between">
                  <div>
                    <Text className="neura-label">Vendor Admin</Text>
                    <Title order={3}>Service catalog</Title>
                  </div>
                  <Button className="neura-secondary-button" onClick={() => openServiceDialog()}>
                    New service
                  </Button>
                </Group>
                {services.length ? (
                  <Table.ScrollContainer minWidth={900}>
                    <Table className="neura-services-table" verticalSpacing="sm">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>ID</Table.Th>
                          <Table.Th>Service</Table.Th>
                          <Table.Th>Duration</Table.Th>
                          <Table.Th>Price</Table.Th>
                          <Table.Th>Status</Table.Th>
                          <Table.Th>Order</Table.Th>
                          <Table.Th style={{ width: 1, whiteSpace: "nowrap" }}>Actions</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {services.map((service) => (
                          <Table.Tr key={service.id}>
                            <Table.Td fw={700} className="neura-services-table__sticky neura-services-table__sticky-first">
                              {service.id}
                            </Table.Td>
                            <Table.Td>
                              <Stack gap={2}>
                                <Text fw={700} c={service.isActive ? undefined : "dimmed"}>
                                  {service.name}
                                </Text>
                                <Text c={service.isActive ? "dimmed" : "gray"} size="sm">
                                  {service.description || service.slug}
                                </Text>
                              </Stack>
                            </Table.Td>
                            <Table.Td>
                              <Text c={service.isActive ? undefined : "dimmed"}>{service.durationMinutes} min</Text>
                              {service.allowBookingQuantity ? (
                                <Text c={service.isActive ? "dimmed" : "gray"} size="sm">
                                  {service.bookingQuantityLabel}
                                </Text>
                              ) : null}
                              {service.manualPaymentRequired ? (
                                <Badge color="yellow" variant="light">Manual payment</Badge>
                              ) : null}
                              <Text c={service.isActive ? "dimmed" : "gray"} size="sm">
                                {service.bookingCapacityScope === "location" ? "Branch-wide capacity" : "Service-only capacity"}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              <Text c={service.isActive ? undefined : "dimmed"}>
                                {service.priceDisplay || `PHP ${(service.priceAmountCents / 100).toLocaleString()}`}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              <Badge color={service.isActive ? "teal" : "gray"} variant="light">
                                {service.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </Table.Td>
                            <Table.Td>
                              <Text c={service.isActive ? undefined : "dimmed"}>{service.sortOrder}</Text>
                            </Table.Td>
                            <Table.Td
                              className="neura-services-table__sticky neura-services-table__sticky-last"
                              style={{ width: 1, whiteSpace: "nowrap" }}
                            >
                              <Group gap="xs" wrap="nowrap">
                                <Tooltip label="Edit service" withArrow>
                                  <ActionIcon aria-label="Edit service" onClick={() => openServiceDialog(service)} variant="light">
                                    <IconPencil size={16} />
                                  </ActionIcon>
                                </Tooltip>
                                <Switch
                                  checked={service.isActive}
                                  disabled={busyAction === `service-status:${service.slug}`}
                                  onChange={(event) =>
                                    handleToggleServiceActive(service, event.currentTarget.checked)
                                  }
                                />
                                <Tooltip label="Delete service" withArrow>
                                  <ActionIcon
                                    aria-label="Delete service"
                                    color="red"
                                    variant="light"
                                    disabled={busyAction === `service-delete:${service.slug}`}
                                    onClick={() =>
                                      openConfirmAction({
                                        title: "Delete service?",
                                        description: "This will permanently remove the service from the catalog.",
                                        confirmLabel: "Delete service",
                                        confirmColor: "red",
                                        onConfirm: async () => {
                                          await handleDeleteService(service);
                                        }
                                      })
                                    }
                                  >
                                    <IconTrash size={16} />
                                  </ActionIcon>
                                </Tooltip>
                              </Group>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                ) : (
                  <DashboardEmptyState
                    title="No services yet"
                    text="Add services before building availability and customer booking flows."
                  />
                )}
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel pt="lg" value="weekly">
              <Stack gap="md">
                <Group justify="space-between">
                  <div>
                    <Text className="neura-label">{selectedLocation?.name || "Selected location"}</Text>
                    <Title order={3}>Weekly availability</Title>
                  </div>
                  <Button className="neura-secondary-button" onClick={() => openAvailabilityBlockDialog()}>
                    Add weekly rule
                  </Button>
                </Group>
                {availabilityBlocks.length ? (
                  <Table.ScrollContainer minWidth={900}>
                    <Table className="neura-availability-table" verticalSpacing="sm">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>ID</Table.Th>
                          <Table.Th>Day</Table.Th>
                          <Table.Th>Time</Table.Th>
                          <Table.Th>Service</Table.Th>
                          <Table.Th>Capacity</Table.Th>
                          <Table.Th>Status</Table.Th>
                          <Table.Th style={{ width: 1, whiteSpace: "nowrap" }}>Actions</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {availabilityBlocks.map((block) => (
                          <Table.Tr key={block.id}>
                            <Table.Td fw={700} className="neura-availability-table__sticky neura-availability-table__sticky-first">
                              {block.id}
                            </Table.Td>
                            <Table.Td>
                              <Text c={block.isActive ? undefined : "dimmed"}>
                                {weekdayOptions.find((day) => day.value === String(block.weekday))?.label}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              <Text c={block.isActive ? undefined : "dimmed"}>{block.startsAt} - {block.endsAt}</Text>
                            </Table.Td>
                            <Table.Td>
                              <Text c={block.isActive ? undefined : "dimmed"}>{getServiceLabel(block.serviceId)}</Text>
                            </Table.Td>
                            <Table.Td>
                              <Text c={block.isActive ? undefined : "dimmed"}>{block.capacity}</Text>
                            </Table.Td>
                            <Table.Td>
                              <Badge color={block.isActive ? "teal" : "gray"} variant="light">
                                {block.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </Table.Td>
                            <Table.Td
                              className="neura-availability-table__sticky neura-availability-table__sticky-last"
                              style={{ width: 1, whiteSpace: "nowrap" }}
                            >
                              <Group gap="xs" wrap="nowrap">
                                <Tooltip label="Edit weekly rule" withArrow>
                                  <ActionIcon aria-label="Edit weekly rule" onClick={() => openAvailabilityBlockDialog(block)} variant="light">
                                    <IconPencil size={16} />
                                  </ActionIcon>
                                </Tooltip>
                                <Switch
                                  checked={block.isActive}
                                  disabled={busyAction === `availability-block-status:${block.id}`}
                                  onChange={(event) => handleToggleAvailabilityBlockActive(block, event.currentTarget.checked)}
                                />
                                <Tooltip label="Delete weekly rule" withArrow>
                                  <ActionIcon
                                    aria-label="Delete weekly rule"
                                    color="red"
                                    variant="light"
                                    disabled={busyAction === `availability-block-delete:${block.id}`}
                                    onClick={() =>
                                      openConfirmAction({
                                        title: "Delete weekly rule?",
                                        description: "This will permanently remove the recurring availability rule from the schedule.",
                                        confirmLabel: "Delete rule",
                                        confirmColor: "red",
                                        onConfirm: async () => {
                                          await handleDeleteAvailabilityBlock(block);
                                        }
                                      })
                                    }
                                  >
                                    <IconTrash size={16} />
                                  </ActionIcon>
                                </Tooltip>
                              </Group>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                ) : (
                  <DashboardEmptyState
                    title="No weekly availability"
                    text="Add recurring bookable hours for this branch."
                  />
                )}
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel pt="lg" value="exceptions">
              <Stack gap="md">
                <Group justify="space-between">
                  <div>
                    <Text className="neura-label">Date overrides</Text>
                    <Title order={3}>Availability exceptions</Title>
                  </div>
                  <Button className="neura-secondary-button" onClick={() => openAvailabilityExceptionDialog()}>
                    Add exception
                  </Button>
                </Group>
                {availabilityExceptions.length ? (
                  <Table.ScrollContainer minWidth={820}>
                    <Table className="neura-availability-table" verticalSpacing="sm">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>ID</Table.Th>
                          <Table.Th>Date</Table.Th>
                          <Table.Th>Time</Table.Th>
                          <Table.Th>Service</Table.Th>
                          <Table.Th>Mode</Table.Th>
                          <Table.Th>Reason</Table.Th>
                          <Table.Th style={{ width: 1, whiteSpace: "nowrap" }}>Actions</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {availabilityExceptions.map((exception) => (
                          <Table.Tr key={exception.id}>
                            <Table.Td fw={700} className="neura-availability-table__sticky neura-availability-table__sticky-first">
                              {exception.id}
                            </Table.Td>
                            <Table.Td>
                              <Text c={exception.isAvailable ? undefined : "dimmed"}>{formatDate(exception.exceptionDate)}</Text>
                            </Table.Td>
                            <Table.Td>
                              <Text c={exception.isAvailable ? undefined : "dimmed"}>
                                {exception.startsAt && exception.endsAt ? `${exception.startsAt} - ${exception.endsAt}` : "Full day"}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              <Text c={exception.isAvailable ? undefined : "dimmed"}>{getServiceLabel(exception.serviceId)}</Text>
                            </Table.Td>
                            <Table.Td>
                              <Badge color={exception.isAvailable ? "teal" : "red"} variant="light">
                                {exception.isAvailable ? "Available" : "Blocked"}
                              </Badge>
                            </Table.Td>
                            <Table.Td>
                              <Text c={exception.isAvailable ? undefined : "dimmed"}>{exception.reason || "-"}</Text>
                            </Table.Td>
                            <Table.Td
                              className="neura-availability-table__sticky neura-availability-table__sticky-last"
                              style={{ width: 1, whiteSpace: "nowrap" }}
                            >
                              <Group gap="xs" wrap="nowrap">
                                <Tooltip label="Edit exception" withArrow>
                                  <ActionIcon aria-label="Edit exception" onClick={() => openAvailabilityExceptionDialog(exception)} variant="light">
                                    <IconPencil size={16} />
                                  </ActionIcon>
                                </Tooltip>
                                <Switch
                                  checked={exception.isAvailable}
                                  disabled={busyAction === `availability-exception-status:${exception.id}`}
                                  onChange={(event) =>
                                    handleToggleAvailabilityExceptionActive(exception, event.currentTarget.checked)
                                  }
                                />
                                <Tooltip label="Remove exception" withArrow>
                                  <ActionIcon
                                    aria-label="Remove exception"
                                    color="red"
                                    disabled={busyAction === `availability-exception-delete:${exception.id}`}
                                    onClick={() =>
                                      openConfirmAction({
                                        title: "Delete availability exception?",
                                        description: "This will permanently remove the exception from the schedule.",
                                        confirmLabel: "Delete exception",
                                        confirmColor: "red",
                                        onConfirm: async () => {
                                          await handleDeleteAvailabilityException(exception);
                                        }
                                      })
                                    }
                                    variant="light"
                                  >
                                    <IconTrash size={16} />
                                  </ActionIcon>
                                </Tooltip>
                              </Group>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                ) : (
                  <DashboardEmptyState
                    title="No exceptions"
                    text="Add holidays, special hours, or one-off availability overrides."
                  />
                )}
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </Card>
      </Stack>
    );
  }

  function renderBookingsPage() {
    const pendingBookings = vendorBookings.filter((booking) => booking.status === "pending").length;
    const actionableBookings = vendorBookings.filter((booking) =>
      ["pending", "confirmed", "rescheduled"].includes(booking.status)
    ).length;

    return (
      <Stack gap="lg">
        <SimpleGrid cols={{ base: 1, md: 3 }}>
          <MetricCard
            detail="Awaiting vendor confirmation."
            label="Pending requests"
            value={pendingBookings}
          />
          <MetricCard
            detail="Confirmed or waiting for a vendor decision."
            label="Active bookings"
            value={actionableBookings}
          />
          <Card className="neura-card" padding="lg">
            <Stack gap="md">
              <Text className="neura-label">{selectedLocation?.name || "Selected location"}</Text>
              <Title order={3}>Booking queue</Title>
              <Button className="neura-secondary-button" onClick={reloadBookings}>
                Refresh bookings
              </Button>
            </Stack>
          </Card>
        </SimpleGrid>

        <Card className="neura-card" padding="lg">
          <Stack gap="md">
            <Group justify="space-between" align="flex-end">
              <div>
                <Text className="neura-label">{canAdminBookings ? "Vendor Admin" : "Vendor Staff"}</Text>
                <Title order={3}>{canAdminBookings ? "Incoming booking requests" : "Booking check-in queue"}</Title>
              </div>
              <Group gap="sm">
                <TextInput
                  label="Search"
                  placeholder="Reference, customer, service"
                  value={bookingSearch}
                  onChange={(event) => setBookingSearch(event.target.value)}
                />
                <Select
                  data={[
                    { label: "All statuses", value: "all" },
                    { label: "Pending", value: "pending" },
                    { label: "Confirmed", value: "confirmed" },
                    { label: "Rescheduled", value: "rescheduled" },
                    { label: "Canceled", value: "canceled" }
                  ]}
                  label="Status"
                  value={bookingStatusFilter}
                  onChange={(value) => setBookingStatusFilter((value || "all") as BookingStatusFilter)}
                />
                <DatePickerInput
                  type="range"
                  clearable
                  label="Booking date"
                  leftSection={<IconCalendar size={16} />}
                  placeholder="Select date range"
                  value={bookingDateRange}
                  onChange={(value) => setBookingDateRange(value as [Date | null, Date | null])}
                />
                {bookingDateRange[0] || bookingDateRange[1] ? (
                  <Button
                    className="neura-secondary-button"
                    mt={24}
                    onClick={() => setBookingDateRange([null, null])}
                  >
                    Clear range
                  </Button>
                ) : null}
              </Group>
            </Group>

            {filteredBookings.length ? (
              <>
                <Table.ScrollContainer minWidth={1240}>
                  <Table className="neura-bookings-table" verticalSpacing="sm">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>ID</Table.Th>
                          <Table.Th>Reference</Table.Th>
                          <Table.Th>Customer</Table.Th>
                          <Table.Th>Service</Table.Th>
                          <Table.Th>Schedule</Table.Th>
                          <Table.Th>Status</Table.Th>
                        <Table.Th>Payment</Table.Th>
                        <Table.Th>Actions</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {filteredBookings.map((booking) => {
                      const paymentReviewPending = booking.paymentStatus === "pending";
                      const paymentVerified = booking.paymentStatus === "paid";
                      const manualPaymentRequired = Boolean(booking.serviceManualPaymentRequired);
                      const checkInState = getBookingCheckInState(booking);
                      const hasExpired = Boolean(booking.expiredAt);
                        if (booking.status === "completed") {
                          return (
                            <Table.Tr key={booking.id}>
                              <Table.Td fw={700}>
                                {booking.id}
                              </Table.Td>
                              <Table.Td>
                                <Stack gap={2}>
                                  <Button
                                  className="neura-inline-link-button"
                                  onClick={() => {
                                    setPaymentRejectionReason("");
                                    setBookingDetailModalId(booking.id);
                                    setBookingDetailOpen(true);
                                  }}
                                  p={0}
                                  size="xs"
                                  variant="subtle"
                                >
                                  {booking.reference}
                                </Button>
                                <Text c="dimmed" size="sm">Requested {formatDateTime(booking.createdAt)}</Text>
                              </Stack>
                            </Table.Td>
                            <Table.Td>
                              <Stack gap={2}>
                                <Text fw={700}>{booking.customerName}</Text>
                                <Text c="dimmed" size="sm">{booking.customerEmail || booking.customerPhone || "No contact details"}</Text>
                              </Stack>
                            </Table.Td>
                            <Table.Td>
                              <Stack gap={2}>
                                <Text>{booking.serviceName}</Text>
                                <Text c="dimmed" size="sm">Quantity {booking.bookingQuantity}</Text>
                                <Text c="dimmed" size="sm">{booking.servicePriceDisplay || "-"}</Text>
                              </Stack>
                            </Table.Td>
                            <Table.Td>
                              <Stack gap={2}>
                                <Text>{formatBookingScheduleDateTime(booking.scheduledStartAt)}</Text>
                                <Text c="dimmed" size="sm">Ends {formatBookingScheduleDateTime(booking.scheduledEndAt)}</Text>
                              </Stack>
                            </Table.Td>
                            <Table.Td>
                              <Stack gap={4}>
                                <Group gap={6}>
                                  <Badge color={getBookingBadgeColor(booking.status)} variant="light">
                                    {hasExpired ? "expired" : booking.status}
                                  </Badge>
                                  {booking.checkedInAt || booking.linkedTicket ? (
                                    <Badge color="blue" variant="light">Checked in</Badge>
                                  ) : null}
                                  {booking.noShowAt ? (
                                    <Badge color="red" variant="light">No-show</Badge>
                                  ) : null}
                                  {hasExpired ? (
                                    <Badge color="orange" variant="light">Pending timeout</Badge>
                                  ) : null}
                                </Group>
                                {booking.linkedTicket ? (
                                  <Text c="dimmed" size="xs">
                                    Ticket {booking.linkedTicket.ticketNumber}
                                  </Text>
                                ) : null}
                                {hasExpired && booking.expirationReason ? (
                                  <Text c="dimmed" size="xs">{booking.expirationReason}</Text>
                                ) : null}
                              </Stack>
                            </Table.Td>
                            <Table.Td>
                              <Badge color={booking.paymentStatus === "paid" ? "teal" : "gray"} variant="light">
                                {booking.paymentStatus}
                              </Badge>
                            </Table.Td>
                            <Table.Td />
                          </Table.Tr>
                        );
                      }
                      const actionButtons = (() => {
                        if (canAdminBookings && paymentReviewPending && booking.paymentProof) {
                          return (
                            <Group gap="xs" justify="flex-end" wrap="nowrap">
                              <IconActionButton
                                label="Review payment"
                                color="blue"
                                onClick={() => {
                                  setPaymentRejectionReason("");
                                  setBookingDetailModalId(booking.id);
                                  setBookingDetailOpen(true);
                                }}
                              >
                                <IconClipboardList size={16} />
                              </IconActionButton>
                              <IconActionButton
                                label="Reschedule booking"
                                color="orange"
                                onClick={() => openRescheduleDialog(booking)}
                              >
                                <IconCalendar size={16} />
                              </IconActionButton>
                              <IconActionButton
                                label="Cancel booking"
                                color="red"
                                onClick={() =>
                                  openConfirmAction({
                                    title: "Cancel booking?",
                                    description: "Are you sure you want to cancel this booking?",
                                    confirmLabel: "Cancel booking",
                                    confirmColor: "red",
                                    onConfirm: async () => {
                                      await handleUpdateBookingStatus(booking, "canceled");
                                    }
                                  })
                                }
                              >
                                <IconX size={16} />
                              </IconActionButton>
                            </Group>
                          );
                        }

                        if (canAdminBookings && booking.status === "pending" && paymentVerified) {
                          return (
                            <Group gap="xs" justify="flex-end" wrap="nowrap">
                              <IconActionButton
                                label="Confirm booking"
                                color="teal"
                                onClick={() => handleUpdateBookingStatus(booking, "confirmed")}
                              >
                                <IconCheck size={16} />
                              </IconActionButton>
                              <IconActionButton
                                label="Reschedule booking"
                                color="orange"
                                onClick={() => openRescheduleDialog(booking)}
                              >
                                <IconCalendar size={16} />
                              </IconActionButton>
                              <IconActionButton
                                label="Cancel booking"
                                color="red"
                                onClick={() =>
                                  openConfirmAction({
                                    title: "Cancel booking?",
                                    description: "Are you sure you want to cancel this booking?",
                                    confirmLabel: "Cancel booking",
                                    confirmColor: "red",
                                    onConfirm: async () => {
                                      await handleUpdateBookingStatus(booking, "canceled");
                                    }
                                  })
                                }
                              >
                                <IconX size={16} />
                              </IconActionButton>
                            </Group>
                          );
                        }

                        if (canAdminBookings && booking.status === "pending" && !manualPaymentRequired) {
                          return (
                            <Group gap="xs" justify="flex-end" wrap="nowrap">
                              <IconActionButton
                                label="Confirm booking"
                                color="teal"
                                onClick={() => handleUpdateBookingStatus(booking, "confirmed")}
                              >
                                <IconCheck size={16} />
                              </IconActionButton>
                              <IconActionButton
                                label="Reschedule booking"
                                color="orange"
                                onClick={() => openRescheduleDialog(booking)}
                              >
                                <IconCalendar size={16} />
                              </IconActionButton>
                              <IconActionButton
                                label="Cancel booking"
                                color="red"
                                onClick={() =>
                                  openConfirmAction({
                                    title: "Cancel booking?",
                                    description: "Are you sure you want to cancel this booking?",
                                    confirmLabel: "Cancel booking",
                                    confirmColor: "red",
                                    onConfirm: async () => {
                                      await handleUpdateBookingStatus(booking, "canceled");
                                    }
                                  })
                                }
                              >
                                <IconX size={16} />
                              </IconActionButton>
                            </Group>
                          );
                        }

                        if (canAdminBookings && paymentReviewPending && !booking.paymentProof) {
                          return <Text c="dimmed" size="xs">Waiting for customer payment proof.</Text>;
                        }

                        if (canAdminBookings && paymentVerified) {
                          return (
                            <Group gap="xs" justify="flex-end" wrap="nowrap">
                              <IconActionButton
                                label="Reschedule booking"
                                color="orange"
                                onClick={() => openRescheduleDialog(booking)}
                              >
                                <IconCalendar size={16} />
                              </IconActionButton>
                              <IconActionButton
                                label="Cancel booking"
                                color="red"
                                onClick={() =>
                                  openConfirmAction({
                                    title: "Cancel booking?",
                                    description: "Are you sure you want to cancel this booking?",
                                    confirmLabel: "Cancel booking",
                                    confirmColor: "red",
                                    onConfirm: async () => {
                                      await handleUpdateBookingStatus(booking, "canceled");
                                    }
                                  })
                                }
                              >
                                <IconX size={16} />
                              </IconActionButton>
                            </Group>
                          );
                        }

                        if (canAdminBookings && booking.status === "confirmed" && checkInState.isTooEarly) {
                          return (
                            <Group gap="xs" justify="flex-end" wrap="nowrap">
                              <IconActionButton
                                label="Reschedule booking"
                                color="orange"
                                onClick={() => openRescheduleDialog(booking)}
                              >
                                <IconCalendar size={16} />
                              </IconActionButton>
                              <IconActionButton
                                label="Cancel booking"
                                color="red"
                                onClick={() =>
                                  openConfirmAction({
                                    title: "Cancel booking?",
                                    description: "Are you sure you want to cancel this booking?",
                                    confirmLabel: "Cancel booking",
                                    confirmColor: "red",
                                    onConfirm: async () => {
                                      await handleUpdateBookingStatus(booking, "canceled");
                                    }
                                  })
                                }
                              >
                                <IconX size={16} />
                              </IconActionButton>
                            </Group>
                          );
                        }

                        if (canAdminBookings && booking.status === "confirmed" && checkInState.isLate) {
                          return (
                            <Group gap="xs" justify="flex-end" wrap="nowrap">
                              <IconActionButton
                                label="Reschedule booking"
                                color="orange"
                                onClick={() => openRescheduleDialog(booking)}
                              >
                                <IconCalendar size={16} />
                              </IconActionButton>
                              <Tooltip label="Late check-in override: customer is more than 15 minutes past the scheduled start." withArrow>
                                <ActionIcon
                                  aria-label="Late check-in"
                                  color="orange"
                                  disabled={busyAction === `booking-check-in:${booking.id}:override`}
                                  onClick={() => handleCheckInBooking(booking, true)}
                                  variant="light"
                                >
                                  <IconCalendarCheck size={16} />
                                </ActionIcon>
                              </Tooltip>
                              <IconActionButton
                                label="Mark no-show"
                                color="red"
                                disabled={busyAction === `booking-no-show:${booking.id}`}
                                onClick={() => handleMarkBookingNoShow(booking)}
                              >
                                <IconAlertTriangle size={16} />
                              </IconActionButton>
                            </Group>
                          );
                        }

                        return null;
                      })();

                        return (
                        <Table.Tr key={booking.id}>
                          <Table.Td fw={700} className="neura-bookings-table__sticky neura-bookings-table__sticky-first">
                            {booking.id}
                          </Table.Td>
                          <Table.Td>
                            <Stack gap={2}>
                              <Button
                                className="neura-inline-link-button"
                                onClick={() => {
                                  setPaymentRejectionReason("");
                                  setBookingDetailModalId(booking.id);
                                  setBookingDetailOpen(true);
                                }}
                                p={0}
                                size="xs"
                                variant="subtle"
                              >
                                {booking.reference}
                              </Button>
                              <Text c="dimmed" size="sm">Requested {formatDateTime(booking.createdAt)}</Text>
                            </Stack>
                          </Table.Td>
                          <Table.Td>
                            <Stack gap={2}>
                              <Text fw={700}>{booking.customerName}</Text>
                              <Text c="dimmed" size="sm">{booking.customerEmail || booking.customerPhone || "No contact details"}</Text>
                            </Stack>
                          </Table.Td>
                          <Table.Td>
                            <Stack gap={2}>
                              <Text>{booking.serviceName}</Text>
                              <Text c="dimmed" size="sm">Quantity {booking.bookingQuantity}</Text>
                              <Text c="dimmed" size="sm">{booking.servicePriceDisplay || "-"}</Text>
                            </Stack>
                          </Table.Td>
                          <Table.Td>
                            <Stack gap={2}>
                              <Text>{formatBookingScheduleDateTime(booking.scheduledStartAt)}</Text>
                              <Text c="dimmed" size="sm">Ends {formatBookingScheduleDateTime(booking.scheduledEndAt)}</Text>
                            </Stack>
                          </Table.Td>
                          <Table.Td>
                            <Stack gap={4}>
                              <Group gap={6}>
                                <Badge color={getBookingBadgeColor(booking.status)} variant="light">
                                  {hasExpired ? "expired" : booking.status}
                                </Badge>
                                {booking.checkedInAt || booking.linkedTicket ? (
                                  <Badge color="blue" variant="light">Checked in</Badge>
                                ) : null}
                                {booking.noShowAt ? (
                                  <Badge color="red" variant="light">No-show</Badge>
                                ) : null}
                                {hasExpired ? (
                                  <Badge color="orange" variant="light">Pending timeout</Badge>
                                ) : null}
                                {!manualPaymentRequired ? (
                                  <Badge color="gray" variant="light">No manual payment</Badge>
                                ) : null}
                              </Group>
                              {booking.linkedTicket ? (
                                <Text c="dimmed" size="xs">
                                  Ticket {booking.linkedTicket.ticketNumber}
                                </Text>
                              ) : null}
                              {hasExpired && booking.expirationReason ? (
                                <Text c="dimmed" size="xs">{booking.expirationReason}</Text>
                              ) : null}
                            </Stack>
                          </Table.Td>
                          <Table.Td>
                            <Badge color={booking.paymentStatus === "paid" ? "teal" : "gray"} variant="light">
                              {booking.paymentStatus}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Group gap="xs" wrap="wrap">{actionButtons}</Group>
                          </Table.Td>
                        </Table.Tr>
                      );
                      })}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
                {bookingPagination && bookingPagination.totalItems > 0 ? (
                  <Group justify="space-between" mt="md">
                    <Text size="sm" c="dimmed">
                      Showing {vendorBookings.length ? (bookingPage - 1) * 10 + 1 : 0}-
                      {Math.min(bookingPage * 10, bookingPagination.totalItems)} of {bookingPagination.totalItems}
                    </Text>
                    {bookingPagination.totalPages > 1 ? (
                      <Pagination
                        total={bookingPagination.totalPages}
                        value={bookingPage}
                        onChange={setBookingPage}
                      />
                    ) : null}
                  </Group>
                ) : null}
              </>
            ) : (
              <DashboardEmptyState
                title="No booking requests"
                text="Incoming service booking requests for this location will appear here."
              />
            )}
          </Stack>
        </Card>
      </Stack>
    );
  }

  function renderRescheduleDialog() {
    const rescheduleSlotOptions = rescheduleSlots.map((slot) => ({
      value: String(slot.startAt),
      label: `${formatBookingScheduleTimeRange(slot.startAt, slot.endAt)} (${slot.remainingCapacity} left)`,
      disabled: !slot.isAvailable
    }));
    const closeRescheduleDialog = () => {
      setRescheduleDialogOpen(false);
      setReschedulingBooking(null);
      setRescheduleDate("");
      setRescheduleStartAt("");
      setRescheduleSlots([]);
      setRescheduleSlotsError("");
    };

    return (
      <Modal
        centered
        opened={rescheduleDialogOpen}
        onClose={closeRescheduleDialog}
        title={reschedulingBooking ? `Reschedule ${reschedulingBooking.reference}` : "Reschedule booking"}
        scrollAreaComponent={ScrollArea.Autosize}
      >
        <form onSubmit={handleRescheduleBooking}>
          <Stack gap="md">
            {reschedulingBooking ? (
              <Alert color="blue" variant="light">
                {reschedulingBooking.customerName} requested {reschedulingBooking.serviceName}.
              </Alert>
            ) : null}
            <TextInput
              label="Service"
              value={reschedulingBooking ? `${reschedulingBooking.serviceName} - ${formatBookingScheduleTimeRange(reschedulingBooking.scheduledStartAt, reschedulingBooking.scheduledEndAt)}` : ""}
              readOnly
            />
            <TextInput
              label="Branch"
              value={reschedulingBooking?.locationName || ""}
              readOnly
            />
            <DatePickerInput
              clearable={false}
              label="Date"
              leftSection={<IconCalendar size={16} />}
              placeholder="Select date"
              required
              value={rescheduleDate || null}
              onChange={(value) => {
                setRescheduleDate(value || "");
                setRescheduleStartAt("");
              }}
            />
            <Select
              allowDeselect={false}
              data={rescheduleSlotOptions}
              disabled={rescheduleSlotsLoading || !rescheduleDate}
              label="Available slot"
              required
              placeholder={rescheduleSlotsLoading ? "Loading slots..." : "Select a time"}
              value={rescheduleStartAt}
              onChange={(value) => setRescheduleStartAt(value || "")}
            />
            {rescheduleSlotsError ? (
              <Alert color="red">{rescheduleSlotsError}</Alert>
            ) : null}
            {!rescheduleSlotsLoading && rescheduleDate && !rescheduleSlotOptions.length && !rescheduleSlotsError ? (
              <Alert color="yellow">No available slots for this date.</Alert>
            ) : null}
            <Group justify="flex-end">
              <Button variant="default" onClick={closeRescheduleDialog}>
                Cancel
              </Button>
              <Button
                className="neura-primary-button"
                disabled={Boolean(
                  !rescheduleStartAt ||
                    rescheduleSlotsLoading ||
                    (reschedulingBooking && busyAction === `booking-reschedule:${reschedulingBooking.id}`)
                )}
                type="submit"
              >
                {reschedulingBooking && busyAction === `booking-reschedule:${reschedulingBooking.id}`
                  ? "Saving..."
                  : "Save schedule"}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    );
  }

  function renderRescheduleBlockedModal() {
    return (
      <Modal
        centered
        opened={rescheduleBlockModalOpen}
        onClose={() => setRescheduleBlockModalOpen(false)}
        className="reschedule-blocked-modal"
        title="Reschedule blocked"
        scrollAreaComponent={ScrollArea.Autosize}
      >
        <Stack gap="md">
          <Alert color="orange" variant="light">
            Review payment first before rescheduling
          </Alert>
          <Group justify="flex-end">
            <Button className="neura-primary-button" onClick={() => setRescheduleBlockModalOpen(false)}>
              OK
            </Button>
          </Group>
        </Stack>
      </Modal>
    );
  }

  function renderStaffPage() {
    const assignableRoles = isOwner
      ? [
          { label: "Admin", value: "admin" },
          { label: "Staff", value: "staff" }
        ]
      : [{ label: "Staff", value: "staff" }];

    return (
      <Card className="neura-card" padding="lg">
        <Stack gap="md">
          <Group justify="space-between">
            <div>
              <Text className="neura-label">Staff</Text>
              <Title order={3}>Tenant access</Title>
              <Text c="dimmed" size="sm">{staff.length}/{staffSeatLimit} staff seats used</Text>
            </div>
            {isOwner || isAdmin ? (
              <Button
                className="neura-primary-button"
                disabled={staff.length >= staffSeatLimit}
                onClick={() => setStaffDialogOpen(true)}
              >
                Add staff
              </Button>
            ) : null}
          </Group>
          <Table.ScrollContainer minWidth={720}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ID</Table.Th>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Contact</Table.Th>
                  <Table.Th>Role</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Counters</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {staff.map((member) => {
                  const isCurrentUser = member.id === user?.id;
                  const roleOptions = member.role === "owner"
                    ? [{ label: "Owner", value: "owner" }]
                    : member.role === "admin"
                      ? [{ label: "Admin", value: "admin" }]
                      : [{ label: "Staff", value: "staff" }];

                  return (
                    <Table.Tr key={member.id}>
                      <Table.Td fw={700}>{member.id}</Table.Td>
                      <Table.Td fw={700}>{member.name}</Table.Td>
                      <Table.Td>{member.email || member.phone || "--"}</Table.Td>
                      <Table.Td>
                        {member.role === "owner" || isCurrentUser || !isOwner ? (
                          <Select data={roleOptions} disabled value={member.role} />
                        ) : (
                          <Select
                            data={assignableRoles}
                            value={member.role}
                            onChange={(value) =>
                              value && handleUpdateStaffRole(member, value as "owner" | "admin" | "staff")
                            }
                          />
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Switch
                          checked={member.isActive !== false}
                          disabled={member.role === "owner" || isCurrentUser}
                          label={member.isActive !== false ? "Enabled" : "Disabled"}
                          onChange={(event) => handleUpdateStaffStatus(member, event.currentTarget.checked)}
                        />
                      </Table.Td>
                      <Table.Td>
                        {member.assignedCounterIds
                          .map((counterId) => serviceCounters.find((counter) => counter.id === counterId)?.name)
                          .filter(Boolean)
                          .join(", ") || "--"}
                      </Table.Td>
                      <Table.Td>
                        {isOwner && member.role !== "owner" && !isCurrentUser ? (
                          <Button
                            color="red"
                            size="xs"
                            variant="light"
                            onClick={() =>
                              openConfirmAction({
                                title: "Remove staff member?",
                                description: "This will revoke the staff member's access to this tenant.",
                                confirmLabel: "Remove staff",
                                confirmColor: "red",
                                onConfirm: async () => {
                                  await handleRemoveStaff(member);
                                }
                              })
                            }
                          >
                            Remove
                          </Button>
                        ) : null}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Stack>
      </Card>
    );
  }

  function renderClientsPage() {
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
          <Group align="end">
            <TextInput
              label="Search clients"
              placeholder="Name, contact, ticket, status"
              value={clientsSearch}
              onChange={(event) => setClientsSearch(event.currentTarget.value)}
            />
            <Select
              label="Sort by"
              data={[
                { value: "latestVisitDesc", label: "Latest visit newest" },
                { value: "latestVisitAsc", label: "Latest visit oldest" },
                { value: "nameAsc", label: "Name A-Z" },
                { value: "nameDesc", label: "Name Z-A" },
                { value: "visitsDesc", label: "Most visits" },
                { value: "visitsAsc", label: "Fewest visits" }
              ]}
              value={clientsSort}
              onChange={(value) => setClientsSort((value as ClientSort) || "latestVisitDesc")}
            />
          </Group>
          <Table.ScrollContainer minWidth={720}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ID</Table.Th>
                  <Table.Th>Customer</Table.Th>
                  <Table.Th>Contact</Table.Th>
                  <Table.Th>Visits</Table.Th>
                  <Table.Th>Latest ticket</Table.Th>
                  <Table.Th>Latest visit</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {paginatedClients.length ? (
                  paginatedClients.map((client) => (
                    <Table.Tr key={client.id}>
                      <Table.Td fw={700}>{client.id}</Table.Td>
                      <Table.Td fw={700}>{client.customerName}</Table.Td>
                      <Table.Td>{[client.customerEmail, client.customerPhone].filter(Boolean).join(" | ") || "—"}</Table.Td>
                      <Table.Td>{client.visitCount}</Table.Td>
                      <Table.Td>{client.latestTicketNumber}</Table.Td>
                      <Table.Td>{formatDateTime(client.latestVisitAt)}</Table.Td>
                    </Table.Tr>
                  ))
                ) : (
                  <Table.Tr>
                    <Table.Td colSpan={6}>
                      <DashboardEmptyState
                        title={clientsSearch ? "No matching clients." : "No client history yet."}
                        text={
                          clientsSearch
                            ? "Try a different search term or reset the sort."
                            : "Client records appear after tickets are created."
                        }
                      />
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          <Group justify="space-between" align="center">
            <Text c="dimmed" size="sm">
              Showing {paginatedClients.length ? (clientsPage - 1) * CLIENTS_PAGE_SIZE + 1 : 0}-
              {Math.min(clientsPage * CLIENTS_PAGE_SIZE, filteredClients.length)} of {filteredClients.length}
            </Text>
            <Pagination total={clientsTotalPages} value={clientsPage} onChange={setClientsPage} />
          </Group>
        </Stack>
      </Card>
    );
  }

  function renderHistoryPage() {
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
          {canExportHistory && exportTypeOptions.length && historyRangeOptions.length ? (
            <Group align="flex-end">
              <Select
                data={exportTypeOptions}
                label="Export type"
                value={historyExportFormat}
                onChange={(value) => setHistoryExportFormat(value as "csv" | "pdf" | null)}
              />
              <Select
                data={historyRangeOptions}
                label="History length"
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
          <Group align="end">
            <TextInput
              label="Search history"
              placeholder="Ticket, customer, status, lookup code"
              value={historySearch}
              onChange={(event) => setHistorySearch(event.currentTarget.value)}
            />
            <Select
              label="Sort by"
              data={[
                { value: "updatedDesc", label: "Updated newest" },
                { value: "updatedAsc", label: "Updated oldest" },
                { value: "ticketAsc", label: "Ticket A-Z" },
                { value: "ticketDesc", label: "Ticket Z-A" },
                { value: "customerAsc", label: "Customer A-Z" },
                { value: "customerDesc", label: "Customer Z-A" }
              ]}
              value={historySort}
              onChange={(value) => setHistorySort((value as HistorySort) || "updatedDesc")}
            />
          </Group>
          <Table.ScrollContainer minWidth={620}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ID</Table.Th>
                  <Table.Th>Ticket</Table.Th>
                  <Table.Th>Customer</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Updated</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {paginatedHistoryTickets.length ? (
                  paginatedHistoryTickets.map((ticket) => (
                    <Table.Tr key={ticket.id}>
                      <Table.Td fw={700}>{ticket.id}</Table.Td>
                      <Table.Td fw={700}>{ticket.ticketNumber}</Table.Td>
                      <Table.Td>{ticket.customerName}</Table.Td>
                      <Table.Td><Badge variant="light">{ticket.status}</Badge></Table.Td>
                      <Table.Td>{formatDateTime(ticket.updatedAt)}</Table.Td>
                    </Table.Tr>
                  ))
                ) : (
                  <Table.Tr>
                    <Table.Td colSpan={5}>
                      <DashboardEmptyState
                        title={historySearch ? "No matching history records." : "No completed queue activity yet."}
                        text={
                          historySearch
                            ? "Try a different search term or reset the sort."
                            : "Served and skipped tickets will gather here over time."
                        }
                      />
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          <Group justify="space-between" align="center">
            <Text c="dimmed" size="sm">
              Showing {paginatedHistoryTickets.length ? (historyPage - 1) * HISTORY_PAGE_SIZE + 1 : 0}-
              {Math.min(historyPage * HISTORY_PAGE_SIZE, filteredHistoryTickets.length)} of {filteredHistoryTickets.length}
            </Text>
            <Pagination total={historyTotalPages} value={historyPage} onChange={setHistoryPage} />
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
        <Card className="neura-card" padding="lg">
          <Tabs defaultValue="subscription">
            <Tabs.List>
              <Tabs.Tab value="subscription">Subscription</Tabs.Tab>
              <Tabs.Tab value="contact">Contact details</Tabs.Tab>
              <Tabs.Tab value="queue">Queue settings</Tabs.Tab>
              <Tabs.Tab value="notifications">Notifications</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel pt="lg" value="subscription">
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
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <MetricCard label="Tickets" value={`${ticketUsage}/${ticketLimit || "--"}`} detail="Current period" />
                  <MetricCard label="Emails" value={`${emailUsage}/${emailLimit ?? "--"}`} detail="Transactional" />
                </SimpleGrid>
                {!activeSubscription ? <div>{renderPlanCards()}</div> : null}
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel pt="lg" value="contact">
              <form onSubmit={handleSaveSettings}>
                <Stack gap="md">
                  <div>
                    <Text className="neura-label">Tenant settings</Text>
                    <Title order={3}>Contact details</Title>
                    <Text c="dimmed" size="sm">
                      Contact details are used across the queue experience and tenant notifications.
                    </Text>
                  </div>
                  <TextInput
                    name="contactEmail"
                    label="Contact email"
                    description={!canManageContactSettings ? "Only tenant owners can update contact details." : undefined}
                    disabled={!canManageContactSettings}
                    type="email"
                    value={settings.contactEmail}
                    onChange={(event) =>
                      setSettings((current) => ({ ...current, contactEmail: event.target.value }))
                    }
                  />
                  <PhilippineMobileInput
                    name="contactPhone"
                    label="Contact phone"
                    disabled={!canManageContactSettings}
                    value={settings.contactPhone}
                    onChange={(nextValue) =>
                      setSettings((current) => ({ ...current, contactPhone: nextValue }))
                    }
                  />
                  <Button className="neura-secondary-button" disabled={busyAction === "settings"} type="submit">
                    {busyAction === "settings" ? "Saving..." : "Save contact details"}
                  </Button>
                </Stack>
              </form>
            </Tabs.Panel>

            <Tabs.Panel pt="lg" value="queue">
              <form onSubmit={handleSaveSettings}>
                <Stack gap="md">
                  <div>
                    <Text className="neura-label">Tenant settings</Text>
                    <Title order={3}>Queue preferences</Title>
                  </div>
                  <TextInput
                    name="queuePrefix"
                    label="Queue prefix"
                    maxLength={4}
                    value={settings.queuePrefix}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        queuePrefix: event.target.value.toUpperCase()
                      }))
                    }
                  />
                  <NumberInput
                    name="averageServiceMinutes"
                    label="Average service minutes"
                    min={1}
                    value={Number(settings.averageServiceMinutes)}
                    onChange={(value) =>
                      setSettings((current) => ({ ...current, averageServiceMinutes: value || 1 }))
                    }
                  />
                  <NumberInput
                    name="notificationThreshold"
                    label="Notify when within"
                    min={1}
                    value={Number(settings.notificationThreshold)}
                    onChange={(value) =>
                      setSettings((current) => ({ ...current, notificationThreshold: value || 1 }))
                    }
                  />
                  <Checkbox
                    name="autoPauseEnabled"
                    checked={settings.autoPauseEnabled}
                    label="Enable auto-pause intake"
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        autoPauseEnabled: event.currentTarget.checked,
                        autoPauseThreshold: event.currentTarget.checked
                          ? Number(current.autoPauseThreshold) || 20
                          : "",
                        autoResumeEnabled: event.currentTarget.checked
                          ? current.autoResumeEnabled
                          : false,
                        autoResumeVacancyPercent: event.currentTarget.checked
                          ? Number(current.autoResumeVacancyPercent) || 20
                          : ""
                      }))
                    }
                  />
                  <NumberInput
                    name="autoPauseThreshold"
                    label="Auto-pause threshold"
                    min={1}
                    max={500}
                    disabled={!settings.autoPauseEnabled}
                    description="When waiting tickets reach this number, new joins pause automatically until staff resumes intake."
                    value={settings.autoPauseEnabled ? Number(settings.autoPauseThreshold) : undefined}
                    onChange={(value) =>
                      setSettings((current) => ({ ...current, autoPauseThreshold: value || 1 }))
                    }
                  />
                  <Checkbox
                    name="autoResumeEnabled"
                    checked={settings.autoResumeEnabled}
                    disabled={!settings.autoPauseEnabled}
                    label="Enable auto-resume intake"
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        autoResumeEnabled: event.currentTarget.checked,
                        autoResumeVacancyPercent: event.currentTarget.checked
                          ? Number(current.autoResumeVacancyPercent) || 20
                          : ""
                      }))
                    }
                  />
                  <Stack gap="sm">
                    <Text fw={500} size="sm">Auto-resume vacancy percent</Text>
                    {settings.autoPauseEnabled && settings.autoResumeEnabled ? (
                      <Slider
                        min={5}
                        max={50}
                        step={5}
                        marks={[
                          { value: 5, label: "5%" },
                          { value: 15, label: "15%" },
                          { value: 25, label: "25%" },
                          { value: 35, label: "35%" },
                          { value: 50, label: "50%" }
                        ]}
                        label={(value) => `${value}%`}
                        value={Number(settings.autoResumeVacancyPercent) || 20}
                        onChange={(value) =>
                          setSettings((current) => ({ ...current, autoResumeVacancyPercent: value }))
                        }
                        styles={{
                          markLabel: {
                            marginTop: 10
                          },
                          root: {
                            paddingBottom: 28
                          }
                        }}
                      />
                    ) : (
                      <Text c="dimmed" size="sm">
                        Only applies to queues paused automatically by threshold.
                      </Text>
                    )}
                    <Text c="dimmed" size="sm">
                      {settings.autoPauseEnabled && settings.autoResumeEnabled
                        ? `With a threshold of ${Number(settings.autoPauseThreshold) || 0}, intake will reopen at ${
                            Math.floor((Number(settings.autoPauseThreshold) || 0) * (1 - (Number(settings.autoResumeVacancyPercent) || 20) / 100))
                          } waiting tickets or below.`
                        : "Only applies to queues paused automatically by threshold."}
                    </Text>
                  </Stack>
                  <Button className="neura-secondary-button" disabled={busyAction === "settings"} type="submit">
                    {busyAction === "settings" ? "Saving..." : "Save queue settings"}
                  </Button>
                </Stack>
              </form>
            </Tabs.Panel>

            <Tabs.Panel pt="lg" value="notifications">
              <Stack gap="md">
                <div>
                  <Text className="neura-label">Tenant settings</Text>
                  <Title order={3}>Operational alerts</Title>
                  <Text c="dimmed" size="sm">
                    Browser notifications are used after login for vendor operational alerts. Email remains the fallback channel.
                  </Text>
                </div>
                <Alert color="blue" variant="light">
                  Vendor staff assigned to a booking and payment reviewers receive these alerts for the tenant.
                </Alert>
                <Alert color={browserNotificationsSecure ? "teal" : "yellow"} variant="light">
                  {browserNotificationsSupported
                    ? browserNotificationsSecure
                      ? `Browser notifications are available in this browser. Current permission: ${browserPermission}.`
                      : "Browser notifications require a secure context such as https:// or localhost."
                    : "This browser does not support browser notifications."}
                </Alert>
                <Group gap="sm">
                  <Button
                    color="dark"
                    disabled={
                      !browserNotificationsSupported ||
                      !browserNotificationsSecure ||
                      browserPushSubscribed ||
                      requestingBrowserPermission
                    }
                    onClick={handleRequestBrowserPermission}
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
                    {browserNotificationsSupported
                      ? browserNotificationsSecure
                        ? browserPermission === "granted"
                          ? "This browser can receive vendor alerts."
                          : browserPermission === "denied"
                            ? "Permission was denied in this browser. You can change it in browser settings."
                            : "Click the button to allow browser notifications for this tenant."
                        : "Open this page on https:// or localhost to request permission."
                      : "Use a browser that supports notifications."}
                  </Text>
                </Group>
                <Divider label="Operational alerts" labelPosition="center" />
                <Checkbox
                  checked={vendorNotificationSettings.queueJoin}
                  label="New queue joins"
                  disabled={savingNotificationSettings}
                  onChange={(event) =>
                    handleVendorNotificationToggle("queueJoin", event.currentTarget.checked)
                  }
                />
                <Checkbox
                  checked={vendorNotificationSettings.bookingIntake}
                  label="New booking intake"
                  disabled={savingNotificationSettings}
                  onChange={(event) =>
                    handleVendorNotificationToggle("bookingIntake", event.currentTarget.checked)
                  }
                />
                <Checkbox
                  checked={vendorNotificationSettings.paymentProofReview}
                  label="Payment proof review"
                  disabled={savingNotificationSettings}
                  onChange={(event) =>
                    handleVendorNotificationToggle("paymentProofReview", event.currentTarget.checked)
                  }
                />
                <Checkbox
                  checked={vendorNotificationSettings.bookingStatusChanges}
                  label="Booking status changes"
                  disabled={savingNotificationSettings}
                  onChange={(event) =>
                    handleVendorNotificationToggle("bookingStatusChanges", event.currentTarget.checked)
                  }
                />
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </Card>

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
        scrollAreaComponent={ScrollArea.Autosize}
      >
        <form onSubmit={handleSaveCounter}>
          <Stack gap="md">
            <TextInput
              name="counterName"
              label="Counter name"
              required
              value={counterForm.name}
              onChange={(event) => {
                const nextName = event.target.value;
                setCounterForm((current) => ({
                  ...current,
                  name: nextName,
                  slug: counterSlugManuallyEdited ? current.slug : buildCounterSlug(nextName)
                }));
              }}
            />
            <TextInput
              name="counterSlug"
              label="Counter slug"
              required
              description={checkingCounterSlug ? "Checking slug availability..." : counterSlugMessage}
              error={
                !counterSlugAvailable && counterForm.slug
                  ? counterSlugMessage || "That counter slug is already taken for this location."
                  : undefined
              }
              value={counterForm.slug}
              onChange={(event) => {
                setCounterSlugManuallyEdited(true);
                setCounterForm((current) => ({ ...current, slug: buildCounterSlug(event.target.value) }));
              }}
            />
            <Switch
              name="counterIsActive"
              checked={counterForm.isActive}
              label="Enable counter"
              onChange={(event) =>
                setCounterForm((current) => ({ ...current, isActive: event.currentTarget.checked }))
              }
            />
            <MultiSelect
              name="assignedUserIds"
              data={staff.map((member) => ({ label: member.name, value: member.id }))}
              label="Assigned staff"
              value={counterForm.assignedUserIds}
              onChange={(value) =>
                setCounterForm((current) => ({ ...current, assignedUserIds: value }))
              }
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setCounterDialogOpen(false)}>
                Cancel
              </Button>
              <Button className="neura-primary-button" disabled={busyAction === "counter-save"} type="submit">
                {editingCounterSlug ? "Save counter" : "Create counter"}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    );
  }

  function renderStaffDialog() {
    return (
      <Modal
        centered
        opened={staffDialogOpen}
        onClose={() => setStaffDialogOpen(false)}
        title="Add staff"
        scrollAreaComponent={ScrollArea.Autosize}
      >
        <form onSubmit={handleAddStaff}>
          <Stack gap="md">
            <TextInput
              name="staffEmail"
              label="Existing account email"
              required
              type="email"
              value={staffForm.email}
              onChange={(event) =>
                setStaffForm((current) => ({ ...current, email: event.target.value }))
              }
            />
            <Select
              name="staffRole"
              data={
                isOwner
                  ? [
                      { label: "Staff", value: "staff" },
                      { label: "Admin", value: "admin" }
                    ]
                  : [{ label: "Staff", value: "staff" }]
              }
              label="Role"
              value={staffForm.role}
              onChange={(value) =>
                setStaffForm((current) => ({
                  ...current,
                  role: value === "admin" ? "admin" : "staff"
                }))
              }
            />
            <Text c="dimmed" size="sm">
              The person must already have a GetPrio account before they can be added here.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setStaffDialogOpen(false)}>
                Cancel
              </Button>
              <Button className="neura-primary-button" disabled={busyAction === "staff-save"} type="submit">
                Add staff
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    );
  }

  function renderDashboardSidebar({ compact = false }: { compact?: boolean } = {}) {
    return (
      <Stack className={compact ? "neura-sidebar-content" : undefined} gap="lg" h="100%">
        <Group gap="sm" className="neura-brand">
          <img className="neura-logo" src="/logo-dark.svg" alt="" aria-hidden="true" />
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
              <Divider my="sm" />
              <Stack gap={2}>
                <Text size="xs" c="dimmed">Logged in user:</Text>
                <Text fw={600} size="sm">{user?.name || "Unknown user"}</Text>
                <Text c="dimmed" size="xs">
                  {selectedTenantRole
                    ? selectedTenantRole.charAt(0).toUpperCase() + selectedTenantRole.slice(1)
                    : "No tenant role"}
                </Text>
              </Stack>
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

  function renderDashboardAlertOverlay() {
    const overlayAlerts = [
      ...activeQueueAlerts.map((ticket) => ({
        actionLabel: "Open queue",
        body: (
          <>
            {ticket.customerName} joined the queue as{" "}
            <Text component="span" fw={900}>
              #{ticket.ticketNumber}
            </Text>
          </>
        ),
        id: ticket.id,
        kind: "queue" as const,
        title: "New queue join"
      })),
      ...activeBookingAlerts.map((booking) => ({
        actionLabel: "View booking details",
        body: (
          <>
            {booking.customerName} sent a new booking{" "}
            <Text component="span" fw={900}>
              {booking.reference}
            </Text>
          </>
        ),
        id: booking.id,
        kind: "booking" as const,
        title: "New booking"
      }))
    ];
    const detailBooking = bookingDetailBooking;
    const detailPaymentReviewable = Boolean(
      detailBooking &&
      detailBooking.paymentProof &&
      detailBooking.paymentStatus === "pending" &&
      (detailBooking.status === "pending" || detailBooking.status === "rescheduled")
    );
    const detailPaymentVerified = Boolean(detailBooking?.paymentStatus === "paid" || detailBooking?.paymentVerifiedAt);
    const detailManualPaymentRequired = Boolean(detailBooking?.serviceManualPaymentRequired);
    const detailPaymentGateActive = Boolean(detailBooking && detailManualPaymentRequired && !detailPaymentVerified);
    const detailBookingExpired = Boolean(detailBooking?.expiredAt);
    const closeBookingDetailModal = () => {
      setBookingDetailModalId(null);
      setBookingDetailOpen(false);
      setBookingDetailLoading(false);
      setBookingDetailBooking(null);
      setBookingDetailError("");
      setPaymentRejectionReason("");
    };

    return (
      <Portal>
        {overlayAlerts.length ? (
          <Box
            className="dashboard-notification-stack"
            style={{
              bottom: 24,
              left: "50%",
              maxWidth: "min(692px, calc(100vw - 32px))",
              position: "fixed",
              transform: "translateX(-50%)",
              width: "calc(100vw - 64px)",
              pointerEvents: "none",
              zIndex: 1200
            }}
          >
            <Stack gap="sm" style={{ pointerEvents: "none" }}>
              {overlayAlerts.map((alert) => (
                <Notification
                  color="blue"
                  icon={<IconBellRinging size={20} />}
                  key={alert.id}
                  onClose={() => {
                    if (alert.kind === "queue") {
                      clearQueueAlert(alert.id);
                      return;
                    }

                    clearBookingAlert(alert.id);
                  }}
                  radius="md"
                  style={{
                    boxShadow: "0 12px 32px rgba(15, 23, 42, 0.16)",
                    pointerEvents: "auto"
                  }}
                  withBorder
                >
                  <Group className="dashboard-notification" justify="space-between" align="center" gap="md">
                    <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                      <Text fw={800}>{alert.title}</Text>
                      <Text style={{ overflowWrap: "anywhere" }}>{alert.body}</Text>
                    </Stack>
                    <Button
                      color="dark"
                      radius="xl"
                      onClick={() => {
                        if (alert.kind === "queue") {
                          clearQueueAlert(alert.id);
                          navigate("/dashboard/queue");
                          return;
                        }

                        setBookingDetailModalId(alert.id);
                        setBookingDetailOpen(true);
                        clearBookingAlert(alert.id);
                      }}
                      style={{ flex: "0 0 auto" }}
                    >
                      {alert.actionLabel}
                    </Button>
                  </Group>
                </Notification>
              ))}
            </Stack>
          </Box>
        ) : null}

        <Modal
          centered
          opened={bookingDetailOpen}
          onClose={closeBookingDetailModal}
          title={
            <Stack gap={2}>
              <Text className="booking-detail__eyebrow">Booking details</Text>
              <Text className="booking-detail__title">
                {detailBooking ? detailBooking.reference : "Loading booking"}
              </Text>
            </Stack>
          }
          size="xl"
          classNames={{ content: "booking-detail__modal", header: "booking-detail__modal-header", body: "booking-detail__modal-body" }}
          closeButtonProps={{ "aria-label": "Close booking details" }}
          scrollAreaComponent={ScrollArea.Autosize}
        >
          {bookingDetailLoading ? (
            <Text c="dimmed">Loading booking details...</Text>
          ) : bookingDetailError ? (
            <Alert color="red" variant="light">
              {bookingDetailError}
            </Alert>
          ) : detailBooking ? (
            <Stack gap="lg" className="booking-detail">
              <Group justify="space-between" align="flex-start" className="booking-detail__hero">
                <Stack gap={6}>
                  <Text className="booking-detail__customer">{detailBooking.customerName}</Text>
                  <Text className="booking-detail__contact">{detailBooking.customerEmail || detailBooking.customerPhone || "No contact details"}</Text>
                </Stack>
                <Group gap="xs" justify="flex-end">
                  <Badge color={getBookingBadgeColor(detailBooking.status)} variant="light">
                    {detailBookingExpired ? "expired" : detailBooking.status}
                  </Badge>
                  {detailManualPaymentRequired ? (
                    <Badge color={detailPaymentVerified ? "teal" : "orange"} variant="light">
                      {detailPaymentVerified ? "Payment verified" : "Payment review needed"}
                    </Badge>
                  ) : (
                    <Badge color="gray" variant="light">
                      No manual payment required
                    </Badge>
                  )}
                  {detailBookingExpired ? (
                    <Badge color="orange" variant="light">Pending timeout</Badge>
                  ) : null}
                </Group>
              </Group>

              {detailPaymentGateActive ? (
                <Alert color="orange" icon={<IconInfoCircle size={18} />} variant="light">
                  Confirm, cancel, and reschedule actions unlock after manual payment has been verified.
                </Alert>
              ) : null}

              {detailBookingExpired ? (
                <Alert color="orange" variant="light">
                  {detailBooking.expirationReason || "This pending booking expired before vendor confirmation or payment evidence submission."}
                </Alert>
              ) : null}

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <Paper withBorder radius="md" p="md" className="booking-detail__panel">
                  <Group gap="xs" mb="xs">
                    <IconBriefcase size={16} />
                    <Text className="neura-label">Service</Text>
                  </Group>
                  <Text className="booking-detail__panel-title">{detailBooking.serviceName}</Text>
                  <Text c="dimmed" size="sm">Quantity {detailBooking.bookingQuantity}</Text>
                  <Text c="dimmed" size="sm">{detailBooking.servicePriceDisplay || "-"}</Text>
                </Paper>
                <Paper withBorder radius="md" p="md" className="booking-detail__panel">
                  <Group gap="xs" mb="xs">
                    <IconCalendar size={16} />
                    <Text className="neura-label">Schedule</Text>
                  </Group>
                  <Text className="booking-detail__panel-title">{formatBookingScheduleDateTime(detailBooking.scheduledStartAt)}</Text>
                  <Text c="dimmed" size="sm">Ends {formatBookingScheduleDateTime(detailBooking.scheduledEndAt)}</Text>
                </Paper>
                <Paper withBorder radius="md" p="md" className="booking-detail__panel booking-detail__payment-panel">
                  <Group gap="xs" mb="xs">
                    <IconClipboardList size={16} />
                    <Text className="neura-label">Payment</Text>
                  </Group>
                  <Text className="booking-detail__panel-title">{detailBooking.paymentStatus}</Text>
                  <Text c="dimmed" size="sm">{detailBooking.paymentReference || "No reference"}</Text>
                  {detailBooking.paymentVerifiedAt ? (
                    <Badge color="teal" mt="xs" variant="light" w="fit-content">
                      Verified {formatDateTime(detailBooking.paymentVerifiedAt)}
                    </Badge>
                  ) : null}
                  {detailBooking.paymentRejectedAt ? (
                    <Stack gap={4} mt="xs">
                      <Badge color="red" variant="light" w="fit-content">
                        Rejected {formatDateTime(detailBooking.paymentRejectedAt)}
                      </Badge>
                      {detailBooking.paymentRejectionReason ? (
                        <Text c="dimmed" size="sm">{detailBooking.paymentRejectionReason}</Text>
                      ) : null}
                    </Stack>
                  ) : null}
                  {detailBooking.paymentProof ? (
                    <Stack gap={6} mt="xs">
                      <Text c="dimmed" size="sm">
                        {detailBooking.paymentProof.fileName} · {formatBytes(detailBooking.paymentProof.sizeBytes)}
                      </Text>
                      <Button
                        leftSection={<IconExternalLink size={14} />}
                        loading={busyAction === `booking-proof:${detailBooking.id}`}
                        onClick={() => handleViewBookingPaymentProof(detailBooking)}
                        size="xs"
                        variant="light"
                        w="fit-content"
                      >
                        View proof
                      </Button>
                    </Stack>
                  ) : (
                    <Text c="dimmed" size="sm">No proof submitted</Text>
                  )}
                  {detailPaymentReviewable ? (
                    <Stack gap="sm" mt="md" className="booking-detail__payment-review">
                      <Group gap="xs">
                        <Button
                          className="neura-primary-button"
                          loading={busyAction === `booking-payment-verify:${detailBooking.id}`}
                          onClick={() => handleVerifyBookingPayment(detailBooking)}
                          size="sm"
                          w="fit-content"
                        >
                          Verify payment
                        </Button>
                      </Group>
                      <Textarea
                        label="Rejection reason"
                        minRows={2}
                        onChange={(event) => setPaymentRejectionReason(event.currentTarget.value)}
                        placeholder="Customer-visible reason"
                        value={paymentRejectionReason}
                      />
                      <Button
                        color="red"
                        disabled={!paymentRejectionReason.trim()}
                        loading={busyAction === `booking-payment-reject:${detailBooking.id}`}
                        onClick={async () => {
                          const rejected = await handleRejectBookingPayment(detailBooking);
                          if (rejected) {
                            closeBookingDetailModal();
                          }
                        }}
                        size="xs"
                        variant="subtle"
                        w="fit-content"
                      >
                        Reject payment and cancel
                      </Button>
                    </Stack>
                  ) : null}
                </Paper>
                <Paper withBorder radius="md" p="md" className="booking-detail__panel">
                  <Group gap="xs" mb="xs">
                    <IconBellRinging size={16} />
                    <Text className="neura-label">Alerts</Text>
                  </Group>
                  <Text className="booking-detail__panel-title">Email and browser notifications</Text>
                  <Text c="dimmed" size="sm">
                    {detailBooking.contactVerificationChannel
                      ? `Verified by ${detailBooking.contactVerificationChannel}`
                      : "Verification not recorded"}
                  </Text>
                </Paper>
              </SimpleGrid>

              {detailBooking.notes ? (
                <Paper withBorder radius="md" p="md" className="booking-detail__panel">
                  <Text className="neura-label">Customer notes</Text>
                  <Text>{detailBooking.notes}</Text>
                </Paper>
              ) : null}

              <Group justify="space-between" className="booking-detail__footer">
                <Button variant="default" onClick={closeBookingDetailModal}>
                  Close
                </Button>
                <Group gap="xs">
                  <Button
                    variant="default"
                    onClick={() => {
                      setBookingStatusFilter("pending");
                      setBookingDateRange([null, null]);
                      closeBookingDetailModal();
                      navigate("/dashboard/bookings");
                    }}
                  >
                    Open booking queue
                  </Button>
                  {canAdminBookings && detailBooking.status === "pending" ? (
                    <>
                      <Button
                        className="neura-primary-button"
                        disabled={
                          detailPaymentGateActive ||
                          busyAction === `booking-status:${detailBooking.id}:confirmed`
                        }
                        onClick={async () => {
                          const updated = await handleUpdateBookingStatus(detailBooking, "confirmed");
                          if (updated) {
                            closeBookingDetailModal();
                          }
                        }}
                      >
                        Confirm
                      </Button>
                      <Button disabled={detailPaymentGateActive} variant="outline" onClick={() => openRescheduleDialog(detailBooking)}>
                        Reschedule
                      </Button>
                      <Button
                        color="red"
                        disabled={detailPaymentGateActive || busyAction === `booking-status:${detailBooking.id}:canceled`}
                        variant="subtle"
                        onClick={() =>
                          openConfirmAction({
                            title: "Cancel booking?",
                            description: "Are you sure you want to cancel this booking?",
                            confirmLabel: "Cancel booking",
                            confirmColor: "red",
                            onConfirm: async () => {
                              const updated = await handleUpdateBookingStatus(detailBooking, "canceled");
                              if (updated) {
                                closeBookingDetailModal();
                              }
                            }
                          })
                        }
                      >
                        Cancel
                      </Button>
                    </>
                  ) : null}
                </Group>
              </Group>
            </Stack>
          ) : null}
        </Modal>
        <ConfirmActionModal
          className="confirm-action-modal"
          opened={Boolean(confirmAction)}
          title={confirmAction?.title || ""}
          description={confirmAction?.description || ""}
          confirmLabel={confirmAction?.confirmLabel || "Confirm"}
          confirmColor={confirmAction?.confirmColor || "red"}
          loading={confirmBusy}
          onClose={closeConfirmAction}
          onConfirm={async () => {
            const action = confirmAction;
            if (!action) {
              return;
            }
            await action.onConfirm();
            closeConfirmAction();
          }}
        />
      </Portal>
    );
  }

  function renderCurrentSection() {
    if (!activeSubscription && currentSection !== "settings") {
      return <ActivationPanel onViewPlans={() => setPlanDialogOpen(true)} />;
    }

    if (currentSection === "queue") {
      return renderQueuePage();
    }

    if (currentSection === "tenants") {
      return renderTenantsPage();
    }

    if (currentSection === "services") {
      return renderServicesPage();
    }

    if (currentSection === "bookings") {
      return renderBookingsPage();
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

    return renderSettingsPage();
  }

  if (loading) {
    return <Card className="neura-card">Loading dashboard...</Card>;
  }

  if (invalidSection) {
    return <Navigate to="/dashboard/queue" replace />;
  }

  if (
    (selectedTenantRole === "staff" && !staffAllowedSections.has(currentSection)) ||
    (selectedTenantRole === "admin" && !adminAllowedSections.has(currentSection))
  ) {
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

      <header className="neura-mobile-header">
        <Group gap="sm" className="neura-mobile-brand">
          <Burger
            aria-label="Open dashboard navigation"
            opened={sidebarOpen}
            onClick={() => setSidebarOpen((current) => !current)}
            size="sm"
          />
          <img className="neura-mobile-logo" src="/logo.svg" alt="" aria-hidden="true" />
          <div>
            <Text fw={800}>GetPrio</Text>
            <Text size="xs" c="dimmed">Vendor Dashboard</Text>
          </div>
        </Group>
      </header>

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
              <Text c="dimmed">{dashboardSectionDescriptions[currentSection]}</Text>
            </div>
          </Group>
          <Select
            className="neura-tenant-select"
            data={locations.map((locationItem) => ({
              label: locationItem.name,
              value: locationItem.slug
            }))}
            label="Location"
            value={selectedLocationSlug}
            onChange={(value) => value && setSelectedLocationSlug(value)}
          />
        </header>

        {error ? <Text c="red" fw={700}>{error}</Text> : null}
        {renderCurrentSection()}
      </main>
      {renderPlanDialog()}
      {renderLocationDialog()}
      {renderServiceDialog()}
      {renderAvailabilityBlockDialog()}
      {renderAvailabilityExceptionDialog()}
      {renderRescheduleDialog()}
      {renderCounterDialog()}
      {renderStaffDialog()}
      {renderThemeDialog()}
      {renderDashboardAlertOverlay()}
      {renderRescheduleBlockedModal()}
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
        <ScrollArea h="100%" scrollbars="y">
          {renderDashboardSidebar({ compact: true })}
        </ScrollArea>
      </Drawer>
    </div>
  );
}
