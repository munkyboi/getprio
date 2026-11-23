import { useEffect, useRef, useState } from "react";
import { Alert, Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { IconBarcode, IconCamera, IconRefresh } from "@tabler/icons-react";
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
        return reader.decodeFromVideoDevice(undefined, videoRef.current, (result, _error, controls) => {
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
    <Modal
      centered
      className="customer-modal ticket-scanner-modal"
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
      onClose={onClose}
      opened={opened}
      radius="xl"
      size="md"
      title={
        <div>
          <Text className="neura-label">QUEUE CHECK-IN</Text>
          <Text fw={800} size="xl">Confirm {ticketNumber || "called ticket"}</Text>
        </div>
      }
    >
      <Stack gap="md">
        <Text c="dimmed" size="sm">
          Scan the barcode on the customer&apos;s ticket. Only the currently called ticket can be confirmed.
        </Text>

        <div className="ticket-scanner-camera">
          <video aria-label="Ticket barcode camera preview" autoPlay muted playsInline ref={videoRef} />
          <div className="ticket-scanner-guide" aria-hidden="true" />
          <Text className="ticket-scanner-status" size="xs">
            {scanning ? "Point the barcode inside the frame" : lookupCode ? "Barcode captured" : "Camera stopped"}
          </Text>
        </div>

        {cameraError ? <Alert color="orange" icon={<IconCamera size={18} />}>{cameraError}</Alert> : null}
        {error ? <Alert color="red" icon={<IconBarcode size={18} />}>{error}</Alert> : null}

        <TextInput
          autoCapitalize="characters"
          description="Use this if camera access is unavailable."
          label="Manual ticket code"
          maxLength={8}
          onChange={(event) => setLookupCode(event.currentTarget.value.toUpperCase())}
          placeholder="For example, 3C7DF54B"
          value={lookupCode}
        />

        <Group className="customer-modal-actions" justify="space-between">
          <Button
            disabled={loading || scanning}
            leftSection={<IconRefresh size={16} />}
            onClick={() => {
              controlsRef.current?.stop();
              controlsRef.current = null;
              setLookupCode("");
              setScanSession((current) => current + 1);
            }}
            variant="default"
          >
            Scan again
          </Button>
          <Button
            className="neura-primary-button"
            disabled={!lookupCode.trim()}
            loading={loading}
            onClick={() => void submitCode()}
          >
            Confirm ticket
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
