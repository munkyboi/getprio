import { useEffect, useState } from "react";
import { OperationAlert, OperationButton, OperationPanel } from "../vendor/OperationsUi";
import { VendorAuthLayout } from "../vendor/VendorAuthLayout";
import { useParams } from "react-router-dom";
import type { QueueSnapshot } from "@shared";
import { API_BASE_URL, apiRequest } from "../api/client";
import { getErrorMessage } from "../utils/errors";
import { QUEUE_BOARD_POLL_INTERVAL, queueBoardPollingState } from "../utils/queueBoardPolling";
import StyledQRCode from "../components/StyledQRCode";
import PublicQueuePage from "./PublicQueuePage";

interface Pairing { code: string; matchCode: string; expiresAt: string; approvalUrl: string; locationName: string }
export default function SecureQueueBoardPage() {
  const { boardId = "" } = useParams();
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let source: EventSource | undefined;
    let checking = false;
    let requestedPairing = false;
    let refreshCookieAfter = 0;
    let nextCheckAt = 0;
    let pairingExpiresAt: number | null = null;
    let expiryChecked = false;
    const base = `/queue-board/${encodeURIComponent(boardId)}`;
    setSnapshot(null); setPairing(null); setError("");
    const check = async () => {
      if (checking || !active || (source && Date.now() < refreshCookieAfter)) return;
      const pollState = queueBoardPollingState(Date.now(), nextCheckAt, pairingExpiresAt, expiryChecked);
      if (pollState === "expired") {
        setError("This access request has expired. Refresh the access request to try again.");
        return;
      }
      if (pollState === "wait") return;
      if (pollState === "final-check") expiryChecked = true;
      nextCheckAt = Date.now() + QUEUE_BOARD_POLL_INTERVAL;
      checking = true;
      try {
        const status = await apiRequest<{ allowed: boolean }>(`${base}/access`);
        if (!active) return;
        if (status.allowed) {
          requestedPairing = false; pairingExpiresAt = null;
          refreshCookieAfter = Date.now() + 12 * 60 * 60 * 1000;
          if (source) return;
          const data = await apiRequest<QueueSnapshot>(`${base}/queue`);
          if (!active) return;
          setSnapshot(data); setPairing(null); setError("");
          source = new EventSource(`${API_BASE_URL}${base}/stream`, { withCredentials: true });
          source.onmessage = (event) => { if (active) { setSnapshot(JSON.parse(event.data)); setError(""); } };
          source.addEventListener("access-revoked", () => {
            source?.close(); source = undefined;
            if (active) { setSnapshot(null); setPairing(null); requestedPairing = false; pairingExpiresAt = null; expiryChecked = false; nextCheckAt = 0; void check(); }
          });
          source.onerror = () => {
            source?.close(); source = undefined;
            if (active) { setSnapshot(null); setError("Connection interrupted. Checking display access…"); }
          };
        } else {
          source?.close(); source = undefined;
          setSnapshot(null);
          if (pollState === "final-check") setError("This access request has expired. Refresh the access request to try again.");
          if (!requestedPairing) {
            const request = await apiRequest<Pairing>(`${base}/pairing`, { method: "POST", body: {} });
            if (active) { setPairing(request); setError(""); requestedPairing = true; pairingExpiresAt = new Date(request.expiresAt).getTime(); }
          }
        }
      } catch (cause) {
        if (active && !source) { setSnapshot(null); setError(getErrorMessage(cause)); }
      } finally { checking = false; }
    };
    void check();
    const timer = window.setInterval(() => { void check(); }, QUEUE_BOARD_POLL_INTERVAL);
    return () => { active = false; source?.close(); window.clearInterval(timer); };
  }, [boardId, attempt]);
  if (snapshot) return <PublicQueuePage initialSnapshot={snapshot} />;
  return (
    <VendorAuthLayout>
      <OperationPanel>
        <div className="queue-stack v:items-center v:text-center">
          <h1>Queue board access</h1>
          {error && <OperationAlert color="red">{error}</OperationAlert>}
          {pairing ? <>
            <p>Ask authorized staff at {pairing.locationName} to scan this QR in the vendor dashboard and approve this display.</p>
            <StyledQRCode size={220} value={pairing.approvalUrl} />
            <p>Match code: <code>{pairing.matchCode}</code></p>
            <p className="ops-muted">Compare this code on both screens before approving. Request expires at {new Date(pairing.expiresAt).toLocaleTimeString()}.</p>
            <p>Manual pairing code</p><code className="v:wrap-anywhere">{pairing.code}</code>
          </> : <p role="status">Checking board access…</p>}
          <OperationButton variant="outline" onClick={() => setAttempt(value => value + 1)}>Refresh access request</OperationButton>
        </div>
      </OperationPanel>
    </VendorAuthLayout>
  );
}
