import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { QueueSnapshot } from "@shared";
import { API_BASE_URL, apiRequest } from "../api/client";
import { buildJoinPath, buildJoinUrl } from "../queuePaths";
import { getErrorMessage } from "../utils/errors";

export default function PublicQueuePage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [searchParams] = useSearchParams();
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);
  const [error, setError] = useState("");
  const lookupCode = searchParams.get("ticket") || "";
  const tenantSlugValue = tenantSlug || "";
  const joinPath = tenantSlug ? buildJoinPath(tenantSlug) : "/";
  const joinUrl =
    snapshot?.tenant?.joinUrl || buildJoinUrl(window.location.origin, tenantSlugValue);
  const joinQrUrl = `${joinUrl}?source=qr`;
  const queueProgressTickets = [
    ...(snapshot?.current
      ? [
          {
            id: `current-${snapshot.current.id}`,
            ticketNumber: snapshot.current.ticketNumber,
            customerName: snapshot.current.customerName,
            progressLabel: "Now serving"
          }
        ]
      : []),
    ...((snapshot?.nextUp || []).map((ticket) => ({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      customerName: ticket.customerName,
      progressLabel: `#${ticket.position}`
    })))
  ].slice(0, 10);

  useEffect(() => {
    if (!tenantSlug) {
      return undefined;
    }

    let active = true;
    const query = lookupCode ? `?lookupCode=${encodeURIComponent(lookupCode)}` : "";

    apiRequest<QueueSnapshot>(`/public/tenant/${tenantSlug}/queue${query}`)
      .then((data) => {
        if (active) {
          setSnapshot(data);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(getErrorMessage(loadError));
        }
      });

    const eventSource = new EventSource(`${API_BASE_URL}/public/tenant/${tenantSlug}/stream${query}`);
    eventSource.onmessage = (event) => {
      setSnapshot(JSON.parse(event.data) as QueueSnapshot);
      setError("");
    };
    eventSource.onerror = () => {
      setError("Live updates disconnected. Refresh to reconnect.");
      eventSource.close();
    };

    return () => {
      active = false;
      eventSource.close();
    };
  }, [lookupCode, tenantSlug]);

  return (
    <div className="stack gap-lg">
      <section className="card hero-card queue-hero">
        <div className={`grid ${lookupCode && snapshot?.focusTicket ? 'two-up' : 'three-up'}`}>
          <div style={{ gridColumnStart: 1, gridColumnEnd: 3 }}>
            <div className="stack gap-sm">
              <span className="eyebrow">Live public board</span>
              <h1>{snapshot?.tenant?.name || tenantSlugValue}</h1>
              <p>
                Customers can monitor their turn remotely and join the line online if the vendor has enabled
                the public flow.
              </p>
            </div>
            <div className="row gap-sm wrap" style={{ marginTop: '2rem' }}>
              <Link className="primary-button" to={joinPath}>
                Join this queue
              </Link>
              <span className="pill large-pill">Waiting: {snapshot?.stats?.waitingCount ?? 0}</span>
              <span className="pill large-pill">ETA: {snapshot?.stats?.estimatedWaitMinutes ?? 0} mins</span>
            </div>
          </div>
          {!lookupCode && !snapshot?.focusTicket ? (
            <div style={{ width: '100%' }}>
              <span>Scan to join</span>
              <div className="qr-card qr-card-stretch">
                <QRCode size={256} value={joinQrUrl} />
              </div>
              <small>Use your phone camera to open the queue form.</small>
            </div>
          ) : null}
        </div>
      </section>

      {error ? <p className="error-text">{error}</p> : null}

      {lookupCode && snapshot?.focusTicket ? (
        <section className="card focus-card stack gap-sm">
          <span className="eyebrow">Your ticket</span>
          <h2>{snapshot.focusTicket.ticketNumber}</h2>
          <p>
            Status: <strong>{snapshot.focusTicket.status}</strong>
          </p>
          <p>
            {snapshot.focusTicket.position
              ? `You are number ${snapshot.focusTicket.position} in line.`
              : "You are no longer in the waiting list."}
          </p>
          <p>Estimated wait: {snapshot.focusTicket.estimatedWaitMinutes} mins</p>
        </section>
      ) : null}

      <section className="grid two-up">
        <article className="card stat-card large-stat">
          <span>Now serving</span>
          <strong>{snapshot?.current?.ticketNumber || "--"}</strong>
          <small>{snapshot?.current?.customerName || "No active ticket"}</small>
        </article>
        <article className="card stat-card large-stat">
          <span>Served today</span>
          <strong>{snapshot?.stats?.servedToday ?? 0}</strong>
          <small>Updated live for this tenant</small>
        </article>
      </section>

      <section className="card stack gap-md">
        <div className="row spread align-center wrap gap-sm">
          <div>
            <span className="eyebrow">Next in line</span>
            <h2>Queue progress</h2>
          </div>
          <Link className="text-link" to={joinPath}>
            Need a number?
          </Link>
        </div>
        <div className="panel-list">
          <div className="panel-row panel-row-header">
            <span>Ticket</span>
            <span>Position</span>
          </div>
          {queueProgressTickets.length ? (
            queueProgressTickets.map((ticket) => (
              <div className="panel-row" key={ticket.id}>
                <div>
                  <strong>{ticket.ticketNumber}</strong>
                  <span>{ticket.customerName}</span>
                </div>
                <span className="pill">{ticket.progressLabel}</span>
              </div>
            ))
          ) : (
            <p className="muted-text">The queue is currently empty.</p>
          )}
        </div>
      </section>
    </div>
  );
}
