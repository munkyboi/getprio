import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { buildMonitorPath, buildMonitorPathWithTicket } from "../queuePaths";

export default function JoinQueuePage() {
  const { tenantSlug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { token, user } = useAuth();
  const [tenantInfo, setTenantInfo] = useState(null);
  const [form, setForm] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    notifyByEmail: true,
    notifyBySms: false,
    notes: ""
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      setForm((current) => ({
        ...current,
        customerName: current.customerName || user.name || "",
        customerEmail: current.customerEmail || user.email || "",
        customerPhone: current.customerPhone || user.phone || ""
      }));
    }
  }, [user]);

  useEffect(() => {
    if (!tenantSlug) {
      return;
    }

    apiRequest(`/public/tenant/${tenantSlug}/queue`)
      .then((data) => {
        setTenantInfo(data.tenant);
      })
      .catch((loadError) => {
        setError(loadError.message);
      });
  }, [tenantSlug]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const source = searchParams.get("source") === "qr" ? "qr" : "online";
      const data = await apiRequest(`/public/tenant/${tenantSlug}/tickets`, {
        method: "POST",
        token,
        body: {
          ...form,
          joinChannel: source
        }
      });
      navigate(buildMonitorPathWithTicket(tenantSlug, data.ticket.lookupCode), { replace: true });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid join-layout">
      <section className="card stack gap-md">
        <span className="eyebrow">Join queue</span>
        <h1>{tenantInfo?.name || tenantSlug}</h1>
        <p>
          Grab your priority number online, then keep monitoring progress from the public board.
        </p>
        <form className="stack gap-sm" onSubmit={handleSubmit}>
          <label className="field">
            <span>Name</span>
            <input
              required
              value={form.customerName}
              onChange={(event) =>
                setForm((current) => ({ ...current, customerName: event.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={form.customerEmail}
              onChange={(event) =>
                setForm((current) => ({ ...current, customerEmail: event.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>Phone</span>
            <input
              value={form.customerPhone}
              onChange={(event) =>
                setForm((current) => ({ ...current, customerPhone: event.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>Notes</span>
            <textarea
              rows="3"
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            />
          </label>
          <label className="check-row">
            <input
              checked={form.notifyByEmail}
              type="checkbox"
              onChange={(event) =>
                setForm((current) => ({ ...current, notifyByEmail: event.target.checked }))
              }
            />
            <span>Email me when I am almost next</span>
          </label>
          <label className="check-row">
            <input
              checked={form.notifyBySms}
              type="checkbox"
              onChange={(event) => setForm((current) => ({ ...current, notifyBySms: event.target.checked }))}
            />
            <span>Send SMS alerts</span>
          </label>
          {error ? <p className="error-text">{error}</p> : null}
          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? "Joining queue..." : "Get priority number"}
          </button>
        </form>
      </section>

      <aside className="card stack gap-md side-panel">
        <span className="eyebrow">What happens next</span>
        <div className="stack gap-sm">
          <div>
            <h2>1. Ticket issued instantly</h2>
            <p>Your ticket number is generated immediately for this tenant.</p>
          </div>
          <div>
            <h2>2. Monitor online</h2>
            <p>After joining, you are redirected to a live board with your ticket highlighted.</p>
          </div>
          <div>
            <h2>3. Near-turn notification</h2>
            <p>Email or SMS alerts are sent when your turn is getting close, based on tenant settings.</p>
          </div>
        </div>
        <Link className="text-link" to={buildMonitorPath(tenantSlug)}>
          Open public board instead
        </Link>
      </aside>
    </div>
  );
}
