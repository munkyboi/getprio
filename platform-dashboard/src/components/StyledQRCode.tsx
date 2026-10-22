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
    if (!containerRef.current) {
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

    containerRef.current.replaceChildren();
    qrCode.append(containerRef.current);
    const canvas = containerRef.current.querySelector("canvas");
    if (canvas) {
      canvas.style.display = "block";
      canvas.style.height = `${size}px`;
      canvas.style.width = `${size}px`;
    }

    return () => {
      containerRef.current?.replaceChildren();
    };
  }, [size, value]);

  return <div aria-label={ariaLabel} className={className} ref={containerRef} role={ariaLabel ? "img" : undefined} />;
}
