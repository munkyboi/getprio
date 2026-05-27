const fs = require("fs");
const path = require("path");

const out = path.join(__dirname, "getprio-hci-ias-deliverables-cover.pdf");

const details = {
  name: "Roberto Carlo Abella",
  studentId: "2025040965",
  capstoneApp: "GetPrio",
  instructor: "Engr. Vicente Patalita III",
  deliverablesUrl:
    "https://www.figma.com/design/rwKhBnsKjEBprhQpC5kiez/GetPrio-HCI---IAS--UI-UX-?m=auto&t=9NZK7uTNhXUoAGQF-1"
};

const W = 595.28;
const H = 841.89;
const ops = [];

const colors = {
  canvas: [0.98, 0.965, 0.941],
  surface: [1, 1, 1],
  ink: [0.09, 0.13, 0.17],
  muted: [0.35, 0.39, 0.45],
  line: [0.85, 0.81, 0.75],
  orange: [0.92, 0.38, 0.15],
  orangeSoft: [1, 0.92, 0.84],
  blue: [0.12, 0.31, 0.53],
  blueSoft: [0.89, 0.94, 0.98],
  green: [0.05, 0.46, 0.36],
  greenSoft: [0.86, 0.96, 0.93],
  violet: [0.35, 0.25, 0.62],
  violetSoft: [0.93, 0.91, 0.98]
};

function esc(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function color(c) {
  return c.map((v) => Number(v).toFixed(3)).join(" ");
}

function fill(c) {
  ops.push(`${color(c)} rg`);
}

function stroke(c) {
  ops.push(`${color(c)} RG`);
}

function rect(x, y, w, h, fillColor, strokeColor = null) {
  fill(fillColor);
  if (strokeColor) {
    stroke(strokeColor);
    ops.push(`${x} ${y} ${w} ${h} re B`);
  } else {
    ops.push(`${x} ${y} ${w} ${h} re f`);
  }
}

function text(value, x, y, size = 12, opts = {}) {
  const font = opts.bold ? "F2" : "F1";
  const c = opts.color || colors.ink;
  fill(c);
  ops.push("BT");
  ops.push(`/${font} ${size} Tf`);
  ops.push(`${x} ${y} Td`);
  ops.push(`(${esc(value)}) Tj`);
  ops.push("ET");
}

function centered(value, y, size, opts = {}) {
  const approximate = value.length * size * 0.52;
  text(value, (W - approximate) / 2, y, size, opts);
}

function wrap(value, maxChars) {
  const words = String(value).split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (`${current} ${word}`.length <= maxChars) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function paragraph(value, x, y, maxChars, size = 10, lineHeight = 14, opts = {}) {
  const lines = wrap(value, maxChars);
  lines.forEach((line, index) => {
    if (opts.align === "center") {
      const approximate = line.length * size * 0.52;
      text(line, x + (opts.width - approximate) / 2, y - index * lineHeight, size, opts);
    } else {
      text(line, x, y - index * lineHeight, size, opts);
    }
  });
  return y - lines.length * lineHeight;
}

function labelValue(label, value, x, y) {
  text(label.toUpperCase(), x, y, 8, { bold: true, color: colors.muted });
  text(value, x, y - 20, 14, { bold: true, color: colors.ink });
}

function bullet(value, x, y, maxChars, color) {
  rect(x, y + 1, 5, 5, color);
  return paragraph(value, x + 14, y + 7, maxChars, 9.5, 13, { color: colors.ink });
}

function card(title, subtitle, bullets, x, y, w, h, fillColor, accentColor) {
  rect(x, y, w, h, fillColor, accentColor);
  text(title, x + 20, y + h - 36, 18, { bold: true, color: accentColor });
  paragraph(subtitle, x + 20, y + h - 62, 32, 9.5, 13, { color: colors.muted });
  let cursor = y + h - 118;
  for (const item of bullets) {
    cursor = bullet(item, x + 24, cursor, 31, accentColor) - 6;
  }
}

// Background and title
rect(0, 0, W, H, colors.canvas);
centered("CAPSTONE DELIVERABLES", 770, 10, { bold: true, color: colors.orange });
centered("GetPrio", 728, 34, { bold: true, color: colors.ink });
centered("HCI and IAS UI/UX Deliverables", 694, 17, { bold: true, color: colors.ink });
paragraph(
  "Human-Computer Interaction and Information Assurance and Security artifacts for a multi-tenant QR-based digital queue management platform.",
  86,
  662,
  72,
  10,
  14,
  { color: colors.muted, align: "center", width: 423 }
);

// Details block
rect(54, 440, 487, 170, colors.surface, colors.line);
labelValue("Name", details.name, 78, 575);
labelValue("Student ID", details.studentId, 336, 575);
labelValue("Capstone App", details.capstoneApp, 78, 522);
labelValue("Instructor", details.instructor, 336, 522);
text("DELIVERABLES URL", 78, 468, 8, { bold: true, color: colors.muted });
paragraph(details.deliverablesUrl, 78, 450, 86, 8.4, 11, { color: colors.blue });

// HCI / IAS cards
card(
  "HCI",
  "User research, flows, wireframes, usability evidence, and UI/UX presentation boards.",
  [
    "Research board with stakeholders, personas, empathy maps, and problem statements.",
    "Journey maps and affinity/HMW boards for Module 1 framing.",
    "Detailed queue-joining, vendor-operation, and platform-admin wireframes."
  ],
  54,
  190,
  234,
  220,
  colors.blueSoft,
  colors.blue
);

card(
  "IAS",
  "Security, privacy, JWT/RBAC, vulnerability assessment, and post-MVP OAuth2 traceability.",
  [
    "Role-aware screen mapping for customer, vendor staff, vendor admin, and platform admin.",
    "Privacy, data-flow, public-form, payment, and platform-operation risk notes."
  ],
  307,
  190,
  234,
  220,
  colors.violetSoft,
  colors.violet
);

// Theme block
rect(54, 68, 487, 96, colors.surface, colors.line);
text("Capstone Theme", 78, 134, 13, { bold: true, color: colors.green });
paragraph(
  "GetPrio improves service queues by reducing customer uncertainty, lowering staff interruption, and aligning usable interface design with privacy, JWT/session authentication, RBAC authorization, post-MVP OAuth2 planning, and data-integrity concerns.",
  78,
  115,
  82,
  9.7,
  13,
  { color: colors.ink }
);

centered("Generated for capstone submission.", 34, 8.5, { color: colors.muted });

const content = ops.join("\n");

function pdfObject(id, body) {
  return `${id} 0 obj\n${body}\nendobj\n`;
}

const objects = [];
objects[1] = pdfObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
objects[2] = pdfObject(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
objects[3] = pdfObject(
  3,
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`
);
objects[4] = pdfObject(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
objects[5] = pdfObject(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
objects[6] = pdfObject(6, `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`);

let pdf = "%PDF-1.4\n";
const offsets = [0];
for (let i = 1; i <= 6; i += 1) {
  offsets[i] = Buffer.byteLength(pdf, "utf8");
  pdf += objects[i];
}
const xrefOffset = Buffer.byteLength(pdf, "utf8");
pdf += "xref\n0 7\n";
pdf += "0000000000 65535 f \n";
for (let i = 1; i <= 6; i += 1) {
  pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

fs.writeFileSync(out, pdf);
console.log(out);
