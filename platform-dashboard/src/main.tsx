import { StrictMode, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  AppShell,
  ActionIcon,
  Badge,
  Burger,
  Button,
  Card,
  Container,
  Group,
  MantineProvider,
  Paper,
  PasswordInput,
  SimpleGrid,
  Stack,
  Modal,
  Select,
  Tooltip,
  Text,
  TextInput,
  Title,
  createTheme
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Notifications, notifications } from "@mantine/notifications";
import {
  IconChartBar,
  IconLogout,
  IconSettings,
  IconUsers,
  IconBuildingStore,
  IconReceipt,
  IconCalendarDollar,
  IconListDetails,
  IconChevronRight,
  IconMoon,
  IconSun,
  IconPlus,
  IconShieldExclamation,
  IconStar
} from "@tabler/icons-react";
import { createRoot } from "react-dom/client";
import QRCode from "react-qr-code";
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type {
  AuthResponse,
  AuthLoginResponse,
  LoginRequest,
  PlatformListResponse,
  PlatformOverviewResponse,
  PlatformSettingsResponse,
  SubscriptionPlan,
  UpdatePlatformSettingsRequest,
  UserSummary
} from "@shared";
import { getTimeZoneOptions } from "../../shared/timezones";
import { apiRequest } from "./api";
import { PortalDataTable } from "./components/PortalDataTable";
import { PromptActionModal } from "./components/PromptActionModal";
import { ModalWheelBridge } from "./components/ModalWheelBridge";
import { PlanMatrixPage } from "./pages/PlanMatrixPage";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./styles.css";

const STORAGE_KEY = "prio-platform-auth";
const APPEARANCE_KEY = "prio-platform-appearance";
const PHP = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const timeZoneOptions = getTimeZoneOptions();
type PortalAppearance = "dark" | "light";
const theme = createTheme({
  primaryColor: "orange",
  fontFamily: 'Inter, Aptos, "Segoe UI", sans-serif',
  defaultRadius: "lg"
});
type GenericRecord = Record<string, unknown>;

const navItems = [
  { to: "/overview", label: "Overview", icon: IconChartBar },
  { to: "/plans", label: "Plan Matrix", icon: IconCalendarDollar },
  { to: "/tenants", label: "Tenants", icon: IconBuildingStore },
  { to: "/subscriptions", label: "Subscriptions", icon: IconListDetails },
  { to: "/users", label: "Users", icon: IconUsers },
  { to: "/billing-events", label: "Billing events", icon: IconReceipt },
  { to: "/security-audit", label: "Security audit", icon: IconShieldExclamation },
  { to: "/campaign-reports", label: "Campaign reports", icon: IconShieldExclamation },
  { to: "/rating-disputes", label: "Rating disputes", icon: IconStar },
  { to: "/settings", label: "Settings", icon: IconSettings }
] as const;

function formatPhp(value: number) {
  return PHP.format(Number(value || 0) / 100);
}

function formatDate(value: unknown) {
  return value ? new Date(String(value)).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "--";
}

function readToken() {
  localStorage.removeItem(STORAGE_KEY);
  return "cookie-session";
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

function LoginPanel({
  appearance,
  onAppearanceToggle,
  onLogin
}: {
  appearance: PortalAppearance;
  onAppearanceToggle: () => void;
  onLogin: (token: string, user: UserSummary, sessionExpiresAt?: string | Date | null) => void;
}) {
  const [form, setForm] = useState<LoginRequest>({ identifier: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mfaChallengeToken, setMfaChallengeToken] = useState("");
  const [mfaCode, setMfaCode] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const data = await apiRequest<AuthLoginResponse, LoginRequest>("/auth/login", { method: "POST", body: form });
      if ("mfaRequired" in data) {
        setMfaChallengeToken(data.challengeToken);
        return;
      }
      if (!data.user.roles.includes("platform_admin")) {
        throw new Error("This account does not have platform admin access.");
      }
      onLogin("cookie-session", data.user, data.sessionExpiresAt);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMfaSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const data = await apiRequest<AuthResponse, { challengeToken: string; code: string }>("/auth/mfa/verify", {
        method: "POST",
        body: { challengeToken: mfaChallengeToken, code: mfaCode }
      });
      if (!data.user.roles.includes("platform_admin")) {
        throw new Error("This account does not have platform admin access.");
      }
      onLogin("cookie-session", data.user, data.sessionExpiresAt);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to verify that code.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="portal-login">
      <Paper className="portal-card portal-login-card" p="xl">
        <form onSubmit={mfaChallengeToken ? handleMfaSubmit : handleSubmit}>
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
            {mfaChallengeToken ? (
              <>
                <Text c="dimmed">Enter the six-digit code from your authenticator app to finish signing in.</Text>
                <TextInput autoFocus autoComplete="one-time-code" inputMode="numeric" label="Authenticator code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} />
              </>
            ) : (
              <>
                <TextInput label="Email or username" value={form.identifier} onChange={(event) => setForm((current) => ({ ...current, identifier: event.target.value }))} />
                <PasswordInput label="Password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
              </>
            )}
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
      <PortalDataTable
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

function SettingsPage({ token, user }: { token: string; user: UserSummary & { mfaEnabled?: boolean } }) {
  const [settings, setSettings] = useState<PlatformSettingsResponse["settings"] | null>(null);
  const [mfaSecret, setMfaSecret] = useState("");
  const [mfaUri, setMfaUri] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [mfaActive, setMfaActive] = useState(Boolean(user.mfaEnabled));
  const [replacingMfa, setReplacingMfa] = useState(false);
  const [mfaPassword, setMfaPassword] = useState("");
  const [currentMfaCode, setCurrentMfaCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  useEffect(() => { apiRequest<PlatformSettingsResponse>("/platform/settings", { token }).then((data) => setSettings(data.settings)); }, [token]);
  useEffect(() => { setMfaActive(Boolean(user.mfaEnabled)); }, [user.mfaEnabled]);
  async function save() {
    if (!settings) return;
    const data = await apiRequest<PlatformSettingsResponse, UpdatePlatformSettingsRequest>("/platform/settings", { method: "PATCH", token, body: settings });
    setSettings(data.settings);
    showSaved("Settings updated");
  }
  async function startMfa() {
    setMfaBusy(true);
    try {
      if (mfaActive) {
        await apiRequest<{ success: boolean }, { password: string; code: string }>("/auth/mfa/step-up", {
          method: "POST",
          token,
          body: { password: mfaPassword, code: currentMfaCode }
        });
      }
      const data = await apiRequest<{ secret: string; otpAuthUri: string }, { currentCode?: string }>("/auth/mfa/enrollment/start", {
        method: "POST",
        token,
        body: mfaActive ? { currentCode: currentMfaCode } : {}
      });
      setMfaSecret(data.secret);
      setMfaUri(data.otpAuthUri);
      setRecoveryCodes([]);
      setReplacingMfa(false);
      setMfaPassword("");
      setCurrentMfaCode("");
    } catch (mfaError) {
      notifications.show({
        color: "red",
        title: mfaActive ? "Authenticator replacement could not start" : "Authenticator setup could not start",
        message: mfaError instanceof Error ? mfaError.message : "Please try again."
      });
    } finally {
      setMfaBusy(false);
    }
  }
  async function confirmMfa() {
    setMfaBusy(true);
    try {
      const data = await apiRequest<{ recoveryCodes: string[] }>("/auth/mfa/enrollment/confirm", { method: "POST", token, body: { code: mfaCode } });
      setRecoveryCodes(data.recoveryCodes);
      setMfaSecret("");
      setMfaUri("");
      setMfaCode("");
      setMfaActive(true);
      notifications.show({ color: "teal", title: "Authenticator enabled", message: "Save the recovery codes shown on this page." });
    } catch (mfaError) {
      notifications.show({ color: "red", title: "Code not verified", message: mfaError instanceof Error ? mfaError.message : "Please try again." });
    } finally {
      setMfaBusy(false);
    }
  }
  return (
    <Stack>
    <Paper className="portal-card" p="lg">
      <Stack>
        <TextInput label="Enterprise inquiry recipient" value={settings?.enterpriseInquiryEmail || ""} onChange={(event) => setSettings((current) => current ? { ...current, enterpriseInquiryEmail: event.target.value } : current)} />
        <Select
          allowDeselect={false}
          data={timeZoneOptions}
          description="Used as the initial timezone for newly created vendor locations."
          label="Default timezone"
          onChange={(value) => setSettings((current) => current && value ? { ...current, defaultTimezone: value } : current)}
          searchable
          value={settings?.defaultTimezone || null}
        />
        <Group justify="flex-end"><Button onClick={save}>Save settings</Button></Group>
      </Stack>
    </Paper>
    <Paper className="portal-card" p="lg">
      <Stack>
        <div><Text className="neura-label">PLATFORM SECURITY</Text><Title order={3}>Authenticator verification</Title><Text c="dimmed">Required for plan, credit, lifecycle, and repair confirmations.</Text></div>
        {recoveryCodes.length ? <Card withBorder><Text fw={700}>Save these one-time recovery codes</Text>{recoveryCodes.map((code) => <Text ff="monospace" key={code}>{code}</Text>)}</Card> : null}
        {mfaActive && !mfaSecret && !replacingMfa && !recoveryCodes.length ? (
          <Stack gap="sm">
            <Group><Badge color="teal">Enabled</Badge><Text c="dimmed" size="sm">Your authenticator is active.</Text></Group>
            <Button variant="light" onClick={() => setReplacingMfa(true)}>Replace authenticator</Button>
          </Stack>
        ) : null}
        {replacingMfa && !mfaSecret ? (
          <Card withBorder>
            <Stack gap="md">
              <div>
                <Text fw={700}>Confirm before replacing your authenticator</Text>
                <Text c="dimmed" size="sm">Enter your password and a code from your current authenticator. Your current authenticator stays active until the new one is verified.</Text>
              </div>
              <PasswordInput autoComplete="current-password" label="Password" value={mfaPassword} onChange={(event) => setMfaPassword(event.target.value)} />
              <TextInput autoComplete="one-time-code" inputMode="numeric" label="Current authenticator code" maxLength={6} value={currentMfaCode} onChange={(event) => setCurrentMfaCode(event.target.value.replace(/\D/g, ""))}/>
              <Group justify="flex-end">
                <Button disabled={mfaBusy} variant="subtle" onClick={() => { setReplacingMfa(false); setMfaPassword(""); setCurrentMfaCode(""); }}>Cancel</Button>
                <Button disabled={!mfaPassword || currentMfaCode.length !== 6} loading={mfaBusy} onClick={() => void startMfa()}>Verify and replace</Button>
              </Group>
            </Stack>
          </Card>
        ) : null}
        {!mfaActive && !mfaSecret ? <Button loading={mfaBusy} onClick={() => void startMfa()}>Set up authenticator</Button> : null}
        {mfaSecret ? (
          <Stack gap="md">
            <Stack align="center" gap="sm">
              <Text fw={700} ta="center">Scan with your authenticator app</Text>
              <Text c="dimmed" maw={440} size="sm" ta="center">Add an account in your authenticator app, then scan this QR code.</Text>
              <div aria-label="GetPrio authenticator setup QR code" className="mfa-setup-qr" role="img">
                <QRCode aria-hidden="true" bgColor="#ffffff" fgColor="#111827" size={192} value={mfaUri} />
              </div>
            </Stack>
            <Card withBorder>
              <Stack gap="xs">
                <Text fw={700}>Can’t scan the QR code?</Text>
                <Text c="dimmed" size="sm">Open the setup link on this device or enter the secret manually.</Text>
                <Text component="a" href={mfaUri} style={{ overflowWrap: "anywhere" }}>Open authenticator setup</Text>
                <Text ff="monospace" style={{ overflowWrap: "anywhere" }}>{mfaSecret}</Text>
              </Stack>
            </Card>
            <TextInput autoComplete="one-time-code" inputMode="numeric" label="6-digit code" maxLength={6} value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ""))}/>
            <Button disabled={mfaCode.length !== 6} loading={mfaBusy} onClick={() => void confirmMfa()}>Verify and enable</Button>
          </Stack>
        ) : null}
      </Stack>
    </Paper>
    </Stack>
  );
}

function RecordsPage({ token, endpoint, columns, emptyLabel }: { token: string; endpoint: string; columns: Array<{ key: string; label: string; render?: (row: GenericRecord) => ReactNode }>; emptyLabel: string }) {
  const [rows, setRows] = useState<GenericRecord[]>([]);
  useEffect(() => { apiRequest<PlatformListResponse<GenericRecord>>(endpoint, { token }).then((data) => setRows(data.items)); }, [endpoint, token]);
  return <PortalDataTable rows={rows} columns={columns} emptyLabel={emptyLabel} />;
}

function CampaignReportsPage({ token }: { token: string }) {
  const [rows, setRows] = useState<GenericRecord[]>([]);
  const [campaignToFreeze, setCampaignToFreeze] = useState<GenericRecord | null>(null);
  const [freezeReason, setFreezeReason] = useState("");
  const [freezeBusy, setFreezeBusy] = useState(false);
  const [freezeError, setFreezeError] = useState("");
  const load = () => apiRequest<PlatformListResponse<GenericRecord>>("/platform/campaign-reports", { token }).then((data) => setRows(data.items));
  useEffect(() => { void load(); }, [token]);
  async function freeze() {
    const reason = freezeReason.trim();
    if (!campaignToFreeze || !reason) return;
    setFreezeBusy(true);
    setFreezeError("");
    let campaignFrozen = false;
    try {
      const freezeResult = await apiRequest<{ campaign: GenericRecord | null }>(`/platform/campaigns/${campaignToFreeze.campaign_id}/freeze`, { method: "PATCH", token, body: { reason } });
      if (!freezeResult.campaign) throw new Error("This campaign is no longer eligible to be frozen.");
      campaignFrozen = true;
      await apiRequest(`/platform/campaign-reports/${campaignToFreeze.id}`, { method: "PATCH", token, body: { status: "reviewing" } });
      setCampaignToFreeze(null);
      setFreezeReason("");
      notifications.show({ color: "teal", title: "Campaign frozen", message: "The report is now marked for review." });
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Please try again.";
      if (campaignFrozen) {
        setCampaignToFreeze(null);
        setFreezeReason("");
        notifications.show({ color: "yellow", title: "Campaign frozen; report status needs attention", message });
        await load().catch(() => undefined);
      } else {
        setFreezeError(message);
      }
    } finally {
      setFreezeBusy(false);
    }
  }
  return <><PortalDataTable rows={rows} emptyLabel="No campaign reports." columns={[{ key: "campaign_title", label: "Campaign" }, { key: "category", label: "Category" }, { key: "reporter_email", label: "Reporter" }, { key: "report_status", label: "Status", render: (row) => <StatusBadge value={row.report_status}/> }, { key: "created_at", label: "Reported", render: (row) => formatDate(row.created_at) }, { key: "actions", label: "Action", render: (row) => <Button color="red" onClick={() => { setCampaignToFreeze(row); setFreezeReason(""); setFreezeError(""); }} size="xs" variant="light">Freeze & review</Button> }]}/><PromptActionModal confirmColor="red" confirmLabel="Freeze campaign" description="Freezing prevents further campaign activity while Platform Admin reviews the report." error={freezeError} eyebrow="CAMPAIGN MODERATION" label="Reason for freezing this campaign" loading={freezeBusy} maxLength={500} onChange={setFreezeReason} onClose={() => { setCampaignToFreeze(null); setFreezeReason(""); setFreezeError(""); }} onConfirm={() => void freeze()} opened={Boolean(campaignToFreeze)} placeholder="Explain the moderation concern" title={`Freeze ${String(campaignToFreeze?.campaign_title || "campaign")}?`} value={freezeReason}/></>;
}

function RatingDisputesPage({ token }: { token: string }) {
  const [rows, setRows] = useState<GenericRecord[]>([]);
  const load = () => apiRequest<PlatformListResponse<GenericRecord>>("/platform/rating-disputes", { token }).then((data) => setRows(data.items));
  useEffect(() => { void load(); }, [token]);
  async function resolve(row: GenericRecord, moderationStatus: "active" | "hidden") {
    await apiRequest(`/platform/rating-disputes/${row.id}`, { method: "PATCH", token, body: { status: moderationStatus === "active" ? "dismissed" : "resolved", moderationStatus } });
    await load();
  }
  return <PortalDataTable rows={rows} emptyLabel="No rating disputes." columns={[
    { key: "rating_type", label: "Rating" }, { key: "rating_id", label: "ID" },
    { key: "reporter_email", label: "Reporter" }, { key: "reason", label: "Reason" },
    { key: "dispute_status", label: "Status", render: (row) => <StatusBadge value={row.dispute_status}/> },
    { key: "created_at", label: "Appealed", render: (row) => formatDate(row.created_at) },
    { key: "actions", label: "Actions", render: (row) => <Group gap="xs"><Button onClick={() => resolve(row, "active")} size="xs" variant="light">Restore</Button><Button color="red" onClick={() => resolve(row, "hidden")} size="xs" variant="light">Hide</Button></Group> }
  ]}/>;
}

function SubscriptionsPage({ token }: { token: string }) {
  const [rows, setRows] = useState<GenericRecord[]>([]);
  const [tenants, setTenants] = useState<GenericRecord[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState({
    tenantId: "",
    planSlug: "free",
    reason: ""
  });
  const tenantOptions = tenants.map((tenant) => ({
    value: String(tenant.id),
    label: String(tenant.name || tenant.slug || tenant.id)
  }));
  const planOptions = plans.map((plan) => ({
    value: plan.slug,
    label: `${plan.name} · ${plan.price.monthlyDisplay}`
  }));
  const editorTitle = "Schedule plan transition";

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
    setForm({
      tenantId: "",
      planSlug: plans[0]?.slug || "free",
      reason: ""
    });
    setEditorOpen(true);
  }

  async function createSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = { tenantId: Number(form.tenantId), planSlug: form.planSlug, reason: form.reason };
    const payload = { tenantId: String(body.tenantId), planSlug: body.planSlug };
    const preview = await apiRequest<{ confirmation: { token: string }; preview: { revision: string } }>("/platform/privileged-actions/preview", {
      method: "POST", token, body: { action: "subscription.transition", target: String(body.tenantId), reason: body.reason, payload, previewRevision: "subscription-transition-v1" }
    });
    await apiRequest<{ transition: GenericRecord }, GenericRecord>("/platform/subscriptions", {
      method: "POST", token, headers: { "X-Transaction-Confirmation": preview.confirmation.token }, body: { ...body, previewRevision: preview.preview.revision }
    });
    await load();
    showSaved("Subscription transition scheduled");
    setEditorOpen(false);
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <div>
          <Text className="portal-label">Subscriptions</Text>
          <Title order={2}>Tenant subscription records</Title>
          <Text c="dimmed" size="sm">
            Preserve subscription history and move tenants through auditable lifecycle transitions.
          </Text>
        </div>
        <Tooltip label="Schedule plan transition" withArrow>
          <Button className="subscription-editor__submit" leftSection={<IconPlus size={16} />} onClick={openNewSubscription}>
            Schedule transition
          </Button>
        </Tooltip>
      </Group>
      <PortalDataTable
        rows={rows}
        emptyLabel="No subscriptions."
        pinFirstColumn
        pinLastColumn
        columns={[
          { key: "id", label: "ID", width: 56 },
          {
              key: "tenantName",
              label: "Tenant",
              width: 260,
              render: (row) => <Text fw={700}>{String(row.tenantName || row.tenantSlug || "--")}</Text>
            },
          { key: "planSlug", label: "Plan", width: 120 },
          { key: "status", label: "Status", width: 120, render: (row) => <StatusBadge value={row.status} /> },
          { key: "provider", label: "Provider", width: 140 },
          { key: "currentPeriodEnd", label: "Renews", width: 160, render: (row) => formatDate(row.currentPeriodEnd) },
          {
            key: "actions",
              label: "Actions",
              width: 132,
              render: (row) => (
                <Button size="xs" variant="light" onClick={() => { setForm({ tenantId: String(row.tenantId), planSlug: String(row.planSlug || "free"), reason: "" }); setEditorOpen(true); }}>Schedule transition</Button>
              )
            }
        ]}
      />
      <Modal
        centered
        opened={editorOpen}
        onClose={() => setEditorOpen(false)}
        size="xl"
        title={
          <Stack className="getprio-modal-title" gap={2}>
            <Text className="getprio-modal-eyebrow">SUBSCRIPTION EDITOR</Text>
            <Text className="getprio-modal-heading">{editorTitle}</Text>
          </Stack>
        }
        overlayProps={{ blur: 6, backgroundOpacity: 0.35 }}
      >
        <form className="task-modal-form" onSubmit={createSubscription}>
          <Stack className="task-modal-form__main" gap="lg">
            <Group justify="space-between" align="flex-start" className="subscription-editor__header">
              <div>
                <Text c="dimmed" size="sm">
                  Choose the destination plan and record why the lifecycle change is required. Paid downgrades and exits take effect at term end; restricted subscriptions are never converted to Free implicitly.
                </Text>
              </div>
              <Badge variant="light" color="orange">
                Admin only
              </Badge>
            </Group>

            <SimpleGrid cols={{ base: 1 }} spacing="md">
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
                      setForm((current) => ({ ...current, planSlug: value || "free" }))
                    }
                  />
                  <TextInput label="Reason" description="Required for the transition and security audit." value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} />
                </Stack>
              </Card>
            </SimpleGrid>

          </Stack>
          <Group justify="space-between" align="center" className="subscription-editor__footer">
              <Text c="dimmed" size="sm">
                The transition keeps subscription history and records its effective timing.
              </Text>
              <Group gap="sm">
                <Button variant="default" onClick={() => setEditorOpen(false)}>
                  Cancel
                </Button>
                <Button className="subscription-editor__submit" type="submit" disabled={!form.tenantId || form.reason.trim().length < 8}>Schedule transition</Button>
              </Group>
          </Group>
        </form>
      </Modal>
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
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);
  const [expiryWarningOpen, setExpiryWarningOpen] = useState(false);
  const [opened, { toggle, close }] = useDisclosure(false);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (!token) return;
    apiRequest<{ user: UserSummary; sessionExpiresAt?: string | Date | null }>("/auth/me", { token }).then((data) => {
      if (!data.user.roles.includes("platform_admin")) throw new Error("Platform admin access required.");
      setUser(data.user);
      setSessionExpiresAt(data.sessionExpiresAt ? new Date(data.sessionExpiresAt).getTime() : null);
    }).catch(() => {
      setToken("");
    });
  }, [token]);
  useEffect(() => {
    if (!sessionExpiresAt || !user) return;
    const timer = window.setTimeout(() => setExpiryWarningOpen(true), Math.max(0, sessionExpiresAt - Date.now() - 5 * 60_000));
    return () => window.clearTimeout(timer);
  }, [sessionExpiresAt, user]);

  if (!token || !user) {
    return (
      <LoginPanel
        appearance={appearance}
        onAppearanceToggle={onAppearanceToggle}
        onLogin={(nextToken, nextUser, expiresAt) => { setToken(nextToken); setUser(nextUser); setSessionExpiresAt(expiresAt ? new Date(expiresAt).getTime() : null); }}
      />
    );
  }

  const visibleNavItems = navItems;
  const pageTitle = visibleNavItems.find((item) => item.to === location.pathname)?.label || "Overview";
  return (
    <><AppShell
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
              {visibleNavItems.map((item) => {
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
          <Button leftSection={<IconLogout size={16} />} color="red" variant="light" onClick={async () => {
            try {
              await apiRequest<{ success: boolean }>("/auth/logout", { method: "POST", body: {} });
            } catch {
              // Clear the local view even if the server is temporarily unreachable.
            }
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
              <Route path="/queue-fees" element={<Navigate to="/plans" replace />} />
              <Route path="/plans" element={<PlanMatrixPage token={token} />} />
              <Route path="/settings" element={<SettingsPage token={token} user={user} />} />
              <Route path="/tenants" element={<RecordsPage token={token} endpoint="/platform/tenants" emptyLabel="No tenants." columns={[
                { key: "name", label: "Tenant" }, { key: "username", label: "Username" }, { key: "slug", label: "Slug" }, { key: "planSlug", label: "Plan" }, { key: "ticketCount", label: "Tickets" }, { key: "createdAt", label: "Created", render: (row) => formatDate(row.createdAt) }
              ]} />} />
              <Route path="/subscriptions" element={<SubscriptionsPage token={token} />} />
              <Route path="/users" element={<RecordsPage token={token} endpoint="/platform/users" emptyLabel="No users." columns={[
                { key: "name", label: "Name" }, { key: "username", label: "Username" }, { key: "email", label: "Email" }, { key: "roles", label: "Roles", render: (row) => (row.roles as string[] || []).join(", ") }, { key: "createdAt", label: "Created", render: (row) => formatDate(row.createdAt) }
              ]} />} />
              <Route path="/billing-events" element={<RecordsPage token={token} endpoint="/platform/billing-events" emptyLabel="No billing events." columns={[
                { key: "eventType", label: "Event" }, { key: "provider", label: "Provider" }, { key: "tenantName", label: "Tenant" }, { key: "processedAt", label: "Processed", render: (row) => formatDate(row.processedAt) }
              ]} />} />
              <Route path="/security-audit" element={<RecordsPage token={token} endpoint="/platform/security-audit-events" emptyLabel="No security audit events." columns={[
                { key: "occurred_at", label: "Occurred", render: (row) => formatDate(row.occurred_at) },
                { key: "action_key", label: "Action" },
                { key: "outcome", label: "Outcome", render: (row) => <StatusBadge value={row.outcome} /> },
                { key: "actor_email", label: "Actor" },
                { key: "resource_type", label: "Resource" },
                { key: "reason", label: "Reason" }
              ]} />} />
              <Route path="/campaign-reports" element={<CampaignReportsPage token={token} />} />
              <Route path="/rating-disputes" element={<RatingDisputesPage token={token} />} />
            </Routes>
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell><Modal centered closeOnClickOutside={false} closeOnEscape={false} opened={expiryWarningOpen} onClose={() => undefined} title={<div><Text className="portal-label">SESSION SECURITY</Text><Title order={3}>Your admin session will expire soon</Title></div>}><Stack><Text>Continue now to keep your secure Platform session active.</Text><Button onClick={async () => { const data = await apiRequest<AuthResponse>("/auth/refresh", { method: "POST", body: {} }); setUser(data.user); setSessionExpiresAt(data.sessionExpiresAt ? new Date(data.sessionExpiresAt).getTime() : null); setExpiryWarningOpen(false); }}>Continue session</Button><Button variant="subtle" onClick={() => { setToken(""); setUser(null); setSessionExpiresAt(null); }}>Sign out</Button></Stack></Modal></>
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
      <ModalWheelBridge />
      <BrowserRouter>
        <PortalApp appearance={appearance} onAppearanceToggle={toggleAppearance} />
      </BrowserRouter>
    </MantineProvider>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Root /></StrictMode>);
