import { useEffect, useRef, useState } from "react";
import { IconRefresh } from "@tabler/icons-react";
import { TaskDialog } from "../vendor/TaskDialog";
import { ConfigurationInput } from "../vendor/ConfigurationUi";
import { OperationAlert } from "../vendor/OperationsUi";
import { Button } from "../vendor/components/ui/button";
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
  ticketNumber
}: TicketScannerModalProps) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [lookupCode, setLookupCode] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [scanSession, setScanSession] = useState(0);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!opened || !video) {
      return undefined;
    }

    let active = true;
    setCameraError("");
    setScanning(true);

    void import("@zxing/browser")
      .then(({ BrowserMultiFormatReader }) => {
        if (!active) {
          return undefined;
        }

        const reader = new BrowserMultiFormatReader();
        return reader.decodeFromVideoDevice(undefined, video, (result, _error, controls) => {
          if (!active || !result) {
            return;
          }

          controls.stop();
          controlsRef.current = null;
          setLookupCode(result.getText().trim().toUpperCase());
          setScanning(false);
        });
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
          setCameraError("Camera scanning is unavailable. Check camera permission or enter the ticket code manually.");
          setScanning(false);
        }
      });

    return () => {
      active = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
      setScanning(false);
    };
  }, [opened, scanSession, video]);

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
      busy={loading}
      onClose={onClose}
      title={`Confirm ${ticketNumber || "called ticket"}`}
      description="Scan the barcode on the customer's ticket. Only the currently called ticket can be confirmed."
      footer={
        <>
          <Button
            variant="outline"
            disabled={loading || scanning}
            onClick={() => {
              controlsRef.current?.stop();
              controlsRef.current = null;
              setLookupCode("");
              setScanSession(current => current + 1);
            }}
          >
            <IconRefresh size={16} aria-hidden /> Scan again
          </Button>
          <Button disabled={loading || !lookupCode.trim()} aria-busy={loading} onClick={() => void submitCode()}>
            Confirm ticket
          </Button>
        </>
      }
    >
      <div className="queue-stack">
        <div className="ticket-scanner-camera">
          <video aria-label="Ticket barcode camera preview" autoPlay muted playsInline ref={setVideo} />
          <div className="ticket-scanner-guide" aria-hidden="true" />
          <p className="ticket-scanner-status v:text-xs">
            {scanning ? "Point the barcode inside the frame" : lookupCode ? "Barcode captured" : "Camera stopped"}
          </p>
        </div>
        {cameraError && <OperationAlert color="orange">{cameraError}</OperationAlert>}
        {error && <OperationAlert color="red">{error}</OperationAlert>}
        <ConfigurationInput
          autoCapitalize="characters"
          description="Use this if camera access is unavailable."
          label="Manual ticket code"
          maxLength={8}
          onChange={event => setLookupCode(event.currentTarget.value.toUpperCase())}
          placeholder="For example, 3C7DF54B"
          value={lookupCode}
        />
      </div>
    </TaskDialog>
  );
}
