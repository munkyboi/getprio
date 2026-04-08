import { useEffect, useState, type FormEvent } from "react";
import QRCode from "react-qr-code";
import { Navigate } from "react-router-dom";
import type {
  CreateWalkInTicketRequest,
  QueueSnapshot,
  TicketMutationResponse,
  UpdateTenantSettingsRequest
} from "@shared";
import { API_BASE_URL, apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { buildJoinUrl, buildMonitorUrl } from "../queuePaths";
import { getErrorMessage } from "../utils/errors";

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

type DashboardActionResponse = Partial<TicketMutationResponse> & {
  message?: string;
  snapshot?: QueueSnapshot;
};

export default function VendorDashboardPage() {
  const { token, user, loading } = useAuth();
  const [selectedTenantSlug, setSelectedTenantSlug] = useState("");
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);
  const [settings, setSettings] = useState<UpdateTenantSettingsRequest>(defaultSettings);
  const [walkInForm, setWalkInForm] = useState<CreateWalkInTicketRequest>(emptyWalkIn);
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState("");

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
    setError("");

    apiRequest<QueueSnapshot>(`/vendor/tenant/${selectedTenantSlug}/dashboard`, { token })
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
  }, [selectedTenantSlug, token]);

  useEffect(() => {
    if (!selectedTenantSlug) {
      return undefined;
    }

    const eventSource = new EventSource(`${API_BASE_URL}/public/tenant/${selectedTenantSlug}/stream`);
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
  }, [selectedTenantSlug]);

  if (loading) {
    return <div className="card">Loading dashboard...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!user.tenants?.length) {
    return (
      <section className="card stack gap-sm">
        <h1>No vendor tenants found</h1>
        <p>Your account does not currently have access to a tenant workspace.</p>
      </section>
    );
  }

  const joinUrl =
    snapshot?.tenant.joinUrl || buildJoinUrl(window.location.origin, selectedTenantSlug);
  const queueLinks = {
    joinUrl,
    qrUrl: `${joinUrl}?source=qr`,
    monitorUrl:
      snapshot?.tenant.monitorUrl ||
      buildMonitorUrl(window.location.origin, selectedTenantSlug)
  };

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
        `/vendor/tenant/${selectedTenantSlug}/tickets`,
        {
          method: "POST",
          token,
          body: walkInForm
        }
      )
    );

    if (success) {
      setWalkInForm(emptyWalkIn);
    }
  }

  async function handleSaveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction("settings", () =>
      apiRequest<DashboardActionResponse, UpdateTenantSettingsRequest>(
        `/vendor/tenant/${selectedTenantSlug}/settings`,
        {
          method: "PATCH",
          token,
          body: settings
        }
      )
    );
  }

  return (
    <div className="stack gap-lg">
      <section className="card stack gap-md">
        <div className="row wrap gap-sm spread align-center">
          <div>
            <span className="eyebrow">Vendor dashboard</span>
            <h1>Control the live queue</h1>
            <p>Manage public board updates, issue walk-in tickets, and send near-turn alerts.</p>
          </div>
          <label className="field select-field compact-field">
            <span>Tenant</span>
            <select
              value={selectedTenantSlug}
              onChange={(event) => setSelectedTenantSlug(event.target.value)}
            >
              {user.tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.slug}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="grid three-up">
        <article className="card stat-card">
          <span>Now serving</span>
          <strong>{snapshot?.current?.ticketNumber || "--"}</strong>
          <small>{snapshot?.current?.customerName || "No active ticket"}</small>
        </article>
        <article className="card stat-card">
          <span>Waiting</span>
          <strong>{snapshot?.stats?.waitingCount ?? 0}</strong>
          <small>{snapshot?.stats?.estimatedWaitMinutes ?? 0} mins estimated</small>
        </article>
        <article className="card stat-card">
          <span>Served today</span>
          <strong>{snapshot?.stats?.servedToday ?? 0}</strong>
          <small>Across the selected tenant</small>
        </article>
      </section>

      <section className="grid dashboard-grid">
        <article className="card stack gap-md">
          <div className="row gap-sm wrap">
            <button
              className="primary-button"
              disabled={busyAction === "call-next"}
              onClick={() =>
                runAction("call-next", () =>
                  apiRequest<DashboardActionResponse>(
                    `/vendor/tenant/${selectedTenantSlug}/queue/call-next`,
                    {
                      method: "POST",
                      token
                    }
                  )
                )
              }
              type="button"
            >
              {busyAction === "call-next" ? "Calling..." : "Call next"}
            </button>
            <button
              className="secondary-button"
              disabled={busyAction === "serve-current"}
              onClick={() =>
                runAction("serve-current", () =>
                  apiRequest<DashboardActionResponse>(
                    `/vendor/tenant/${selectedTenantSlug}/queue/current/serve`,
                    {
                      method: "POST",
                      token
                    }
                  )
                )
              }
              type="button"
            >
              Serve current
            </button>
            <button
              className="ghost-button"
              disabled={busyAction === "skip-current"}
              onClick={() =>
                runAction("skip-current", () =>
                  apiRequest<DashboardActionResponse>(
                    `/vendor/tenant/${selectedTenantSlug}/queue/current/skip`,
                    {
                      method: "POST",
                      token
                    }
                  )
                )
              }
              type="button"
            >
              Skip current
            </button>
          </div>

          <div className="panel-list">
            <div className="panel-row panel-row-header">
              <span>Up next</span>
              <span>Channel</span>
            </div>
            {snapshot?.nextUp?.length ? (
              snapshot.nextUp.map((ticket) => (
                <div className="panel-row" key={ticket.id}>
                  <div>
                    <strong>{ticket.ticketNumber}</strong>
                    <span>{ticket.customerName}</span>
                  </div>
                  <span className="pill">{ticket.joinChannel}</span>
                </div>
              ))
            ) : (
              <p className="muted-text">No one is waiting right now.</p>
            )}
          </div>
        </article>

        <article className="card stack gap-md">
          <div className="row spread align-center wrap gap-sm">
            <div>
              <span className="eyebrow">QR and public links</span>
              <h2>Customer self-service entry</h2>
            </div>
            <a className="text-link" href={queueLinks.monitorUrl} target="_blank" rel="noreferrer">
              Open public board
            </a>
          </div>
          <div className="qr-panel single-qr-panel">
            <div className="qr-card stack gap-sm">
              <QRCode size={180} value={queueLinks.qrUrl} />
              <span className="eyebrow centered-text">Join QR</span>
            </div>
            <div className="stack gap-xs">
              <label className="field readonly-field">
                <span>Join URL</span>
                <input readOnly value={queueLinks.joinUrl} />
              </label>
              <label className="field readonly-field">
                <span>QR target</span>
                <input readOnly value={queueLinks.qrUrl} />
              </label>
              <label className="field readonly-field">
                <span>Monitor URL</span>
                <input readOnly value={queueLinks.monitorUrl} />
              </label>
            </div>
          </div>
        </article>
      </section>

      <section className="grid two-up">
        <article className="card stack gap-md">
          <span className="eyebrow">Issue walk-in ticket</span>
          <form className="stack gap-sm" onSubmit={handleCreateWalkIn}>
            <label className="field">
              <span>Customer name</span>
              <input
                required
                value={walkInForm.customerName}
                onChange={(event) =>
                  setWalkInForm((current) => ({ ...current, customerName: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={walkInForm.customerEmail}
                onChange={(event) =>
                  setWalkInForm((current) => ({ ...current, customerEmail: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Phone</span>
              <input
                value={walkInForm.customerPhone}
                onChange={(event) =>
                  setWalkInForm((current) => ({ ...current, customerPhone: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Notes</span>
              <textarea
                rows={3}
                value={walkInForm.notes}
                onChange={(event) =>
                  setWalkInForm((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </label>
            <label className="check-row">
              <input
                checked={walkInForm.notifyByEmail}
                type="checkbox"
                onChange={(event) =>
                  setWalkInForm((current) => ({ ...current, notifyByEmail: event.target.checked }))
                }
              />
              <span>Send email alerts</span>
            </label>
            <label className="check-row">
              <input
                checked={walkInForm.notifyBySms}
                type="checkbox"
                onChange={(event) =>
                  setWalkInForm((current) => ({ ...current, notifyBySms: event.target.checked }))
                }
              />
              <span>Send SMS alerts</span>
            </label>
            <button className="primary-button" disabled={busyAction === "walk-in"} type="submit">
              {busyAction === "walk-in" ? "Issuing..." : "Issue ticket"}
            </button>
          </form>
        </article>

        <article className="card stack gap-md">
          <span className="eyebrow">Tenant settings</span>
          <form className="stack gap-sm" onSubmit={handleSaveSettings}>
            <label className="field">
              <span>Queue prefix</span>
              <input
                maxLength={4}
                value={settings.queuePrefix}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    queuePrefix: event.target.value.toUpperCase()
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Average service minutes</span>
              <input
                min={1}
                type="number"
                value={settings.averageServiceMinutes}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    averageServiceMinutes: event.target.value
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Notify when within</span>
              <input
                min={1}
                type="number"
                value={settings.notificationThreshold}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    notificationThreshold: event.target.value
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Contact email</span>
              <input
                type="email"
                value={settings.contactEmail}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, contactEmail: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Contact phone</span>
              <input
                value={settings.contactPhone}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, contactPhone: event.target.value }))
                }
              />
            </label>
            <button className="secondary-button" disabled={busyAction === "settings"} type="submit">
              {busyAction === "settings" ? "Saving..." : "Save settings"}
            </button>
          </form>
        </article>
      </section>
    </div>
  );
}
