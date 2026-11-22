import { useEffect, useRef } from "react";
import QRCodeStyling from "qr-code-styling";

type StyledQRCodeProps = {
  "aria-label"?: string;
  className?: string;
  size?: number;
  value: string;
};

export default function StyledQRCode({ "aria-label": ariaLabel, className, size = 192, value }: StyledQRCodeProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const renderSize = size * 4;
    const qrCode = new QRCodeStyling({
      type: "canvas",
      width: renderSize,
      height: renderSize,
      data: value,
      image: "/logo.svg",
      qrOptions: { errorCorrectionLevel: "H" },
      dotsOptions: { color: "#087f5b", type: "dots" },
      cornersSquareOptions: { color: "#087f5b", type: "extra-rounded" },
      cornersDotOptions: { color: "#087f5b", type: "dot" },
      backgroundOptions: { color: "#ffffff" },
      imageOptions: {
        crossOrigin: "anonymous",
        hideBackgroundDots: true,
        imageSize: 0.22,
        margin: 8,
        saveAsBlob: true
      }
    });

    container.replaceChildren();
    qrCode.append(container);
    const canvas = container.querySelector("canvas");
    if (canvas) {
      canvas.style.display = "block";
      canvas.style.height = `${size}px`;
      canvas.style.width = `${size}px`;
    }
    return () => {
      container.replaceChildren();
    };
  }, [size, value]);

  return <div aria-label={ariaLabel} className={className} ref={containerRef} role={ariaLabel ? "img" : undefined} />;
}

export function getStyledQRCodeCanvas(container: HTMLDivElement | null): HTMLCanvasElement | null {
  return container?.querySelector("canvas") || null;
}
