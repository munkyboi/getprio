import { useEffect, useRef } from "react";
import QRCodeStyling from "qr-code-styling";

export default function ArrivalQRCode({ value }: Readonly<{ value: string }>) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = container.current;
    if (!target) return;
    target.replaceChildren();
    new QRCodeStyling({
      type: "canvas", width: 232, height: 232, margin: 20, data: value,
      qrOptions: { errorCorrectionLevel: "M" },
      dotsOptions: { color: "#000000", type: "square" },
      backgroundOptions: { color: "#ffffff" }
    }).append(target);
    return () => target.replaceChildren();
  }, [value]);
  return <div className="ticket-page-arrival-qr" ref={container} role="img" aria-label="Current arrival QR barcode" />;
}
