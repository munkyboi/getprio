const fs = require("node:fs");
const path = require("node:path");
const QRCode = require("qrcode");

const QR_DARK = "#087f5b";
const QR_LIGHT = "#ffffff";
const LOGO_FILE = "getprio-logo-traced.svg";

function readLogoBody() {
  const logoPaths = [
    path.resolve(__dirname, "../assets", LOGO_FILE),
    path.resolve(__dirname, "../../src/assets", LOGO_FILE)
  ];
  const logoPath = logoPaths.find((candidate) => fs.existsSync(candidate));
  if (!logoPath) throw new Error(`GetPrio QR logo asset is missing: ${LOGO_FILE}`);

  return fs.readFileSync(logoPath, "utf8")
    .replace(/^.*?<svg[^>]*>/s, "")
    .replace(/<\/svg>\s*$/s, "")
    .replace(/<title[\s\S]*?<\/title>\s*|<desc[\s\S]*?<\/desc>\s*/g, "")
    .trim();
}

const LOGO_BODY = readLogoBody();

function addCenterLogo(svg) {
  // Keep the QR library's native crisp square modules. Only remove a small
  // center area for the real logo; error correction level H covers that area.
  const centerPlate = '<rect x="9.5" y="9.5" width="6" height="6" rx="0.9" fill="#ffffff"/>';
  const centerLogo = `<svg x="9.9" y="9.9" width="5.2" height="5.2" viewBox="0 0 1254 1254" aria-hidden="true">${LOGO_BODY}</svg>`;
  return svg.replace("</svg>", `${centerPlate}${centerLogo}</svg>`);
}

async function generateTicketQr(value) {
  const svg = await QRCode.toString(value, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 2,
    width: 480,
    color: { dark: QR_DARK, light: QR_LIGHT }
  });
  const brandedSvg = addCenterLogo(svg);
  return {
    contentType: "image/svg+xml",
    dataUrl: `data:image/svg+xml;base64,${Buffer.from(brandedSvg).toString("base64")}`
  };
}

module.exports = { generateTicketQr };
