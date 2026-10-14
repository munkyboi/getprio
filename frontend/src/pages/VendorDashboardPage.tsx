import { draftUnloadHandler } from "../vendor/draftUnloadGuard";
import { ActivationPanel, WorkspaceLoading, WorkspaceUnavailable } from "../vendor/WorkspaceAccessState";
import { VendorAuthLayout } from "../vendor/VendorAuthLayout";
import { OperationalAlerts } from "../vendor/OperationalAlerts";
import { servedTicketIntervals } from "../vendor/reportState";
import { AccountPresentation, discardAccountTask } from "../vendor/AccountPresentation";
import { Card as AccountCard, Stack as AccountStack, Group as AccountGroup, SimpleGrid as AccountGrid, Text as AccountText, Title as AccountTitle, Alert as AccountAlert, Badge as AccountBadge, Button as AccountButton, TextInput as AccountInput, PasswordInput as AccountPassword } from "../vendor/AccountFields";
import { queueSettingsPayload, tenantSettingsFromSnapshot } from "../vendor/settingsState";
import { StaffManagement } from "../vendor/StaffManagement";
import { CounterStaffAssignments } from "../vendor/CounterStaffAssignments";
import { serviceQuantityError, dateExceptionPayload } from "../vendor/serviceConfigurationState";
import { FieldGroup } from "../vendor/components/ui/field";
import { ConfigurationScope, ConfigurationNumber, ConfigurationTextarea, ConfigurationInput, ConfigurationPhone, ConfigurationCheck, ConfigurationSelect, ConfigurationFile, ConfigurationSection } from "../vendor/ConfigurationUi";
import { Tabs as ConfigTabs, TabsList as ConfigTabsList, TabsTrigger as ConfigTabsTrigger, TabsContent as ConfigTabsContent } from "../vendor/components/ui/tabs";
import { availableRescheduleSelection, boundedPage } from "../vendor/operationsState";
import {
  OperationScope,
  OperationPanel,
  OperationMetric,
  OperationInput,
  OperationTextarea,
  OperationSelect,
  OperationCheckbox,
  OperationDateRange,
  OperationDate,
  OperationButton,
  OperationAction,
  OperationAlert,
  OperationEmpty,
  OperationPagination,
  OperationQueryState,
} from "../vendor/OperationsUi";
import { Separator as QueueSeparator } from "../vendor/components/ui/separator";
import { TaskDialog, QueueConfirmation } from "../vendor/TaskDialog";
import { WalkInDialog } from "../vendor/WalkInDialog";
import { QueueCounterPicker, QueueViewPicker, QueueCopyField, QueueEmptyState, LiveQueueIntake, LiveQueueSummary, CounterTickets } from "../vendor/LiveQueueWidgets";
import { Button as QueueButton, buttonVariants as queueButtonVariants } from "../vendor/components/ui/button";
import { Badge as QueueBadge } from "../vendor/components/ui/badge";
import { Card as QueueCard, CardHeader as QueueCardHeader, CardTitle as QueueCardTitle, CardContent as QueueCardContent } from "../vendor/components/ui/card";
import { Alert as QueueAlert, AlertTitle as QueueAlertTitle, AlertDescription as QueueAlertDescription } from "../vendor/components/ui/alert";
import { Table as QueueTable, TableHeader as QueueTableHeader, TableBody as QueueTableBody, TableRow as QueueTableRow, TableHead as QueueTableHead, TableCell as QueueTableCell } from "../vendor/components/ui/table";
import { createDirtyForms } from "../vendor/dirtyForms";
import { VendorNavigationGuard } from "../vendor/navigationGuard";
import { VendorWorkspaceShell } from "../vendor/VendorWorkspaceShell";
import { sectionWorkspace, workspaceItems, workspacePath, preferenceKey, activeMemberships, rememberedTenantWorkspace, savePreference } from "../vendor/workspace";
import { quantityInputChanges } from "../utils/durationUnits";
import DurationUnitControls from "../components/DurationUnitControls";
import { queueBoardReturnPath } from "../utils/queueBoardReturnPath";
import { counterBlockMessage, selectCounterDispatch } from "../utils/counterDispatch";
import { QueueBoardScanner, QueueBoardSettings } from "../components/QueueBoardAccess";
import { OtpInputField } from "../components/OtpInputField";
import { BookingTableRow } from "../components/BookingTableRow";
import { BookingCheckInNotice } from "../components/BookingCheckInNotice";
import { getBookingCheckInState } from "../utils/bookingCheckIn";
import { VendorResourceConfiguration } from "../components/VendorResourceConfiguration";
import { VendorRatingsPanel } from "../components/VendorRatingsPanel";
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ColorInput,
  FileInput,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Slider,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip
} from "@mantine/core";
import {
  IconBellRinging,
  IconBuildingBank,
  IconChartBar,
  IconBriefcase,
  IconCalendar,
  IconCalendarCheck,
  IconAlertTriangle,
  IconClipboardList,
  IconCheck,
  IconDownload,
  IconExternalLink,
  IconHistory,
  IconHomeStats,
  IconInfoCircle,
  IconMapPin,
  IconPhoto,
  IconUserCircle,
  IconQrcode,
  IconSparkles,
  IconTicket,
  IconX,
  IconClock,
  IconSettings,
  IconUserPlus,
  IconUsersGroup
} from "@tabler/icons-react";
import { VendorToastProvider, VendorToastViewport, useVendorNotifications } from "../vendor/VendorToasts";
import { getDay } from "date-fns";
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
  VendorAvailabilityResponse,
  VendorBookingSummary,
  BookingSlotSummary,
  VendorClientsResponse,
  VendorServiceSummary,
  UpdateVendorBookingStatusRequest,
  PaginationMetadata,
  PasswordChangeRequest,
  GroupFundedLocationServiceSettings,

  } from "@shared";
import { DEFAULT_TIMEZONE, getTimeZoneOptions } from "../../../shared/timezones";
import { BusinessCategorySelect } from "../components/BusinessCategorySelect";
import { VendorAccountDeletionPanel } from "../components/VendorAccountDeletionPanel";
import { EmailMfaSettingsPanel } from "../components/EmailMfaSettingsPanel";
import { API_BASE_URL } from "../api/client";

import CampaignDescriptionEditor from "../components/CampaignDescriptionEditor";
import RichCampaignDescription from "../components/RichCampaignDescription";
import StyledQRCode, { getStyledQRCodeCanvas } from "../components/StyledQRCode";

import VendorQueueLifecycleTray from "../vendor/QueueLifecycleTray";
import VendorCapacityPanel from "../components/VendorCapacityPanel";
import TicketScannerModal from "../components/TicketScannerModal";
import * as vendorDashboardBookings from "../api/vendorDashboardBookings";
import * as vendorDashboardQueue from "../api/vendorDashboardQueue";
import * as vendorDashboardCatalog from "../api/vendorDashboardCatalog";
import * as vendorDashboardOperations from "../api/vendorDashboardOperations";
import * as vendorDashboardBilling from "../api/vendorDashboardBilling";
import * as vendorDashboardBootstrap from "../api/vendorDashboardBootstrap";
import * as vendorDashboardExport from "../api/vendorDashboardExport";
import { useAuth } from "../context/AuthContext";
import { ConfirmActionModal } from "../components/ConfirmActionModal";
import EmailChangePanel from "../components/EmailChangePanel";
import PhoneChangePanel from "../components/PhoneChangePanel";
import {
  getAllowedHistoryExportRanges,
  getPeriodTicketMetric,
  shouldLoadPeriodUsage,
  shouldEnableVendorDashboardBootstrap
} from "../lib/vendorDashboardBootstrap";
import { canAccessVendorSection } from "../lib/vendorDashboardNavigation";
import { buildJoinUrl } from "../queuePaths";
import {
  formatDateInputValue,
  formatDateTime,
  formatBookingScheduleDateTime,
  formatBookingScheduleTimeRange,
  formatDisplayDate,
  toTimestamp
} from "../utils/dates";
import { getErrorMessage } from "../utils/errors";
import { getWeeklyAvailabilityDefaults } from "../utils/availability";
import { isBrowserPushSupported, subscribeToBrowserPush } from "../utils/pushNotifications";
import {
  getQueueDaySyncNotice,
  getTicketStateSummary,
  resolveQueueDayState,
  selectFreshestQueueSnapshot
} from "../utils/queueStatus";
import type { LocalQueueDayUpdate, QueueDaySyncState } from "../utils/queueStatus";
import { getQueueCustomerFullNameLabel } from "../utils/queueNames";
import { getPlanHighlights, getPlanPriceDisplay } from "../utils/subscriptionPlans";
import { checkServiceSlugAvailability } from "../api/vendorDashboardCatalog";
import { checkCounterSlugAvailability } from "../api/vendorDashboardOperations";

const dashboardSections = new Set(["queue", "tenants", "services", "bookings", "staff", "clients", "history", "reports", "ratings", "settings", "account"]);
const RECORDED_INTERVAL_TICKET_LIMIT = 30;
const timeZoneOptions = getTimeZoneOptions();

function QueueQrUnavailable() {
  return (
    <div aria-label="Queue QR unavailable" className="vendor-empty-art" role="img">
      <IconQrcode size={42} stroke={1.5} />
      <Text c="dimmed" fw={700} mt="sm" size="sm">
        Queue QR unavailable
      </Text>
    </div>
  );
}

function ModalSection({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card withBorder radius="xl" p="md" className="service-dialog__panel vendor-location-modal__section">
      <Stack gap="sm">
        <div>
          <Group gap="xs" align="center" wrap="nowrap">
            <Text className="service-dialog__label">{title}</Text>
          </Group>
          <Text c="dimmed" size="sm" mt={4}>
            {description}
          </Text>
        </div>
        {children}
      </Stack>
    </Card>
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

function formatStoreHourRange(hour: StoreHourSummary | null | undefined) {
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

function formatPreviewHourRange(location: StoreLocationWithHours | null, weekday: number) {
  const hour = location?.hours.find((entry) => entry.weekday === weekday);
  return formatStoreHourRange(hour);
}

function getOrderedLocationHours(hours: StoreHourSummary[]) {
  const orderedHours = hours
    .map((hour, index) => ({ hour, index }))
    .sort((a, b) => a.hour.weekday - b.hour.weekday || a.index - b.index);

  return orderedHours.map((entry, orderedIndex) => ({
    ...entry,
    isFirstForDay: orderedIndex === 0 || orderedHours[orderedIndex - 1].hour.weekday !== entry.hour.weekday,
    isLastForDay:
      orderedIndex === orderedHours.length - 1 || orderedHours[orderedIndex + 1].hour.weekday !== entry.hour.weekday
  }));
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
  name: "",
  publicProfileDisplayName: "",
  publicProfileDescription: "",
  publicProfileCategory: "",
  businessCategoryId: null as string | null,
  queuePrefix: "P",
  averageServiceMinutes: 5,
  notificationThreshold: 2,
  autoPauseEnabled: false,
  autoPauseThreshold: 20,
  autoResumeEnabled: false,
  autoResumeVacancyPercent: 20
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
  imageUrl: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  province: "",
  postalCode: "",
  country: "Philippines",
  contactEmail: "",
  contactPhone: "",
  timezone: DEFAULT_TIMEZONE,
  paymentMethodLabel: "",
  paymentBankName: "",
  paymentAccountDisplayName: "",
  paymentAccountIdentifierDisplay: "",
  paymentQrImageUrl: "",
  paymentQrActive: false,
  customerSelfCheckInEnabled: false,
  serviceTimingEnabled: false,
  isPrimary: false,
  isActive: true,
  hours: defaultHours
};

const emptyServiceForm: SaveVendorServiceRequest = {
  name: "",
  slug: "",
  description: "",
  durationMinutes: 30,
  imageUrl: "",
  allowBookingQuantity: false,
  bookingQuantityLabel: "Units",
  bookingQuantityMin: 1,
  bookingQuantityMax: 24,
  manualPaymentRequired: false,
  bookingCapacityScope: "service",
  priceAmountCents: 0,
  priceDisplay: "",
  isActive: true,
  sortOrder: 0,
  locationServices: []
};

const defaultGroupFundedSettings: GroupFundedLocationServiceSettings = {
  enabled: false,
  minRequiredContributors: 2,
  maxRequiredContributors: 12,
  defaultRequiredContributors: 4,
  minContributionAmountCents: null,
  maxContributionAmountCents: null,
  minDeadlineHours: 24,
  maxDeadlineDays: 14,
  allowPublicCampaigns: false
};

function normalizeGroupFundedSettings(
  settings?: Partial<GroupFundedLocationServiceSettings> | null
): GroupFundedLocationServiceSettings {
  const minRequiredContributors =
    settings?.minRequiredContributors ??
    defaultGroupFundedSettings.minRequiredContributors ??
    2;
  const maxRequiredContributors = Math.max(
    minRequiredContributors,
    settings?.maxRequiredContributors ??
      defaultGroupFundedSettings.maxRequiredContributors ??
      12
  );
  const defaultRequiredContributors = Math.min(
    maxRequiredContributors,
    Math.max(
      minRequiredContributors,
      defaultGroupFundedSettings.defaultRequiredContributors ?? 4
    )
  );

  return {
    enabled: settings?.enabled === true,
    minRequiredContributors,
    maxRequiredContributors,
    defaultRequiredContributors,
    minContributionAmountCents: null,
    maxContributionAmountCents: null,
    minDeadlineHours:
      settings?.minDeadlineHours ?? defaultGroupFundedSettings.minDeadlineHours,
    maxDeadlineDays:
      settings?.maxDeadlineDays ?? defaultGroupFundedSettings.maxDeadlineDays,
    allowPublicCampaigns: settings?.allowPublicCampaigns === true
  };
}

const emptyAvailabilityBlockForm: SaveVendorAvailabilityBlockRequest = {
  locationSlug: "",
  serviceSlug: "",
  weekday: 1,
  startsAt: "09:00",
  endsAt: "17:00",
  endsNextDay: false,
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
    logoFit: "contain",
    backgroundImageUrl: "",
    backgroundImageFit: "cover",
    pageBackgroundImageUrl: "/theme-backgrounds/classic-brushed-warmth.svg",
    pageBackgroundImageFit: "cover",
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
  generic: {
    presetId: "generic",
    heroTitle: "",
    heroSubtitle: "",
    logoUrl: "",
    logoFit: "contain",
    backgroundImageUrl: "",
    backgroundImageFit: "cover",
    pageBackgroundImageUrl: "/theme-backgrounds/generic-paper-glow.svg",
    pageBackgroundImageFit: "cover",
    pageBackgroundColor: "#fbf7f1",
    cardBackgroundColor: "#fffaf4",
    cardAlpha: 0.9,
    cardBorderSize: 1,
    cardBorderRadius: 28,
    cardBorderColor: "#e6d8ca",
    headerColor: "#24180f",
    subheaderColor: "#8a6a52",
    bodyColor: "#4b3a2f",
    buttonBackgroundColor: "#ea6a1f",
    buttonTextColor: "#ffffff",
    buttonBorderColor: "#ea6a1f"
  },
  sports: {
    presetId: "sports",
    heroTitle: "",
    heroSubtitle: "",
    logoUrl: "",
    logoFit: "contain",
    backgroundImageUrl: "",
    backgroundImageFit: "cover",
    pageBackgroundImageUrl: "/theme-backgrounds/sports-recreation-halftone.svg",
    pageBackgroundImageFit: "cover",
    pageBackgroundColor: "#F6D600",
    cardBackgroundColor: "#ffffff",
    cardAlpha: 0.95,
    cardBorderSize: 2,
    cardBorderRadius: 24,
    cardBorderColor: "#A3C1AD",
    headerColor: "#003DA5",
    subheaderColor: "#A50034",
    bodyColor: "#1E2A36",
    buttonBackgroundColor: "#003DA5",
    buttonTextColor: "#ffffff",
    buttonBorderColor: "#003DA5"
  },
  wellness: {
    presetId: "wellness",
    heroTitle: "",
    heroSubtitle: "",
    logoUrl: "",
    logoFit: "contain",
    backgroundImageUrl: "",
    backgroundImageFit: "cover",
    pageBackgroundImageUrl: "/theme-backgrounds/health-wellness-lotus.svg",
    pageBackgroundImageFit: "cover",
    pageBackgroundColor: "#F0F2F2",
    cardBackgroundColor: "#FFF9F0",
    cardAlpha: 0.94,
    cardBorderSize: 1,
    cardBorderRadius: 30,
    cardBorderColor: "#73C7E3",
    headerColor: "#2E4A70",
    subheaderColor: "#24B0BA",
    bodyColor: "#2E4A70",
    buttonBackgroundColor: "#24B0BA",
    buttonTextColor: "#ffffff",
    buttonBorderColor: "#24B0BA"
  },
  retail: {
    presetId: "retail",
    heroTitle: "",
    heroSubtitle: "",
    logoUrl: "",
    logoFit: "contain",
    backgroundImageUrl: "",
    backgroundImageFit: "cover",
    pageBackgroundImageUrl: "/theme-backgrounds/retail-catalog-panels.svg",
    pageBackgroundImageFit: "cover",
    pageBackgroundColor: "#E0E7FF",
    cardBackgroundColor: "#ffffff",
    cardAlpha: 0.93,
    cardBorderSize: 1,
    cardBorderRadius: 22,
    cardBorderColor: "#A5B4FC",
    headerColor: "#1E1B4B",
    subheaderColor: "#312E81",
    bodyColor: "#312E81",
    buttonBackgroundColor: "#F59E0B",
    buttonTextColor: "#ffffff",
    buttonBorderColor: "#312E81"
  },
  food: {
    presetId: "food",
    heroTitle: "",
    heroSubtitle: "",
    logoUrl: "",
    logoFit: "contain",
    backgroundImageUrl: "",
    backgroundImageFit: "cover",
    pageBackgroundImageUrl: "/theme-backgrounds/food-confetti-sprinkles.svg",
    pageBackgroundImageFit: "cover",
    pageBackgroundColor: "#FFC86F",
    cardBackgroundColor: "#F3F0EF",
    cardAlpha: 0.94,
    cardBorderSize: 1,
    cardBorderRadius: 24,
    cardBorderColor: "#8DDDBD",
    headerColor: "#3EA789",
    subheaderColor: "#D13366",
    bodyColor: "#4B4746",
    buttonBackgroundColor: "#D13366",
    buttonTextColor: "#ffffff",
    buttonBorderColor: "#3EA789"
  },
  clinic: {
    presetId: "clinic",
    heroTitle: "",
    heroSubtitle: "",
    logoUrl: "",
    logoFit: "contain",
    backgroundImageUrl: "",
    backgroundImageFit: "cover",
    pageBackgroundImageUrl: "/theme-backgrounds/clinic-crosswave.svg",
    pageBackgroundImageFit: "cover",
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
  },
  neura: {
    presetId: "neura",
    heroTitle: "",
    heroSubtitle: "",
    logoUrl: "",
    logoFit: "contain",
    backgroundImageUrl: "",
    backgroundImageFit: "cover",
    pageBackgroundImageUrl: "/theme-backgrounds/neura-signal-grid.svg",
    pageBackgroundImageFit: "cover",
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
};

const defaultPublicBoardTheme = publicBoardThemePresets.generic;
const presetBackgroundImageUrls = new Set(
  Object.values(publicBoardThemePresets)
    .map((preset) => preset.pageBackgroundImageUrl)
    .filter(Boolean)
);

type DashboardSection = "queue" | "tenants" | "services" | "bookings" | "group-funded" | "staff" | "clients" | "history" | "reports" | "ratings" | "settings" | "account";
type AccountTab = "subscription" | "billing" | "profile" | "security";
type SettingsTab = "contact" | "queue" | "notifications" | "board";
type QueueView = "current" | "overflow" | "recovery";
type ClientSort = "latestVisitDesc" | "latestVisitAsc" | "nameAsc" | "nameDesc" | "visitsDesc" | "visitsAsc";
type HistorySort = "updatedDesc" | "updatedAsc" | "ticketAsc" | "ticketDesc" | "customerAsc" | "customerDesc";
const bookingStatusFilters = ["all", "pending", "confirmed", "rescheduled", "completed", "canceled", "expired", "missed"] as const;
type BookingStatusFilter = typeof bookingStatusFilters[number];
const bookingStatusFilterOptions = bookingStatusFilters.map((value) => ({
  value,
  label: value === "all" ? "All statuses" : value.charAt(0).toUpperCase() + value.slice(1)
}));

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
  { section: "ratings", label: "Ratings", icon: IconChartBar },
  { section: "reports", label: "Reports", icon: IconChartBar },
  { section: "settings", label: "Settings", icon: IconSettings },
  { section: "account", label: "Account", icon: IconUserCircle }
] as const;
const dashboardSectionDescriptions: Partial<Record<DashboardSection, string>> = {
  queue: "Run the live queue, manage intake, and move customers through service.",
  tenants: "Configure locations, counters, and the public entry points for each branch.",
  services: "Manage bookable services, durations, pricing, and public availability state.",
  bookings: "Review incoming service requests and manage confirmation, rescheduling, or cancellation.",
  staff: "Manage workspace access, roles, and operating status for your team.",
  clients: "Review recent customer activity and returning queue visitors.",
  history: "Inspect completed ticket activity and export queue records.",
  reports: "Track queue usage, service pace, and plan consumption over time.",
  settings: "Adjust the business profile, queue behavior, and operational notifications for this workspace.",
  account: "Manage your vendor account profile, security, subscription, and billing access."
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
  "ratings",
  "settings",
  "account"
]);
const staffAllowedSections = new Set<DashboardSection>(["queue", "bookings", "clients", "history", "account"]);

function getHistoryTimestamp(value: string | Date): number {
  return toTimestamp(value);
}

function formatDate(value: string | Date | null): string {
  return formatDisplayDate(value);
}

function formatMoney(amountCents: number, currency = "PHP"): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2
  }).format(Number(amountCents || 0) / 100);
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

function GroupFundedBookingIndicator({ booking }: { booking: VendorBookingSummary }) {
  if (!booking.groupFundedBookingId && booking.bookingPaymentSource !== "group_funded") {
    return null;
  }

  const campaignId = booking.groupFundedBookingId || booking.groupFundedCampaign?.id;
  const campaignTitle = booking.groupFundedCampaign?.campaignTitle || "Group-funded campaign";
  return (
    <Tooltip label={campaignTitle} withArrow>
      <Badge color="blue" variant="light" w="fit-content">
        Group-funded{campaignId ? ` · Campaign #${campaignId}` : ""}
      </Badge>
    </Tooltip>
  );
}

function mergeTheme(theme?: Partial<PublicBoardThemeSettings>): PublicBoardThemeSettings {
  const merged = {
    ...defaultPublicBoardTheme,
    ...(theme || {})
  };
  const preset = publicBoardThemePresets[merged.presetId] || defaultPublicBoardTheme;

  return {
    ...merged,
    backgroundImageFit: merged.backgroundImageFit || preset.backgroundImageFit,
    pageBackgroundImageUrl: merged.pageBackgroundImageUrl || preset.pageBackgroundImageUrl,
    pageBackgroundImageFit: merged.pageBackgroundImageFit || preset.pageBackgroundImageFit
  };
}

export default function VendorDashboardPage() {
  return <VendorToastProvider><VendorDashboardContent /></VendorToastProvider>;
}

function VendorDashboardContent() {
  const notifications = useVendorNotifications();
  const showSuccessNotification = useCallback((title: string, message: string) => {
    notifications.show({color: "teal", icon: <IconCheck size={18} />, title, message});
  }, [notifications]);
  const showInfoNotification = useCallback((title: string, message: string) => {
    notifications.show({color: "blue", icon: <IconInfoCircle size={18} />, title, message});
  }, [notifications]);
  const { token, user, loading, logout, refreshUser, changePassword } = useAuth();
  const { section } = useParams<{ section: string }>();
  const location = useLocation();
  const boardApprovalReturn = queueBoardReturnPath(location.search);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentSection = (
    section && dashboardSections.has(section) ? section : "queue"
  ) as DashboardSection;
  const invalidSection = Boolean(section && !dashboardSections.has(section));
  const [selectedTenantSlug, setSelectedTenantSlug] = useState("");
  const [selectedLocationSlug, setSelectedLocationSlug] = useState("");
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);
  const [boardScannerBusy, setBoardScannerBusy] = useState(false);
  const [savingQueueQr, setSavingQueueQr] = useState(false);
  const queueQrRef = useRef<HTMLDivElement>(null);
  const unsavedForm = useRef(createDirtyForms());
  const accountDraftRef = useRef(false);
  const securityUnloadRef = useRef(false);
  const navigationGuard = useContext(VendorNavigationGuard);
  const activeTenants = useMemo(() => activeMemberships(user?.tenants || []), [user?.tenants]);
  useEffect(() => {
    const warn = draftUnloadHandler(() => unsavedForm.current.hasEdits() || accountDraftRef.current || securityUnloadRef.current);
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const [locations, setLocations] = useState<StoreLocationWithHours[]>([]);
  const [services, setServices] = useState<VendorServiceSummary[]>([]);
  const [availabilityBlocks, setAvailabilityBlocks] = useState<VendorAvailabilityBlockSummary[]>([]);
  const [availabilityExceptions, setAvailabilityExceptions] = useState<VendorAvailabilityExceptionSummary[]>([]);
  const [availabilitySummary, setAvailabilitySummary] = useState<VendorAvailabilityResponse["summary"] | null>(null);
  const [serviceCounters, setServiceCounters] = useState<ServiceCounterSummary[]>([]);
  const [staff, setStaff] = useState<VendorStaffSummary[]>([]);
  const [staffSeatLimit, setStaffSeatLimit] = useState(0);
  const [counterLimit, setCounterLimit] = useState(0);
  const [activeLocationLimit, setActiveLocationLimit] = useState(1);
  const [platformDefaultTimezone, setPlatformDefaultTimezone] = useState(DEFAULT_TIMEZONE);
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
  const [locationsTab, setLocationsTab] = useState("locations");
  const [resourceConfigurationBusy, setResourceConfigurationBusy] = useState(false);
  const [resourceConfigurationDialogOpen, setResourceConfigurationDialogOpen] = useState(false);
  const [servicesTab, setServicesTab] = useState<"catalog" | "weekly" | "exceptions">("catalog");
  const [availabilityBlockDialogOpen, setAvailabilityBlockDialogOpen] = useState(false);
  const [editingAvailabilityBlockId, setEditingAvailabilityBlockId] = useState("");
  const [availabilityBlockForm, setAvailabilityBlockForm] = useState<SaveVendorAvailabilityBlockRequest>(emptyAvailabilityBlockForm);
  const [availabilityExceptionDialogOpen, setAvailabilityExceptionDialogOpen] = useState(false);
  const [editingAvailabilityExceptionId, setEditingAvailabilityExceptionId] = useState("");
  const [availabilityExceptionForm, setAvailabilityExceptionForm] = useState<SaveVendorAvailabilityExceptionRequest>(emptyAvailabilityExceptionForm);
  const [availabilityExceptionBlockEntireDay, setAvailabilityExceptionBlockEntireDay] = useState(false);
  const [settings, setSettings] = useState<UpdateTenantSettingsRequest>(defaultSettings);
  const savedSettings = useRef<UpdateTenantSettingsRequest>(defaultSettings);
  const savedProfileTheme = useRef<PublicBoardThemeSettings>(defaultPublicBoardTheme);
  const [profileThemeLoading, setProfileThemeLoading] = useState(true);
  const [profileThemeError, setProfileThemeError] = useState<unknown>(null);
  const [profileThemeRetry, setProfileThemeRetry] = useState(0);
  const [boardSettingsBusy, setBoardSettingsBusy] = useState(false);
  const [accountTab, setAccountTab] = useState<AccountTab>("subscription");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("contact");
  const [accountProfileForm, setAccountProfileForm] = useState({
    name: user?.name || "",
    displayName: user?.displayName || ""
  });
  const [accountProfileBusy, setAccountProfileBusy] = useState(false);
  const [accountPanelBusy, setAccountPanelBusy] = useState(false);
  const [ratingsBusy, setRatingsBusy] = useState(false);
  const [accountPanelDraft, setAccountPanelDraft] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(Boolean(user?.mfaEnabled));
  const [mfaSecret, setMfaSecret] = useState("");
  const [mfaEnrollmentUri, setMfaEnrollmentUri] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaRecoveryCodes, setMfaRecoveryCodes] = useState<string[]>([]);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [passwordForm, setPasswordForm] = useState<PasswordChangeRequest>({ currentPassword: "", newPassword: "" });
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [replacingMfa, setReplacingMfa] = useState(false);
  const [replacementPassword, setReplacementPassword] = useState("");
  const [replacementCode, setReplacementCode] = useState("");
  const [removingMfa, setRemovingMfa] = useState(false);
  const [removalPassword, setRemovalPassword] = useState("");
  const [removalCode, setRemovalCode] = useState("");
  const [removalRecoveryCode, setRemovalRecoveryCode] = useState("");
  const [removalAcknowledged, setRemovalAcknowledged] = useState(false);
  accountDraftRef.current = accountPanelDraft || Boolean(replacementPassword || replacementCode || removalPassword || removalCode || removalRecoveryCode || removalAcknowledged);
  securityUnloadRef.current = Boolean(mfaSecret || mfaCode || mfaRecoveryCodes.length);
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
  const [walkInDialogOpen, setWalkInDialogOpen] = useState(false);
  useEffect(() => {
    setWalkInForm((current) => ({ ...current, serviceId: "" }));
  }, [selectedTenantSlug, selectedLocationSlug]);
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
  const previousQueueDayRef = useRef<QueueDaySyncState | null>(null);
  const localQueueDayUpdateRef = useRef<LocalQueueDayUpdate | null>(null);
  const [bookingDetailModalId, setBookingDetailModalId] = useState<string | null>(null);
  const [bookingDetailOpen, setBookingDetailOpen] = useState(false);
  const [bookingDetailRetry, setBookingDetailRetry] = useState(0);
  const [bookingCheckInNow, setBookingCheckInNow] = useState(Date.now);
  useEffect(() => {
    if (currentSection !== "bookings" && !bookingDetailOpen) return;
    setBookingCheckInNow(Date.now());
    const timer = window.setInterval(() => setBookingCheckInNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [currentSection, bookingDetailOpen]);
  const [bookingDetailLoading, setBookingDetailLoading] = useState(false);
  const [bookingDetailBooking, setBookingDetailBooking] = useState<VendorBookingSummary | null>(null);
  const [bookingDetailError, setBookingDetailError] = useState("");
  const [paymentRejectionReason, setPaymentRejectionReason] = useState("");
  function openBookingDetail(bookingId: string) {
    setError("");
    setPaymentRejectionReason("");
    setBookingDetailModalId(bookingId);
    setBookingDetailOpen(true);
  }


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
  const [paidPlanDialogOnly, setPaidPlanDialogOnly] = useState(false);
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);
  const [themeLocation, setThemeLocation] = useState<StoreLocationWithHours | null>(null);
  const [themeForm, setThemeForm] = useState<PublicBoardThemeSettings>(defaultPublicBoardTheme);
  const [businessProfileTheme, setBusinessProfileTheme] = useState<PublicBoardThemeSettings>(defaultPublicBoardTheme);
  const [applyThemeToAllLocations, setApplyThemeToAllLocations] = useState(false);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "annual">("monthly");
  const [billingPaymentMode, setBillingPaymentMode] = useState<"manual" | "automatic">("manual");
  const [selectedCounterSlug, setSelectedCounterSlug] = useState("");
  const { lane: selectedLane, ticket: selectedCalledTicket } = selectCounterDispatch(snapshot, selectedTenantSlug, selectedLocationSlug, selectedCounterSlug);
  const [scannerTarget, setScannerTarget] = useState<{ ticketId: string; counterSlug: string | null; tenantSlug: string; locationQuery: string; ticketNumber: string } | null>(null);

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
  const [ticketScannerOpen, setTicketScannerOpen] = useState(false);
  const [ticketScannerError, setTicketScannerError] = useState("");
  const [clientsSearch, setClientsSearch] = useState("");
  const [clientsSort, setClientsSort] = useState<ClientSort>("latestVisitDesc");
  const [clientsPage, setClientsPage] = useState(1);
  const [historySearch, setHistorySearch] = useState("");
  const [historySort, setHistorySort] = useState<HistorySort>("updatedDesc");
  const [historyPage, setHistoryPage] = useState(1);
  const [bookingSearch, setBookingSearch] = useState("");
  const [bookingStatusFilter, setBookingStatusFilter] = useState<BookingStatusFilter>("all");
  const [hideNonActiveBookings, setHideNonActiveBookings] = useState(true);
  const [bookingDateRange, setBookingDateRange] = useState<[Date | null, Date | null]>([null, null]);
  const [bookingPage, setBookingPage] = useState(1);
  const [bookingPagination, setBookingPagination] = useState<PaginationMetadata | null>(null);

  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [reschedulingBooking, setReschedulingBooking] = useState<VendorBookingSummary | null>(null);
  const [rescheduleStartAt, setRescheduleStartAt] = useState("");
  const rescheduleFormRef = useRef<HTMLFormElement>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleSlots, setRescheduleSlots] = useState<BookingSlotSummary[]>([]);
  const [rescheduleSlotsLoading, setRescheduleSlotsLoading] = useState(false);
  const [rescheduleSlotsError, setRescheduleSlotsError] = useState("");
  const [rescheduleBlockModalOpen, setRescheduleBlockModalOpen] = useState(false);

  const [groupFundedProofError] = useState("");
  const selectedLocation =
    locations.find((locationItem) => locationItem.slug === selectedLocationSlug) ||
    snapshot?.location ||
    null;
  const availabilityBlockLocation =
    locations.find((locationItem) => locationItem.slug === availabilityBlockForm.locationSlug) ||
    selectedLocation;
  const selectedTenantRole =
    activeTenants.find((tenant) => tenant.slug === selectedTenantSlug)?.role || null;
  const hasActiveSubscription =
    selectedTenantRole === "staff" || billing?.subscription?.status === "active";
  const isOwner = selectedTenantRole === "owner";
  const isAdmin = selectedTenantRole === "admin";
  const requiresMfaEnrollment = Boolean(user?.mfaRequired && !user.mfaEnabled);
  const canLoadProtectedDashboard = !requiresMfaEnrollment;
  const canOperateQueueDay = Boolean(selectedTenantRole);
  const canReopenQueueDay = isOwner || isAdmin;
  const canManageContactSettings = isOwner;
  const canExportHistory = isOwner || isAdmin;
  const canAdminBookings = isOwner || isAdmin;
  const canOperateBookingQueue = Boolean(selectedTenantRole);
  const confirmBusy = Boolean(confirmAction && busyAction);
  const locationQuery = selectedLocationSlug
    ? `?location=${encodeURIComponent(selectedLocationSlug)}`
    : "";
  const dashboardErrorMessage = [
    error,
    bookingDetailError,
    rescheduleSlotsError,
    groupFundedProofError
  ].find(Boolean) || "";

  useEffect(() => {
    setMfaEnabled(Boolean(user?.mfaEnabled));
  }, [user?.mfaEnabled]);

  useEffect(() => {
    setAccountProfileForm({
      name: user?.name || "",
      displayName: user?.displayName || ""
    });
  }, [user?.displayName, user?.name]);

  useEffect(() => {
    if (!dashboardErrorMessage) {
      return;
    }

    notifications.show({
      id: "vendor-dashboard-error",
      color: "red",
      icon: <IconX size={18} />,
      title: "Could not complete that action",
      message: dashboardErrorMessage,
      autoClose: 7000
    });
  }, [dashboardErrorMessage, notifications]);

  const dashboardBootstrapQuery = useQuery({
    queryKey: ["vendor-dashboard-bootstrap", token, selectedTenantSlug, selectedLocationSlug, locationQuery, selectedTenantRole],
    queryFn: async () => {
      if (!token || !selectedTenantSlug) {
        throw new Error("Missing dashboard context.");
      }

      return vendorDashboardBootstrap.getBootstrap(
        token,
        selectedTenantSlug,
        locationQuery,
        isOwner || isAdmin
      );
    },
    enabled: shouldEnableVendorDashboardBootstrap(token, selectedTenantSlug, requiresMfaEnrollment)
  });
  const billingOverviewQuery = useQuery({
    queryKey: ["vendor-dashboard-billing", token, selectedTenantSlug],
    queryFn: async () => {
      if (!token || !selectedTenantSlug) {
        throw new Error("Missing billing context.");
      }

      return vendorDashboardBootstrap.getBillingOverview(token, selectedTenantSlug);
    },
    enabled: Boolean(
      shouldEnableVendorDashboardBootstrap(token, selectedTenantSlug, requiresMfaEnrollment) &&
      (isOwner || isAdmin)
    )
  });
  const periodUsageQuery = useQuery({
    queryKey: ["vendor-period-usage", user?.id, token, selectedTenantSlug, selectedTenantRole],
    queryFn: () => vendorDashboardBootstrap.getPeriodUsage(token!, selectedTenantSlug),
    enabled: Boolean(
      shouldEnableVendorDashboardBootstrap(token, selectedTenantSlug, requiresMfaEnrollment) &&
      shouldLoadPeriodUsage({ isOwner, isAdmin, section: currentSection, accountTab })
    ),
    refetchInterval: 30_000
  });
  const effectiveEntitlementsQuery = useQuery({
    queryKey: ["vendor-dashboard-effective-entitlements", token, selectedTenantSlug],
    queryFn: async () => {
      if (!token || !selectedTenantSlug) {
        throw new Error("Missing entitlement context.");
      }

      return vendorDashboardBootstrap.getEffectiveEntitlements(token, selectedTenantSlug);
    },
    enabled: shouldEnableVendorDashboardBootstrap(token, selectedTenantSlug, requiresMfaEnrollment)
  });
  const effectiveBilling = billingOverviewQuery.data || null;
  const activeSubscription =
    effectiveBilling?.subscription?.status === "active" ? effectiveBilling.subscription : null;
  const currentPlan = activeSubscription
    ? effectiveBilling?.plans.find((plan) => plan.slug === activeSubscription.planSlug)
    : null;
  const effectiveEntitlements =
    activeSubscription?.entitlements ||
    currentPlan?.entitlements ||
    effectiveEntitlementsQuery.data?.entitlements;
  const tenantPlan = effectiveEntitlementsQuery.data?.plan;
  const roleVisibleNavItems = requiresMfaEnrollment
    ? navItems.filter((item) => item.section === "account")
    : isOwner
      ? navItems
      : isAdmin
        ? navItems.filter((item) => adminAllowedSections.has(item.section))
        : navItems.filter((item) => staffAllowedSections.has(item.section));
  const visibleNavItems = roleVisibleNavItems.filter((item) =>
    canAccessVendorSection(item.section, effectiveEntitlements, tenantPlan)
  );
  const defaultDashboardPath = `/dashboard/${visibleNavItems[0]?.section || "settings"}`;
  useEffect(() => {
    if (!user?.id || !selectedTenantSlug || !selectedTenantRole || requiresMfaEnrollment || effectiveEntitlementsQuery.isPending) return;
    savePreference(preferenceKey(user.id, selectedTenantSlug), sectionWorkspace(currentSection,
      new URLSearchParams(location.search).get("workspace"), isOwner || isAdmin));
  }, [user?.id, selectedTenantSlug, selectedTenantRole, requiresMfaEnrollment, effectiveEntitlementsQuery.isPending,
    currentSection, location.search, isOwner, isAdmin]);
  const queueLifecycleSnapshotQuery = useQuery({
    queryKey: ["vendor-dashboard-queue-lifecycle", token, selectedTenantSlug, selectedLocationSlug, locationQuery],
    queryFn: async () => {
      if (!token || !selectedTenantSlug) {
        throw new Error("Missing dashboard context.");
      }
      return vendorDashboardQueue.getQueueSnapshot(token, selectedTenantSlug, locationQuery);
    },
    enabled: shouldEnableVendorDashboardBootstrap(token, selectedTenantSlug, requiresMfaEnrollment),
    refetchInterval: 30_000
  });
  const staffQuery = useQuery({
    queryKey: ["vendor-dashboard-staff", token, selectedTenantSlug],
    queryFn: async () => {
      if (!token || !selectedTenantSlug) {
        throw new Error("Missing dashboard context.");
      }

      return vendorDashboardOperations.getStaff(token, selectedTenantSlug);
    },
    enabled: Boolean(
      canLoadProtectedDashboard &&
      token &&
      selectedTenantSlug &&
      canAccessVendorSection("staff", effectiveEntitlements)
    )
  });
  const servicesQuery = useQuery({
    queryKey: ["vendor-dashboard-services", token, selectedTenantSlug, isOwner, isAdmin],
    queryFn: async () => {
      if (!token || !selectedTenantSlug) {
        throw new Error("Missing dashboard context.");
      }

      return vendorDashboardCatalog.getServices(token, selectedTenantSlug);
    },
    enabled: Boolean(
      canLoadProtectedDashboard &&
      token &&
      selectedTenantSlug &&
      (isOwner || isAdmin) &&
      canAccessVendorSection("services", effectiveEntitlements)
    )
  });
  const ticketServiceOptionsQuery = useQuery({
    queryKey: ["vendor-ticket-service-options", token, selectedTenantSlug, selectedLocationSlug],
    queryFn: () => vendorDashboardQueue.getServiceOptions(token!, selectedTenantSlug, locationQuery),
    enabled: Boolean(canLoadProtectedDashboard && walkInDialogOpen && token && selectedTenantSlug && selectedLocationSlug)
  });
  const locationServicesQuery = useQuery({
    queryKey: ["vendor-dashboard-location-services", token, selectedTenantSlug, isOwner, isAdmin],
    queryFn: async () => {
      if (!token || !selectedTenantSlug) {
        throw new Error("Missing dashboard context.");
      }

      return vendorDashboardCatalog.getLocationServices(token, selectedTenantSlug);
    },
    enabled: Boolean(
      canLoadProtectedDashboard &&
      token &&
      selectedTenantSlug &&
      (isOwner || isAdmin) &&
      canAccessVendorSection("services", effectiveEntitlements)
    )
  });
  const availabilityQuery = useQuery({
    queryKey: ["vendor-dashboard-availability", token, selectedTenantSlug, selectedLocationSlug, isOwner, isAdmin],
    queryFn: async () => {
      if (!token || !selectedTenantSlug || !selectedLocationSlug) {
        throw new Error("Missing dashboard context.");
      }

      return vendorDashboardCatalog.getAvailability(token, selectedTenantSlug, selectedLocationSlug);
    },
    enabled: Boolean(
      canLoadProtectedDashboard &&
      token &&
      selectedTenantSlug &&
      selectedLocationSlug &&
      (isOwner || isAdmin) &&
      canAccessVendorSection("services", effectiveEntitlements)
    )
  });
  const countersQuery = useQuery({
    queryKey: ["vendor-dashboard-counters", token, selectedTenantSlug, selectedLocationSlug],
    queryFn: async () => {
      if (!token || !selectedTenantSlug || !selectedLocationSlug) {
        throw new Error("Missing dashboard context.");
      }

      return vendorDashboardCatalog.getCounters(token, selectedTenantSlug, selectedLocationSlug);
    },
    enabled: Boolean(canLoadProtectedDashboard && token && selectedTenantSlug && selectedLocationSlug)
  });
  const historyQuery = useQuery({
    queryKey: ["vendor-dashboard-history", token, selectedTenantSlug, selectedLocationSlug, currentSection, hasActiveSubscription],
    queryFn: async () => {
      if (!token || !selectedTenantSlug || !selectedLocationSlug) {
        throw new Error("Missing dashboard context.");
      }

      return vendorDashboardOperations.getHistory(token, selectedTenantSlug, selectedLocationSlug);
    },
    enabled: Boolean(
      canLoadProtectedDashboard &&
      token &&
      selectedTenantSlug &&
      selectedLocationSlug &&
      currentSection === "history" &&
      hasActiveSubscription &&
      canAccessVendorSection("history", effectiveEntitlements)
    )
  });
  const clientsQuery = useQuery({
    queryKey: ["vendor-dashboard-clients", token, selectedTenantSlug, selectedLocationSlug, currentSection, hasActiveSubscription, locationQuery],
    queryFn: async () => {
      if (!token || !selectedTenantSlug || !selectedLocationSlug) {
        throw new Error("Missing dashboard context.");
      }

      return vendorDashboardOperations.getClients(token, selectedTenantSlug, locationQuery);
    },
    enabled: Boolean(
      canLoadProtectedDashboard &&
      token &&
      selectedTenantSlug &&
      selectedLocationSlug &&
      currentSection === "clients" &&
      hasActiveSubscription &&
      canAccessVendorSection("clients", effectiveEntitlements)
    )
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
      hideNonActiveBookings,
      bookingDateRange
    ],
    queryFn: async () => {
      if (!token || !selectedTenantSlug || !selectedLocationSlug) {
        throw new Error("Missing dashboard context.");
      }

      return vendorDashboardBookings.getBookings(token, selectedTenantSlug, selectedLocationSlug, bookingPage, bookingSearch, bookingStatusFilter, [
        bookingDateRange[0] ? formatDateInputValue(bookingDateRange[0]) : null,
        bookingDateRange[1] ? formatDateInputValue(bookingDateRange[1]) : null
      ], hideNonActiveBookings);
    },
    enabled: Boolean(
      canLoadProtectedDashboard &&
      token &&
      selectedTenantSlug &&
      selectedLocationSlug &&
      currentSection === "bookings" &&
      hasActiveSubscription &&
      canOperateBookingQueue &&
      canAccessVendorSection("bookings", effectiveEntitlements)
    )
  });

  const bookingAlertsQuery = useQuery({
    queryKey: ["vendor-dashboard-booking-alerts", token, selectedTenantSlug, selectedLocationSlug],
    queryFn: async () => {
      if (!token || !selectedTenantSlug || !selectedLocationSlug) {
        throw new Error("Missing dashboard context.");
      }

      return vendorDashboardBookings.getBookingAlerts(token, selectedTenantSlug, selectedLocationSlug);
    },
    enabled: Boolean(
      canLoadProtectedDashboard &&
      token &&
      selectedTenantSlug &&
      selectedLocationSlug &&
      hasActiveSubscription &&
      canOperateBookingQueue &&
      canAccessVendorSection("bookings", effectiveEntitlements)
    ),
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
  }, [bookingDetailModalId, bookingDetailOpen, bookingDetailRetry, selectedLocationSlug, selectedTenantSlug, token]);

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
        setRescheduleStartAt((current) => availableRescheduleSelection(response.slots, current));
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
  }, [rescheduleDate, rescheduleDialogOpen, reschedulingBooking, selectedTenantSlug, token]);

  useEffect(() => {
    if (!activeTenants.some((tenant) => tenant.slug === selectedTenantSlug)) {
      setSelectedTenantSlug(activeTenants[0]?.slug || "");
    }
  }, [selectedTenantSlug, activeTenants]);

  useEffect(() => {
    if (requiresMfaEnrollment) {
      setAccountTab("security");
      if (currentSection !== "account") {
        navigate(boardApprovalReturn ? `/dashboard/account?next=${encodeURIComponent(boardApprovalReturn)}` : "/dashboard/account", { replace: true });
      }
      return;
    }

    if (selectedTenantRole === "staff" && (accountTab === "subscription" || accountTab === "billing")) {
      setAccountTab("profile");
    }
  }, [accountTab, boardApprovalReturn, currentSection, navigate, requiresMfaEnrollment, selectedTenantRole]);

  useEffect(() => {
    if (!dashboardBootstrapQuery.data) {
      return;
    }

    const { locationsResponse, snapshotResponse, notificationSettings } = dashboardBootstrapQuery.data;
    setError("");
    setLocations(locationsResponse.locations);
    setActiveLocationLimit(locationsResponse.activeLocationLimit);
    setPlatformDefaultTimezone(locationsResponse.defaultTimezone);
    if (!selectedLocationSlug || !locationsResponse.locations.some((item) => item.slug === selectedLocationSlug)) {
      setSelectedLocationSlug(locationsResponse.locations.find((item) => item.isPrimary)?.slug || locationsResponse.locations[0]?.slug || "");
    }
    setSnapshot((current) => selectFreshestQueueSnapshot(current, snapshotResponse));
    const incomingSettings = tenantSettingsFromSnapshot(snapshotResponse.tenant);
    savedSettings.current = incomingSettings;
    if (!unsavedForm.current.hasEdits()) setSettings(incomingSettings);
    setVendorNotificationSettings(notificationSettings);
  }, [dashboardBootstrapQuery.data, selectedLocationSlug]);

  useEffect(() => {
    if (!token || !selectedTenantSlug || !canManageContactSettings) {
      return;
    }

    let active = true;
    setProfileThemeLoading(true); setProfileThemeError(null);
    vendorDashboardOperations.getTheme(token, selectedTenantSlug, "")
      .then((data) => { if (active) { const theme=mergeTheme(data.theme); savedProfileTheme.current=theme; setBusinessProfileTheme(theme); } })
      .catch((themeError) => { if (active) setProfileThemeError(themeError); })
      .finally(()=>{if(active)setProfileThemeLoading(false);});
    return () => { active = false; };
  }, [canManageContactSettings, selectedTenantSlug, token, profileThemeRetry]);

  useEffect(() => {
    if (billingOverviewQuery.data) {
      setBilling(billingOverviewQuery.data);
    }
  }, [billingOverviewQuery.data]);

  useEffect(() => {
    if (dashboardBootstrapQuery.error) {
      setError(getErrorMessage(dashboardBootstrapQuery.error));
    }
  }, [dashboardBootstrapQuery.error]);

  useEffect(() => {
    if (queueLifecycleSnapshotQuery.data) {
      setSnapshot((current) => selectFreshestQueueSnapshot(current, queueLifecycleSnapshotQuery.data));
    }
  }, [queueLifecycleSnapshotQuery.data]);

  useEffect(() => {
    const queueDay = snapshot?.queueDay;
    if (!queueDay) return;
    const current = {
      id: queueDay.id ? String(queueDay.id) : null,
      state: queueDay.state || null,
      deadlineVersion: queueDay.deadlineVersion ?? null,
      reconciliationError: queueDay.reconciliationError || null
    };
    const previous = previousQueueDayRef.current;
    if (!previous || previous.id !== current.id) {
      previousQueueDayRef.current = current;
      return;
    }

    const syncNotice = getQueueDaySyncNotice(
      previous,
      current,
      localQueueDayUpdateRef.current,
      busyAction.startsWith("queue-")
    );
    if (syncNotice === "local_update") {
      previousQueueDayRef.current = current;
      localQueueDayUpdateRef.current = null;
      return;
    }
    if (syncNotice === "defer") {
      return;
    }
    previousQueueDayRef.current = current;

    if (syncNotice === "deadline_updated") {
      showInfoNotification(
        "Queue deadline updated",
        `Another operator extended the Queue Day. The new close time is ${
          queueDay.currentClosesAt ? formatDateTime(queueDay.currentClosesAt) : "available in the live status"
        }.`
      );
    } else if (syncNotice === "closed") {
      showInfoNotification(
        "Queue closed",
        "Live status synchronized. Earlier ticket outcomes remain final even if an admin later reopens the Queue Day."
      );
    } else if (syncNotice === "reconciliation_error") {
      showInfoNotification(
        "Queue status needs attention",
        "Automatic reconciliation could not confirm a trustworthy state. Queue actions are locked."
      );
    }
  }, [busyAction, snapshot?.queueDay, showInfoNotification]);

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
    setAvailabilitySummary(availabilityQuery.data.summary || null);
  }, [availabilityQuery.data]);

  useEffect(() => {
    if (!countersQuery.data) {
      return;
    }

    setServiceCounters(countersQuery.data.counters);
    setCounterLimit(countersQuery.data.counterLimit);
    setSelectedCounterSlug((current) => current && countersQuery.data.counters.some((counter) => counter.slug === current && counter.isActive)
      ? current : countersQuery.data.counters.find((counter) => counter.isActive)?.slug || "");
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
    if (!token || !selectedTenantSlug || savingNotificationSettings) {
      return;
    }
    setError("");
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
        queryClient.setQueryData(
          ["vendor-dashboard-billing", token, selectedTenantSlug],
          data.billing
        );
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
  }, [location.pathname, location.search, navigate, queryClient, selectedTenantSlug, token, showInfoNotification, showSuccessNotification]);

  useEffect(() => {
    if (!selectedTenantSlug || !selectedLocationSlug || !token) {
      return undefined;
    }

    const eventSource = new EventSource(
      `${API_BASE_URL}/public/tenant/${selectedTenantSlug}/location/${selectedLocationSlug}/stream`
    );
    eventSource.onmessage = (event) => {
      const payload = JSON.parse(event.data) as QueueSnapshot;
      syncQueueAlerts(payload.nextUp || [], { detectNew: true });
      void queryClient.invalidateQueries({
        queryKey: [
          "vendor-dashboard-queue-lifecycle",
          token,
          selectedTenantSlug,
          selectedLocationSlug,
          locationQuery
        ]
      });
      if (
        currentSection === "bookings" &&
        token &&
        hasActiveSubscription &&
        canOperateBookingQueue &&
        canAccessVendorSection("bookings", effectiveEntitlements)
      ) {
        void queryClient.invalidateQueries({
          queryKey: [
            "vendor-dashboard-bookings",
            token,
            selectedTenantSlug,
            selectedLocationSlug,
            bookingPage,
            bookingSearch,
            bookingStatusFilter,
            hideNonActiveBookings,
            bookingDateRange
          ]
        });
      }
      if (
        token &&
        hasActiveSubscription &&
        canOperateBookingQueue &&
        canAccessVendorSection("group-funded", effectiveEntitlements)
      ) {
        void queryClient.invalidateQueries({
          queryKey: ["vendor-dashboard-group-funded-campaigns", token, selectedTenantSlug]
        });
        void queryClient.invalidateQueries({
          queryKey: ["vendor-dashboard-group-funded-detail", token, selectedTenantSlug]
        });
      }
    };
    eventSource.onerror = () => {
      // EventSource reconnects automatically after transient network/server hiccups.
    };

    return () => {
      eventSource.close();
    };
  }, [
    canOperateBookingQueue,
    currentSection,
    effectiveEntitlements,
    bookingDateRange,
    bookingPage,
    bookingSearch,
    bookingStatusFilter,
    hideNonActiveBookings,
    hasActiveSubscription,
    locationQuery,
    queryClient,
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
    const allowedHistoryExportRanges = getAllowedHistoryExportRanges(effectiveEntitlements);

    setHistoryExportFormat((current) =>
      current && availableFormats.includes(current) ? current : availableFormats[0] || null
    );
    setHistoryExportRange((current) =>
      current && allowedHistoryExportRanges.includes(current)
        ? current
        : allowedHistoryExportRanges[0] || null
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

  async function copyLocationUrl(label: "Join URL" | "QR target" | "Monitor URL" | "Queue board URL", url: string) {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard access is not available in this browser.");
      }

      await navigator.clipboard.writeText(url);
      showSuccessNotification(`${label} copied`, `The ${label.toLowerCase()} has been copied to your clipboard.`);
    } catch (copyError) {
      notifications.show({
        color: "red",
        icon: <IconX size={18} />,
        message: getErrorMessage(copyError),
        title: "Could not copy URL"
      });
    }
  }

  async function saveQueueQr() {
    const qrCanvas = getStyledQRCodeCanvas(queueQrRef.current);
    if (!qrCanvas || typeof window === "undefined") {
      return;
    }

    setSavingQueueQr(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 500;
      canvas.height = 500;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Your browser could not prepare the QR image.");
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, 500, 500);
      context.drawImage(qrCanvas, 0, 0, 500, 500);

      const jpeg = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("The QR image could not be exported."));
          }
        }, "image/jpeg", 0.95);
      });
      const downloadUrl = URL.createObjectURL(jpeg);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${selectedTenantSlug || "queue"}-${selectedLocationSlug || "location"}-join-qr.jpg`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
      showSuccessNotification("QR code download started", "Your 500 × 500 JPG QR image is being saved to this device.");
    } catch (downloadError) {
      notifications.show({
        color: "red",
        icon: <IconX size={18} />,
        message: getErrorMessage(downloadError),
        title: "Could not save QR code"
      });
    } finally {
      setSavingQueueQr(false);
    }
  }

  async function startMfaEnrollment() {
    if (!token) {
      return;
    }

    setMfaBusy(true);
    setError("");
    try {
      const enrollment = await vendorDashboardOperations.startMfaEnrollment(token);
      setMfaSecret(enrollment.secret);
      setMfaEnrollmentUri(enrollment.otpAuthUri);
      setMfaRecoveryCodes([]);
    } catch (mfaError) {
      setError(getErrorMessage(mfaError));
    } finally {
      setMfaBusy(false);
    }
  }

  async function confirmMfaEnrollment() {
    if (mfaBusy) return;
    if (!token) {
      return;
    }

    setMfaBusy(true);
    setError("");
    try {
      const result = await vendorDashboardOperations.confirmMfaEnrollment(token, mfaCode);
      setMfaEnabled(true);
      setMfaSecret("");
      setMfaEnrollmentUri("");
      setMfaCode("");
      setMfaRecoveryCodes(result.recoveryCodes);
      await refreshUser();
      showSuccessNotification("Authenticator enabled", "Save your recovery codes before leaving this page.");
    } catch (mfaError) {
      setError(getErrorMessage(mfaError));
    } finally {
      setMfaBusy(false);
    }
  }

  async function cancelMfaEnrollment() {
    if (!token) {
      return;
    }

    setMfaBusy(true);
    setError("");
    try {
      await vendorDashboardOperations.cancelMfaEnrollment(token);
      setMfaSecret("");
      setMfaEnrollmentUri("");
      setMfaCode("");
      showSuccessNotification("Setup canceled", "Your active sign-in methods were not changed.");
    } catch (mfaError) {
      setError(getErrorMessage(mfaError));
    } finally {
      setMfaBusy(false);
    }
  }

  async function handleAccountProfileSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedForm = event.currentTarget;
    if (!token || !accountProfileForm.name.trim()) {
      return;
    }

    setAccountProfileBusy(true);
    setError("");
    try {
      await vendorDashboardOperations.updateAccountProfile(token, {
        name: accountProfileForm.name.trim(),
        displayName: accountProfileForm.displayName.trim()
      });
      await refreshUser();
      unsavedForm.current.clear(submittedForm);
      showSuccessNotification("Account profile saved", "Your vendor account details were updated.");
    } catch (profileError) {
      setError(getErrorMessage(profileError));
    } finally {
      setAccountProfileBusy(false);
    }
  }

  async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedForm = event.currentTarget;
    setPasswordBusy(true);
    setError("");
    try {
      await changePassword(passwordForm);
      unsavedForm.current.clear(submittedForm);
      navigate("/login", { replace: true });
    } catch (passwordError) {
      setError(getErrorMessage(passwordError));
    } finally {
      setPasswordBusy(false);
    }
  }

  async function startMfaReplacement() {
    if (mfaBusy) return;
    if (!token) {
      return;
    }

    setMfaBusy(true);
    setError("");
    try {
      await vendorDashboardOperations.verifyMfaStepUp(token, replacementPassword, replacementCode);
      const enrollment = await vendorDashboardOperations.startMfaEnrollment(token, replacementCode);
      setMfaSecret(enrollment.secret);
      setMfaEnrollmentUri(enrollment.otpAuthUri);
      setMfaCode("");
      setMfaRecoveryCodes([]);
      setReplacingMfa(false);
      setReplacementPassword("");
      setReplacementCode("");
    } catch (mfaError) {
      setError(getErrorMessage(mfaError));
    } finally {
      setMfaBusy(false);
    }
  }

  async function removeMfa() {
    if (mfaBusy) return;
    if (!token) {
      return;
    }

    setMfaBusy(true);
    setError("");
    try {
      await vendorDashboardOperations.disableMfa(
        token,
        removalPassword,
        removalCode,
        removalRecoveryCode
      );
      setMfaEnabled(false);
      setRemovingMfa(false);
      setRemovalPassword("");
      setRemovalCode("");
      setRemovalRecoveryCode("");
      setRemovalAcknowledged(false);
      const updatedUser = await refreshUser();
      setMfaEnabled(Boolean(updatedUser?.mfaEnabled));
      showSuccessNotification(
        "Authenticator removed",
        updatedUser?.emailMfaEnabled
          ? "Email OTP remains enabled as your sign-in verification method."
          : "Your authenticator and recovery codes are no longer active."
      );
    } catch (mfaError) {
      setError(getErrorMessage(mfaError));
    } finally {
      setMfaBusy(false);
    }
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
            ticket.joinChannel !== "vendor" &&
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
    qrUrl: selectedLocation?.qrJoinUrl || "",
    monitorUrl:
      snapshot?.location?.monitorUrl ||
      snapshot?.tenant.monitorUrl ||
      ""
  };
  const periodTicketMetric = getPeriodTicketMetric(periodUsageQuery.data?.usage, periodUsageQuery.isError);
  const ticketUsage = !dashboardBootstrapQuery.error && snapshot?.tenant.slug === selectedTenantSlug && snapshot?.location?.slug === selectedLocationSlug ? snapshot.stats.servedToday : "—";
  const historyTickets = useMemo(() => history?.tickets || snapshot?.history || [], [history, snapshot]);
  const recordedIntervals = useMemo(() => servedTicketIntervals(snapshot?.history || [], RECORDED_INTERVAL_TICKET_LIMIT), [snapshot?.history]);
  const averageRecordedInterval = recordedIntervals.length ? Math.round(recordedIntervals.reduce((total, bar)=>total+bar.minutes,0)/recordedIntervals.length*10)/10 : 0;
  const intervalMaximum = Math.max(...recordedIntervals.map(bar=>bar.minutes),averageRecordedInterval,1);
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
  const clientsTotalPages = Math.max(1, Math.ceil(filteredClients.length / CLIENTS_PAGE_SIZE));
  const clientsVisiblePage = boundedPage(clientsPage, clientsTotalPages);
  const paginatedClients = useMemo(() => {
    const start = (clientsVisiblePage - 1) * CLIENTS_PAGE_SIZE;
    return filteredClients.slice(start, start + CLIENTS_PAGE_SIZE);
  }, [clientsVisiblePage, filteredClients]);

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
  const historyTotalPages = Math.max(1, Math.ceil(filteredHistoryTickets.length / HISTORY_PAGE_SIZE));
  const historyVisiblePage = boundedPage(historyPage, historyTotalPages);
  const paginatedHistoryTickets = useMemo(() => {
    const start = (historyVisiblePage - 1) * HISTORY_PAGE_SIZE;
    return filteredHistoryTickets.slice(start, start + HISTORY_PAGE_SIZE);
  }, [filteredHistoryTickets, historyVisiblePage]);
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
  const queueDayState = resolveQueueDayState(snapshot?.queueDay);
  const queueDayClosed = queueDayState !== "open";
  const queueDayPaused = Boolean(snapshot?.queueDay?.isPaused);
  const bookingSnapshotMatchesLocation = Boolean(selectedLocationSlug && snapshot?.location?.slug === selectedLocationSlug && snapshot.tenant.slug === selectedTenantSlug);
  const bookingCheckInBlocked = !bookingSnapshotMatchesLocation || queueDayClosed || queueDayPaused || snapshot?.queueDay?.intakeMode === "paused";
  let bookingCheckInGuidance = "Resume queue intake before checking in customers.";
  if (!bookingSnapshotMatchesLocation) {
    bookingCheckInGuidance = "Loading this location's queue status. Please wait.";
  } else if (queueDayClosed) {
    bookingCheckInGuidance = "Open the queue before checking in customers.";
  }
  const queueDayUnopened = queueDayState === "unopened";
  const queueDayActuallyClosed = queueDayState === "closed";
  const queueDayReconciling =
    snapshot?.queueDay?.availabilityReason === "reconciling" ||
    snapshot?.queueDay?.autoClosePhase === "overdue";
  const queueDayExtended = snapshot?.queueDay?.autoClosePhase === "extended";
  const intakeState = snapshot?.queueIntake || null;
  const restoreBlockedByThreshold = Boolean(
    intakeState?.autoPauseEnabled &&
      intakeState.autoPauseThreshold &&
      intakeState.currentWaitingCount >= intakeState.autoPauseThreshold
  );
  const [weeklyServiceOptions, exceptionServiceOptions] = useMemo(
    () => [availabilityBlockForm.serviceSlug, availabilityExceptionForm.serviceSlug].map((selectedServiceSlug) => [
      { value: "", label: "All services" },
      ...services
        .filter((service) => service.isActive || service.slug === selectedServiceSlug)
        .map((service) => ({ value: service.slug, label: `${service.name}${service.isActive ? "" : " (Not offered for booking)"}` }))
    ]),
    [services, availabilityBlockForm.serviceSlug, availabilityExceptionForm.serviceSlug]
  );
  const locationOptions = useMemo(
    () =>
      locations.map((locationItem) => ({
        value: locationItem.slug,
        label: `${locationItem.name}${locationItem.isActive ? "" : " (Inactive)"}`
      })),
    [locations]
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
  }, [bookingSearch, bookingStatusFilter, hideNonActiveBookings, bookingDateRange, selectedTenantSlug, selectedLocationSlug]);

  async function runAction(
    actionName: string,
    request: () => Promise<DashboardActionResponse>
  ): Promise<boolean> {
    setError("");
    setBusyAction(actionName);

    try {
      const data = await request();
      const nextSnapshot = data.snapshot;
      if (nextSnapshot) {
        if (actionName === "queue-extend" || actionName === "queue-close") {
          localQueueDayUpdateRef.current = {
            kind: actionName === "queue-extend" ? "deadline" : "state",
            id: nextSnapshot.queueDay.id ? String(nextSnapshot.queueDay.id) : null,
            state: nextSnapshot.queueDay.state || null,
            deadlineVersion: nextSnapshot.queueDay.deadlineVersion ?? null
          };
        }
        setSnapshot((current) => selectFreshestQueueSnapshot(current, nextSnapshot));
      }
      return true;
    } catch (actionError) {
      setError(getErrorMessage(actionError));
      return false;
    } finally {
      setBusyAction("");
    }
  }

  async function handleConfirmCalledTicket(lookupCode: string): Promise<boolean> {
    if (!scannerTarget || scannerTarget.tenantSlug !== selectedTenantSlug || scannerTarget.locationQuery !== locationQuery) { setTicketScannerError("Queue context changed. Close the scanner and select the ticket again."); return false; }
    setTicketScannerError("");
    setBusyAction("confirm-current");

    try {
      const data = await vendorDashboardQueue.confirmCurrentTicket(
        token,
        selectedTenantSlug,
        scannerTarget.locationQuery,
        lookupCode,
        scannerTarget.ticketId,
        scannerTarget.counterSlug
      );
      const confirmedSnapshot = data.snapshot;
      if (confirmedSnapshot) {
        setSnapshot((current) => selectFreshestQueueSnapshot(current, confirmedSnapshot));
      }
      showSuccessNotification("Customer confirmed", "The ticket is valid. You can now choose whether to serve the customer.");
      return true;
    } catch (confirmError) {
      setTicketScannerError(getErrorMessage(confirmError));
      return false;
    } finally {
      setBusyAction("");
    }
  }

  async function handleCreateWalkIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedForm = event.currentTarget;
    const success = await runAction("walk-in", () =>
      vendorDashboardQueue.createWalkInTicket(token, selectedTenantSlug, locationQuery, walkInForm)
    );

    if (success) {
      setWalkInForm(emptyWalkIn);
      unsavedForm.current.clear(submittedForm);
      setWalkInDialogOpen(false);
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
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["vendor-dashboard-services", token, selectedTenantSlug, isOwner, isAdmin]
      }),
      queryClient.invalidateQueries({
        queryKey: ["vendor-dashboard-location-services", token, selectedTenantSlug, isOwner, isAdmin]
      })
    ]);
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
        hideNonActiveBookings,
        bookingDateRange
      ]
    });
  }

  async function retryDashboardContext() {
    setError("");
    await Promise.all([dashboardBootstrapQuery.refetch(), queueLifecycleSnapshotQuery.refetch()]);
  }

  async function reloadDashboardSnapshot() {
    await queryClient.invalidateQueries({
      queryKey: [
        "vendor-dashboard-queue-lifecycle",
        token,
        selectedTenantSlug,
        selectedLocationSlug,
        locationQuery
      ]
    });
  }

  async function handleOpenQueueDay() {
    const success = await runAction("queue-open", () =>
      vendorDashboardQueue.openQueueDay(
        token,
        selectedTenantSlug,
        locationQuery,
        snapshot?.queueDay?.version
      )
    );
    if (success) {
      showSuccessNotification("Queue opened", "Customers can now join this location’s Queue Day.");
      setQueueView("current");
    }
    return success;
  }

  async function handleExtendQueueDay() {
    const success = await runAction("queue-extend", () =>
      vendorDashboardQueue.extendQueueDay(
        token,
        selectedTenantSlug,
        locationQuery,
        snapshot?.queueDay?.version
      )
    );
    if (success) {
      showSuccessNotification(
        "Auto-close extended",
        "Thirty minutes were added and your action was recorded. Auto-close remains active."
      );
    }
    return success;
  }

  async function handleCloseQueueDay() {
    const success = await runAction("queue-close", () =>
      vendorDashboardQueue.closeQueueDay(
        token,
        selectedTenantSlug,
        locationQuery,
        snapshot?.queueDay?.version
      )
    );
    if (success) {
      showSuccessNotification(
        "Queue closed",
        "Every unresolved ticket received its carry-over, expiration, skipped, or unserved outcome."
      );
      setQueueView("overflow");
    }
    return success;
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

    setError("");
    setReschedulingBooking(booking);
    setRescheduleDate(formatDateInputValue(booking.scheduledStartAt));
    setRescheduleStartAt("");
    setRescheduleSlots([]);
    setRescheduleSlotsError("");
    setRescheduleDialogOpen(true);
  }

  async function handleRescheduleBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedForm = event.currentTarget;
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
      setBookingDetailBooking((current) => current?.id === response.booking.id ? response.booking : current);
      clearBookingAlert(response.booking.id);
      unsavedForm.current.clear(submittedForm);
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
      setBookingDetailBooking((current) => current?.id === response.booking.id ? response.booking : current);
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
      setBookingDetailBooking((current) => current?.id === response.booking.id ? response.booking : current);
      await reloadBookings();
      showSuccessNotification("Booking marked no-show", `${response.booking.reference} was canceled as a no-show.`);
    } catch (noShowError) {
      setError(getErrorMessage(noShowError));
    } finally {
      setBusyAction("");
    }
  }

  function renderBookingNoShowAction(
    booking: VendorBookingSummary,
    includeAdmin = false,
  ) {
    const state = getBookingCheckInState(booking, bookingCheckInNow);
    const canMarkNoShow =
      canOperateBookingQueue &&
      (!canAdminBookings || includeAdmin) &&
      state.isEligibleStatus &&
      state.isLate;
    if (!canMarkNoShow || booking.checkedInAt || booking.linkedTicket) {
      return null;
    }
    return (
      <OperationButton
        leftSection={<IconAlertTriangle size={16} />}
        disabled={Boolean(busyAction)}
        loading={busyAction === `booking-no-show:${booking.id}`}
        onClick={() => void handleMarkBookingNoShow(booking)}
        variant="destructive"
      >
        Mark no-show
      </OperationButton>
    );
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
      unsavedForm.current.discardId("vendor-booking-payment");
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
      unsavedForm.current.discardId("vendor-booking-payment");
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
    if (!locationServicesQuery.data || locationServicesQuery.isError || servicesQuery.isError) {
      setError("Branch service settings are still loading. Please try again once they are available.");
      return;
    }
    setError("");
    const locationServices = (locationServicesQuery.data?.locationServices || []).filter(
      (entry) => service ? entry.serviceId === service.id : false
    );
    setEditingServiceSlug(service?.slug || "");
    setEditingServiceId(service?.id || "");
    setServiceSlugManuallyEdited(Boolean(service?.slug));
    setServiceSlugMessage("");
    setServiceSlugAvailable(false);
    setCheckingServiceSlug(false);
    setServiceForm({
      name: service?.name || "",
      slug: service?.slug || "",
      imageUrl: service?.imageUrl || "",
      description: service?.description || "",
      durationMinutes: service?.durationMinutes || 30,
      allowBookingQuantity: service?.allowBookingQuantity || false,
      bookingQuantityLabel: service?.bookingQuantityLabel || "Units",
      bookingQuantityMin: service?.bookingQuantityMin ?? 1,
      bookingQuantityMax: service?.bookingQuantityMax ?? 24,
      manualPaymentRequired: service?.manualPaymentRequired || false,
      bookingCapacityScope: service?.bookingCapacityScope || "service",
      priceAmountCents: service?.priceAmountCents || 0,
      priceDisplay: service?.priceDisplay || "",
      isActive: service?.isActive ?? true,
      sortOrder: service?.sortOrder || 0,
      locationServices: locations.map((location) => {
        const existing = locationServices.find((entry) => entry.locationId === location.id);
        return {
          locationSlug: location.slug,
          capacity: existing?.capacity || 1,
          isActive: existing?.isActive ?? (!service && location.slug === selectedLocationSlug),
          sortOrder: existing?.sortOrder || 0,
          priceAmountCents: existing?.priceAmountCents ?? null,
          priceDisplay: existing?.priceDisplay ?? null,
          groupFunded: normalizeGroupFundedSettings(existing?.groupFunded)
        };
      })
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
          setServiceSlugMessage(response.valid ? (response.available ? "This booking link name is available." : "This booking link name is already in use.") : "Use letters or numbers for the booking link name.");
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
    const submittedForm = event.currentTarget;
    const quantityError = serviceQuantityError(serviceForm);
    if (quantityError) { setError(quantityError); return; }
    setBusyAction("service-save");
    setError("");

    try {
      if (!serviceSlugAvailable) {
        setError(serviceSlugMessage || "Choose an available booking link name before saving.");
        return;
      }

      if (editingServiceSlug) {
        await vendorDashboardCatalog.saveService(token, selectedTenantSlug, editingServiceSlug, serviceForm);
      } else {
        await vendorDashboardCatalog.saveService(token, selectedTenantSlug, null, serviceForm);
      }
      await reloadServices();
      await reloadBookings();
      unsavedForm.current.clear(submittedForm);
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
        bookingQuantityMin: service.bookingQuantityMin,
        bookingQuantityMax: service.bookingQuantityMax,
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
      const response = await vendorDashboardCatalog.deactivateService(token, selectedTenantSlug, service.slug);
      setServices((current) => current.map((item) => item.id === response.service.id ? response.service : item));
      await reloadBookings();
      showSuccessNotification("Service removed from booking", `${service.name} is disabled. Existing records are retained.`);
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
    setError("");
    const weekday = block?.weekday ?? 1;
    const blockLocation =
      (block ? locations.find((locationItem) => locationItem.id === block.locationId) : null) ||
      selectedLocation;
    const businessHourDefaults = getWeeklyAvailabilityDefaults(blockLocation?.hours || [], weekday);
    setEditingAvailabilityBlockId(block?.id || "");
    setAvailabilityBlockForm({
      locationSlug: blockLocation?.slug || selectedLocationSlug,
      serviceSlug: block?.serviceId ? serviceSlugById.get(block.serviceId) || "" : "",
      weekday,
      startsAt: block?.startsAt || businessHourDefaults.startsAt,
      endsAt: block?.endsAt || businessHourDefaults.endsAt,
      endsNextDay: block ? block.endsNextDay : businessHourDefaults.endsNextDay,
      capacity: block?.capacity || 1,
      isActive: block?.isActive ?? true,
      notes: block?.notes || ""
    });
    setAvailabilityBlockDialogOpen(true);
  }

  async function handleSaveAvailabilityBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedForm = event.currentTarget;
    setBusyAction("availability-block-save");
    setError("");

    try {
      const targetLocationSlug = availabilityBlockForm.locationSlug || selectedLocationSlug;
      const body = {
        ...availabilityBlockForm,
        locationSlug: targetLocationSlug
      };
      if (editingAvailabilityBlockId) {
        await vendorDashboardCatalog.saveAvailabilityBlock(token, selectedTenantSlug, editingAvailabilityBlockId, body);
      } else {
        await vendorDashboardCatalog.saveAvailabilityBlock(token, selectedTenantSlug, null, body);
      }
      await reloadAvailability();
      await reloadBookings();
      if (targetLocationSlug !== selectedLocationSlug) {
        setSelectedLocationSlug(targetLocationSlug);
      }
      unsavedForm.current.clear(submittedForm);
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
        endsNextDay: block.endsNextDay,
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
    setError("");
    setEditingAvailabilityExceptionId(exception?.id || "");
    const blockEntireDay = Boolean(
      exception &&
        !exception.serviceId &&
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
    const submittedForm = event.currentTarget;
    setBusyAction("availability-exception-save");
    setError("");

    try {
      const body = dateExceptionPayload(availabilityExceptionForm, availabilityExceptionBlockEntireDay, selectedLocationSlug);
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
      unsavedForm.current.clear(submittedForm);
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
    setError("");
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
    const submittedForm = event.currentTarget;
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
      unsavedForm.current.clear(submittedForm);
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
    const submittedForm = event.currentTarget;
    if (busyAction || staffQuery.isPending || staffQuery.isError || staff.length >= staffSeatLimit) return;
    setError("");
    setBusyAction("staff-save");
    try {
      await vendorDashboardOperations.addStaff(token, selectedTenantSlug, staffForm);
      await reloadStaff();
      await reloadBookings();
      unsavedForm.current.clear(submittedForm);
      setStaffDialogOpen(false);
      setStaffForm({ email: "", role: "staff" });
      showSuccessNotification("Staff added", "The staff member now has access to this tenant.");
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleUpdateStaffRole(
    member: VendorStaffSummary,
    role: "owner" | "admin" | "staff",
  ) {
    setError("");
    setBusyAction("staff-update");
    try {
      await vendorDashboardOperations.updateStaff(
        token,
        selectedTenantSlug,
        member.id,
        { role },
      );
      await reloadStaff();
      await reloadBookings();
      showSuccessNotification(
        "Staff updated",
        `${member.name}'s role was updated.`,
      );
    } finally {
      setBusyAction("");
    }
  }

  async function handleUpdateStaffStatus(
    member: VendorStaffSummary,
    isActive: boolean,
  ) {
    setError("");
    setBusyAction("staff-update");
    try {
      await vendorDashboardOperations.updateStaff(
        token,
        selectedTenantSlug,
        member.id,
        { isActive },
      );
      await reloadStaff();
      await reloadBookings();
      showSuccessNotification(
        isActive ? "Staff enabled" : "Staff disabled",
        `${member.name} was ${isActive ? "enabled" : "disabled"} for this tenant.`,
      );
    } finally {
      setBusyAction("");
    }
  }

  async function handleRemoveStaff(member: VendorStaffSummary) {
    setError("");
    setBusyAction("staff-update");
    try {
      await vendorDashboardOperations.removeStaff(
        token,
        selectedTenantSlug,
        member.id,
      );
      await reloadStaff();
      await reloadCounters();
      await reloadBookings();
      showSuccessNotification(
        "Staff removed",
        `${member.name} no longer has tenant access.`,
      );
    } finally {
      setBusyAction("");
    }
  }

  function openConfirmAction(action: NonNullable<typeof confirmAction>) {
    setConfirmAction(action);
  }

  function openWaitingTicketCancellation(ticket: QueueSnapshot["nextUp"][number]) {
    openConfirmAction({
      title: `Cancel ticket ${ticket.ticketNumber}?`,
      description: ticket.linkedBookingReference
        ? "Remove this waiting ticket from the queue. This does not cancel the linked booking or issue a refund. The ticket cannot be restored."
        : "Remove this waiting ticket from the queue. The ticket cannot be restored; issue a new ticket if the customer returns.",
      confirmLabel: "Cancel ticket",
      confirmColor: "red",
      onConfirm: async () => {
        const success = await runAction(`cancel-ticket:${ticket.id}`, () =>
          vendorDashboardQueue.cancelWaitingTicket(token, selectedTenantSlug, locationQuery, ticket.id)
        );
        if (success) showSuccessNotification("Ticket cancelled", `${ticket.ticketNumber} was removed from the waiting queue.`);
      }
    });
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

  async function handleRegenerateLocationQueueQr(locationItem: StoreLocationWithHours) {
    setBusyAction(`location-qr:${locationItem.slug}`);
    setError("");
    try {
      const response = await vendorDashboardOperations.regenerateLocationQueueQr(
        token,
        selectedTenantSlug,
        locationItem.slug
      );
      setLocations((current) => current.map((item) => item.id === response.location.id ? response.location : item));
      setSnapshot((current) => current && current.location?.id === response.location.id
        ? { ...current, location: response.location }
        : current);
      showSuccessNotification(
        "Queue QR regenerated",
        "The previous QR id is no longer valid. Save and redistribute the new QR code."
      );
    } catch (regenerateError) {
      setError(getErrorMessage(regenerateError));
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
      await reloadCounters();
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
    const submittedForm = event.currentTarget;
    if (busyAction) return;
    const success = await runAction("settings", () => vendorDashboardOperations.updateSettings(token, selectedTenantSlug, queueSettingsPayload(settings)));

    if (success) {
      unsavedForm.current.clear(submittedForm);
      savedSettings.current = { ...savedSettings.current, ...queueSettingsPayload(settings) };
      showSuccessNotification("Queue settings saved", "Your queue preferences were updated.");
    }
  }

  async function handleSaveBusinessProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedForm = event.currentTarget;
    if (!canManageContactSettings || busyAction || profileThemeLoading || profileThemeError) return;
    const success = await runAction("settings", () => vendorDashboardOperations.updateSettings(token, selectedTenantSlug, settings));
    if (!success) {
      return;
    }

    savedSettings.current = { ...settings };
    const themeSaved = await handleSaveBusinessProfileTheme();
    if (themeSaved) {
      unsavedForm.current.clear(submittedForm);
      showSuccessNotification("Business profile saved", "Your business details and default images were updated.");
    }
  }

  async function handleStartCheckout(planSlug: Exclude<SubscriptionPlanSlug, "free">) {
    setError("");
    setBusyAction(`checkout:${planSlug}`);

    try {
      const data = await vendorDashboardBilling.startCheckout(token, selectedTenantSlug, {
        planSlug,
        billingInterval,
        billingMode: billingPaymentMode,
        paymentMethod: billingPaymentMode === "manual" ? "qrph" : "card"
      });
      window.location.href = data.checkoutSession.checkoutUrl;
    } catch (checkoutError) {
      setError(getErrorMessage(checkoutError));
      setBusyAction("");
    }
  }

  async function handleHistoryExport(range: string, format: "csv" | "pdf") {
    if (busyAction) return;
    setBusyAction("history-export");
    setError("");
    try {
      const response = await vendorDashboardExport.exportHistory(
        token,
        selectedTenantSlug,
        selectedLocationSlug,
        range,
        format,
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
    } catch (exportError) {
      setError(getErrorMessage(exportError));
    } finally {
      setBusyAction("");
    }
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

  function setBusinessProfileThemeField<K extends keyof PublicBoardThemeSettings>(
    field: K,
    value: PublicBoardThemeSettings[K]
  ) {
    setBusinessProfileTheme((current) => ({ ...current, [field]: value }));
  }

  function applyThemePreset(presetId: string) {
    const preset = publicBoardThemePresets[presetId] || publicBoardThemePresets.classic;
    setThemeForm((current) => ({
      ...preset,
      heroTitle: current.heroTitle,
      heroSubtitle: current.heroSubtitle,
      logoUrl: current.logoUrl,
      logoFit: current.logoFit || preset.logoFit,
      backgroundImageUrl: current.backgroundImageUrl,
      backgroundImageFit: current.backgroundImageFit || preset.backgroundImageFit,
      pageBackgroundImageUrl:
        current.pageBackgroundImageUrl && !presetBackgroundImageUrls.has(current.pageBackgroundImageUrl)
          ? current.pageBackgroundImageUrl
          : preset.pageBackgroundImageUrl,
      pageBackgroundImageFit: current.pageBackgroundImageFit || preset.pageBackgroundImageFit
    }));
  }

  async function uploadThemeAsset(
    assetType: "background" | "logo",
    file: File | null,
    targetField: Extract<keyof PublicBoardThemeSettings, "backgroundImageUrl" | "pageBackgroundImageUrl" | "logoUrl"> = assetType === "logo" ? "logoUrl" : "backgroundImageUrl"
  ) {
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

      setThemeField(targetField, data.asset.publicUrl);
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

  async function uploadBusinessProfileAsset(assetType: "background" | "logo", file: File | null) {
    if (!file || !token) return;

    setError("");
    setBusyAction(`business-profile-upload:${assetType}`);
    try {
      const data = await vendorDashboardOperations.uploadThemeAsset(token, selectedTenantSlug, "", assetType, file);
      const field = assetType === "logo" ? "logoUrl" : "backgroundImageUrl";
      setBusinessProfileTheme((current) => ({ ...current, [field]: data.asset.publicUrl }));
      showSuccessNotification(
        `${assetType === "logo" ? "Logo" : "Cover"} uploaded`,
        "Save the business profile to publish this default image."
      );
    } catch (uploadError) {
      setError(getErrorMessage(uploadError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleSaveBusinessProfileTheme() {
    if (!token) return false;

    setError("");
    setBusyAction("business-profile-theme-save");
    try {
      const data = await vendorDashboardOperations.saveTheme(token, selectedTenantSlug, "", {
        theme: businessProfileTheme,
        applyToAllLocations: false
      });
      const savedTheme = mergeTheme(data.theme);
      savedProfileTheme.current = savedTheme;
      setBusinessProfileTheme(savedTheme);
      return true;
    } catch (saveError) {
      setError(getErrorMessage(saveError));
      return false;
    } finally {
      setBusyAction("");
    }
  }

  async function uploadLocationImage(file: File | null) {
    if (!file || !locationForm.slug || !token) {
      return;
    }

    setError("");
    setBusyAction("location-image-upload");

    try {
      const data = await vendorDashboardOperations.uploadLocationMedia(token, selectedTenantSlug, locationForm.slug, file);
      if (!data.asset?.publicUrl) {
        throw new Error("Location image upload completed without a usable image URL.");
      }
      setLocationForm((current) => ({ ...current, imageUrl: data.asset.publicUrl }));
      showSuccessNotification("Branch image uploaded", "The location image is ready to save with this branch.");
    } catch (uploadError) {
      setError(getErrorMessage(uploadError));
    } finally {
      setBusyAction("");
    }
  }

  async function uploadServiceImage(file: File | null) {
    if (!file || !selectedLocationSlug || !token) {
      return;
    }

    setError("");
    setBusyAction("service-image-upload");

    try {
      const data = await vendorDashboardOperations.uploadServiceMedia(token, selectedTenantSlug, selectedLocationSlug, file);
      if (!data.asset?.publicUrl) {
        throw new Error("Service image upload completed without a usable image URL.");
      }
      setServiceForm((current) => ({ ...current, imageUrl: data.asset.publicUrl }));
      showSuccessNotification("Service image uploaded", "The service image is ready to save with this service.");
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

  function openPlanDialog(paidOnly = false) {
    setPaidPlanDialogOnly(paidOnly);
    setPlanDialogOpen(true);
  }

  function closePlanDialog() {
    if (busyAction) return;
    setPlanDialogOpen(false);
    setPaidPlanDialogOnly(false);
  }

  function renderPlanCards({ paidOnly = false } = {}) {
    if (billingOverviewQuery.isPending) {
      return <AccountText c="dimmed">Plans are loading.</AccountText>;
    }

    if (billingOverviewQuery.error) {
      return (
        <AccountStack gap="sm">
          <AccountText c="red">Subscription plans could not be loaded.</AccountText>
          <AccountButton
            className="neura-secondary-button"
            onClick={() => void billingOverviewQuery.refetch()}
            variant="default"
            w="fit-content"
          >
            Retry
          </AccountButton>
        </AccountStack>
      );
    }

    if (!billing?.plans.length) {
      return <AccountText c="dimmed">No subscription plans are available.</AccountText>;
    }

    const visiblePlans = billing.plans.filter((plan) => !paidOnly || plan.slug !== "free");

    return (
      <AccountStack gap="md">
        <ConfigurationSelect label="Billing interval" data={[{value:"monthly",label:"Monthly"},{value:"annual",label:"Annual"}]} value={billingInterval} onChange={value=>{if(value) setBillingInterval(value as "monthly" | "annual");}} />
        <ConfigurationSelect label="Payment method" description="Automatic recurring payments are not available yet." data={[{value:"manual",label:"Manual via QRPh"},{value:"automatic",label:"Automatic recurring",disabled:true}]} value={billingPaymentMode} onChange={value=>{if(value) setBillingPaymentMode(value as "manual" | "automatic");}} />
        <AccountAlert color="blue" variant="light" icon={<IconInfoCircle size={18} />}>
          Manual QRPh payments require a new payment each month or year. Automatic recurring payments will be available after PayMongo subscription billing is enabled for this account.
        </AccountAlert>
        <AccountGrid
          className="subscription-plan-grid"
          cols={{ base: 1, sm: Math.min(visiblePlans.length, 2), md: Math.min(visiblePlans.length, 4) }}
          spacing="md"
        >
          {visiblePlans.map((plan) => (
            <OperationPanel key={plan.slug}>
              <AccountStack gap="md" h="100%">
                <div>
                  <AccountText className="neura-label">{plan.name}</AccountText>
                  <AccountTitle order={3}>
                    {getPlanPriceDisplay(plan, billingInterval)}
                  </AccountTitle>
                  <AccountText c="dimmed" size="sm">{plan.bestFor}</AccountText>
                </div>
                <AccountStack gap={8} className="neura-feature-list">
                  {getPlanHighlights(plan).map((item) => (
                    <AccountText key={item} size="sm">• {item}</AccountText>
                  ))}
                </AccountStack>
                {plan.slug === "free" ? (
                  <AccountButton disabled mt="auto" variant="default">
                    Free queue plan
                  </AccountButton>
                ) : plan.checkoutEnabled ? (
                  <AccountButton
                    className={plan.slug === "pro" ? "neura-primary-button" : "neura-secondary-button"}
                    disabled={busyAction === `checkout:${plan.slug}`}
                    mt="auto"
                    onClick={() => {
                      if (plan.slug !== "free") void handleStartCheckout(plan.slug);
                    }}
                  >
                    {busyAction === `checkout:${plan.slug}` ? "Opening..." : "Choose plan via QRPh"}
                  </AccountButton>
                ) : (
                  <AccountButton disabled mt="auto" variant="default">
                    Custom quote
                  </AccountButton>
                )}
              </AccountStack>
            </OperationPanel>
          ))}
        </AccountGrid>
      </AccountStack>
    );
  }

  function renderPlanDialog() {
    return <TaskDialog opened={planDialogOpen} onClose={closePlanDialog} busy={Boolean(busyAction)} eyebrow="BILLING" title={paidPlanDialogOnly ? "Upgrade to a paid plan" : "Choose a subscription plan"} footer={<OperationButton variant="outline" onClick={closePlanDialog} disabled={Boolean(busyAction)}>Close plans</OperationButton>}>
      <AccountPresentation onBusyChange={setAccountPanelBusy} onDraftChange={setAccountPanelDraft}>
        <ConfigurationScope busy={Boolean(busyAction)}>{renderPlanCards({paidOnly:paidPlanDialogOnly})}</ConfigurationScope>
      </AccountPresentation>
    </TaskDialog>;
  }

  function renderLocationDialog() {
    const addInterval = (weekday: number) =>
      setLocationForm((current) => {
        const nextInterval = {
          weekday,
          opensAt: "09:00",
          closesAt: "17:00",
          isClosed: false,
        };
        const lastIntervalIndex = current.hours.reduce(
          (lastIndex, item, itemIndex) =>
            item.weekday === weekday ? itemIndex : lastIndex,
          -1,
        );
        const insertAt =
          lastIntervalIndex >= 0 ? lastIntervalIndex + 1 : current.hours.length;
        return {
          ...current,
          hours: [
            ...current.hours.slice(0, insertAt),
            nextInterval,
            ...current.hours.slice(insertAt),
          ],
        };
      });
    const removeInterval = (weekday: number, index: number) =>
      setLocationForm((current) => {
        const dayCount = current.hours.filter(
          (item) => item.weekday === weekday,
        ).length;
        return {
          ...current,
          hours:
            dayCount > 1
              ? current.hours.filter((_, itemIndex) => itemIndex !== index)
              : current.hours.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, opensAt: "", closesAt: "", isClosed: true }
                    : item,
                ),
        };
      });
    const close = () => {
      if (canLeaveFeature()) {
        unsavedForm.current.discardId("vendor-location-editor");
        setLocationDialogOpen(false);
      }
    };
    return (
      <TaskDialog
        opened={locationDialogOpen}
        onClose={close}
        busy={Boolean(busyAction)}
        eyebrow="LOCATION SETTINGS"
        title={
          editingLocationSlug
            ? `Edit ${locationForm.name || "location"}`
            : "Add location"
        }
        description="Set the branch details, payment options and operating hours customers see."
        footer={
          <>
            <OperationButton
              className="ops-redundant-dismiss"
              variant="outline"
              onClick={close}
            >
              Cancel
            </OperationButton>
            <OperationButton
              type="submit"
              form="vendor-location-editor"
              loading={busyAction === "location"}
              disabled={Boolean(busyAction)}
            >
              Save location
            </OperationButton>
          </>
        }
      >
        <ConfigurationScope
          busy={Boolean(busyAction)}
          onEdit={(form) => unsavedForm.current.mark(form)}
        >
          <form
            id="vendor-location-editor"
            onSubmit={(event) => {
              event.preventDefault();
              void saveLocation();
            }}
            className="ops-stack"
          >
            {error ? (
              <OperationAlert color="red" title="Unable to save location">
                {error}
              </OperationAlert>
            ) : null}
            <ConfigurationSection
              title="Location profile"
              description="These details identify the branch and shape how customers find it on the public queue pages."
            >
              <div className="ops-grid ops-grid-2">
                <ConfigurationFile
                  accept="image/png,image/jpeg,image/webp"
                  label="Branch image"
                  placeholder={
                    locationForm.imageUrl
                      ? "Replace branch image"
                      : "Upload branch image"
                  }
                  disabled={busyAction === "location-image-upload"}
                  onChange={(file) => uploadLocationImage(file)}
                />
                <ConfigurationInput
                  label="Branch image URL"
                  value={locationForm.imageUrl || ""}
                  onChange={(event) =>
                    setLocationForm((current) => ({
                      ...current,
                      imageUrl: event.target.value,
                    }))
                  }
                />
                {locationForm.imageUrl ? (
                  <img
                    alt=""
                    src={locationForm.imageUrl}
                    className="config-image"
                  />
                ) : null}
                <ConfigurationInput
                  name="locationName"
                  label="Location name"
                  required
                  description="Shown to customers and staff as the branch display name."
                  value={locationForm.name}
                  onChange={(event) => {
                    const nextName = event.target.value;
                    setLocationForm((current) => ({
                      ...current,
                      name: nextName,
                      slug: locationSlugManuallyEdited
                        ? current.slug
                        : buildLocationSlug(nextName),
                    }));
                  }}
                />
                <ConfigurationInput
                  name="locationSlug"
                  label="Location link name"
                  required
                  readOnly={Boolean(editingLocationSlug)}
                  description={
                    editingLocationSlug
                      ? "This link name cannot change after the location is created."
                      : checkingLocationSlug
                        ? "Checking link availability…"
                        : locationSlugMessage || "A short, lowercase name used in public location links."
                  }
                  error={
                    !editingLocationSlug &&
                    !locationSlugAvailable &&
                    locationForm.slug
                      ? locationSlugMessage ||
                        "This location link name is already taken."
                      : undefined
                  }
                  value={locationForm.slug}
                  onChange={(event) => {
                    setLocationSlugManuallyEdited(true);
                    setLocationForm((current) => ({
                      ...current,
                      slug: buildLocationSlug(event.target.value),
                    }));
                  }}
                />
                <ConfigurationInput
                  name="addressLine1"
                  label="Address line 1"
                  description="Street address or landmark for the branch."
                  value={locationForm.addressLine1}
                  onChange={(event) =>
                    setLocationForm((current) => ({
                      ...current,
                      addressLine1: event.target.value,
                    }))
                  }
                />
                <ConfigurationInput
                  name="addressLine2"
                  label="Address line 2"
                  description="Optional unit, floor, or building detail."
                  value={locationForm.addressLine2}
                  onChange={(event) =>
                    setLocationForm((current) => ({
                      ...current,
                      addressLine2: event.target.value,
                    }))
                  }
                />
                <ConfigurationInput
                  name="city"
                  label="City"
                  value={locationForm.city}
                  onChange={(event) =>
                    setLocationForm((current) => ({
                      ...current,
                      city: event.target.value,
                    }))
                  }
                />
                <ConfigurationInput
                  name="province"
                  label="Province"
                  value={locationForm.province}
                  onChange={(event) =>
                    setLocationForm((current) => ({
                      ...current,
                      province: event.target.value,
                    }))
                  }
                />
                <ConfigurationInput
                  name="locationContactEmail"
                  type="email"
                  label="Contact email"
                  description="Used for location-specific inquiries and notifications."
                  value={locationForm.contactEmail}
                  onChange={(event) =>
                    setLocationForm((current) => ({
                      ...current,
                      contactEmail: event.target.value,
                    }))
                  }
                />
                <ConfigurationPhone
                  name="locationContactPhone"
                  label="Contact phone"
                  description="Displayed to customers when contact details are needed."
                  value={locationForm.contactPhone}
                  onChange={(nextValue) =>
                    setLocationForm((current) => ({
                      ...current,
                      contactPhone: nextValue,
                    }))
                  }
                />
                <ConfigurationSelect
                  name="timezone"
                  label="Timezone"
                  description="Used for public hours and queue timing."
                  data={timeZoneOptions}
                  value={locationForm.timezone}
                  onChange={(value) =>
                    value &&
                    setLocationForm((current) => ({
                      ...current,
                      timezone: value,
                    }))
                  }
                />
              </div>
            </ConfigurationSection>

            <ConfigurationSection
              title="Manual payment"
              description="Optional payment details shown when this branch accepts manual payments."
            >
              <div className="ops-grid ops-grid-2">
                <ConfigurationSelect
                  name="paymentMethodLabel"
                  label="Payment method"
                  description="Where customers should send payment for this location."
                  data={["GCash", "Maya", "Bank Transfer"]}
                  placeholder="Choose a payment method"
                  value={locationForm.paymentMethodLabel}
                  onChange={(value) =>
                    setLocationForm((current) => ({
                      ...current,
                      paymentMethodLabel: value || "",
                    }))
                  }
                />
                {locationForm.paymentMethodLabel === "Bank Transfer" ? (
                  <ConfigurationInput
                    name="paymentBankName"
                    label="Bank name"
                    placeholder="e.g. BPI, BDO, UnionBank"
                    value={locationForm.paymentBankName}
                    onChange={(event) =>
                      setLocationForm((current) => ({
                        ...current,
                        paymentBankName: event.target.value,
                      }))
                    }
                  />
                ) : null}
                <ConfigurationInput
                  name="paymentAccountDisplayName"
                  label={
                    locationForm.paymentMethodLabel === "Bank Transfer"
                      ? "Account owner"
                      : "Account display name"
                  }
                  description={
                    locationForm.paymentMethodLabel === "Bank Transfer"
                      ? "Name of the bank account owner."
                      : "Business or account holder name shown beside the QR code."
                  }
                  placeholder={
                    locationForm.paymentMethodLabel === "Bank Transfer"
                      ? "Account owner name"
                      : "Business or account name"
                  }
                  value={locationForm.paymentAccountDisplayName}
                  onChange={(event) =>
                    setLocationForm((current) => ({
                      ...current,
                      paymentAccountDisplayName: event.target.value,
                    }))
                  }
                />
                <ConfigurationInput
                  name="paymentAccountIdentifierDisplay"
                  description={locationForm.paymentMethodLabel === "Bank Transfer" ? "The account number customers use for bank transfers." : "Use a partially hidden number or suffix so customers can verify the account without exposing the full number."}
                  label={
                    locationForm.paymentMethodLabel === "Bank Transfer"
                      ? "Account number"
                      : "Masked account identifier"
                  }
                  placeholder={
                    locationForm.paymentMethodLabel === "Bank Transfer"
                      ? "Bank account number"
                      : "0917 *** 1234 or account suffix"
                  }
                  value={locationForm.paymentAccountIdentifierDisplay}
                  onChange={(event) =>
                    setLocationForm((current) => ({
                      ...current,
                      paymentAccountIdentifierDisplay: event.target.value,
                    }))
                  }
                />
                {locationForm.paymentMethodLabel === "Bank Transfer" ? (
                  <div className="ops-stack">
                    <div className="config-media">
                      <IconBuildingBank size={44} />
                    </div>
                    <p className="ops-muted">
                      Customers will see your bank details instead of a QR code.
                    </p>
                  </div>
                ) : (
                  <div className="ops-stack">
                    <ConfigurationFile
                      accept="image/jpeg,image/png,image/webp"
                      disabled={busyAction === "payment-qr-upload"}
                      label="QR image"
                      description="Upload the QR code image customers should scan."
                      onChange={(file) => {
                        setPaymentQrUploadFile(file);
                        void uploadLocationPaymentQr(file);
                      }}
                      placeholder={
                        locationForm.paymentQrImageUrl
                          ? "Replace QR image"
                          : "Upload QR image"
                      }
                      value={paymentQrUploadFile}
                    />
                    {locationForm.paymentQrImageUrl ? (
                      <img
                        alt="Payment QR preview"
                        src={locationForm.paymentQrImageUrl}
                        className="config-image"
                      />
                    ) : null}
                  </div>
                )}
              </div>
              <ConfigurationCheck
                name="paymentQrActive"
                checked={locationForm.paymentQrActive}
                label="Enable manual payment for this location"
                description="Only turn this on if customers should see these payment details for this branch."
                onChange={(event) =>
                  setLocationForm((current) => ({
                    ...current,
                    paymentQrActive: event.currentTarget.checked,
                  }))
                }
              />
            </ConfigurationSection>

            <ConfigurationSection
              title="Booking arrival"
              description="Choose how customers join the live queue for their scheduled booking."
            >
              <ConfigurationCheck
                checked={locationForm.customerSelfCheckInEnabled}
                label="Allow customers to mark their arrival"
                description="Customers can tap I’ve arrived within 15 minutes of their booked start. This accepts their declaration without verifying they are on site. Staff check-in remains available. Booking tickets cannot be called before their scheduled start."
                onChange={(event) =>
                  setLocationForm((current) => ({
                    ...current,
                    customerSelfCheckInEnabled: event.currentTarget.checked,
                  }))
                }
              />
            </ConfigurationSection>
            <ConfigurationSection
              title="Service timing"
              description="Record when staff actually start and finish serving a customer."
            >
              <ConfigurationCheck
                checked={locationForm.serviceTimingEnabled}
                label="Track service start and completion"
                description="Use Call next, Start service, then Complete service. This records actual service time; it does not reserve resources or change wait estimates. Turning this off keeps unfinished records available for staff to resolve."
                onChange={(event) =>
                  setLocationForm((current) => ({
                    ...current,
                    serviceTimingEnabled: event.currentTarget.checked,
                  }))
                }
              />
            </ConfigurationSection>
            <ConfigurationSection
              title="Visibility and access"
              description="These switches control whether the branch is active and whether it is treated as the main location."
            >
              <div className="ops-row">
                <ConfigurationCheck
                  name="isActiveLocation"
                  checked={locationForm.isActive}
                  label="Enable location"
                  description="Inactive locations stay saved but are hidden from normal use."
                  onChange={(event) =>
                    setLocationForm((current) => ({
                      ...current,
                      isActive: event.currentTarget.checked,
                    }))
                  }
                />
                <ConfigurationCheck
                  name="isPrimaryLocation"
                  description="Used as the default location in public pages and your dashboard."
                  checked={locationForm.isPrimary}
                  label="Primary location"
                  onChange={(event) =>
                    setLocationForm((current) => ({
                      ...current,
                      isPrimary: event.target.checked,
                    }))
                  }
                />
              </div>
            </ConfigurationSection>

            <ConfigurationSection
              title="Operating hours"
              description="Set the default operating hours customers should see. Add multiple intervals when a location closes and reopens on the same day."
            >
              <div className="ops-stack">
                {getOrderedLocationHours(locationForm.hours).map(
                  ({ hour, index }) => (
                    <div
                      className="config-hour"
                      key={`${hour.weekday}-${index}`}
                    >
                      <div className="ops-row ops-between">
                        <p className="ops-strong">
                          {
                            [
                              "Sunday",
                              "Monday",
                              "Tuesday",
                              "Wednesday",
                              "Thursday",
                              "Friday",
                              "Saturday",
                            ][hour.weekday]
                          }
                        </p>
                        <ConfigurationCheck
                          name={`hours.${index}.isClosed`}
                          checked={hour.isClosed}
                          label="Closed"
                          onChange={(event) =>
                            setLocationForm((current) => ({
                              ...current,
                              hours: current.hours.map((item, i) =>
                                i === index
                                  ? { ...item, isClosed: event.target.checked }
                                  : item,
                              ),
                            }))
                          }
                        />
                      </div>
                      {!hour.isClosed ? (
                        <div className="ops-grid ops-grid-2">
                          <ConfigurationInput
                            name={`hours.${index}.opensAt`}
                            label="Opens"
                            type="time"
                            required
                            value={hour.opensAt}
                            onChange={(event) =>
                              setLocationForm((current) => ({
                                ...current,
                                hours: current.hours.map((item, i) =>
                                  i === index
                                    ? { ...item, opensAt: event.target.value }
                                    : item,
                                ),
                              }))
                            }
                          />
                          <ConfigurationInput
                            name={`hours.${index}.closesAt`}
                            label="Closes"
                            type="time"
                            required
                            value={hour.closesAt}
                            onChange={(event) =>
                              setLocationForm((current) => ({
                                ...current,
                                hours: current.hours.map((item, i) =>
                                  i === index
                                    ? { ...item, closesAt: event.target.value }
                                    : item,
                                ),
                              }))
                            }
                          />
                        </div>
                      ) : null}
                      <div className="ops-row">
                        <OperationButton
                          variant="outline"
                          onClick={() => {
                            unsavedForm.current.mark(
                              document.getElementById("vendor-location-editor"),
                            );
                            addInterval(hour.weekday);
                          }}
                        >
                          Add interval
                        </OperationButton>
                        <OperationButton
                          variant="outline"
                          onClick={() => {
                            unsavedForm.current.mark(
                              document.getElementById("vendor-location-editor"),
                            );
                            removeInterval(hour.weekday, index);
                          }}
                        >
                          Remove interval
                        </OperationButton>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </ConfigurationSection>
          </form>
        </ConfigurationScope>
      </TaskDialog>
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
            <Text fw={700}>
              {currentPlan ? getPlanPriceDisplay(currentPlan) : activeSubscription.planName}
            </Text>
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

  function renderRecordedIntervals() {
    return <OperationPanel><div className="queue-stack"><div><h2 className="account-panel-title">Recent ticket activity</h2><p className="ops-muted">Intervals between recorded update times for served tickets in the current location snapshot. Each point uses two recorded timestamps.</p></div>
      {recordedIntervals.length ? <><OperationMetric label="Average interval" value={`${averageRecordedInterval} min`} detail={`From ${recordedIntervals.length + 1} served-ticket records`} /><div className="report-intervals">{recordedIntervals.map((bar,index)=><div className="queue-stack" key={`${bar.label}:${index}`}><div className="ops-row ops-between"><span>{bar.label}</span><span>{bar.minutes} min</span></div><progress aria-label={`${bar.label}: ${bar.minutes} minute recorded interval`} max={intervalMaximum} value={bar.minutes} /></div>)}</div></> : <OperationEmpty title="More recorded activity needed" text="Intervals appear when this snapshot includes two served tickets with valid update times." />}
    </div></OperationPanel>;
  }

  function renderQueuePage() {
    const activeCounters = serviceCounters.filter((counter) => counter.isActive);
    const activeTicket = selectedCalledTicket;

    return (
      <div className="queue-stack vendor-live-queue">
        <LiveQueueSummary snapshot={snapshot} />
        <QueueCard>
          <QueueCardHeader>
            <QueueCardTitle>Queue controls</QueueCardTitle>
          </QueueCardHeader>
          <QueueCardContent className="queue-stack">
            <div className="queue-row queue-between">
              <div className="queue-stack">
                <QueueBadge variant="outline">
                  {queueDayReconciling
                    ? "Queue closing"
                    : queueDayUnopened
                      ? "Queue not opened"
                      : queueDayActuallyClosed
                        ? "Queue day closed"
                        : queueDayPaused
                          ? "Queue intake paused"
                          : queueDayExtended
                            ? "Queue day extended"
                            : "Queue day open"}
                </QueueBadge>
                <div className="queue-row">
                  {queueDayUnopened && canOperateQueueDay ? (
                    <QueueButton
                      variant="default"
                      disabled={Boolean(busyAction) || boardScannerBusy || boardSettingsBusy || savingNotificationSettings || requestingBrowserPermission}
                      aria-busy={busyAction === "queue-open"}
                      onClick={() => void handleOpenQueueDay()}
                    >
                      Open queue
                    </QueueButton>
                  ) : queueDayActuallyClosed && canReopenQueueDay ? (
                    <QueueButton
                      variant="default"
                      disabled={Boolean(busyAction) || boardScannerBusy || boardSettingsBusy || savingNotificationSettings || requestingBrowserPermission}
                      onClick={async () => {
                        const success = await runAction("queue-reopen", () =>
                          vendorDashboardQueue.reopenQueueDay(
                            token,
                            selectedTenantSlug,
                            locationQuery,
                          ),
                        );
                        if (success) {
                          showSuccessNotification(
                            "Queue reopened",
                            "The Queue Day is accepting joins again. Earlier ticket outcomes were not reversed.",
                          );
                          setQueueView("current");
                        }
                      }}
                    >
                      {busyAction === "queue-reopen"
                        ? "Reopening..."
                        : "Reopen queue"}
                    </QueueButton>
                  ) : !queueDayClosed && queueDayPaused ? (
                    <QueueButton
                      variant="secondary"
                      disabled={Boolean(busyAction) || boardScannerBusy || boardSettingsBusy || savingNotificationSettings || requestingBrowserPermission}
                      onClick={async () => {
                        const success = await runAction("queue-resume", () =>
                          vendorDashboardQueue.resumeQueueDay(
                            token,
                            selectedTenantSlug,
                            locationQuery,
                          ),
                        );
                        if (success) {
                          showSuccessNotification(
                            "Queue resumed",
                            "Customers can join this queue again.",
                          );
                        }
                      }}
                    >
                      {busyAction === "queue-resume"
                        ? "Resuming..."
                        : "Resume intake"}
                    </QueueButton>
                  ) : !queueDayClosed ? (
                    <QueueButton
                      variant="secondary"
                      disabled={Boolean(busyAction) || boardScannerBusy || boardSettingsBusy || savingNotificationSettings || requestingBrowserPermission}
                      onClick={async () => {
                        const success = await runAction("queue-pause", () =>
                          vendorDashboardQueue.pauseQueueDay(
                            token,
                            selectedTenantSlug,
                            locationQuery,
                          ),
                        );
                        if (success) {
                          showSuccessNotification(
                            "Queue paused",
                            "New joins are paused while staff continues serving the active queue.",
                          );
                        }
                      }}
                    >
                      {busyAction === "queue-pause"
                        ? "Pausing..."
                        : "Pause intake"}
                    </QueueButton>
                  ) : null}
                  {!queueDayClosed && canOperateQueueDay ? (
                    <QueueButton
                      variant="destructive"
                      disabled={Boolean(busyAction) || boardScannerBusy || boardSettingsBusy || savingNotificationSettings || requestingBrowserPermission}
                      onClick={() => {
                        setConfirmAction({
                          title: `Close ${selectedLocation?.name || "this queue"} now?`,
                          description:
                            "Unresolved waiting tickets will carry over once or expire, called tickets become unserved, and skipped recovery ends. Reopening will not reverse these outcomes.",
                          confirmLabel: "Close queue and reconcile",
                          confirmColor: "red",
                          onConfirm: async () => {
                            await handleCloseQueueDay();
                          },
                        });
                      }}
                    >
                      {busyAction === "queue-close"
                        ? "Closing..."
                        : "Close queue"}
                    </QueueButton>
                  ) : null}
                </div>
              </div>
            </div>
            {queueDayUnopened ? (
              <QueueAlert>
                <QueueAlertDescription>
                  Store hours make this Queue Day eligible, but they do not open
                  it automatically. An authorized operator must open the queue
                  before customers can join.
                </QueueAlertDescription>
              </QueueAlert>
            ) : null}
            {queueDayActuallyClosed && snapshot?.queueDay?.outcomeCounts ? (
              <QueueAlert>
                <QueueAlertTitle>Close reconciliation completed</QueueAlertTitle>
                <QueueAlertDescription>
                  {snapshot.queueDay.outcomeCounts.pendingCarryOver} saved for
                  carry-over · {snapshot.queueDay.outcomeCounts.expired} expired ·{" "}
                  {snapshot.queueDay.outcomeCounts.unserved} unserved ·{" "}
                  {snapshot.queueDay.outcomeCounts.skipped} skipped recovery
                  ended. Reopening does not reverse these outcomes.
                </QueueAlertDescription>
              </QueueAlert>
            ) : null}
            <div className="vendor-queue-action-layout">
              <QueueCounterPicker
                className="vendor-queue-counter-select"
                data={[
                  ...activeCounters.map((counter) => ({
                    label: counter.name,
                    value: counter.slug,
                  })),
                  ...(snapshot?.counterDispatch || [])
                    .filter(
                      (lane) =>
                        lane.counterSlug &&
                        lane.currentTicketId &&
                        !activeCounters.some(
                          (counter) => counter.slug === lane.counterSlug,
                        ),
                    )
                    .map((lane) => ({
                      label: `${lane.counterName} (inactive)`,
                      value: lane.counterSlug!,
                    })),
                  ...(snapshot?.counterDispatch?.some(
                    (lane) => lane.counterSlug === null && lane.currentTicketId,
                  )
                    ? [
                        {
                          label: "Unassigned legacy ticket",
                          value: "__unassigned__",
                        },
                      ]
                    : []),
                ]}
                disabled={Boolean(busyAction) || ticketScannerOpen}
                label="Serving from"
                placeholder="Select counter"
                value={selectedCounterSlug || null}
                onChange={(value) => setSelectedCounterSlug(value || "")}
              />
              <div className="queue-row vendor-queue-primary-actions">
                <QueueButton
                  variant="default"
                  disabled={Boolean(
                    Boolean(busyAction) ||
                    !selectedLane?.canCallNext ||
                    queueDayClosed ||
                    Boolean(activeTicket),
                  )}
                  onClick={async () => {
                    const success = await runAction("call-next", () =>
                      vendorDashboardQueue.callNextTicket(
                        token,
                        selectedTenantSlug,
                        locationQuery,
                        selectedCounterSlug,
                      ),
                    );
                    if (success) {
                      showSuccessNotification(
                        "Customer called",
                        "The next customer has been called to the counter.",
                      );
                    }
                  }}
                >
                  {busyAction === "call-next" ? "Calling..." : "Call next"}
                </QueueButton>
                {activeTicket &&
                (activeTicket.customerConfirmedAt ||
                  activeTicket.joinChannel === "vendor") ? (
                  <QueueButton
                    variant="outline"
                    disabled={
                      Boolean(busyAction) ||
                      Boolean(
                        [
                          "serve-current",
                          "service-start",
                          "service-complete",
                        ].includes(busyAction || ""),
                      )
                    }
                    aria-busy={[
                      "serve-current",
                      "service-start",
                      "service-complete",
                    ].includes(busyAction || "")}
                    onClick={async () => {
                      const tracking =
                        snapshot?.location?.serviceTimingEnabled ||
                        Boolean(activeTicket.serviceStartedAt);
                      const action = activeTicket.serviceStartedAt
                        ? "complete"
                        : "start";
                      const execute = async () => {
                        const success = await runAction(
                          tracking ? `service-${action}` : "serve-current",
                          () =>
                            tracking
                              ? vendorDashboardQueue.recordTicketService(
                                  token,
                                  selectedTenantSlug,
                                  locationQuery,
                                  activeTicket.id,
                                  action,
                                )
                              : vendorDashboardQueue.serveCurrentTicket(
                                  token,
                                  selectedTenantSlug,
                                  locationQuery,
                                  activeTicket.id,
                                  selectedLane?.counterSlug ?? null,
                                ),
                        );
                        if (success) {
                          showSuccessNotification(
                            tracking && action === "start"
                              ? "Service started"
                              : "Customer served",
                            tracking && action === "start"
                              ? "The actual service start has been recorded."
                              : "The ticket was marked as served.",
                          );
                        }
                      };
                      if (activeTicket.serviceStartedAt) {
                        setConfirmAction({
                          title: "Complete service?",
                          description: `Mark ticket ${activeTicket.ticketNumber} as served and record the service end time.`,
                          confirmLabel: "Complete service",
                          confirmColor: "blue",
                          onConfirm: execute,
                        });
                      } else {
                        await execute();
                      }
                    }}
                  >
                    <IconCheck data-icon="inline-start" />
                    {activeTicket.serviceStartedAt
                      ? "Complete service"
                      : snapshot?.location?.serviceTimingEnabled
                        ? "Start service"
                        : "Serve customer"}
                  </QueueButton>
                ) : (
                  <QueueButton
                    variant="outline"
                    disabled={Boolean(!activeTicket || Boolean(busyAction))}
                    onClick={() => {
                      setTicketScannerError("");
                      if (activeTicket)
                        setScannerTarget({
                          ticketId: activeTicket.id,
                          ticketNumber: activeTicket.ticketNumber,
                          counterSlug: selectedLane?.counterSlug ?? null,
                          tenantSlug: selectedTenantSlug,
                          locationQuery,
                        });
                      setTicketScannerOpen(true);
                    }}
                  >
                    <IconQrcode data-icon="inline-start" />
                    Confirm ticket
                  </QueueButton>
                )}
                <QueueButton
                  variant="outline"
                  disabled={Boolean(
                    Boolean(busyAction) ||
                    !activeTicket ||
                    Boolean(activeTicket.serviceStartedAt),
                  )}
                  onClick={() => {
                    if (!activeTicket) return;
                    setConfirmAction({
                      title: "Skip current ticket?",
                      description: `Skip ticket ${activeTicket.ticketNumber} at the selected counter.`,
                      confirmLabel: "Skip ticket",
                      confirmColor: "orange",
                      onConfirm: async () => {
                        const success = await runAction("skip-current", () =>
                          vendorDashboardQueue.skipCurrentTicket(
                            token,
                            selectedTenantSlug,
                            locationQuery,
                            activeTicket.id,
                            selectedLane?.counterSlug ?? null,
                          ),
                        );
                        if (success) {
                          showSuccessNotification(
                            "Ticket skipped",
                            "The current ticket was skipped.",
                          );
                          setQueueView("current");
                        }
                      },
                    });
                  }}
                >
                  Skip current
                </QueueButton>
                {activeTicket?.serviceStartedAt ? (
                  <QueueButton
                    variant="outline"
                    disabled={Boolean(busyAction)}
                    onClick={() =>
                      setConfirmAction({
                        title: "Interrupt service?",
                        description:
                          "Record that service ended without completion and mark the called ticket unserved. This is excluded from completed service duration samples.",
                        confirmLabel: "Record interruption",
                        confirmColor: "orange",
                        onConfirm: async () => {
                          await runAction("service-interrupt", () =>
                            vendorDashboardQueue.recordTicketService(
                              token,
                              selectedTenantSlug,
                              locationQuery,
                              activeTicket.id,
                              "interrupt",
                            ),
                          );
                        },
                      })
                    }
                  >
                    Interrupt service
                  </QueueButton>
                ) : null}
              </div>
            </div>
            {snapshot?.queueDay?.closureReason ? (
              <p className="queue-text queue-muted queue-small">
                {snapshot.queueDay.closureReason}
              </p>
            ) : null}
            {selectedLane?.blockReason && !activeTicket ? (
              <p className="queue-text queue-muted queue-small">
                {counterBlockMessage(selectedLane.blockReason)}
              </p>
            ) : null}
            <div
              className="vendor-queue-status-columns"
              data-columns={intakeState?.autoPauseEnabled ? 3 : 2}
            >
              <div className="vendor-queue-status-column">
                <p className="queue-text vendor-eyebrow">
                  {activeTicket?.serviceStartedAt
                    ? "In service"
                    : snapshot?.location?.serviceTimingEnabled
                      ? "Called ticket"
                      : "Now serving"}
                </p>
                <div className="queue-row">
                  <h3 className="queue-heading">
                    {activeTicket?.ticketNumber || "--"}
                  </h3>
                  {activeTicket && isCheckedInBookingTicket(activeTicket) ? (
                    <QueueBadge variant="outline">Booking</QueueBadge>
                  ) : null}
                  {activeTicket?.customerConfirmedAt ? (
                    <QueueBadge variant="outline">Customer confirmed</QueueBadge>
                  ) : null}
                </div>
                <p className="queue-text queue-muted queue-small">
                  {activeTicket?.customerName || "No active ticket"}
                </p>
                {activeTicket?.serviceStartedAt ? (
                  <p className="queue-text queue-muted queue-small">
                    Service started{" "}
                    {formatDateTime(activeTicket.serviceStartedAt)}
                  </p>
                ) : snapshot?.location?.serviceTimingEnabled && activeTicket ? (
                  <p className="queue-text queue-muted queue-small">
                    Called · service has not started
                  </p>
                ) : null}
                {activeTicket?.linkedBookingReference ? (
                  <p className="queue-text queue-muted queue-small">
                    Booking {activeTicket.linkedBookingReference}
                  </p>
                ) : null}
              </div>
              <div className="vendor-queue-status-column">
                <p className="queue-text vendor-eyebrow">Queue day</p>
                <h3 className="queue-heading">
                  {queueDayReconciling
                    ? "Closing"
                    : queueDayUnopened
                      ? "Not opened"
                      : queueDayActuallyClosed
                        ? "Closed"
                        : queueDayPaused
                          ? "Paused"
                          : queueDayExtended
                            ? "Extended"
                            : "Open"}
                </h3>
                <p className="queue-text queue-muted queue-small">
                  {queueDayReconciling
                    ? "Ticket outcomes are being reconciled"
                    : queueDayUnopened
                      ? "Waiting for an authorized operator to open the Queue Day"
                      : queueDayClosed && snapshot?.queueDay?.closedAt
                        ? `Closed ${formatDateTime(snapshot.queueDay.closedAt)}`
                        : queueDayPaused && snapshot?.queueDay?.pausedAt
                          ? `Paused ${formatDateTime(snapshot.queueDay.pausedAt)}`
                          : snapshot?.queueDay?.currentClosesAt
                            ? `Scheduled close ${formatDateTime(snapshot.queueDay.currentClosesAt)}`
                            : "Customers can continue joining this queue"}
                </p>
              </div>
              {intakeState?.autoPauseEnabled && intakeState.autoPauseThreshold ? (
                <div className="vendor-queue-status-column">
                  <LiveQueueIntake
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
                </div>
              ) : null}
            </div>
          </QueueCardContent>
        </QueueCard>

        <CounterTickets
          snapshot={snapshot}
          selectedTicketId={activeTicket?.id}
          disabled={Boolean(busyAction) || ticketScannerOpen}
          onSelect={(counter) => {
            setSelectedCounterSlug(counter);
            setQueueView("current");
          }}
          onEnd={(ticket, action) =>
            setConfirmAction({
              title:
                action === "complete"
                  ? `Complete service for ${ticket.ticketNumber}?`
                  : `Interrupt service for ${ticket.ticketNumber}?`,
              description:
                action === "complete"
                  ? "Mark this ticket as served and record the service end time."
                  : "Record that service ended without completion and mark this ticket unserved.",
              confirmLabel:
                action === "complete"
                  ? "Complete service"
                  : "Record interruption",
              confirmColor: action === "complete" ? "blue" : "orange",
              onConfirm: async () => {
                await runAction(`service-${action}`, () =>
                  vendorDashboardQueue.recordTicketService(
                    token,
                    selectedTenantSlug,
                    locationQuery,
                    ticket.id,
                    action,
                  ),
                );
              },
            })
          }
        />

        <div className="queue-page-grid">
          <div className="queue-page-column">
            <QueueCard>
              <QueueCardHeader>
                <QueueCardTitle>Waiting and recovery</QueueCardTitle>
              </QueueCardHeader>
              <QueueCardContent className="queue-stack">
                <div className="queue-stack">
                  <QueueViewPicker
                    data={[
                      { value: "current", label: "Current queue" },
                      { value: "overflow", label: "Overflow queue" },
                      { value: "recovery", label: "Missed recovery" },
                    ]}
                    value={queueView}
                    onChange={(value) => setQueueView(value as QueueView)}
                  />

                  {queueView === "current" ? (
                    <>
                      <div className="queue-table-wrapper">
                        <QueueTable aria-label="Waiting queue" role="table">
                          <QueueTableHeader>
                            <QueueTableRow>
                              <QueueTableHead scope="col">ID</QueueTableHead>
                              <QueueTableHead scope="col">Up next</QueueTableHead>
                              <QueueTableHead scope="col">Channel</QueueTableHead>
                              <QueueTableHead scope="col">Source</QueueTableHead>
                              <QueueTableHead scope="col">Joined</QueueTableHead>
                              <QueueTableHead scope="col">Actions</QueueTableHead>
                            </QueueTableRow>
                          </QueueTableHeader>
                          <QueueTableBody>
                            {currentQueueTickets.length ? (
                              currentQueueTickets.map((ticket) => (
                                <QueueTableRow key={ticket.id}>
                                  <QueueTableCell data-label="ID">
                                    {ticket.id}
                                  </QueueTableCell>
                                  <QueueTableCell data-label="Ticket">
                                    <p className="queue-text queue-strong">
                                      {ticket.ticketNumber}
                                    </p>
                                    <p className="queue-text queue-muted queue-small">
                                      {getQueueCustomerFullNameLabel(
                                        ticket.customerName,
                                        ticket.customerDisplayName,
                                      )}
                                    </p>
                                    {ticket.linkedBookingReference ? (
                                      <div className="queue-stack">
                                        <p className="queue-text queue-muted queue-small">
                                          Booking {ticket.linkedBookingReference}
                                        </p>
                                        {ticket.bookingScheduledStartAt ? (
                                          <p className="queue-text queue-muted queue-small">
                                            Earliest call:{" "}
                                            {formatDateTime(
                                              ticket.bookingScheduledStartAt,
                                            )}
                                          </p>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </QueueTableCell>
                                  <QueueTableCell data-label="Channel">
                                    <QueueBadge variant="outline">
                                      {ticket.joinChannel}
                                    </QueueBadge>
                                  </QueueTableCell>
                                  <QueueTableCell data-label="Source">
                                    <div className="queue-row">
                                      {isCheckedInBookingTicket(ticket) ? (
                                        <QueueBadge variant="outline">
                                          Booking
                                        </QueueBadge>
                                      ) : null}
                                      <QueueBadge variant="outline">
                                        {ticket.isCarriedOver
                                          ? "Carry-over"
                                          : "Same-day"}
                                      </QueueBadge>
                                    </div>
                                  </QueueTableCell>
                                  <QueueTableCell data-label="Joined">
                                    {formatDateTime(ticket.createdAt)}
                                  </QueueTableCell>
                                  <QueueTableCell data-label="Actions">
                                    {selectedTenantRole &&
                                    ticket.status === "waiting" ? (
                                      <QueueButton
                                        variant="destructive"
                                        disabled={Boolean(busyAction)}
                                        aria-label={`Cancel waiting ticket ${ticket.ticketNumber}`}
                                        onClick={() =>
                                          openWaitingTicketCancellation(ticket)
                                        }
                                      >
                                        Cancel ticket
                                      </QueueButton>
                                    ) : null}
                                  </QueueTableCell>
                                </QueueTableRow>
                              ))
                            ) : (
                              <QueueTableRow>
                                <QueueTableCell colSpan={6}>
                                  <QueueEmptyState
                                    title="No one is waiting right now."
                                    text="Fresh same-day joins will appear here once the carry-over backlog is cleared."
                                  />
                                </QueueTableCell>
                              </QueueTableRow>
                            )}
                          </QueueTableBody>
                        </QueueTable>
                      </div>
                    </>
                  ) : queueView === "overflow" ? (
                    <>
                      <div className="queue-row queue-between">
                        <div>
                          <p className="queue-text vendor-eyebrow">
                            Overflow queue
                          </p>
                          <h3 className="queue-heading">Carry-over tickets</h3>
                        </div>
                        <QueueBadge variant="outline">
                          {overflowTickets.length} ticket
                          {overflowTickets.length === 1 ? "" : "s"}
                        </QueueBadge>
                      </div>
                      <div className="queue-table-wrapper">
                        <QueueTable aria-label="Carry-over queue" role="table">
                          <QueueTableHeader>
                            <QueueTableRow>
                              <QueueTableHead scope="col">ID</QueueTableHead>
                              <QueueTableHead scope="col">Ticket</QueueTableHead>
                              <QueueTableHead scope="col">Channel</QueueTableHead>
                              <QueueTableHead scope="col">Status</QueueTableHead>
                              <QueueTableHead scope="col">
                                Activated at
                              </QueueTableHead>
                              <QueueTableHead scope="col">Joined</QueueTableHead>
                            </QueueTableRow>
                          </QueueTableHeader>
                          <QueueTableBody>
                            {overflowTickets.length ? (
                              overflowTickets.map((ticket) => (
                                <QueueTableRow key={ticket.id}>
                                  <QueueTableCell data-label="ID">
                                    {ticket.id}
                                  </QueueTableCell>
                                  <QueueTableCell data-label="Ticket">
                                    <p className="queue-text queue-strong">
                                      {ticket.ticketNumber}
                                    </p>
                                    <p className="queue-text queue-muted queue-small">
                                      {ticket.customerName}
                                    </p>
                                  </QueueTableCell>
                                  <QueueTableCell data-label="Channel">
                                    <QueueBadge variant="outline">
                                      {ticket.joinChannel}
                                    </QueueBadge>
                                  </QueueTableCell>
                                  <QueueTableCell data-label="Status">
                                    <QueueBadge variant="outline">
                                      {ticket.status === "pending_carry_over"
                                        ? getTicketStateSummary(ticket.status)
                                            .label
                                        : "Carried over"}
                                    </QueueBadge>
                                  </QueueTableCell>
                                  <QueueTableCell data-label="Activated">
                                    {ticket.carriedOverAt
                                      ? formatDateTime(ticket.carriedOverAt)
                                      : "--"}
                                  </QueueTableCell>
                                  <QueueTableCell data-label="Joined">
                                    {formatDateTime(ticket.createdAt)}
                                  </QueueTableCell>
                                </QueueTableRow>
                              ))
                            ) : (
                              <QueueTableRow>
                                <QueueTableCell colSpan={6}>
                                  <QueueEmptyState
                                    title="No overflow tickets."
                                    text="Waiting tickets carried over from a previous queue day will appear here."
                                  />
                                </QueueTableCell>
                              </QueueTableRow>
                            )}
                          </QueueTableBody>
                        </QueueTable>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="queue-row queue-between">
                        <div>
                          <p className="queue-text vendor-eyebrow">
                            Missed ticket recovery
                          </p>
                          <h3 className="queue-heading">Skipped tickets</h3>
                        </div>
                        <QueueBadge variant="outline">
                          {recoverableTickets.length} ticket
                          {recoverableTickets.length === 1 ? "" : "s"}
                        </QueueBadge>
                      </div>
                      {queueDayClosed ||
                      queueDayPaused ||
                      restoreBlockedByThreshold ? (
                        <QueueAlert>
                          <QueueAlertDescription>
                            {queueDayClosed
                              ? "Missed tickets cannot be restored while the queue day is closed."
                              : queueDayPaused
                                ? "Missed tickets cannot be restored while queue intake is paused."
                                : `Missed tickets cannot be restored while the queue is at its intake threshold of ${intakeState?.autoPauseThreshold} waiting tickets.`}
                          </QueueAlertDescription>
                        </QueueAlert>
                      ) : null}
                      <div className="queue-table-wrapper">
                        <QueueTable
                          aria-label="Missed ticket recovery"
                          role="table"
                        >
                          <QueueTableHeader>
                            <QueueTableRow>
                              <QueueTableHead scope="col">ID</QueueTableHead>
                              <QueueTableHead scope="col">Ticket</QueueTableHead>
                              <QueueTableHead scope="col">Joined</QueueTableHead>
                              <QueueTableHead scope="col">
                                Recovery
                              </QueueTableHead>
                              <QueueTableHead scope="col">Action</QueueTableHead>
                            </QueueTableRow>
                          </QueueTableHeader>
                          <QueueTableBody>
                            {recoverableTickets.length ? (
                              recoverableTickets.map((ticket) => {
                                const priorityRecovery = isRecoveryWindowActive(
                                  ticket.rejoinDeadlineAt,
                                );

                                return (
                                  <QueueTableRow key={ticket.id}>
                                    <QueueTableCell data-label="ID">
                                      {ticket.id}
                                    </QueueTableCell>
                                    <QueueTableCell data-label="Ticket">
                                      <p className="queue-text queue-strong">
                                        {ticket.ticketNumber}
                                      </p>
                                      <p className="queue-text queue-muted queue-small">
                                        {ticket.customerName}
                                      </p>
                                    </QueueTableCell>
                                    <QueueTableCell data-label="Joined">
                                      {formatDateTime(ticket.createdAt)}
                                    </QueueTableCell>
                                    <QueueTableCell data-label="Recovery">
                                      <QueueBadge variant="outline">
                                        {priorityRecovery ? "recovery" : "normal"}
                                      </QueueBadge>
                                      <p className="queue-text queue-muted queue-small">
                                        {ticket.rejoinDeadlineAt
                                          ? priorityRecovery
                                            ? `Priority until ${formatDateTime(ticket.rejoinDeadlineAt)}`
                                            : `Recovery expired ${formatDateTime(ticket.rejoinDeadlineAt)}`
                                          : "No recovery deadline"}
                                      </p>
                                    </QueueTableCell>
                                    <QueueTableCell data-label="Action">
                                      <QueueButton
                                        variant="secondary"
                                        disabled={Boolean(
                                          busyAction === `restore-${ticket.id}` ||
                                          !ticket.lookupCode ||
                                          queueDayClosed ||
                                          queueDayPaused ||
                                          restoreBlockedByThreshold,
                                        )}
                                        onClick={async () => {
                                          const success = await runAction(
                                            `restore-${ticket.id}`,
                                            () =>
                                              vendorDashboardQueue.restoreSkippedTicket(
                                                token,
                                                selectedTenantSlug,
                                                ticket.id,
                                                locationQuery,
                                                ticket.lookupCode || "",
                                              ),
                                          );

                                          if (success) {
                                            showSuccessNotification(
                                              "Ticket restored",
                                              priorityRecovery
                                                ? "The skipped ticket was restored with recovery priority."
                                                : "The skipped ticket was restored at normal priority.",
                                            );
                                            setQueueView("current");
                                          }
                                        }}
                                      >
                                        Restore
                                      </QueueButton>
                                    </QueueTableCell>
                                  </QueueTableRow>
                                );
                              })
                            ) : (
                              <QueueTableRow>
                                <QueueTableCell colSpan={5}>
                                  <QueueEmptyState
                                    title="No skipped tickets to recover."
                                    text="Skipped tickets will appear here while they are still relevant for operator recovery."
                                  />
                                </QueueTableCell>
                              </QueueTableRow>
                            )}
                          </QueueTableBody>
                        </QueueTable>
                      </div>
                    </>
                  )}
                </div>
              </QueueCardContent>
            </QueueCard>
          </div>

          <div className="queue-page-column">
            <QueueCard>
              <QueueCardHeader>
                <QueueCardTitle>Customer self-service entry</QueueCardTitle>
              </QueueCardHeader>
              <QueueCardContent className="queue-stack">
                <div className="queue-stack">
                  <div className="queue-row queue-between">
                    <div>
                      <p className="vendor-eyebrow">QR and public links</p>
                    </div>
                    <div className="queue-row">
                      <a
                        className={queueButtonVariants({ variant: "outline" })}
                        href={queueLinks.monitorUrl || undefined}
                        aria-disabled={!queueLinks.monitorUrl || undefined}
                        tabIndex={queueLinks.monitorUrl ? undefined : -1}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open board
                      </a>
                      <QueueButton
                        variant="default"
                        disabled={Boolean(queueDayClosed || queueDayPaused || busyAction) || boardScannerBusy}
                        onClick={() => setWalkInDialogOpen(true)}
                      >
                        <IconUserPlus data-icon="inline-start" />
                        Add walk-in
                      </QueueButton>
                    </div>
                  </div>
                  <div className="queue-row">
                    <article className="queue-paper neura-qr-card queue-surface">
                      {queueLinks.qrUrl ? (
                        <div ref={queueQrRef}>
                          <StyledQRCode size={160} value={queueLinks.qrUrl} />
                        </div>
                      ) : (
                        <QueueQrUnavailable />
                      )}
                      <div className="queue-row">
                        <IconQrcode size={16} />
                        <p className="queue-text vendor-eyebrow">Join QR</p>
                      </div>
                      <QueueButton
                        variant="outline"
                        disabled={
                          Boolean(!queueLinks.qrUrl) || Boolean(savingQueueQr)
                        }
                        aria-busy={savingQueueQr}
                        className="queue-full-width"
                        onClick={() => void saveQueueQr()}
                      >
                        <IconDownload data-icon="inline-start" />
                        Save QR
                      </QueueButton>
                    </article>
                    <div className="queue-stack">
                      <QueueCopyField
                        label="Join URL"
                        onClick={() =>
                          void copyLocationUrl("Join URL", queueLinks.joinUrl)
                        }
                        value={queueLinks.joinUrl}
                      />
                      <QueueCopyField
                        label="QR target"
                        onClick={() =>
                          void copyLocationUrl("QR target", queueLinks.qrUrl)
                        }
                        value={queueLinks.qrUrl}
                      />
                      <QueueCopyField
                        label="Queue board URL"
                        onClick={() =>
                          void copyLocationUrl(
                            "Queue board URL",
                            queueLinks.monitorUrl,
                          )
                        }
                        value={queueLinks.monitorUrl}
                      />
                    </div>
                  </div>
                </div>
              </QueueCardContent>
            </QueueCard>
            {token && selectedTenantSlug && selectedLocationSlug ? (
              <QueueBoardScanner
                key={`${selectedTenantSlug}:${selectedLocationSlug}`}
                token={token}
                tenantSlug={selectedTenantSlug}
                locationSlug={selectedLocationSlug}
                onBusyChange={setBoardScannerBusy}
                onDiscard={() =>
                  unsavedForm.current.discardId("queue-board-pairing-form")
                }
              />
            ) : null}
          </div>
        </div>

        {(snapshot?.unfinishedServiceTiming || []).some(
          (record) =>
            !snapshot?.calledTickets?.some((ticket) => ticket.id === record.id),
        ) ? (
          <QueueCard>
            <QueueCardHeader>
              <QueueCardTitle>Unfinished service records</QueueCardTitle>
            </QueueCardHeader>
            <QueueCardContent className="queue-stack">
              <div className="queue-stack">
                <p className="queue-text queue-muted queue-small">
                  These services have a recorded start but no recorded end.
                  Closing a queue does not finish service. The oldest 100
                  unfinished records are shown. Resolving a record here preserves
                  its existing queue and booking outcome.
                </p>
                {(snapshot?.unfinishedServiceTiming || [])
                  .filter(
                    (record) =>
                      !snapshot?.calledTickets?.some(
                        (ticket) => ticket.id === record.id,
                      ),
                  )
                  .map((record) => (
                    <article
                      className="queue-paper queue-surface"
                      key={record.id}
                    >
                      <div className="queue-stack">
                        <p className="queue-text queue-strong">
                          {record.ticketNumber} · {record.status}
                        </p>
                        <p className="queue-text queue-small">
                          Started {formatDateTime(record.serviceStartedAt)}
                        </p>
                        <div className="queue-row">
                          {(["complete", "interrupt"] as const).map((action) => (
                            <QueueButton
                              variant="outline"
                              disabled={Boolean(busyAction)}
                              key={action}
                              onClick={() =>
                                setConfirmAction({
                                  title:
                                    action === "complete"
                                      ? "Record service completion?"
                                      : "Record interrupted service?",
                                  description:
                                    "The current time will be recorded as the service end. The existing queue and booking outcome will be preserved.",
                                  confirmLabel:
                                    action === "complete"
                                      ? "Record completion"
                                      : "Record interruption",
                                  confirmColor: "orange",
                                  onConfirm: async () => {
                                    await runAction(`service-${action}`, () =>
                                      vendorDashboardQueue.recordTicketService(
                                        token,
                                        selectedTenantSlug,
                                        locationQuery,
                                        record.id,
                                        action,
                                      ),
                                    );
                                  },
                                })
                              }
                            >
                              {action === "complete"
                                ? "Record completion"
                                : "Record interruption"}
                            </QueueButton>
                          ))}
                        </div>
                      </div>
                    </article>
                  ))}
              </div>
            </QueueCardContent>
          </QueueCard>
        ) : null}
      </div>
    );
  }

  function renderWalkInDialog() {
    const intakeUnavailable = queueDayClosed || queueDayPaused;
    return <WalkInDialog opened={walkInDialogOpen} busy={busyAction === "walk-in"} unavailable={intakeUnavailable} closed={queueDayClosed}
      form={walkInForm} options={ticketServiceOptionsQuery.data?.services || []} optionsLoading={ticketServiceOptionsQuery.isFetching} optionsError={ticketServiceOptionsQuery.isError}
      onChange={(change) => setWalkInForm((current) => ({ ...current, ...change }))} onClose={() => { unsavedForm.current.discardId("vendor-walk-in"); setWalkInDialogOpen(false); }} onSubmit={handleCreateWalkIn} />;
  }

  function renderThemePreview() {
    const previewLocation = themeLocation || selectedLocation;
    const selectedTenant = user?.tenants.find((tenant) => tenant.slug === selectedTenantSlug);
    const previewVendorName = settings.publicProfileDisplayName || snapshot?.tenant.name || selectedTenant?.name || "Public vendor";
    const previewLocationLabel = previewLocation
      ? [previewLocation.name, previewLocation.city, previewLocation.province].filter(Boolean).join(", ") ||
        previewLocation.country ||
        "Main location"
      : "Main location";
    const previewHoursLabel = formatPreviewHourRange(previewLocation, getDay(new Date()));
    const themeStyle = {
      "--vendor-theme-page-bg": themeForm.pageBackgroundColor,
      "--vendor-theme-card-bg": themeForm.cardBackgroundColor,
      "--vendor-theme-card-alpha": String(themeForm.cardAlpha),
      "--vendor-theme-card-border": themeForm.cardBorderColor,
      "--vendor-theme-header": themeForm.headerColor,
      "--vendor-theme-subheader": themeForm.subheaderColor,
      "--vendor-theme-body": themeForm.bodyColor,
      "--vendor-theme-button-bg": themeForm.buttonBackgroundColor,
      "--vendor-theme-button-text": themeForm.buttonTextColor,
      "--vendor-theme-button-border": themeForm.buttonBorderColor,
      "--vendor-theme-button-border-width": themeForm.presetId === "sports" ? "0px" : "1px",
      "--vendor-theme-logo-bg": themeForm.cardBackgroundColor,
      "--vendor-theme-logo-fit": themeForm.logoFit,
      ...(themeForm.logoFit === "cover" ? { "--vendor-theme-logo-frame-padding": "0px" } : {}),
      ...(themeForm.pageBackgroundImageUrl
        ? {
            "--vendor-theme-page-image": `url(${themeForm.pageBackgroundImageUrl})`,
            "--vendor-theme-page-image-position": "center",
            "--vendor-theme-page-image-repeat": "no-repeat",
            "--vendor-theme-page-image-size": themeForm.pageBackgroundImageFit
          }
        : {})
    } as CSSProperties;
    const themedMediaStyle: CSSProperties | undefined = themeForm.backgroundImageUrl
      ? {
          backgroundImage: `linear-gradient(rgba(255,255,255,0.08), rgba(255,255,255,0.08)), url(${themeForm.backgroundImageUrl})`,
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: themeForm.backgroundImageFit
        }
      : undefined;
    const heroQrTarget = previewLocation?.qrJoinUrl || "";

    return (
      <Stack className="vendor-profile-page" gap="xl" style={themeStyle}>
        <Paper className="vendor-hero-shell" p={{ base: "lg", md: "xl" }}>
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={{ base: "xl", lg: 48 }}>
            <Stack gap="lg" justify="center">
              <div>
                <Group gap="sm" wrap="wrap">
                  <Badge className="vendor-theme-badge vendor-theme-badge-primary" size="lg" variant="light">
                    Generic Service Business
                  </Badge>
                </Group>
                <Stack gap="sm" mt="md">
                  <Title className="vendor-hero-title" order={1}>
                    {previewVendorName}
                  </Title>
                  {settings.publicProfileDescription ? <RichCampaignDescription className="vendor-hero-description" content={settings.publicProfileDescription} /> : null}
                </Stack>
              </div>

              <Stack gap="xs">
                <Group c="dimmed" gap={8} wrap="nowrap">
                  <IconMapPin size={18} />
                  <Text>{previewLocationLabel}</Text>
                </Group>
                <Group c="dimmed" gap={8} wrap="nowrap">
                  <IconClock size={18} />
                  <Text>{previewHoursLabel}</Text>
                </Group>
              </Stack>

              <Group gap="md">
                <Button
                  className="vendor-theme-button"
                  leftSection={<IconTicket size={18} />}
                  size="lg"
                >
                  Join queue
                </Button>
                <Button className="vendor-theme-button vendor-theme-button-outline" size="lg" variant="outline">
                  Start booking
                </Button>
                <Button className="vendor-theme-button vendor-theme-button-ghost" size="lg" variant="subtle">
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
                <div className="vendor-hero-media-slide vendor-hero-media-slide-logo is-active">
                  {themeForm.logoUrl ? (
                    <div className="vendor-profile-logo-frame">
                      <img alt={`${previewVendorName} logo`} src={themeForm.logoUrl} />
                    </div>
                  ) : (
                    <div className="vendor-empty-art" aria-label="Vendor image placeholder" role="img">
                      <IconPhoto size={42} stroke={1.5} />
                      <Text c="dimmed" fw={700} mt="sm" size="sm">
                        Vendor image placeholder
                      </Text>
                    </div>
                  )}
                </div>

                <div className="vendor-hero-media-slide vendor-hero-media-slide-qr">
                  <div className="vendor-hero-qr-panel">
                    <div className="vendor-hero-qr-code">
                      {heroQrTarget ? (
                        <StyledQRCode aria-label="Join queue QR code preview" value={heroQrTarget} />
                      ) : (
                        <QueueQrUnavailable />
                      )}
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
                  {previewLocation ? `${previewLocation.name} • ${previewHoursLabel}` : "Choose a branch to continue."}
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
      </Stack>
    );
  }

  function renderThemeDialog() {
    const activePreset = publicBoardThemePresets[themeForm.presetId] || defaultPublicBoardTheme;
    const presetBackgroundImageUrl = activePreset.pageBackgroundImageUrl;
    const presetBackgroundEnabled = Boolean(
      presetBackgroundImageUrl && themeForm.pageBackgroundImageUrl === presetBackgroundImageUrl
    );

    return (
      <Modal
        centered
        className="theme-editor-modal"
        opened={themeDialogOpen}
        onClose={() => setThemeDialogOpen(false)}
        size="xl"
        title={
          <Stack className="getprio-modal-title" gap={2}>
            <Text className="getprio-modal-eyebrow">PUBLIC BOARD</Text>
            <Text className="getprio-modal-heading">
              {`Setup theme${themeLocation ? `: ${themeLocation.name}` : ""}`}
            </Text>
          </Stack>
        }
      >
        <div className="theme-editor-modal__shell">
          <div className="theme-editor-layout theme-editor-modal__main">
          <div className="theme-editor-modal__editor">
            <Stack gap="md">
              <ModalSection
                title="Preset"
                description="Choose the role-based visual system used as the starting point for this public vendor page."
              >
                <Select
                  label="Theme preset"
                  description="Changing this updates colors, button styling, and any built-in preset background."
                  data={[
                    { value: "generic", label: "Generic" },
                    { value: "sports", label: "Sports and Recreation" },
                    { value: "wellness", label: "Health and Wellness" },
                    { value: "retail", label: "Retail and E-commerce" },
                    { value: "food", label: "Food and Beverage" }
                  ]}
                  value={themeForm.presetId}
                  onChange={(value) => value && applyThemePreset(value)}
                />
              </ModalSection>

              <ModalSection
                title="Page background"
                description="Controls the full-page artwork behind the public vendor profile."
              >
                <Checkbox
                  checked={presetBackgroundEnabled}
                  disabled={!presetBackgroundImageUrl}
                  label="Use preset background image"
                  description={
                    presetBackgroundImageUrl
                      ? "Uses the built-in page artwork for this preset. Untick to hide the preset artwork."
                      : "This preset does not include a built-in background image."
                  }
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setThemeForm((current) => ({
                      ...current,
                      pageBackgroundImageUrl: checked ? presetBackgroundImageUrl : "",
                      pageBackgroundImageFit: checked ? activePreset.pageBackgroundImageFit : current.pageBackgroundImageFit
                    }));
                  }}
                />
                <Select
                  name="pageBackgroundImageFit"
                  label="Page background fit"
                  description="Cover fills the page. Contain shows the full preset artwork."
                  data={[
                    { value: "cover", label: "Cover" },
                    { value: "contain", label: "Contain" }
                  ]}
                  disabled={!themeForm.pageBackgroundImageUrl}
                  value={themeForm.pageBackgroundImageFit}
                  onChange={(value) => setThemeField("pageBackgroundImageFit", value === "contain" ? "contain" : "cover")}
                />
                <SimpleGrid cols={1}>
                  <FileInput
                    name="pageBackgroundImageFile"
                    accept="image/png,image/jpeg,image/webp"
                    clearable
                    label="Page background"
                    description="Upload a custom full-page background when preset background is disabled."
                    disabled={presetBackgroundEnabled || busyAction === "theme-upload:background"}
                    onChange={(file) => uploadThemeAsset("background", file, "pageBackgroundImageUrl")}
                  />
                  <TextInput
                    name="pageBackgroundImageUrl"
                    label="Page background URL"
                    description="Paste a hosted full-page background URL."
                    disabled={presetBackgroundEnabled}
                    value={themeForm.pageBackgroundImageUrl}
                    onChange={(event) => setThemeField("pageBackgroundImageUrl", event.target.value)}
                  />
                </SimpleGrid>
              </ModalSection>

              <ModalSection
                title="Profile media"
                description="Set the profile logo and hero background shown inside the public vendor hero."
              >
                <SimpleGrid cols={1}>
                  <FileInput
                    name="backgroundImageFile"
                    accept="image/png,image/jpeg,image/webp"
                    clearable
                    label="Profile background"
                    description="Upload a custom image for the hero visual area."
                    disabled={busyAction === "theme-upload:background"}
                    onChange={(file) => uploadThemeAsset("background", file)}
                  />
                  <Select
                    name="backgroundImageFit"
                    label="Profile background fit"
                    description="Cover fills the hero. Contain shows the full image."
                    data={[
                      { value: "cover", label: "Cover" },
                      { value: "contain", label: "Contain" }
                    ]}
                    value={themeForm.backgroundImageFit}
                    onChange={(value) => setThemeField("backgroundImageFit", value === "contain" ? "contain" : "cover")}
                  />
                </SimpleGrid>
                <SimpleGrid cols={1}>
                  <TextInput
                    name="backgroundImageUrl"
                    label="Profile background URL"
                    description="Paste a hosted image URL for the hero visual area."
                    value={themeForm.backgroundImageUrl}
                    onChange={(event) => setThemeField("backgroundImageUrl", event.target.value)}
                  />
                  <FileInput
                    name="logoFile"
                    accept="image/png,image/jpeg,image/webp"
                    clearable
                    label="Company logo"
                    description="Displayed inside the circular logo frame."
                    disabled={busyAction === "theme-upload:logo"}
                    onChange={(file) => uploadThemeAsset("logo", file)}
                  />
                </SimpleGrid>
                <SimpleGrid cols={1}>
                  <TextInput
                    name="logoUrl"
                    label="Logo URL"
                    description="Paste a hosted logo URL when not uploading a file."
                    value={themeForm.logoUrl}
                    onChange={(event) => setThemeField("logoUrl", event.target.value)}
                  />
                  <Select
                    name="logoFit"
                    label="Profile logo fit"
                    description="Contain shows the full logo. Cover fills the circular frame."
                    data={[
                      { value: "contain", label: "Contain" },
                      { value: "cover", label: "Cover" }
                    ]}
                    value={themeForm.logoFit}
                    onChange={(value) => setThemeField("logoFit", value === "cover" ? "cover" : "contain")}
                  />
                </SimpleGrid>
              </ModalSection>

              <ModalSection
                title="Colors"
                description="Tune text, page, and action colors used across the public vendor page and preview states."
              >
                <SimpleGrid cols={1}>
                  <ColorInput name="pageBackgroundColor" label="Page background" value={themeForm.pageBackgroundColor} onChange={(value) => setThemeField("pageBackgroundColor", value)} />
                  <ColorInput name="headerColor" label="Heading text" value={themeForm.headerColor} onChange={(value) => setThemeField("headerColor", value)} />
                  <ColorInput name="subheaderColor" label="Accent text" value={themeForm.subheaderColor} onChange={(value) => setThemeField("subheaderColor", value)} />
                  <ColorInput name="bodyColor" label="Body text" value={themeForm.bodyColor} onChange={(value) => setThemeField("bodyColor", value)} />
                  <ColorInput name="buttonBackgroundColor" label="Button background" value={themeForm.buttonBackgroundColor} onChange={(value) => setThemeField("buttonBackgroundColor", value)} />
                  <ColorInput name="buttonTextColor" label="Button text" value={themeForm.buttonTextColor} onChange={(value) => setThemeField("buttonTextColor", value)} />
                </SimpleGrid>
              </ModalSection>

              <ModalSection
                title="Cards and borders"
                description="Controls the surfaces used by the hero, service cards, branch cards, and status panels."
              >
                <SimpleGrid cols={1}>
                  <ColorInput name="cardBackgroundColor" label="Card background" value={themeForm.cardBackgroundColor} onChange={(value) => setThemeField("cardBackgroundColor", value)} />
                  <ColorInput name="cardBorderColor" label="Card border" value={themeForm.cardBorderColor} onChange={(value) => setThemeField("cardBorderColor", value)} />
                  <NumberInput name="cardBorderSize" label="Border size" min={0} max={12} value={themeForm.cardBorderSize} onChange={(value) => setThemeField("cardBorderSize", Number(value) || 0)} />
                  <NumberInput name="cardBorderRadius" label="Border radius" min={0} max={48} value={themeForm.cardBorderRadius} onChange={(value) => setThemeField("cardBorderRadius", Number(value) || 0)} />
                </SimpleGrid>
                <div>
                  <Text size="sm" fw={600}>Card opacity</Text>
                  <Slider
                    min={0.15}
                    max={1}
                    step={0.05}
                    value={themeForm.cardAlpha}
                    onChange={(value) => setThemeField("cardAlpha", value)}
                  />
                </div>
              </ModalSection>
              <Checkbox
                name="applyThemeToAllLocations"
                checked={applyThemeToAllLocations}
                label="Apply to all current and future locations"
                onChange={(event) => setApplyThemeToAllLocations(event.target.checked)}
              />
            </Stack>
          </div>
          {renderThemePreview()}
          </div>
          <Group justify="flex-end" className="service-dialog__footer theme-editor-modal__footer">
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
        </div>
      </Modal>
    );
  }

  function openLocationDialog(locationItem?: StoreLocationWithHours) {
    setError("");
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
        imageUrl: locationItem.imageUrl || "",
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
        paymentBankName: locationItem.paymentBankName,
        paymentAccountDisplayName: locationItem.paymentAccountDisplayName,
        paymentAccountIdentifierDisplay: locationItem.paymentAccountIdentifierDisplay,
        paymentQrImageUrl: locationItem.paymentQrImageUrl,
        paymentQrActive: locationItem.paymentQrActive,
        customerSelfCheckInEnabled: locationItem.customerSelfCheckInEnabled === true,
        serviceTimingEnabled: locationItem.serviceTimingEnabled === true,
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
      setLocationForm({ ...emptyLocationForm, timezone: platformDefaultTimezone });
    }

    setLocationDialogOpen(true);
  }

  useEffect(() => {
    if (!locationDialogOpen || editingLocationSlug || locationSlugManuallyEdited) {
      return;
    }

    const nextSlug = buildLocationSlug(locationForm.name);
    setLocationForm((current) => ({ ...current, slug: nextSlug }));
  }, [editingLocationSlug, locationDialogOpen, locationForm.name, locationSlugManuallyEdited]);

  useEffect(() => {
    if (!locationDialogOpen) {
      return undefined;
    }

    if (editingLocationSlug) {
      setLocationSlugAvailable(true);
      setLocationSlugMessage("");
      setCheckingLocationSlug(false);
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
  }, [editingLocationId, editingLocationSlug, locationDialogOpen, locationForm.slug, selectedTenantSlug, token]);

  async function saveLocation() {
    setBusyAction("location");
    setError("");

    try {
      if (!editingLocationSlug && !locationSlugAvailable) {
        setError(locationSlugMessage || "Choose an available location slug before saving.");
        return;
      }
      const payload = {
        name: locationForm.name,
        ...(!editingLocationSlug ? { slug: locationForm.slug } : {}),
        imageUrl: locationForm.imageUrl,
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
        paymentBankName: locationForm.paymentBankName,
        paymentAccountDisplayName: locationForm.paymentAccountDisplayName,
        paymentAccountIdentifierDisplay: locationForm.paymentAccountIdentifierDisplay,
        paymentQrImageUrl: locationForm.paymentQrImageUrl,
        paymentQrActive: locationForm.paymentQrActive,
        customerSelfCheckInEnabled: locationForm.customerSelfCheckInEnabled,
        serviceTimingEnabled: locationForm.serviceTimingEnabled,
        isPrimary: locationForm.isPrimary,
        isActive: locationForm.isActive
      };
      const locationResponse = await vendorDashboardOperations.saveLocation(
        token,
        selectedTenantSlug,
        editingLocationSlug || null,
        payload
      );

      // Keep the server-created target if the separate hours write needs a retry.
      setEditingLocationSlug(locationResponse.location.slug);
      setEditingLocationId(locationResponse.location.id);
      setLocationSlugManuallyEdited(true);
      setLocationForm(current=>({...current,slug:locationResponse.location.slug}));

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
      setSnapshot((current) => current && current.location?.id === hoursResponse.location.id
        ? { ...current, location: hoursResponse.location }
        : current);
      await queryClient.invalidateQueries({ queryKey: ["vendor-dashboard-queue-lifecycle", token, selectedTenantSlug] });
      setSelectedLocationSlug(hoursResponse.location.slug);
      unsavedForm.current.discardId("vendor-location-editor");
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

  function selectConfigurationLocation(slug: string) {
    if (slug === selectedLocationSlug || !canLeaveFeature()) return;
    setSnapshot(null);
    setServiceCounters([]);
    setVendorBookings([]);
    setBookingPagination(null);
    setClients(null);
    setHistory(null);
    setBookingDetailOpen(false);
    setBookingDetailBooking(null);
    setBookingDetailModalId(null);
    setSelectedCounterSlug("");
    setAvailabilityBlocks([]);
    setAvailabilityExceptions([]);
    setAvailabilitySummary(null);
    setSelectedLocationSlug(slug);
  }
  function renderTenantsPage() {
    const admin = isOwner || isAdmin;
    return (
      <ConfigurationScope
        busy={Boolean(busyAction)}
        onEdit={(form) => unsavedForm.current.mark(form)}
      >
        <ConfigTabs
          value={
            locationsTab === "resources" && !admin ? "locations" : locationsTab
          }
          onValueChange={(value) => {
            if (!busyAction && !resourceConfigurationBusy)
              setLocationsTab(String(value));
          }}
        >
          <ConfigTabsList
            activateOnFocus
            aria-label="Location settings"
            className="config-tabs-list"
          >
            <ConfigTabsTrigger
              disabled={Boolean(busyAction) || resourceConfigurationBusy}
              value="locations"
            >
              Locations
            </ConfigTabsTrigger>
            {admin ? (
              <ConfigTabsTrigger
                disabled={Boolean(busyAction) || resourceConfigurationBusy}
                value="resources"
              >
                Resources
              </ConfigTabsTrigger>
            ) : null}
            <ConfigTabsTrigger
              disabled={Boolean(busyAction) || resourceConfigurationBusy}
              value="counters"
            >
              Counters
            </ConfigTabsTrigger>
          </ConfigTabsList>
          {error && !locationDialogOpen && !counterDialogOpen ? (
            <OperationAlert color="red" title="Unable to complete the action">
              {error}
            </OperationAlert>
          ) : null}
          <ConfigTabsContent value="locations" keepMounted>
            <div className="ops-stack">
              <div className="ops-row ops-between">
                <div>
                  <h2 className="ops-heading">Store locations</h2>
                  <p className="ops-muted">
                    {locations.filter((item) => item.isActive).length} of{" "}
                    {activeLocationLimit} active locations allowed
                  </p>
                </div>
                <OperationButton
                  disabled={
                    !admin ||
                    dashboardBootstrapQuery.isPending ||
                    dashboardBootstrapQuery.isError
                  }
                  onClick={() => openLocationDialog()}
                >
                  Add location
                </OperationButton>
              </div>
              {dashboardBootstrapQuery.isPending ||
              dashboardBootstrapQuery.isError ? (
                <OperationQueryState
                  loading={dashboardBootstrapQuery.isPending}
                  error={dashboardBootstrapQuery.error}
                  onRetry={() => void retryDashboardContext()}
                />
              ) : (
                <>
                  {!locations.length ? (
                    <OperationEmpty
                      title="No locations yet"
                      text="Add a location to set its hours and manage its queue."
                    />
                  ) : null}
                  <div className="ops-grid ops-grid-2">
                    {locations.map((item) => (
                      <OperationPanel key={item.id}>
                        <div className="ops-stack">
                          <div className="ops-row ops-between">
                            <div>
                              <h3 className="ops-heading">{item.name}</h3>
                              <p className="ops-muted">
                                {[item.addressLine1, item.city, item.province]
                                  .filter(Boolean)
                                  .join(", ") || `/${item.slug}`}
                              </p>
                            </div>
                            <div className="ops-row config-statuses">
                              {item.isPrimary ? (
                                <QueueBadge variant="secondary">
                                  Primary
                                </QueueBadge>
                              ) : null}
                              <QueueBadge
                                variant={
                                  item.isActive && item.openStatus.isOpen
                                    ? "secondary"
                                    : "outline"
                                }
                              >
                                {item.isActive && item.openStatus.isOpen
                                  ? "Open"
                                  : "Closed"}
                              </QueueBadge>
                              {item.paymentQrActive ? (
                                <QueueBadge variant="outline">
                                  Manual payment
                                </QueueBadge>
                              ) : null}
                            </div>
                          </div>
                          <p className="ops-muted">
                            {item.timezone} · Today
                            {item.openStatus.today
                              ? `, ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][item.openStatus.today.weekday]}`
                              : ""}{" "}
                            · {formatStoreHourRange(item.openStatus.today)}
                          </p>
                          {item.paymentQrActive ? (
                            <p className="ops-muted">
                              {item.paymentMethodLabel} ·{" "}
                              {item.paymentAccountDisplayName}
                            </p>
                          ) : null}
                          <ConfigurationCheck
                            checked={item.isActive}
                            disabled={!admin}
                            label={
                              item.isActive
                                ? "Location enabled"
                                : "Location disabled"
                            }
                            onChange={(event) =>
                              void handleToggleLocationActive(
                                item,
                                event.currentTarget.checked,
                              )
                            }
                          />
                          <div className="ops-stack">
                            <QueueCopyField
                              label="Join URL"
                              value={item.joinUrl}
                              onClick={() =>
                                void copyLocationUrl("Join URL", item.joinUrl)
                              }
                            />
                            <QueueCopyField
                              label="Mobile queue QR target"
                              value={item.qrJoinUrl || item.joinUrl}
                              onClick={() =>
                                void copyLocationUrl(
                                  "QR target",
                                  item.qrJoinUrl || item.joinUrl,
                                )
                              }
                            />
                            <QueueCopyField
                              label="Queue board URL"
                              value={item.monitorUrl}
                              onClick={() =>
                                void copyLocationUrl(
                                  "Queue board URL",
                                  item.monitorUrl,
                                )
                              }
                            />
                          </div>
                          <div className="ops-row config-actions">
                            <OperationButton
                              variant="outline"
                              loading={
                                busyAction === `location-qr:${item.slug}`
                              }
                              onClick={() =>
                                void handleRegenerateLocationQueueQr(item)
                              }
                            >
                              Regenerate queue QR
                            </OperationButton>
                            <OperationButton
                              variant="outline"
                              disabled={item.slug === selectedLocationSlug}
                              onClick={() =>
                                selectConfigurationLocation(item.slug)
                              }
                            >
                              {item.slug === selectedLocationSlug
                                ? "Selected location"
                                : "Select location"}
                            </OperationButton>
                            <OperationButton
                              variant="outline"
                              onClick={() => openLocationDialog(item)}
                              aria-label={`Edit ${item.name} location`}
                            >
                              Edit location
                            </OperationButton>
                            {effectiveEntitlements?.brandedQueuePages ? (
                              <OperationButton
                                variant="outline"
                                onClick={() => openThemeDialog(item)}
                              >
                                Set up theme
                              </OperationButton>
                            ) : null}
                          </div>
                        </div>
                      </OperationPanel>
                    ))}
                  </div>
                </>
              )}
            </div>
          </ConfigTabsContent>
          <ConfigTabsContent value="resources" keepMounted>
            {token && selectedTenantSlug && selectedLocationSlug && admin ? (
              <VendorResourceConfiguration
                key={`${selectedTenantSlug}:${selectedLocationSlug}`}
                token={token}
                tenantSlug={selectedTenantSlug}
                locationSlug={selectedLocationSlug}
                locationName={selectedLocation?.name || selectedLocationSlug}
                onBusyChange={setResourceConfigurationBusy}
                onDialogChange={setResourceConfigurationDialogOpen}
                onDiscard={(id) => unsavedForm.current.discardId(id)}
              />
            ) : (
              <OperationEmpty
                title="Select a location"
                text="Choose a location to configure its resource pools and service requirements."
              />
            )}
          </ConfigTabsContent>
          <ConfigTabsContent value="counters" keepMounted>
            <div className="ops-stack">
              <div className="ops-row ops-between">
                <div>
                  <h2 className="ops-heading">Service counters</h2>
                  <p className="ops-muted">
                    {selectedLocation?.name || "Select a location"} ·{" "}
                    {serviceCounters.length} of {counterLimit} counters allowed
                  </p>
                </div>
                <OperationButton
                  disabled={
                    !admin ||
                    !selectedLocation ||
                    countersQuery.isPending ||
                    countersQuery.isError ||
                    serviceCounters.length >= counterLimit
                  }
                  onClick={() => openCounterDialog()}
                >
                  Add counter
                </OperationButton>
              </div>
              {!selectedLocation ? (
                <OperationEmpty
                  title="Select a location"
                  text="Counters belong to a location. Select one to manage its dispatch lanes."
                />
              ) : countersQuery.isPending || countersQuery.isError ? (
                <OperationQueryState
                  loading={countersQuery.isPending}
                  error={countersQuery.error}
                  onRetry={() => void countersQuery.refetch()}
                />
              ) : (
                <>
                  {!serviceCounters.length ? (
                    <OperationEmpty
                      title="No counters yet"
                      text="Add a counter and assign the staff who can serve its queue."
                    />
                  ) : null}
                  <div className="ops-grid ops-grid-3">
                    {serviceCounters.map((counter) => (
                      <OperationPanel key={counter.id}>
                        <div className="ops-stack">
                          <div>
                            <h3 className="ops-heading">{counter.name}</h3>
                            <p className="ops-muted">/{counter.slug}</p>
                          </div>
                          <ConfigurationCheck
                            checked={counter.isActive}
                            label={
                              counter.isActive
                                ? "Counter enabled"
                                : "Counter disabled"
                            }
                            disabled={!admin}
                            onChange={(event) =>
                              void handleToggleCounterActive(
                                counter,
                                event.currentTarget.checked,
                              )
                            }
                          />
                          <div>
                            <p className="ops-strong">Assigned staff</p>
                            <p className="ops-muted">
                              {counter.assignedUserIds
                                .map(
                                  (id) =>
                                    staff.find((member) => member.id === id)
                                      ?.name || "Unavailable staff member",
                                )
                                .join(", ") || "No staff assigned"}
                            </p>
                          </div>
                          <div className="ops-row config-actions">
                            <OperationButton
                              variant="outline"
                              onClick={() => openCounterDialog(counter)}
                              aria-label={`Edit ${counter.name} counter`}
                            >
                              Edit counter
                            </OperationButton>
                            <OperationButton
                              variant="destructive"
                              onClick={() =>
                                openConfirmAction({
                                  title: "Remove counter?",
                                  description:
                                    "This permanently removes the counter from this location. Existing called work remains recorded.",
                                  confirmLabel: "Remove counter",
                                  confirmColor: "red",
                                  onConfirm: async () => {
                                    await handleDeleteCounter(counter);
                                  },
                                })
                              }
                            >
                              Remove counter
                            </OperationButton>
                          </div>
                        </div>
                      </OperationPanel>
                    ))}
                  </div>
                </>
              )}
            </div>
          </ConfigTabsContent>
        </ConfigTabs>
      </ConfigurationScope>
    );
  }

  function renderServiceDialog() {
    const close = () => {
      if (canLeaveFeature()) {
        unsavedForm.current.discardId("vendor-service-editor");
        setServiceDialogOpen(false);
      }
    };
    return (
      <TaskDialog
        opened={serviceDialogOpen}
        onClose={close}
        busy={Boolean(busyAction)}
        eyebrow="SERVICE"
        title={
          editingServiceSlug
            ? `Edit ${serviceForm.name || "service"}`
            : "Add a service"
        }
        description="Set the duration, price and branches where customers can book this service."
        footer={
          <>
            <OperationButton
              variant="outline"
              className="ops-redundant-dismiss"
              disabled={Boolean(busyAction)}
              onClick={close}
            >
              Cancel
            </OperationButton>
            <OperationButton
              type="submit"
              form="vendor-service-editor"
              disabled={
                Boolean(busyAction) ||
                checkingServiceSlug ||
                !serviceSlugAvailable
              }
              aria-busy={Boolean(busyAction)}
            >
              {busyAction ? "Working…" : "Save service"}
            </OperationButton>
          </>
        }
      >
        <ConfigurationScope
          busy={Boolean(busyAction)}
          onEdit={(form) => unsavedForm.current.mark(form)}
        >
          <form id="vendor-service-editor" onSubmit={handleSaveService}>
            <FieldGroup>
              {error ? (
                <OperationAlert color="red" title="Unable to save">
                  {error}
                </OperationAlert>
              ) : null}
              <FieldGroup className="config-related-fields">
                <ConfigurationSection
                  title="Name, image, and duration"
                  description=""
                >
                  <ConfigurationFile
                    accept="image/png,image/jpeg,image/webp"
                    label="Service image"
                    placeholder={
                      serviceForm.imageUrl
                        ? "Replace service image"
                        : "Upload service image"
                    }
                    disabled={busyAction === "service-image-upload"}
                    onChange={(file) => uploadServiceImage(file)}
                  />
                  <ConfigurationInput
                    label="Image link (optional)"
                    description="Paste an image link, or upload an image above."
                    value={serviceForm.imageUrl || ""}
                    onChange={(event) =>
                      setServiceForm((current) => ({
                        ...current,
                        imageUrl: event.target.value,
                      }))
                    }
                  />
                  {serviceForm.imageUrl ? (
                    <img
                      className="config-image"
                      alt="Service preview"
                      src={serviceForm.imageUrl}
                    />
                  ) : null}
                  <ConfigurationInput
                    label="Service name"
                    required
                    value={serviceForm.name}
                    onChange={(event) => {
                      const nextName = event.target.value;
                      setServiceForm((current) => ({
                        ...current,
                        name: nextName,
                        slug: serviceSlugManuallyEdited
                          ? current.slug
                          : buildServiceSlug(nextName),
                      }));
                    }}
                  />
                  <ConfigurationInput
                    label="Booking link name"
                    description={
                      checkingServiceSlug
                        ? "Checking link availability..."
                        : serviceSlugMessage ||
                          "Used in this service’s booking link. Created from the service name; changing it changes the link."
                    }
                    error={
                      !checkingServiceSlug &&
                      !serviceSlugAvailable &&
                      serviceForm.slug &&
                      serviceSlugMessage
                        ? serviceSlugMessage
                        : undefined
                    }
                    value={serviceForm.slug || ""}
                    onChange={(event) => {
                      setServiceSlugManuallyEdited(true);
                      setServiceForm((current) => ({
                        ...current,
                        slug: buildServiceSlug(event.target.value),
                      }));
                    }}
                  />
                  <ConfigurationNumber
                    label={
                      serviceForm.allowBookingQuantity
                        ? "Duration per unit (minutes)"
                        : "Service duration (minutes)"
                    }
                    description={
                      serviceForm.allowBookingQuantity
                        ? "Time reserved for a quantity of 1."
                        : "Time reserved for one booking."
                    }
                    min={5}
                    max={480}
                    required
                    value={serviceForm.durationMinutes}
                    onChange={(value) =>
                      setServiceForm((current) => ({
                        ...current,
                        durationMinutes: Number(value) || 30,
                      }))
                    }
                  />
                  <ConfigurationNumber
                    label="List order"
                    description="Lower numbers appear first in your service list."
                    value={serviceForm.sortOrder || 0}
                    onChange={(value) =>
                      setServiceForm((current) => ({
                        ...current,
                        sortOrder: Number(value) || 0,
                      }))
                    }
                  />
                </ConfigurationSection>

                <ConfigurationSection
                  title="Price, payment, and quantity"
                  description=""
                >
                  <ConfigurationNumber
                    step={0.01}
                    label={
                      serviceForm.allowBookingQuantity
                        ? "Price per unit (PHP)"
                        : "Service price (PHP)"
                    }
                    min={0}
                    value={(serviceForm.priceAmountCents || 0) / 100}
                    onChange={(value) =>
                      setServiceForm((current) => ({
                        ...current,
                        priceAmountCents: Math.max(
                          0,
                          Math.round((Number(value) || 0) * 100),
                        ),
                      }))
                    }
                  />
                  <ConfigurationInput
                    label="Price text shown to customers (optional)"
                    description="Use custom text instead of the formatted price. The booking total uses the price above, or the branch price below."
                    placeholder="For example, PHP 500 per session"
                    value={serviceForm.priceDisplay || ""}
                    onChange={(event) =>
                      setServiceForm((current) => ({
                        ...current,
                        priceDisplay: event.target.value,
                      }))
                    }
                  />
                  <ConfigurationCheck
                    checked={serviceForm.manualPaymentRequired === true}
                    label="Require proof of payment"
                    description="Customers pay separately, then submit a receipt and payment reference. Review their payment before confirming the booking."
                    onChange={(event) =>
                      setServiceForm((current) => ({
                        ...current,
                        manualPaymentRequired: event.currentTarget.checked,
                      }))
                    }
                  />
                  <ConfigurationCheck
                    checked={serviceForm.allowBookingQuantity === true}
                    label="Allow quantity input"
                    description={`Let customers choose a quantity. Each unit adds ${serviceForm.durationMinutes} minutes and the unit price to the booking. A quantity of 2 doubles the time and price.`}
                    onChange={(event) => {
                      const enabled = event.currentTarget.checked;
                      setServiceForm((current) => ({
                        ...current,
                        ...quantityInputChanges(
                          {
                            bookingQuantityLabel:
                              current.bookingQuantityLabel || "Units",
                          },
                          enabled,
                        ),
                      }));
                    }}
                  />
                  {serviceForm.allowBookingQuantity ? (
                    <DurationUnitControls
                      durationMinutes={serviceForm.durationMinutes}
                      value={serviceForm}
                      onChange={(changes) =>
                        setServiceForm((current) => ({ ...current, ...changes }))
                      }
                    />
                  ) : null}
                  <ConfigurationSelect
                    data={[
                      {
                        value: "service",
                        label: "Only this service",
                      },
                      {
                        value: "location",
                        label: "All services at the branch",
                      },
                    ]}
                    label="Booking limit applies to"
                    description="Choose which services count toward the booking limit. Weekly schedules covering all services always share one limit."
                    value={serviceForm.bookingCapacityScope || "service"}
                    onChange={(value) =>
                      setServiceForm((current) => ({
                        ...current,
                        bookingCapacityScope:
                          value === "location" ? "location" : "service",
                      }))
                    }
                  />
                  <QueueSeparator />
                  <div>
                    <p className="ops-muted">Branches offering this service</p>
                    <p className="ops-muted">
                      Turn on each branch where customers can book this service.
                      Set how many service bookings can run at the same time.
                    </p>
                  </div>
                  {(serviceForm.locationServices || []).map(
                    (assignment, index) => (
                      <FieldGroup
                        className="config-branch-assignment"
                        key={assignment.locationSlug}
                      >
                        <ConfigurationCheck
                          label={
                            locations.find(
                              (location) =>
                                location.slug === assignment.locationSlug,
                            )?.name || assignment.locationSlug
                          }
                          checked={assignment.isActive !== false}
                          onChange={(event) => {
                            const isActive = event.currentTarget.checked;
                            setServiceForm((current) => ({
                              ...current,
                              locationServices: current.locationServices?.map(
                                (entry, entryIndex) =>
                                  entryIndex === index
                                    ? { ...entry, isActive }
                                    : entry,
                              ),
                            }));
                          }}
                        />
                        <ConfigurationNumber
                          label={`${locations.find((location) => location.slug === assignment.locationSlug)?.name || assignment.locationSlug} bookings allowed at the same time`}
                          description="Counts service bookings, rather than the number of guests."
                          min={1}
                          max={100}
                          disabled={assignment.isActive === false}
                          value={assignment.capacity}
                          onChange={(value) =>
                            setServiceForm((current) => ({
                              ...current,
                              locationServices: current.locationServices?.map(
                                (entry, entryIndex) =>
                                  entryIndex === index
                                    ? { ...entry, capacity: Number(value) || 1 }
                                    : entry,
                              ),
                            }))
                          }
                        />
                        <ConfigurationNumber
                          step={0.01}
                          label="Price at this branch (PHP, optional)"
                          description="Leave blank to use the service price above."
                          min={0}
                          disabled={assignment.isActive === false}
                          value={
                            assignment.priceAmountCents == null
                              ? ""
                              : assignment.priceAmountCents / 100
                          }
                          onChange={(value) =>
                            setServiceForm((current) => ({
                              ...current,
                              locationServices: current.locationServices?.map(
                                (entry, entryIndex) =>
                                  entryIndex === index
                                    ? {
                                        ...entry,
                                        priceAmountCents:
                                          value === ""
                                            ? null
                                            : Math.max(
                                                0,
                                                Math.round(
                                                  (Number(value) || 0) * 100,
                                                ),
                                              ),
                                      }
                                    : entry,
                              ),
                            }))
                          }
                        />
                        <ConfigurationInput
                          label="Price text for this branch (optional)"
                          description="Custom text shown to customers at this branch. It does not change the amount charged."
                          disabled={assignment.isActive === false}
                          value={assignment.priceDisplay || ""}
                          onChange={(event) => {
                            const priceDisplay = event.currentTarget.value;
                            setServiceForm((current) => ({
                              ...current,
                              locationServices: current.locationServices?.map(
                                (entry, entryIndex) =>
                                  entryIndex === index
                                    ? { ...entry, priceDisplay }
                                    : entry,
                              ),
                            }));
                          }}
                        />
                      </FieldGroup>
                    ),
                  )}
                  <p className="ops-muted">
                    If a weekly schedule or special date allows more bookings at
                    the same time, the higher limit applies.
                  </p>
                </ConfigurationSection>
              </FieldGroup>

              <ConfigurationSection
                title="Description and availability"
                description=""
              >
                <ConfigurationTextarea
                  label="Service description"
                  description="Tell customers what is included and what they should know before booking."
                  value={serviceForm.description || ""}
                  onChange={(event) =>
                    setServiceForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
                <ConfigurationCheck
                  checked={serviceForm.isActive !== false}
                  label="Offer this service for booking"
                  description="Turn off to stop new bookings. Existing bookings stay in your records."
                  onChange={(event) =>
                    setServiceForm((current) => ({
                      ...current,
                      isActive: event.currentTarget.checked,
                    }))
                  }
                />
              </ConfigurationSection>
            </FieldGroup>
          </form>
        </ConfigurationScope>
      </TaskDialog>
    );
  }

  function renderAvailabilityBlockDialog() {
    const close = () => {
      if (canLeaveFeature()) {
        unsavedForm.current.discardId("vendor-weekly-editor");
        setAvailabilityBlockDialogOpen(false);
      }
    };
    return (
      <TaskDialog
        opened={availabilityBlockDialogOpen}
        onClose={close}
        busy={Boolean(busyAction)}
        eyebrow="WEEKLY AVAILABILITY"
        title={`${editingAvailabilityBlockId ? "Edit" : "Add"} weekly rule`}
        description="Set weekly booking times within the selected branch’s business hours."
        footer={
          <>
            <OperationButton
              variant="outline"
              className="ops-redundant-dismiss"
              disabled={Boolean(busyAction)}
              onClick={close}
            >
              Cancel
            </OperationButton>
            <OperationButton
              type="submit"
              form="vendor-weekly-editor"
              disabled={Boolean(busyAction)}
              aria-busy={Boolean(busyAction)}
            >
              {busyAction ? "Working…" : "Save weekly rule"}
            </OperationButton>
          </>
        }
      >
        <ConfigurationScope
          busy={Boolean(busyAction)}
          onEdit={(form) => unsavedForm.current.mark(form)}
        >
          <form id="vendor-weekly-editor" onSubmit={handleSaveAvailabilityBlock}>
            <FieldGroup>
              {error ? (
                <OperationAlert color="red" title="Unable to save">
                  {error}
                </OperationAlert>
              ) : null}
              <FieldGroup className="config-related-fields">
                <ConfigurationSection title="Day and time range" description="">
                  <ConfigurationSelect
                    data={weekdayOptions}
                    label="Day"
                    required
                    value={String(availabilityBlockForm.weekday)}
                    onChange={(value) => {
                      const weekday = Number(value || 1);
                      setAvailabilityBlockForm((current) => {
                        if (editingAvailabilityBlockId) {
                          return { ...current, weekday };
                        }
                        return {
                          ...current,
                          weekday,
                          ...getWeeklyAvailabilityDefaults(
                            availabilityBlockLocation?.hours || [],
                            weekday,
                          ),
                        };
                      });
                    }}
                  />
                  <FieldGroup className="config-related-fields">
                    <ConfigurationInput
                      label="Starts"
                      required
                      type="time"
                      value={availabilityBlockForm.startsAt}
                      onChange={(event) =>
                        setAvailabilityBlockForm((current) => ({
                          ...current,
                          startsAt: event.target.value,
                        }))
                      }
                    />
                    <ConfigurationInput
                      label="Ends"
                      required
                      type="time"
                      value={availabilityBlockForm.endsAt}
                      onChange={(event) =>
                        setAvailabilityBlockForm((current) => ({
                          ...current,
                          endsAt: event.target.value,
                        }))
                      }
                    />
                  </FieldGroup>
                  <ConfigurationCheck
                    label="Ends next day"
                    checked={availabilityBlockForm.endsNextDay === true}
                    onChange={(event) =>
                      setAvailabilityBlockForm((current) => ({
                        ...current,
                        endsNextDay: event.currentTarget.checked,
                      }))
                    }
                  />
                  <p className="ops-muted">
                    {formatPreviewHourRange(
                      availabilityBlockLocation,
                      availabilityBlockForm.weekday,
                    )}
                    . Weekly availability must stay within these business hours.
                  </p>
                  <ConfigurationNumber
                    label="Simultaneous booking capacity"
                    description="An all-services rule shares one limit across this branch. A service-specific rule counts that service’s bookings; its branch setting can raise the limit."
                    min={1}
                    max={100}
                    value={availabilityBlockForm.capacity}
                    onChange={(value) =>
                      setAvailabilityBlockForm((current) => ({
                        ...current,
                        capacity: Number(value) || 1,
                      }))
                    }
                  />
                </ConfigurationSection>

                <ConfigurationSection
                  title="Where this schedule applies"
                  description=""
                >
                  <ConfigurationSelect
                    data={locationOptions}
                    description="This weekly rule applies only to the selected branch."
                    label="Branch"
                    required
                    value={
                      availabilityBlockForm.locationSlug || selectedLocationSlug
                    }
                    onChange={(value) => {
                      if (!value) {
                        return;
                      }
                      const nextLocation = locations.find(
                        (locationItem) => locationItem.slug === value,
                      );
                      setAvailabilityBlockForm((current) => ({
                        ...current,
                        locationSlug: value,
                        ...(!editingAvailabilityBlockId
                          ? getWeeklyAvailabilityDefaults(
                              nextLocation?.hours || [],
                              current.weekday,
                            )
                          : {}),
                      }));
                    }}
                  />
                  <ConfigurationSelect
                    data={weeklyServiceOptions.map((option) => ({
                      ...option,
                      value: option.value || "__all__",
                    }))}
                    label="Applies to"
                    description="All services share one branch limit. Select a service to apply the schedule only to it."
                    value={availabilityBlockForm.serviceSlug || "__all__"}
                    onChange={(value) =>
                      setAvailabilityBlockForm((current) => ({
                        ...current,
                        serviceSlug: value === "__all__" ? "" : value || "",
                      }))
                    }
                  />
                  <ConfigurationCheck
                    checked={availabilityBlockForm.isActive !== false}
                    label="Use this weekly schedule"
                    description="When off, this rule is ignored. If no weekly rules are enabled, bookings use business hours with the current fallback capacity."
                    onChange={(event) =>
                      setAvailabilityBlockForm((current) => ({
                        ...current,
                        isActive: event.currentTarget.checked,
                      }))
                    }
                  />
                </ConfigurationSection>
              </FieldGroup>

              <ConfigurationSection title="Internal guidance" description="">
                <ConfigurationTextarea
                  label="Notes"
                  value={availabilityBlockForm.notes || ""}
                  onChange={(event) =>
                    setAvailabilityBlockForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </ConfigurationSection>
            </FieldGroup>
          </form>
        </ConfigurationScope>
      </TaskDialog>
    );
  }

  function renderAvailabilityExceptionDialog() {
    const close = () => {
      if (canLeaveFeature()) {
        unsavedForm.current.discardId("vendor-exception-editor");
        setAvailabilityExceptionDialogOpen(false);
      }
    };
    return (
      <TaskDialog
        opened={availabilityExceptionDialogOpen}
        onClose={close}
        busy={Boolean(busyAction)}
        eyebrow="DATE EXCEPTION"
        title={`${editingAvailabilityExceptionId ? "Edit" : "Add"} date exception`}
        description="Change booking availability for one date at the selected branch. Existing bookings remain in your records."
        footer={
          <>
            <OperationButton
              variant="outline"
              className="ops-redundant-dismiss"
              disabled={Boolean(busyAction)}
              onClick={close}
            >
              Cancel
            </OperationButton>
            <OperationButton
              type="submit"
              form="vendor-exception-editor"
              disabled={Boolean(busyAction)}
              aria-busy={Boolean(busyAction)}
            >
              {busyAction ? "Working…" : "Save exception"}
            </OperationButton>
          </>
        }
      >
        <ConfigurationScope
          busy={Boolean(busyAction)}
          onEdit={(form) => unsavedForm.current.mark(form)}
        >
          <form
            id="vendor-exception-editor"
            onSubmit={handleSaveAvailabilityException}
          >
            <FieldGroup>
              {error ? (
                <OperationAlert color="red" title="Unable to save">
                  {error}
                </OperationAlert>
              ) : null}
              <FieldGroup className="config-related-fields">
                <ConfigurationSection title="Date and timing" description="">
                  <ConfigurationInput
                    label="Date"
                    type="date"
                    required
                    value={availabilityExceptionForm.exceptionDate || ""}
                    onChange={(event) =>
                      setAvailabilityExceptionForm((current) => ({
                        ...current,
                        exceptionDate: event.currentTarget.value,
                      }))
                    }
                  />
                  <ConfigurationCheck
                    checked={availabilityExceptionBlockEntireDay}
                    label="Block the whole day"
                    description="Block every service and time on this date."
                    onChange={(event) =>
                      setAvailabilityExceptionBlockEntireDay(
                        event.currentTarget.checked,
                      )
                    }
                  />
                  <FieldGroup className="config-related-fields">
                    <div>
                      <ConfigurationInput
                        label="Starts"
                        type="time"
                        required={
                          !availabilityExceptionBlockEntireDay &&
                          Boolean(availabilityExceptionForm.endsAt)
                        }
                        disabled={availabilityExceptionBlockEntireDay}
                        value={availabilityExceptionForm.startsAt || ""}
                        onChange={(event) =>
                          setAvailabilityExceptionForm((current) => ({
                            ...current,
                            startsAt: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <ConfigurationInput
                        label="Ends"
                        type="time"
                        required={
                          !availabilityExceptionBlockEntireDay &&
                          Boolean(availabilityExceptionForm.startsAt)
                        }
                        disabled={availabilityExceptionBlockEntireDay}
                        value={availabilityExceptionForm.endsAt || ""}
                        onChange={(event) =>
                          setAvailabilityExceptionForm((current) => ({
                            ...current,
                            endsAt: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </FieldGroup>
                  <ConfigurationNumber
                    label="Bookings allowed at the same time (optional)"
                    description="Leave blank to keep the usual booking limit."
                    min={1}
                    max={100}
                    value={availabilityExceptionForm.capacity ?? ""}
                    onChange={(value) =>
                      setAvailabilityExceptionForm((current) => ({
                        ...current,
                        capacity:
                          value === "" || value === null ? null : Number(value),
                      }))
                    }
                  />
                </ConfigurationSection>

                <ConfigurationSection
                  title="Service and availability"
                  description=""
                >
                  <ConfigurationSelect
                    data={exceptionServiceOptions.map((option) => ({
                      ...option,
                      value: option.value || "__all__",
                    }))}
                    label="Applies to"
                    disabled={availabilityExceptionBlockEntireDay}
                    value={
                      availabilityExceptionBlockEntireDay
                        ? "__all__"
                        : availabilityExceptionForm.serviceSlug || "__all__"
                    }
                    onChange={(value) =>
                      setAvailabilityExceptionForm((current) => ({
                        ...current,
                        serviceSlug: value === "__all__" ? "" : value || "",
                      }))
                    }
                  />
                  <QueueSeparator />
                  <p className="ops-muted">
                    Choose whether this exception blocks availability or opens a
                    specific date for booking.
                  </p>
                  <ConfigurationCheck
                    disabled={availabilityExceptionBlockEntireDay}
                    checked={
                      !availabilityExceptionBlockEntireDay &&
                      availabilityExceptionForm.isAvailable
                    }
                    label="Allow bookings on this date"
                    onChange={(event) =>
                      setAvailabilityExceptionForm((current) => ({
                        ...current,
                        isAvailable: event.currentTarget.checked,
                      }))
                    }
                  />
                </ConfigurationSection>
              </FieldGroup>

              <ConfigurationSection title="Reason and context" description="">
                <ConfigurationTextarea
                  label="Reason"
                  value={availabilityExceptionForm.reason || ""}
                  onChange={(event) =>
                    setAvailabilityExceptionForm((current) => ({
                      ...current,
                      reason: event.target.value,
                    }))
                  }
                />
              </ConfigurationSection>
            </FieldGroup>
          </form>
        </ConfigurationScope>
      </TaskDialog>
    );
  }

  function renderServicesPage() {
    const busy = Boolean(busyAction);
    const catalogReady = Boolean(servicesQuery.data && !servicesQuery.isError);
    const assignmentsReady = Boolean(
      locationServicesQuery.data && !locationServicesQuery.isError,
    );
    const availabilityReady = Boolean(
      availabilityQuery.data && !availabilityQuery.isError && catalogReady,
    );
    const activeServices = services.filter((service) => service.isActive).length;
    const changeTab = (value: unknown) => {
      if (value !== servicesTab && canLeaveFeature())
        setServicesTab(value as typeof servicesTab);
    };
    const remove = (
      title: string,
      description: string,
      confirmLabel: string,
      onConfirm: () => Promise<void>,
    ) =>
      openConfirmAction({
        title,
        description,
        confirmLabel,
        confirmColor: "red",
        onConfirm,
      });
    const actions = (
      label: string,
      checked: boolean,
      onToggle: (checked: boolean) => void,
      onEdit: () => void,
      onRemove: () => void,
      disabled = false,
    ) => (
      <div className="config-catalog-actions">
        <OperationButton variant="outline" disabled={disabled} onClick={onEdit}>
          Edit {label}
        </OperationButton>
        <ConfigurationCheck
          label={label === "exception" ? "Allow bookings" : "Enabled"}
          checked={checked}
          disabled={disabled}
          onChange={(event) => onToggle(event.currentTarget.checked)}
        />
        <OperationButton variant="destructive" disabled={label === "service" && !checked} onClick={onRemove}>
          Remove {label}
        </OperationButton>
      </div>
    );
    return (
      <ConfigurationScope
        busy={busy}
        onEdit={(form) => unsavedForm.current.mark(form)}
      >
        <div className="config-page">
          <div className="ops-grid ops-grid-3">
            <OperationMetric
              label="Active services"
              value={catalogReady ? activeServices : "—"}
              detail="Offered for new bookings at enabled branches."
            />
            <OperationMetric
              label="Inactive services"
              value={catalogReady ? services.length - activeServices : "—"}
              detail="Existing booking records are retained."
            />
            <OperationMetric
              label="Availability at"
              value={selectedLocation?.name || "Select a branch"}
              detail={`Schedules use ${selectedLocation?.timezone || "the branch timezone"}.`}
            />
          </div>
          <ConfigTabs value={servicesTab} onValueChange={changeTab}>
            <ConfigTabsList
              variant="line"
              className="config-tabs-list"
              activateOnFocus
              aria-label="Services and availability"
            >
              <ConfigTabsTrigger disabled={busy} value="catalog">
                Service catalog
              </ConfigTabsTrigger>
              <ConfigTabsTrigger disabled={busy} value="weekly">
                Weekly availability
              </ConfigTabsTrigger>
              <ConfigTabsTrigger disabled={busy} value="exceptions">
                Date exceptions
              </ConfigTabsTrigger>
            </ConfigTabsList>
            <ConfigTabsContent value="catalog" keepMounted>
              <OperationPanel>
                <div className="ops-list-heading">
                  <div>
                    <h2>Service catalog</h2>
                    <p className="ops-muted">
                      Manage service details, quantity and branch booking
                      settings.
                    </p>
                  </div>
                  <OperationButton
                    disabled={!catalogReady || !assignmentsReady}
                    onClick={() => openServiceDialog()}
                  >
                    Add service
                  </OperationButton>
                </div>
                <OperationQueryState
                  loading={servicesQuery.isPending}
                  error={servicesQuery.error}
                  onRetry={() => void servicesQuery.refetch()}
                />
                <OperationQueryState
                  loading={locationServicesQuery.isPending}
                  error={locationServicesQuery.error}
                  onRetry={() => void locationServicesQuery.refetch()}
                />
                {catalogReady ? (
                  <div className="config-catalog-list">
                    {services.length ? (
                      services.map((service) => (
                        <QueueCard key={service.id}>
                          <QueueCardHeader>
                            <div className="ops-list-heading">
                              <QueueCardTitle>{service.name}</QueueCardTitle>
                              <QueueBadge
                                variant={
                                  service.isActive ? "secondary" : "outline"
                                }
                              >
                                {service.isActive ? "Active" : "Inactive"}
                              </QueueBadge>
                            </div>
                            <p className="ops-muted">
                              {service.description || service.slug}
                            </p>
                          </QueueCardHeader>
                          <QueueCardContent className="config-catalog-content">
                            <dl className="config-catalog-summary">
                              <div>
                                <dt>Duration</dt>
                                <dd>
                                  {service.durationMinutes} min
                                  {service.allowBookingQuantity
                                    ? " per unit"
                                    : " per booking"}
                                </dd>
                              </div>
                              <div>
                                <dt>Price</dt>
                                <dd>
                                  {service.priceDisplay ||
                                    `PHP ${(service.priceAmountCents / 100).toLocaleString()}`}
                                </dd>
                              </div>
                              <div>
                                <dt>Quantity</dt>
                                <dd>
                                  {service.allowBookingQuantity
                                    ? `${service.bookingQuantityMin ?? 1}–${service.bookingQuantityMax ?? 24} ${service.bookingQuantityLabel || "Units"}`
                                    : "One per booking"}
                                </dd>
                              </div>
                              <div>
                                <dt>Booking limit</dt>
                                <dd>
                                  {service.bookingCapacityScope === "location"
                                    ? "All services at the branch"
                                    : "Only this service"}
                                </dd>
                              </div>
                              <div>
                                <dt>Payment</dt>
                                <dd>
                                  {service.manualPaymentRequired
                                    ? "Proof required"
                                    : "No proof required"}
                                </dd>
                              </div>
                              <div>
                                <dt>List order</dt>
                                <dd>{service.sortOrder}</dd>
                              </div>
                            </dl>
                            {actions(
                              "service",
                              service.isActive,
                              (active) =>
                                void handleToggleServiceActive(service, active),
                              () => openServiceDialog(service),
                              () =>
                                remove(
                                  "Remove service from booking?",
                                  "New bookings will stop for this service. Existing bookings and service records are retained.",
                                  "Remove service",
                                  () => handleDeleteService(service),
                                ),
                              !assignmentsReady,
                            )}
                          </QueueCardContent>
                        </QueueCard>
                      ))
                    ) : (
                      <OperationEmpty
                        title="No services yet"
                        text="Add a service, then choose where customers can book it."
                      />
                    )}
                  </div>
                ) : null}
              </OperationPanel>
            </ConfigTabsContent>
            <ConfigTabsContent value="weekly" keepMounted>
              <OperationPanel>
                <div className="ops-list-heading">
                  <div>
                    <h2>Weekly availability</h2>
                    <p className="ops-muted">
                      Recurring booking times for{" "}
                      {selectedLocation?.name || "this branch"}.
                    </p>
                  </div>
                  <OperationButton
                    disabled={!availabilityReady}
                    onClick={() => openAvailabilityBlockDialog()}
                  >
                    Add weekly rule
                  </OperationButton>
                </div>
                <ConfigurationSelect
                  label="Branch"
                  data={locationOptions}
                  value={selectedLocationSlug}
                  onChange={(value) =>
                    value && selectConfigurationLocation(value)
                  }
                />
                <OperationQueryState
                  loading={availabilityQuery.isPending || servicesQuery.isPending}
                  error={availabilityQuery.error || servicesQuery.error}
                  onRetry={() => {
                    void availabilityQuery.refetch();
                    void servicesQuery.refetch();
                  }}
                />
                {availabilityReady ? (
                  <>
                    <OperationAlert title="How weekly rules work">
                      Rules must fit within business hours. When no weekly rules
                      are enabled, bookings use business hours and the current
                      fallback capacity. Disabling a rule does not cancel existing
                      bookings.
                    </OperationAlert>
                    {availabilitySummary?.hasSharedLocationCapacity &&
                    availabilitySummary?.hasServiceSpecificCapacity ? (
                      <OperationAlert title="Mixed booking limits">
                        This branch has both shared and service-specific limits. A
                        shared rule can make a booking for one service affect
                        other services.
                      </OperationAlert>
                    ) : null}
                    <div className="config-catalog-list">
                      {availabilityBlocks.length ? (
                        availabilityBlocks.map((block) => {
                          const unavailable = Boolean(
                            block.serviceId &&
                            !serviceSlugById.has(block.serviceId),
                          );
                          return (
                            <QueueCard key={block.id}>
                              <QueueCardHeader>
                                <div className="ops-list-heading">
                                  <QueueCardTitle>
                                    {weekdayOptions.find(
                                      (day) =>
                                        day.value === String(block.weekday),
                                    )?.label || "Weekly rule"}
                                  </QueueCardTitle>
                                  <QueueBadge
                                    variant={
                                      block.isActive ? "secondary" : "outline"
                                    }
                                  >
                                    {block.isActive ? "Enabled" : "Disabled"}
                                  </QueueBadge>
                                </div>
                                <p className="ops-muted">
                                  {block.startsAt} – {block.endsAt}
                                  {block.endsNextDay ? " next day" : ""}
                                </p>
                              </QueueCardHeader>
                              <QueueCardContent className="config-catalog-content">
                                <dl className="config-catalog-summary">
                                  <div>
                                    <dt>Applies to</dt>
                                    <dd>{getServiceLabel(block.serviceId)}</dd>
                                  </div>
                                  <div>
                                    <dt>Bookings at the same time</dt>
                                    <dd>{block.capacity}</dd>
                                  </div>
                                </dl>
                                {block.notes ? (
                                  <p className="ops-muted">{block.notes}</p>
                                ) : null}
                                {unavailable ? (
                                  <OperationAlert title="Service unavailable">
                                    The assigned service could not be found.
                                    Reload the catalog before editing this rule.
                                  </OperationAlert>
                                ) : null}
                                {actions(
                                  "weekly rule",
                                  block.isActive,
                                  (active) =>
                                    void handleToggleAvailabilityBlockActive(
                                      block,
                                      active,
                                    ),
                                  () => openAvailabilityBlockDialog(block),
                                  () =>
                                    remove(
                                      "Remove weekly rule?",
                                      "This recurring rule will be removed. Remaining enabled rules or business-hour fallback will determine new booking times.",
                                      "Remove rule",
                                      () => handleDeleteAvailabilityBlock(block),
                                    ),
                                  unavailable,
                                )}
                              </QueueCardContent>
                            </QueueCard>
                          );
                        })
                      ) : (
                        <OperationEmpty
                          title="No weekly rules"
                          text="Bookings currently use business hours and fallback capacity. Add a rule to customize recurring booking times."
                        />
                      )}
                    </div>
                  </>
                ) : null}
              </OperationPanel>
            </ConfigTabsContent>
            <ConfigTabsContent value="exceptions" keepMounted>
              <OperationPanel>
                <div className="ops-list-heading">
                  <div>
                    <h2>Date exceptions</h2>
                    <p className="ops-muted">
                      Holidays, special hours and one-off changes for{" "}
                      {selectedLocation?.name || "this branch"}.
                    </p>
                  </div>
                  <OperationButton
                    disabled={!availabilityReady}
                    onClick={() => openAvailabilityExceptionDialog()}
                  >
                    Add exception
                  </OperationButton>
                </div>
                <ConfigurationSelect
                  label="Branch"
                  data={locationOptions}
                  value={selectedLocationSlug}
                  onChange={(value) =>
                    value && selectConfigurationLocation(value)
                  }
                />
                <OperationQueryState
                  loading={availabilityQuery.isPending || servicesQuery.isPending}
                  error={availabilityQuery.error || servicesQuery.error}
                  onRetry={() => {
                    void availabilityQuery.refetch();
                    void servicesQuery.refetch();
                  }}
                />
                {availabilityReady ? (
                  <div className="config-catalog-list">
                    {availabilityExceptions.length ? (
                      availabilityExceptions.map((exception) => {
                        const unavailable = Boolean(
                          exception.serviceId &&
                          !serviceSlugById.has(exception.serviceId),
                        );
                        return (
                          <QueueCard key={exception.id}>
                            <QueueCardHeader>
                              <div className="ops-list-heading">
                                <QueueCardTitle>
                                  {formatDate(exception.exceptionDate)}
                                </QueueCardTitle>
                                <QueueBadge
                                  variant={
                                    exception.isAvailable
                                      ? "secondary"
                                      : "destructive"
                                  }
                                >
                                  {exception.isAvailable
                                    ? "Bookings allowed"
                                    : "Blocked"}
                                </QueueBadge>
                              </div>
                              <p className="ops-muted">
                                {exception.startsAt && exception.endsAt
                                  ? `${exception.startsAt} – ${exception.endsAt}`
                                  : "Whole day"}
                              </p>
                            </QueueCardHeader>
                            <QueueCardContent className="config-catalog-content">
                              <dl className="config-catalog-summary">
                                <div>
                                  <dt>Applies to</dt>
                                  <dd>{getServiceLabel(exception.serviceId)}</dd>
                                </div>
                                <div>
                                  <dt>Bookings at the same time</dt>
                                  <dd>{exception.capacity ?? "Usual limit"}</dd>
                                </div>
                              </dl>
                              {exception.reason ? (
                                <p className="ops-muted">{exception.reason}</p>
                              ) : null}
                              {unavailable ? (
                                <OperationAlert title="Service unavailable">
                                  The assigned service could not be found. Reload
                                  the catalog before editing this exception.
                                </OperationAlert>
                              ) : null}
                              {actions(
                                "exception",
                                exception.isAvailable,
                                (active) =>
                                  void handleToggleAvailabilityExceptionActive(
                                    exception,
                                    active,
                                  ),
                                () => openAvailabilityExceptionDialog(exception),
                                () =>
                                  remove(
                                    "Remove date exception?",
                                    "The usual weekly schedule or business-hour fallback will apply on this date. Existing bookings are retained.",
                                    "Remove exception",
                                    () =>
                                      handleDeleteAvailabilityException(
                                        exception,
                                      ),
                                  ),
                                unavailable,
                              )}
                            </QueueCardContent>
                          </QueueCard>
                        );
                      })
                    ) : (
                      <OperationEmpty
                        title="No date exceptions"
                        text="Add a holiday, special opening time or one-off booking limit."
                      />
                    )}
                  </div>
                ) : null}
              </OperationPanel>
            </ConfigTabsContent>
          </ConfigTabs>
        </div>
      </ConfigurationScope>
    );
  }

  function renderBookingsPage() {
    const pendingBookings = vendorBookings.filter(
      (booking) => booking.status === "pending",
    ).length;
    const actionableBookings = vendorBookings.filter((booking) =>
      ["pending", "confirmed", "rescheduled"].includes(booking.status),
    ).length;
    if (bookingListQuery.isError || bookingListQuery.isPending)
      return (
        <OperationScope>
          <OperationQueryState
            loading={bookingListQuery.isPending}
            error={bookingListQuery.error}
            onRetry={() => void bookingListQuery.refetch()}
          />
        </OperationScope>
      );
    return (
      <OperationScope busy={Boolean(busyAction)}>
        <div className="ops-stack">
          <div className="ops-grid ops-grid-3">
            <OperationMetric
              detail="Awaiting vendor confirmation on this page."
              label="Pending requests"
              value={pendingBookings}
            />
            <OperationMetric
              detail="Pending, confirmed or rescheduled on this page."
              label="Active bookings"
              value={actionableBookings}
            />
            <OperationPanel>
              <div className="ops-stack">
                <p className="vendor-eyebrow">
                  {selectedLocation?.name || "Selected location"}
                </p>
                <h2 className="ops-heading">Booking queue</h2>
                <OperationButton onClick={reloadBookings} variant="outline">
                  Refresh bookings
                </OperationButton>
              </div>
            </OperationPanel>
          </div>

          <OperationPanel>
            <div className="ops-stack">
              <div className="ops-row ops-between">
                <div>
                  <p className="vendor-eyebrow">
                    {canAdminBookings ? "Vendor Admin" : "Vendor Staff"}
                  </p>
                  <h2 className="ops-heading">
                    {canAdminBookings
                      ? "Incoming booking requests"
                      : "Booking check-in queue"}
                  </h2>
                  <p className="ops-muted">
                    Showing bookings for{" "}
                    {selectedLocation?.name || selectedLocationSlug} only. If a
                    reference is missing, choose the customer’s booking branch
                    using Location in the navigation.
                  </p>
                </div>
                <div className="ops-row">
                  <OperationInput
                    label="Search"
                    placeholder="Reference, customer, service"
                    value={bookingSearch}
                    onChange={(event) => setBookingSearch(event.target.value)}
                  />
                  <OperationSelect
                    data={bookingStatusFilterOptions}
                    label="Status"
                    value={bookingStatusFilter}
                    onChange={(value) => {
                      setBookingStatusFilter(
                        (value || "all") as BookingStatusFilter,
                      );
                      setHideNonActiveBookings(false);
                    }}
                  />
                  <OperationCheckbox
                    label="Hide non-active bookings"
                    checked={hideNonActiveBookings}
                    onCheckedChange={(checked) => {
                      setHideNonActiveBookings(checked);
                      if (checked) setBookingStatusFilter("all");
                    }}
                  />
                  <OperationDateRange
                    value={bookingDateRange}
                    onChange={(value) =>
                      setBookingDateRange(value as [Date | null, Date | null])
                    }
                  />
                  {bookingDateRange[0] || bookingDateRange[1] ? (
                    <OperationButton
                      onClick={() => setBookingDateRange([null, null])}
                      variant="outline"
                    >
                      Clear range
                    </OperationButton>
                  ) : null}
                </div>
              </div>

              {filteredBookings.length ? (
                <>
                  <div className="ops-table">
                    <QueueTable role="table" className="ops-data-table">
                      <QueueTableHeader role="rowgroup">
                        <QueueTableRow role="row">
                          <QueueTableHead role="columnheader" scope="col">ID</QueueTableHead>
                          <QueueTableHead role="columnheader" scope="col">Reference</QueueTableHead>
                          <QueueTableHead role="columnheader" scope="col">Customer</QueueTableHead>
                          <QueueTableHead role="columnheader" scope="col">Service</QueueTableHead>
                          <QueueTableHead role="columnheader" scope="col">Schedule</QueueTableHead>
                          <QueueTableHead role="columnheader" scope="col">Status</QueueTableHead>
                          <QueueTableHead role="columnheader" scope="col">Payment</QueueTableHead>
                          <QueueTableHead role="columnheader" scope="col">Actions</QueueTableHead>
                        </QueueTableRow>
                      </QueueTableHeader>
                      <QueueTableBody role="rowgroup">
                        {filteredBookings.map((booking) => {
                          const paymentReviewPending =
                            booking.paymentStatus === "pending";
                          const paymentVerified =
                            booking.paymentStatus === "paid";
                          const manualPaymentRequired = Boolean(
                            booking.serviceManualPaymentRequired,
                          );
                          const checkInState = getBookingCheckInState(
                            booking,
                            bookingCheckInNow,
                          );
                          const hasExpired = Boolean(booking.expiredAt);
                          const isGroupFundedBooking =
                            booking.bookingPaymentSource === "group_funded" ||
                            Boolean(booking.groupFundedBookingId);
                          const bookingBundleItems =
                            isGroupFundedBooking &&
                            booking.groupFundedCampaign?.bundleItems?.length
                              ? booking.groupFundedCampaign.bundleItems
                              : booking.bundleItems || [];
                          const displayedServiceItems =
                            bookingBundleItems.length
                              ? bookingBundleItems
                              : [
                                  {
                                    serviceName: booking.serviceName,
                                    bookingQuantity: booking.bookingQuantity,
                                    priceAmountCents:
                                      booking.servicePriceAmountCents,
                                    currency: booking.serviceCurrency,
                                    scheduledStartAt: booking.scheduledStartAt,
                                    scheduledEndAt: booking.scheduledEndAt,
                                  },
                                ];
                          const primaryServiceItem = displayedServiceItems[0];
                          const additionalServiceCount = Math.max(
                            displayedServiceItems.length - 1,
                            0,
                          );
                          const executionModeLabel =
                            booking.executionMode === "sequential"
                              ? "Back-to-back"
                              : "Together";
                          const displayedTotalCents =
                            isGroupFundedBooking && booking.groupFundedCampaign
                              ? Number(
                                  booking.groupFundedCampaign
                                    .targetAmountCents || 0,
                                ) +
                                Number(
                                  booking.groupFundedCampaign
                                    .roundingAdjustmentCents || 0,
                                )
                              : displayedServiceItems.reduce(
                                  (total, item) =>
                                    total + Number(item.priceAmountCents || 0),
                                  0,
                                );
                          let bookingProofLabel = "No manual payment";
                          if (isGroupFundedBooking) {
                            bookingProofLabel = "No individual proof";
                          } else if (manualPaymentRequired) {
                            bookingProofLabel =
                              booking.hasPaymentProof || booking.paymentProof
                                ? "Proof submitted"
                                : "Proof required";
                          }
                          const canReviewBookingPayment =
                            canAdminBookings &&
                            paymentReviewPending &&
                            Boolean(booking.paymentProof);
                          const rescheduleAction = (disabled: boolean) => (
                            <OperationAction
                              label="Reschedule booking"
                              color="orange"
                              disabled={disabled}
                              onClick={() => openRescheduleDialog(booking)}
                            >
                              <IconCalendar size={16} />
                            </OperationAction>
                          );
                          const cancelAction = (
                            <OperationAction
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
                                  },
                                })
                              }
                            >
                              <IconX size={16} />
                            </OperationAction>
                          );
                          const actionButtons = (() => {
                            if (booking.checkedInAt || booking.linkedTicket) {
                              return <p className="ops-muted">Manage from the live queue.</p>;
                            }
                            if (canReviewBookingPayment) {
                              return (
                                <div className="ops-row">
                                  <OperationAction
                                    label="Review payment"
                                    color="blue"
                                    onClick={() => {
                                      openBookingDetail(booking.id);
                                    }}
                                  >
                                    <IconClipboardList size={16} />
                                  </OperationAction>
                                  {rescheduleAction(
                                    Boolean(busyAction) ||
                                      (checkInState.isEligibleStatus &&
                                        checkInState.isLate &&
                                        manualPaymentRequired &&
                                        !paymentVerified &&
                                        !booking.paymentVerifiedAt),
                                  )}
                                  {cancelAction}
                                </div>
                              );
                            }
                            if (
                              canAdminBookings &&
                              checkInState.isEligibleStatus &&
                              checkInState.isLate
                            ) {
                              return (
                                <div className="ops-row">
                                  {rescheduleAction(
                                    Boolean(busyAction) ||
                                      (manualPaymentRequired &&
                                        !paymentVerified &&
                                        !booking.paymentVerifiedAt),
                                  )}
                                  <OperationAction
                                    label="Mark no-show"
                                    color="red"
                                    disabled={busyAction === `booking-no-show:${booking.id}`}
                                    onClick={() => handleMarkBookingNoShow(booking)}
                                  >
                                    <IconAlertTriangle size={16} />
                                  </OperationAction>
                                </div>
                              );
                            }
                            if (
                              canAdminBookings &&
                              booking.status === "pending" &&
                              (paymentVerified || !manualPaymentRequired)
                            ) {
                              return (
                                <div className="ops-row">
                                  <OperationAction
                                    label="Confirm booking"
                                    color="teal"
                                    onClick={() => handleUpdateBookingStatus(booking, "confirmed")}
                                  >
                                    <IconCheck size={16} />
                                  </OperationAction>
                                  {rescheduleAction(false)}
                                  {cancelAction}
                                </div>
                              );
                            }
                            if (canAdminBookings && paymentReviewPending && !booking.paymentProof) {
                              return <p className="ops-muted">Waiting for customer payment proof.</p>;
                            }
                            if (canAdminBookings && paymentVerified) {
                              return (
                                <div className="ops-row">
                                  {rescheduleAction(false)}
                                  {cancelAction}
                                </div>
                              );
                            }
                            if (
                              canAdminBookings &&
                              booking.status === "confirmed" &&
                              checkInState.isTooEarly
                            ) {
                              return (
                                <div className="ops-row">
                                  {rescheduleAction(false)}
                                  {cancelAction}
                                </div>
                              );
                            }
                            return null;
                          })();
                          return (
                            <BookingTableRow
                              key={booking.id}
                              reference={booking.reference}
                              onOpen={() => {
                                openBookingDetail(booking.id);
                              }}
                            >
                              <QueueTableCell role="cell" data-label="ID">{booking.id}</QueueTableCell>
                              <QueueTableCell role="cell" data-label="Reference">
                                <div className="ops-stack">
                                  <OperationButton
                                    onClick={() => {
                                      openBookingDetail(booking.id);
                                    }}
                                    variant="ghost"
                                  >
                                    {booking.reference}
                                  </OperationButton>
                                  <p className="ops-muted">
                                    Requested{" "}
                                    {formatDateTime(booking.createdAt)}
                                  </p>
                                  <GroupFundedBookingIndicator
                                    booking={booking}
                                  />
                                </div>
                              </QueueTableCell>
                              <QueueTableCell role="cell" data-label="Customer">
                                <div className="ops-stack">
                                  <p className="ops-strong">
                                    {booking.customerName}
                                  </p>
                                  <p className="ops-muted">
                                    {booking.customerEmail ||
                                      booking.customerPhone ||
                                      "No contact details"}
                                  </p>
                                </div>
                              </QueueTableCell>
                              <QueueTableCell role="cell" data-label="Service">
                                <div className="ops-stack">
                                  <div className="ops-row">
                                    <p className="ops-strong">
                                      {primaryServiceItem.serviceName}
                                    </p>
                                    {isGroupFundedBooking ? (
                                      <QueueBadge variant="outline">
                                        Campaign
                                      </QueueBadge>
                                    ) : null}
                                  </div>
                                  <p className="ops-muted">
                                    Quantity{" "}
                                    {primaryServiceItem.bookingQuantity}
                                    {additionalServiceCount
                                      ? ` · +${additionalServiceCount} service${additionalServiceCount === 1 ? "" : "s"}`
                                      : ""}
                                  </p>
                                  <p className="ops-muted">
                                    {displayedServiceItems.length > 1
                                      ? `${executionModeLabel} bundle · `
                                      : ""}
                                    {formatMoney(
                                      displayedTotalCents,
                                      primaryServiceItem.currency ||
                                        booking.serviceCurrency,
                                    )}
                                  </p>
                                </div>
                              </QueueTableCell>
                              <QueueTableCell role="cell" data-label="Schedule">
                                <div className="ops-stack">
                                  <p>
                                    {formatBookingScheduleDateTime(
                                      booking.scheduledStartAt,
                                    )}
                                  </p>
                                  <p className="ops-muted">
                                    Ends{" "}
                                    {formatBookingScheduleDateTime(
                                      booking.scheduledEndAt,
                                    )}
                                  </p>
                                  {displayedServiceItems.length > 1 ? (
                                    <p className="ops-muted">
                                      {executionModeLabel} services
                                    </p>
                                  ) : null}
                                </div>
                              </QueueTableCell>
                              <QueueTableCell role="cell" data-label="Status">
                                <div className="ops-stack">
                                  <div className="ops-row ops-status-chips">
                                    <QueueBadge variant={getBookingBadgeColor(booking.status) === "red" ? "destructive" : "outline"}>
                                      {hasExpired ? "expired" : booking.status}
                                    </QueueBadge>
                                    {booking.checkedInAt ||
                                    booking.linkedTicket ? (
                                      <QueueBadge variant="outline">
                                        Checked in
                                      </QueueBadge>
                                    ) : null}
                                    {booking.noShowAt ? (
                                      <QueueBadge variant="destructive">
                                        No-show
                                      </QueueBadge>
                                    ) : null}
                                    {hasExpired ? (
                                      <QueueBadge variant="outline">
                                        Pending timeout
                                      </QueueBadge>
                                    ) : null}
                                    {!manualPaymentRequired &&
                                    !isGroupFundedBooking ? (
                                      <QueueBadge variant="outline">
                                        No manual payment
                                      </QueueBadge>
                                    ) : null}
                                  </div>
                                  {booking.linkedTicket ? (
                                    <p className="ops-muted">
                                      Ticket {booking.linkedTicket.ticketNumber}
                                    </p>
                                  ) : null}
                                  {hasExpired && booking.expirationReason ? (
                                    <p className="ops-muted">
                                      {booking.expirationReason}
                                    </p>
                                  ) : null}
                                </div>
                              </QueueTableCell>
                              <QueueTableCell role="cell" data-label="Payment">
                                <div className="ops-stack">
                                  <QueueBadge variant="outline">
                                    {isGroupFundedBooking
                                      ? "Campaign funded"
                                      : booking.paymentStatus}
                                  </QueueBadge>
                                  <p className="ops-muted">
                                    {bookingProofLabel}
                                  </p>
                                </div>
                              </QueueTableCell>
                              <QueueTableCell role="cell" data-label="Actions">
                                <div className="ops-row">
                                  {canOperateBookingQueue &&
                                  checkInState.isWindowOpen ? (
                                    <OperationAction
                                      label={
                                        bookingCheckInBlocked
                                          ? `Check in customer: ${bookingCheckInGuidance}`
                                          : "Check in customer"
                                      }
                                      color="teal"
                                      size={44}
                                      loading={
                                        busyAction ===
                                        `booking-check-in:${booking.id}`
                                      }
                                      disabled={
                                        Boolean(busyAction) ||
                                        bookingCheckInBlocked
                                      }
                                      onClick={() =>
                                        void handleCheckInBooking(booking)
                                      }
                                    >
                                      <IconCalendarCheck size={18} />
                                    </OperationAction>
                                  ) : null}
                                  {renderBookingNoShowAction(booking)}
                                  {actionButtons}
                                </div>
                              </QueueTableCell>
                            </BookingTableRow>
                          );
                        })}
                      </QueueTableBody>
                    </QueueTable>
                  </div>
                  {bookingPagination && bookingPagination.totalItems > 0 ? (
                    <div className="ops-row ops-between">
                      <p className="ops-muted">
                        Showing{" "}
                        {vendorBookings.length ? (bookingPage - 1) * 10 + 1 : 0}
                        -
                        {Math.min(
                          (bookingPage - 1) * 10 + vendorBookings.length,
                          bookingPagination.totalItems,
                        )}{" "}
                        of {bookingPagination.totalItems}
                      </p>
                      {bookingPagination.totalPages > 1 ? (
                        <OperationPagination
                          total={bookingPagination.totalPages}
                          value={bookingPage}
                          onChange={setBookingPage}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <OperationEmpty
                  title="No booking requests"
                  text="Incoming service booking requests for this location will appear here."
                />
              )}
            </div>
          </OperationPanel>
        </div>
      </OperationScope>
    );
  }

  function renderRescheduleDialog() {
    const isSaving = Boolean(
      reschedulingBooking &&
      busyAction === `booking-reschedule:${reschedulingBooking.id}`,
    );
    const rescheduleSlotOptions = rescheduleSlots.map((slot) => ({
      value: String(slot.startAt),
      label: `${formatBookingScheduleTimeRange(slot.startAt, slot.endAt)} (${slot.remainingCapacity} left)`,
      disabled: !slot.isAvailable,
    }));
    const closeRescheduleDialog = () => {
      if (isSaving || !canLeaveFeature()) return;
      unsavedForm.current.discardId("vendor-booking-reschedule");
      setRescheduleDialogOpen(false);
      setReschedulingBooking(null);
      setRescheduleDate("");
      setRescheduleStartAt("");
      setRescheduleSlots([]);
      setRescheduleSlotsError("");
    };
    return (
      <TaskDialog
        opened={rescheduleDialogOpen}
        onClose={closeRescheduleDialog}
        busy={Boolean(busyAction)}
        eyebrow="BOOKING SCHEDULE"
        title={
          reschedulingBooking
            ? `Reschedule ${reschedulingBooking.reference}`
            : "Reschedule booking"
        }
        footer={
          <>
            <OperationButton
              variant="outline"
              disabled={Boolean(busyAction)}
              onClick={closeRescheduleDialog}
              className="ops-redundant-dismiss"
            >
              Cancel
            </OperationButton>
            <OperationButton
              variant="default"
              type="submit"
              form="vendor-booking-reschedule"
              loading={isSaving}
              disabled={
                !rescheduleStartAt ||
                rescheduleSlotsLoading ||
                Boolean(busyAction)
              }
            >
              Save schedule
            </OperationButton>
          </>
        }
      >
        <OperationScope busy={Boolean(busyAction)}>
          <form
            id="vendor-booking-reschedule"
            ref={rescheduleFormRef}
            onSubmit={handleRescheduleBooking}
            className="ops-stack"
          >
            {error ? <OperationAlert color="red">{error}</OperationAlert> : null}
            {reschedulingBooking ? (
              <OperationAlert>
                {reschedulingBooking.customerName} requested{" "}
                {reschedulingBooking.serviceName}.
              </OperationAlert>
            ) : null}
            <OperationInput
              label="Service"
              value={
                reschedulingBooking
                  ? `${reschedulingBooking.serviceName} - ${formatBookingScheduleTimeRange(reschedulingBooking.scheduledStartAt, reschedulingBooking.scheduledEndAt)}`
                  : ""
              }
              readOnly
            />
            <OperationInput
              label="Branch"
              value={reschedulingBooking?.locationName || ""}
              readOnly
            />
            <OperationDate
              label="Date"
              required
              value={rescheduleDate || null}
              onChange={(value) => {
                setRescheduleDate(value || "");
                setRescheduleStartAt("");
              }}
            />
            <OperationSelect
              data={rescheduleSlotOptions}
              disabled={
                rescheduleSlotsLoading || !rescheduleDate || Boolean(busyAction)
              }
              label="Available slot"
              required
              placeholder={
                rescheduleSlotsLoading ? "Loading slots…" : "Select a time"
              }
              value={rescheduleStartAt}
              onChange={(value) => {
                if ((value || "") !== rescheduleStartAt && rescheduleFormRef.current) {
                  unsavedForm.current.mark(rescheduleFormRef.current);
                }
                setRescheduleStartAt(value || "");
              }}
            />
            {rescheduleSlotsError ? (
              <OperationAlert color="red">
                {rescheduleSlotsError}
              </OperationAlert>
            ) : null}
            {!rescheduleSlotsLoading &&
            rescheduleDate &&
            !rescheduleSlotOptions.length &&
            !rescheduleSlotsError ? (
              <OperationAlert>No available slots for this date.</OperationAlert>
            ) : null}
          </form>
        </OperationScope>
      </TaskDialog>
    );
  }

  function renderRescheduleBlockedModal() {
    return (
      <TaskDialog
        opened={rescheduleBlockModalOpen}
        onClose={() => setRescheduleBlockModalOpen(false)}
        eyebrow="BOOKING SCHEDULE"
        title="Reschedule blocked"
        footer={
          <OperationButton
            variant="outline"
            onClick={() => setRescheduleBlockModalOpen(false)}
          >
            OK
          </OperationButton>
        }
      >
        <OperationAlert>Review payment before rescheduling.</OperationAlert>
      </TaskDialog>
    );
  }

  function renderStaffPage() {
    if (staffQuery.isPending || staffQuery.isError)
      return (
        <OperationScope>
          <OperationQueryState
            loading={staffQuery.isPending}
            error={staffQuery.error}
            onRetry={() => void staffQuery.refetch()}
          />
        </OperationScope>
      );
    const confirmStaffChange = (
      member: VendorStaffSummary,
      kind: "role" | "status" | "remove",
      value?: "admin" | "staff" | boolean,
    ) => {
      setError("");
      const role = value === "admin" ? "admin" : "staff";
      const enabled = value === true;
      openConfirmAction({
        title:
          kind === "role"
            ? `Change ${member.name}'s role?`
            : kind === "remove"
              ? `Remove ${member.name}?`
              : `${enabled ? "Enable" : "Disable"} ${member.name}'s access?`,
        description:
          kind === "role"
            ? `Their role in this business will become ${role === "admin" ? "Admin" : "Staff"}. Their existing location and counter assignments are retained.`
            : kind === "remove"
              ? "This revokes their access to this business. Their GetPrio account remains available for other businesses and customer bookings."
              : enabled
                ? "Allow this member to access this business again, subject to their role and assignments."
                : "This disables their access to this business. Their account and membership remain saved; you can enable access again.",
        confirmLabel:
          kind === "role"
            ? "Change role"
            : kind === "remove"
              ? "Remove staff"
              : enabled
                ? "Enable access"
                : "Disable access",
        confirmColor:
          kind === "remove" || (kind === "status" && !enabled) ? "red" : "blue",
        onConfirm: async () => {
          if (kind === "role") await handleUpdateStaffRole(member, role);
          else if (kind === "status")
            await handleUpdateStaffStatus(member, enabled);
          else await handleRemoveStaff(member);
        },
      });
    };
    return (
      <ConfigurationScope busy={Boolean(busyAction)}>
        <OperationPanel>
          <div className="ops-list-heading ops-between">
            <div>
              <h2>Business access</h2>
              <p className="ops-muted">
                {staff.length} of {staffSeatLimit} staff seats used. Saved
                memberships, including disabled accounts, count toward this limit.
              </p>
            </div>
            {isOwner || isAdmin ? (
              <OperationButton
                disabled={staff.length >= staffSeatLimit}
                onClick={() => {
                  setError("");
                  setStaffForm({ email: "", role: "staff" });
                  setStaffDialogOpen(true);
                }}
              >
                Add staff
              </OperationButton>
            ) : null}
          </div>
          {staff.length >= staffSeatLimit ? (
            <p className="ops-muted">
              The staff seat limit has been reached. Remove an eligible membership
              or change your plan before adding another account.
            </p>
          ) : null}
          <p className="ops-muted">
            Owners can change other members’ roles and remove access. Owners and
            admins can enable or disable eligible members. Counter assignments are
            managed in Locations → Counters; names below use the selected
            location.
          </p>
          {error && !staffDialogOpen && !confirmAction ? (
            <OperationAlert color="red" title="Unable to update staff">
              {error}
            </OperationAlert>
          ) : null}
          <StaffManagement
            members={staff}
            actorId={user?.id || ""}
            owner={isOwner}
            admin={isAdmin}
            counters={serviceCounters}
            countersAvailable={!countersQuery.isPending && !countersQuery.isError}
            onRole={(member, role) => confirmStaffChange(member, "role", role)}
            onStatus={(member, active) =>
              confirmStaffChange(member, "status", active)
            }
            onRemove={(member) => confirmStaffChange(member, "remove")}
          />
        </OperationPanel>
      </ConfigurationScope>
    );
  }

  function renderClientsPage() {
    if (clientsQuery.isError || clientsQuery.isPending)
      return (
        <OperationScope>
          <OperationQueryState
            loading={clientsQuery.isPending}
            error={clientsQuery.error}
            onRetry={() => void clientsQuery.refetch()}
          />
        </OperationScope>
      );
    return (
      <OperationScope busy={Boolean(busyAction)}>
        <OperationPanel>
          <div className="ops-stack">
            <div className="ops-row ops-between">
              <div>
                <p className="vendor-eyebrow">Clients</p>
                <h2 className="ops-heading">Customer history</h2><p className="ops-muted">Search and sort cover the records loaded within this history window.</p>
              </div>
              <QueueBadge variant="outline">
                {clients?.historyLabel || "History window"}
              </QueueBadge>
            </div>
            <div className="ops-row">
              <OperationInput
                label="Search loaded clients"
                placeholder="Name, contact, ticket, status"
                value={clientsSearch}
                onChange={(event) => {
                  setClientsSearch(event.currentTarget.value);
                  setClientsPage(1);
                }}
              />
              <OperationSelect
                label="Sort by"
                data={[
                  { value: "latestVisitDesc", label: "Latest visit newest" },
                  { value: "latestVisitAsc", label: "Latest visit oldest" },
                  { value: "nameAsc", label: "Name A-Z" },
                  { value: "nameDesc", label: "Name Z-A" },
                  { value: "visitsDesc", label: "Most visits" },
                  { value: "visitsAsc", label: "Fewest visits" },
                ]}
                value={clientsSort}
                onChange={(value) =>
                  setClientsSort((value as ClientSort) || "latestVisitDesc")
                }
              />
            </div>
            <div className="ops-table">
              <QueueTable role="table" className="ops-data-table">
                <QueueTableHeader role="rowgroup">
                  <QueueTableRow role="row">
                    <QueueTableHead role="columnheader" scope="col">ID</QueueTableHead>
                    <QueueTableHead role="columnheader" scope="col">Customer</QueueTableHead>
                    <QueueTableHead role="columnheader" scope="col">Contact</QueueTableHead>
                    <QueueTableHead role="columnheader" scope="col">Visits</QueueTableHead>
                    <QueueTableHead role="columnheader" scope="col">Latest ticket</QueueTableHead>
                    <QueueTableHead role="columnheader" scope="col">Latest visit</QueueTableHead>
                  </QueueTableRow>
                </QueueTableHeader>
                <QueueTableBody role="rowgroup">
                  {paginatedClients.length ? (
                    paginatedClients.map((client) => (
                      <QueueTableRow role="row" key={client.id}>
                        <QueueTableCell role="cell" data-label="ID">{client.id}</QueueTableCell>
                        <QueueTableCell role="cell" data-label="Customer">{client.customerName}</QueueTableCell>
                        <QueueTableCell role="cell" data-label="Contact">
                          {[client.customerEmail, client.customerPhone]
                            .filter(Boolean)
                            .join(" | ") || "—"}
                        </QueueTableCell>
                        <QueueTableCell role="cell" data-label="Visits">{client.visitCount}</QueueTableCell>
                        <QueueTableCell role="cell" data-label="Latest ticket">
                          {client.latestTicketNumber}
                        </QueueTableCell>
                        <QueueTableCell role="cell" data-label="Latest visit">
                          {formatDateTime(client.latestVisitAt)}
                        </QueueTableCell>
                      </QueueTableRow>
                    ))
                  ) : (
                    <QueueTableRow role="row">
                      <QueueTableCell role="cell" colSpan={6}>
                        <OperationEmpty
                          title={
                            clientsSearch
                              ? "No matching clients."
                              : "No client history yet."
                          }
                          text={
                            clientsSearch
                              ? "Try a different search term or reset the sort."
                              : "Client records appear after tickets are created."
                          }
                        />
                      </QueueTableCell>
                    </QueueTableRow>
                  )}
                </QueueTableBody>
              </QueueTable>
            </div>
            <div className="ops-row ops-between">
              <p className="ops-muted">
                Showing{" "}
                {paginatedClients.length
                  ? (clientsVisiblePage - 1) * CLIENTS_PAGE_SIZE + 1
                  : 0}
                -
                {Math.min(
                  clientsVisiblePage * CLIENTS_PAGE_SIZE,
                  filteredClients.length,
                )}{" "}
                of {filteredClients.length}
              </p>
              <OperationPagination
                total={clientsTotalPages}
                value={clientsVisiblePage}
                onChange={setClientsPage}
              />
            </div>
          </div>
        </OperationPanel>
      </OperationScope>
    );
  }

  function renderHistoryPage() {
    const exportTypeOptions = [
      effectiveEntitlements?.csvExport ? { value: "csv", label: "CSV" } : null,
      effectiveEntitlements?.pdfExport ? { value: "pdf", label: "PDF" } : null,
    ].filter(Boolean) as Array<{
      value: "csv" | "pdf";
      label: string;
    }>;
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
                  : "1 Year",
      })) || [];
    if (historyQuery.isError || historyQuery.isPending)
      return (
        <OperationScope>
          <OperationQueryState
            loading={historyQuery.isPending}
            error={historyQuery.error}
            onRetry={() => void historyQuery.refetch()}
          />
        </OperationScope>
      );
    return (
      <OperationScope busy={Boolean(busyAction)}>
        <OperationPanel>
          <div className="ops-stack">
            <div className="ops-row ops-between">
              <div>
                <p className="vendor-eyebrow">History</p>
                <h2 className="ops-heading">Completed queue activity</h2><p className="ops-muted">Search covers up to 50 loaded records. Export periods are separate from this list.</p>
              </div>
              <QueueBadge variant="outline">
                {history?.historyLabel || "Recent history"}
              </QueueBadge>
            </div>
            {canExportHistory &&
            exportTypeOptions.length &&
            historyRangeOptions.length ? (
              <div className="ops-row">
                <OperationSelect
                  data={exportTypeOptions}
                  label="Export type"
                  value={historyExportFormat}
                  onChange={(value) =>
                    setHistoryExportFormat(value as "csv" | "pdf" | null)
                  }
                />
                <OperationSelect
                  data={historyRangeOptions}
                  label="Export period"
                  value={historyExportRange}
                  onChange={(value) =>
                    setHistoryExportRange(value as HistoryExportRange | null)
                  }
                />
                <OperationButton
                  disabled={!historyExportFormat || !historyExportRange}
                  onClick={() =>
                    historyExportFormat &&
                    historyExportRange &&
                    handleHistoryExport(historyExportRange, historyExportFormat)
                  }
                  variant="outline"
                >
                  Export
                </OperationButton>
              </div>
            ) : null}
            <div className="ops-row">
              <OperationInput
                label="Search loaded history"
                placeholder="Ticket, customer, status, lookup code"
                value={historySearch}
                onChange={(event) => {
                  setHistorySearch(event.currentTarget.value);
                  setHistoryPage(1);
                }}
              />
              <OperationSelect
                label="Sort by"
                data={[
                  { value: "updatedDesc", label: "Updated newest" },
                  { value: "updatedAsc", label: "Updated oldest" },
                  { value: "ticketAsc", label: "Ticket A-Z" },
                  { value: "ticketDesc", label: "Ticket Z-A" },
                  { value: "customerAsc", label: "Customer A-Z" },
                  { value: "customerDesc", label: "Customer Z-A" },
                ]}
                value={historySort}
                onChange={(value) =>
                  setHistorySort((value as HistorySort) || "updatedDesc")
                }
              />
            </div>
            <div className="ops-table">
              <QueueTable role="table" className="ops-data-table">
                <QueueTableHeader role="rowgroup">
                  <QueueTableRow role="row">
                    <QueueTableHead role="columnheader" scope="col">ID</QueueTableHead>
                    <QueueTableHead role="columnheader" scope="col">Ticket</QueueTableHead>
                    <QueueTableHead role="columnheader" scope="col">Customer</QueueTableHead>
                    <QueueTableHead role="columnheader" scope="col">Status</QueueTableHead>
                    <QueueTableHead role="columnheader" scope="col">Updated</QueueTableHead>
                  </QueueTableRow>
                </QueueTableHeader>
                <QueueTableBody role="rowgroup">
                  {paginatedHistoryTickets.length ? (
                    paginatedHistoryTickets.map((ticket) => (
                      <QueueTableRow role="row" key={ticket.id}>
                        <QueueTableCell role="cell" data-label="ID">{ticket.id}</QueueTableCell>
                        <QueueTableCell role="cell" data-label="Ticket">{ticket.ticketNumber}</QueueTableCell>
                        <QueueTableCell role="cell" data-label="Customer">{ticket.customerName}</QueueTableCell>
                        <QueueTableCell role="cell" data-label="Status">
                          <QueueBadge variant="outline">
                            {ticket.status}
                          </QueueBadge>
                        </QueueTableCell>
                        <QueueTableCell role="cell" data-label="Updated">
                          {formatDateTime(ticket.updatedAt)}
                        </QueueTableCell>
                      </QueueTableRow>
                    ))
                  ) : (
                    <QueueTableRow role="row">
                      <QueueTableCell role="cell" colSpan={5}>
                        <OperationEmpty
                          title={
                            historySearch
                              ? "No matching history records."
                              : "No completed queue activity yet."
                          }
                          text={
                            historySearch
                              ? "Try a different search term or reset the sort."
                              : "Completed queue records appear here within your plan’s history window."
                          }
                        />
                      </QueueTableCell>
                    </QueueTableRow>
                  )}
                </QueueTableBody>
              </QueueTable>
            </div>
            <div className="ops-row ops-between">
              <p className="ops-muted">
                Showing{" "}
                {paginatedHistoryTickets.length
                  ? (historyVisiblePage - 1) * HISTORY_PAGE_SIZE + 1
                  : 0}
                -
                {Math.min(
                  historyVisiblePage * HISTORY_PAGE_SIZE,
                  filteredHistoryTickets.length,
                )}{" "}
                of {filteredHistoryTickets.length}
              </p>
              <OperationPagination
                total={historyTotalPages}
                value={historyVisiblePage}
                onChange={setHistoryPage}
              />
            </div>
          </div>
        </OperationPanel>
      </OperationScope>
    );
  }

  function renderPeriodTicketUsage() {
    return <div className="queue-stack">
      <OperationMetric label="Tickets" value={periodUsageQuery.isPending ? "Loading usage…" : periodTicketMetric.value} detail={periodTicketMetric.detail} />
      {periodUsageQuery.isError ? <OperationButton variant="outline" className="v:min-h-11 v:w-full v:sm:w-fit" onClick={() => void periodUsageQuery.refetch()} loading={periodUsageQuery.isFetching}>Retry usage</OperationButton> : null}
    </div>;
  }

  function renderReportsPage() {
    const ready = !dashboardBootstrapQuery.error && snapshot?.tenant.slug === selectedTenantSlug && snapshot?.location?.slug === selectedLocationSlug;
    return <div className="config-page">
      {!ready || !snapshot ? <OperationQueryState loading={!dashboardBootstrapQuery.error} error={dashboardBootstrapQuery.error} onRetry={()=>void dashboardBootstrapQuery.refetch()} /> : <div className="ops-grid-2"><OperationMetric label="Waiting tickets" value={snapshot.stats.waitingCount} detail="At the selected location" /><OperationMetric label="Tickets served today" value={ticketUsage} detail="At the selected location" /><OperationMetric label="Estimated wait" value={`${snapshot.stats.estimatedWaitMinutes} min`} detail="Current queue estimate" /><OperationMetric label="Called ticket" value={selectedCalledTicket?.ticketNumber || "—"} detail={selectedCalledTicket?.customerName || "No called ticket for the selected counter"} /></div>}
      <OperationPanel><h2 className="account-panel-title">Plan consumption</h2>{renderPeriodTicketUsage()}</OperationPanel>
      {ready ? renderRecordedIntervals() : null}
    </div>;
  }

  function renderSecurityPage() {
    const mfaRequired = Boolean(user?.mfaRequired || isOwner || isAdmin);
    const totpMfaEnabled = Boolean(user?.totpMfaEnabled);

    return (
      <AccountStack gap="md">
        {!requiresMfaEnrollment ? <AccountCard className="neura-card vendor-security-card" padding="lg">
          <AccountStack gap="md">
            <div>
              <AccountText className="neura-label">Account access</AccountText>
              <AccountTitle order={3}>Change password</AccountTitle>
              <AccountText c="dimmed" mt="xs">
                Changing your password closes this session and all other active sessions.
              </AccountText>
            </div>
            <form onSubmit={handlePasswordChange}>
              <AccountStack gap="md">
                <AccountPassword
                  autoComplete="current-password"
                  label="Current password"
                  name="currentPassword"
                  required
                  value={passwordForm.currentPassword}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
                />
                <AccountPassword
                  autoComplete="new-password"
                  label="New password"
                  name="newPassword"
                  required
                  value={passwordForm.newPassword}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                />
                <AccountButton
                  className="neura-primary-button"
                  loading={passwordBusy}
                  type="submit"
                  w={{ base: "100%", sm: "fit-content" }}
                >
                  Change password
                </AccountButton>
              </AccountStack>
            </form>
          </AccountStack>
        </AccountCard> : null}

        <AccountCard className="neura-card vendor-security-card" padding="lg">
          <AccountStack gap="md">
            <div>
              <AccountText className="neura-label">2FA/MFA</AccountText>
              <AccountTitle order={3}>Multi-factor authentication</AccountTitle>
              <AccountText c="dimmed" mt="xs">
                This protection belongs to your account and applies across every vendor workspace you can access.
              </AccountText>
            </div>
            <AccountGroup gap="sm">
              <AccountBadge color={mfaEnabled ? "teal" : "gray"} variant="light">
                {mfaEnabled ? "Enabled" : "Not enabled"}
              </AccountBadge>
              <AccountBadge color={mfaRequired ? "orange" : "gray"} variant="light">
                {mfaRequired ? "Required for your role" : "Optional"}
              </AccountBadge>
            </AccountGroup>

            {mfaRequired && !mfaEnabled ? (
              <AccountAlert color="orange" title="Authenticator setup required" variant="light">
                Vendor owners and admins must enable MFA to protect privileged business actions.
              </AccountAlert>
            ) : null}

            {mfaRecoveryCodes.length ? (
              <AccountAlert color="teal" title="Save your recovery codes" variant="light">
                <AccountStack gap="sm">
                  <AccountText size="sm">These recovery codes are shown only once.</AccountText>
                  <AccountGrid cols={{ base: 1, sm: 2 }} spacing={6}>
                    {mfaRecoveryCodes.map((code) => (
                      <AccountText ff="monospace" key={code}>{code}</AccountText>
                    ))}
                  </AccountGrid>
                  <AccountButton
                    color="teal"
                    onClick={() => setMfaRecoveryCodes([])}
                    variant="light"
                    w="fit-content"
                  >
                    I saved these recovery codes
                  </AccountButton>
                </AccountStack>
              </AccountAlert>
            ) : null}

            {!totpMfaEnabled && !mfaSecret && !mfaRecoveryCodes.length ? (
              <AccountButton
                className="neura-primary-button"
                loading={mfaBusy}
                onClick={() => void startMfaEnrollment()}
                w={{ base: "100%", sm: "fit-content" }}
              >
                Set up authenticator
              </AccountButton>
            ) : null}

            {mfaSecret ? (
              <AccountStack gap="md">
                <AccountStack align="center" gap="sm">
                  <AccountText fw={700} ta="center">Scan with your authenticator app</AccountText>
                  <AccountText c="dimmed" maw={460} size="sm" ta="center">
                    Add an account in your authenticator app, then scan this QR code.
                  </AccountText>
                  <div aria-label="GetPrio authenticator setup QR code" className="mfa-setup-qr" role="img">
                    <StyledQRCode aria-label="Authenticator setup QR code" size={192} value={mfaEnrollmentUri} />
                  </div>
                </AccountStack>
                <AccountAlert color="blue" title="Cannot scan the QR code?" variant="light">
                  Enter this secret manually in your authenticator app.
                  <AccountText ff="monospace" mt="xs" style={{ overflowWrap: "anywhere" }}>{mfaSecret}</AccountText>
                </AccountAlert>
                <OtpInputField label="6-digit authenticator code" value={mfaCode} onChange={setMfaCode} disabled={mfaBusy} onVerify={confirmMfaEnrollment} autoVerifyEnabled={Boolean(mfaSecret)} verificationKey={mfaSecret} autoFocus />
                <AccountGroup justify="flex-end">
                  {mfaEnabled && mfaSecret ? (
                    <AccountButton disabled={mfaBusy} onClick={() => void cancelMfaEnrollment()} variant="default">
                      Cancel
                    </AccountButton>
                  ) : null}
                  <AccountButton
                    className="neura-primary-button"
                    disabled={mfaCode.length !== 6}
                    loading={mfaBusy}
                    onClick={() => void confirmMfaEnrollment()}
                  >
                    Verify and enable
                  </AccountButton>
                </AccountGroup>
              </AccountStack>
            ) : null}

            {totpMfaEnabled && !mfaSecret && !mfaRecoveryCodes.length ? (
              <AccountStack gap="md">
                <AccountAlert color="teal" variant="light">
                  Your authenticator is active. Protected sign-ins and sensitive actions can require a security code.
                </AccountAlert>
                {!replacingMfa && !removingMfa ? (
                  <AccountGroup align="stretch">
                    <AccountButton onClick={() => setReplacingMfa(true)} variant="default">
                      Replace authenticator
                    </AccountButton>
                    {!mfaRequired ? (
                      <AccountButton color="red" onClick={() => setRemovingMfa(true)} variant="light">Remove authenticator</AccountButton>
                    ) : null}
                  </AccountGroup>
                ) : null}

                {replacingMfa ? (
                  <AccountCard className="vendor-security-action" padding="md" withBorder>
                    <AccountStack gap="md">
                      <div>
                        <AccountTitle order={3}>Replace authenticator</AccountTitle>
                        <AccountText c="dimmed" size="sm">
                          Confirm your password and current authenticator code before scanning a replacement QR code.
                        </AccountText>
                      </div>
                      <AccountPassword
                        autoComplete="current-password"
                        label="Current password"
                        required
                        value={replacementPassword}
                        onChange={(event) => setReplacementPassword(event.target.value)}
                      />
                      <OtpInputField label="Current authenticator code" value={replacementCode} onChange={setReplacementCode} disabled={mfaBusy} onVerify={startMfaReplacement} autoVerifyEnabled={Boolean(replacementPassword)} required />
                      <AccountGroup justify="flex-end">
                        <AccountButton disabled={mfaBusy} onClick={() => {if(discardAccountTask(true,Boolean(replacementPassword || replacementCode))){setReplacingMfa(false);setReplacementPassword("");setReplacementCode("");}}} variant="default">Cancel</AccountButton>
                        <AccountButton
                          className="neura-primary-button"
                          disabled={!replacementPassword || replacementCode.length !== 6}
                          loading={mfaBusy}
                          onClick={() => void startMfaReplacement()}
                        >
                          Verify and replace
                        </AccountButton>
                      </AccountGroup>
                    </AccountStack>
                  </AccountCard>
                ) : null}

                {removingMfa && !mfaRequired ? (
                  <AccountCard className="vendor-security-action" padding="md" withBorder>
                    <AccountStack gap="md">
                      <AccountAlert color="red" title="Your account will be less secure" variant="light">
                        This revokes your authenticator and recovery codes. {user?.emailMfaEnabled ? "Email OTP will remain enabled." : "Your account will no longer have MFA."} Other sessions will be closed.
                      </AccountAlert>
                      <AccountPassword
                        autoComplete="current-password"
                        label="Current password"
                        required
                        value={removalPassword}
                        onChange={(event) => setRemovalPassword(event.target.value)}
                      />
                      <OtpInputField label="Current authenticator code" value={removalCode} onChange={setRemovalCode} disabled={mfaBusy} onVerify={removeMfa} autoVerifyEnabled={Boolean(removalPassword) && removalAcknowledged && !removalRecoveryCode} description="Use this or an unused recovery code below." />
                      <AccountInput
                        autoComplete="one-time-code"
                        description="Use this only if your authenticator is unavailable."
                        label="Recovery code"
                        value={removalRecoveryCode}
                        onChange={(event) => setRemovalRecoveryCode(event.target.value)}
                      />
                      <ConfigurationCheck
                        checked={removalAcknowledged}
                        label="I understand that removing MFA reduces my account security."
                        onChange={(event)=>setRemovalAcknowledged(event.currentTarget.checked)}
                      />
                      <AccountGroup justify="flex-end">
                        <AccountButton disabled={mfaBusy} onClick={() => {if(discardAccountTask(true,Boolean(removalPassword || removalCode || removalRecoveryCode))){setRemovingMfa(false);setRemovalPassword("");setRemovalCode("");setRemovalRecoveryCode("");setRemovalAcknowledged(false);}}} variant="default">Keep MFA</AccountButton>
                        <AccountButton
                          color="red"
                          disabled={
                            !removalAcknowledged ||
                            !removalPassword ||
                            (removalCode.length !== 6 && !removalRecoveryCode.trim())
                          }
                          loading={mfaBusy}
                          onClick={() => void removeMfa()}
                        >
                          Remove authenticator
                        </AccountButton>
                      </AccountGroup>
                    </AccountStack>
                  </AccountCard>
                ) : null}
              </AccountStack>
            ) : null}
          </AccountStack>
        </AccountCard>
        <EmailMfaSettingsPanel
          variant="vendor"
          onUpdated={(updatedUser) => setMfaEnabled(Boolean(updatedUser?.mfaEnabled))}
        />
        <VendorAccountDeletionPanel />
      </AccountStack>
    );
  }

  function renderAccountPage() {
    const canAccessBillingTabs = isOwner || isAdmin;
    const subscription = billing?.subscription || null;
    const isFreeSubscription = subscription?.planSlug === "free";
    const plan = subscription
      ? billing?.plans.find((item) => item.slug === subscription.planSlug) || null
      : null;

    const billingUnavailable = billingOverviewQuery.isPending || Boolean(billingOverviewQuery.error);
    const billingReadState = <OperationQueryState loading={billingOverviewQuery.isPending} error={billingOverviewQuery.error} onRetry={()=>void billingOverviewQuery.refetch()} />;
    return (
      <AccountPresentation onBusyChange={setAccountPanelBusy} onDraftChange={setAccountPanelDraft}>
      <ConfigurationScope busy={Boolean(accountProfileBusy || passwordBusy || mfaBusy || accountPanelBusy || busyAction)}>
      <div className="config-page account-page">
          <ConfigTabs
            className="vendor-account-tabs"
            value={accountTab}
            onValueChange={(value) => {
              if (!value || value === accountTab || !canLeaveFeature()) return;
              const nextTab = (value || "profile") as AccountTab;
              if (!canAccessBillingTabs && (nextTab === "subscription" || nextTab === "billing")) {
                setAccountTab("profile");
                return;
              }
              setAccountTab(nextTab);
            }}
          >
            <ConfigTabsList variant="line" className="config-tabs-list">
              {canAccessBillingTabs && !requiresMfaEnrollment ? (
                <>
                  <ConfigTabsTrigger value="subscription">Subscription</ConfigTabsTrigger>
                  <ConfigTabsTrigger value="billing">Billing</ConfigTabsTrigger>
                </>
              ) : null}
              {!requiresMfaEnrollment ? <ConfigTabsTrigger value="profile">Profile</ConfigTabsTrigger> : null}
              <ConfigTabsTrigger value="security">Security</ConfigTabsTrigger>
            </ConfigTabsList>

            {canAccessBillingTabs ? (
              <ConfigTabsContent className="queue-stack" value="subscription">
                {billingUnavailable ? billingReadState : <AccountStack gap="md">
                  <AccountGroup justify="space-between" align="flex-start">
                    <div>
                      <AccountText className="neura-label">Subscription</AccountText>
                      <AccountTitle order={3}>{renderActivePlanName()}</AccountTitle>
                      <AccountText c="dimmed" size="sm">
                        {subscription
                          ? `${subscription.status} plan access for ${snapshot?.tenant.name || selectedTenantSlug}.`
                          : "Choose a plan to unlock tenant entitlements."}
                      </AccountText>
                    </div>
                    {isFreeSubscription ? (
                      <AccountButton
                        className="neura-primary-button"
                        onClick={() => openPlanDialog(true)}
                        w={{ base: "100%", sm: "fit-content" }}
                      >
                        Upgrade to paid plan
                      </AccountButton>
                    ) : subscription?.currentPeriodEnd ? (
                      <AccountBadge variant="light">Renews {formatDate(subscription.currentPeriodEnd)}</AccountBadge>
                    ) : null}
                  </AccountGroup>
                  <AccountGrid cols={1}>
                    {renderPeriodTicketUsage()}
                  </AccountGrid>
                  {!activeSubscription ? <div>{renderPlanCards()}</div> : !isFreeSubscription ? (
                    <AccountButton onClick={() => openPlanDialog()} variant="light" w={{ base: "100%", sm: "fit-content" }}>
                      Review available plans
                    </AccountButton>
                  ) : null}
                </AccountStack>}
              </ConfigTabsContent>
            ) : null}

            {canAccessBillingTabs ? (
              <ConfigTabsContent className="queue-stack" value="billing">
                {billingUnavailable ? billingReadState : <AccountStack gap="md">
                  <div>
                    <AccountText className="neura-label">Billing</AccountText>
                    <AccountTitle order={3}>Billing details</AccountTitle>
                    <AccountText c="dimmed" size="sm">
                      Review the server-owned billing record and operational capacity for this workspace.
                    </AccountText>
                  </div>
                  {isFreeSubscription ? (
                    <AccountGrid cols={{ base: 1, sm: 2, lg: 4 }}>
                      <OperationMetric
                        label="Current plan"
                        value={subscription.planName}
                        detail={plan ? getPlanPriceDisplay(plan) : "No recurring charge"}
                      />
                    </AccountGrid>
                  ) : subscription ? (
                    <>
                      <AccountGrid cols={{ base: 1, sm: 2, lg: 4 }}>
                        <OperationMetric
                          label="Current plan"
                          value={subscription.planName}
                          detail={plan ? getPlanPriceDisplay(plan) : "Plan pricing"}
                        />
                        <OperationMetric label="Billing interval" value={subscription.billingInterval} detail="Subscription cadence" />
                        <OperationMetric label="Provider" value={subscription.provider} detail="Payment processor" />
                        <OperationMetric
                          label="Current period"
                          value={subscription.currentPeriodEnd ? formatDate(subscription.currentPeriodEnd) : "Open-ended"}
                          detail={subscription.currentPeriodEnd ? "Period end" : "No scheduled renewal"}
                        />
                      </AccountGrid>
                      <VendorCapacityPanel key={selectedTenantSlug} tenantSlug={selectedTenantSlug} token={token || ""} />
                    </>
                  ) : (
                    <AccountAlert color="blue" variant="light">
                      This workspace has no billing record yet. Choose a plan from the Subscription tab to begin.
                    </AccountAlert>
                  )}
                </AccountStack>}
              </ConfigTabsContent>
            ) : null}

            <ConfigTabsContent className="queue-stack" value="profile">
              <OperationPanel><form onSubmit={handleAccountProfileSave}>
                <AccountStack gap="md">
                  <div>
                    <AccountText className="neura-label">Vendor account</AccountText>
                    <AccountTitle order={3}>Account details</AccountTitle>
                    <AccountText c="dimmed" size="sm">
                      These details belong to your user account and follow you across vendor workspaces.
                    </AccountText>
                  </div>
                  <AccountGrid cols={{ base: 1, md: 2 }}>
                    <AccountInput
                      label="Full name"
                      required
                      value={accountProfileForm.name}
                      onChange={(event) => setAccountProfileForm((current) => ({ ...current, name: event.target.value }))}
                    />
                    <AccountInput
                      label="Display name"
                      description="Shown to teammates and customers where your account is identified."
                      value={accountProfileForm.displayName}
                      onChange={(event) => setAccountProfileForm((current) => ({ ...current, displayName: event.target.value }))}
                    />
                    <AccountInput disabled label="Username" value={user?.username || "Not set"} />
                    <AccountInput disabled label="Email" value={user?.email || "Not set"} />
                    <AccountInput disabled label="Phone" value={user?.phone || "Not set"} />
                    <AccountInput disabled label="Workspace role" value={selectedTenantRole || "No active role"} />
                  </AccountGrid>
                  <AccountButton
                    className="neura-primary-button"
                    loading={accountProfileBusy}
                    type="submit"
                    w={{ base: "100%", sm: "fit-content" }}
                  >
                    Save account details
                  </AccountButton>
                </AccountStack>
              </form></OperationPanel>
              <EmailChangePanel
                currentEmail={user?.email || ""}
                onCompleted={async () => { await refreshUser(); }}
                token={token || ""}
              />
              <PhoneChangePanel
                currentPhone={user?.phone}
                onCompleted={async () => { await refreshUser(); }}
                token={token || ""}
              />
            </ConfigTabsContent>

            <ConfigTabsContent className="queue-stack" value="security">
              {renderSecurityPage()}
            </ConfigTabsContent>
          </ConfigTabs>
      </div>
      </ConfigurationScope>
      </AccountPresentation>
    );
  }

  function renderBusinessProfilePreview() {
    const selectedTenant = user?.tenants.find((tenant) => tenant.slug === selectedTenantSlug);
    const previewName = settings.publicProfileDisplayName || settings.name || selectedTenant?.name || "Your business";
    const previewLocation = selectedLocation
      ? [selectedLocation.name, selectedLocation.city, selectedLocation.province].filter(Boolean).join(", ")
      : "Main location";
    const previewStyle = {
      "--vendor-theme-card-bg": businessProfileTheme.cardBackgroundColor,
      "--vendor-theme-logo-fit": businessProfileTheme.logoFit,
      backgroundSize: businessProfileTheme.backgroundImageFit,
      "--vendor-theme-logo-frame-padding": businessProfileTheme.logoFit === "cover" ? "0px" : undefined,
      ...(businessProfileTheme.backgroundImageUrl
        ? {
            backgroundImage: `linear-gradient(rgba(255,255,255,0.2), rgba(255,255,255,0.2)), url(${businessProfileTheme.backgroundImageUrl})`
          }
        : {})
    } as CSSProperties;

    return (
      <Stack gap="xs">
        <Text fw={700}>Profile preview</Text>
        <Text c="dimmed" size="sm">This is how the default profile media will appear on public profile cards.</Text>
        <Paper className="vendor-card vendor-profile-settings-preview" component="div" p={{ base: "md", sm: "lg" }}>
          <Stack gap="md">
            <div
              className={businessProfileTheme.backgroundImageUrl || businessProfileTheme.logoUrl
                ? "vendor-card-image vendor-card-image-themed"
                : "vendor-card-image"}
              style={previewStyle}
            >
              {businessProfileTheme.logoUrl ? (
                <div className="vendor-card-logo-frame">
                  <img alt={`${previewName} logo`} src={businessProfileTheme.logoUrl} />
                </div>
              ) : <IconTicket aria-hidden="true" size={42} />}
            </div>
            {settings.publicProfileCategory ? <Badge color="orange" variant="light">{settings.publicProfileCategory}</Badge> : null}
            <Title order={3}>{previewName}</Title>
            <Group c="dimmed" gap={6} wrap="nowrap">
              <IconMapPin size={16} />
              <Text size="sm">{previewLocation || "Philippines"}</Text>
            </Group>
            {settings.publicProfileDescription ? (
              <RichCampaignDescription className="vendor-profile-preview-description" content={settings.publicProfileDescription} />
            ) : null}
          </Stack>
        </Paper>
      </Stack>
    );
  }

  function markSettingsForm() {
    const form = document.getElementById("vendor-business-profile");
    if (form instanceof HTMLFormElement) unsavedForm.current.mark(form);
  }
  function selectSettingsTab(value: string | null) {
    if (!value || value === settingsTab || !canLeaveFeature()) return;
    setSettings({ ...savedSettings.current });
    setBusinessProfileTheme({ ...savedProfileTheme.current });
    setError("");
    setSettingsTab(value as SettingsTab);
  }
  function renderSettingsPage() {
    const settingsBusy =
      Boolean(busyAction) ||
      boardSettingsBusy ||
      savingNotificationSettings ||
      requestingBrowserPermission;
    const profileDisabled =
      !canManageContactSettings ||
      profileThemeLoading ||
      Boolean(profileThemeError);
    return (
      <ConfigurationScope
        busy={settingsBusy}
        onEdit={(form) => unsavedForm.current.mark(form)}
      >
        <ConfigTabs value={settingsTab} onValueChange={selectSettingsTab}>
          <ConfigTabsList className="config-tabs-list">
            <ConfigTabsTrigger value="contact">
              Business profile
            </ConfigTabsTrigger>
            <ConfigTabsTrigger value="queue">Queue settings</ConfigTabsTrigger>
            <ConfigTabsTrigger value="notifications">
              Notifications
            </ConfigTabsTrigger>
            {isOwner || isAdmin ? (
              <ConfigTabsTrigger value="board">Queue Board</ConfigTabsTrigger>
            ) : null}
          </ConfigTabsList>
          <ConfigTabsContent value="contact">
            <OperationPanel>
              <form
                id="vendor-business-profile"
                onSubmit={handleSaveBusinessProfile}
              >
                <FieldGroup>
                  <div className="ops-list-heading">
                    <h2>Business profile</h2>
                    <p className="ops-muted">
                      Update the details and default images customers see for your
                      business.
                    </p>
                  </div>
                  {!canManageContactSettings ? (
                    <OperationAlert>
                      Only the business owner can change these details and default
                      images.
                    </OperationAlert>
                  ) : null}
                  {canManageContactSettings &&
                  (profileThemeLoading || profileThemeError) ? (
                    <OperationQueryState
                      loading={profileThemeLoading}
                      error={profileThemeError}
                      onRetry={() => setProfileThemeRetry((count) => count + 1)}
                    />
                  ) : null}
                  {error ? (
                    <OperationAlert color="red" title="Unable to save profile">
                      {error}
                    </OperationAlert>
                  ) : null}
                  <ConfigurationSection
                    title="Business details"
                    description="Public profile details apply across this business; location-specific information is managed in Locations."
                  >
                    <ConfigurationInput
                      name="businessName"
                      label="Business name"
                      required
                      maxLength={120}
                      disabled={profileDisabled}
                      value={settings.name}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          name: event.currentTarget.value,
                        }))
                      }
                    />
                    <BusinessCategorySelect
                      vendor
                      disabled={profileDisabled}
                      value={settings.businessCategoryId || null}
                      currentLabel={settings.publicProfileCategory}
                      onChange={(id, name) =>
                        setSettings((current) => ({
                          ...current,
                          businessCategoryId: id,
                          publicProfileCategory: name,
                        }))
                      }
                    />
                    <ConfigurationInput
                      name="publicProfileDisplayName"
                      label="Business display name"
                      description="Shown publicly when set; otherwise the Business name is used."
                      maxLength={120}
                      disabled={profileDisabled}
                      value={settings.publicProfileDisplayName || ""}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          publicProfileDisplayName: event.currentTarget.value,
                        }))
                      }
                    />
                    <div className="queue-stack">
                      <p className="ops-strong">Business description</p>
                      <p className="ops-muted">
                        Shown on public vendor pages and related customer screens.
                      </p>
                      <CampaignDescriptionEditor
                        label="Business description"
                        disabled={profileDisabled || settingsBusy}
                        maxCharacters={1000}
                        value={settings.publicProfileDescription || ""}
                        onChange={(value) => {
                          if (value !== (settings.publicProfileDescription || ""))
                            markSettingsForm();
                          setSettings((current) => ({
                            ...current,
                            publicProfileDescription: value,
                          }));
                        }}
                      />
                    </div>
                  </ConfigurationSection>
                  <ConfigurationSection
                    title="Default profile media"
                    description="Set the default logo and profile background. Location theme setup can override these values."
                  >
                    <div className="config-related-fields">
                      <FieldGroup>
                        <ConfigurationFile
                          accept="image/png,image/jpeg,image/webp"
                          label="Profile background"
                          description="Upload a custom image for the profile visual area."
                          disabled={profileDisabled}
                          onChange={(file) =>
                            void uploadBusinessProfileAsset("background", file)
                          }
                        />
                        <ConfigurationSelect
                          name="defaultBackgroundImageFit"
                          label="Profile background fit"
                          description="Cover fills the profile visual area. Contain shows the full image."
                          data={[
                            { value: "cover", label: "Cover" },
                            { value: "contain", label: "Contain" },
                          ]}
                          disabled={profileDisabled}
                          value={businessProfileTheme.backgroundImageFit}
                          onChange={(value) =>
                            setBusinessProfileThemeField(
                              "backgroundImageFit",
                              value === "contain" ? "contain" : "cover",
                            )
                          }
                        />
                        <ConfigurationInput
                          name="defaultBackgroundImageUrl"
                          label="Profile background URL"
                          description="Paste a hosted image URL for the profile visual area."
                          disabled={profileDisabled}
                          value={businessProfileTheme.backgroundImageUrl}
                          onChange={(event) =>
                            setBusinessProfileThemeField(
                              "backgroundImageUrl",
                              event.currentTarget.value,
                            )
                          }
                        />
                        <ConfigurationFile
                          accept="image/png,image/jpeg,image/webp"
                          label="Company logo"
                          description="Displayed inside the circular logo frame."
                          disabled={profileDisabled}
                          onChange={(file) =>
                            void uploadBusinessProfileAsset("logo", file)
                          }
                        />
                        <ConfigurationInput
                          name="defaultLogoUrl"
                          label="Logo URL"
                          description="Paste a hosted logo URL when not uploading a file."
                          disabled={profileDisabled}
                          value={businessProfileTheme.logoUrl}
                          onChange={(event) =>
                            setBusinessProfileThemeField(
                              "logoUrl",
                              event.currentTarget.value,
                            )
                          }
                        />
                        <ConfigurationSelect
                          name="defaultLogoFit"
                          label="Profile logo fit"
                          description="Contain shows the full logo. Cover fills the circular frame."
                          data={[
                            { value: "contain", label: "Contain" },
                            { value: "cover", label: "Cover" },
                          ]}
                          disabled={profileDisabled}
                          value={businessProfileTheme.logoFit}
                          onChange={(value) =>
                            setBusinessProfileThemeField(
                              "logoFit",
                              value === "cover" ? "cover" : "contain",
                            )
                          }
                        />
                      </FieldGroup>
                      {renderBusinessProfilePreview()}
                    </div>
                  </ConfigurationSection>
                  <OperationButton
                    type="submit"
                    disabled={profileDisabled}
                    loading={settingsBusy}
                  >
                    Save business profile
                  </OperationButton>
                </FieldGroup>
              </form>
            </OperationPanel>
          </ConfigTabsContent>
          <ConfigTabsContent value="queue">
            <OperationPanel>
              <form id="vendor-queue-settings" onSubmit={handleSaveSettings}>
                <FieldGroup>
                  <div className="ops-list-heading">
                    <h2>Queue preferences</h2>
                    <p className="ops-muted">
                      Manage ticket numbering, notifications and automatic intake
                      controls. Queue Day closure remains a separate server-owned
                      schedule.
                    </p>
                  </div>
                  {error ? (
                    <OperationAlert
                      color="red"
                      title="Unable to save queue settings"
                    >
                      {error}
                    </OperationAlert>
                  ) : null}
                  <ConfigurationSection
                    title="Ticket numbering and estimates"
                    description="These preferences retain the current ordinary queue behavior; they do not activate resource pools or AI forecasting."
                  >
                    <ConfigurationInput
                      name="queuePrefix"
                      label="Queue prefix"
                      description="Up to four characters shown before ticket numbers."
                      maxLength={4}
                      required
                      value={settings.queuePrefix}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          queuePrefix: event.currentTarget.value.toUpperCase(),
                        }))
                      }
                    />
                    <ConfigurationNumber
                      name="averageServiceMinutes"
                      label="Average service minutes"
                      min={1}
                      required
                      value={settings.averageServiceMinutes}
                      onChange={(value) =>
                        setSettings((current) => ({
                          ...current,
                          averageServiceMinutes: value,
                        }))
                      }
                    />
                    <ConfigurationNumber
                      name="notificationThreshold"
                      label="Notify when within"
                      description="Notify customers when their ticket is within this many places of being called."
                      min={1}
                      required
                      value={settings.notificationThreshold}
                      onChange={(value) =>
                        setSettings((current) => ({
                          ...current,
                          notificationThreshold: value,
                        }))
                      }
                    />
                  </ConfigurationSection>
                  <ConfigurationSection
                    title="Automatic intake"
                    description="Automatic pauses limit new joins. They do not close the Queue Day or finish active tickets."
                  >
                    <ConfigurationCheck
                      name="autoPauseEnabled"
                      label="Enable auto-pause intake"
                      checked={settings.autoPauseEnabled}
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
                            : "",
                        }))
                      }
                    />
                    <ConfigurationNumber
                      name="autoPauseThreshold"
                      label="Auto-pause threshold"
                      description="When waiting tickets reach this number, new joins pause automatically."
                      min={1}
                      max={500}
                      required={settings.autoPauseEnabled}
                      disabled={!settings.autoPauseEnabled}
                      value={
                        settings.autoPauseEnabled
                          ? settings.autoPauseThreshold
                          : ""
                      }
                      onChange={(value) =>
                        setSettings((current) => ({
                          ...current,
                          autoPauseThreshold: value,
                        }))
                      }
                    />
                    <ConfigurationCheck
                      name="autoResumeEnabled"
                      label="Enable auto-resume intake"
                      checked={settings.autoResumeEnabled}
                      disabled={!settings.autoPauseEnabled}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          autoResumeEnabled: event.currentTarget.checked,
                          autoResumeVacancyPercent: event.currentTarget.checked
                            ? Number(current.autoResumeVacancyPercent) || 20
                            : "",
                        }))
                      }
                    />
                    <ConfigurationNumber
                      name="autoResumeVacancyPercent"
                      label="Auto-resume vacancy percent"
                      min={5}
                      max={50}
                      step={5}
                      required={
                        settings.autoPauseEnabled && settings.autoResumeEnabled
                      }
                      disabled={
                        !settings.autoPauseEnabled || !settings.autoResumeEnabled
                      }
                      value={
                        settings.autoPauseEnabled && settings.autoResumeEnabled
                          ? settings.autoResumeVacancyPercent
                          : ""
                      }
                      onChange={(value) =>
                        setSettings((current) => ({
                          ...current,
                          autoResumeVacancyPercent: value,
                        }))
                      }
                    />
                    <p className="ops-muted">
                      {settings.autoPauseEnabled && settings.autoResumeEnabled
                        ? `With a threshold of ${Number(settings.autoPauseThreshold) || 0}, intake will reopen at ${Math.floor((Number(settings.autoPauseThreshold) || 0) * (1 - (Number(settings.autoResumeVacancyPercent) || 20) / 100))} waiting tickets or below. This only resumes threshold-based pauses.`
                        : "Only applies to queues paused automatically by threshold."}
                    </p>
                  </ConfigurationSection>
                  <OperationButton type="submit" loading={settingsBusy}>
                    Save queue settings
                  </OperationButton>
                </FieldGroup>
              </form>
            </OperationPanel>
          </ConfigTabsContent>
          <ConfigTabsContent value="notifications">
            <OperationPanel>
              <div className="queue-stack">
                <div className="ops-list-heading">
                  <h2>Operational alerts</h2>
                  <p className="ops-muted">
                    Browser notifications are used after login for vendor
                    operational alerts. Email remains the fallback channel.
                  </p>
                </div>
                {error ? (
                  <OperationAlert color="red" title="Unable to save alerts">
                    {error}
                  </OperationAlert>
                ) : null}
                <OperationAlert>
                  Vendor staff assigned to a booking and payment reviewers receive
                  these alerts for the business.
                </OperationAlert>
                <OperationAlert>
                  {browserNotificationsSupported
                    ? browserNotificationsSecure
                      ? `Browser notifications are available in this browser. Current permission: ${browserPermission}.`
                      : "Browser notifications require a secure context such as https:// or localhost."
                    : "This browser does not support browser notifications."}
                </OperationAlert>
                <div className="ops-row config-actions">
                  <OperationButton
                    variant="outline"
                    disabled={
                      !browserNotificationsSupported ||
                      !browserNotificationsSecure ||
                      browserPushSubscribed ||
                      browserPermission === "denied"
                    }
                    loading={requestingBrowserPermission}
                    onClick={handleRequestBrowserPermission}
                  >
                    {browserPushSubscribed
                      ? "Browser notifications synced"
                      : browserPermission === "granted"
                        ? "Sync browser notifications"
                        : "Allow browser notifications"}
                  </OperationButton>
                  <p className="ops-muted">
                    {browserNotificationsSupported
                      ? browserNotificationsSecure
                        ? browserPermission === "granted"
                          ? browserPushSubscribed
                            ? "This browser is subscribed to vendor alerts."
                            : "Permission is granted; sync this browser to subscribe to vendor alerts."
                          : browserPermission === "denied"
                            ? "Permission was denied in this browser. You can change it in browser settings."
                            : "Click the button to allow browser notifications for this business."
                        : "Open this page on https:// or localhost to request permission."
                      : "Use a browser that supports notifications."}
                  </p>
                </div>
                <ConfigurationSection
                  title="Alert events"
                  description="Changes save immediately. These preferences do not replace browser permission or push subscription."
                >
                  <ConfigurationCheck
                    checked={vendorNotificationSettings.queueJoin}
                    label="New queue joins"
                    onChange={(event) =>
                      void handleVendorNotificationToggle(
                        "queueJoin",
                        event.currentTarget.checked,
                      )
                    }
                  />
                  <ConfigurationCheck
                    checked={vendorNotificationSettings.bookingIntake}
                    label="New booking intake"
                    onChange={(event) =>
                      void handleVendorNotificationToggle(
                        "bookingIntake",
                        event.currentTarget.checked,
                      )
                    }
                  />
                  <ConfigurationCheck
                    checked={vendorNotificationSettings.paymentProofReview}
                    label="Payment proof review"
                    onChange={(event) =>
                      void handleVendorNotificationToggle(
                        "paymentProofReview",
                        event.currentTarget.checked,
                      )
                    }
                  />
                  <ConfigurationCheck
                    checked={vendorNotificationSettings.bookingStatusChanges}
                    label="Booking status changes"
                    onChange={(event) =>
                      void handleVendorNotificationToggle(
                        "bookingStatusChanges",
                        event.currentTarget.checked,
                      )
                    }
                  />
                </ConfigurationSection>
              </div>
            </OperationPanel>
          </ConfigTabsContent>
          <ConfigTabsContent value="board">
            {token &&
            selectedTenantSlug &&
            selectedLocationSlug &&
            (isOwner || isAdmin) ? (
              <QueueBoardSettings
                key={`${selectedTenantSlug}:${selectedLocationSlug}`}
                token={token}
                tenantSlug={selectedTenantSlug}
                locationSlug={selectedLocationSlug}
                onBusyChange={setBoardSettingsBusy}
                onChanged={() => void reloadDashboardSnapshot()}
              />
            ) : (
              <OperationEmpty
                title="Select a location"
                text="Choose the location whose queue board you want to manage."
              />
            )}
          </ConfigTabsContent>
        </ConfigTabs>
      </ConfigurationScope>
    );
  }

    function renderCounterDialog() {
    const close = () => {
      if (canLeaveFeature()) {
        unsavedForm.current.discardId("vendor-counter-editor");
        setCounterDialogOpen(false);
      }
    };
    return (
      <TaskDialog
        opened={counterDialogOpen}
        onClose={close}
        busy={Boolean(busyAction)}
        eyebrow="COUNTER SETTINGS"
        title={
          editingCounterSlug
            ? `Edit ${counterForm.name || "counter"}`
            : "Add counter"
        }
        description={`Manage a dispatch lane and its staff at ${selectedLocation?.name || "this location"}.`}
        footer={
          <>
            <OperationButton
              className="ops-redundant-dismiss"
              variant="outline"
              onClick={close}
            >
              Cancel
            </OperationButton>
            <OperationButton
              type="submit"
              form="vendor-counter-editor"
              loading={busyAction === "counter-save"}
              disabled={
                Boolean(busyAction) ||
                checkingCounterSlug ||
                !counterSlugAvailable
              }
            >
              {editingCounterSlug ? "Save counter" : "Create counter"}
            </OperationButton>
          </>
        }
      >
        <ConfigurationScope
          busy={Boolean(busyAction)}
          onEdit={(form) => unsavedForm.current.mark(form)}
        >
          <form
            id="vendor-counter-editor"
            className="ops-stack"
            onSubmit={handleSaveCounter}
          >
            {error ? (
              <OperationAlert color="red" title="Unable to save counter">
                {error}
              </OperationAlert>
            ) : null}
            <ConfigurationInput
              name="counterName"
              label="Counter name"
              required
              value={counterForm.name}
              onChange={(event) => {
                const name = event.currentTarget.value;
                setCounterForm((current) => ({
                  ...current,
                  name,
                  slug: counterSlugManuallyEdited
                    ? current.slug
                    : buildCounterSlug(name),
                }));
              }}
            />
            <ConfigurationInput
              name="counterSlug"
              label="Counter link name"
              required
              description={
                checkingCounterSlug
                  ? "Checking link availability…"
                  : counterSlugMessage ||
                    "A short, unique name for this counter at the selected location."
              }
              error={
                !checkingCounterSlug &&
                !counterSlugAvailable &&
                counterForm.slug
                  ? counterSlugMessage || "This link name is already taken."
                  : undefined
              }
              value={counterForm.slug}
              onChange={(event) => {
                setCounterSlugManuallyEdited(true);
                setCounterForm((current) => ({
                  ...current,
                  slug: buildCounterSlug(event.target.value),
                }));
              }}
            />
            <ConfigurationCheck
              name="counterIsActive"
              checked={counterForm.isActive}
              label="Enable counter"
              onChange={(event) =>
                setCounterForm((current) => ({
                  ...current,
                  isActive: event.currentTarget.checked,
                }))
              }
            />
            <ConfigurationSection
              title="Assigned staff"
              description="Choose which staff members can operate this counter. Location and role restrictions still apply."
            >
              {!canAccessVendorSection("staff", effectiveEntitlements) ? <p className="ops-muted">Staff management is not available on this plan. Existing assignments are retained.</p> : staffQuery.isPending || staffQuery.isError ? (
                <OperationQueryState
                  loading={staffQuery.isPending}
                  error={staffQuery.error}
                  onRetry={() => void staffQuery.refetch()}
                />
              ) : (
                <CounterStaffAssignments staff={staff} assignedUserIds={counterForm.assignedUserIds || []} onChange={(assignedUserIds) => setCounterForm((current) => ({ ...current, assignedUserIds }))} />
              )}
            </ConfigurationSection>
          </form>
        </ConfigurationScope>
      </TaskDialog>
    );
  }

  function renderStaffDialog() {
    const close = () => {
      if (canLeaveFeature()) {
        unsavedForm.current.discardId("vendor-staff-editor");
        setStaffForm({ email: "", role: "staff" });
        setStaffDialogOpen(false);
      }
    };
    return (
      <TaskDialog
        opened={staffDialogOpen}
        onClose={close}
        busy={Boolean(busyAction)}
        eyebrow="ACCESS MANAGEMENT"
        title="Add staff"
        description="Give someone with an existing GetPrio account access to this business."
        footer={
          <>
            <OperationButton
              variant="outline"
              className="ops-redundant-dismiss"
              disabled={Boolean(busyAction)}
              onClick={close}
            >
              Cancel
            </OperationButton>
            <OperationButton
              type="submit"
              form="vendor-staff-editor"
              disabled={
                Boolean(busyAction) ||
                staffQuery.isPending ||
                staffQuery.isError ||
                staff.length >= staffSeatLimit
              }
              aria-busy={Boolean(busyAction)}
            >
              {busyAction ? "Working…" : "Add staff"}
            </OperationButton>
          </>
        }
      >
        <ConfigurationScope
          busy={Boolean(busyAction)}
          onEdit={(form) => unsavedForm.current.mark(form)}
        >
          <form id="vendor-staff-editor" onSubmit={handleAddStaff}>
            <FieldGroup>
              {error ? (
                <OperationAlert color="red" title="Unable to add staff">
                  {error}
                </OperationAlert>
              ) : null}
              <ConfigurationInput
                name="staffEmail"
                label="Existing account email"
                description="The person must already have a GetPrio account. Adding access here does not create an account."
                required
                type="email"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={staffForm.email}
                onChange={(event) =>
                  setStaffForm((current) => ({
                    ...current,
                    email: event.currentTarget.value,
                  }))
                }
              />
              <ConfigurationSelect
                name="staffRole"
                label="Role"
                required
                data={
                  isOwner
                    ? [
                        { label: "Staff", value: "staff" },
                        { label: "Admin", value: "admin" },
                      ]
                    : [{ label: "Staff", value: "staff" }]
                }
                description={
                  isOwner
                    ? "Staff handle permitted operations. Admins can also manage business configuration and staff access."
                    : "Admins can add Staff accounts. Only an owner can assign Admin access."
                }
                value={staffForm.role}
                onChange={(value) =>
                  setStaffForm((current) => ({
                    ...current,
                    role: value === "admin" ? "admin" : "staff",
                  }))
                }
              />
            </FieldGroup>
          </form>
        </ConfigurationScope>
      </TaskDialog>
    );
  }

  function renderDashboardAlertOverlay() {
    const Confirmation = (["queue", "bookings", "clients", "history", "tenants", "services", "staff"].includes(currentSection) || bookingDetailOpen || rescheduleDialogOpen) ? QueueConfirmation : ConfirmActionModal;
    const overlayAlerts = [
      ...activeQueueAlerts.map((ticket) => ({
        actionLabel: "Open queue",
        body: (
          <>
            {ticket.customerName} joined the queue as{" "}
            <strong>#{ticket.ticketNumber}</strong>
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
            <strong>{booking.reference}</strong>
          </>
        ),
        id: booking.id,
        kind: "booking" as const,
        title: "New booking"
      })),
    ];
    const detailBooking = bookingDetailBooking;
    const detailPaymentReviewable = Boolean(
      canAdminBookings && detailBooking?.paymentProof &&
      detailBooking.paymentStatus === "pending" &&
      (detailBooking.status === "pending" || detailBooking.status === "rescheduled")
    );
    const detailPaymentVerified = Boolean(detailBooking?.paymentStatus === "paid" || detailBooking?.paymentVerifiedAt);
    const detailManualPaymentRequired = Boolean(detailBooking?.serviceManualPaymentRequired);
    const detailPaymentGateActive = Boolean(detailBooking && detailManualPaymentRequired && !detailPaymentVerified);
    const detailBookingExpired = Boolean(detailBooking?.expiredAt);
    const detailCheckInState = detailBooking ? getBookingCheckInState(detailBooking, bookingCheckInNow) : null;
    const detailCampaignBundleItems = detailBooking?.groupFundedCampaign?.bundleItems || [];
    const detailBookingBundleItems = detailBooking?.bundleItems || [];
    const detailServiceItems = detailCampaignBundleItems.length
      ? detailCampaignBundleItems
      : detailBookingBundleItems;
    const detailFundingAdjustmentCents = Math.max(0, Number(detailBooking?.groupFundedCampaign?.roundingAdjustmentCents || 0));
    const detailCampaignTotalCents = Number(detailBooking?.groupFundedCampaign?.targetAmountCents || 0) + detailFundingAdjustmentCents;
    const detailServiceTotalCents = detailCampaignBundleItems.length
      ? detailCampaignTotalCents
      : detailServiceItems.reduce((total, item) => total + Number(item.priceAmountCents || 0), 0);
    const isGroupFundedDetailBooking = Boolean(detailBooking?.groupFundedBookingId || detailBooking?.bookingPaymentSource === "group_funded");
    const closeBookingDetailModal = () => {
      unsavedForm.current.discardId("vendor-booking-payment");
      setBookingDetailModalId(null);
      setBookingDetailOpen(false);
      setBookingDetailLoading(false);
      setBookingDetailBooking(null);
      setBookingDetailError("");
      setPaymentRejectionReason("");

    };

    return (
      <>
        {overlayAlerts.length && !bookingDetailOpen && !rescheduleDialogOpen && !rescheduleBlockModalOpen && !locationDialogOpen && !counterDialogOpen && !resourceConfigurationDialogOpen && !serviceDialogOpen && !availabilityBlockDialogOpen && !availabilityExceptionDialogOpen && !staffDialogOpen && !confirmAction ? (
          <OperationalAlerts alerts={overlayAlerts} onDismiss={(alert) => {
            if (alert.kind === "queue") clearQueueAlert(alert.id);
            else clearBookingAlert(alert.id);
          }} onOpen={(alert) => {
            if (alert.kind === "queue") {
              clearQueueAlert(alert.id);
              navigate("/dashboard/queue");
              return;
            }
            openBookingDetail(alert.id);
            clearBookingAlert(alert.id);
          }} />
        ) : null}

        <TaskDialog
          opened={bookingDetailOpen}
          onClose={() => {
            if (canLeaveFeature()) closeBookingDetailModal();
          }}
          busy={Boolean(busyAction)}
          eyebrow="BOOKING DETAILS"
          title={detailBooking ? detailBooking.reference : "Loading booking"}
          footer={
            <OperationScope busy={Boolean(busyAction)}>
              {detailBooking && !bookingDetailLoading && !bookingDetailError ? (
                <div className="ops-row ops-between">
                  <OperationButton
                    onClick={() => {
                      if (canLeaveFeature()) closeBookingDetailModal();
                    }}
                    variant="outline"
                    className="ops-redundant-dismiss"
                  >
                    Close
                  </OperationButton>
                  <div className="ops-row">
                    <OperationButton
                      onClick={() => {
                        if (!canLeaveFeature()) return;
                        setBookingStatusFilter("pending");
                        setBookingDateRange([null, null]);
                        closeBookingDetailModal();
                        navigate("/dashboard/bookings");
                      }}
                      variant="outline"
                    >
                      View pending bookings
                    </OperationButton>
                    {canOperateBookingQueue &&
                    detailCheckInState?.isWindowOpen ? (
                      <OperationButton
                        leftSection={<IconCalendarCheck size={18} />}
                        disabled={
                          Boolean(busyAction) ||
                          bookingCheckInBlocked ||
                          detailCheckInState.isTooEarly
                        }
                        loading={
                          busyAction === `booking-check-in:${detailBooking.id}`
                        }
                        onClick={() => void handleCheckInBooking(detailBooking)}
                        variant="default"
                      >
                        Check in customer
                      </OperationButton>
                    ) : null}
                    {canAdminBookings &&
                    detailCheckInState?.isAwaitingCheckIn &&
                    detailCheckInState.isLate ? (
                      <OperationButton
                        leftSection={<IconCalendar size={18} />}
                        disabled={
                          Boolean(busyAction) || detailPaymentGateActive
                        }
                        onClick={() => openRescheduleDialog(detailBooking)}
                        variant="outline"
                      >
                        Reschedule
                      </OperationButton>
                    ) : null}
                    {renderBookingNoShowAction(detailBooking, true)}
                    {canAdminBookings && detailBooking.status === "pending" ? (
                      <>
                        <OperationButton
                          disabled={
                            detailPaymentGateActive ||
                            busyAction ===
                              `booking-status:${detailBooking.id}:confirmed`
                          }
                          onClick={async () => {
                            const updated = await handleUpdateBookingStatus(
                              detailBooking,
                              "confirmed",
                            );
                            if (updated) {
                              closeBookingDetailModal();
                            }
                          }}
                          variant="default"
                        >
                          Confirm
                        </OperationButton>
                        <OperationButton
                          disabled={detailPaymentGateActive}
                          onClick={() => openRescheduleDialog(detailBooking)}
                          variant="outline"
                        >
                          Reschedule
                        </OperationButton>
                        <OperationButton
                          disabled={
                            detailPaymentGateActive ||
                            busyAction ===
                              `booking-status:${detailBooking.id}:canceled`
                          }
                          onClick={() =>
                            openConfirmAction({
                              title: "Cancel booking?",
                              description:
                                "Are you sure you want to cancel this booking?",
                              confirmLabel: "Cancel booking",
                              confirmColor: "red",
                              onConfirm: async () => {
                                const updated = await handleUpdateBookingStatus(
                                  detailBooking,
                                  "canceled",
                                );
                                if (updated) {
                                  closeBookingDetailModal();
                                }
                              },
                            })
                          }
                          variant="destructive"
                        >
                          Cancel
                        </OperationButton>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : (
                <OperationButton
                  onClick={closeBookingDetailModal}
                  variant="outline"
                >
                  Close
                </OperationButton>
              )}
            </OperationScope>
          }
        >
          <OperationScope busy={Boolean(busyAction)}>
            {error ? <OperationAlert color="red">{error}</OperationAlert> : null}
            {bookingDetailLoading ? (
              <p className="ops-muted">Loading booking details...</p>
            ) : bookingDetailError ? (
              <OperationAlert color="red">{bookingDetailError}<OperationButton variant="outline" onClick={() => setBookingDetailRetry((value) => value + 1)}>Retry booking details</OperationButton></OperationAlert>
            ) : detailBooking ? (
              <div className="ops-stack">
                <div className="ops-row ops-between">
                  <div className="ops-stack">
                    <p>{detailBooking.customerName}</p>

                    <p>
                      {detailBooking.customerEmail ||
                        detailBooking.customerPhone ||
                        "No contact details"}
                    </p>
                  </div>
                  <div className="ops-row">
                    <QueueBadge variant="outline">
                      {detailBookingExpired ? "expired" : detailBooking.status}
                    </QueueBadge>
                    {detailManualPaymentRequired ? (
                      <QueueBadge variant="outline">
                        {detailPaymentVerified
                          ? "Payment verified"
                          : "Payment review needed"}
                      </QueueBadge>
                    ) : (
                      <QueueBadge variant="outline">
                        No manual payment required
                      </QueueBadge>
                    )}
                    {detailBookingExpired ? (
                      <QueueBadge variant="outline">Pending timeout</QueueBadge>
                    ) : null}
                  </div>
                </div>

                {detailPaymentGateActive ? (
                  <OperationAlert color="orange">
                    Confirm, cancel, and reschedule actions unlock after manual
                    payment has been verified.
                  </OperationAlert>
                ) : null}

                {detailBookingExpired ? (
                  <OperationAlert color="orange">
                    {detailBooking.expirationReason ||
                      "This pending booking expired before vendor confirmation or payment evidence submission."}
                  </OperationAlert>
                ) : null}

                <div className="ops-grid ops-grid-2">
                  {detailServiceItems.length > 1 ? (
                    <div
                      style={{ gridColumn: "1 / -1" }}
                      className="ops-detail-panel"
                    >
                      <div className="ops-row ops-between">
                        <div className="ops-row">
                          <IconBriefcase size={16} />
                          <p className="vendor-eyebrow">
                            {detailCampaignBundleItems.length
                              ? "Campaign services"
                              : "Bundled services"}
                          </p>
                        </div>
                        <QueueBadge variant="outline">
                          {detailServiceItems.length} services
                        </QueueBadge>
                      </div>
                      <div className="ops-stack">
                        {detailServiceItems.map((item) => (
                          <div key={item.id} className="ops-row ops-between">
                            <div style={{ minWidth: 0 }} className="ops-stack">
                              <p className="ops-strong">{item.serviceName}</p>
                              <p className="ops-muted">
                                Quantity {item.bookingQuantity} ·{" "}
                                {formatBookingScheduleTimeRange(
                                  item.scheduledStartAt,
                                  item.scheduledEndAt,
                                )}
                              </p>
                            </div>
                            <p className="ops-strong">
                              {formatMoney(
                                item.priceAmountCents,
                                item.currency,
                              )}
                            </p>
                          </div>
                        ))}
                      </div>
                      <QueueSeparator />
                      <div className="ops-row ops-between">
                        <p className="ops-strong">
                          {detailCampaignBundleItems.length
                            ? "Campaign total"
                            : "Bundle total"}
                        </p>
                        <p className="ops-strong">
                          {formatMoney(
                            detailServiceTotalCents,
                            detailBooking.groupFundedCampaign?.currency ||
                              detailBooking.serviceCurrency,
                          )}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="ops-detail-panel">
                      <div className="ops-row">
                        <IconBriefcase size={16} />
                        <p className="vendor-eyebrow">Service</p>
                      </div>
                      <p>{detailBooking.serviceName}</p>
                      <p className="ops-muted">
                        Quantity {detailBooking.bookingQuantity}
                      </p>
                      <p className="ops-muted">
                        {detailBooking.servicePriceDisplay || "-"}
                      </p>
                    </div>
                  )}
                  <div className="ops-detail-panel">
                    <div className="ops-row">
                      <IconCalendar size={16} />
                      <p className="vendor-eyebrow">Schedule</p>
                    </div>
                    <p>
                      {formatBookingScheduleDateTime(
                        detailBooking.scheduledStartAt,
                      )}
                    </p>
                    <p className="ops-muted">
                      Ends{" "}
                      {formatBookingScheduleDateTime(
                        detailBooking.scheduledEndAt,
                      )}
                    </p>
                  </div>
                  <div className="ops-detail-panel">
                    <div className="ops-row">
                      <IconClipboardList size={16} />
                      <p className="vendor-eyebrow">Payment</p>
                    </div>
                    <p>{detailBooking.paymentStatus}</p>
                    {canAdminBookings ? (
                      <>
                        <p className="ops-muted">
                          {isGroupFundedDetailBooking
                            ? "Verified through the group-funded campaign"
                            : detailBooking.paymentReference || "No reference"}
                        </p>

                        {detailBooking.paymentVerifiedAt ? (
                          <QueueBadge variant="outline">
                            Verified{" "}
                            {formatDateTime(detailBooking.paymentVerifiedAt)}
                          </QueueBadge>
                        ) : null}
                        {detailBooking.paymentRejectedAt ? (
                          <div className="ops-stack">
                            <QueueBadge variant="destructive">
                              Rejected{" "}
                              {formatDateTime(detailBooking.paymentRejectedAt)}
                            </QueueBadge>
                            {detailBooking.paymentRejectionReason ? (
                              <p className="ops-muted">
                                {detailBooking.paymentRejectionReason}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                        {detailBooking.paymentProof ? (
                          <div className="ops-stack">
                            <p className="ops-muted">
                              {detailBooking.paymentProof.fileName} ·{" "}
                              {formatBytes(
                                detailBooking.paymentProof.sizeBytes,
                              )}
                            </p>
                            {canAdminBookings ? (
                              <OperationButton
                                leftSection={<IconExternalLink size={14} />}
                                loading={
                                  busyAction ===
                                  `booking-proof:${detailBooking.id}`
                                }
                                onClick={() =>
                                  handleViewBookingPaymentProof(detailBooking)
                                }
                                variant="secondary"
                              >
                                View proof
                              </OperationButton>
                            ) : null}
                          </div>
                        ) : isGroupFundedDetailBooking ? (
                          <p className="ops-muted">
                            No individual payment proof is required.
                          </p>
                        ) : (
                          <p className="ops-muted">No proof submitted</p>
                        )}
                        {detailPaymentReviewable ? (
                          <div className="ops-stack">
                            <div className="ops-row">
                              <OperationButton
                                loading={
                                  busyAction ===
                                  `booking-payment-verify:${detailBooking.id}`
                                }
                                onClick={() =>
                                  handleVerifyBookingPayment(detailBooking)
                                }
                                variant="default"
                              >
                                Verify payment
                              </OperationButton>
                            </div>
                            <form
                              id="vendor-booking-payment"
                              onSubmit={(event) => event.preventDefault()}
                            >
                              <OperationTextarea
                                label="Rejection reason"
                                onChange={(event) =>
                                  setPaymentRejectionReason(
                                    event.currentTarget.value,
                                  )
                                }
                                placeholder="Customer-visible reason"
                                value={paymentRejectionReason}
                              />
                            </form>
                            <OperationButton
                              disabled={!paymentRejectionReason.trim()}
                              loading={
                                busyAction ===
                                `booking-payment-reject:${detailBooking.id}`
                              }
                              onClick={async () => {
                                const rejected =
                                  await handleRejectBookingPayment(
                                    detailBooking,
                                  );
                                if (rejected) {
                                  closeBookingDetailModal();
                                }
                              }}
                              variant="destructive"
                            >
                              Reject payment and cancel
                            </OperationButton>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                  <div className="ops-detail-panel">
                    <div className="ops-row">
                      <IconBellRinging size={16} />
                      <p className="vendor-eyebrow">Alerts</p>
                    </div>
                    <p>Email and browser notifications</p>
                    <p className="ops-muted">
                      {detailBooking.contactVerificationChannel
                        ? `Verified by ${detailBooking.contactVerificationChannel}`
                        : "Verification not recorded"}
                    </p>
                  </div>
                </div>

                {detailBooking.notes &&
                detailBooking.notes !==
                  "Group-funded booking approved by vendor." ? (
                  <div className="ops-detail-panel">
                    <p className="vendor-eyebrow">Customer notes</p>
                    <p>{detailBooking.notes}</p>
                  </div>
                ) : null}

                {canOperateBookingQueue ? (
                  <BookingCheckInNotice
                    booking={detailBooking}
                    now={bookingCheckInNow}
                    canReschedule={canAdminBookings}
                    queueBlocked={bookingCheckInBlocked}
                    queueGuidance={bookingCheckInGuidance}
                  />
                ) : null}
              </div>
            ) : null}
          </OperationScope>
        </TaskDialog>
        <Confirmation
          opened={Boolean(confirmAction)}
          title={confirmAction?.title || ""}
          description={confirmAction?.description || ""}
          confirmLabel={confirmAction?.confirmLabel || "Confirm"}
          confirmColor={confirmAction?.confirmColor || "red"}
          loading={confirmBusy}
          {...(currentSection === "staff" ? { eyebrow: "STAFF ACCESS", error } : {})}
          onClose={closeConfirmAction}
          onConfirm={async () => {
            const action = confirmAction;
            if (!action) {
              return;
            }
            try {
              await action.onConfirm();
              closeConfirmAction();
            } catch (actionError) { setError(getErrorMessage(actionError)); }
          }}
        />

      </>
    );
  }

  function renderCurrentSection() {
    if (!hasActiveSubscription && currentSection !== "settings" && currentSection !== "account") {
      return <ActivationPanel onViewPlans={() => openPlanDialog()} />;
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

    if (currentSection === "ratings") {
      return <VendorRatingsPanel key={selectedTenantSlug} token={token!} tenantSlug={selectedTenantSlug} onBusyChange={setRatingsBusy} />;
    }

    if (currentSection === "account") {
      return <Stack gap="md">{!requiresMfaEnrollment && boardApprovalReturn ? <Button component={NavLink} to={boardApprovalReturn} mih={44}>Continue to display approval</Button> : null}{renderAccountPage()}</Stack>;
    }

    return renderSettingsPage();
  }

  const canLeaveFeature = () => {
    if (resourceConfigurationBusy || busyAction || boardScannerBusy || boardSettingsBusy || savingNotificationSettings || requestingBrowserPermission || accountProfileBusy || passwordBusy || mfaBusy || accountPanelBusy || ratingsBusy) return false;
    const editing = unsavedForm.current.hasEdits() || themeDialogOpen || accountDraftRef.current;
    if (editing && !window.confirm("You have unsaved edits. Leave this view?")) return false;
    if (currentSection === "account" && accountTab === "security") {
      if (mfaRecoveryCodes.length && !window.confirm("Save your recovery codes before leaving Security. They remain visible only in this dashboard session. Leave Security?")) return false;
      if (mfaSecret && !window.confirm("Your authenticator setup will stay pending. Return to Security to finish or cancel it. Leave Security?")) return false;
    }
    unsavedForm.current.clear();
    setAccountProfileForm({name:user?.name || "",displayName:user?.displayName || ""});
    setPasswordForm({currentPassword:"",newPassword:""});
    setReplacingMfa(false); setReplacementPassword(""); setReplacementCode("");
    setRemovingMfa(false); setRemovalPassword(""); setRemovalCode(""); setRemovalRecoveryCode(""); setRemovalAcknowledged(false);
    setLocationDialogOpen(false); setServiceDialogOpen(false); setCounterDialogOpen(false);
    setAvailabilityBlockDialogOpen(false); setAvailabilityExceptionDialogOpen(false);
    setStaffDialogOpen(false); setRescheduleDialogOpen(false); setWalkInDialogOpen(false); setThemeDialogOpen(false);
    return true;
  };
  useEffect(() => {
    if (!navigationGuard) return;
    navigationGuard.current = canLeaveFeature;
    return () => { if (navigationGuard.current === canLeaveFeature) navigationGuard.current = null; };
  });

  if (loading) {
    return <VendorAuthLayout><WorkspaceLoading message="Loading dashboard…" /></VendorAuthLayout>;
  }

  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }

  if (invalidSection) {
    return <Navigate to="/dashboard/queue" replace />;
  }

  if (requiresMfaEnrollment && currentSection !== "account") {
    return <Navigate to={boardApprovalReturn ? `/dashboard/account?next=${encodeURIComponent(boardApprovalReturn)}` : "/dashboard/account"} replace />;
  }

  if (currentSection === "ratings" && !canAccessVendorSection("ratings", effectiveEntitlements, tenantPlan)) {
    return effectiveEntitlementsQuery.isPending
      ? <VendorAuthLayout><WorkspaceLoading message="Loading plan access…" /></VendorAuthLayout>
      : <Navigate to={defaultDashboardPath} replace />;
  }

  if (
    !effectiveEntitlementsQuery.isPending &&
    !canAccessVendorSection(currentSection, effectiveEntitlements, tenantPlan)
  ) {
    return <Navigate to={defaultDashboardPath} replace />;
  }

  if (
    (selectedTenantRole === "staff" && !staffAllowedSections.has(currentSection)) ||
    (selectedTenantRole === "admin" && !adminAllowedSections.has(currentSection))
  ) {
    return <Navigate to={defaultDashboardPath} replace />;
  }


  if (!activeTenants.length) {
    return <VendorAuthLayout><WorkspaceUnavailable onSignOut={() => void logout()} /></VendorAuthLayout>;
  }

  const ContextPicker = QueueCounterPicker;
  const canSwitchWorkspace = (isOwner || isAdmin) && !requiresMfaEnrollment;
  const workspace = sectionWorkspace(currentSection, new URLSearchParams(location.search).get("workspace"), canSwitchWorkspace);
  const workspaceNavItems = workspaceItems(visibleNavItems, workspace);
  const switchWorkspace = (next: "operations" | "administration") => {
    if (!canSwitchWorkspace || !canLeaveFeature()) return;
    const candidates = workspaceItems(visibleNavItems, next);
    const destination = candidates.find((item) => item.section !== "account")?.section || "account";
    savePreference(preferenceKey(user.id, selectedTenantSlug), next);
    navigate(workspacePath(destination, next, location.search, location.hash));
  };
  return (
    <VendorWorkspaceShell
      workspace={workspace} canAdmin={canSwitchWorkspace} items={workspaceNavItems}
      businessName={activeTenants.find((tenant) => tenant.slug === selectedTenantSlug)?.name || "Your business"}
      locationName={selectedLocation?.name || ""}
      publicVendorUrl={selectedTenantSlug ? `/vendors/${selectedTenantSlug}` : undefined}
      title={requiresMfaEnrollment ? "Secure your account" : currentSection === "queue" ? "Live queue" : navItems.find((item) => item.section === currentSection)?.label || "Account"}
      description={requiresMfaEnrollment ? "Set up an authenticator to continue to your vendor workspace. Your sign-in session remains active during setup." : dashboardSectionDescriptions[currentSection] || "Manage your vendor workspace."}
      name={user.name || "Vendor"} role={selectedTenantRole || "Vendor"} plan={activeSubscription?.planName || tenantPlan?.planName || "No active plan"}
      onBeforeNavigate={canLeaveFeature} onEdit={(form) => unsavedForm.current.mark(form)}
      onWorkspace={switchWorkspace} onLogout={() => { if (canLeaveFeature()) void logout(); }} search={location.search} hash={location.hash}
      context={!requiresMfaEnrollment ? <>
        <ContextPicker label="Business" data={activeTenants.map((tenant) => ({ value: tenant.slug, label: tenant.name }))}
          value={selectedTenantSlug} disabled={Boolean(busyAction) || boardScannerBusy || boardSettingsBusy || savingNotificationSettings || requestingBrowserPermission || accountPanelBusy || accountProfileBusy || passwordBusy || mfaBusy || ratingsBusy} onChange={(value) => {
            if (!value || value === selectedTenantSlug || !canLeaveFeature()) return;
            setSnapshot(null); setLocations([]); setSelectedLocationSlug(""); setSelectedCounterSlug("");
            setServices([]); setStaff([]); setServiceCounters([]); setVendorBookings([]); setClients(null); setHistory(null); setBilling(null);
            setLocationDialogOpen(false); setServiceDialogOpen(false); setAvailabilityBlockDialogOpen(false); setAvailabilityExceptionDialogOpen(false);
            setCounterDialogOpen(false); setStaffDialogOpen(false); setThemeDialogOpen(false); setRescheduleDialogOpen(false);
            setTicketScannerOpen(false); setScannerTarget(null); setBookingDetailOpen(false); setBookingDetailBooking(null); setBookingDetailModalId(null);
            setAvailabilityBlocks([]); setAvailabilityExceptions([]); setAvailabilitySummary(null); setBusinessProfileTheme(defaultPublicBoardTheme);
            setPlanDialogOpen(false); setThemeLocation(null); setConfirmAction(null); setWalkInDialogOpen(false);
            const target = activeTenants.find((tenant) => tenant.slug === value);
            if (!target) return;
            const nextWorkspace = rememberedTenantWorkspace(user.id, target);
            setSelectedTenantSlug(value);
            navigate(workspacePath(currentSection === "account" ? "account" : nextWorkspace === "administration" ? "settings" : "queue",
              nextWorkspace, location.search, location.hash));
          }} />
        <ContextPicker data={locationOptions} label="Location" value={selectedLocationSlug} disabled={Boolean(busyAction) || boardScannerBusy || boardSettingsBusy || savingNotificationSettings || requestingBrowserPermission || accountPanelBusy || accountProfileBusy || passwordBusy || mfaBusy || ratingsBusy}
          onChange={(value) => { if (value && value !== selectedLocationSlug && canLeaveFeature()) { setSnapshot(null); setServiceCounters([]); setVendorBookings([]); setBookingPagination(null); setClients(null); setHistory(null); setBookingDetailOpen(false); setBookingDetailBooking(null); setBookingDetailModalId(null); setAvailabilityBlocks([]); setAvailabilityExceptions([]); setAvailabilitySummary(null); setSelectedCounterSlug(""); setSelectedLocationSlug(value); } }} />
      </> : <Badge color="orange" variant="light">MFA setup required</Badge>}
      dialogs={<>
      {renderPlanDialog()}
      {renderLocationDialog()}
      {renderServiceDialog()}
      {renderAvailabilityBlockDialog()}
      {renderAvailabilityExceptionDialog()}
      {renderRescheduleDialog()}
      {renderCounterDialog()}
      {renderStaffDialog()}
      {renderThemeDialog()}
      <VendorToastViewport />
      {renderDashboardAlertOverlay()}
      {renderRescheduleBlockedModal()}
      {renderWalkInDialog()}
      <TicketScannerModal
        error={ticketScannerError}
        loading={busyAction === "confirm-current"}
        onClose={() => {
          if (busyAction !== "confirm-current") {
            setTicketScannerOpen(false);
            setTicketScannerError("");
          }
        }}
        onConfirm={handleConfirmCalledTicket}
        opened={ticketScannerOpen}
        ticketNumber={scannerTarget?.ticketNumber}
      />
      </>}
    >
        {!requiresMfaEnrollment ? <VendorQueueLifecycleTray
          busyAction={busyAction}
          canOperate={canOperateQueueDay}
          locationName={selectedLocation?.name || "This queue"}
          onCloseNow={handleCloseQueueDay}
          onExtend={handleExtendQueueDay}
          onRefresh={reloadDashboardSnapshot}
          snapshot={snapshot}
        /> : null}
        {error ? <Text c="red" fw={700}>{error}</Text> : null}
        {requiresMfaEnrollment || currentSection === "account" || (snapshot?.tenant.slug === selectedTenantSlug && snapshot?.location?.slug === selectedLocationSlug)
          ? renderCurrentSection()
          : <Stack><Text>Loading this business and location...</Text><Button variant="default" onClick={() => void retryDashboardContext()}>Retry</Button></Stack>}
    </VendorWorkspaceShell>
  );
}
