import {
  OperationPanel,
  OperationButton,
  OperationAlert,
  OperationEmpty,
  OperationQueryState,
} from "../vendor/OperationsUi";
import {
  ConfigurationScope,
  ConfigurationCheck,
  ConfigurationInput,
} from "../vendor/ConfigurationUi";
import { QueueConfirmation, TaskDialog } from "../vendor/TaskDialog";
import { buttonVariants, Button as QueueButton } from "../vendor/components/ui/button";
import { Badge } from "../vendor/components/ui/badge";
import {
  Card as QueueCard,
  CardHeader as QueueCardHeader,
  CardTitle as QueueCardTitle,
  CardDescription as QueueCardDescription,
  CardContent as QueueCardContent,
} from "../vendor/components/ui/card";
import {
  Alert as QueueAlert,
  AlertDescription as QueueAlertDescription,
} from "../vendor/components/ui/alert";
import { Field, FieldLabel } from "../vendor/components/ui/field";
import { Input } from "../vendor/components/ui/input";
import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { apiRequest } from "../api/client";
import { getErrorMessage } from "../utils/errors";

interface Scope {
  token: string;
  tenantSlug: string;
  locationSlug: string;
}
interface Display {
  id: string;
  displayName: string;
  expiresAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
}
interface Settings {
  boardId: string;
  isPublic: boolean;
  displays: Display[];
}
interface Preview {
  locationName: string;
  matchCode: string;
  expiresAt: string;
}
function path(scope: Scope) {
  return `/vendor/${encodeURIComponent(scope.tenantSlug)}/queue-board`;
}
function locationQuery(scope: Scope) {
  return `?location=${encodeURIComponent(scope.locationSlug)}`;
}
export function extractBoardPairingCode(value: string): string {
  const input = value.trim();
  if (/^[a-f0-9]{32}$/i.test(input)) return input.toLowerCase();
  try {
    const url = new URL(input);
    const code = url.searchParams.get("boardPairing") || "";
    if (
      url.origin === window.location.origin &&
      url.pathname === "/dashboard/queue" &&
      /^[a-f0-9]{32}$/i.test(code)
    )
      return code.toLowerCase();
  } catch {
    /* Manual code is validated above. */
  }
  throw new Error(
    "Enter the pairing code or scan a GetPrio queue board access QR.",
  );
}
export function QueueBoardScanner(
  scope: Scope & {
    onBusyChange?: (busy: boolean) => void;
    onDiscard?: () => void;
  },
) {
  const [input, setInput] = useState(
    () => new URLSearchParams(window.location.search).get("boardPairing") || "",
  );
  const [opened, setOpened] = useState(() =>
    Boolean(new URLSearchParams(window.location.search).get("boardPairing")),
  );
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewCode, setPreviewCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const onBusyChange = scope.onBusyChange;
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  useEffect(() => {
    if (!opened || !camera) return;
    let active = true;
    let controls: IScannerControls | undefined;
    void import("@zxing/browser")
      .then(async ({ BrowserQRCodeReader }) => {
        if (!active || !video.current) return;
        const reader = new BrowserQRCodeReader();
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          video.current,
          (result, _error, currentControls) => {
            if (active && result) {
              setInput(result.getText());
              setPreview(null);
              currentControls.stop();
              setCamera(false);
            }
          },
        );
        if (!active) controls.stop();
      })
      .catch(() => {
        if (active) {
          setError(
            "Camera unavailable. Allow camera access or enter the pairing code manually.",
          );
          setCamera(false);
        }
      });
    return () => {
      active = false;
      controls?.stop();
    };
  }, [opened, camera]);
  async function review() {
    if (busy || camera || !input.trim()) return;
    setBusy(true);
    setError("");
    setMessage("");
    setPreview(null);
    try {
      const code = extractBoardPairingCode(input);
      const result = await apiRequest<Preview>(
        `${path(scope)}/pairing/${code}${locationQuery(scope)}`,
        { token: scope.token },
      );
      setPreview(result);
      setPreviewCode(code);
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function approve() {
    if (!preview || busy) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(
        `${path(scope)}/pairing/${previewCode}/approve${locationQuery(scope)}`,
        { method: "POST", token: scope.token, body: { displayName } },
      );
      scope.onDiscard?.();
      setMessage("Display approved for 30 days.");
      setPreview(null);
      setInput("");
      setDisplayName("");
      setOpened(false);
      setCamera(false);
      const url = new URL(window.location.href);
      url.searchParams.delete("boardPairing");
      window.history.replaceState(null, "", url);
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  function closeDialog() {
    if (busy) return;
    scope.onDiscard?.();
    setOpened(false);
    setCamera(false);
  }
  return (
    <>
      <QueueCard>
        <QueueCardHeader>
          <QueueCardDescription>Queue Board Access</QueueCardDescription>
          <QueueCardTitle>Approve a display</QueueCardTitle>
        </QueueCardHeader>
        <QueueCardContent className="queue-stack">
          <p className="queue-muted queue-small">
            Select the display’s location above, then scan its QR to grant
            access.
          </p>
          {message ? <p role="status">{message}</p> : null}
          <QueueButton
            variant="outline"
            onClick={() => {
              setError("");
              setMessage("");
              setPreview(null);
              setOpened(true);
              setCamera(!input.trim());
            }}
          >
            Scan access QR
          </QueueButton>
        </QueueCardContent>
      </QueueCard>
      <TaskDialog
        opened={opened}
        onClose={closeDialog}
        busy={busy}
        eyebrow="QUEUE BOARD ACCESS"
        title="Approve a display"
        description="Scan the QR on the display computer, then compare the match code before approving."
        footer={
          <>
            <QueueButton
              variant="outline"
              disabled={busy}
              onClick={closeDialog}
            >
              Cancel
            </QueueButton>
            <QueueButton
              type="submit"
              form="queue-board-pairing-form"
              disabled={
                busy ||
                camera ||
                (preview ? !displayName.trim() : !input.trim())
              }
              aria-busy={busy}
            >
              {busy
                ? "Working…"
                : preview
                  ? "Approve display"
                  : "Review display request"}
            </QueueButton>
          </>
        }
      >
        <form
          id="queue-board-pairing-form"
          className="queue-stack"
          onSubmit={(event) => {
            event.preventDefault();
            void (preview ? approve() : review());
          }}
        >
          {camera ? (
            <div className="ticket-scanner-camera">
              <video
                aria-label="Queue board QR camera preview"
                autoPlay
                muted
                playsInline
                ref={video}
              />
              <div className="ticket-scanner-guide" aria-hidden="true" />
            </div>
          ) : null}
          <QueueButton
            variant="outline"
            disabled={busy}
            onClick={() => {
              setPreview(null);
              setCamera((current) => !current);
            }}
          >
            {camera ? "Enter code manually" : "Use camera"}
          </QueueButton>
          <Field>
            <FieldLabel htmlFor="queue-board-pairing">
              Pairing code or QR URL
            </FieldLabel>
            <Input
              id="queue-board-pairing"
              value={input}
              disabled={busy || camera}
              autoComplete="off"
              onChange={(event) => {
                setInput(event.currentTarget.value);
                setPreview(null);
              }}
            />
          </Field>
          {error ? (
            <QueueAlert variant="destructive" role="alert">
              <QueueAlertDescription>{error}</QueueAlertDescription>
            </QueueAlert>
          ) : null}
          {preview ? (
            <>
              <p className="queue-strong">
                {preview.locationName} · Match code {preview.matchCode}
              </p>
              <p className="queue-muted queue-small">
                Confirm this matches the physical display. Expires at{" "}
                {new Date(preview.expiresAt).toLocaleTimeString()}.
              </p>
              <Field>
                <FieldLabel htmlFor="queue-board-display-name">
                  Display name
                </FieldLabel>
                <Input
                  id="queue-board-display-name"
                  maxLength={80}
                  value={displayName}
                  disabled={busy}
                  onChange={(event) =>
                    setDisplayName(event.currentTarget.value)
                  }
                  placeholder="For example, reception TV"
                />
              </Field>
            </>
          ) : null}
        </form>
      </TaskDialog>
    </>
  );
}

type BoardChange = {
  title: string;
  description: string;
  label: string;
  suffix: string;
  method: string;
  body: unknown;
  destructive: boolean;
};
export function QueueBoardSettings({
  token,
  tenantSlug,
  locationSlug,
  onChanged,
  onBusyChange,
}: Scope & { onChanged?: () => void; onBusyChange?: (busy: boolean) => void }) {
  const scope = { token, tenantSlug, locationSlug };
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<BoardChange | null>(null);
  const [copyMessage, setCopyMessage] = useState("");
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    setSettings(null);
    apiRequest<Settings>(
      `/vendor/${encodeURIComponent(tenantSlug)}/queue-board?location=${encodeURIComponent(locationSlug)}`,
      { token, signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted) setSettings(value);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setLoadError(cause);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [token, tenantSlug, locationSlug, retry]);
  const requestChange = (change: BoardChange) => {
    if (busy) return;
    setError("");
    setConfirmation(change);
  };
  async function change() {
    if (!confirmation || busy) return;
    setBusy(true);
    setError("");
    try {
      const value = await apiRequest<Settings>(
        `${path(scope)}${confirmation.suffix}${locationQuery(scope)}`,
        {
          method: confirmation.method,
          token: scope.token,
          body: confirmation.body,
        },
      );
      setSettings(value);
      setConfirmation(null);
      setCopyMessage("");
      onChanged?.();
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  const boardUrl = settings
    ? `${window.location.origin}/queue-board/${settings.boardId}`
    : "";
  return (
    <ConfigurationScope busy={busy}>
      <OperationPanel>
        <div className="queue-stack">
          <div className="ops-list-heading">
            <h2>Queue board access</h2>
            <p className="ops-muted">
              Access for the selected location. Private boards require approval
              for each display browser; sharing their URL does not grant access.
            </p>
          </div>
          {loading || loadError ? (
            <OperationQueryState
              loading={loading}
              error={loadError}
              onRetry={() => setRetry((value) => value + 1)}
            />
          ) : settings ? (
            <>
              <ConfigurationCheck
                label="Open queue board to the public"
                description={
                  settings.isPublic
                    ? "Anyone with the URL can view this board."
                    : "Each display browser requires staff approval."
                }
                checked={settings.isPublic}
                onChange={(event) => {
                  const isPublic = event.currentTarget.checked;
                  requestChange({
                    title: isPublic
                      ? "Open this board to the public?"
                      : "Require display approval?",
                    description: isPublic
                      ? "Anyone with this location’s board URL will be able to view its queue."
                      : "Display browsers will require an approved access grant. Public visitors will see a pairing QR instead of queue data.",
                    label: isPublic ? "Open to the public" : "Require approval",
                    suffix: "",
                    method: "PATCH",
                    body: { isPublic },
                    destructive: isPublic,
                  });
                }}
              />
              <ConfigurationInput
                label="Queue board URL"
                readOnly
                value={boardUrl}
              />
              <div className="ops-row config-actions">
                <a
                  className={buttonVariants({ variant: "outline" })}
                  target="_blank"
                  rel="noopener noreferrer"
                  href={`/queue-board/${settings.boardId}`}
                >
                  Open board
                </a>
                <OperationButton
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(boardUrl)
                      .then(() => setCopyMessage("Board URL copied."))
                      .catch(() =>
                        setCopyMessage(
                          "Could not copy the URL. Select and copy it from the field above.",
                        ),
                      );
                  }}
                >
                  Copy board URL
                </OperationButton>
                <OperationButton
                  variant="outline"
                  onClick={() =>
                    requestChange({
                      title: "Regenerate board URL?",
                      description:
                        "The old URL will stop working. Approved displays and pending pairing requests are revoked; private displays will need approval again.",
                      label: "Regenerate and revoke displays",
                      suffix: "",
                      method: "PATCH",
                      body: { rotate: true },
                      destructive: true,
                    })
                  }
                >
                  Regenerate URL
                </OperationButton>
              </div>
              {copyMessage ? <p role="status">{copyMessage}</p> : null}
              <h3 className="ops-strong">Approved displays</h3>
              {settings.displays.length ? (
                <div className="config-catalog-list">
                  {settings.displays.map((display) => (
                    <div className="config-summary" key={display.id}>
                      <div className="config-catalog-content">
                        <p className="ops-strong">{display.displayName}</p>
                        <Badge variant="secondary">
                          {display.revokedAt
                            ? "Revoked"
                            : Date.parse(display.expiresAt) <= Date.now()
                              ? "Expired"
                              : "Approved"}
                        </Badge>
                        <p>
                          Expires {new Date(display.expiresAt).toLocaleString()}
                        </p>
                        <p className="ops-muted">
                          Last active:{" "}
                          {display.lastSeenAt
                            ? new Date(display.lastSeenAt).toLocaleString()
                            : "Not connected yet"}
                        </p>
                      </div>
                      {!display.revokedAt ? (
                        <div className="config-catalog-actions">
                          <OperationButton
                            variant="outline"
                            aria-label={`Renew ${display.displayName} for 30 days`}
                            onClick={() =>
                              requestChange({
                                title: `Renew ${display.displayName}?`,
                                description:
                                  "Grant this display browser access for another 30 days.",
                                label: "Renew for 30 days",
                                suffix: `/displays/${encodeURIComponent(display.id)}/renew`,
                                method: "POST",
                                body: {},
                                destructive: false,
                              })
                            }
                          >
                            Renew for 30 days
                          </OperationButton>
                          <OperationButton
                            variant="destructive"
                            aria-label={`Revoke ${display.displayName}`}
                            onClick={() =>
                              requestChange({
                                title: `Revoke ${display.displayName}?`,
                                description:
                                  "This display browser will lose its approval. A private board will require a new pairing request and staff approval.",
                                label: "Revoke display",
                                suffix: `/displays/${encodeURIComponent(display.id)}/revoke`,
                                method: "POST",
                                body: {},
                                destructive: true,
                              })
                            }
                          >
                            Revoke
                          </OperationButton>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <OperationEmpty
                  title="No approved displays"
                  text="Open the private board on the display computer, then approve its pairing QR from Live Queue."
                />
              )}
            </>
          ) : (
            <OperationAlert color="red">
              Board settings are unavailable. Retry before changing access.
            </OperationAlert>
          )}
        </div>
      </OperationPanel>
      <QueueConfirmation
        opened={Boolean(confirmation)}
        eyebrow="QUEUE BOARD"
        title={confirmation?.title || ""}
        description={confirmation?.description || ""}
        confirmLabel={confirmation?.label || "Confirm"}
        confirmColor={confirmation?.destructive ? "red" : "blue"}
        loading={busy}
        error={error}
        onClose={() => {
          if (!busy) {
            setConfirmation(null);
            setError("");
          }
        }}
        onConfirm={() => void change()}
      />
    </ConfigurationScope>
  );
}
