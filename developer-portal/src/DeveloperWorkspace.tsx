import { Fragment, useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Badge, Button, FloatingIndicator, Modal, Paper, Select, Switch, Textarea, TextInput } from "@mantine/core";
import { IconCheck, IconCopy, IconExternalLink, IconKey, IconPencil, IconPlus, IconRefresh, IconWebhook, IconX } from "@tabler/icons-react";
import { DeveloperApiError, developerApi, type ApiKey, type Delivery, type DeveloperTicket, type Profile, type Project, type Queue, type QueueSnapshot, type SandboxAllowance, type SandboxTestAccount, type Session, type UsageReport, type Webhook } from "./developerApi";
import "./DeveloperPortalPrototype.css";
import "./DeveloperWorkspace.css";

type Props = { session: Session; accountContent?: ReactNode; light?: boolean };
type Section = "overview" | "setup" | "readiness" | "keys" | "keyCreate" | "profiles" | "profileCreate" | "queues" | "queueCreate" | "resources" | "webhooks" | "webhookCreate" | "usage" | "accountProfile" | "billing" | "subscriptions" | "teamSecurity" | "security";
type Environment = "sandbox" | "production";
type PendingNavigation = { section: Section; environment: Environment; projectId?: string };
type ConfirmationRequest = { title: string; message: string; actionLabel: string; busyKey: string; run: () => Promise<void> };
const sectionLabels: Record<Section, string> = {
  overview: "Overview", setup: "Sandbox setup", readiness: "Production readiness",
  keys: "API keys", keyCreate: "Create API key", profiles: "Profiles", profileCreate: "Create profile", queues: "Queues & tickets", queueCreate: "Create queue", resources: "Profiles", webhooks: "Webhooks", webhookCreate: "Create webhook", usage: "Usage",
  accountProfile: "Account profile", billing: "Billing & wallet", subscriptions: "Project subscriptions", teamSecurity: "Team & security", security: "My security"
};
const workspacePaths: Record<Section, string> = {
  overview: "/dashboard", setup: "/dashboard/setup", readiness: "/dashboard/readiness",
  keys: "/dashboard/keys", keyCreate: "/dashboard/keys/new", profiles: "/dashboard/profiles", profileCreate: "/dashboard/profiles/new", queues: "/dashboard/queues", queueCreate: "/dashboard/queues/new", resources: "/dashboard/resources", webhooks: "/dashboard/webhooks", webhookCreate: "/dashboard/webhooks/new", usage: "/dashboard/usage",
  accountProfile: "/dashboard/account/profile", billing: "/dashboard/account/billing", subscriptions: "/dashboard/account/subscriptions", teamSecurity: "/dashboard/account/team-security", security: "/dashboard/account/security"
};
const scopes = ["profiles:read", "profiles:write", "queues:read", "queues:write", "webhooks:read", "webhooks:write"];
const scopeLabels: Record<string, string> = {
  "profiles:read": "Read profiles and locations",
  "profiles:write": "Manage profiles and locations",
  "queues:read": "Read queues and counters",
  "queues:write": "Configure queues and ticket operations",
  "webhooks:read": "Read webhook registrations and deliveries",
  "webhooks:write": "Manage webhook registrations and deliveries"
};
const webhookEvents = [
  "queue.session.opened", "queue.intake.paused", "queue.intake.resumed", "queue.session.extended",
  "queue.session.closing", "queue.session.closed", "ticket.issued", "ticket.called", "ticket.served",
  "ticket.skipped", "ticket.restored", "ticket.cancelled", "ticket.unserved", "ticket.expired"
];

function workspaceLocation(): { section: Section; environment: Environment } {
  if (typeof window === "undefined") return { section: "overview", environment: "sandbox" };
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/dashboard";
  const matched = (Object.entries(workspacePaths).find(([, path]) => pathname === path)?.[0] || "overview") as Section;
  const section = matched === "resources" ? "profiles" : matched;
  const environment = section === "readiness" || new URLSearchParams(window.location.search).get("environment") === "production" ? "production" : "sandbox";
  return { section, environment };
}

function workspaceHref(section: Section, environment: Environment) {
  const path = workspacePaths[section];
  return environment === "production" ? `${path}?environment=production` : path;
}

async function copy(value: string) {
  try { await navigator.clipboard.writeText(value); }
  catch {
    const node = document.createElement("textarea"); node.value = value; node.style.position = "fixed"; node.style.opacity = "0";
    document.body.append(node); node.select(); document.execCommand("copy"); node.remove();
  }
}

function Secret({ label, value, warning, onClose }: { label: string; value: string; warning: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copySecret() { await copy(value); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
  return <section className="developer-workspace-secret" role="status">
    <div><p className="developer-workspace-eyebrow">SAVE THIS NOW</p><h3>{label}</h3><p>{warning}</p></div>
    <code>{value}</code>
    <div className="developer-workspace-inline-actions"><Button type="button" className="developer-workspace-primary" onClick={copySecret}>{copied ? <IconCheck size={16} /> : <IconCopy size={16} />}{copied ? "Copied" : "Copy secret"}</Button><Button type="button" variant="light" onClick={onClose}>I saved it</Button></div>
  </section>;
}

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="developer-workspace-empty"><h3>{title}</h3><p>{children}</p></div>;
}

function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Never"; }

function formatCountdown(resetAt: string | null, now: number) {
  if (!resetAt) return "--:--:--";
  const seconds = Math.max(0, Math.ceil((new Date(resetAt).getTime() - now) / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map((value) => String(value).padStart(2, "0")).join(":");
}

function Allowance({ value, compact = false }: { value: SandboxAllowance | null; compact?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (compact || !value?.resetAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [compact, value?.resetAt]);
  if (compact) {
    return <Paper component="article" withBorder className="developer-workspace-dashboard-card developer-workspace-allowance-card">
      <p className="developer-workspace-eyebrow">SANDBOX ALLOWANCE</p>
      {value ? <><strong>{value.remaining} <span>/ {value.limit}</span></strong><div className="developer-workspace-allowance-track" role="progressbar" aria-label="Remaining Sandbox test credits" aria-valuenow={value.remaining} aria-valuemin={0} aria-valuemax={value.limit}><span style={{ width: `${value.limit > 0 ? Math.min(100, Math.max(0, value.remaining / value.limit * 100)) : 0}%` }} /></div><p>Next reset: 00:00 UTC · 08:00 Manila</p></> : <p>Sandbox allowance unavailable</p>}
    </Paper>;
  }
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return <Paper component="section" withBorder className="developer-workspace-allowance">
    <p className="developer-workspace-eyebrow">PROJECT / SANDBOX ALLOWANCE</p>
    <div className="developer-workspace-allowance-content"><div><h3>{value ? `${value.remaining} / ${value.limit} test credits` : "Sandbox allowance unavailable"}</h3>{value && <div className="developer-workspace-allowance-track" role="progressbar" aria-label="Remaining Sandbox test credits" aria-valuenow={value.remaining} aria-valuemin={0} aria-valuemax={value.limit}><span style={{ width: `${value.limit > 0 ? Math.min(100, Math.max(0, value.remaining / value.limit * 100)) : 0}%` }} /></div>}<p>Illustrative unused balance · one test ticket consumes one credit.</p></div>{value && <div className="developer-workspace-allowance-countdown"><span>Next daily reset in</span><strong aria-label="Time until Sandbox credit reset">{formatCountdown(value.resetAt, now)}</strong></div>}</div>
    {value && <><p>Resets at {formatDate(value.resetAt)} ({zone}). The reset boundary is always 00:00 UTC, regardless of your device timezone.</p><p>Unused test credits do not roll over. Production credits never expire.</p><p>Limits: 2 test accounts per project · 2 registered devices per test account.</p></>}
  </Paper>;
}

function Setup({ allowance, testAccounts, busy, onCreate, onReset }: { allowance: SandboxAllowance | null; testAccounts: SandboxTestAccount[]; busy: string; onCreate: () => void; onReset: (account: SandboxTestAccount) => void }) {
  const [notice, setNotice] = useState("");
  const accountCount = testAccounts.length;
  const provisioningBusy = busy.startsWith("test-account-");
  return <section className="developer-workspace-panel dpp-section"><h1>Your first ticket, end to end.</h1><p>Install the tester app, sign in with a test account, then follow a ticket through your integration.</p><Allowance value={allowance} /><div className="developer-workspace-setup-grid dpp-steps">
    <Paper component="article" withBorder className="developer-workspace-setup-card"><p className="developer-workspace-eyebrow">01 / INSTALL</p><h3>GetPrio Sandbox</h3><p>A separate app for testing. Your production account will not sign in here.</p><div className="developer-workspace-inline-actions"><Button type="button" onClick={() => setNotice("The Android Sandbox download is not provisioned in this local portal yet.")}>Android download</Button><Button type="button" variant="light" onClick={() => setNotice("The TestFlight join link is not provisioned in this local portal yet.")}>Join TestFlight</Button></div></Paper>
    <Paper component="article" withBorder className="developer-workspace-setup-card"><p className="developer-workspace-eyebrow">02 / SIGN IN</p><h3>Test accounts · {accountCount} / 2</h3><p>Credentials expire after seven days. Resetting credentials ends previous sessions and removes registered devices; retained tickets remain with the account.</p>{testAccounts.length > 0 && <div className="developer-workspace-test-account-list">{testAccounts.map((account) => <div className="developer-workspace-test-account" key={account.id}><div><strong>{account.username}</strong><small>{account.status === "active" ? `Expires ${formatDate(account.expiresAt)}` : "Expired · reset to reuse"} · {account.deviceCount} device{account.deviceCount === 1 ? "" : "s"}</small></div><Button type="button" variant="light" loading={busy === `test-account-reset-${account.id}`} disabled={provisioningBusy} onClick={() => onReset(account)}>{account.status === "active" ? "Reset" : "Reset & reuse"}</Button></div>)}</div>}<Button type="button" loading={busy === "test-account-create"} disabled={provisioningBusy || accountCount >= 2} onClick={onCreate}>{accountCount >= 2 ? "Two accounts created" : "Create test account"}</Button></Paper>
    <Paper component="article" withBorder className="developer-workspace-setup-card"><p className="developer-workspace-eyebrow">03 / VERIFY</p><h3>Follow a test ticket</h3><ol><li>Use your sandbox key from your backend.</li><li>Create a queue and issue one test ticket.</li><li>Scan its private link, or accept its in-app invitation.</li><li>Call the ticket and verify the app update and push.</li></ol><p>A public queue QR does not claim an existing ticket.</p><Button component="a" href="/guides" variant="light">Open quickstart</Button></Paper>
  </div>{notice && <p className="developer-workspace-setup-action-notice" role="status">{notice}</p>}</section>;
}

function ApiKeyCreatePage({ project, profiles, busy, onCreate, onBack, onDirtyChange }: { project: Project; profiles: Profile[]; busy: string; onCreate: (event: FormEvent<HTMLFormElement>) => void; onBack: () => void; onDirtyChange: (dirty: boolean) => void }) {
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [profileAccess, setProfileAccess] = useState<"all" | "selected">("all");
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  useEffect(() => { onDirtyChange(selectedScopes.length > 0 || profileAccess !== "all" || selectedProfiles.length > 0); }, [onDirtyChange, profileAccess, selectedProfiles.length, selectedScopes.length]);
  return <section className="developer-workspace-panel dpp-section developer-workspace-key-create-page">
    <div className="dpp-actions"><Button type="button" variant="subtle" onClick={onBack}>← Back to API keys</Button></div>
    <h1>Create an API key</h1>
    <p>{project.name} · Sandbox · choose this key’s permissions and profile access.</p>
    <Paper component="form" withBorder p="xl" onSubmit={onCreate} className="developer-workspace-key-create">
      <p>Each key belongs to this project and environment. Its secret is shown once and cannot be retrieved later.</p>
      <input type="hidden" name="name" value={`${project.name} Sandbox key`} />
      <fieldset className="dpp-key-permissions"><legend>Allowed API actions</legend><p>Select only the actions this integration needs.</p>{scopes.map((scope) => <label key={scope}><input type="checkbox" name={scope} checked={selectedScopes.includes(scope)} onChange={(event) => setSelectedScopes(event.currentTarget.checked ? [...selectedScopes, scope] : selectedScopes.filter((value) => value !== scope))} /><span>{scopeLabels[scope]}<small>{scope}</small></span></label>)}</fieldset>
      <Select label="Profile access" data={[{ value: "all", label: "All profiles" }, { value: "selected", label: "Selected profiles" }]} value={profileAccess} onChange={(value) => { if (value === "selected") setProfileAccess("selected"); else { setProfileAccess("all"); setSelectedProfiles([]); } }} comboboxProps={{ withinPortal: false }} classNames={{ dropdown: "dpp-select-dropdown", option: "dpp-select-option" }} />
      {profileAccess === "selected" && <fieldset className="dpp-key-permissions"><legend>Profiles this key can access</legend><p>Select at least one profile. New profiles are not added to this selection automatically.</p>{profiles.map((profile) => <label key={profile.id}><input type="checkbox" name="profileSlugs" value={profile.slug} checked={selectedProfiles.includes(profile.slug)} onChange={(event) => setSelectedProfiles(event.currentTarget.checked ? [...selectedProfiles, profile.slug] : selectedProfiles.filter((value) => value !== profile.slug))} /><span>{profile.displayName}<small>{profile.slug}</small></span></label>)}<p role="status">{selectedProfiles.length} profiles selected</p></fieldset>}
      <input type="hidden" name="profileAccess" value={profileAccess} />
      <p className="developer-workspace-key-note">{profileAccess === "all" ? "Includes profiles added later. Creating profiles also requires profiles:write." : "Limited to the selected profiles; access does not expand when profiles are added."}</p>
      <p className="developer-workspace-key-note">API actions do not grant portal billing, team management or webhook administration access.</p>
      <div className="dpp-key-create-action"><Button type="submit" className="developer-workspace-primary" loading={busy === "key"} disabled={!selectedScopes.length || (profileAccess === "selected" && !selectedProfiles.length) || busy === "key"} leftSection={<IconKey size={16} />}>Generate Sandbox key</Button></div>
      <p>Base URL</p>
      <code>https://sandbox-api.getprio.online/v1</code>
    </Paper>
  </section>;
}

function ApiKeysPage({ project, keys, onCreatePage, onRevoke }: { project: Project; keys: ApiKey[]; onCreatePage: () => void; onRevoke: (key: ApiKey) => void }) {
  const [expandedKeyId, setExpandedKeyId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const activeKeys = keys.filter((key) => key.status === "active");
  const historyKeys = keys.filter((key) => key.status !== "active");
  const pageCount = Math.max(1, Math.ceil(historyKeys.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = historyKeys.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  return <section className="developer-workspace-panel dpp-section developer-workspace-keys-page">
    <h1>Keys for sandbox.</h1>
    <p>{project.name} · Sandbox · keep secrets on your backend.</p>
    <div className="developer-workspace-key-toolbar"><Button className="developer-workspace-primary" onClick={onCreatePage}>Create API key</Button></div>
    <section className="developer-workspace-key-section"><p className="developer-workspace-eyebrow">CURRENT CREDENTIALS</p><h3>Active keys</h3><p>Keys currently available to your Sandbox integration. Secrets are never displayed here.</p>{activeKeys.length ? <div className="developer-workspace-key-list">{activeKeys.map((key) => <Paper component="article" withBorder className="developer-workspace-key-card" key={key.id}><div className="developer-workspace-key-card-header"><div><h4>{key.name}</h4><p><code>{key.keyPrefix}…</code> · Created {formatDate(key.createdAt)}</p></div><Badge color="blue" variant="light" radius="xl">Active</Badge></div><p className="developer-workspace-key-scopes"><strong>Allowed actions</strong>{key.scopes.join(" · ")}</p><p className="developer-workspace-key-scopes"><strong>Profile access</strong>{key.profileAccess === "selected" ? key.profileSlugs.join(" · ") : "All profiles"}</p><Button type="button" variant="light" color="red" onClick={() => onRevoke(key)}>Revoke key</Button></Paper>)}</div> : <Empty title="No active Sandbox keys">Create a narrowly scoped key for your server integration.</Empty>}</section>
    <section className="developer-workspace-key-section"><p className="developer-workspace-eyebrow">KEY LIFECYCLE</p><h3>Key history</h3><p>Revoked keys can no longer authorize requests. Queues, profiles, and tickets remain intact.</p><p className="developer-workspace-table-hint">Expand a row for details. On narrow screens, scroll horizontally to view every column.</p><div className="dpp-delivery-table-wrap developer-workspace-key-history-wrap" role="region" aria-label="API key history" tabIndex={0}><table className="dpp-delivery-table dpp-key-history-table"><caption>{project.name} · Sandbox · key history</caption><thead><tr><th scope="col"><span className="dpp-sr-only">Expand key</span></th><th scope="col">Key</th><th scope="col">Status</th><th scope="col">Environment</th><th scope="col">Permissions</th></tr></thead><tbody>{historyKeys.length ? pageRows.map((key) => { const open = expandedKeyId === key.id; return <Fragment key={key.id}><tr className="dpp-delivery-parent" tabIndex={0} aria-expanded={open} aria-controls={`key-history-${key.id}`} aria-label={`${key.name}, ${key.status}`} onClick={() => setExpandedKeyId(open ? null : key.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setExpandedKeyId(open ? null : key.id); } }}><td><span className={`dpp-row-chevron${open ? " is-open" : ""}`} aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span></td><th scope="row">{key.name}</th><td><Badge color="gray" variant="light" radius="xl">{key.status}</Badge></td><td>Sandbox</td><td>{key.scopes.length} allowed actions</td></tr>{open && <tr className="dpp-delivery-note"><td colSpan={5}><div className="dpp-webhook-detail" id={`key-history-${key.id}`}><section><small>KEY ACCESS</small><h3>Permissions and profiles</h3><h4>Allowed actions</h4><ul>{key.scopes.map((scope) => <li key={scope}>{scopeLabels[scope] || scope}</li>)}</ul><h4>Profile access</h4><p>{key.profileAccess === "selected" ? `Selected profiles: ${key.profileSlugs.join(", ")}` : "All profiles, including profiles added later."}</p></section><section><small>KEY LIFECYCLE</small><h3>{key.status}</h3><p>This credential can no longer authorize requests. Queues and tickets remain intact.</p><p>Revoked {formatDate(key.revokedAt)}. Secrets are never displayed in key history.</p></section></div></td></tr>}</Fragment>; }) : <tr><td colSpan={5}>No revoked or expired keys in this environment.</td></tr>}</tbody></table></div><div className="dpp-table-pagination developer-workspace-key-pagination"><Select label="Rows per page" data={["10", "25", "50"]} value={String(pageSize)} allowDeselect={false} onChange={(value) => { setPageSize(Number(value || 10)); setPage(0); setExpandedKeyId(null); }} comboboxProps={{ withinPortal: false }} classNames={{ dropdown: "dpp-select-dropdown", option: "dpp-select-option" }} /><span role="status">{historyKeys.length ? currentPage * pageSize + 1 : 0}–{Math.min((currentPage + 1) * pageSize, historyKeys.length)} of {historyKeys.length} · Page {currentPage + 1} of {pageCount}</span><div><Button type="button" variant="light" disabled={currentPage === 0} onClick={() => { setPage(currentPage - 1); setExpandedKeyId(null); }}>Previous</Button><Button type="button" variant="light" disabled={currentPage >= pageCount - 1} onClick={() => { setPage(currentPage + 1); setExpandedKeyId(null); }}>Next</Button></div></div></section>
  </section>;
}

function directoryStatusLabel(status: string) {
  return ({ private: "Private", draft: "Draft", pending_review: "Pending review", approved: "Published", changes_requested: "Changes requested", rejected: "Rejected", withdrawn: "Withdrawn", removed: "Removed" } as Record<string, string>)[status] || status;
}

function ProfileCreatePage({ busy, onCreateProfile, onBack }: { busy: string; onCreateProfile: (event: FormEvent<HTMLFormElement>) => void; onBack: () => void }) {
  return <section className="developer-workspace-panel dpp-section developer-workspace-profile-create-page">
    <div className="dpp-actions"><Button type="button" variant="subtle" onClick={onBack}>← Back to profiles</Button></div>
    <p className="developer-workspace-eyebrow">CREATE PROFILE</p>
    <h1>Create a profile</h1>
    <p>Profiles group queues and stay private by default. A profile does not appear in the customer directory unless a separate publication workflow is approved.</p>
    <Paper component="form" withBorder p="xl" onSubmit={onCreateProfile} className="developer-workspace-resource-card developer-workspace-profile-create-form">
      <div className="dpp-application-fields"><TextInput label="Profile name" name="displayName" required maxLength={120} placeholder="Harbor Service Centre" /><TextInput label="Profile slug" name="slug" required maxLength={64} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="harbor-service-centre" /></div>
      <Button type="submit" className="developer-workspace-primary" loading={busy === "profile"} leftSection={<IconPlus size={16} />}>Create profile</Button>
    </Paper>
  </section>;
}

function ProfilesPage({ profiles, onCreatePage, busy, onUpdateProfile, onDeleteProfile }: { project: Project; profiles: Profile[]; onCreatePage: () => void; busy: string; onUpdateProfile: (profile: Profile, event: FormEvent<HTMLFormElement>) => Promise<boolean>; onDeleteProfile: (profile: Profile) => void }) {
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  return <section className="developer-workspace-panel dpp-section developer-workspace-resources-page">
    <p className="developer-workspace-eyebrow">PROJECT / SANDBOX / API-MANAGED PROFILES</p>
    <h1>Profiles &amp; directory.</h1>
    <p>Your integration manages profiles through the API. Directory publication is optional and separate from private ticket tracking.</p>
    <div className="developer-workspace-resource-grid developer-workspace-profile-grid">
      <Paper withBorder p="xl" className="developer-workspace-resource-card developer-workspace-resource-summary">
        <div className="developer-workspace-resource-header"><div><p className="developer-workspace-eyebrow">PROFILE INVENTORY</p><h2>{profiles.length} private {profiles.length === 1 ? "profile" : "profiles"}</h2><p>Private queue operations remain available in Sandbox. The customer directory is independent from these API-managed resources.</p></div><Button type="button" className="developer-workspace-primary" onClick={onCreatePage} leftSection={<IconPlus size={16} />}>Create profile</Button></div>
        {profiles.length ? <div className="developer-workspace-profile-list">{profiles.map((profile) => {
          const editing = editingProfileId === profile.id;
          const content = profile.directoryContent || {};
          return editing ? <Paper component="form" withBorder p="lg" className="developer-workspace-profile-editor" key={profile.id} onSubmit={(event) => { event.preventDefault(); void onUpdateProfile(profile, event).then((saved) => { if (saved) setEditingProfileId(null); }); }}>
            <div className="developer-workspace-profile-editor-header"><div><strong>Edit {profile.displayName}</strong><small>Private metadata and directory draft</small></div><Button type="button" variant="subtle" size="compact-sm" aria-label="Cancel profile editing" onClick={() => setEditingProfileId(null)}><IconX size={16} /></Button></div>
            <TextInput label="Profile name" name="displayName" defaultValue={profile.displayName} required maxLength={120} />
            <TextInput label="Profile slug" value={profile.slug} readOnly description="Slugs are immutable because API integrations use them in URLs." />
            <Textarea label="Directory description" name="directoryDescription" defaultValue={content.description || ""} maxLength={1000} minRows={3} description="Saving directory details creates a draft for review; it does not publish it." />
            <TextInput label="Website URL" name="websiteUrl" type="url" defaultValue={content.websiteUrl || ""} placeholder="https://example.com" />
            <div className="developer-workspace-profile-editor-footer"><Badge color={profile.directoryStatus === "approved" ? "green" : "blue"} variant="light" radius="xl">{directoryStatusLabel(profile.directoryStatus)}</Badge><div className="developer-workspace-inline-actions"><Button type="button" variant="subtle" onClick={() => setEditingProfileId(null)}>Cancel</Button><Button type="submit" loading={busy === `profile-${profile.id}`}>Save draft</Button></div></div>
          </Paper> : <div className="dpp-row" key={profile.id}><div><strong>{profile.displayName}</strong><p><code>{profile.slug}</code></p><small>Private Sandbox profile · Directory {directoryStatusLabel(profile.directoryStatus).toLowerCase()}</small></div><div className="developer-workspace-profile-row-actions"><Badge color={profile.directoryStatus === "approved" ? "green" : "blue"} variant="light" radius="xl">{directoryStatusLabel(profile.directoryStatus)}</Badge><Button type="button" variant="subtle" size="compact-sm" onClick={() => setEditingProfileId(profile.id)} leftSection={<IconPencil size={15} />}>Edit</Button><Button type="button" variant="subtle" color="red" size="compact-sm" onClick={() => onDeleteProfile(profile)}>Delete</Button></div></div>;
        })}</div> : <Empty title="No profiles yet">Create a private profile to start modeling your Sandbox resources.</Empty>}
      </Paper>
    </div>
  </section>;
}

type QueueTicketRecord = Pick<DeveloperTicket, "id" | "ticketNumber" | "displayLabel" | "status">;
type QueueTicketRow = { ticket: QueueTicketRecord; label: string; ahead: string; tracking: string };
const demoTicketRows: QueueTicketRow[] = [
  { ticket: { id: "demo-a-023", ticketNumber: "A-023", displayLabel: "A-023", status: "called" }, label: "A-023", ahead: "—", tracking: "Linked to GetPrio" },
  { ticket: { id: "demo-a-024", ticketNumber: "A-024", displayLabel: "A-024", status: "waiting" }, label: "A-024", ahead: "0", tracking: "Not linked" },
  { ticket: { id: "demo-a-025", ticketNumber: "A-025", displayLabel: "A-025", status: "waiting" }, label: "A-025", ahead: "1", tracking: "Linked to GetPrio" }
];

function QueueCreatePage({ profiles, selectedProfileValue, busy, onCreateQueue, onBack }: { profiles: Profile[]; selectedProfileValue: Profile | null; busy: string; onCreateQueue: (event: FormEvent<HTMLFormElement>) => void; onBack: () => void }) {
  return <section className="developer-workspace-panel dpp-section developer-workspace-queue-create-page">
    <div className="dpp-actions"><Button type="button" variant="subtle" onClick={onBack}>← Back to queues</Button></div>
    <p className="developer-workspace-eyebrow">{selectedProfileValue?.displayName.toUpperCase() || "PROFILE"} / QUEUE SETUP</p>
    <h1>Create a queue</h1>
    <p>Queues hold ticket order for this profile. Configure the initial session state and intake behavior.</p>
    {!profiles.length ? <Paper withBorder p="xl" className="developer-workspace-resource-card"><h2>Create a profile first</h2><p>Queues belong to a private profile. Create one before adding a queue.</p></Paper> : <>
      <Paper component="form" withBorder p="xl" onSubmit={onCreateQueue} className="developer-workspace-resource-card developer-workspace-queue-form">
        <div className="dpp-application-fields"><TextInput label="Queue name" name="displayName" required maxLength={120} placeholder="Main service desk" /><TextInput label="Queue slug" name="slug" required maxLength={64} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="main-service-desk" /><Select label="Initial state" name="sessionState" defaultValue="closed" data={[{ value: "closed", label: "Closed" }, { value: "open", label: "Open" }, { value: "paused", label: "Paused" }]} comboboxProps={{ withinPortal: false }} classNames={{ dropdown: "dpp-select-dropdown", option: "dpp-select-option" }} /><Switch className="developer-workspace-intake-switch" name="intakeEnabled" label="Allow ticket intake" /></div>
        <Button type="submit" className="developer-workspace-primary" loading={busy === "queue"} leftSection={<IconPlus size={16} />}>Create queue</Button>
      </Paper>
    </>}
  </section>;
}

function QueuesPage({ profiles, selectedProfile, selectedProfileValue, queues, snapshots = [], busy, onProfileChange, onCreatePage, onUpdateQueue, onDeleteQueue }: { profiles: Profile[]; selectedProfile: string; selectedProfileValue: Profile | null; queues: Queue[]; snapshots?: QueueSnapshot[]; busy: string; onProfileChange: (value: string) => void; onCreatePage: () => void; onUpdateQueue: (queue: Queue, event: FormEvent<HTMLFormElement>) => Promise<boolean>; onDeleteQueue: (queue: Queue) => void }) {
  const [selectedQueueId, setSelectedQueueId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [expandedTickets, setExpandedTickets] = useState<string[]>([]);
  const [editingQueueId, setEditingQueueId] = useState<string | null>(null);
  const selectedQueue = queues.find((queue) => queue.id === selectedQueueId) || queues[0] || null;
  const selectedSnapshot = snapshots.find((snapshot) => snapshot.queue.id === selectedQueue?.id) || null;

  useEffect(() => {
    if (selectedQueueId && queues.some((queue) => queue.id === selectedQueueId)) return;
    setSelectedQueueId(queues[0]?.id || "");
  }, [queues, selectedQueueId]);

  useEffect(() => {
    setSearch("");
    setStatusFilter(null);
    setPageIndex(0);
    setExpandedTickets([]);
    setEditingQueueId(null);
  }, [selectedQueue?.id]);

  const liveTickets = selectedSnapshot ? [selectedSnapshot.current, ...selectedSnapshot.nextUp, ...selectedSnapshot.overflow, ...selectedSnapshot.skipped].filter((ticket): ticket is DeveloperTicket => Boolean(ticket)) : [];
  const showingSampleTickets = Boolean(selectedSnapshot && liveTickets.length === 0);
  const ticketRows = liveTickets.length ? liveTickets.map((ticket, index, all) => ({
    ticket,
    label: ticket.ticketNumber || ticket.displayLabel || ticket.id,
    ahead: ticket.status === "called" ? "—" : String(all.slice(0, index).filter((item) => item.status === "waiting").length),
    tracking: "Unavailable"
  })) : demoTicketRows;
  const waitingCount = showingSampleTickets ? demoTicketRows.filter((row) => row.ticket.status === "waiting").length : selectedSnapshot?.stats.waitingCount || 0;
  const calledCount = showingSampleTickets ? demoTicketRows.filter((row) => row.ticket.status === "called").length : selectedSnapshot?.stats.calledCount || 0;
  const query = search.trim().toLowerCase();
  const filteredTickets = ticketRows.filter((row) => `${row.label} ${row.ticket.status} ${selectedQueue?.displayName || ""} ${selectedProfileValue?.displayName || ""}`.toLowerCase().includes(query) && (!statusFilter || row.ticket.status === statusFilter));
  const pageCount = Math.max(1, Math.ceil(filteredTickets.length / pageSize));
  const currentPage = Math.min(pageIndex, pageCount - 1);
  const pageRows = filteredTickets.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const allExpanded = pageRows.length > 0 && pageRows.every((row) => expandedTickets.includes(row.ticket.id));
  const clearFilters = () => { setSearch(""); setStatusFilter(null); setPageIndex(0); setExpandedTickets([]); };
  const changeProfile = (value: string) => { onProfileChange(value); setSelectedQueueId(""); clearFilters(); };
  const changeQueue = (value: string | null) => { setSelectedQueueId(value || ""); clearFilters(); };

  return <section className="developer-workspace-panel dpp-section developer-workspace-queues-page">
    <p className="developer-workspace-eyebrow">PROJECT / SANDBOX / INSPECTION</p>
    <h1>Queues &amp; tickets.</h1>
    <p>Inspect queue order maintained by GetPrio and ticket updates from your integration. Queues belong to a private profile.</p>
    {!profiles.length ? <Paper withBorder p="xl" className="developer-workspace-resource-card"><h2>No queues in this environment.</h2><p>Create a profile first, then add its queue here.</p></Paper> : <>
      <Select className="developer-workspace-select" label="Profile" value={selectedProfile || null} onChange={(value) => changeProfile(value || "")} data={profiles.map((item) => ({ value: item.slug, label: `${item.displayName} · ${item.slug}` }))} comboboxProps={{ withinPortal: false }} classNames={{ dropdown: "dpp-select-dropdown", option: "dpp-select-option" }} />
      <section className="developer-workspace-resource-section"><div className="developer-workspace-resource-header"><div><p className="developer-workspace-eyebrow">CURRENT QUEUES</p><h2>{selectedProfileValue?.displayName || "Profile"}</h2><p>Queue state and intake settings for the selected profile.</p></div>{selectedProfileValue && <Button type="button" className="developer-workspace-primary" onClick={onCreatePage} leftSection={<IconPlus size={16} />}>Create queue</Button>}</div><div className="developer-workspace-queue-list">{queues.length ? queues.map((queue) => { const editing = editingQueueId === queue.id; return <Paper component="article" withBorder p="xl" key={queue.id}>{editing ? <form className="developer-workspace-queue-edit" onSubmit={async (event) => { event.preventDefault(); if (await onUpdateQueue(queue, event)) setEditingQueueId(null); }}><p className="developer-workspace-eyebrow">EDIT QUEUE</p><TextInput label="Queue name" name="displayName" defaultValue={queue.displayName} required maxLength={120} /><TextInput label="Queue slug" value={queue.slug} readOnly description="Queue slugs are permanent identifiers." /><Select label="State" name="sessionState" defaultValue={queue.sessionState} data={[{ value: "closed", label: "Closed" }, { value: "open", label: "Open" }, { value: "paused", label: "Paused" }, { value: "closing", label: "Closing" }]} comboboxProps={{ withinPortal: false }} classNames={{ dropdown: "dpp-select-dropdown", option: "dpp-select-option" }} /><Switch className="developer-workspace-intake-switch" name="intakeEnabled" label="Allow ticket intake" defaultChecked={queue.intakeEnabled} /><div className="developer-workspace-queue-actions"><Button type="button" variant="subtle" onClick={() => setEditingQueueId(null)}>Cancel</Button><Button type="submit" loading={busy === `queue-update-${queue.id}`} leftSection={<IconCheck size={16} />}>Save Changes</Button></div></form> : <><div><h3>{queue.displayName}</h3><p><code>{selectedProfileValue?.slug}/{queue.slug}</code></p><small>Intake {queue.intakeEnabled ? "enabled" : "disabled"} · priority ratio {queue.priorityRatio}:1</small></div><div className="developer-workspace-queue-actions"><Badge color={queue.sessionState === "open" ? "teal" : "gray"} variant="light" radius="xl">{queue.sessionState}</Badge><Button type="button" variant="light" onClick={() => setEditingQueueId(queue.id)}>Edit queue</Button><Button type="button" variant="subtle" color="red" onClick={() => onDeleteQueue(queue)}>Delete</Button></div></>}</Paper>; }) : <Empty title="No queues in this profile">Create a queue before issuing tickets with the API.</Empty>}</div></section>
      {selectedQueue && <section className="developer-workspace-resource-section developer-workspace-ticket-section">
        <div className="developer-workspace-resource-header"><div><p className="developer-workspace-eyebrow">CURRENT TICKETS</p><h2>Current tickets</h2><p>Expand a ticket for details. “Ahead” counts waiting tickets ahead, excluding the called ticket.</p></div><Select className="developer-workspace-ticket-queue-select" label="Queue" value={selectedQueue.id} onChange={changeQueue} data={queues.map((queue) => ({ value: queue.id, label: queue.displayName }))} comboboxProps={{ withinPortal: false }} classNames={{ dropdown: "dpp-select-dropdown", option: "dpp-select-option" }} /></div>
        {selectedSnapshot ? <>
          <Paper withBorder p="xl" className="developer-workspace-queue-snapshot"><p className="developer-workspace-eyebrow">{selectedProfileValue?.displayName.toUpperCase()} / {selectedQueue.displayName.toUpperCase()}</p><h3>{selectedQueue.displayName}</h3><div className="developer-workspace-ticket-snapshot-badges"><Badge color={selectedQueue.sessionState === "open" ? "blue" : "gray"} variant="light" radius="xl">{selectedQueue.sessionState} · Sandbox</Badge>{showingSampleTickets && <Badge color="yellow" variant="light" radius="xl">Demo data</Badge>}</div><p>Private integration · public directory listing off · GetPrio joining off</p><p>{waitingCount} waiting · {calledCount} called. {showingSampleTickets ? "Prototype sample order is shown until live tickets exist." : "Queue order is shown as a snapshot."}</p></Paper>
          <div className="dpp-ticket-filters"><TextInput label="Search" placeholder="Ticket, queue, or profile" value={search} onChange={(event) => { setSearch(event.currentTarget.value); setPageIndex(0); setExpandedTickets([]); }} /><Select label="Status" placeholder="All statuses" data={["called", "waiting", "skipped"]} value={statusFilter} onChange={(value) => { setStatusFilter(value); setPageIndex(0); setExpandedTickets([]); }} comboboxProps={{ withinPortal: false }} classNames={{ dropdown: "dpp-select-dropdown", option: "dpp-select-option" }} /><Select label="Mobile tracking" placeholder="Not connected" data={[]} disabled /></div>
          <div className="dpp-filter-summary"><span role="status">{filteredTickets.length} of {ticketRows.length} tickets</span><div><Button type="button" variant="subtle" disabled={!search && !statusFilter} onClick={clearFilters}>Clear filters</Button><Button type="button" variant="light" disabled={!filteredTickets.length} onClick={() => setExpandedTickets(allExpanded ? [] : pageRows.map((row) => row.ticket.id))}>{allExpanded ? "Collapse page" : "Expand page"}</Button></div></div>
          <p>Mobile tracking is not exposed by the Developer Portal API yet. On narrow screens, scroll horizontally to view every column.</p>{showingSampleTickets && <p className="developer-workspace-ticket-demo-note">Showing the prototype sample tickets until this queue receives live Sandbox tickets.</p>}
          <div className="dpp-delivery-table-wrap" role="region" aria-label="Current queue tickets" tabIndex={0}><table className="dpp-delivery-table developer-workspace-ticket-table"><caption>{selectedQueue.displayName} · Sandbox · {showingSampleTickets ? "sample tickets" : "current tickets"}</caption><thead><tr><th scope="col"><span className="dpp-sr-only">Expand ticket</span></th><th scope="col">Ticket</th><th scope="col">Status</th><th scope="col">Ahead</th><th scope="col">Mobile tracking</th><th scope="col">Queue</th></tr></thead><tbody>{!filteredTickets.length && <tr><td colSpan={6}><h3>No matching tickets</h3><p>Try another search or clear the filters.</p></td></tr>}{pageRows.map((row) => { const open = expandedTickets.includes(row.ticket.id); const toggle = () => setExpandedTickets(open ? expandedTickets.filter((id) => id !== row.ticket.id) : [...expandedTickets, row.ticket.id]); return <Fragment key={row.ticket.id}><tr className="dpp-delivery-parent" tabIndex={0} aria-expanded={open} aria-controls={`ticket-panel-${row.ticket.id}`} aria-label={`${row.label}, ${row.ticket.status}, ${row.tracking}`} onClick={toggle} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); } }}><td><span className={`dpp-row-chevron${open ? " is-open" : ""}`} aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span></td><th scope="row">{row.label}</th><td><Badge color={row.ticket.status === "called" ? "teal" : "blue"} variant="light" radius="xl">{row.ticket.status}</Badge></td><td>{row.ahead}</td><td>{row.tracking}</td><td>{selectedQueue.displayName}</td></tr>{open && <tr className="dpp-delivery-note"><td colSpan={6}><div className="dpp-webhook-detail" id={`ticket-panel-${row.ticket.id}`}><section><small>TICKET DETAILS / SANDBOX</small><h3>{row.label}</h3><dl><div><dt>Status</dt><dd>{row.ticket.status}</dd></div><div><dt>Waiting tickets ahead</dt><dd>{row.ahead}</dd></div><div><dt>Profile</dt><dd>{selectedProfileValue?.displayName || "Private profile"}</dd></div><div><dt>Queue</dt><dd>{selectedQueue.displayName}</dd></div></dl><p>Ticket labels are for display. API operations identify tickets by their opaque ticket ID.</p></section><section><small>CUSTOMER TRACKING</small><h3>{showingSampleTickets ? row.tracking : "Unavailable"}</h3><p>{showingSampleTickets ? "This is prototype sample data for UI review; no customer details are shown." : "Mobile account linking is not exposed in this portal yet, so no customer details are shown here."}</p><p>Lifecycle updates come from the developer’s software. This inspection view does not call, serve, skip or cancel tickets.</p></section></div></td></tr>}</Fragment>; })}</tbody></table></div>
          <div className="dpp-table-pagination developer-workspace-ticket-pagination"><Select label="Rows per page" data={["10", "25", "50"]} value={String(pageSize)} allowDeselect={false} onChange={(value) => { setPageSize(Number(value || 10)); setPageIndex(0); setExpandedTickets([]); }} comboboxProps={{ withinPortal: false }} classNames={{ dropdown: "dpp-select-dropdown", option: "dpp-select-option" }} /><span role="status">{filteredTickets.length ? currentPage * pageSize + 1 : 0}–{Math.min((currentPage + 1) * pageSize, filteredTickets.length)} of {filteredTickets.length}</span><div><Button type="button" variant="light" disabled={currentPage === 0} onClick={() => { setPageIndex(currentPage - 1); setExpandedTickets([]); }}>Previous</Button><Button type="button" variant="light" disabled={currentPage >= pageCount - 1} onClick={() => { setPageIndex(currentPage + 1); setExpandedTickets([]); }}>Next</Button></div></div>
        </> : <Empty title="Current tickets unavailable">The selected queue snapshot could not be loaded. Refresh the page to try again.</Empty>}
      </section>}
    </>}
  </section>;
}

type DeliveryRow = { id: string; event: string; status: string; http: string; attempts: number; retry: string; version: string; live: Delivery | null };
const demoDeliveryTemplates = [
  { status: "Delivered", http: "204", attempts: 1, retry: "None — receiver returned success." },
  { status: "Retry scheduled", http: "503", attempts: 2, retry: "Automatic retry is pending within the original 24-hour delivery window." },
  { status: "Failed", http: "Timeout", attempts: 8, retry: "Automatic retry window ended. Manual replay requires retained payload and an enabled registration." }
];
const demoDeliveryEvents = ["Ticket called", "Ticket issued", "Ticket cancelled", "Ticket served", "Ticket skipped"];
const demoDeliveries: DeliveryRow[] = Array.from({ length: 127 }, (_, index) => {
  const template = demoDeliveryTemplates[index % demoDeliveryTemplates.length];
  return { ...template, id: `delivery-demo-${String(127 - index).padStart(3, "0")}`, event: demoDeliveryEvents[index % demoDeliveryEvents.length], version: "v1", live: null };
});

function deliveryStatusLabel(status: string) {
  return ({ sent: "Delivered", retry: "Retry scheduled", failed: "Failed", pending: "Pending", processing: "Processing" } as Record<string, string>)[status] || status;
}
function deliveryColor(status: string) {
  const normalized = status.toLowerCase();
  return normalized.includes("deliver") || normalized === "sent" ? "teal" : normalized.includes("fail") ? "red" : "blue";
}
function liveDeliveryRow(delivery: Delivery): DeliveryRow {
  const status = deliveryStatusLabel(delivery.status);
  return {
    id: delivery.eventId,
    event: delivery.eventType,
    status,
    http: delivery.responseStatus == null ? (delivery.status === "retry" ? "503" : "No response") : String(delivery.responseStatus),
    attempts: delivery.attemptCount,
    retry: delivery.lastError || (delivery.status === "sent" ? "None — receiver returned success." : delivery.status === "retry" ? "Automatic retry is scheduled within the retained delivery window." : "Automatic retry state is retained for this delivery."),
    version: `v${delivery.payloadVersion}`,
    live: delivery
  };
}

function WebhookCreatePage({ busy, onCreate, onBack, onDirtyChange }: { busy: string; onCreate: (event: FormEvent<HTMLFormElement>) => void; onBack: () => void; onDirtyChange: (dirty: boolean) => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  useEffect(() => { onDirtyChange(Boolean(name.trim() || url.trim() || selectedEvents.length)); }, [name, onDirtyChange, selectedEvents.length, url]);
  return <section className="developer-workspace-panel dpp-section developer-workspace-webhook-create-page">
    <div className="dpp-actions"><Button type="button" variant="subtle" onClick={onBack}>← Back to Webhooks</Button></div>
    <p className="developer-workspace-eyebrow">CREATE WEBHOOK</p>
    <h1>Register an event receiver.</h1>
    <p>Use a public HTTPS endpoint you control. Receiver access is independent of your API-key permissions.</p>
    <Paper component="form" withBorder p="xl" onSubmit={onCreate} className="developer-workspace-resource-card developer-workspace-webhook-form">
      <p className="developer-workspace-eyebrow">01 / EVENT RECEIVER</p>
      <h2>Register an event receiver</h2>
      <div className="dpp-application-fields"><TextInput label="Destination URL" name="url" type="url" required placeholder="https://example.com/getprio/webhooks" value={url} onChange={(event) => setUrl(event.currentTarget.value)} /><Select label="Payload version" data={[{ value: "1", label: "v1" }]} value="1" readOnly comboboxProps={{ withinPortal: false }} classNames={{ dropdown: "dpp-select-dropdown", option: "dpp-select-option" }} /></div>
      <TextInput label="Receiver name" name="name" required maxLength={80} placeholder="Production event listener" value={name} onChange={(event) => setName(event.currentTarget.value)} />
      <fieldset className="dpp-key-permissions"><legend>Subscribed events</legend><p>Select at least one event to receive.</p>{webhookEvents.map((eventName) => <label key={eventName}><input type="checkbox" name={eventName} checked={selectedEvents.includes(eventName)} onChange={(event) => setSelectedEvents(event.currentTarget.checked ? [...selectedEvents, eventName] : selectedEvents.filter((value) => value !== eventName))} /><span>{eventName}</span></label>)}</fieldset>
      <p className="developer-workspace-key-note">Secrets are shown once. Store the signing secret on your backend and use it to verify incoming requests.</p>
      <Button type="submit" className="developer-workspace-primary" loading={busy === "webhook"} disabled={!selectedEvents.length || busy === "webhook"} leftSection={<IconWebhook size={16} />}>Create webhook</Button>
    </Paper>
  </section>;
}

function WebhooksPage({ webhooks, selectedWebhook, selectedWebhookValue, deliveries, busy, onWebhookChange, onCreatePage, onRotate, onCompromised, onDisable, onRefresh, onReplay }: { project: Project; webhooks: Webhook[]; selectedWebhook: string; selectedWebhookValue: Webhook | null; deliveries: Delivery[]; busy: string; onWebhookChange: (value: string) => void; onCreatePage: () => void; onRotate: (webhook: Webhook) => void; onCompromised: (webhook: Webhook) => void; onDisable: (webhook: Webhook) => void; onRefresh: () => void; onReplay: (delivery: Delivery) => void }) {
  const [expandedDeliveryIds, setExpandedDeliveryIds] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [versionFilter, setVersionFilter] = useState<string | null>(null);
  const showingSampleDeliveries = deliveries.length === 0;
  const deliveryRows = showingSampleDeliveries ? demoDeliveries : deliveries.map(liveDeliveryRow);
  const query = search.trim().toLowerCase();
  const filteredDeliveries = deliveryRows.filter((row) => (!query || `${row.id} ${row.event} ${row.status} ${row.http} ${row.version}`.toLowerCase().includes(query)) && (!eventFilter || row.event === eventFilter) && (!statusFilter || row.status === statusFilter) && (!versionFilter || row.version === versionFilter));
  const pageCount = Math.max(1, Math.ceil(filteredDeliveries.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filteredDeliveries.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const allVisibleExpanded = pageRows.length > 0 && pageRows.every((row) => expandedDeliveryIds.includes(row.id));
  const resetPage = () => { setPage(0); setExpandedDeliveryIds([]); };
  useEffect(() => { setPage(0); setExpandedDeliveryIds([]); }, [selectedWebhook]);
  return <section className="developer-workspace-panel dpp-section developer-workspace-webhooks-page">
    <p className="developer-workspace-eyebrow">PROJECT / SANDBOX / DELIVERY INSPECTION</p>
    <h1>Webhooks.</h1>
    <p>Register an event receiver, then inspect delivery outcomes for your integration. Signing secrets are only shown after creation or rotation.</p>
    <section className="developer-workspace-resource-section"><div className="developer-workspace-resource-header"><div><p className="developer-workspace-eyebrow">01 / REGISTRATIONS</p><h2>Event receivers.</h2><p>Registrations keep their environment, payload version, subscribed events, and signing-secret lifecycle.</p></div><Button type="button" className="developer-workspace-primary" onClick={onCreatePage} leftSection={<IconPlus size={16} />}>Create webhook</Button></div>{webhooks.length ? <div className="developer-workspace-webhook-list">{webhooks.map((webhook) => <Paper component="article" withBorder p="xl" key={webhook.id}><div className="developer-workspace-resource-header"><div><h3>{webhook.name}</h3><p><code>{webhook.url}</code></p></div><Badge color={webhook.status === "active" ? "teal" : "red"} variant="light" radius="xl">{webhook.status}</Badge></div><p>Sandbox · v{webhook.payloadVersion} · {webhook.events.length} subscribed events</p><p className="developer-workspace-webhook-events">{webhook.events.join(" · ")}</p>{webhook.status === "active" && <div className="developer-workspace-inline-actions"><Button type="button" variant="light" onClick={() => onRotate(webhook)}>Rotate secret</Button><Button type="button" variant="light" color="red" onClick={() => onCompromised(webhook)}>Replace compromised</Button><Button type="button" variant="light" color="red" onClick={() => onDisable(webhook)}>Disable</Button></div>}</Paper>)}</div> : <Empty title="No webhooks yet">Create one to receive ticket lifecycle events from Sandbox.</Empty>}</section>
    <section className="developer-workspace-resource-section developer-workspace-delivery-section"><div className="developer-workspace-resource-header"><div><p className="developer-workspace-eyebrow">02 / DELIVERY HISTORY</p><h2>Recent deliveries</h2><p>{showingSampleDeliveries ? "127 fictional deliveries for testing pagination. Expand a delivery to inspect its attempts and retry status." : `${selectedWebhookValue?.name || "Selected receiver"} · expand a row to inspect its attempts and retry state.`}</p></div><div className="developer-workspace-inline-actions">{webhooks.length > 0 && <Select aria-label="Webhook" value={selectedWebhook || null} onChange={(value) => onWebhookChange(value || "")} data={webhooks.map((item) => ({ value: item.id, label: item.name }))} comboboxProps={{ withinPortal: false }} classNames={{ dropdown: "dpp-select-dropdown", option: "dpp-select-option" }} />}{webhooks.length > 0 && <Button type="button" variant="light" leftSection={<IconRefresh size={15} />} onClick={onRefresh}>Refresh</Button>}</div></div>{showingSampleDeliveries && <p className="developer-workspace-ticket-demo-note">Showing prototype sample data until this receiver has live Sandbox deliveries.</p>}<div className="dpp-webhook-filters"><TextInput label="Search" placeholder="Delivery ID, event, or HTTP result" value={search} onChange={(event) => { setSearch(event.currentTarget.value); resetPage(); }} /><Select label="Event" placeholder="All events" data={[...new Set(deliveryRows.map((row) => row.event))]} value={eventFilter} onChange={(value) => { setEventFilter(value); resetPage(); }} comboboxProps={{ withinPortal: false }} classNames={{ dropdown: "dpp-select-dropdown", option: "dpp-select-option" }} /><Select label="Status" placeholder="All statuses" data={[...new Set(deliveryRows.map((row) => row.status))]} value={statusFilter} onChange={(value) => { setStatusFilter(value); resetPage(); }} comboboxProps={{ withinPortal: false }} classNames={{ dropdown: "dpp-select-dropdown", option: "dpp-select-option" }} /><Select label="Version" placeholder="All versions" data={[...new Set(deliveryRows.map((row) => row.version))]} value={versionFilter} onChange={(value) => { setVersionFilter(value); resetPage(); }} comboboxProps={{ withinPortal: false }} classNames={{ dropdown: "dpp-select-dropdown", option: "dpp-select-option" }} /></div><div className="dpp-filter-summary"><span role="status">{filteredDeliveries.length} of {deliveryRows.length} deliveries</span><div><Button type="button" variant="subtle" disabled={!search && !eventFilter && !statusFilter && !versionFilter} onClick={() => { setSearch(""); setEventFilter(null); setStatusFilter(null); setVersionFilter(null); resetPage(); }}>Clear filters</Button><Button type="button" variant="light" disabled={!filteredDeliveries.length} onClick={() => setExpandedDeliveryIds(allVisibleExpanded ? [] : pageRows.map((row) => row.id))}>{allVisibleExpanded ? "Collapse page" : "Expand page"}</Button></div></div><p className="dpp-table-scroll-hint">On narrow screens, scroll horizontally to view every column.</p><div className="dpp-delivery-table-wrap" role="region" aria-label="Recent webhook deliveries" tabIndex={0}><table className="dpp-delivery-table developer-workspace-delivery-table"><caption>Recent deliveries · Sandbox · {showingSampleDeliveries ? "fictional attempt history" : "delivery history"}</caption><thead><tr><th scope="col"><span className="dpp-sr-only">Expand delivery</span></th><th scope="col">Delivery / attempt</th><th scope="col">Event</th><th scope="col">Status</th><th scope="col">HTTP result</th><th scope="col">Attempts</th><th scope="col">Version</th></tr></thead><tbody>{!filteredDeliveries.length && <tr><td colSpan={7}><h3>No matching deliveries</h3><p>Try another search or clear the filters.</p></td></tr>}{pageRows.map((row) => { const open = expandedDeliveryIds.includes(row.id); const toggle = () => setExpandedDeliveryIds((current) => open ? current.filter((id) => id !== row.id) : [...current, row.id]); return <Fragment key={row.id}><tr className="dpp-delivery-parent" tabIndex={0} aria-expanded={open} aria-controls={`delivery-${row.id}`} aria-label={`${row.id}, ${row.event}, ${row.status}`} onClick={toggle} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); } }}><td><span className={`dpp-row-chevron${open ? " is-open" : ""}`} aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span></td><th scope="row">{row.id}</th><td>{row.event}</td><td><Badge color={deliveryColor(row.status)} variant="light" radius="xl">{row.status}</Badge></td><td>{row.http}</td><td>{row.attempts}</td><td>{row.version}</td></tr>{open && <tr className="dpp-delivery-note"><td colSpan={7}><div className="dpp-webhook-detail" id={`delivery-${row.id}`}><section><small>DELIVERY ATTEMPTS</small><h3>Attempt history</h3>{row.attempts > 0 ? <ol className="dpp-webhook-attempts">{Array.from({ length: row.attempts }, (_, index) => <li key={index}><strong>Attempt {index + 1}{index === row.attempts - 1 ? " · latest" : ""}</strong><span>{row.http === "204" ? "HTTP 204 · accepted" : row.http === "503" ? "HTTP 503 · receiver unavailable" : row.http === "Timeout" ? "Timed out · no response" : row.http === "No response" ? "No response recorded" : `HTTP ${row.http}`}</span></li>)}</ol> : <p>No attempts have been recorded yet.</p>}</section><section><small>DELIVERY DETAILS</small><h3>{row.status}</h3><p>{row.retry}</p><dl><div><dt>Environment</dt><dd>Sandbox</dd></div><div><dt>Webhook version</dt><dd>{row.version}</dd></div><div><dt>Last response</dt><dd>{row.http}</dd></div></dl><p>HTTP 2xx confirms delivery. Your receiver must handle duplicate events safely.</p><p>Manual replay sends one attempt without restarting automatic retries or charging another ticket credit.</p>{showingSampleDeliveries ? <small>Sample data only · no payloads or signing secrets shown</small> : row.live && <Button type="button" variant="light" disabled={row.live.status === "processing"} loading={busy === `replay-${row.live.id}`} onClick={(event) => { event.stopPropagation(); onReplay(row.live as Delivery); }}>Replay delivery</Button>}</section></div></td></tr>}</Fragment>; })}</tbody></table></div><div className="dpp-table-pagination"><Select label="Rows per page" data={["10", "25", "50"]} value={String(pageSize)} allowDeselect={false} onChange={(value) => { setPageSize(Number(value || 10)); resetPage(); }} comboboxProps={{ withinPortal: false }} classNames={{ dropdown: "dpp-select-dropdown", option: "dpp-select-option" }} /><span role="status">{filteredDeliveries.length ? currentPage * pageSize + 1 : 0}–{Math.min((currentPage + 1) * pageSize, filteredDeliveries.length)} of {filteredDeliveries.length}</span><div><Button type="button" variant="light" disabled={currentPage === 0} onClick={() => { setPage(currentPage - 1); setExpandedDeliveryIds([]); }}>Previous</Button><Button type="button" variant="light" disabled={currentPage >= pageCount - 1} onClick={() => { setPage(currentPage + 1); setExpandedDeliveryIds([]); }}>Next</Button></div></div><p>Expand a delivery to view its attempt history and retry details. HTTP 2xx confirms delivery; receivers must handle duplicate events safely.</p><p>Manual replay sends one attempt without restarting automatic retries or charging another ticket credit. This preview sends no requests.</p></section>
  </section>;
}

function UsagePage({ project, allowance, usage }: { project: Project; allowance: SandboxAllowance | null; usage: UsageReport | null }) {
  const summary = usage?.summary || { issuedTickets: 0, activeTickets: 0, completedTickets: 0 };
  return <section className="developer-workspace-panel dpp-section developer-workspace-usage-page">
    <p className="developer-workspace-eyebrow">PROJECT / SANDBOX / USAGE</p>
    <h1>Every ticket accounted for.</h1>
    <p>{project.name} · Sandbox · usage history</p>
    <Allowance value={usage?.allowance || allowance} />
    <div className="developer-workspace-usage-stats dpp-stats">
      <Paper withBorder className="developer-workspace-dashboard-card"><p className="developer-workspace-eyebrow">ISSUED TICKETS</p><strong>{summary.issuedTickets}</strong><p>Tickets issued through Sandbox</p></Paper>
      <Paper withBorder className="developer-workspace-dashboard-card"><p className="developer-workspace-eyebrow">ACTIVE TICKETS</p><strong>{summary.activeTickets}</strong><p>Waiting or currently called</p></Paper>
      <Paper withBorder className="developer-workspace-dashboard-card"><p className="developer-workspace-eyebrow">COMPLETED TICKETS</p><strong>{summary.completedTickets}</strong><p>Tickets with a terminal state</p></Paper>
    </div>
    <Paper withBorder p="xl" className="developer-workspace-usage-history">
      <p className="developer-workspace-eyebrow">USAGE HISTORY</p>
      <h2>{summary.issuedTickets ? "Sandbox activity" : "No issued tickets yet."}</h2>
      <p>{summary.issuedTickets ? "Each row is backed by a ticket issued through your Sandbox integration. One successfully issued ticket consumes one test credit." : "Your usage history will appear here after you issue a ticket through your Sandbox integration. One successfully issued ticket consumes one test credit."}</p>
      {usage && usage.daily.length > 0 && <div className="dpp-delivery-table-wrap developer-workspace-usage-table-wrap" role="region" aria-label="Daily Sandbox ticket usage" tabIndex={0}><table className="dpp-delivery-table developer-workspace-usage-table"><caption>Daily ticket issuance · Sandbox</caption><thead><tr><th scope="col">Date (UTC)</th><th scope="col">Tickets issued</th></tr></thead><tbody>{usage.daily.map((day) => <tr key={day.date}><th scope="row">{day.date}</th><td>{day.issuedTickets}</td></tr>)}</tbody></table></div>}
      {usage && usage.recentTickets.length > 0 && <div className="dpp-delivery-table-wrap developer-workspace-usage-table-wrap" role="region" aria-label="Recent Sandbox tickets" tabIndex={0}><table className="dpp-delivery-table developer-workspace-usage-table"><caption>Recent tickets · Sandbox</caption><thead><tr><th scope="col">Ticket</th><th scope="col">Status</th><th scope="col">Issued</th></tr></thead><tbody>{usage.recentTickets.map((ticket) => <tr key={ticket.id}><th scope="row">{ticket.ticketNumber}</th><td><Badge color={ticket.status === "waiting" || ticket.status === "called" ? "blue" : "gray"} variant="light" radius="xl">{ticket.status}</Badge></td><td>{formatDate(ticket.createdAt)}</td></tr>)}</tbody></table></div>}
      {!usage && <p role="status">Loading usage details…</p>}
      <dl className="developer-workspace-usage-rules"><div><dt>Consumes a credit</dt><dd>Successful ticket issuance</dd></div><div><dt>No additional charge</dt><dd>Reading, linking, and ordinary lifecycle updates</dd></div><div><dt>Allowance</dt><dd>Resets daily at 00:00 UTC without rollover</dd></div></dl>
      <p>Usage is scoped to this project and Sandbox environment. Customer details and API secrets are never shown in this view.</p>
    </Paper>
  </section>;
}

function Readiness({ session }: { session: Session }) {
  return <section className="developer-workspace-panel dpp-section"><p className="developer-workspace-eyebrow">MOVE AT YOUR OWN PACE</p><h1>Ready for real customers?</h1><p>Production access requires three independent conditions. Sandbox access does not grant production access.</p><div className="developer-workspace-readiness">
    <article><div><h3>Personal authenticator MFA</h3><p>{session.user.mfaEnabled ? "MFA is enabled for this person." : "This person must set up MFA before using production tools."}</p></div><Badge color={session.user.mfaEnabled ? "teal" : "yellow"} variant="light" radius="xl">{session.user.mfaEnabled ? "Ready" : "Action needed"}</Badge></article>
    <article><div><h3>Project approval</h3><p>Production applications and Platform Admin review are not available in this local portal. No production approval has been granted here.</p></div><Badge color="gray" variant="light" radius="xl">Unavailable</Badge></article>
    <article><div><h3>Prepaid ticket credits</h3><p>Production checkout and wallet balances are not connected. A Sandbox allowance cannot pay for production tickets.</p></div><Badge color="gray" variant="light" radius="xl">Unavailable</Badge></article>
  </div><p>Existing production ticket operations and new ticket issuance will follow separate access and balance rules when production is enabled.</p></section>;
}

function AccountPageShell({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return <section className="developer-workspace-panel dpp-section developer-workspace-account-page"><p className="developer-workspace-eyebrow">{eyebrow}</p><h1>{title}</h1>{children}</section>;
}

function BillingPage() {
  return <AccountPageShell eyebrow="ACCOUNT / OWNER ACCESS" title="Your API wallet.">
    <p>Shared across projects. Production credits never expire. Monthly project fees are billed separately.</p>
    <div className="dpp-stats developer-workspace-account-stats">
      <Paper withBorder p="lg" className="developer-workspace-account-card"><p className="developer-workspace-eyebrow">AVAILABLE TO USE</p><strong>—</strong><p>Production wallet is not connected</p></Paper>
      <Paper withBorder p="lg" className="developer-workspace-account-card"><p className="developer-workspace-eyebrow">PURCHASED / AVAILABLE</p><strong>—</strong><p>Credit purchases are not connected</p></Paper>
      <Paper withBorder p="lg" className="developer-workspace-account-card"><p className="developer-workspace-eyebrow">COMPLIMENTARY / AVAILABLE</p><strong>—</strong><p>Complimentary credits are not connected</p></Paper>
    </div>
    <Paper withBorder p="xl" className="developer-workspace-account-prototype-card"><h2>Reserved for refund review</h2><p>Production wallet reservations are not available in this local Developer Portal. A reservation is not a completed refund.</p><Badge color="gray" variant="light" radius="xl">Unavailable</Badge></Paper>
    <section className="dpp-section"><h2>Transaction history</h2><TextInput label="Search transactions" placeholder="Reference, type, or project" disabled /><Paper withBorder p="xl" mt="lg" className="developer-workspace-account-prototype-card"><h3>No transactions yet</h3><p>Your confirmed credit purchases and wallet activity will appear here when production billing is connected.</p></Paper></section>
    <section className="dpp-section"><h2>Payment status preview</h2><p>Payment confirmation is not connected. Credits remain unavailable until a verified payment contract exists.</p><Paper withBorder p="xl" className="developer-workspace-account-prototype-card"><p className="developer-workspace-eyebrow">PAYMENT STATUS</p><h3>Not connected</h3><p>Returning from checkout or closing its page will not be treated as payment confirmation.</p></Paper></section>
  </AccountPageShell>;
}

function SubscriptionsPage({ projects }: { projects: Project[] }) {
  return <AccountPageShell eyebrow="ACCOUNT / OWNER ACCESS" title="Project subscriptions.">
    <p>One project is included. Additional projects have a separate monthly maintenance fee, paid in pesos.</p>
    <Paper withBorder p="xl" className="developer-workspace-account-prototype-card"><Badge color="blue" variant="light" radius="xl">INCLUDED</Badge><h2>{projects[0]?.name || "Included project"}</h2><p>Your included project uses the shared API credit wallet. Production approval is still required.</p></Paper>
    <section className="dpp-section"><h2>Estimate additional projects</h2><p>This is a monthly price preview. It does not add projects or start a subscription.</p><Select label="Additional projects" data={[{ value: "0", label: "None — included project only" }, { value: "1", label: "1 additional project" }, { value: "2", label: "2 additional projects" }]} value="0" disabled comboboxProps={{ withinPortal: false }} classNames={{ dropdown: "dpp-select-dropdown", option: "dpp-select-option" }} /><div className="dpp-stats developer-workspace-account-stats"><Paper withBorder p="lg" className="developer-workspace-account-card"><p className="developer-workspace-eyebrow">TOTAL PROJECTS</p><strong>{projects.length}</strong><p>{projects.length} active Sandbox project{projects.length === 1 ? "" : "s"}</p></Paper><Paper withBorder p="lg" className="developer-workspace-account-card"><p className="developer-workspace-eyebrow">MONTHLY MAINTENANCE TOTAL</p><strong>—</strong><p>Production pricing is not connected</p></Paper><Paper withBorder p="lg" className="developer-workspace-account-card"><p className="developer-workspace-eyebrow">TICKET CREDITS INCLUDED</p><strong>—</strong><p>Purchase credits separately when billing is connected</p></Paper></div><Paper withBorder p="xl" className="developer-workspace-account-prototype-card"><h2>Before adding a project</h2><p>Checkout will show the amount due for the remaining billing period and the next renewal total before payment. This monthly estimate is not a checkout quote.</p><p>Reductions take effect at renewal without an automatic current-term refund. Existing tickets remain serviceable.</p><p>More than five total projects requires Platform Admin review and an explicitly accepted price.</p></Paper></section>
    <section className="dpp-section"><h2>Monthly billing status</h2><p>Production billing is not connected, so no subscription status is available.</p><Paper withBorder p="xl" className="developer-workspace-account-prototype-card"><p className="developer-workspace-eyebrow">SHARED MONTHLY MAINTENANCE</p><h3>Not connected</h3><p>Maintenance charges never deduct ticket credits.</p></Paper></section>
  </AccountPageShell>;
}

function TeamSecurityPage({ session }: { session: Session }) {
  return <AccountPageShell eyebrow="ACCOUNT / OWNER ACCESS" title="Team & security.">
    <p>Three people total, including you. Pending invitations reserve a seat.</p>
    <Paper withBorder p="xl" className="developer-workspace-account-prototype-card"><p className="developer-workspace-eyebrow">SEATS USED OR RESERVED</p><h2>1 / 3</h2><p>1 owner · 0 active members · 0 pending invitations</p><p>Team invitations are not connected in this workspace, so no invitation is sent.</p></Paper>
    <section className="dpp-section"><h2>Your account security</h2><Paper withBorder p="xl" className="developer-workspace-account-prototype-card"><h3>{session.user.email} · You</h3><Badge color="blue" variant="light" radius="xl">OWNER</Badge><p>{session.user.emailVerified ? "Email verified" : "Email not verified"} · MFA {session.user.mfaEnabled ? "set up" : "not set up"}</p><p>{session.user.mfaEnabled ? "Your personal MFA requirement is satisfied. Project approval is still required for production." : "You can use Sandbox. Set up your own MFA before accessing production tools."}</p></Paper></section>
    <section className="dpp-section"><h2>Members and invitations</h2><Paper withBorder p="xl" className="developer-workspace-account-prototype-card"><h3>No members or pending invitations yet.</h3><p>Two seats are available. Member invitations and per-member project access are not connected to the local backend.</p></Paper></section>
  </AccountPageShell>;
}

export default function DeveloperWorkspace({ session, accountContent, light = false }: Props) {
  const initialLocation = workspaceLocation();
  const [section, setSection] = useState<Section>(initialLocation.section);
  const [environment, setEnvironment] = useState<Environment>(initialLocation.environment);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [queueSnapshots, setQueueSnapshots] = useState<QueueSnapshot[]>([]);
  const [selectedProfile, setSelectedProfile] = useState("");
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [allowance, setAllowance] = useState<SandboxAllowance | null>(null);
  const [testAccounts, setTestAccounts] = useState<SandboxTestAccount[]>([]);
  const [usage, setUsage] = useState<UsageReport | null>(null);
  const [selectedWebhook, setSelectedWebhook] = useState("");
  const [secret, setSecret] = useState<{ label: string; value: string; warning: string } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [keyCreateDirty, setKeyCreateDirty] = useState(false);
  const [webhookCreateDirty, setWebhookCreateDirty] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);
  const [archiveProjectOpen, setArchiveProjectOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const [environmentParent, setEnvironmentParent] = useState<HTMLDivElement | null>(null);
  const [sandboxEnvironmentButton, setSandboxEnvironmentButton] = useState<HTMLButtonElement | null>(null);
  const [productionEnvironmentButton, setProductionEnvironmentButton] = useState<HTMLButtonElement | null>(null);
  const setSandboxEnvironmentButtonRef = useCallback((node: HTMLButtonElement | null) => setSandboxEnvironmentButton(node), []);
  const setProductionEnvironmentButtonRef = useCallback((node: HTMLButtonElement | null) => setProductionEnvironmentButton(node), []);

  const project = projects.find((item) => item.id === projectId) || null;
  const selectedProfileValue = profiles.find((item) => item.slug === selectedProfile) || null;
  const selectedWebhookValue = webhooks.find((item) => item.id === selectedWebhook) || null;

  function reportError(caught: unknown, fallback: string) {
    if (caught instanceof DeveloperApiError && caught.status === 401) {
      window.location.assign("/login");
      return;
    }
    setError(caught instanceof Error ? caught.message : fallback);
  }

  async function refreshProjects() {
    const result = await developerApi.projects();
    setProjects(result.projects.filter((item) => item.status === "active"));
    setProjectId((current) => result.projects.some((item) => item.id === current && item.status === "active") ? current : result.projects.find((item) => item.status === "active")?.id || "");
  }
  async function refreshWorkspace(id = projectId) {
    if (!id) { setKeys([]); setProfiles([]); setQueues([]); setQueueSnapshots([]); setWebhooks([]); setDeliveries([]); setAllowance(null); setUsage(null); setTestAccounts([]); return; }
    const [keyResult, profileResult, webhookResult, allowanceResult, usageResult, testAccountResult] = await Promise.all([developerApi.keys(id), developerApi.profiles(id), developerApi.webhooks(id), developerApi.sandboxAllowance(id), developerApi.usage(id), developerApi.testAccounts(id)]);
    setKeys(keyResult.keys); setProfiles(profileResult.profiles); setWebhooks(webhookResult.webhooks);
    setAllowance(allowanceResult.allowance);
    setUsage(usageResult);
    setTestAccounts(testAccountResult.testAccounts);
    setSelectedProfile((current) => profileResult.profiles.some((item) => item.slug === current) ? current : profileResult.profiles[0]?.slug || "");
    setSelectedWebhook((current) => webhookResult.webhooks.some((item) => item.id === current) ? current : webhookResult.webhooks[0]?.id || "");
  }
  async function load() {
    setLoading(true); setError("");
    try { await refreshProjects(); } catch (caught) { reportError(caught, "Could not load the workspace."); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (!projectId) return; void refreshWorkspace().catch((caught) => reportError(caught, "Could not load project resources.")); }, [projectId]);
  function applyNavigation(nextSection: Section, nextEnvironment: Environment) {
    const href = workspaceHref(nextSection, nextEnvironment);
    if (`${window.location.pathname}${window.location.search}` !== href) {
      window.history.pushState({}, "", href);
    }
    setSection(nextSection);
    setEnvironment(nextEnvironment);
  }
  function isDraftSection(value: Section) { return value === "keyCreate" || value === "webhookCreate"; }
  const draftDirty = (section === "keyCreate" && keyCreateDirty) || (section === "webhookCreate" && webhookCreateDirty);
  function navigate(nextSection: Section, nextEnvironment: Environment = environment) {
    if (draftDirty && isDraftSection(section) && nextSection !== section) {
      setPendingNavigation({ section: nextSection, environment: nextEnvironment });
      return;
    }
    applyNavigation(nextSection, nextEnvironment);
  }
  useEffect(() => {
    const syncLocation = () => {
      const next = workspaceLocation();
      if (draftDirty && isDraftSection(section) && next.section !== section) {
        window.history.pushState({}, "", workspaceHref(section, environment));
        setPendingNavigation(next);
        return;
      }
      setSection(next.section);
      setEnvironment(next.environment);
    };
    window.addEventListener("popstate", syncLocation);
    return () => window.removeEventListener("popstate", syncLocation);
  }, [draftDirty, environment, section]);
  useEffect(() => {
    if (!draftDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draftDirty]);
  function showReadiness() { navigate("readiness", "production"); }
  useEffect(() => {
    if (!projectId || !selectedProfile) { setQueues([]); return; }
    void developerApi.queues(projectId, selectedProfile).then((result) => { setQueues(result.queues); setQueueSnapshots(result.snapshots || []); }).catch((caught) => reportError(caught, "Could not load queues."));
  }, [projectId, selectedProfile]);
  useEffect(() => {
    if (!projectId || !selectedWebhook) { setDeliveries([]); return; }
    void developerApi.deliveries(projectId, selectedWebhook).then((result) => setDeliveries(result.deliveries)).catch((caught) => reportError(caught, "Could not load deliveries."));
  }, [projectId, selectedWebhook]);

  async function submit(action: string, work: () => Promise<void>) {
    setBusy(action); setError("");
    try { await work(); return true; } catch (caught) { reportError(caught, "The request could not be completed."); return false; } finally { setBusy(""); }
  }
  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); const name = String(form.get("name") || "");
    await submit("project", async () => { const result = await developerApi.createProject(name, session.csrfToken); await refreshProjects(); setProjectId(result.project.id); formElement.reset(); });
  }
  async function archiveProject() {
    if (!project) return;
    setArchiveProjectOpen(false);
    await submit("archive", async () => {
      await developerApi.archiveProject(project.id, session.csrfToken);
      await refreshProjects();
    });
  }
  async function runConfirmation() {
    if (!confirmation) return;
    const request = confirmation;
    const completed = await submit(request.busyKey, request.run);
    if (completed) setConfirmation(null);
  }
  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); const selectedScopes = scopes.filter((scope) => form.get(scope) === "on");
    await submit("key", async () => { const result = await developerApi.createKey(projectId, { name: String(form.get("name") || `${project?.name || "Sandbox"} Sandbox key`), environment: "sandbox", scopes: selectedScopes, profileAccess: String(form.get("profileAccess") || "all") === "selected" ? "selected" : "all", profileSlugs: form.getAll("profileSlugs").map((value) => String(value)) }, session.csrfToken); setKeyCreateDirty(false); setSecret({ label: "Sandbox API key", value: result.secret, warning: result.warning }); await refreshWorkspace(); formElement.reset(); applyNavigation("keys", "sandbox"); });
  }
  async function createProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    const saved = await submit("profile", async () => { await developerApi.createProfile(projectId, { slug: String(form.get("slug") || ""), displayName: String(form.get("displayName") || "") }, session.csrfToken); await refreshWorkspace(); formElement.reset(); });
    if (saved) navigate("profiles", "sandbox");
  }

  async function updateProfile(profile: Profile, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    return submit(`profile-${profile.id}`, async () => {
      await developerApi.updateProfile(projectId, profile.slug, {
        displayName: String(form.get("displayName") || ""),
        directoryContent: { description: String(form.get("directoryDescription") || ""), websiteUrl: String(form.get("websiteUrl") || "") }
      }, session.csrfToken);
      await refreshWorkspace();
    });
  }
  function requestDeleteProfile(profile: Profile) {
    setConfirmation({
      title: `Delete ${profile.displayName}?`,
      message: "This permanently removes the profile and its empty queues. Profiles with ticket history cannot be deleted. API keys limited to this profile will be revoked.",
      actionLabel: "Delete profile",
      busyKey: `delete-profile-${profile.id}`,
      run: async () => {
        await developerApi.deleteProfile(projectId, profile.slug, session.csrfToken);
        try { await refreshWorkspace(); }
        catch (caught) { reportError(caught, "The profile was deleted, but the workspace could not be refreshed."); }
      }
    });
  }
  async function createQueue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    const saved = await submit("queue", async () => { await developerApi.createQueue(projectId, selectedProfile, { slug: String(form.get("slug") || ""), displayName: String(form.get("displayName") || ""), sessionState: String(form.get("sessionState") || "closed"), intakeEnabled: form.get("intakeEnabled") === "on" }, session.csrfToken); const result = await developerApi.queues(projectId, selectedProfile); setQueues(result.queues); setQueueSnapshots(result.snapshots || []); formElement.reset(); });
    if (saved) navigate("queues", "sandbox");
  }
  async function updateQueue(queue: Queue, event: FormEvent<HTMLFormElement>) {
    const form = new FormData(event.currentTarget);
    return submit(`queue-update-${queue.id}`, async () => { await developerApi.updateQueue(projectId, selectedProfile, queue.slug, { displayName: String(form.get("displayName") || ""), sessionState: String(form.get("sessionState") || queue.sessionState), intakeEnabled: form.get("intakeEnabled") === "on", resourceVersion: queue.resourceVersion }, session.csrfToken); const result = await developerApi.queues(projectId, selectedProfile); setQueues(result.queues); setQueueSnapshots(result.snapshots || []); });
  }
  function requestDeleteQueue(queue: Queue) {
    setConfirmation({
      title: `Delete ${queue.displayName}?`,
      message: "This permanently removes the queue if it has no ticket history. Ticket history is preserved and blocks deletion.",
      actionLabel: "Delete queue",
      busyKey: `delete-queue-${queue.id}`,
      run: async () => {
        await developerApi.deleteQueue(projectId, selectedProfile, queue.slug, session.csrfToken);
        try {
          const result = await developerApi.queues(projectId, selectedProfile);
          setQueues(result.queues);
          setQueueSnapshots(result.snapshots || []);
        } catch (caught) { reportError(caught, "The queue was deleted, but the workspace could not be refreshed."); }
      }
    });
  }
  async function createWebhook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const events = webhookEvents.filter((name) => form.get(name) === "on");
    await submit("webhook", async () => { const result = await developerApi.createWebhook(projectId, { name: String(form.get("name") || ""), url: String(form.get("url") || ""), events }, session.csrfToken); setWebhookCreateDirty(false); setSecret({ label: "Webhook signing secret", value: result.secret, warning: result.warning }); await refreshWorkspace(); applyNavigation("webhooks", "sandbox"); });
  }

  async function createTestAccount() {
    await submit("test-account-create", async () => {
      const result = await developerApi.createTestAccount(projectId, session.csrfToken);
      setSecret({ label: "Sandbox test-account credentials", value: `Username: ${result.credentials.username}\nEmail: ${result.credentials.email}\nPassword: ${result.credentials.password}`, warning: result.warning });
      await refreshWorkspace();
    });
  }

  async function resetTestAccount(account: SandboxTestAccount) {
    await submit(`test-account-reset-${account.id}`, async () => {
      const result = await developerApi.resetTestAccount(projectId, account.id, session.csrfToken);
      setSecret({ label: "Reset Sandbox test-account credentials", value: `Username: ${result.credentials.username}\nEmail: ${result.credentials.email}\nPassword: ${result.credentials.password}`, warning: result.warning });
      await refreshWorkspace();
    });
  }

  // Keep the account content available while navigating within the mounted
  // workspace. Sidebar navigation uses history.pushState, so the parent does
  // not remount to replace this prop when switching from a project page.
  const isAccountPage = section === "accountProfile" || section === "security";

  function discardPendingNavigation() {
    const target = pendingNavigation;
    setPendingNavigation(null);
    setKeyCreateDirty(false);
    setWebhookCreateDirty(false);
    if (!target) return;
    if (target.projectId && target.projectId !== projectId) setProjectId(target.projectId);
    applyNavigation(target.section, target.environment);
  }

  return <section className="developer-workspace dpp dpp-A" data-api-theme={light ? "light" : "dark"}>
    <Modal opened={archiveProjectOpen} onClose={() => { if (busy !== "archive") setArchiveProjectOpen(false); }} closeOnEscape={busy !== "archive"} closeOnClickOutside={busy !== "archive"} closeButtonProps={{ "aria-label": "Close archive confirmation", size: 44 }} title={`Archive ${project?.name || "project"}?`} centered size="sm" withinPortal={false} classNames={{ content: "developer-workspace-discard-modal", header: "developer-workspace-discard-modal-header", body: "developer-workspace-discard-modal-body" }}>
      <p>Archiving this project will make its project resources inactive. This action cannot be undone here.</p>
      <div className="developer-workspace-discard-actions"><Button type="button" variant="outline" onClick={() => setArchiveProjectOpen(false)} disabled={busy === "archive"}>Cancel</Button><Button type="button" color="red" className="developer-workspace-destructive-action" onClick={() => void archiveProject()} loading={busy === "archive"}>Archive project</Button></div>
    </Modal>
    <Modal opened={Boolean(confirmation)} onClose={() => { if (!confirmation || busy !== confirmation.busyKey) setConfirmation(null); }} closeOnEscape={!confirmation || busy !== confirmation.busyKey} closeOnClickOutside={!confirmation || busy !== confirmation.busyKey} closeButtonProps={{ "aria-label": "Close confirmation", size: 44 }} title={confirmation?.title || "Confirm action"} centered size="sm" withinPortal={false} classNames={{ content: "developer-workspace-discard-modal", header: "developer-workspace-discard-modal-header", body: "developer-workspace-discard-modal-body" }}>
      <p>{confirmation?.message}</p>
      <div className="developer-workspace-discard-actions"><Button type="button" variant="outline" onClick={() => setConfirmation(null)} disabled={Boolean(confirmation && busy === confirmation.busyKey)}>Cancel</Button><Button type="button" color="red" className="developer-workspace-destructive-action" onClick={() => void runConfirmation()} loading={Boolean(confirmation && busy === confirmation.busyKey)}>{confirmation?.actionLabel || "Confirm"}</Button></div>
    </Modal>
    <Modal opened={Boolean(pendingNavigation)} onClose={() => setPendingNavigation(null)} closeButtonProps={{ "aria-label": "Close discard confirmation", size: 44 }} title={section === "webhookCreate" ? "Discard unsaved webhook?" : "Discard unsaved API key?"} centered size="sm" withinPortal={false} classNames={{ content: "developer-workspace-discard-modal", header: "developer-workspace-discard-modal-header", body: "developer-workspace-discard-modal-body" }}>
      <p>{section === "webhookCreate" ? "Your webhook details and selected events will be discarded. Existing webhooks will remain intact." : "Your selected API-key permissions and profiles will be discarded. Existing keys will remain intact."}</p>
      <div className="developer-workspace-discard-actions"><Button type="button" variant="outline" onClick={() => setPendingNavigation(null)}>Keep editing</Button><Button type="button" color="red" className="developer-workspace-destructive-action" onClick={discardPendingNavigation}>Discard changes</Button></div>
    </Modal>
    <div className="developer-workspace-layout dpp-workspace">
    <aside className="developer-workspace-sidebar dpp-nav" aria-label="Developer workspace navigation">
      <p className="developer-workspace-eyebrow">PROJECT</p>
      <Select label="Active project" placeholder="Select a project" value={projectId || null} onChange={(value) => { const nextProjectId = value || ""; if (!nextProjectId || nextProjectId === projectId) return; if (draftDirty && isDraftSection(section)) { setPendingNavigation({ section: "overview", environment: "sandbox", projectId: nextProjectId }); return; } setProjectId(nextProjectId); }} data={projects.map((item) => ({ value: item.id, label: item.name }))} comboboxProps={{ withinPortal: false }} classNames={{ dropdown: "dpp-select-dropdown", option: "dpp-select-option" }} />
      <div className="developer-workspace-environments dpp-env" ref={setEnvironmentParent} role="group" aria-label="Environment">
        <button ref={setSandboxEnvironmentButtonRef} type="button" aria-selected={environment === "sandbox"} aria-pressed={environment === "sandbox"} onClick={() => navigate("overview", "sandbox")}>Sandbox</button>
        <button ref={setProductionEnvironmentButtonRef} type="button" aria-selected={environment === "production"} aria-pressed={environment === "production"} onClick={() => navigate("readiness", "production")}>Production</button>
        <FloatingIndicator target={environment === "sandbox" ? sandboxEnvironmentButton : productionEnvironmentButton} parent={environmentParent} className="developer-workspace-environment-indicator" transitionDuration={150} />
      </div>
      <p className="developer-workspace-eyebrow">PROJECT TOOLS</p>
      <nav aria-label="Workspace sections">{(environment === "sandbox" ? ["overview", "setup", "profiles", "queues", "keys", "webhooks", "usage"] : ["readiness"]).map((item) => <button type="button" key={item} aria-current={section === item || (item === "queues" && section === "queueCreate") || (item === "profiles" && section === "profileCreate") || (item === "webhooks" && section === "webhookCreate") ? "page" : undefined} onClick={() => navigate(item as Section, environment)}>{sectionLabels[item as Section]}</button>)}</nav>
      <p className="developer-workspace-eyebrow developer-workspace-account-nav-heading">ACCOUNT</p>
      <nav aria-label="Account sections">{(["accountProfile", "billing", "subscriptions", "teamSecurity"] as Section[]).map((item) => <button type="button" key={item} aria-current={section === item ? "page" : undefined} onClick={() => navigate(item, "sandbox")}>{sectionLabels[item]}</button>)}</nav>
      <p className="developer-workspace-sidebar-note">{environment === "sandbox" ? "Isolated test data and keys" : "Production access pending approval"}</p>
      {project && <div className="developer-workspace-sidebar-project"><span>Created {formatDate(project.createdAt)}</span>{session.developerAccount.role === "owner" && <Button type="button" variant="subtle" onClick={() => setArchiveProjectOpen(true)} loading={busy === "archive"}>Archive project</Button>}</div>}
    </aside>
    <div className="developer-workspace-main dpp-main" id="developer-workspace-main">
    <div className="developer-workspace-context dpp-context"><span>{isAccountPage ? `Account / ${section === "security" ? "Security" : "Profile"}` : ["accountProfile", "billing", "subscriptions", "teamSecurity", "security"].includes(section) ? "Account" : project?.name || "Developer account"} {!isAccountPage && !["accountProfile", "billing", "subscriptions", "teamSecurity", "security"].includes(section) && ` / ${sectionLabels[section]}`}</span>{!isAccountPage && !["accountProfile", "billing", "subscriptions", "teamSecurity", "security"].includes(section) && <Badge className={`developer-workspace-status ${environment}`} color="blue" variant="filled" radius="xl">{environment}</Badge>}</div>
    {error && <p className="developer-workspace-error" role="alert">{error}</p>}
    {secret && <Secret {...secret} onClose={() => setSecret(null)} />}
    {loading ? <p className="developer-workspace-loading">Loading your workspace…</p> : isAccountPage ? accountContent : <>
      {section === "billing" && <BillingPage />}
      {section === "subscriptions" && <SubscriptionsPage projects={projects} />}
      {section === "teamSecurity" && <TeamSecurityPage session={session} />}
      {["billing", "subscriptions", "teamSecurity", "security"].includes(section) ? null : !project ? <section className="developer-workspace-panel dpp-section"><p className="developer-workspace-eyebrow">FIRST STEP</p><h1>Create your Sandbox project</h1><p>A project owns its keys, profiles, queues, and webhook registrations. The current plan supports one active project.</p><form onSubmit={(event) => void createProject(event)} className="developer-workspace-form"><TextInput label="Project name" name="name" required maxLength={80} placeholder="Harbor Services integration" /><Button type="submit" className="developer-workspace-primary" loading={busy === "project"} leftSection={<IconPlus size={16} />}>Create project</Button></form></section> : <>
        {section === "setup" && <Setup allowance={allowance} testAccounts={testAccounts} busy={busy} onCreate={() => void createTestAccount()} onReset={(account) => void resetTestAccount(account)} />}
        {section === "readiness" && <Readiness session={session} />}
        {section === "usage" && <UsagePage project={project} allowance={allowance} usage={usage} />}
        {section === "overview" && <section className="developer-workspace-panel"><p className="developer-workspace-eyebrow">{project.name} / DEVELOPER WORKSPACE</p><h1>Good things start with a queue.</h1><p>Keep your software. Let customers follow their place in GetPrio.</p><div className="developer-workspace-dashboard-cards dpp-stats"><Allowance value={allowance} compact /><Paper component="article" withBorder className="developer-workspace-dashboard-card"><p className="developer-workspace-eyebrow">PRODUCTION WALLET</p><strong>0 <span>credits</span></strong><p>Shared across projects · no expiration</p></Paper><Paper component="article" withBorder className="developer-workspace-dashboard-card"><p className="developer-workspace-eyebrow">TEST ACCOUNTS</p><strong>{testAccounts.length} <span>/ 2</span></strong><p>Two devices per test account</p></Paper></div><div className="developer-workspace-next dpp-overview"><Paper component="article" withBorder><Badge className="developer-workspace-next-badge" color="blue" variant="light" radius="xl">NEXT STEP</Badge><h3>Meet your sandbox.</h3><p>Your included project is ready for testing. Install the app and create up to two test accounts.</p><Button type="button" onClick={() => navigate("setup", "sandbox")}>Set up your sandbox →</Button></Paper><Paper component="article" withBorder><p className="developer-workspace-eyebrow">PRODUCTION</p><h3>A clear path to launch.</h3><p>MFA, project approval and prepaid credits. See each requirement before you go live.</p><Button type="button" variant="light" onClick={showReadiness}>Review readiness</Button></Paper></div><p><a href="/guides">Read the quickstart <IconExternalLink size={15} /></a> <a href="/reference">Open the API reference <IconExternalLink size={15} /></a></p></section>}
        {section === "keyCreate" && <ApiKeyCreatePage project={project} profiles={profiles} busy={busy} onCreate={(event) => void createKey(event)} onBack={() => navigate("keys", "sandbox")} onDirtyChange={setKeyCreateDirty} />}
        {section === "keys" && <ApiKeysPage project={project} keys={keys} onCreatePage={() => navigate("keyCreate", "sandbox")} onRevoke={(key) => setConfirmation({ title: `Revoke ${key.name}?`, message: "This key will stop authorizing requests immediately. Existing queues, profiles, and tickets will remain intact.", actionLabel: "Revoke key", busyKey: `revoke-${key.id}`, run: async () => { await developerApi.revokeKey(projectId, key.id, session.csrfToken); await refreshWorkspace(); } })} />}
        {section === "profileCreate" && <ProfileCreatePage busy={busy} onCreateProfile={(event) => void createProfile(event)} onBack={() => navigate("profiles", "sandbox")} />}
        {section === "profiles" && <ProfilesPage project={project} profiles={profiles} busy={busy} onCreatePage={() => navigate("profileCreate", "sandbox")} onUpdateProfile={updateProfile} onDeleteProfile={requestDeleteProfile} />}
        {section === "queueCreate" && <QueueCreatePage profiles={profiles} selectedProfileValue={selectedProfileValue} busy={busy} onCreateQueue={(event) => void createQueue(event)} onBack={() => navigate("queues", "sandbox")} />}
        {section === "queues" && <QueuesPage profiles={profiles} selectedProfile={selectedProfile} selectedProfileValue={selectedProfileValue} queues={queues} snapshots={queueSnapshots} busy={busy} onProfileChange={setSelectedProfile} onCreatePage={() => navigate("queueCreate", "sandbox")} onUpdateQueue={(queue, event) => updateQueue(queue, event)} onDeleteQueue={requestDeleteQueue} />}
        {section === "webhookCreate" && <WebhookCreatePage busy={busy} onCreate={(event) => void createWebhook(event)} onBack={() => navigate("webhooks", "sandbox")} onDirtyChange={setWebhookCreateDirty} />}
        {section === "webhooks" && <WebhooksPage project={project} webhooks={webhooks} selectedWebhook={selectedWebhook} selectedWebhookValue={selectedWebhookValue} deliveries={deliveries} busy={busy} onWebhookChange={setSelectedWebhook} onCreatePage={() => navigate("webhookCreate", "sandbox")} onRotate={(webhook) => void submit(`rotate-${webhook.id}`, async () => { const result = await developerApi.rotateWebhook(projectId, webhook.id, session.csrfToken); setSecret({ label: "Rotated webhook signing secret", value: result.secret, warning: result.warning }); await refreshWorkspace(); })} onCompromised={(webhook) => setConfirmation({ title: "Rotate compromised secret?", message: "The current signing secret will be revoked immediately. Receivers using it will stop verifying webhook deliveries.", actionLabel: "Rotate secret", busyKey: `compromised-${webhook.id}`, run: async () => { const result = await developerApi.rotateWebhook(projectId, webhook.id, session.csrfToken, true); setSecret({ label: "Emergency webhook signing secret", value: result.secret, warning: result.warning }); await refreshWorkspace(); } })} onDisable={(webhook) => setConfirmation({ title: `Disable ${webhook.name}?`, message: "Deliveries will stop until this receiver is registered again or re-enabled by the API.", actionLabel: "Disable webhook", busyKey: `disable-${webhook.id}`, run: async () => { await developerApi.disableWebhook(projectId, webhook.id, session.csrfToken); await refreshWorkspace(); } })} onRefresh={() => { if (selectedWebhook) void developerApi.deliveries(projectId, selectedWebhook).then((result) => setDeliveries(result.deliveries)); }} onReplay={(delivery) => void submit(`replay-${delivery.id}`, async () => { await developerApi.replayDelivery(projectId, selectedWebhook, delivery.id, session.csrfToken); const result = await developerApi.deliveries(projectId, selectedWebhook); setDeliveries(result.deliveries); })} />}
      </>}
    </>}
    </div>
    </div>
  </section>;
}
