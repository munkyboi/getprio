import { useEffect, useRef, useState } from "react";
import { TaskDialog } from "../vendor/TaskDialog";
import { Button } from "../vendor/components/ui/button";
import { Alert, AlertDescription } from "../vendor/components/ui/alert";
import { Field, FieldLabel } from "../vendor/components/ui/field";
import { Input } from "../vendor/components/ui/input";
import type { IScannerControls } from "@zxing/browser";

type TicketScannerModalProps = {
  error?: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (lookupCode: string) => Promise<boolean>;
  opened: boolean;
  ticketNumber?: string;
};

export default function TicketScannerModal({
  error = "",
  loading = false,
  onClose,
  onConfirm,
  opened,
  ticketNumber,
}: TicketScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [lookupCode, setLookupCode] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [scanSession, setScanSession] = useState(0);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!opened || !videoRef.current) {
      return undefined;
    }

    let active = true;
    setCameraError("");
    setScanning(true);

    void import("@zxing/browser")
      .then(({ BrowserMultiFormatReader }) => {
        if (!active || !videoRef.current) {
          return undefined;
        }

        const reader = new BrowserMultiFormatReader();
        return reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result, _error, controls) => {
            if (!active || !result) {
              return;
            }

            controls.stop();
            controlsRef.current = null;
            setLookupCode(result.getText().trim().toUpperCase());
            setScanning(false);
          },
        );
      })
      .then((controls) => {
        if (!controls) {
          return;
        }
        if (!active) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      })
      .catch(() => {
        if (active) {
          setCameraError(
            "Camera scanning is unavailable. Check camera permission or enter the ticket code manually.",
          );
          setScanning(false);
        }
      });

    return () => {
      active = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
      setScanning(false);
    };
  }, [opened, scanSession]);

  useEffect(() => {
    if (!opened) {
      setLookupCode("");
      setCameraError("");
      setScanSession(0);
    }
  }, [opened]);

  async function submitCode() {
    const normalizedCode = lookupCode.trim().toUpperCase();
    if (!normalizedCode) {
      return;
    }

    const confirmed = await onConfirm(normalizedCode);
    if (confirmed) {
      onClose();
    }
  }

  return (
    <TaskDialog
      opened={opened}
      onClose={onClose}
      busy={loading}
      eyebrow="QUEUE CHECK-IN"
      title={`Confirm ${ticketNumber || "called ticket"}`}
      description="Scan the customer's QR or ticket code. Only the ticket currently called at this counter can be confirmed."
      footer={
        <>
          <Button variant="outline" disabled={loading} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!lookupCode.trim() || loading}
            aria-busy={loading}
            onClick={() => void submitCode()}
          >
            {loading ? "Confirming…" : "Confirm ticket"}
          </Button>
        </>
      }
    >
      <div className="queue-stack">
        <div className="ticket-scanner-camera">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            aria-label="Ticket scanner camera preview"
          />
          <div className="ticket-scanner-guide" aria-hidden="true" />
        </div>
        <p className="queue-muted queue-small">
          {scanning
            ? "Point the QR or ticket code inside the camera view."
            : lookupCode
              ? "Code captured. Review it before confirming."
              : "Enter the ticket code manually or retry the camera."}
        </p>
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => {
            controlsRef.current?.stop();
            controlsRef.current = null;
            setLookupCode("");
            setScanSession((current) => current + 1);
          }}
        >
          Scan again
        </Button>
        <Field>
          <FieldLabel htmlFor="vendor-ticket-lookup">
            QR value or ticket code
          </FieldLabel>
          <Input
            maxLength={34}
            id="vendor-ticket-lookup"
            value={lookupCode}
            disabled={loading}
            onChange={(event) => setLookupCode(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submitCode();
              }
            }}
            placeholder="Enter or scan the ticket code"
            autoComplete="off"
          />
        </Field>
        {cameraError ? (
          <Alert>
            <AlertDescription>{cameraError}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    </TaskDialog>
  );
}
