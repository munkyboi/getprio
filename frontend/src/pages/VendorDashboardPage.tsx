import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
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
  ThemeIcon,
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
  IconMapPin,
  IconPhoto,
  IconPencil,
  IconQrcode,
  IconSparkles,
  IconTicket,
  IconTrash,
  IconX,
  IconClock,
  IconSettings,
  IconUsersGroup
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useMediaQuery } from "@mantine/hooks";
import { addDays, differenceInMinutes, getDay } from "date-fns";
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
  VendorAvailabilityResponse,
  VendorBookingSummary,
  BookingSlotSummary,
  VendorClientsResponse,
  VendorServiceSummary,
  UpdateVendorBookingStatusRequest,
  PaginationMetadata,
  GroupFundedLocationServiceSettings,
  GroupFundedBundleItemSummary,
  GroupFundedCampaignSummary,
  GroupFundedVendorAlertEvent,
  VendorGroupFundedContributionSummary,
  VendorGroupFundedRefundSummary,
  GroupFundedRefundStatus
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

type RawGroupFundedBundleItem = GroupFundedBundleItemSummary & {
  _id?: string | null;
  serviceNameSnapshot?: string;
  serviceSlugSnapshot?: string;
};

const dashboardSections = new Set(["queue", "tenants", "services", "bookings", "group-funded", "staff", "clients", "history", "reports", "settings"]);
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

function ModalHelpIcon({ label }: { label: string }) {
  return (
    <Tooltip label={label} withArrow multiline w={260}>
      <ActionIcon aria-label={label} color="gray" size="sm" variant="subtle">
        <IconInfoCircle size={14} />
      </ActionIcon>
    </Tooltip>
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

function formatPreviewHourRange(location: StoreLocationWithHours | null, weekday: number) {
  const hour = location?.hours.find((entry) => entry.weekday === weekday);

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
  imageUrl: "",
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
  imageUrl: "",
  allowBookingQuantity: false,
  bookingQuantityLabel: "Units",
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

const groupFundedCampaignRejectionReasons = [
  {
    label: "Schedule no longer available",
    value: "schedule_unavailable",
    reason: "The requested schedule is no longer available for this group-funded booking. Please contact the vendor or start a new campaign with another available slot."
  },
  {
    label: "Capacity cannot be reserved",
    value: "capacity_unavailable",
    reason: "The branch cannot reserve enough capacity for this group-funded booking at the selected schedule. Verified contributions will be marked refund-eligible."
  },
  {
    label: "Payment proof issue",
    value: "payment_proof_issue",
    reason: "One or more verified contribution proofs require additional review before this campaign can be accepted. Verified contributions will be marked refund-eligible for this campaign."
  },
  {
    label: "Service unavailable",
    value: "service_unavailable",
    reason: "The selected service is not available for group-funded booking at this time. Verified contributions will be marked refund-eligible."
  },
  {
    label: "Vendor cannot fulfill request",
    value: "vendor_unavailable",
    reason: "The vendor cannot fulfill this group-funded booking request at the selected date and time. Verified contributions will be marked refund-eligible."
  }
];

const groupFundedContributionRejectionReasons = [
  {
    label: "Payment reference cannot be matched",
    value: "reference_unmatched",
    reason: "The payment reference could not be matched to a received payment. Please verify the reference and submit a new proof if needed."
  },
  {
    label: "Proof is unreadable or incomplete",
    value: "proof_unreadable",
    reason: "The payment proof is unreadable or does not show enough information to verify the payment. Please submit a clearer proof."
  },
  {
    label: "Payment amount does not match",
    value: "amount_mismatch",
    reason: "The payment amount does not match the required contribution for this campaign."
  },
  {
    label: "Duplicate payment proof",
    value: "duplicate_proof",
    reason: "This payment proof duplicates a contribution that has already been submitted for this campaign."
  },
  {
    label: "Campaign contributor positions are full",
    value: "campaign_full",
    reason: "The campaign has already filled all contributor positions, so this contribution cannot be accepted."
  }
];

function normalizeGroupFundedSettings(
  settings?: Partial<GroupFundedLocationServiceSettings> | null
): GroupFundedLocationServiceSettings {
  return {
    enabled: settings?.enabled === true,
    minRequiredContributors:
      settings?.minRequiredContributors ?? defaultGroupFundedSettings.minRequiredContributors,
    maxRequiredContributors:
      settings?.maxRequiredContributors ?? defaultGroupFundedSettings.maxRequiredContributors,
    defaultRequiredContributors:
      settings?.defaultRequiredContributors ?? defaultGroupFundedSettings.defaultRequiredContributors,
    minContributionAmountCents: settings?.minContributionAmountCents ?? null,
    maxContributionAmountCents: settings?.maxContributionAmountCents ?? null,
    minDeadlineHours:
      settings?.minDeadlineHours ?? defaultGroupFundedSettings.minDeadlineHours,
    maxDeadlineDays:
      settings?.maxDeadlineDays ?? defaultGroupFundedSettings.maxDeadlineDays,
    allowPublicCampaigns: settings?.allowPublicCampaigns === true
  };
}

type ServiceLocationFormEntry = NonNullable<SaveVendorServiceRequest["locationServices"]>[number];

function buildDefaultServiceLocationEntry(locationSlug: string): ServiceLocationFormEntry {
  return {
    locationSlug,
    capacity: 1,
    isActive: true,
    sortOrder: 0,
    priceAmountCents: null,
    priceDisplay: null,
    groupFunded: normalizeGroupFundedSettings()
  };
}

function getGroupFundedDashboardAlertTitle(event: GroupFundedVendorAlertEvent) {
  switch (event.eventType) {
    case "campaign_created":
      return "New group-funded campaign";
    case "contribution_submitted":
      return "Group-funded proof submitted";
    case "funding_completed":
    case "capacity_hold_created":
      return "Group-funded booking ready";
    case "replacement_slot_accepted":
      return "Replacement slot accepted";
    case "replacement_slot_declined":
      return "Replacement slot declined";
    case "funding_deadline_expired":
      return "Group-funded campaign expired";
    case "vendor_review_expired":
      return "Vendor review expired";
    case "vendor_approved":
      return "Group-funded booking approved";
    case "vendor_rejected":
      return "Group-funded booking rejected";
    default:
      return "Group-funded update";
  }
}

function getGroupFundedDashboardAlertLead(event: GroupFundedVendorAlertEvent) {
  switch (event.eventType) {
    case "campaign_created":
      return `${event.campaign.organizerDisplayName || "A customer"} started a group-funded campaign for`;
    case "contribution_submitted":
      return "A contributor submitted payment proof for";
    case "funding_completed":
    case "capacity_hold_created":
      return "Funding is complete and ready for vendor review for";
    case "replacement_slot_accepted":
      return "The organizer accepted the replacement slot for";
    case "replacement_slot_declined":
      return "The organizer declined the replacement slot for";
    case "funding_deadline_expired":
      return "The funding deadline passed for";
    case "vendor_review_expired":
      return "The vendor review hold expired for";
    case "vendor_approved":
      return "A group-funded booking was approved for";
    case "vendor_rejected":
      return "A group-funded booking was rejected for";
    default:
      return "There is a group-funded update for";
  }
}

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
    buttonBorderColor: "#CF8A40"
  },
  retail: {
    presetId: "retail",
    heroTitle: "",
    heroSubtitle: "",
    logoUrl: "",
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

type DashboardSection = "queue" | "tenants" | "services" | "bookings" | "group-funded" | "staff" | "clients" | "history" | "reports" | "settings";
type QueueView = "current" | "overflow" | "recovery";
type ClientSort = "latestVisitDesc" | "latestVisitAsc" | "nameAsc" | "nameDesc" | "visitsDesc" | "visitsAsc";
type HistorySort = "updatedDesc" | "updatedAsc" | "ticketAsc" | "ticketDesc" | "customerAsc" | "customerDesc";
type BookingStatusFilter = "all" | "pending" | "confirmed" | "rescheduled" | "canceled";
type GroupFundedStatusFilter = "all" | "funding" | "vendor_review" | "slot_recovery" | "replacement_proposed" | "confirmed" | "vendor_rejected" | "funding_failed";

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
  { section: "group-funded", label: "Group-funded", icon: IconUsersGroup },
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
  "group-funded": "Review group-funded campaigns, contribution proofs, and vendor approval work.",
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
  "group-funded",
  "staff",
  "clients",
  "history",
  "reports",
  "settings"
]);
const staffAllowedSections = new Set<DashboardSection>(["queue", "bookings", "group-funded", "clients", "history"]);

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

function getGroupFundedStatusColor(status: string) {
  if (status === "confirmed") {
    return "teal";
  }
  if (["vendor_review", "slot_recovery", "replacement_proposed", "funded"].includes(status)) {
    return "blue";
  }
  if (status === "funding") {
    return "yellow";
  }
  if (["vendor_rejected", "funding_failed", "vendor_review_expired", "organizer_canceled", "vendor_canceled"].includes(status)) {
    return "red";
  }
  return "gray";
}

function getGroupFundedRefundStatusColor(status: GroupFundedRefundStatus) {
  if (status === "completed") {
    return "teal";
  }
  if (status === "in_progress") {
    return "blue";
  }
  if (status === "policy_review_required") {
    return "orange";
  }
  if (status === "rejected") {
    return "red";
  }
  return "yellow";
}

function isGroupFundedCampaignFullyRefunded(campaign: GroupFundedCampaignSummary) {
  const refundSummary = campaign.refundSummary;
  return Boolean(
    campaign.campaignStatus === "vendor_rejected" &&
    refundSummary &&
    refundSummary.totalCount > 0 &&
    refundSummary.completedCount === refundSummary.totalCount &&
    refundSummary.totalCount === refundSummary.eligibleContributionCount
  );
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
  const [availabilitySummary, setAvailabilitySummary] = useState<VendorAvailabilityResponse["summary"] | null>(null);
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
  const isMobileHoursLayout = useMediaQuery("(max-width: 48em)");
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
  const [groupFundedAlertEventIds, setGroupFundedAlertEventIds] = useState<string[]>([]);
  const knownGroupFundedAlertEventIdsRef = useRef<Set<string> | null>(null);
  const [groupFundedAlertEvents, setGroupFundedAlertEvents] = useState<GroupFundedVendorAlertEvent[]>([]);
  const dismissedGroupFundedAlertEventIdsRef = useRef<Set<string>>(new Set());
  const knownQueueTicketIdsRef = useRef<Set<string> | null>(null);
  const [queueAlertIds, setQueueAlertIds] = useState<string[]>([]);
  const dismissedQueueAlertIdsRef = useRef<Set<string>>(new Set());
  const [bookingDetailModalId, setBookingDetailModalId] = useState<string | null>(null);
  const [bookingDetailOpen, setBookingDetailOpen] = useState(false);
  const [bookingDetailLoading, setBookingDetailLoading] = useState(false);
  const [bookingDetailBooking, setBookingDetailBooking] = useState<VendorBookingSummary | null>(null);
  const [bookingDetailError, setBookingDetailError] = useState("");
  const [paymentRejectionReason, setPaymentRejectionReason] = useState("");
  const [groupFundedStatusFilter, setGroupFundedStatusFilter] = useState<GroupFundedStatusFilter>("all");
  const [groupFundedDetailId, setGroupFundedDetailId] = useState<string | null>(null);
  const [groupFundedRejectReason, setGroupFundedRejectReason] = useState("");
  const [groupFundedRejectReasonPreset, setGroupFundedRejectReasonPreset] = useState<string | null>(null);
  const [groupFundedUseCustomRejectReason, setGroupFundedUseCustomRejectReason] = useState(false);
  const [groupFundedContributionToReject, setGroupFundedContributionToReject] = useState<VendorGroupFundedContributionSummary | null>(null);
  const [groupFundedContributionRejectReason, setGroupFundedContributionRejectReason] = useState("");
  const [groupFundedContributionRejectReasonPreset, setGroupFundedContributionRejectReasonPreset] = useState<string | null>(null);
  const [groupFundedContributionUseCustomRejectReason, setGroupFundedContributionUseCustomRejectReason] = useState(false);
  const [groupFundedContributionRefundRequired, setGroupFundedContributionRefundRequired] = useState(false);
  const [groupFundedRefundNotes, setGroupFundedRefundNotes] = useState<Record<string, string>>({});
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
  const [groupFundedProofModalOpen, setGroupFundedProofModalOpen] = useState(false);
  const [groupFundedProofContribution, setGroupFundedProofContribution] = useState<VendorGroupFundedContributionSummary | null>(null);
  const [groupFundedProofAccessUrl, setGroupFundedProofAccessUrl] = useState("");
  const [groupFundedProofError, setGroupFundedProofError] = useState("");
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
  const locationServicesQuery = useQuery({
    queryKey: ["vendor-dashboard-location-services", token, selectedTenantSlug, isOwner, isAdmin],
    queryFn: async () => {
      if (!token || !selectedTenantSlug) {
        throw new Error("Missing dashboard context.");
      }

      return vendorDashboardCatalog.getLocationServices(token, selectedTenantSlug);
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
  const groupFundedCampaignsQuery = useQuery({
    queryKey: [
      "vendor-dashboard-group-funded-campaigns",
      token,
      selectedTenantSlug,
      selectedLocation?.id,
      groupFundedStatusFilter
    ],
    queryFn: async () => {
      if (!token || !selectedTenantSlug || !selectedLocation?.id) {
        throw new Error("Missing dashboard context.");
      }

      return vendorDashboardBookings.getGroupFundedCampaigns(
        token,
        selectedTenantSlug,
        selectedLocation.id,
        groupFundedStatusFilter
      );
    },
    enabled: Boolean(
      token &&
      selectedTenantSlug &&
      selectedLocation?.id &&
      currentSection === "group-funded" &&
      hasActiveSubscription &&
      canOperateBookingQueue
    )
  });
  const groupFundedDetailQuery = useQuery({
    queryKey: ["vendor-dashboard-group-funded-detail", token, selectedTenantSlug, groupFundedDetailId],
    queryFn: async () => {
      if (!token || !selectedTenantSlug || !groupFundedDetailId) {
        throw new Error("Missing campaign context.");
      }

      return vendorDashboardBookings.getGroupFundedCampaignDetail(token, selectedTenantSlug, groupFundedDetailId);
    },
    enabled: Boolean(token && selectedTenantSlug && groupFundedDetailId)
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
  const groupFundedAlertsQuery = useQuery({
    queryKey: ["vendor-dashboard-group-funded-alerts", token, selectedTenantSlug, selectedLocation?.id],
    queryFn: async () => {
      if (!token || !selectedTenantSlug || !selectedLocation?.id) {
        throw new Error("Missing dashboard context.");
      }

      return vendorDashboardBookings.getGroupFundedAlertEvents(token, selectedTenantSlug, selectedLocation.id);
    },
    enabled: Boolean(token && selectedTenantSlug && selectedLocation?.id && hasActiveSubscription && canOperateBookingQueue),
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
    setAvailabilitySummary(availabilityQuery.data.summary || null);
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
    if (!groupFundedAlertsQuery.data) {
      return;
    }

    const events = groupFundedAlertsQuery.data.events;
    const nextIds = new Set(events.map((event) => event.id));
    const previousIds = knownGroupFundedAlertEventIdsRef.current;
    const dismissedIds = dismissedGroupFundedAlertEventIdsRef.current;

    setGroupFundedAlertEvents(events);

    const newEventIds = events
      .filter((event) => !dismissedIds.has(event.id) && (!previousIds || !previousIds.has(event.id)))
      .map((event) => event.id);

    if (newEventIds.length) {
      setGroupFundedAlertEventIds((current) => [...new Set([...current, ...newEventIds])]);
    }

    setGroupFundedAlertEventIds((current) =>
      current.filter((eventId) => {
        if (dismissedIds.has(eventId)) {
          return false;
        }
        return events.some((event) => event.id === eventId);
      })
    );

    knownGroupFundedAlertEventIdsRef.current = nextIds;
  }, [groupFundedAlertsQuery.data]);

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
      if (token && hasActiveSubscription && canOperateBookingQueue) {
        void queryClient.invalidateQueries({
          queryKey: ["vendor-dashboard-group-funded-campaigns", token, selectedTenantSlug]
        });
        void queryClient.invalidateQueries({
          queryKey: ["vendor-dashboard-group-funded-detail", token, selectedTenantSlug]
        });
        void queryClient.invalidateQueries({
          queryKey: ["vendor-dashboard-group-funded-alerts", token, selectedTenantSlug]
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
    bookingDateRange,
    bookingPage,
    bookingSearch,
    bookingStatusFilter,
    hasActiveSubscription,
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
    setGroupFundedAlertEventIds([]);
    setGroupFundedAlertEvents([]);
    knownGroupFundedAlertEventIdsRef.current = null;
    setQueueAlertIds([]);
    knownQueueTicketIdsRef.current = null;
    dismissedBookingAlertIdsRef.current = new Set();
    dismissedGroupFundedAlertEventIdsRef.current = new Set();
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
        groupFundedEvents?: string[];
        queue?: string[];
      };

      dismissedBookingAlertIdsRef.current = new Set(
        Array.isArray(parsed.booking) ? parsed.booking.filter((value) => typeof value === "string") : []
      );
      dismissedGroupFundedAlertEventIdsRef.current = new Set(
        Array.isArray(parsed.groupFundedEvents) ? parsed.groupFundedEvents.filter((value) => typeof value === "string") : []
      );
      dismissedQueueAlertIdsRef.current = new Set(
        Array.isArray(parsed.queue) ? parsed.queue.filter((value) => typeof value === "string") : []
      );
    } catch {
      dismissedBookingAlertIdsRef.current = new Set();
      dismissedGroupFundedAlertEventIdsRef.current = new Set();
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
      groupFundedEvents: Array.from(dismissedGroupFundedAlertEventIdsRef.current),
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

  function clearGroupFundedAlert(eventId: string) {
    dismissedGroupFundedAlertEventIdsRef.current.add(eventId);
    setGroupFundedAlertEventIds((current) => current.filter((item) => item !== eventId));
    persistDismissedAlerts();
  }

  function resetGroupFundedCampaignDecision() {
    setGroupFundedRejectReason("");
    setGroupFundedRejectReasonPreset(null);
    setGroupFundedUseCustomRejectReason(false);
  }

  function closeGroupFundedContributionRejectModal() {
    setGroupFundedContributionToReject(null);
    setGroupFundedContributionRejectReason("");
    setGroupFundedContributionRejectReasonPreset(null);
    setGroupFundedContributionUseCustomRejectReason(false);
    setGroupFundedContributionRefundRequired(false);
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
  const activeGroupFundedAlerts = useMemo(
    () =>
      groupFundedAlertEventIds
        .map((eventId) => groupFundedAlertEvents.find((event) => event.id === eventId))
        .filter((event): event is GroupFundedVendorAlertEvent => Boolean(event)),
    [groupFundedAlertEventIds, groupFundedAlertEvents]
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

  async function reloadGroupFundedCampaigns() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["vendor-dashboard-group-funded-campaigns", token, selectedTenantSlug]
      }),
      queryClient.invalidateQueries({
        queryKey: ["vendor-dashboard-group-funded-detail", token, selectedTenantSlug]
      }),
      queryClient.invalidateQueries({
        queryKey: ["vendor-dashboard-group-funded-alerts", token, selectedTenantSlug]
      })
    ]);
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

  async function handleViewGroupFundedContributionProof(contribution: VendorGroupFundedContributionSummary) {
    if (!contribution.paymentProof) {
      return;
    }

    setGroupFundedProofContribution(contribution);
    setGroupFundedProofAccessUrl("");
    setGroupFundedProofError("");
    setGroupFundedProofModalOpen(true);
    setBusyAction(`group-funded-proof:${contribution.id}`);

    try {
      const response = await vendorDashboardBookings.getGroupFundedContributionPaymentProof(
        token,
        selectedTenantSlug,
        contribution.id
      );
      setGroupFundedProofAccessUrl(response.access.url);
    } catch (proofError) {
      setGroupFundedProofError(getErrorMessage(proofError));
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

  async function handleVerifyGroupFundedContribution(contribution: VendorGroupFundedContributionSummary) {
    setBusyAction(`group-funded-contribution-verify:${contribution.id}`);
    setError("");

    try {
      await vendorDashboardBookings.verifyGroupFundedContribution(token, selectedTenantSlug, contribution.id);
      await reloadGroupFundedCampaigns();
      showSuccessNotification("Contribution verified", "The campaign funding total was updated.");
    } catch (verifyError) {
      setError(getErrorMessage(verifyError));
    } finally {
      setBusyAction("");
    }
  }

  function openGroupFundedContributionRejectModal(contribution: VendorGroupFundedContributionSummary) {
    const campaign = groupFundedDetailQuery.data?.campaign;
    const fundingReached = Boolean(
      campaign && (
        campaign.fundedAmountCents >= campaign.targetAmountCents ||
        campaign.paidParticipantCount >= campaign.requiredContributors ||
        campaign.campaignStatus !== "funding"
      )
    );
    setGroupFundedContributionToReject(contribution);
    setGroupFundedContributionRejectReason("");
    setGroupFundedContributionRejectReasonPreset(null);
    setGroupFundedContributionUseCustomRejectReason(false);
    setGroupFundedContributionRefundRequired(fundingReached);
  }

  async function handleRejectGroupFundedContribution() {
    const contribution = groupFundedContributionToReject;
    if (!contribution) {
      return;
    }
    const reason = groupFundedContributionRejectReason.trim();
    if (!reason) {
      setError("A contributor-visible rejection reason is required.");
      return;
    }

    setBusyAction(`group-funded-contribution-reject:${contribution.id}`);
    setError("");

    try {
      const refundRequired = groupFundedContributionRefundRequired;
      await vendorDashboardBookings.rejectGroupFundedContribution(token, selectedTenantSlug, contribution.id, {
        reason,
        refundDisposition: refundRequired ? "required" : "not_required"
      });
      closeGroupFundedContributionRejectModal();
      await reloadGroupFundedCampaigns();
      showSuccessNotification(
        refundRequired ? "Contribution moved to refunds" : "Contribution rejected",
        refundRequired ? "A refund obligation was created for the contributor." : "The proof was rejected and the contributor can see the reason."
      );
    } catch (rejectError) {
      setError(getErrorMessage(rejectError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleApproveGroupFundedCampaign(campaign: GroupFundedCampaignSummary) {
    setBusyAction(`group-funded-approve:${campaign.id}`);
    setError("");

    try {
      await vendorDashboardBookings.approveGroupFundedCampaign(token, selectedTenantSlug, campaign.id);
      setGroupFundedDetailId(null);
      await reloadGroupFundedCampaigns();
      await reloadBookings();
      showSuccessNotification("Group-funded booking approved", "A linked paid booking was created.");
    } catch (approveError) {
      setError(getErrorMessage(approveError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleRejectGroupFundedCampaign(campaign: GroupFundedCampaignSummary) {
    const reason = groupFundedRejectReason.trim();
    if (!reason) {
      setError("A customer-visible rejection reason is required.");
      return;
    }

    setBusyAction(`group-funded-reject:${campaign.id}`);
    setError("");

    try {
      await vendorDashboardBookings.rejectGroupFundedCampaign(token, selectedTenantSlug, campaign.id, { reason });
      resetGroupFundedCampaignDecision();
      setGroupFundedDetailId(null);
      await reloadGroupFundedCampaigns();
      showSuccessNotification("Group-funded campaign rejected", "Verified contributions are now refund-eligible.");
    } catch (rejectError) {
      setError(getErrorMessage(rejectError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleUpdateGroupFundedRefund(
    refund: VendorGroupFundedRefundSummary,
    refundStatus: Extract<GroupFundedRefundStatus, "in_progress" | "completed" | "policy_review_required">
  ) {
    setBusyAction(`group-funded-refund:${refund.id}:${refundStatus}`);
    setError("");

    try {
      await vendorDashboardBookings.updateGroupFundedRefund(token, selectedTenantSlug, refund.id, {
        refundStatus,
        notes: (groupFundedRefundNotes[refund.id] ?? refund.notes ?? "").trim()
      });
      await reloadGroupFundedCampaigns();
      showSuccessNotification("Refund updated", `Refund marked ${refundStatus.replace(/_/g, " ")}.`);
    } catch (refundError) {
      setError(getErrorMessage(refundError));
    } finally {
      setBusyAction("");
    }
  }

  function openServiceDialog(service?: VendorServiceSummary) {
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
          isActive: existing?.isActive ?? true,
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
        className="vendor-location-modal"
        centered
        opened={locationDialogOpen}
        onClose={() => setLocationDialogOpen(false)}
        size="xl"
        title={
          <Stack gap={2}>
            <Text className="service-dialog__modal-eyebrow">{editingLocationSlug ? "EDIT" : "ADD"} LOCATION</Text>
            <Text className="service-dialog__modal-title">
              {editingLocationSlug ? "Edit location" : "Add location"}
            </Text>
            <Text c="dimmed" size="sm">
              Configure the branch profile, payment details, and hours that appear on the public queue pages.
            </Text>
          </Stack>
        }
        overlayProps={{ blur: 6, backgroundOpacity: 0.35 }}
        scrollAreaComponent={ScrollArea.Autosize}
      >
        <Stack gap="md" pb="sm">
          <ModalSection
            title="Location profile"
            description="These details identify the branch and shape how customers find it on the public queue pages."
          >
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              <FileInput
                accept="image/png,image/jpeg,image/webp"
                clearable
                label="Branch image"
                placeholder={locationForm.imageUrl ? "Replace branch image" : "Upload branch image"}
                disabled={busyAction === "location-image-upload"}
                onChange={(file) => uploadLocationImage(file)}
              />
                                  <TextInput
                label="Branch image URL"
                value={locationForm.imageUrl || ""}
                onChange={(event) => setLocationForm((current) => ({ ...current, imageUrl: event.target.value }))}
              />
              {locationForm.imageUrl ? <Image alt="" h={120} radius="md" src={locationForm.imageUrl} /> : null}
              <TextInput
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
                    slug: locationSlugManuallyEdited ? current.slug : buildLocationSlug(nextName)
                  }));
                }}
              />
              <TextInput
                name="locationSlug"
                label={
                  <Group gap={6} wrap="nowrap">
                    <Text span size="sm" fw={500}>
                      Slug
                    </Text>
                    <ModalHelpIcon label="This becomes part of the public URL for the location. Keep it short, lowercase, and URL-safe." />
                  </Group>
                }
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
                description="Street address or landmark for the branch."
                value={locationForm.addressLine1}
                onChange={(event) =>
                  setLocationForm((current) => ({ ...current, addressLine1: event.target.value }))
                }
              />
              <TextInput
                name="addressLine2"
                label="Address line 2"
                description="Optional unit, floor, or building detail."
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
                description="Used for location-specific inquiries and notifications."
                value={locationForm.contactEmail}
                onChange={(event) =>
                  setLocationForm((current) => ({ ...current, contactEmail: event.target.value }))
                }
              />
              <PhilippineMobileInput
                name="locationContactPhone"
                label="Contact phone"
                description="Displayed to customers when contact details are needed."
                value={locationForm.contactPhone}
                onChange={(nextValue) =>
                  setLocationForm((current) => ({ ...current, contactPhone: nextValue }))
                }
              />
              <TextInput
                name="timezone"
                label="Timezone"
                description="Used for public hours and queue timing."
                value={locationForm.timezone}
                onChange={(event) =>
                  setLocationForm((current) => ({ ...current, timezone: event.target.value }))
                }
              />
            </SimpleGrid>
          </ModalSection>

          <ModalSection
            title="Payment QR"
            description="Optional manual payment details shown when this branch accepts QR-based payments."
          >
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              <TextInput
                name="paymentMethodLabel"
                label={
                  <Group gap={6} wrap="nowrap">
                    <Text span size="sm" fw={500}>
                      Payment method
                    </Text>
                    <ModalHelpIcon label="Examples: GCash, Maya, or BPI InstaPay. This is a display label, not a payment processor setting." />
                  </Group>
                }
                placeholder="GCash, Maya, BPI InstaPay"
                value={locationForm.paymentMethodLabel}
                onChange={(event) =>
                  setLocationForm((current) => ({ ...current, paymentMethodLabel: event.target.value }))
                }
              />
              <TextInput
                name="paymentAccountDisplayName"
                label="Account display name"
                description="Business or account holder name shown beside the QR code."
                placeholder="Business or account name"
                value={locationForm.paymentAccountDisplayName}
                onChange={(event) =>
                  setLocationForm((current) => ({ ...current, paymentAccountDisplayName: event.target.value }))
                }
              />
              <TextInput
                name="paymentAccountIdentifierDisplay"
                label={
                  <Group gap={6} wrap="nowrap">
                    <Text span size="sm" fw={500}>
                      Masked account identifier
                    </Text>
                    <ModalHelpIcon label="Use a partially hidden account number or suffix so customers can verify they are paying the right account without exposing the full value." />
                  </Group>
                }
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
                  description="Upload the QR code image customers should scan."
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
              description="Only turn this on if customers should see QR payment details for this branch."
              onChange={(event) =>
                setLocationForm((current) => ({ ...current, paymentQrActive: event.currentTarget.checked }))
              }
            />
          </ModalSection>

          <ModalSection
            title="Visibility and access"
            description="These switches control whether the branch is active and whether it is treated as the main location."
          >
            <Group align="flex-start" wrap="wrap">
              <Switch
                name="isActiveLocation"
                checked={locationForm.isActive}
                label="Enable location"
                description="Inactive locations stay saved but are hidden from normal use."
                onChange={(event) =>
                  setLocationForm((current) => ({ ...current, isActive: event.currentTarget.checked }))
                }
              />
              <Checkbox
                name="isPrimaryLocation"
                checked={locationForm.isPrimary}
                label={
                  <Group gap={6} wrap="nowrap">
                    <Text span size="sm" fw={500}>
                      Primary location
                    </Text>
                    <ModalHelpIcon label="The primary location is used as the default branch in public and dashboard flows when no specific location is selected." />
                  </Group>
                }
                onChange={(event) =>
                  setLocationForm((current) => ({ ...current, isPrimary: event.target.checked }))
                }
              />
            </Group>
          </ModalSection>

          <ModalSection
            title="Store hours"
            description="Set the default operating hours customers should see. Closed days hide the time inputs on mobile."
          >
            {isMobileHoursLayout ? (
              <Stack gap="sm">
                {locationForm.hours.map((hour) => {
                  const dayLabel = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][hour.weekday];

                  return (
                    <Card key={hour.weekday} withBorder radius="lg" p="sm">
                      <Stack gap="sm">
                        <Group justify="space-between" align="flex-start">
                          <Text fw={700}>{dayLabel}</Text>
                          <Checkbox
                            name={`hours.${hour.weekday}.isClosed`}
                            checked={hour.isClosed}
                            label="Closed"
                            description="Hide opening and closing times for this day."
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
                        </Group>
                        {!hour.isClosed ? (
                          <SimpleGrid cols={2} spacing="sm">
                            <TextInput
                              name={`hours.${hour.weekday}.opensAt`}
                              label="Opens"
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
                            <TextInput
                              name={`hours.${hour.weekday}.closesAt`}
                              label="Closes"
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
                          </SimpleGrid>
                        ) : null}
                      </Stack>
                    </Card>
                  );
                })}
              </Stack>
            ) : (
              <ScrollArea offsetScrollbars type="auto">
                <Box miw={700} pb="xs">
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
              </Box>
            </ScrollArea>
            )}
          </ModalSection>
          <Group justify="flex-end" className="service-dialog__footer">
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
    const selectedTenant = user?.tenants.find((tenant) => tenant.slug === selectedTenantSlug);
    const previewVendorName = snapshot?.tenant.name || selectedTenant?.name || "Public vendor";
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
    const heroJoinUrl = previewLocation ? buildJoinUrl(window.location.origin, selectedTenantSlug, previewLocation.slug) : "";

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
                <Stack gap={4} mt="md">
                  <Title className="vendor-hero-title" order={1}>
                    {previewVendorName}
                  </Title>
                  <Text className="vendor-hero-subtitle" fw={700} size="lg">
                    {themeForm.heroTitle || "Book ahead or join the public queue when same-day service is available."}
                  </Text>
                </Stack>
              </div>

              <Text className="vendor-hero-description">
                {themeForm.heroSubtitle ||
                  "This vendor is preparing detailed service information. You can still continue to the public queue when same-day service is available."}
              </Text>

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
                      <QRCode aria-label="Join queue QR code preview" value={heroJoinUrl || window.location.href} />
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
        fullScreen
        opened={themeDialogOpen}
        onClose={() => setThemeDialogOpen(false)}
        title={`Setup public board theme${themeLocation ? `: ${themeLocation.name}` : ""}`}
      >
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="xl">
          <ScrollArea h="calc(100vh - 120px)" offsetScrollbars>
            <Stack gap="md" pr="md">
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
                title="Public hero copy"
                description="Controls the subtitle and descriptive message displayed in the public vendor hero."
              >
                <SimpleGrid cols={{ base: 1, md: 2 }}>
                  <TextInput
                    name="heroTitle"
                    label="Hero subtitle"
                    description="Short line shown below the vendor name."
                    value={themeForm.heroTitle}
                    placeholder={themeLocation?.name || "Book ahead or join the queue."}
                    onChange={(event) => setThemeField("heroTitle", event.target.value)}
                  />
                  <TextInput
                    name="heroSubtitle"
                    label="Hero description"
                    description="Longer supporting text in the hero body."
                    value={themeForm.heroSubtitle}
                    placeholder="Customers can monitor their turn remotely."
                    onChange={(event) => setThemeField("heroSubtitle", event.target.value)}
                  />
                </SimpleGrid>
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
                <SimpleGrid cols={{ base: 1, md: 2 }}>
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
                <SimpleGrid cols={{ base: 1, md: 2 }}>
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
                <SimpleGrid cols={{ base: 1, md: 2 }}>
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
                <TextInput
                  name="logoUrl"
                  label="Logo URL"
                  description="Paste a hosted logo URL when not uploading a file."
                  value={themeForm.logoUrl}
                  onChange={(event) => setThemeField("logoUrl", event.target.value)}
                />
              </ModalSection>

              <ModalSection
                title="Colors"
                description="Tune text, page, and action colors used across the public vendor page and preview states."
              >
                <SimpleGrid cols={{ base: 1, md: 3 }}>
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
                <SimpleGrid cols={{ base: 1, md: 2 }}>
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
                  <FileInput
                    accept="image/png,image/jpeg,image/webp"
                    clearable
                    label="Service image"
                    placeholder={serviceForm.imageUrl ? "Replace service image" : "Upload service image"}
                    disabled={busyAction === "service-image-upload"}
                    onChange={(file) => uploadServiceImage(file)}
                  />
                  <TextInput
                    label="Service image URL"
                    value={serviceForm.imageUrl || ""}
                    onChange={(event) => setServiceForm((current) => ({ ...current, imageUrl: event.target.value }))}
                  />
                  {serviceForm.imageUrl ? <Image alt="" h={120} radius="md" src={serviceForm.imageUrl} /> : null}
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
                  <Divider />
                  <div>
                    <Text fw={700}>Branch inventory</Text>
                    <Text c="dimmed" size="sm">
                      Set the number of courts or slots this service has at each location.
                    </Text>
                  </div>
                  <Stack gap="sm">
                    {locations.length ? locations.map((location) => {
                      const nextEntry = serviceForm.locationServices?.find((entry) => entry.locationSlug === location.slug);
                      const groupFunded = normalizeGroupFundedSettings(nextEntry?.groupFunded);
                      const branchEnabled = nextEntry?.isActive !== false;
                      const updateLocationEntry = (updater: (entry: ServiceLocationFormEntry) => ServiceLocationFormEntry) => {
                        setServiceForm((current) => ({
                          ...current,
                          locationServices: (
                            current.locationServices || locations.map((item) => buildDefaultServiceLocationEntry(item.slug))
                          ).map((entry) =>
                            entry.locationSlug === location.slug
                              ? updater({
                                  ...buildDefaultServiceLocationEntry(location.slug),
                                  ...entry,
                                  groupFunded: normalizeGroupFundedSettings(entry.groupFunded)
                                })
                              : entry
                          )
                        }));
                      };
                      return (
                        <Card key={location.slug} withBorder radius="md" p="sm" className="service-dialog__panel">
                          <Stack gap="xs">
                            <Group justify="space-between" align="center">
                              <Text fw={600}>{location.name}</Text>
                              <Badge variant="light">{location.slug}</Badge>
                            </Group>
                            <NumberInput
                              label="Capacity"
                              min={1}
                              max={100}
                              value={nextEntry?.capacity || 1}
                              onChange={(value) =>
                                updateLocationEntry((entry) => ({
                                  ...entry,
                                  capacity: Number(value) || 1
                                }))
                              }
                            />
                            <Switch
                              checked={branchEnabled}
                              label="Available at this branch"
                              onChange={(event) =>
                                updateLocationEntry((entry) => ({
                                  ...entry,
                                  isActive: event.currentTarget.checked
                                }))
                              }
                            />
                            <Divider my="xs" />
                            <Stack gap="sm">
                              <Group justify="space-between" align="flex-start" gap="md">
                                <div>
                                  <Group gap="xs" align="center">
                                    <Text fw={700}>Group-funded booking</Text>
                                    <Badge color={groupFunded.enabled ? "orange" : "gray"} variant="light">
                                      {groupFunded.enabled ? "Enabled" : "Off"}
                                    </Badge>
                                  </Group>
                                  <Text c="dimmed" size="sm">
                                    Let customers create private-link campaigns for this branch service.
                                  </Text>
                                </div>
                                <Switch
                                  aria-label={`Enable group-funded booking for ${location.name}`}
                                  checked={groupFunded.enabled}
                                  disabled={!branchEnabled}
                                  onChange={(event) =>
                                    updateLocationEntry((entry) => ({
                                      ...entry,
                                      groupFunded: {
                                        ...normalizeGroupFundedSettings(entry.groupFunded),
                                        enabled: event.currentTarget.checked
                                      }
                                    }))
                                  }
                                />
                              </Group>
                              {groupFunded.enabled ? (
                                <Stack gap="sm">
                                  <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                                    <NumberInput
                                      allowDecimal={false}
                                      allowNegative={false}
                                      clampBehavior="strict"
                                      label="Min contributors"
                                      min={2}
                                      max={100}
                                      value={groupFunded.minRequiredContributors || 2}
                                      onChange={(value) =>
                                        updateLocationEntry((entry) => ({
                                          ...entry,
                                          groupFunded: {
                                            ...normalizeGroupFundedSettings(entry.groupFunded),
                                            minRequiredContributors: Number(value) || 2
                                          }
                                        }))
                                      }
                                    />
                                    <NumberInput
                                      allowDecimal={false}
                                      allowNegative={false}
                                      clampBehavior="strict"
                                      label="Default contributors"
                                      min={2}
                                      max={100}
                                      value={groupFunded.defaultRequiredContributors || 4}
                                      onChange={(value) =>
                                        updateLocationEntry((entry) => ({
                                          ...entry,
                                          groupFunded: {
                                            ...normalizeGroupFundedSettings(entry.groupFunded),
                                            defaultRequiredContributors: Number(value) || 4
                                          }
                                        }))
                                      }
                                    />
                                    <NumberInput
                                      allowDecimal={false}
                                      allowNegative={false}
                                      clampBehavior="strict"
                                      label="Max contributors"
                                      min={2}
                                      max={100}
                                      value={groupFunded.maxRequiredContributors || 12}
                                      onChange={(value) =>
                                        updateLocationEntry((entry) => ({
                                          ...entry,
                                          groupFunded: {
                                            ...normalizeGroupFundedSettings(entry.groupFunded),
                                            maxRequiredContributors: Number(value) || 12
                                          }
                                        }))
                                      }
                                    />
                                  </SimpleGrid>
                                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                                    <NumberInput
                                      allowDecimal={false}
                                      allowNegative={false}
                                      clampBehavior="strict"
                                      label="Min deadline hours"
                                      min={1}
                                      max={720}
                                      value={groupFunded.minDeadlineHours || 24}
                                      onChange={(value) =>
                                        updateLocationEntry((entry) => ({
                                          ...entry,
                                          groupFunded: {
                                            ...normalizeGroupFundedSettings(entry.groupFunded),
                                            minDeadlineHours: Number(value) || 24
                                          }
                                        }))
                                      }
                                    />
                                    <NumberInput
                                      allowDecimal={false}
                                      allowNegative={false}
                                      clampBehavior="strict"
                                      label="Max deadline days"
                                      min={1}
                                      max={90}
                                      value={groupFunded.maxDeadlineDays || 14}
                                      onChange={(value) =>
                                        updateLocationEntry((entry) => ({
                                          ...entry,
                                          groupFunded: {
                                            ...normalizeGroupFundedSettings(entry.groupFunded),
                                            maxDeadlineDays: Number(value) || 14
                                          }
                                        }))
                                      }
                                    />
                                  </SimpleGrid>
                                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                                    <NumberInput
                                      allowDecimal={false}
                                      allowNegative={false}
                                      label="Min share"
                                      min={0}
                                      prefix="PHP "
                                      value={
                                        groupFunded.minContributionAmountCents === null
                                          ? undefined
                                          : groupFunded.minContributionAmountCents / 100
                                      }
                                      onChange={(value) =>
                                        updateLocationEntry((entry) => ({
                                          ...entry,
                                          groupFunded: {
                                            ...normalizeGroupFundedSettings(entry.groupFunded),
                                            minContributionAmountCents:
                                              value === "" || value === null
                                                ? null
                                                : Math.max(0, Math.round((Number(value) || 0) * 100))
                                          }
                                        }))
                                      }
                                    />
                                    <NumberInput
                                      allowDecimal={false}
                                      allowNegative={false}
                                      label="Max share"
                                      min={0}
                                      prefix="PHP "
                                      value={
                                        groupFunded.maxContributionAmountCents === null
                                          ? undefined
                                          : groupFunded.maxContributionAmountCents / 100
                                      }
                                      onChange={(value) =>
                                        updateLocationEntry((entry) => ({
                                          ...entry,
                                          groupFunded: {
                                            ...normalizeGroupFundedSettings(entry.groupFunded),
                                            maxContributionAmountCents:
                                              value === "" || value === null
                                                ? null
                                                : Math.max(0, Math.round((Number(value) || 0) * 100))
                                          }
                                        }))
                                      }
                                    />
                                  </SimpleGrid>
                                  <Switch
                                    checked={groupFunded.allowPublicCampaigns}
                                    label="Allow public campaigns on vendor profile"
                                    description="Private-link campaigns remain available when group-funded booking is enabled."
                                    onChange={(event) =>
                                      updateLocationEntry((entry) => ({
                                        ...entry,
                                        groupFunded: {
                                          ...normalizeGroupFundedSettings(entry.groupFunded),
                                          allowPublicCampaigns: event.currentTarget.checked
                                        }
                                      }))
                                    }
                                  />
                                </Stack>
                              ) : null}
                            </Stack>
                          </Stack>
                        </Card>
                      );
                    }) : (
                      <Alert color="yellow">Add locations before assigning branch inventory.</Alert>
                    )}
                  </Stack>
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
                {availabilitySummary?.hasSharedLocationCapacity && availabilitySummary?.hasServiceSpecificCapacity ? (
                  <Alert color="yellow" variant="light">
                    This location mixes shared branch capacity and service-specific court capacity. A shared rule can make one court&apos;s booking block other courts.
                  </Alert>
                ) : null}
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
                                <GroupFundedBookingIndicator booking={booking} />
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
                              <GroupFundedBookingIndicator booking={booking} />
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

  function renderGroupFundedPage() {
    const campaigns = groupFundedCampaignsQuery.data?.campaigns || [];
    const reviewReadyCount = campaigns.filter((campaign) => campaign.campaignStatus === "vendor_review").length;
    const proofReviewCount = campaigns.filter((campaign) =>
      ["funding", "funded", "vendor_review"].includes(campaign.campaignStatus)
    ).length;
    const selectedDetail = groupFundedDetailQuery.data || null;
    const selectedDetailBundleItems = selectedDetail
      ? (
          selectedDetail.campaign.bundleItems?.length
            ? selectedDetail.campaign.bundleItems.map((item) => {
                const rawItem = item as RawGroupFundedBundleItem;
                return {
                  id: rawItem.id || rawItem._id || null,
                  serviceId: rawItem.serviceId,
                  serviceName: rawItem.serviceName || rawItem.serviceNameSnapshot || selectedDetail.campaign.serviceName,
                  serviceSlug: rawItem.serviceSlug || rawItem.serviceSlugSnapshot || "",
                  bookingQuantity: rawItem.bookingQuantity,
                  priceAmountCents: rawItem.priceAmountCents,
                  currency: rawItem.currency,
                  executionMode: rawItem.executionMode,
                  scheduledStartAt: rawItem.scheduledStartAt,
                  scheduledEndAt: rawItem.scheduledEndAt,
                  sortOrder: rawItem.sortOrder
                };
              })
            : [{
                id: null,
                serviceId: selectedDetail.campaign.serviceId,
                serviceName: selectedDetail.campaign.serviceName,
                serviceSlug: selectedDetail.campaign.serviceSlug,
                bookingQuantity: selectedDetail.campaign.bookingQuantity,
                priceAmountCents: selectedDetail.campaign.targetAmountCents,
                currency: selectedDetail.campaign.currency,
                executionMode: "parallel" as const,
                scheduledStartAt: selectedDetail.campaign.scheduledStartAt,
                scheduledEndAt: selectedDetail.campaign.scheduledEndAt,
                sortOrder: 0
              }]
        )
      : [];
    const selectedDetailHasServiceBundle = selectedDetailBundleItems.length > 1;
    const submittedContributions = selectedDetail?.contributions.filter(
      (contribution) => contribution.contributionStatus === "submitted"
    ) || [];
    const verifiedContributions = selectedDetail?.contributions.filter(
      (contribution) => contribution.contributionStatus === "verified"
    ) || [];
    const activeCapacityHold = selectedDetail?.capacityHolds.find((hold) => hold.holdStatus === "active") || null;
    const selectedDetailFundingReached = Boolean(
      selectedDetail &&
      (
        selectedDetail.campaign.fundedAmountCents >= selectedDetail.campaign.targetAmountCents ||
        selectedDetail.campaign.paidParticipantCount >= selectedDetail.campaign.requiredContributors ||
        selectedDetail.campaign.campaignStatus !== "funding"
      )
    );

    return (
      <Stack gap="lg">
        <SimpleGrid cols={{ base: 1, md: 3 }}>
          <MetricCard
            detail="Campaigns matching the current branch and filter."
            label="Campaigns"
            value={campaigns.length}
          />
          <MetricCard
            detail="Campaigns with submitted or active funding work."
            label="Funding work"
            value={proofReviewCount}
          />
          <MetricCard
            detail="Fully funded campaigns waiting for a vendor decision."
            label="Vendor review"
            value={reviewReadyCount}
          />
        </SimpleGrid>

        <Card className="neura-card" padding="lg">
          <Stack gap="md">
            <Group align="flex-end" justify="space-between">
              <div>
                <Text className="neura-label">Vendor operations</Text>
                <Title order={3}>Group-funded campaigns</Title>
                <Text c="dimmed" size="sm">
                  Review contribution proofs, funding progress, capacity holds, and approval decisions.
                </Text>
              </div>
              <Group gap="sm">
                <Select
                  data={[
                    { label: "All statuses", value: "all" },
                    { label: "Funding", value: "funding" },
                    { label: "Vendor review", value: "vendor_review" },
                    { label: "Slot recovery", value: "slot_recovery" },
                    { label: "Replacement proposed", value: "replacement_proposed" },
                    { label: "Confirmed", value: "confirmed" },
                    { label: "Vendor rejected", value: "vendor_rejected" },
                    { label: "Funding failed", value: "funding_failed" }
                  ]}
                  label="Status"
                  value={groupFundedStatusFilter}
                  onChange={(value) => setGroupFundedStatusFilter((value || "all") as GroupFundedStatusFilter)}
                />
                <Button className="neura-secondary-button" mt={24} onClick={reloadGroupFundedCampaigns}>
                  Refresh
                </Button>
              </Group>
            </Group>

            {groupFundedCampaignsQuery.isFetching ? (
              <Text c="dimmed" size="sm">Loading group-funded campaigns...</Text>
            ) : null}

            {campaigns.length ? (
              <Table.ScrollContainer minWidth={1160}>
                <Table className="neura-bookings-table" verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th className="neura-bookings-table__sticky neura-bookings-table__sticky-first" style={{ width: 84 }}>
                        ID
                      </Table.Th>
                      <Table.Th>Campaign</Table.Th>
                      <Table.Th>Service</Table.Th>
                      <Table.Th>Schedule</Table.Th>
                      <Table.Th>Funding</Table.Th>
                      <Table.Th>Status</Table.Th>
                      <Table.Th>Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {campaigns.map((campaign) => {
                      const progress = campaign.targetAmountCents > 0
                        ? Math.min(100, Math.round((campaign.fundedAmountCents / campaign.targetAmountCents) * 100))
                        : 0;
                      return (
                        <Table.Tr key={campaign.id}>
                          <Table.Td
                            className="neura-bookings-table__sticky neura-bookings-table__sticky-first"
                            fw={700}
                            style={{ width: 84 }}
                          >
                            #{campaign.id}
                          </Table.Td>
                          <Table.Td>
                            <Stack gap={2}>
                              <Button
                                className="neura-inline-link-button"
                                onClick={() => {
                                  resetGroupFundedCampaignDecision();
                                  closeGroupFundedContributionRejectModal();
                                  setGroupFundedRefundNotes({});
                                  setGroupFundedDetailId(campaign.id);
                                }}
                                p={0}
                                size="xs"
                                variant="subtle"
                              >
                                {campaign.campaignTitle || campaign.serviceName}
                              </Button>
                              <Text c="dimmed" size="sm">
                                Organizer {campaign.organizerDisplayName || "Customer"}
                              </Text>
                              <Badge color={campaign.visibility === "public" ? "blue" : "gray"} variant="light" w="fit-content">
                                {campaign.visibility.replace(/_/g, " ")}
                              </Badge>
                            </Stack>
                          </Table.Td>
                          <Table.Td>
                            <Stack gap={2}>
                              <Text fw={700}>{campaign.serviceName}</Text>
                              <Text c="dimmed" size="sm">{campaign.locationName}</Text>
                              <Text c="dimmed" size="sm">Quantity {campaign.bookingQuantity}</Text>
                            </Stack>
                          </Table.Td>
                          <Table.Td>
                            <Stack gap={2}>
                              <Text>{formatBookingScheduleDateTime(campaign.scheduledStartAt)}</Text>
                              <Text c="dimmed" size="sm">
                                Ends {formatBookingScheduleDateTime(campaign.scheduledEndAt)}
                              </Text>
                              <Text c="dimmed" size="sm">
                                Deadline {formatBookingScheduleDateTime(campaign.fundingDeadlineAt)}
                              </Text>
                            </Stack>
                          </Table.Td>
                          <Table.Td>
                            <Stack gap={4}>
                              <Text fw={700}>
                                {formatMoney(campaign.fundedAmountCents, campaign.currency)} / {formatMoney(campaign.targetAmountCents, campaign.currency)}
                              </Text>
                              <Slider value={progress} disabled label={null} color="teal" />
                              <Text c="dimmed" size="sm">
                                {campaign.paidParticipantCount}/{campaign.requiredContributors} verified · {formatMoney(campaign.requiredContributionAmountCents, campaign.currency)} each
                              </Text>
                            </Stack>
                          </Table.Td>
                          <Table.Td>
                            <Stack gap={4}>
                              <Badge color={getGroupFundedStatusColor(campaign.campaignStatus)} variant="light" w="fit-content">
                                {campaign.campaignStatus.replace(/_/g, " ")}
                              </Badge>
                              {isGroupFundedCampaignFullyRefunded(campaign) ? (
                                <Badge color="teal" variant="light" w="fit-content">
                                  Fully refunded
                                </Badge>
                              ) : null}
                            </Stack>
                          </Table.Td>
                          <Table.Td>
                            <Button
                              className="neura-secondary-button"
                              size="xs"
                              onClick={() => {
                                resetGroupFundedCampaignDecision();
                                closeGroupFundedContributionRejectModal();
                                setGroupFundedRefundNotes({});
                                setGroupFundedDetailId(campaign.id);
                              }}
                            >
                              Review
                            </Button>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            ) : (
              <DashboardEmptyState
                title="No group-funded campaigns"
                text="Campaigns for this branch will appear here when customers start or contribute to group-funded bookings."
              />
            )}
          </Stack>
        </Card>

        <Modal
          centered
          className="group-funded-detail-modal"
          opened={Boolean(groupFundedDetailId)}
          onClose={() => {
            setGroupFundedDetailId(null);
            resetGroupFundedCampaignDecision();
            closeGroupFundedContributionRejectModal();
            setGroupFundedRefundNotes({});
          }}
          size={1120}
          title={
            <Stack gap={2}>
              <Text className="booking-detail__eyebrow">Group-funded campaign</Text>
              <Text className="booking-detail__title">
                {selectedDetail
                  ? selectedDetailHasServiceBundle
                    ? `${selectedDetailBundleItems.length} bundled services`
                    : selectedDetail.campaign.serviceName
                  : "Loading campaign"}
              </Text>
            </Stack>
          }
          scrollAreaComponent={ScrollArea.Autosize}
        >
          {groupFundedDetailQuery.isFetching ? (
            <Text c="dimmed">Loading campaign details...</Text>
          ) : selectedDetail ? (
            <Stack className="group-funded-detail-content" gap="lg">
              <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm">
                <Paper withBorder radius="md" p="md">
                  <Text c="dimmed" size="xs">Status</Text>
                  <Badge color={getGroupFundedStatusColor(selectedDetail.campaign.campaignStatus)} variant="light">
                    {selectedDetail.campaign.campaignStatus.replace(/_/g, " ")}
                  </Badge>
                </Paper>
                <Paper withBorder radius="md" p="md">
                  <Text c="dimmed" size="xs">Funding</Text>
                  <Text fw={800}>
                    {formatMoney(selectedDetail.campaign.fundedAmountCents, selectedDetail.campaign.currency)}
                  </Text>
                  <Text c="dimmed" size="sm">
                    Target {formatMoney(selectedDetail.campaign.targetAmountCents, selectedDetail.campaign.currency)}
                  </Text>
                </Paper>
                <Paper withBorder radius="md" p="md">
                  <Text c="dimmed" size="xs">Capacity hold</Text>
                  <Text fw={800}>{activeCapacityHold ? activeCapacityHold.holdStatus : "None"}</Text>
                  {activeCapacityHold ? (
                    <Text c="dimmed" size="sm">Expires {formatDateTime(activeCapacityHold.expiresAt)}</Text>
                  ) : null}
                </Paper>
              </SimpleGrid>

              <Paper withBorder radius="md" p="md">
                <Stack gap="md">
                  <Group align="flex-start" justify="space-between">
                    <div>
                      <Text className="finazze-section-label">Campaign details</Text>
                      <Title order={3}>{selectedDetail.campaign.campaignTitle || selectedDetail.campaign.serviceName}</Title>
                      <Text c="dimmed" size="sm">
                        Organized by {selectedDetail.campaign.organizerDisplayName || "Customer"}
                      </Text>
                    </div>
                    <Badge color={selectedDetail.campaign.visibility === "public" ? "blue" : "gray"} variant="light">
                      {selectedDetail.campaign.visibility === "public" ? "Public" : "Private link"}
                    </Badge>
                  </Group>

                  {selectedDetail.campaign.description ? (
                    <Text>{selectedDetail.campaign.description}</Text>
                  ) : (
                    <Text c="dimmed" size="sm">No campaign description provided.</Text>
                  )}

                  <Paper withBorder radius="md" p="sm">
                    <Stack gap="sm">
                      <Group justify="space-between" align="flex-start">
                        <Stack gap={2}>
                          <Text c="dimmed" size="xs">
                            {selectedDetailHasServiceBundle ? "Bundled services" : "Selected service"}
                          </Text>
                          <Text fw={800}>
                            {selectedDetailHasServiceBundle
                              ? `${selectedDetailBundleItems.length} services in this campaign`
                              : selectedDetailBundleItems[0]?.serviceName || selectedDetail.campaign.serviceName}
                          </Text>
                        </Stack>
                        <Badge color="teal" variant="light">
                          {selectedDetailHasServiceBundle ? "Service bundle" : "Single service"}
                        </Badge>
                      </Group>
                      <SimpleGrid cols={{ base: 1, sm: selectedDetailHasServiceBundle ? 2 : 1 }} spacing="sm">
                        {selectedDetailBundleItems.map((item) => (
                          <Paper key={item.id || item.serviceSlug} withBorder radius="md" p="sm">
                            <Stack gap={4}>
                              <Group justify="space-between" gap="sm" wrap="nowrap">
                                <Text fw={800}>{item.serviceName}</Text>
                                <Badge variant="light">x{item.bookingQuantity}</Badge>
                              </Group>
                              <Text c="dimmed" size="sm">
                                {formatBookingScheduleTimeRange(item.scheduledStartAt, item.scheduledEndAt)}
                              </Text>
                              <Text c="dimmed" size="sm">
                                {formatMoney(item.priceAmountCents, item.currency)}
                              </Text>
                            </Stack>
                          </Paper>
                        ))}
                      </SimpleGrid>
                    </Stack>
                  </Paper>

                  <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="sm">
                    <Stack gap={2}>
                      <Text c="dimmed" size="xs">Booking</Text>
                      <Text fw={700}>{formatBookingScheduleDateTime(selectedDetail.campaign.scheduledStartAt)}</Text>
                      <Text c="dimmed" size="sm">
                        Ends {formatBookingScheduleDateTime(selectedDetail.campaign.scheduledEndAt)}
                      </Text>
                    </Stack>
                    <Stack gap={2}>
                      <Text c="dimmed" size="xs">Service</Text>
                      <Text fw={700}>
                        {selectedDetailHasServiceBundle
                          ? `${selectedDetailBundleItems.length} bundled services`
                          : selectedDetail.campaign.serviceName}
                      </Text>
                      <Text c="dimmed" size="sm">
                        {selectedDetail.campaign.locationName} · {selectedDetailHasServiceBundle ? "Service bundle" : `Quantity ${selectedDetail.campaign.bookingQuantity}`}
                      </Text>
                    </Stack>
                    <Stack gap={2}>
                      <Text c="dimmed" size="xs">Deadline</Text>
                      <Text fw={700}>{formatBookingScheduleDateTime(selectedDetail.campaign.fundingDeadlineAt)}</Text>
                      <Text c="dimmed" size="sm">
                        Created {formatDateTime(selectedDetail.campaign.createdAt)}
                      </Text>
                    </Stack>
                    <Stack gap={2}>
                      <Text c="dimmed" size="xs">Contributors</Text>
                      <Text fw={700}>
                        {selectedDetail.campaign.paidParticipantCount}/{selectedDetail.campaign.requiredContributors} verified
                      </Text>
                      <Text c="dimmed" size="sm">
                        {formatMoney(selectedDetail.campaign.requiredContributionAmountCents, selectedDetail.campaign.currency)} each
                      </Text>
                    </Stack>
                  </SimpleGrid>
                </Stack>
              </Paper>

              <Paper className="group-funded-detail-table-card" withBorder radius="md" p="md">
                <Stack gap="sm">
                  <Group justify="space-between">
                    <div>
                      <Text fw={800}>Contribution proofs</Text>
                      <Text c="dimmed" size="sm">
                        {submittedContributions.length} submitted · {verifiedContributions.length} verified
                      </Text>
                    </div>
                  </Group>
                  {selectedDetail.contributions.length ? (
                    <Table.ScrollContainer className="group-funded-detail-table-scroll" minWidth={920}>
                      <Table className="neura-bookings-table neura-bookings-table--compact" verticalSpacing="sm">
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th className="neura-bookings-table__sticky neura-bookings-table__sticky-first group-funded-contributions-table__row-number">#</Table.Th>
                            <Table.Th className="group-funded-contributions-table__contributor">Contributor</Table.Th>
                            <Table.Th>Amount</Table.Th>
                            <Table.Th>Reference</Table.Th>
                            <Table.Th className="group-funded-contributions-table__status">Status</Table.Th>
                            <Table.Th>Actions</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {selectedDetail.contributions.map((contribution, index) => (
                            <Table.Tr key={contribution.id}>
                              <Table.Td className="neura-bookings-table__sticky neura-bookings-table__sticky-first group-funded-contributions-table__row-number">
                                {index + 1}
                              </Table.Td>
                              <Table.Td className="group-funded-contributions-table__contributor">
                                <Stack gap={2}>
                                  <Text fw={700}>{contribution.participantDisplayName || `User ${contribution.userId}`}</Text>
                                  <Text c="dimmed" size="xs">
                                    User {contribution.userId}
                                  </Text>
                                </Stack>
                              </Table.Td>
                              <Table.Td>{formatMoney(contribution.amountCents, contribution.currency)}</Table.Td>
                              <Table.Td>
                                <Stack gap={2}>
                                  <Text>{contribution.paymentReference || "-"}</Text>
                                  {contribution.paymentProof ? (
                                    <Group gap="xs">
                                      <Text c="dimmed" size="xs">
                                        Proof: {contribution.paymentProof.fileName}
                                      </Text>
                                      <Button
                                        color="dark"
                                        loading={busyAction === `group-funded-proof:${contribution.id}`}
                                        onClick={() => handleViewGroupFundedContributionProof(contribution)}
                                        size="compact-xs"
                                        variant="subtle"
                                      >
                                        View proof
                                      </Button>
                                    </Group>
                                  ) : null}
                                </Stack>
                              </Table.Td>
                              <Table.Td className="group-funded-contributions-table__status">
                                <Badge className="group-funded-contributions-table__status-badge" color={contribution.contributionStatus === "verified" ? "teal" : contribution.contributionStatus === "rejected" ? "red" : "yellow"} variant="light">
                                  {contribution.contributionStatus.replace(/_/g, " ")}
                                </Badge>
                              </Table.Td>
                              <Table.Td>
                                {contribution.contributionStatus === "submitted" && canAdminBookings ? (
                                  <Stack gap="xs">
                                    <Group gap="xs">
                                      <Button
                                        color="teal"
                                        disabled={
                                          busyAction === `group-funded-contribution-verify:${contribution.id}` ||
                                          selectedDetailFundingReached
                                        }
                                        onClick={() => handleVerifyGroupFundedContribution(contribution)}
                                        size="xs"
                                        variant="light"
                                      >
                                        Verify
                                      </Button>
                                      <Button
                                        color="red"
                                        disabled={busyAction === `group-funded-contribution-reject:${contribution.id}`}
                                        onClick={() => openGroupFundedContributionRejectModal(contribution)}
                                        size="xs"
                                        variant="light"
                                      >
                                        Reject
                                      </Button>
                                    </Group>
                                    {selectedDetailFundingReached ? (
                                      <Text c="dimmed" size="xs">
                                        Campaign is already fully funded. Reject remaining submitted proofs.
                                      </Text>
                                    ) : null}
                                  </Stack>
                                ) : (
                                  <Text c="dimmed" size="xs">No action</Text>
                                )}
                              </Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    </Table.ScrollContainer>
                  ) : (
                    <Alert color="yellow" variant="light">No contribution proofs have been submitted yet.</Alert>
                  )}
                </Stack>
              </Paper>

              {selectedDetail.refunds.length ? (
                <Paper withBorder radius="md" p="md">
                  <Stack gap="sm">
                    <Group justify="space-between">
                      <Text fw={800}>Refund obligations</Text>
                      {isGroupFundedCampaignFullyRefunded(selectedDetail.campaign) ? (
                        <Badge color="teal" variant="light">All contributor refunds completed</Badge>
                      ) : null}
                    </Group>
                    {selectedDetail.refunds.map((refund) => (
                      <Paper key={refund.id} withBorder radius="md" p="sm">
                        <Stack gap="sm">
                          <Group align="flex-start" justify="space-between">
                            <div>
                              <Text fw={700}>{formatMoney(refund.amountCents, refund.currency)}</Text>
                              <Text c="dimmed" size="sm">
                                Reason {refund.refundReason.replace(/_/g, " ")} · User {refund.userId}
                              </Text>
                              {refund.completedAt ? (
                                <Text c="dimmed" size="sm">
                                  Completed {formatDateTime(refund.completedAt)}
                                </Text>
                              ) : null}
                            </div>
                            <Badge color={getGroupFundedRefundStatusColor(refund.refundStatus)} variant="light">
                              {refund.refundStatus.replace(/_/g, " ")}
                            </Badge>
                          </Group>
                          <Textarea
                            disabled={refund.refundStatus === "completed"}
                            label="Refund notes"
                            minRows={2}
                            onChange={(event) =>
                              setGroupFundedRefundNotes((current) => ({
                                ...current,
                                [refund.id]: event.currentTarget.value
                              }))
                            }
                            placeholder="Add reference number, channel, or internal handling notes"
                            value={groupFundedRefundNotes[refund.id] ?? refund.notes ?? ""}
                          />
                          {canAdminBookings ? (
                            <Group justify="flex-end">
                              <Button
                                disabled={refund.refundStatus === "completed"}
                                loading={busyAction === `group-funded-refund:${refund.id}:in_progress`}
                                onClick={() => handleUpdateGroupFundedRefund(refund, "in_progress")}
                                size="xs"
                                variant="light"
                              >
                                Mark in progress
                              </Button>
                              <Button
                                color="orange"
                                disabled={refund.refundStatus === "completed"}
                                loading={busyAction === `group-funded-refund:${refund.id}:policy_review_required`}
                                onClick={() => handleUpdateGroupFundedRefund(refund, "policy_review_required")}
                                size="xs"
                                variant="light"
                              >
                                Policy review
                              </Button>
                              <Button
                                color="teal"
                                disabled={refund.refundStatus === "completed"}
                                loading={busyAction === `group-funded-refund:${refund.id}:completed`}
                                onClick={() => handleUpdateGroupFundedRefund(refund, "completed")}
                                size="xs"
                              >
                                Mark refunded
                              </Button>
                            </Group>
                          ) : null}
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                </Paper>
              ) : null}

              {selectedDetail.campaign.campaignStatus === "vendor_review" && canAdminBookings ? (
                <Paper withBorder radius="md" p="md">
                  <Stack gap="sm">
                    <Text fw={800}>Vendor decision</Text>
                    <Text c="dimmed" size="sm">
                      Approval creates one linked paid booking for the organizer. Rejection makes verified contributions refund-eligible.
                    </Text>
                    <Select
                      clearable
                      data={groupFundedCampaignRejectionReasons.map((reason) => ({
                        label: reason.label,
                        value: reason.value
                      }))}
                      label="Common rejection reason"
                      onChange={(value) => {
                        setGroupFundedRejectReasonPreset(value);
                        const selectedReason = groupFundedCampaignRejectionReasons.find((reason) => reason.value === value);
                        setGroupFundedRejectReason(selectedReason?.reason || "");
                      }}
                      placeholder="Select a common reason"
                      value={groupFundedRejectReasonPreset}
                    />
                    <Textarea
                      label="Rejection reason"
                      disabled={!groupFundedUseCustomRejectReason}
                      minRows={2}
                      placeholder="Select a common reason or enable custom rejection reason"
                      value={groupFundedRejectReason}
                      onChange={(event) => setGroupFundedRejectReason(event.currentTarget.value)}
                    />
                    <Checkbox
                      checked={groupFundedUseCustomRejectReason}
                      label="Use custom rejection reason"
                      onChange={(event) => setGroupFundedUseCustomRejectReason(event.currentTarget.checked)}
                    />
                    <Group justify="flex-end">
                      <Button
                        color="red"
                        disabled={busyAction === `group-funded-reject:${selectedDetail.campaign.id}`}
                        onClick={() => handleRejectGroupFundedCampaign(selectedDetail.campaign)}
                        variant="light"
                      >
                        Reject campaign
                      </Button>
                      <Button
                        color="teal"
                        disabled={busyAction === `group-funded-approve:${selectedDetail.campaign.id}`}
                        onClick={() => handleApproveGroupFundedCampaign(selectedDetail.campaign)}
                      >
                        Approve booking
                      </Button>
                    </Group>
                  </Stack>
                </Paper>
              ) : null}
            </Stack>
          ) : (
            <Alert color="red">Campaign details could not be loaded.</Alert>
          )}
        </Modal>

        <Modal
          centered
          onClose={closeGroupFundedContributionRejectModal}
          opened={Boolean(groupFundedContributionToReject)}
          size="md"
          title="Reject contribution proof"
        >
          <Stack gap="md">
            <Text c="dimmed" size="sm">
              Tell the contributor why their payment proof cannot be accepted. They will see this reason in their campaign details.
            </Text>
            <Paper withBorder radius="md" p="sm">
              <Text fw={700}>
                {groupFundedContributionToReject?.participantDisplayName || `User ${groupFundedContributionToReject?.userId || ""}`}
              </Text>
              <Text c="dimmed" size="sm">
                {groupFundedContributionToReject
                  ? `${formatMoney(groupFundedContributionToReject.amountCents, groupFundedContributionToReject.currency)} · ${groupFundedContributionToReject.paymentReference || "No payment reference"}`
                  : ""}
              </Text>
            </Paper>
            <Select
              clearable
              data={groupFundedContributionRejectionReasons.map((reason) => ({ label: reason.label, value: reason.value }))}
              label="Common rejection reason"
              onChange={(value) => {
                setGroupFundedContributionRejectReasonPreset(value);
                const selectedReason = groupFundedContributionRejectionReasons.find((reason) => reason.value === value);
                setGroupFundedContributionRejectReason(selectedReason?.reason || "");
                setGroupFundedContributionUseCustomRejectReason(false);
              }}
              placeholder="Select a common reason"
              value={groupFundedContributionRejectReasonPreset}
            />
            <Checkbox
              checked={groupFundedContributionUseCustomRejectReason}
              label="Use custom rejection reason"
              onChange={(event) => {
                const useCustom = event.currentTarget.checked;
                setGroupFundedContributionUseCustomRejectReason(useCustom);
                setGroupFundedContributionRejectReasonPreset(null);
                setGroupFundedContributionRejectReason("");
              }}
            />
            <Textarea
              disabled={!groupFundedContributionUseCustomRejectReason}
              label="Custom rejection reason"
              minRows={3}
              onChange={(event) => setGroupFundedContributionRejectReason(event.currentTarget.value)}
              placeholder="Enable custom reason to write a contributor-visible explanation"
              value={groupFundedContributionRejectReason}
            />
            <Checkbox
              checked={groupFundedContributionRefundRequired}
              description="Use when payment was received but cannot be accepted."
              label="Refund required"
              onChange={(event) => setGroupFundedContributionRefundRequired(event.currentTarget.checked)}
            />
            <Group justify="flex-end">
              <Button onClick={closeGroupFundedContributionRejectModal} variant="default">Cancel</Button>
              <Button
                color="red"
                disabled={!groupFundedContributionRejectReason.trim()}
                loading={busyAction === `group-funded-contribution-reject:${groupFundedContributionToReject?.id}`}
                onClick={() => void handleRejectGroupFundedContribution()}
              >
                Reject contribution
              </Button>
            </Group>
          </Stack>
        </Modal>

        <Modal
          centered
          onClose={() => setGroupFundedProofModalOpen(false)}
          opened={groupFundedProofModalOpen}
          size="lg"
          title="Contribution payment proof"
        >
          {groupFundedProofContribution?.paymentProof ? (
            <Stack gap="md">
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <Paper withBorder radius="md" p="md">
                  <Text className="finazze-section-label">Contributor</Text>
                  <Text fw={800}>
                    {groupFundedProofContribution.participantDisplayName || `User ${groupFundedProofContribution.userId}`}
                  </Text>
                  <Text c="dimmed" size="sm">User {groupFundedProofContribution.userId}</Text>
                </Paper>
                <Paper withBorder radius="md" p="md">
                  <Text className="finazze-section-label">Proof</Text>
                  <Text fw={800}>{groupFundedProofContribution.paymentProof.fileName}</Text>
                  <Text c="dimmed" size="sm">
                    {formatBytes(groupFundedProofContribution.paymentProof.sizeBytes)}
                  </Text>
                  <Text c="dimmed" size="sm">
                    Reference: {groupFundedProofContribution.paymentReference || "No reference"}
                  </Text>
                </Paper>
              </SimpleGrid>

              {groupFundedProofError ? (
                <Alert color="red" variant="light">
                  {groupFundedProofError}
                </Alert>
              ) : null}

              {groupFundedProofAccessUrl && groupFundedProofContribution.paymentProof.contentType.startsWith("image/") ? (
                <Image
                  alt="Contribution payment proof"
                  fit="contain"
                  mah={520}
                  radius="md"
                  src={groupFundedProofAccessUrl}
                />
              ) : groupFundedProofAccessUrl ? (
                <Box
                  component="iframe"
                  src={groupFundedProofAccessUrl}
                  title="Contribution payment proof"
                  w="100%"
                  h={520}
                  style={{ border: "1px solid #e2e8f0", borderRadius: 12 }}
                />
              ) : !groupFundedProofError ? (
                <Alert color="gray" variant="light">Loading private proof preview...</Alert>
              ) : null}

              {groupFundedProofAccessUrl ? (
                <Button
                  component="a"
                  href={groupFundedProofAccessUrl}
                  leftSection={<IconExternalLink size={16} />}
                  rel="noopener noreferrer"
                  target="_blank"
                  variant="light"
                  w="fit-content"
                >
                  Open proof in new tab
                </Button>
              ) : null}
            </Stack>
          ) : (
            <Alert color="gray" variant="light">No contribution proof selected.</Alert>
          )}
        </Modal>
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
      })),
      ...activeGroupFundedAlerts.map((event) => ({
        actionLabel: "Review campaign",
        body: (
          <>
            {getGroupFundedDashboardAlertLead(event)}{" "}
            <Text component="span" fw={900}>
              {event.campaign.campaignTitle || event.campaign.serviceName}
            </Text>
          </>
        ),
        campaignId: event.campaign.id,
        id: event.id,
        kind: "group-funded" as const,
        title: getGroupFundedDashboardAlertTitle(event)
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
                    if (alert.kind === "group-funded") {
                      clearGroupFundedAlert(alert.id);
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
                        if (alert.kind === "group-funded") {
                          resetGroupFundedCampaignDecision();
                          closeGroupFundedContributionRejectModal();
                          setGroupFundedRefundNotes({});
                          setGroupFundedDetailId(alert.campaignId);
                          clearGroupFundedAlert(alert.id);
                          navigate("/dashboard/group-funded");
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

    if (currentSection === "group-funded") {
      return renderGroupFundedPage();
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
