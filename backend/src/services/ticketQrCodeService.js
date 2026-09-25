const QRCode = require("qrcode");

const QR_DARK = "#087f5b";
const QR_LIGHT = "#ffffff";

// Keep the mark inline so the API remains self-contained when the backend is built
// from its own Docker context. The white plate and error-correction level protect
// the center mark from reducing scan reliability.
const GETPRIO_MARK = `
  <svg x="9.05" y="9.05" width="6.9" height="6.9" viewBox="0 0 100 70" aria-hidden="true">
    <path fill="#282729" d="M39 9c-15 0-27 11-27 26s12 26 27 26c7 0 13-2 18-7v7c0 9-6 14-17 14-7 0-13-2-18-6l-7 9c7 5 16 8 26 8 18 0 29-9 29-27V10H58v7C53 12 47 9 39 9Zm1 42c-9 0-16-7-16-16s7-16 16-16 16 7 16 16-7 16-16 16Z"/>
    <path fill="#FD8501" d="M57 10h12v8c5-6 11-9 19-9 13 0 23 10 23 25s-10 25-23 25c-8 0-14-3-19-9v20H57V10Zm12 24c0 8 6 14 14 14s14-6 14-14-6-14-14-14-14 6-14 14Z"/>
  </svg>`;

function addBranding(svg) {
  const roundedModules = svg
    .replace('shape-rendering="crispEdges"', 'shape-rendering="geometricPrecision"')
    .replace(
      `<path stroke="${QR_DARK}"`,
      `<path stroke="${QR_DARK}" stroke-linecap="round" stroke-linejoin="round" stroke-width="0.88"`
    );
  const centerPlate = '<rect x="8.55" y="8.55" width="7.9" height="7.9" rx="1.45" fill="#ffffff"/>';
  return roundedModules.replace("</svg>", `${centerPlate}${GETPRIO_MARK}</svg>`);
}

async function generateTicketQr(value) {
  const svg = await QRCode.toString(value, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 2,
    width: 480,
    color: { dark: QR_DARK, light: QR_LIGHT }
  });
  const brandedSvg = addBranding(svg);
  return {
    contentType: "image/svg+xml",
    dataUrl: `data:image/svg+xml;base64,${Buffer.from(brandedSvg).toString("base64")}`
  };
}

module.exports = { generateTicketQr };
