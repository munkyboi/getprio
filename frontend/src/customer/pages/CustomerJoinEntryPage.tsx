import { CardHeader, CardTitle, CardContent, CardFooter } from "../components/ui";
import { Field, FieldLabel } from "../components/shadcn/field";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ScanLine as IconScan,
  ArrowRight as IconArrowRight,
} from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "../components/shadcn/sheet";
import { appUrl } from "../../surfaces/surfaceConfig";
import { Button, Card, Input, Alert } from "../components/ui";
import { CustomerPage } from "../components/account/CustomerPage";
import { resolveCustomerJoin } from "../components/account/resolveCustomerJoin";
export default function CustomerJoinEntryPage() {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [camera, setCamera] = useState(false);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(
    null,
  );
  const navigate = useNavigate();
  const supported =
    window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
  useEffect(() => {
    if (!camera || !videoElement) return;
    let disposed = false;
    let controls: { stop: () => void } | undefined;
    const element = videoElement;
    const stop = () => {
      controls?.stop();
      const stream = element?.srcObject;
      if (stream instanceof MediaStream)
        stream.getTracks().forEach((track) => track.stop());
      if (element) element.srcObject = null;
    };
    void import("@zxing/browser")
      .then(async ({ BrowserQRCodeReader }) => {
        if (disposed || !element) return;
        const reader = new BrowserQRCodeReader();
        controls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: "environment" } },
          element,
          (result) => {
            if (disposed || !result) return;
            const text = result.getText();
            if (
              resolveCustomerJoin(
                text,
                window.location.origin,
                appUrl("customer"),
              )
            ) {
              setValue(text);
              setError("");
              setCamera(false);
            } else setError("This QR code is not a GetPrio queue link.");
          },
        );
        if (disposed) stop();
      })
      .catch(() => {
        if (!disposed) {
          setError(
            "Camera access is unavailable. Paste a queue link or choose a vendor instead.",
          );
          setCamera(false);
        }
      });
    return () => {
      disposed = true;
      stop();
    };
  }, [camera, videoElement]);
  return (
    <CustomerPage
      title="Join a queue."
      subtitle="Scan a business QR code or paste its queue link."
    >
      <Card className="customer-join-entry-card">
        <CardHeader><CardTitle>Have a queue link?</CardTitle></CardHeader>
        <CardContent><form
          id="customer-find-queue"
          className="customer-page-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const path = resolveCustomerJoin(
              value,
              window.location.origin,
              appUrl("customer"),
            );
            if (path) navigate(path);
            else setError("Enter a valid GetPrio queue link.");
          }}
        >
          <Field className="customer-shadcn-field"><FieldLabel className="customer-field">
            Queue link
            <Input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="https://app.getprio.online/join/…"
            />
          </FieldLabel></Field>
          {error ? <Alert data-intent="error">{error}</Alert> : null}
          <div className="customer-join-entry-actions">
            {supported ? (
              <Button
                variant="outline"
                type="button"
                onClick={() => setCamera(true)}
              >
                <IconScan />
                Scan QR code
              </Button>
            ) : null}
          </div>
        </form></CardContent>
        <CardFooter data-slot="card-footer"><Button type="submit" form="customer-find-queue">Find queue<IconArrowRight /></Button></CardFooter>
      </Card>
      <Link to="/vendors?intent=join">Explore vendors instead</Link>
      <Sheet open={camera} onOpenChange={setCamera}>
          <SheetContent showCloseButton={false} className="customer-vendor-drawer">
            <header>
              <SheetTitle>Scan queue QR code</SheetTitle>
              <SheetClose render={<Button variant="ghost" />}>
                Close
              </SheetClose>
            </header>
            <div className="customer-drawer-body">
              <video
                ref={setVideoElement}
                autoPlay
                playsInline
                muted
                className="customer-camera-video"
              />
              <p>Point your camera at the business's GetPrio queue QR code.</p>
            </div>
          </SheetContent>
      </Sheet>
    </CustomerPage>
  );
}
