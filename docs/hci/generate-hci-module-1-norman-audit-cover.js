const fs = require("fs");
const path = require("path");

const out = path.join(__dirname, "getprio-hci-module-1-norman-audit-cover.pdf");

const details = {
  name: "Roberto Carlo Abella",
  studentId: "2025040965",
  capstoneApp: "GetPrio",
  instructor: "Engr. Vicente Patalita III",
  module: "HCI Module 1",
  deliverable: "Norman's Principles Audit + Capstone App HCI Lens",
  figmaUrl:
    "https://www.figma.com/design/rwKhBnsKjEBprhQpC5kiez/GetPrio-HCI---IAS--UI-UX-?node-id=61-2"
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
  blue: [0.12, 0.31, 0.53],
  blueSoft: [0.89, 0.94, 0.98],
  green: [0.05, 0.46, 0.36],
  greenSoft: [0.86, 0.96, 0.93],
  violet: [0.35, 0.25, 0.62],
  violetSoft: [0.93, 0.91, 0.98]
};

function esc(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
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
  fill(opts.color || colors.ink);
  ops.push("BT");
  ops.push(`/${opts.bold ? "F2" : "F1"} ${size} Tf`);
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
    if (!current) current = word;
    else if (`${current} ${word}`.length <= maxChars) current += ` ${word}`;
    else {
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

function labelValue(label, value, x, y, w = 210) {
  text(label.toUpperCase(), x, y, 8, { bold: true, color: colors.muted });
  paragraph(value, x, y - 20, Math.floor(w / 5.4), 13.4, 16, { bold: true, color: colors.ink });
}

function bullet(value, x, y, maxChars, color) {
  rect(x, y + 5, 5, 5, color);
  return paragraph(value, x + 14, y + 10, maxChars, 9.3, 12.5, { color: colors.ink });
}

function card(title, bullets, x, y, w, h, fillColor, accentColor) {
  rect(x, y, w, h, fillColor, accentColor);
  text(title, x + 18, y + h - 34, 15.5, { bold: true, color: accentColor });
  let cursor = y + h - 76;
  for (const item of bullets) {
    cursor = bullet(item, x + 20, cursor, Math.floor((w - 48) / 5.2), accentColor) - 9;
  }
}

rect(0, 0, W, H, colors.canvas);
centered("HCI MODULE 1 DELIVERABLE", 770, 10, { bold: true, color: colors.orange });
centered("GetPrio", 728, 34, { bold: true, color: colors.ink });
centered("Norman's Principles Audit", 694, 17, { bold: true, color: colors.ink });
centered("+ Capstone App HCI Lens", 668, 15, { bold: true, color: colors.ink });
paragraph(
  "Cover sheet for the HCI Module 1 Norman audit boards and GetPrio-specific HCI lens deliverable.",
  86,
  636,
  72,
  10,
  14,
  { color: colors.muted, align: "center", width: 423 }
);

rect(54, 430, 487, 180, colors.surface, colors.line);
labelValue("Name", details.name, 78, 575);
labelValue("Student ID", details.studentId, 336, 575);
labelValue("Capstone App", details.capstoneApp, 78, 522);
labelValue("Instructor", details.instructor, 336, 522);
labelValue("Module", details.module, 78, 474);
labelValue("Deliverable", details.deliverable, 336, 474, 180);

rect(54, 328, 487, 78, colors.blueSoft, colors.blue);
text("Figma Board URL", 78, 374, 13, { bold: true, color: colors.blue });
paragraph(details.figmaUrl, 78, 352, 86, 8.4, 11, { color: colors.blue });

card(
  "Included Boards",
  [
    "Deliverable overview and Capstone App HCI Lens.",
    "Norman-style principles audit matrix.",
    "Screen-level HCI lens for customer, vendor, and admin flows.",
    "Findings and recommendations."
  ],
  54,
  124,
  234,
  170,
  colors.greenSoft,
  colors.green
);

card(
  "Audit Lens",
  [
    "Visibility, feedback, affordances, signifiers, mapping, constraints, conceptual model, and error recovery.",
    "Applied to GetPrio queue, OTP, public board, RBAC, and admin screens."
  ],
  307,
  124,
  234,
  170,
  colors.violetSoft,
  colors.violet
);

centered("Generated for capstone submission.", 56, 8.5, { color: colors.muted });

const content = ops.join("\n");

function pdfObject(id, body) {
  return `${id} 0 obj\n${body}\nendobj\n`;
}

const objects = [];
objects[1] = pdfObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
objects[2] = pdfObject(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
objects[3] = pdfObject(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`);
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
