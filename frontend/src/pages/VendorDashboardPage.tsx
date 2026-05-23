import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ActionIcon,
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
  Modal,
  MultiSelect,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  SegmentedControl,
  SimpleGrid,
  Slider,
  Stack,
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
  IconLogout,
  IconQrcode,
  IconSettings,
  IconUsersGroup
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import QRCode from "react-qr-code";
import { Navigate, NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import type {
  BillingOverviewResponse,
  CheckoutSessionResponse,
  CheckoutSyncResponse,
  CreateCheckoutRequest,
  CreateWalkInTicketRequest,
  QueueHistoryTicket,
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
  AddVendorStaffRequest,
  UpdateVendorStaffRequest,
  HistoryExportRange,
  SubscriptionPlanSlug,
  TicketMutationResponse,
  UpdateTenantSettingsRequest,
  VendorClientsResponse
} from "@shared";
import { API_BASE_URL, apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { buildJoinUrl, buildMonitorUrl } from "../queuePaths";
import { getErrorMessage } from "../utils/errors";

const dashboardSections = new Set(["queue", "tenants", "staff", "clients", "history", "reports", "settings"]);
const SERVICE_TREND_USER_LIMIT = 30;

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

type DashboardSection = "queue" | "tenants" | "staff" | "clients" | "history" | "reports" | "settings";
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
  { section: "staff", label: "Staff", icon: IconUsersGroup },
  { section: "clients", label: "Clients", icon: IconUsersGroup },
  { section: "history", label: "History", icon: IconHistory },
  { section: "reports", label: "Reports", icon: IconChartBar },
  { section: "settings", label: "Settings", icon: IconSettings }
] as const;
const staffAllowedSections = new Set<DashboardSection>(["queue", "clients", "history"]);

function getHistoryTimestamp(value: string | Date): number {
  return new Date(value).getTime();
}

function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString();
}

function formatDate(value: string | Date | null): string {
  return value ? new Date(value).toLocaleDateString() : "";
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
  const currentSection = (
    section && dashboardSections.has(section) ? section : "queue"
  ) as DashboardSection;
  const invalidSection = Boolean(section && !dashboardSections.has(section));
  const [selectedTenantSlug, setSelectedTenantSlug] = useState("");
  const [selectedLocationSlug, setSelectedLocationSlug] = useState("");
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);
  const [locations, setLocations] = useState<StoreLocationWithHours[]>([]);
  const [serviceCounters, setServiceCounters] = useState<ServiceCounterSummary[]>([]);
  const [staff, setStaff] = useState<VendorStaffSummary[]>([]);
  const [staffSeatLimit, setStaffSeatLimit] = useState(0);
  const [counterLimit, setCounterLimit] = useState(0);
  const [activeLocationLimit, setActiveLocationLimit] = useState(1);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [editingLocationSlug, setEditingLocationSlug] = useState("");
  const [locationForm, setLocationForm] = useState(emptyLocationForm);
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
  const [staffDialogOpen, setStaffDialogOpen] = useState(false);
  const [staffForm, setStaffForm] = useState<AddVendorStaffRequest>({
    email: "",
    role: "staff"
  });
  const [historyExportFormat, setHistoryExportFormat] = useState<"csv" | "pdf" | null>(null);
  const [historyExportRange, setHistoryExportRange] = useState<HistoryExportRange | null>(null);
  const hasActiveSubscription = billing?.subscription?.status === "active";
  const selectedLocation =
    locations.find((locationItem) => locationItem.slug === selectedLocationSlug) ||
    snapshot?.location ||
    null;
  const selectedTenantRole =
    user?.tenants.find((tenant) => tenant.slug === selectedTenantSlug)?.role || null;
  const isOwner = selectedTenantRole === "owner";
  const visibleNavItems = isOwner
    ? navItems
    : navItems.filter((item) => staffAllowedSections.has(item.section));
  const locationQuery = selectedLocationSlug
    ? `?location=${encodeURIComponent(selectedLocationSlug)}`
    : "";

  useEffect(() => {
    if (!selectedTenantSlug && user?.tenants?.length) {
      setSelectedTenantSlug(user.tenants[0].slug);
    }
  }, [selectedTenantSlug, user]);

  useEffect(() => {
    if (!selectedTenantSlug || !token) {
      return undefined;
    }

    let active = true;

    apiRequest<StoreLocationsResponse>(`/vendor/tenant/${selectedTenantSlug}/locations`, {
      token
    })
      .then((data) => {
        if (!active) {
          return;
        }

        setLocations(data.locations);
        setActiveLocationLimit(data.activeLocationLimit);
        if (!selectedLocationSlug || !data.locations.some((item) => item.slug === selectedLocationSlug)) {
          setSelectedLocationSlug(data.locations.find((item) => item.isPrimary)?.slug || data.locations[0]?.slug || "");
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
  }, [selectedLocationSlug, selectedTenantSlug, token]);

  useEffect(() => {
    if (!selectedTenantSlug || !token || !selectedLocationSlug) {
      return undefined;
    }

    let active = true;
    setError("");

    apiRequest<QueueSnapshot>(`/vendor/tenant/${selectedTenantSlug}/dashboard${locationQuery}`, { token })
      .then((data) => {
        if (!active) {
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
      })
      .catch((loadError) => {
        if (active) {
          setError(getErrorMessage(loadError));
        }
      });

    return () => {
      active = false;
    };
  }, [locationQuery, selectedLocationSlug, selectedTenantSlug, token]);

  useEffect(() => {
    if (!selectedTenantSlug || !token) {
      return undefined;
    }

    let active = true;

    apiRequest<BillingOverviewResponse>(`/billing/tenant/${selectedTenantSlug}/subscription`, {
      token
    })
      .then((data) => {
        if (active) {
          setBilling(data);
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
  }, [selectedTenantSlug, token]);

  useEffect(() => {
    if (!selectedTenantSlug || !selectedLocationSlug || !token) {
      return;
    }

    apiRequest<ServiceCountersResponse>(
      `/vendor/tenant/${selectedTenantSlug}/counters?location=${encodeURIComponent(selectedLocationSlug)}`,
      { token }
    )
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

    apiRequest<VendorStaffResponse>(`/vendor/tenant/${selectedTenantSlug}/staff`, { token })
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
      `${API_BASE_URL}/public/tenant/${selectedTenantSlug}/location/${selectedLocationSlug}/stream`
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
  }, [selectedLocationSlug, selectedTenantSlug]);

  useEffect(() => {
    if (!selectedTenantSlug || !selectedLocationSlug || !token || currentSection !== "history" || !hasActiveSubscription) {
      return undefined;
    }

    let active = true;

    apiRequest<VendorHistoryResponse>(
      `/vendor/tenant/${selectedTenantSlug}/history?limit=50&location=${encodeURIComponent(selectedLocationSlug)}`,
      { token }
    )
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

    apiRequest<VendorClientsResponse>(
      `/vendor/tenant/${selectedTenantSlug}/clients${locationQuery}`,
      { token }
    )
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
    const data = await apiRequest<ServiceCountersResponse>(
      `/vendor/tenant/${selectedTenantSlug}/counters?location=${encodeURIComponent(selectedLocationSlug)}`,
      { token }
    );
    setServiceCounters(data.counters);
    setCounterLimit(data.counterLimit);
  }

  async function reloadStaff() {
    const data = await apiRequest<VendorStaffResponse>(
      `/vendor/tenant/${selectedTenantSlug}/staff`,
      { token }
    );
    setStaff(data.staff);
    setStaffSeatLimit(data.staffSeatLimit);
  }

  function openCounterDialog(counter?: ServiceCounterSummary) {
    setEditingCounterSlug(counter?.slug || "");
    setCounterForm({
      name: counter?.name || "",
      slug: counter?.slug || "",
      isActive: counter?.isActive ?? true,
      assignedUserIds: counter?.assignedUserIds || []
    });
    setCounterDialogOpen(true);
  }

  async function handleSaveCounter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    await apiRequest<void>(
      `/vendor/tenant/${selectedTenantSlug}/counters/${counter.slug}?location=${encodeURIComponent(selectedLocationSlug)}`,
      { method: "DELETE", token }
    );
    await reloadCounters();
    showSuccessNotification("Counter removed", `${counter.name} was removed from this location.`);
  }

  async function handleAddStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction("staff-save");
    try {
      await apiRequest<{ userId: string }, AddVendorStaffRequest>(
        `/vendor/tenant/${selectedTenantSlug}/staff`,
        { method: "POST", token, body: staffForm }
      );
      await reloadStaff();
      setStaffDialogOpen(false);
      setStaffForm({ email: "", role: "staff" });
      showSuccessNotification("Staff added", "The staff member now has access to this tenant.");
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setBusyAction("");
    }
  }

  async function handleUpdateStaffRole(member: VendorStaffSummary, role: "owner" | "staff") {
    await apiRequest<{ userId: string }, UpdateVendorStaffRequest>(
      `/vendor/tenant/${selectedTenantSlug}/staff/${member.id}`,
      { method: "PATCH", token, body: { role } }
    );
    await reloadStaff();
    showSuccessNotification("Staff updated", `${member.name}'s role was updated.`);
  }

  async function handleRemoveStaff(member: VendorStaffSummary) {
    await apiRequest<void>(`/vendor/tenant/${selectedTenantSlug}/staff/${member.id}`, {
      method: "DELETE",
      token
    });
    await reloadStaff();
    showSuccessNotification("Staff removed", `${member.name} no longer has tenant access.`);
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
              label="Location name"
              required
              value={locationForm.name}
              onChange={(event) =>
                setLocationForm((current) => ({ ...current, name: event.target.value }))
              }
            />
            <TextInput
              label="Slug"
              required
              value={locationForm.slug}
              onChange={(event) =>
                setLocationForm((current) => ({ ...current, slug: event.target.value }))
              }
            />
            <TextInput
              label="Address line 1"
              value={locationForm.addressLine1}
              onChange={(event) =>
                setLocationForm((current) => ({ ...current, addressLine1: event.target.value }))
              }
            />
            <TextInput
              label="Address line 2"
              value={locationForm.addressLine2}
              onChange={(event) =>
                setLocationForm((current) => ({ ...current, addressLine2: event.target.value }))
              }
            />
            <TextInput
              label="City"
              value={locationForm.city}
              onChange={(event) =>
                setLocationForm((current) => ({ ...current, city: event.target.value }))
              }
            />
            <TextInput
              label="Province"
              value={locationForm.province}
              onChange={(event) =>
                setLocationForm((current) => ({ ...current, province: event.target.value }))
              }
            />
            <TextInput
              label="Contact email"
              value={locationForm.contactEmail}
              onChange={(event) =>
                setLocationForm((current) => ({ ...current, contactEmail: event.target.value }))
              }
            />
            <TextInput
              label="Contact phone"
              value={locationForm.contactPhone}
              onChange={(event) =>
                setLocationForm((current) => ({ ...current, contactPhone: event.target.value }))
              }
            />
            <TextInput
              label="Timezone"
              value={locationForm.timezone}
              onChange={(event) =>
                setLocationForm((current) => ({ ...current, timezone: event.target.value }))
              }
            />
          </SimpleGrid>
          <Group>
            <Checkbox
              checked={locationForm.isActive}
              label="Active location"
              onChange={(event) =>
                setLocationForm((current) => ({ ...current, isActive: event.target.checked }))
              }
            />
            <Checkbox
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

    return (
      <Stack gap="md">
        {renderStats()}
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
                  placeholder="Select counter"
                  value={selectedCounterSlug || null}
                  onChange={(value) => setSelectedCounterSlug(value || "")}
                />
              </Group>
              <Group>
                <Button
                  className="neura-primary-button"
                  disabled={busyAction === "call-next" || !selectedCounterSlug}
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
                      <Table.Th>Up next</Table.Th>
                      <Table.Th>Channel</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {snapshot?.nextUp?.length ? (
                      snapshot.nextUp.map((ticket) => (
                        <Table.Tr key={ticket.id}>
                          <Table.Td>
                            <Text fw={700}>{ticket.ticketNumber}</Text>
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
                <Button className="neura-primary-button" disabled={busyAction === "walk-in"} type="submit">
                  {busyAction === "walk-in" ? "Issuing..." : "Issue ticket"}
                </Button>
              </Group>
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                <TextInput
                  label="Customer name"
                  required
                  value={walkInForm.customerName}
                  onChange={(event) =>
                    setWalkInForm((current) => ({ ...current, customerName: event.target.value }))
                  }
                />
                <TextInput
                  label="Email"
                  type="email"
                  value={walkInForm.customerEmail}
                  onChange={(event) =>
                    setWalkInForm((current) => ({ ...current, customerEmail: event.target.value }))
                  }
                />
                <TextInput
                  label="Phone"
                  value={walkInForm.customerPhone}
                  onChange={(event) =>
                    setWalkInForm((current) => ({ ...current, customerPhone: event.target.value }))
                  }
                />
                <Textarea
                  label="Notes"
                  minRows={2}
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
                  onChange={(event) =>
                    setWalkInForm((current) => ({ ...current, notifyByEmail: event.target.checked }))
                  }
                />
                <Checkbox
                  checked={walkInForm.notifyBySms}
                  label="Send SMS alerts"
                  onChange={(event) =>
                    setWalkInForm((current) => ({ ...current, notifyBySms: event.target.checked }))
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
          <Paper p="xl" style={cardStyle}>
            <Group justify="space-between" align="flex-start">
              <div>
                <Text size="xs" tt="uppercase" fw={800} c={themeForm.subheaderColor} lts={1.6}>
                  Live public board
                </Text>
                <Title order={1} c={themeForm.headerColor}>
                  {themeForm.heroTitle || previewLocation?.name || snapshot?.tenant.name || "Public board"}
                </Title>
                <Text c={themeForm.bodyColor} maw={620}>
                  {themeForm.heroSubtitle ||
                    "Customers can monitor their turn remotely and join the line online."}
                </Text>
              </div>
              {themeForm.logoUrl ? (
                <img
                  alt="Company logo preview"
                  src={themeForm.logoUrl}
                  style={{ maxHeight: 72, maxWidth: 140, objectFit: "contain" }}
                />
              ) : null}
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
                  label="Hero title"
                  value={themeForm.heroTitle}
                  placeholder={themeLocation?.name || "Public board title"}
                  onChange={(event) => setThemeField("heroTitle", event.target.value)}
                />
                <TextInput
                  label="Hero subtitle"
                  value={themeForm.heroSubtitle}
                  placeholder="Customers can monitor their turn remotely."
                  onChange={(event) => setThemeField("heroSubtitle", event.target.value)}
                />
              </SimpleGrid>
              <SimpleGrid cols={{ base: 1, md: 2 }}>
                <FileInput
                  accept="image/png,image/jpeg,image/webp"
                  clearable
                  label="Background image"
                  disabled={busyAction === "theme-upload:background"}
                  onChange={(file) => uploadThemeAsset("background", file)}
                />
                <FileInput
                  accept="image/png,image/jpeg,image/webp"
                  clearable
                  label="Company logo"
                  disabled={busyAction === "theme-upload:logo"}
                  onChange={(file) => uploadThemeAsset("logo", file)}
                />
              </SimpleGrid>
              <SimpleGrid cols={{ base: 1, md: 2 }}>
                <TextInput
                  label="Background image URL"
                  value={themeForm.backgroundImageUrl}
                  onChange={(event) => setThemeField("backgroundImageUrl", event.target.value)}
                />
                <TextInput
                  label="Logo URL"
                  value={themeForm.logoUrl}
                  onChange={(event) => setThemeField("logoUrl", event.target.value)}
                />
              </SimpleGrid>
              <Divider label="Board colors" labelPosition="left" />
              <SimpleGrid cols={{ base: 1, md: 3 }}>
                <ColorInput label="Page background" value={themeForm.pageBackgroundColor} onChange={(value) => setThemeField("pageBackgroundColor", value)} />
                <ColorInput label="Header text" value={themeForm.headerColor} onChange={(value) => setThemeField("headerColor", value)} />
                <ColorInput label="Subheader text" value={themeForm.subheaderColor} onChange={(value) => setThemeField("subheaderColor", value)} />
                <ColorInput label="Body text" value={themeForm.bodyColor} onChange={(value) => setThemeField("bodyColor", value)} />
                <ColorInput label="Button background" value={themeForm.buttonBackgroundColor} onChange={(value) => setThemeField("buttonBackgroundColor", value)} />
                <ColorInput label="Button text" value={themeForm.buttonTextColor} onChange={(value) => setThemeField("buttonTextColor", value)} />
              </SimpleGrid>
              <Divider label="Section cards" labelPosition="left" />
              <SimpleGrid cols={{ base: 1, md: 2 }}>
                <ColorInput label="Card background" value={themeForm.cardBackgroundColor} onChange={(value) => setThemeField("cardBackgroundColor", value)} />
                <ColorInput label="Card border" value={themeForm.cardBorderColor} onChange={(value) => setThemeField("cardBorderColor", value)} />
                <NumberInput label="Border size" min={0} max={12} value={themeForm.cardBorderSize} onChange={(value) => setThemeField("cardBorderSize", Number(value) || 0)} />
                <NumberInput label="Border radius" min={0} max={48} value={themeForm.cardBorderRadius} onChange={(value) => setThemeField("cardBorderRadius", Number(value) || 0)} />
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
    if (locationItem) {
      setEditingLocationSlug(locationItem.slug);
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
      setLocationForm(emptyLocationForm);
    }

    setLocationDialogOpen(true);
  }

  async function saveLocation() {
    setBusyAction("location");
    setError("");

    try {
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
        isPrimary: locationForm.isPrimary,
        isActive: locationForm.isActive
      };
      const locationResponse = editingLocationSlug
        ? await apiRequest<{ location: StoreLocationWithHours }, typeof payload>(
            `/vendor/tenant/${selectedTenantSlug}/locations/${editingLocationSlug}`,
            { method: "PATCH", token, body: payload }
          )
        : await apiRequest<{ location: StoreLocationWithHours }, typeof payload>(
            `/vendor/tenant/${selectedTenantSlug}/locations`,
            { method: "POST", token, body: payload }
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
                  <Badge color={locationItem.openStatus.isOpen ? "teal" : "red"}>
                    {locationItem.openStatus.isOpen ? "Open" : "Closed"}
                  </Badge>
                </Group>
              </Group>
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
                    <Button color="red" size="xs" variant="light" onClick={() => handleDeleteCounter(counter)}>
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

  function renderStaffPage() {
    return (
      <Card className="neura-card" padding="lg">
        <Stack gap="md">
          <Group justify="space-between">
            <div>
              <Text className="neura-label">Staff</Text>
              <Title order={3}>Tenant access</Title>
              <Text c="dimmed" size="sm">{staff.length}/{staffSeatLimit} staff seats used</Text>
            </div>
            <Button
              className="neura-primary-button"
              disabled={staff.length >= staffSeatLimit}
              onClick={() => setStaffDialogOpen(true)}
            >
              Add staff
            </Button>
          </Group>
          <Table.ScrollContainer minWidth={720}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Contact</Table.Th>
                  <Table.Th>Role</Table.Th>
                  <Table.Th>Counters</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {staff.map((member) => (
                  <Table.Tr key={member.id}>
                    <Table.Td fw={700}>{member.name}</Table.Td>
                    <Table.Td>{member.email || member.phone || "--"}</Table.Td>
                    <Table.Td>
                      <Select
                        data={[
                          { label: "Owner", value: "owner" },
                          { label: "Staff", value: "staff" }
                        ]}
                        value={member.role}
                        onChange={(value) =>
                          value && handleUpdateStaffRole(member, value as "owner" | "staff")
                        }
                      />
                    </Table.Td>
                    <Table.Td>
                      {member.assignedCounterIds
                        .map((counterId) => serviceCounters.find((counter) => counter.id === counterId)?.name)
                        .filter(Boolean)
                        .join(", ") || "--"}
                    </Table.Td>
                    <Table.Td>
                      {member.role !== "owner" ? (
                        <Button color="red" size="xs" variant="light" onClick={() => handleRemoveStaff(member)}>
                          Remove
                        </Button>
                      ) : null}
                    </Table.Td>
                  </Table.Tr>
                ))}
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
          <Table.ScrollContainer minWidth={720}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Customer</Table.Th>
                  <Table.Th>Contact</Table.Th>
                  <Table.Th>Visits</Table.Th>
                  <Table.Th>Latest ticket</Table.Th>
                  <Table.Th>Latest visit</Table.Th>
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
                      <Table.Td>{formatDateTime(client.latestVisitAt)}</Table.Td>
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
        </Stack>
      </Card>
    );
  }

  function renderHistoryPage() {
    const tickets = history?.tickets || snapshot?.history || [];
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
          {isOwner && exportTypeOptions.length && historyRangeOptions.length ? (
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
          <Table.ScrollContainer minWidth={620}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Ticket</Table.Th>
                  <Table.Th>Customer</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Updated</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {tickets.length ? (
                  tickets.map((ticket) => (
                    <Table.Tr key={ticket.id}>
                      <Table.Td fw={700}>{ticket.ticketNumber}</Table.Td>
                      <Table.Td>{ticket.customerName}</Table.Td>
                      <Table.Td><Badge variant="light">{ticket.status}</Badge></Table.Td>
                      <Table.Td>{formatDateTime(ticket.updatedAt)}</Table.Td>
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
                  value={Number(settings.averageServiceMinutes)}
                  onChange={(value) =>
                    setSettings((current) => ({ ...current, averageServiceMinutes: value || 1 }))
                  }
                />
                <NumberInput
                  label="Notify when within"
                  min={1}
                  value={Number(settings.notificationThreshold)}
                  onChange={(value) =>
                    setSettings((current) => ({ ...current, notificationThreshold: value || 1 }))
                  }
                />
                <TextInput
                  label="Contact email"
                  type="email"
                  value={settings.contactEmail}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, contactEmail: event.target.value }))
                  }
                />
                <TextInput
                  label="Contact phone"
                  value={settings.contactPhone}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, contactPhone: event.target.value }))
                  }
                />
                <Button className="neura-secondary-button" disabled={busyAction === "settings"} type="submit">
                  {busyAction === "settings" ? "Saving..." : "Save settings"}
                </Button>
              </Stack>
            </form>
          </Card>
        </SimpleGrid>

        {!activeSubscription ? <Card className="neura-card" padding="lg">{renderPlanCards()}</Card> : null}
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
              required
              value={counterForm.name}
              onChange={(event) =>
                setCounterForm((current) => ({ ...current, name: event.target.value }))
              }
            />
            <TextInput
              label="Counter slug"
              required
              value={counterForm.slug}
              onChange={(event) =>
                setCounterForm((current) => ({ ...current, slug: event.target.value }))
              }
            />
            <Checkbox
              checked={counterForm.isActive}
              label="Active counter"
              onChange={(event) =>
                setCounterForm((current) => ({ ...current, isActive: event.target.checked }))
              }
            />
            <MultiSelect
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
      <Modal centered opened={staffDialogOpen} onClose={() => setStaffDialogOpen(false)} title="Add staff">
        <form onSubmit={handleAddStaff}>
          <Stack gap="md">
            <TextInput
              label="Existing account email"
              required
              type="email"
              value={staffForm.email}
              onChange={(event) =>
                setStaffForm((current) => ({ ...current, email: event.target.value }))
              }
            />
            <Select
              data={[
                { label: "Staff", value: "staff" },
                { label: "Owner", value: "owner" }
              ]}
              label="Role"
              value={staffForm.role}
              onChange={(value) =>
                setStaffForm((current) => ({
                  ...current,
                  role: value === "owner" ? "owner" : "staff"
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
          <div className="neura-logo">P</div>
          <div>
            <Text fw={800}>Prio</Text>
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
    if (!activeSubscription && currentSection !== "settings") {
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
            value={selectedLocationSlug}
            onChange={(value) => value && setSelectedLocationSlug(value)}
          />
        </header>

        {error ? <Text c="red" fw={700}>{error}</Text> : null}
        {renderCurrentSection()}
      </main>
      {renderPlanDialog()}
      {renderLocationDialog()}
      {renderCounterDialog()}
      {renderStaffDialog()}
      {renderThemeDialog()}
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
