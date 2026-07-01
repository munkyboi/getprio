import { StrictMode, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  AppShell,
  ActionIcon,
  Badge,
  Burger,
  Button,
  Card,
  Checkbox,
  Container,
  Group,
  MantineProvider,
  NumberInput,
  Paper,
  PasswordInput,
  SimpleGrid,
  Stack,
  Table,
  Modal,
  Select,
  Text,
  TextInput,
  Title,
  createTheme
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Notifications, notifications } from "@mantine/notifications";
import {
  IconChartBar,
  IconCreditCard,
  IconLogout,
  IconSettings,
  IconUsers,
  IconBuildingStore,
  IconReceipt,
  IconCalendarDollar,
  IconListDetails,
  IconChevronRight,
  IconMoon,
  IconSun
} from "@tabler/icons-react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type {
  AuthResponse,
  LoginRequest,
  PlatformListResponse,
  PlatformOverviewResponse,
  PlatformPlansResponse,
  PlatformQueueFeesResponse,
  PlatformSettingsResponse,
  QueueFeeSetting,
  SubscriptionPlan,
  UpdatePlatformPlanRequest,
  UpdatePlatformQueueFeesRequest,
  UpdatePlatformSettingsRequest,
  UserSummary
} from "@shared";
import { apiRequest } from "./api";
import { ConfirmActionModal } from "../../frontend/src/components/ConfirmActionModal";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./styles.css";

const STORAGE_KEY = "prio-platform-auth";
const APPEARANCE_KEY = "prio-platform-appearance";
const PHP = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
type PortalAppearance = "dark" | "light";
type GenericRecord = Record<string, unknown>;

const theme = createTheme({
  primaryColor: "orange",
  fontFamily: 'Inter, Aptos, "Segoe UI", sans-serif',
  defaultRadius: "lg"
});

const navItems = [
  { to: "/overview", label: "Overview", icon: IconChartBar },
  { to: "/queue-fees", label: "Queue fees", icon: IconCreditCard },
  { to: "/plans", label: "Plans", icon: IconCalendarDollar },
  { to: "/tenants", label: "Tenants", icon: IconBuildingStore },
  { to: "/subscriptions", label: "Subscriptions", icon: IconListDetails },
  { to: "/users", label: "Users", icon: IconUsers },
  { to: "/billing-events", label: "Billing events", icon: IconReceipt },
  { to: "/settings", label: "Settings", icon: IconSettings }
] as const;

function formatPhp(value: number) {
  return PHP.format(Number(value || 0) / 100);
}

function formatDate(value: unknown) {
  return value ? new Date(String(value)).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "--";
}

function readToken() {
  return localStorage.getItem(STORAGE_KEY) || "";
}

function readAppearance(): PortalAppearance {
  return localStorage.getItem(APPEARANCE_KEY) === "light" ? "light" : "dark";
}

function showSaved(title: string) {
  notifications.show({ color: "teal", title, message: "Changes saved successfully." });
}

function AppearanceToggle({
  appearance,
  onToggle
}: {
  appearance: PortalAppearance;
  onToggle: () => void;
}) {
  const isDark = appearance === "dark";
  const Icon = isDark ? IconSun : IconMoon;
  return (
    <ActionIcon
      aria-label={isDark ? "Switch platform portal to light mode" : "Switch platform portal to dark mode"}
      className="portal-appearance-toggle"
      onClick={onToggle}
      radius="xl"
      size="lg"
      variant="subtle"
    >
      <Icon size={18} />
    </ActionIcon>
  );
}

function StatusBadge({ value }: { value: unknown }) {
  const status = String(value || "unknown");
  const color = ["paid", "active"].includes(status) ? "teal" : ["failed", "expired", "canceled", "suspended"].includes(status) ? "red" : "yellow";
  return <Badge color={color}>{status}</Badge>;
}

function DataTable({
  rows,
  columns,
  emptyLabel
}: {
  rows: GenericRecord[];
  columns: Array<{ key: string; label: string; render?: (row: GenericRecord) => ReactNode }>;
  emptyLabel: string;
}) {
  return (
    <Paper className="portal-card" p="lg">
      <Table.ScrollContainer minWidth={680}>
        <Table verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              {columns.map((column) => <Table.Th key={column.key}>{column.label}</Table.Th>)}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.length ? rows.map((row, index) => (
              <Table.Tr key={String(row.id || index)}>
                {columns.map((column) => (
                  <Table.Td key={column.key}>{column.render ? column.render(row) : String(row[column.key] ?? "--")}</Table.Td>
                ))}
              </Table.Tr>
            )) : (
              <Table.Tr><Table.Td colSpan={columns.length}><Text c="dimmed">{emptyLabel}</Text></Table.Td></Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Paper>
  );
}

function LoginPanel({
  appearance,
  onAppearanceToggle,
  onLogin
}: {
  appearance: PortalAppearance;
  onAppearanceToggle: () => void;
  onLogin: (token: string, user: UserSummary) => void;
}) {
  const [form, setForm] = useState<LoginRequest>({ email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const data = await apiRequest<AuthResponse, LoginRequest>("/auth/login", { method: "POST", body: form });
      if (!data.user.roles.includes("platform_admin")) {
        throw new Error("This account does not have platform admin access.");
      }
      localStorage.setItem(STORAGE_KEY, data.token);
      onLogin(data.token, data.user);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="portal-login">
      <Paper className="portal-card portal-login-card" p="xl">
        <form onSubmit={handleSubmit}>
          <Stack gap="lg">
            <Group align="flex-start" justify="space-between" gap="md">
              <div>
                <Group className="portal-brand" gap="sm">
                  <img
                    className="portal-logo"
                    src={appearance === "dark" ? "/logo-dark.svg" : "/logo.svg"}
                    alt=""
                    aria-hidden="true"
                  />
                  <Text className="portal-label">GetPrio Platform</Text>
                </Group>
                <Title order={1}>Operations portal</Title>
              </div>
              <AppearanceToggle appearance={appearance} onToggle={onAppearanceToggle} />
            </Group>
            <TextInput label="Email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
            <PasswordInput label="Password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
            {error ? <Text c="red">{error}</Text> : null}
            <Button type="submit" loading={submitting}>Sign in</Button>
          </Stack>
        </form>
      </Paper>
    </main>
  );
}

function SparkBars({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="spark-bars">
      {values.map((value, index) => <i key={`${value}-${index}`} style={{ height: `${Math.max(8, (value / max) * 100)}%` }} />)}
    </div>
  );
}

function MetricCard({ label, value, values = [] }: { label: string; value: string | number; values?: number[] }) {
  return (
    <Card className="portal-card" padding="lg">
      <Text c="dimmed" size="sm">{label}</Text>
      <Title order={2}>{value}</Title>
      {values.length ? <SparkBars values={values} /> : null}
    </Card>
  );
}

function OverviewPage({ token }: { token: string }) {
  const [data, setData] = useState<PlatformOverviewResponse | null>(null);
  useEffect(() => { apiRequest<PlatformOverviewResponse>("/platform/overview", { token }).then(setData); }, [token]);
  const totals = data?.totals;
  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }}>
        <MetricCard label="Tenants" value={totals?.tenants ?? "--"} values={data?.analytics.tenantGrowth.map((item) => item.count)} />
        <MetricCard label="Users" value={totals?.users ?? "--"} values={data?.analytics.userGrowth.map((item) => item.count)} />
        <MetricCard label="Revenue" value={formatPhp(totals?.queueJoinRevenueCents ?? 0)} values={data?.analytics.revenueTrend.map((item) => item.amountCents)} />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, lg: 3 }}>
        <MetricCard label="Active subscriptions" value={totals?.activeSubscriptions ?? "--"} values={data?.analytics.subscriptionsByPlan.map((item) => item.count)} />
        <MetricCard label="Paid joins" value={totals?.paidQueueJoinPayments ?? "--"} values={data?.analytics.paymentStatusMix.map((item) => item.count)} />
        <MetricCard label="Failed joins" value={totals?.failedQueueJoinPayments ?? "--"} />
      </SimpleGrid>
      <DataTable
        rows={(data?.recentPayments || []) as unknown as GenericRecord[]}
        emptyLabel="No recent payments."
        columns={[
          { key: "tenantName", label: "Tenant" },
          { key: "planSlug", label: "Plan" },
          { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status} /> },
          { key: "amountCents", label: "Amount", render: (row) => formatPhp(Number(row.amountCents || 0)) },
          { key: "createdAt", label: "Created", render: (row) => formatDate(row.createdAt) }
        ]}
      />
    </Stack>
  );
}

function QueueFeesPage({ token }: { token: string }) {
  const [fees, setFees] = useState<QueueFeeSetting[]>([]);
  useEffect(() => { apiRequest<PlatformQueueFeesResponse>("/platform/queue-fees", { token }).then((data) => setFees(data.queueFees)); }, [token]);
  async function save() {
    const data = await apiRequest<PlatformQueueFeesResponse, UpdatePlatformQueueFeesRequest>("/platform/queue-fees", {
      method: "PATCH", token, body: { queueFees: fees }
    });
    setFees(data.queueFees);
    showSaved("Queue fees updated");
  }
  return (
    <Stack>
      <SimpleGrid cols={{ base: 1, md: 3 }}>
        {fees.map((fee, index) => (
          <Card className="portal-card" key={fee.planSlug} padding="lg">
            <Stack>
              <Title order={3}>{fee.planSlug}</Title>
              <Checkbox checked={fee.enabled} label="Enabled" onChange={(event) => setFees((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: event.target.checked } : item))} />
              <NumberInput label="Amount in centavos" value={fee.amountCents} onChange={(value) => setFees((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amountCents: Number(value) || 0 } : item))} />
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
      <Group justify="flex-end"><Button onClick={save}>Save fee policy</Button></Group>
    </Stack>
  );
}

const historyRanges = ["today", "week", "month", "quarter", "year"] as const;

function PlansPage({ token }: { token: string }) {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  useEffect(() => { apiRequest<PlatformPlansResponse>("/platform/plans", { token }).then((data) => setPlans(data.plans)); }, [token]);
  async function save(plan: SubscriptionPlan) {
    const data = await apiRequest<{ plan: SubscriptionPlan }, UpdatePlatformPlanRequest>(`/platform/plans/${plan.slug}`, {
      method: "PATCH",
      token,
      body: { plan }
    });
    setPlans((current) => current.map((item) => item.slug === data.plan.slug ? data.plan : item));
    showSaved(`${plan.name} updated`);
  }
  return (
    <Stack gap="lg">
      {plans.map((plan) => (
        <Card className="portal-card" key={plan.slug} padding="lg">
          <Stack>
            <Group grow align="flex-start">
              <TextInput label="Name" value={plan.name} onChange={(event) => setPlans((current) => current.map((item) => item.slug === plan.slug ? { ...item, name: event.target.value } : item))} />
              <NumberInput label="Monthly price (centavos)" value={plan.price.monthlyAmountCents} onChange={(value) => setPlans((current) => current.map((item) => item.slug === plan.slug ? { ...item, price: { ...item.price, monthlyAmountCents: Number(value) || 0 } } : item))} />
              <NumberInput label="Annual price (centavos)" value={plan.price.annualAmountCents} onChange={(value) => setPlans((current) => current.map((item) => item.slug === plan.slug ? { ...item, price: { ...item.price, annualAmountCents: Number(value) || 0 } } : item))} />
            </Group>
            <SimpleGrid cols={{ base: 1, md: 3 }}>
              {[
                ["monthlyTickets", "Tickets"],
                ["monthlyTransactionalEmails", "Transactional emails"],
                ["smsAllowance", "SMS notifications"],
                ["locations", "Locations"],
                ["counters", "Counters"],
                ["staffSeats", "Staff seats"]
              ].map(([key, label]) => (
                <NumberInput key={key} label={label} value={Number(plan.entitlements[key as keyof typeof plan.entitlements] ?? 0)} onChange={(value) => setPlans((current) => current.map((item) => item.slug === plan.slug ? { ...item, entitlements: { ...item.entitlements, [key]: Number(value) || 0 } } : item))} />
              ))}
            </SimpleGrid>
            <Group>
              {[
                ["brandedQueuePages", "Rebrand public board"],
                ["csvExport", "CSV export"],
                ["pdfExport", "PDF export"]
              ].map(([key, label]) => (
                <Checkbox key={key} checked={Boolean(plan.entitlements[key as keyof typeof plan.entitlements])} label={label} onChange={(event) => setPlans((current) => current.map((item) => item.slug === plan.slug ? { ...item, entitlements: { ...item.entitlements, [key]: event.target.checked } } : item))} />
              ))}
            </Group>
            <Checkbox.Group
              label="Allowed history export ranges"
              value={plan.entitlements.allowedHistoryExportRanges}
              onChange={(value) => setPlans((current) => current.map((item) => item.slug === plan.slug ? { ...item, entitlements: { ...item.entitlements, allowedHistoryExportRanges: value as typeof plan.entitlements.allowedHistoryExportRanges } } : item))}
            >
              <Group mt="xs">{historyRanges.map((range) => <Checkbox key={range} value={range} label={range} />)}</Group>
            </Checkbox.Group>
            <Group justify="flex-end"><Button onClick={() => save(plan)}>Save plan</Button></Group>
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}

function SettingsPage({ token }: { token: string }) {
  const [settings, setSettings] = useState<PlatformSettingsResponse["settings"] | null>(null);
  useEffect(() => { apiRequest<PlatformSettingsResponse>("/platform/settings", { token }).then((data) => setSettings(data.settings)); }, [token]);
  async function save() {
    if (!settings) return;
    const data = await apiRequest<PlatformSettingsResponse, UpdatePlatformSettingsRequest>("/platform/settings", { method: "PATCH", token, body: settings });
    setSettings(data.settings);
    showSaved("Settings updated");
  }
  return (
    <Paper className="portal-card" p="lg">
      <Stack>
        <TextInput label="Enterprise inquiry recipient" value={settings?.enterpriseInquiryEmail || ""} onChange={(event) => setSettings({ enterpriseInquiryEmail: event.target.value })} />
        <Group justify="flex-end"><Button onClick={save}>Save settings</Button></Group>
      </Stack>
    </Paper>
  );
}

function RecordsPage({ token, endpoint, columns, emptyLabel }: { token: string; endpoint: string; columns: Array<{ key: string; label: string; render?: (row: GenericRecord) => ReactNode }>; emptyLabel: string }) {
  const [rows, setRows] = useState<GenericRecord[]>([]);
  useEffect(() => { apiRequest<PlatformListResponse<GenericRecord>>(endpoint, { token }).then((data) => setRows(data.items)); }, [endpoint, token]);
  return <DataTable rows={rows} columns={columns} emptyLabel={emptyLabel} />;
}

function SubscriptionsPage({ token }: { token: string }) {
  const [rows, setRows] = useState<GenericRecord[]>([]);
  const [tenants, setTenants] = useState<GenericRecord[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [confirmAction, setConfirmAction] = useState<null | {
    title: string;
    description: string;
    confirmLabel: string;
    confirmColor?: "red" | "orange" | "yellow" | "blue" | "dark";
    loadingKey?: string;
    onConfirm: () => Promise<void>;
  }>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSubscriptionId, setEditingSubscriptionId] = useState<string | null>(null);
  const [form, setForm] = useState({
    tenantId: "",
    planSlug: "economical",
    status: "active",
    provider: "manual",
    billingInterval: "monthly",
    providerCustomerId: "",
    providerSubscriptionId: "",
    providerCheckoutSessionId: ""
  });
  const tenantOptions = tenants.map((tenant) => ({
    value: String(tenant.id),
    label: String(tenant.name || tenant.slug || tenant.id)
  }));
  const planOptions = plans.map((plan) => ({
    value: plan.slug,
    label: `${plan.name} · ${plan.price.monthlyDisplay}`
  }));
  const editorTitle = editingSubscriptionId ? "Edit subscription" : "Add subscription";

  const load = async () => {
    const [subscriptionData, tenantData, planData] = await Promise.all([
      apiRequest<PlatformListResponse<GenericRecord>>("/platform/subscriptions", { token }),
      apiRequest<PlatformListResponse<GenericRecord>>("/platform/tenants", { token }),
      apiRequest<{ plans: SubscriptionPlan[] }>("/platform/plans", { token })
    ]);
    setRows(subscriptionData.items);
    setTenants(tenantData.items);
    setPlans(planData.plans);
  };

  useEffect(() => { load(); }, [token]);

  function openNewSubscription() {
    setEditingSubscriptionId(null);
    setForm({
      tenantId: "",
      planSlug: plans[0]?.slug || "economical",
      status: "active",
      provider: "manual",
      billingInterval: "monthly",
      providerCustomerId: "",
      providerSubscriptionId: "",
      providerCheckoutSessionId: ""
    });
    setEditorOpen(true);
  }

  function openEditSubscription(subscription: GenericRecord) {
    setEditingSubscriptionId(String(subscription.id));
    setForm({
      tenantId: String(subscription.tenantId || ""),
      planSlug: String(subscription.planSlug || "economical") as typeof form.planSlug,
      status: String(subscription.status || "active") as typeof form.status,
      provider: String(subscription.provider || "manual"),
      billingInterval: String(subscription.billingInterval || "monthly") as typeof form.billingInterval,
      providerCustomerId: String(subscription.providerCustomerId || ""),
      providerSubscriptionId: String(subscription.providerSubscriptionId || ""),
      providerCheckoutSessionId: String(subscription.providerCheckoutSessionId || "")
    });
    setEditorOpen(true);
  }

  async function createSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = {
      ...form,
      tenantId: Number(form.tenantId)
    };
    if (editingSubscriptionId) {
      const subscription = await apiRequest<{ subscription: GenericRecord }, GenericRecord>(
        `/platform/subscriptions/${editingSubscriptionId}`,
        {
          method: "PATCH",
          token,
          body
        }
      );
      setRows((current) => current.map((item) => String(item.id) === editingSubscriptionId ? subscription.subscription : item));
      showSaved("Subscription updated");
    } else {
      const subscription = await apiRequest<{ subscription: GenericRecord }, GenericRecord>("/platform/subscriptions", {
        method: "POST",
        token,
        body
      });
      setRows((current) => [subscription.subscription, ...current]);
      showSaved("Subscription added");
    }
    setEditorOpen(false);
  }

  async function updateSubscription(subscriptionId: string, nextStatus?: string) {
    const subscription = await apiRequest<{ subscription: GenericRecord }, GenericRecord>(`/platform/subscriptions/${subscriptionId}`, {
      method: "PATCH",
      token,
      body: nextStatus ? { status: nextStatus } : {}
    });
    setRows((current) => current.map((item) => String(item.id) === subscriptionId ? subscription.subscription : item));
    showSaved("Subscription updated");
  }

  async function removeSubscription(subscriptionId: string) {
    await apiRequest<{ subscription: GenericRecord }>(`/platform/subscriptions/${subscriptionId}`, {
      method: "DELETE",
      token
    });
    setRows((current) => current.filter((item) => String(item.id) !== subscriptionId));
    showSaved("Subscription removed");
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <div>
          <Text className="portal-label">Subscriptions</Text>
          <Title order={2}>Tenant subscription records</Title>
          <Text c="dimmed" size="sm">
            Create, edit, suspend, or remove tenant subscriptions from one place.
          </Text>
        </div>
        <Button className="subscription-editor__submit" onClick={openNewSubscription}>
          Add subscription
        </Button>
      </Group>
      <DataTable
        rows={rows}
        emptyLabel="No subscriptions."
        columns={[
          {
            key: "tenantName",
            label: "Tenant",
            render: (row) => (
              <Button
                className="subscription-tenant-link"
                variant="subtle"
                onClick={() => openEditSubscription(row)}
                p={0}
              >
                {String(row.tenantName || row.tenantSlug || "--")}
              </Button>
            )
          },
          { key: "planSlug", label: "Plan" },
          { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status} /> },
          { key: "provider", label: "Provider" },
          { key: "currentPeriodEnd", label: "Renews", render: (row) => formatDate(row.currentPeriodEnd) },
          {
            key: "actions",
            label: "Actions",
            render: (row) => (
              <Group gap="xs">
                <Button
                  size="xs"
                  variant="light"
                  onClick={() =>
                    setConfirmAction({
                      title: row.status === "suspended" ? "Resume subscription?" : "Suspend subscription?",
                      description:
                        row.status === "suspended"
                          ? "This will reactivate the subscription for the tenant."
                          : "This will suspend the subscription and limit tenant access according to subscription checks.",
                      confirmLabel: row.status === "suspended" ? "Resume subscription" : "Suspend subscription",
                      confirmColor: row.status === "suspended" ? "blue" : "orange",
                      onConfirm: async () => {
                        await updateSubscription(String(row.id), row.status === "suspended" ? "active" : "suspended");
                      }
                    })
                  }
                >
                  {row.status === "suspended" ? "Resume" : "Suspend"}
                </Button>
                <Button size="xs" variant="light" color="orange" onClick={() => updateSubscription(String(row.id), "past_due")}>
                  Mark due
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  color="red"
                  onClick={() =>
                    setConfirmAction({
                      title: "Remove subscription?",
                      description: "This permanently deletes the subscription record from the platform dashboard.",
                      confirmLabel: "Remove subscription",
                      confirmColor: "red",
                      onConfirm: async () => {
                        await removeSubscription(String(row.id));
                      }
                    })
                  }
                >
                  Remove
                </Button>
              </Group>
            )
          }
        ]}
      />
      <Modal
        centered
        opened={editorOpen}
        onClose={() => setEditorOpen(false)}
        size="xl"
        title={editorTitle}
        overlayProps={{ blur: 6, backgroundOpacity: 0.35 }}
      >
        <form onSubmit={createSubscription}>
          <Stack gap="lg">
            <Group justify="space-between" align="flex-start" className="subscription-editor__header">
              <div>
                <Text className="portal-label">Subscription editor</Text>
                <Title order={3}>{editorTitle}</Title>
                <Text c="dimmed" size="sm">
                  {editingSubscriptionId
                    ? "Update the tenant subscription settings and provider references."
                    : "Create or stage a tenant subscription record before billing reconciliation or manual activation."}
                </Text>
              </div>
              <Badge variant="light" color="orange">
                Admin only
              </Badge>
            </Group>

            <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
              <Card className="subscription-editor__panel" withBorder radius="xl" p="md">
                <Stack gap="md">
                  <div>
                    <Text className="subscription-editor__label">Assignment</Text>
                    <Text fw={700}>Tenant and plan</Text>
                  </div>
                  <Select
                    searchable
                    data={tenantOptions}
                    label="Tenant"
                    placeholder="Search tenant"
                    value={form.tenantId}
                    onChange={(value: string | null) => setForm((current) => ({ ...current, tenantId: value || "" }))}
                    nothingFoundMessage="No tenants found"
                  />
                  <Select
                    data={planOptions}
                    label="Plan"
                    value={form.planSlug}
                    onChange={(value: string | null) =>
                      setForm((current) => ({ ...current, planSlug: (value as typeof current.planSlug) || "economical" }))
                    }
                  />
                  <Select
                    data={[
                      { value: "active", label: "Active" },
                      { value: "unpaid", label: "Unpaid" },
                      { value: "past_due", label: "Past due" },
                      { value: "suspended", label: "Suspended" },
                      { value: "canceled", label: "Canceled" },
                      { value: "expired", label: "Expired" }
                    ]}
                    label="Status"
                    value={form.status}
                    onChange={(value: string | null) =>
                      setForm((current) => ({ ...current, status: (value as typeof current.status) || "active" }))
                    }
                  />
                  <Select
                    data={[
                      { value: "monthly", label: "Monthly" },
                      { value: "annual", label: "Annual" },
                      { value: "custom", label: "Custom" }
                    ]}
                    label="Billing interval"
                    value={form.billingInterval}
                    onChange={(value: string | null) =>
                      setForm((current) => ({
                        ...current,
                        billingInterval: (value as typeof current.billingInterval) || "monthly"
                      }))
                    }
                  />
                </Stack>
              </Card>

              <Card className="subscription-editor__panel" withBorder radius="xl" p="md">
                <Stack gap="md">
                  <div>
                    <Text className="subscription-editor__label">Identifiers</Text>
                    <Text fw={700}>Provider references</Text>
                  </div>
                  <TextInput
                    label="Provider"
                    value={form.provider}
                    onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))}
                  />
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                    <TextInput
                      label="Provider customer ID"
                      value={form.providerCustomerId}
                      onChange={(event) => setForm((current) => ({ ...current, providerCustomerId: event.target.value }))}
                    />
                    <TextInput
                      label="Provider subscription ID"
                      value={form.providerSubscriptionId}
                      onChange={(event) => setForm((current) => ({ ...current, providerSubscriptionId: event.target.value }))}
                    />
                  </SimpleGrid>
                  <TextInput
                    label="Provider checkout session ID"
                    value={form.providerCheckoutSessionId}
                    onChange={(event) => setForm((current) => ({ ...current, providerCheckoutSessionId: event.target.value }))}
                  />
                </Stack>
              </Card>
            </SimpleGrid>

            <Group justify="space-between" align="center" className="subscription-editor__footer">
              <Text c="dimmed" size="sm">
                {editingSubscriptionId ? "Update the existing record and return to the table." : "Saved records will appear in the list below after creation."}
              </Text>
              <Group gap="sm">
                <Button variant="default" onClick={() => setEditorOpen(false)}>
                  Cancel
                </Button>
                <Button className="subscription-editor__submit" type="submit">
                  {editingSubscriptionId ? "Save changes" : "Add subscription"}
                </Button>
              </Group>
            </Group>
          </Stack>
        </form>
      </Modal>
      <ConfirmActionModal
        opened={Boolean(confirmAction)}
        title={confirmAction?.title || ""}
        description={confirmAction?.description || ""}
        confirmLabel={confirmAction?.confirmLabel || "Confirm"}
        confirmColor={confirmAction?.confirmColor || "red"}
        loading={confirmBusy}
        onClose={() => {
          if (!confirmBusy) {
            setConfirmAction(null);
          }
        }}
        onConfirm={async () => {
          const action = confirmAction;
          if (!action || confirmBusy) {
            return;
          }

          setConfirmBusy(true);
          try {
            await action.onConfirm();
            setConfirmAction(null);
          } catch (error) {
            notifications.show({
              color: "red",
              title: "Subscription removal failed",
              message: error instanceof Error ? error.message : "Unable to remove the subscription."
            });
          } finally {
            setConfirmBusy(false);
          }
        }}
      />
    </Stack>
  );
}

function PortalApp({
  appearance,
  onAppearanceToggle
}: {
  appearance: PortalAppearance;
  onAppearanceToggle: () => void;
}) {
  const [token, setToken] = useState(readToken);
  const [user, setUser] = useState<UserSummary | null>(null);
  const [opened, { toggle, close }] = useDisclosure(false);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (!token) return;
    apiRequest<{ user: UserSummary }>("/auth/me", { token }).then((data) => {
      if (!data.user.roles.includes("platform_admin")) throw new Error("Platform admin access required.");
      setUser(data.user);
    }).catch(() => {
      localStorage.removeItem(STORAGE_KEY);
      setToken("");
    });
  }, [token]);

  if (!token || !user) {
    return (
      <LoginPanel
        appearance={appearance}
        onAppearanceToggle={onAppearanceToggle}
        onLogin={(nextToken, nextUser) => { setToken(nextToken); setUser(nextUser); }}
      />
    );
  }

  const pageTitle = navItems.find((item) => item.to === location.pathname)?.label || "Overview";
  return (
    <AppShell
      className="portal-shell"
      navbar={{ width: 280, breakpoint: "md", collapsed: { mobile: !opened } }}
      padding="lg"
    >
      <AppShell.Navbar className="portal-sidebar" p="lg">
        <Stack h="100%" justify="space-between">
          <Stack>
            <div>
              <Group className="portal-brand" gap="sm">
                <img
                  className="portal-logo"
                  src={appearance === "dark" ? "/logo-dark.svg" : "/logo.svg"}
                  alt=""
                  aria-hidden="true"
                />
                <Text className="portal-label">GetPrio</Text>
              </Group>
              <Title order={2}>Platform</Title>
            </div>
            <Paper className="portal-profile-card" p="md">
              <Group gap="sm">
                <div className="portal-avatar">CA</div>
                <div>
                  <Text fw={700}>Carlo Abella</Text>
                  <Text c="dimmed" size="sm">Platform admin</Text>
                </div>
              </Group>
            </Paper>
            <Text className="portal-nav-heading">Workspace</Text>
            <Stack gap={6}>
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink className="portal-nav-link" key={item.to} to={item.to} onClick={close}>
                    <span className="portal-nav-icon">
                      <Icon size={17} />
                    </span>
                    <span className="portal-nav-label">{item.label}</span>
                    <IconChevronRight className="portal-nav-chevron" size={16} />
                  </NavLink>
                );
              })}
            </Stack>
          </Stack>
          <Button leftSection={<IconLogout size={16} />} color="red" variant="light" onClick={() => {
            localStorage.removeItem(STORAGE_KEY);
            setToken("");
            setUser(null);
            navigate("/overview");
          }}>
            Sign out
          </Button>
        </Stack>
      </AppShell.Navbar>
      <AppShell.Main>
        <Container size="xl">
          <Stack gap="lg">
            <Group justify="space-between">
              <Group>
                <Burger opened={opened} onClick={toggle} hiddenFrom="md" />
                <div>
                  <Text className="portal-label">Operations portal</Text>
                  <Title order={1}>{pageTitle}</Title>
                </div>
              </Group>
              <Group gap="sm">
                <Text c="dimmed">{user.email}</Text>
                <AppearanceToggle appearance={appearance} onToggle={onAppearanceToggle} />
              </Group>
            </Group>
            <Routes>
              <Route path="/" element={<Navigate to="/overview" replace />} />
              <Route path="/overview" element={<OverviewPage token={token} />} />
              <Route path="/queue-fees" element={<QueueFeesPage token={token} />} />
              <Route path="/plans" element={<PlansPage token={token} />} />
              <Route path="/settings" element={<SettingsPage token={token} />} />
              <Route path="/tenants" element={<RecordsPage token={token} endpoint="/platform/tenants" emptyLabel="No tenants." columns={[
                { key: "name", label: "Tenant" }, { key: "slug", label: "Slug" }, { key: "planSlug", label: "Plan" }, { key: "ticketCount", label: "Tickets" }, { key: "createdAt", label: "Created", render: (row) => formatDate(row.createdAt) }
              ]} />} />
              <Route path="/subscriptions" element={<SubscriptionsPage token={token} />} />
              <Route path="/users" element={<RecordsPage token={token} endpoint="/platform/users" emptyLabel="No users." columns={[
                { key: "name", label: "Name" }, { key: "email", label: "Email" }, { key: "roles", label: "Roles", render: (row) => (row.roles as string[] || []).join(", ") }, { key: "createdAt", label: "Created", render: (row) => formatDate(row.createdAt) }
              ]} />} />
              <Route path="/billing-events" element={<RecordsPage token={token} endpoint="/platform/billing-events" emptyLabel="No billing events." columns={[
                { key: "eventType", label: "Event" }, { key: "provider", label: "Provider" }, { key: "tenantName", label: "Tenant" }, { key: "processedAt", label: "Processed", render: (row) => formatDate(row.processedAt) }
              ]} />} />
            </Routes>
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}

function Root() {
  const [appearance, setAppearance] = useState<PortalAppearance>(readAppearance);

  useEffect(() => {
    localStorage.setItem(APPEARANCE_KEY, appearance);
    document.documentElement.dataset.portalTheme = appearance;
  }, [appearance]);

  const toggleAppearance = () => {
    setAppearance((current) => current === "dark" ? "light" : "dark");
  };

  return (
    <MantineProvider theme={theme} forceColorScheme={appearance}>
      <Notifications position="top-right" />
      <BrowserRouter>
        <PortalApp appearance={appearance} onAppearanceToggle={toggleAppearance} />
      </BrowserRouter>
    </MantineProvider>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Root /></StrictMode>);
