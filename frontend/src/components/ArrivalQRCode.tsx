import { useEffect, useState } from "react";
import QRCodeStyling from "qr-code-styling";

export default function ArrivalQRCode({ value }: Readonly<{ value: string }>) {
  const [image, setImage] = useState<{ value: string; url: string } | null>(null);
  useEffect(() => {
    let active = true;
    let url: string | undefined;
    const qr = new QRCodeStyling({
      type: "canvas", width: 232, height: 232, margin: 20, data: value,
      qrOptions: { errorCorrectionLevel: "M" },
      dotsOptions: { color: "#000000", type: "square" },
      backgroundOptions: { color: "#ffffff" }
    });
    void qr.getRawData("png").then((blob) => {
      if (!active || !(blob instanceof Blob)) return;
      url = URL.createObjectURL(blob);
      setImage({ value, url });
    }).catch(() => {
      if (active) setImage(null);
    });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [value]);
  return <div className="ticket-page-arrival-qr">
    {image?.value === value ? <img src={image.url} alt="Current arrival QR barcode" width={232} height={232} /> :
      <span>Preparing arrival QR barcode…</span>}
  </div>;
}
