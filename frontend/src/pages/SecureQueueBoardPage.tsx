import { useEffect, useState } from "react";
import { Alert, Button, Card, Code, Stack, Text, Title } from "@mantine/core";
import { useParams } from "react-router-dom";
import type { QueueSnapshot } from "@shared";
import { API_BASE_URL, apiRequest } from "../api/client";
import { getErrorMessage } from "../utils/errors";
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
    const base = `/queue-board/${encodeURIComponent(boardId)}`;
    setSnapshot(null); setPairing(null); setError("");
    const check = async () => {
      if (checking || !active || (source && Date.now() < refreshCookieAfter)) return;
      checking = true;
      try {
        const status = await apiRequest<{ allowed: boolean }>(`${base}/access`);
        if (!active) return;
        if (status.allowed) {
          requestedPairing = false;
          refreshCookieAfter = Date.now() + 12 * 60 * 60 * 1000;
          if (source) return;
          const data = await apiRequest<QueueSnapshot>(`${base}/queue`);
          if (!active) return;
          setSnapshot(data); setPairing(null); setError("");
          source = new EventSource(`${API_BASE_URL}${base}/stream`, { withCredentials: true });
          source.onmessage = (event) => { if (active) { setSnapshot(JSON.parse(event.data)); setError(""); } };
          source.addEventListener("access-revoked", () => {
            source?.close(); source = undefined;
            if (active) { setSnapshot(null); setPairing(null); requestedPairing = false; void check(); }
          });
          source.onerror = () => {
            source?.close(); source = undefined;
            if (active) { setSnapshot(null); setError("Connection interrupted. Checking display access…"); }
          };
        } else {
          source?.close(); source = undefined;
          setSnapshot(null);
          if (!requestedPairing) {
            const request = await apiRequest<Pairing>(`${base}/pairing`, { method: "POST", body: {} });
            if (active) { setPairing(request); setError(""); requestedPairing = true; }
          }
        }
      } catch (cause) {
        if (active && !source) { setSnapshot(null); setError(getErrorMessage(cause)); }
      } finally { checking = false; }
    };
    void check();
    const timer = window.setInterval(() => { void check(); }, 2000);
    return () => { active = false; source?.close(); window.clearInterval(timer); };
  }, [boardId, attempt]);
  if (snapshot) return <PublicQueuePage snapshot={snapshot} />;
  return <Card maw={560} mx="auto" my="xl" padding="xl" withBorder>
    <Stack align="center" gap="md">
      <Title order={1} ta="center">Queue board access</Title>
      {error ? <Alert color="red" role="alert">{error}</Alert> : null}
      {pairing ? <>
        <Text ta="center">Ask authorized staff at {pairing.locationName} to scan this QR in the vendor dashboard and approve this display.</Text>
        <StyledQRCode size={220} value={pairing.approvalUrl} />
        <Text>Match code: <Code>{pairing.matchCode}</Code></Text>
        <Text size="sm" ta="center">Compare this code on both screens before approving. Request expires at {new Date(pairing.expiresAt).toLocaleTimeString()}.</Text>
        <Text size="sm">Manual pairing code</Text><Code style={{ overflowWrap: "anywhere" }}>{pairing.code}</Code>
      </> : <Text ta="center">Checking board access…</Text>}
      <Button mih={44} variant="default" onClick={() => setAttempt((value) => value + 1)}>Refresh access request</Button>
    </Stack>
  </Card>;
}
