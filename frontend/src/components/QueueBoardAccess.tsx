import { useEffect, useRef, useState } from "react";
import { Alert, Button, Card, Group, Stack, Switch, Text, TextInput, Title } from "@mantine/core";
import type { IScannerControls } from "@zxing/browser";
import { apiRequest } from "../api/client";
import { getErrorMessage } from "../utils/errors";

interface Scope { token: string; tenantSlug: string; locationSlug: string }
interface Display { id: string; displayName: string; expiresAt: string; lastSeenAt: string | null; revokedAt: string | null }
interface Settings { boardId: string; isPublic: boolean; displays: Display[] }
interface Preview { locationName: string; matchCode: string; expiresAt: string }
function path(scope: Scope) { return `/vendor/${encodeURIComponent(scope.tenantSlug)}/queue-board`; }
function locationQuery(scope: Scope) { return `?location=${encodeURIComponent(scope.locationSlug)}`; }
export function extractBoardPairingCode(value: string): string {
  const input = value.trim();
  if (/^[a-f0-9]{32}$/i.test(input)) return input.toLowerCase();
  try {
    const url = new URL(input);
    const code = url.searchParams.get("boardPairing") || "";
    if (url.origin === window.location.origin && url.pathname === "/dashboard/queue" && /^[a-f0-9]{32}$/i.test(code)) return code.toLowerCase();
  } catch { /* Manual code is validated above. */ }
  throw new Error("Enter the pairing code or scan a GetPrio queue board access QR.");
}
export function QueueBoardScanner(scope: Scope) {
  const [input, setInput] = useState(() => new URLSearchParams(window.location.search).get("boardPairing") || "");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewCode, setPreviewCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!camera) return;
    let active = true;
    let controls: IScannerControls | undefined;
    void import("@zxing/browser").then(async ({ BrowserQRCodeReader }) => {
      if (!active || !video.current) return;
      const reader = new BrowserQRCodeReader();
      controls = await reader.decodeFromConstraints({ video: { facingMode: "environment" } }, video.current, (result, _error, currentControls) => {
        if (active && result) { setInput(result.getText()); setPreview(null); currentControls.stop(); setCamera(false); }
      });
      if (!active) controls.stop();
    }).catch(() => { if (active) { setError("Camera unavailable. Allow camera access or enter the pairing code manually."); setCamera(false); } });
    return () => { active = false; controls?.stop(); };
  }, [camera]);
  async function review() {
    setBusy(true); setError(""); setMessage(""); setPreview(null);
    try {
      const code = extractBoardPairingCode(input);
      const result = await apiRequest<Preview>(`${path(scope)}/pairing/${code}${locationQuery(scope)}`, { token: scope.token });
      setPreview(result); setPreviewCode(code);
    } catch (cause) { setError(getErrorMessage(cause)); }
    finally { setBusy(false); }
  }
  async function approve() {
    if (!preview) return;
    setBusy(true); setError("");
    try {
      await apiRequest(`${path(scope)}/pairing/${previewCode}/approve${locationQuery(scope)}`, { method: "POST", token: scope.token, body: { displayName } });
      setMessage("Display approved for 30 days."); setPreview(null); setInput(""); setDisplayName("");
      const url = new URL(window.location.href); url.searchParams.delete("boardPairing"); window.history.replaceState(null, "", url);
    } catch (cause) { setError(getErrorMessage(cause)); }
    finally { setBusy(false); }
  }
  return <Card className="neura-card" padding="lg" mt="md">
    <Stack gap="md">
      <div><Text className="neura-label">Queue Board Access</Text><Title order={3}>Approve a display</Title></div>
      <Text size="sm" c="dimmed">Scan the QR on the display computer. Select its location above, then compare the match code before approving.</Text>
      {error ? <Alert color="red" role="alert">{error}</Alert> : null}
      {message ? <Text role="status">{message}</Text> : null}
      <Button mih={44} variant="default" disabled={busy} onClick={() => { setError(""); setCamera(!camera); }}>{camera ? "Stop camera" : "Scan access QR"}</Button>
      {camera ? <video aria-label="Queue board QR camera preview" autoPlay muted playsInline ref={video} style={{ width: "100%", maxHeight: 280, objectFit: "contain" }} /> : null}
      <TextInput label="Pairing code or QR URL" value={input} disabled={busy} onChange={(event) => { setInput(event.currentTarget.value); setPreview(null); }} />
      <Button mih={44} loading={busy} disabled={!input || camera} onClick={() => void review()} variant="default">Review display request</Button>
      {preview ? <>
        <Text fw={700}>{preview.locationName} · Match code {preview.matchCode}</Text>
        <Text size="sm">Confirm this matches the physical display. Expires at {new Date(preview.expiresAt).toLocaleTimeString()}.</Text>
        <TextInput label="Display name" maxLength={80} value={displayName} disabled={busy} onChange={(event) => setDisplayName(event.currentTarget.value)} placeholder="For example, reception TV" />
        <Button mih={44} loading={busy} disabled={!displayName.trim()} onClick={() => void approve()}>Approve matching display</Button>
      </> : null}
    </Stack>
  </Card>;
}
export function QueueBoardSettings({ token, tenantSlug, locationSlug, onChanged }: Scope & { onChanged?: () => void }) {
  const scope = { token, tenantSlug, locationSlug };
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [rotateConfirm, setRotateConfirm] = useState(false);
  useEffect(() => {
    let active = true;
    apiRequest<Settings>(`/vendor/${encodeURIComponent(tenantSlug)}/queue-board?location=${encodeURIComponent(locationSlug)}`, { token })
      .then((value) => { if (active) setSettings(value); }).catch((cause) => { if (active) setError(getErrorMessage(cause)); });
    return () => { active = false; };
  }, [token, tenantSlug, locationSlug]);
  async function change(suffix: string, method: string, body?: unknown) {
    setBusy(true); setError("");
    try {
      const value = await apiRequest<Settings>(`${path(scope)}${suffix}${locationQuery(scope)}`, { method, token: scope.token, body });
      setSettings(value); setRotateConfirm(false); onChanged?.();
    } catch (cause) { setError(getErrorMessage(cause)); }
    finally { setBusy(false); }
  }
  return <Stack gap="md">
    <Title order={3}>Queue board</Title>
    <Text c="dimmed" size="sm">Access for the selected location. Approval required keeps the board available only to approved display browsers.</Text>
    {error ? <Alert color="red" role="alert">{error}</Alert> : null}
    {settings ? <>
      <Switch label="Open queue board to the public" description={settings.isPublic ? "Anyone with the URL can view this board." : "Each display browser requires staff approval."} checked={settings.isPublic} disabled={busy} onChange={(event) => void change("", "PATCH", { isPublic: event.currentTarget.checked })} />
      <TextInput label="Queue board URL" readOnly value={`${window.location.origin}/queue-board/${settings.boardId}`} />
      <Group><Button component="a" target="_blank" rel="noopener noreferrer" href={`/queue-board/${settings.boardId}`} mih={44} variant="default">Open board</Button>
        <Button variant="default" mih={44} disabled={busy} onClick={() => setRotateConfirm(true)}>Regenerate URL</Button></Group>
      {rotateConfirm ? <Alert color="orange" title="Regenerate board URL?">
        <Text size="sm">The old URL will stop working and all displays will need approval again.</Text>
        <Group mt="sm"><Button color="red" loading={busy} onClick={() => void change("", "PATCH", { rotate: true })}>Regenerate and revoke displays</Button><Button variant="default" disabled={busy} onClick={() => setRotateConfirm(false)}>Cancel</Button></Group>
      </Alert> : null}
      <Title order={4}>Approved displays</Title>
      {settings.displays.length ? settings.displays.map((display) => <Card key={display.id} withBorder>
        <Stack gap="xs"><Text fw={700}>{display.displayName}</Text>
          <Text size="sm">{display.revokedAt ? "Revoked" : `Expires ${new Date(display.expiresAt).toLocaleString()}`}</Text>
          <Text size="sm" c="dimmed">Last active: {display.lastSeenAt ? new Date(display.lastSeenAt).toLocaleString() : "Not connected yet"}</Text>
          {!display.revokedAt ? <Group><Button variant="default" mih={44} disabled={busy} onClick={() => void change(`/displays/${display.id}/renew`, "POST", {})}>Renew for 30 days</Button><Button color="red" variant="light" mih={44} disabled={busy} onClick={() => void change(`/displays/${display.id}/revoke`, "POST", {})}>Revoke</Button></Group> : null}
        </Stack>
      </Card>) : <Text>No approved displays yet.</Text>}
    </> : <Text>Loading board settings…</Text>}
  </Stack>;
}
