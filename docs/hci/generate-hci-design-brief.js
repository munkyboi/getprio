const fs = require("fs");
const path = require("path");

const out = path.join(__dirname, "getprio-hci-design-brief.pdf");

const W = 595.28;
const H = 841.89;
const M = 46;
const objects = [];
const pages = [];

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
  violetSoft: [0.93, 0.91, 0.98],
  red: [0.78, 0.16, 0.16],
  redSoft: [1, 0.89, 0.88]
};

let ops = [];

function esc(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function c(value) {
  return value.map((n) => Number(n).toFixed(3)).join(" ");
}

function fill(color) {
  ops.push(`${c(color)} rg`);
}

function stroke(color) {
  ops.push(`${c(color)} RG`);
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

function text(value, x, y, size = 11, opts = {}) {
  fill(opts.color || colors.ink);
  ops.push("BT");
  ops.push(`/${opts.bold ? "F2" : "F1"} ${size} Tf`);
  ops.push(`${x} ${y} Td`);
  ops.push(`(${esc(value)}) Tj`);
  ops.push("ET");
}

function centered(value, y, size, opts = {}) {
  const approx = value.length * size * 0.52;
  text(value, (W - approx) / 2, y, size, opts);
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

function paragraph(value, x, y, maxChars, size = 10, lineHeight = 13, opts = {}) {
  const lines = wrap(value, maxChars);
  lines.forEach((line, index) => text(line, x, y - index * lineHeight, size, opts));
  return y - lines.length * lineHeight;
}

function bullet(value, x, y, maxChars, color = colors.orange, size = 9.6, lineHeight = 13) {
  const markerSize = 5;
  const markerY = y + 7 + size * 0.38;
  rect(x, markerY, markerSize, markerSize, color);
  return paragraph(value, x + 14, y + 7, maxChars, size, lineHeight, { color: colors.ink });
}

function bulletList(items, x, y, maxChars, color, size = 9.6, lineHeight = 13, gap = 10) {
  return items.reduce((cursor, item) => {
    const next = bullet(item, x, cursor, maxChars, color, size, lineHeight);
    return next - gap;
  }, y);
}

function heading(value, y, subtitle = null) {
  text(value, M, y, 22, { bold: true, color: colors.ink });
  if (subtitle) {
    paragraph(subtitle, M, y - 24, 88, 9.7, 13, { color: colors.muted });
  }
}

function card(title, body, x, y, w, h, fillColor, accentColor) {
  rect(x, y, w, h, fillColor, accentColor);
  text(title, x + 16, y + h - 28, 13, { bold: true, color: accentColor });
  paragraph(body, x + 16, y + h - 50, Math.floor((w - 32) / 5.1), 9.4, 12.5, {
    color: colors.ink
  });
}

function table(name, cols, rows, x, y, widths, rowH = 46) {
  const totalW = widths.reduce((sum, width) => sum + width, 0);
  const totalH = rowH * (rows.length + 1);
  rect(x, y - totalH, totalW, totalH, colors.surface, colors.line);
  let cx = x;
  cols.forEach((col, i) => {
    rect(cx, y - rowH, widths[i], rowH, colors.ink);
    text(col, cx + 8, y - 28, 8.5, { bold: true, color: colors.surface });
    cx += widths[i];
  });
  rows.forEach((row, r) => {
    cx = x;
    row.forEach((cell, i) => {
      paragraph(cell, cx + 8, y - rowH * (r + 1) - 18, Math.floor((widths[i] - 16) / 5.6), 8.1, 11.5, {
        color: i === 0 ? colors.ink : colors.muted,
        bold: i === 0
      });
      cx += widths[i];
    });
  });
  text(name, x, y + 10, 8.5, { bold: true, color: colors.muted });
}

function startPage(title, subtitle = null) {
  ops = [];
  rect(0, 0, W, H, colors.canvas);
  text("GETPRIO HCI DESIGN BRIEF", M, H - 45, 9, { bold: true, color: colors.orange });
  text(title, M, H - 78, 25, { bold: true, color: colors.ink });
  if (subtitle) paragraph(subtitle, M, H - 104, 88, 9.5, 13, { color: colors.muted });
}

function endPage(number) {
  centered(`Page ${number}`, 28, 8, { color: colors.muted });
  pages.push(ops.join("\n"));
}

// Page 1
startPage(
  "Capstone Application Overview",
  "A human-computer interaction brief for GetPrio, a multi-tenant QR-based digital queue management and platform operations system."
);
card(
  "Application",
  "GetPrio helps customers join queues through QR or online links, verify queue joins, receive ticket numbers, monitor queue movement, and receive near-turn alerts.",
  M,
  585,
  240,
  128,
  colors.blueSoft,
  colors.blue
);
card(
  "Primary HCI Problem",
  "Manual queues create uncertainty, crowded waiting areas, repeated staff interruptions, and missed turns. The interface must make queue state visible and actionable.",
  M + 264,
  585,
  240,
  128,
  colors.orangeSoft,
  colors.orange
);
heading("Design Goals", 540);
bulletList([
  "Reduce uncertainty by making ticket number, queue position, current ticket, and next action visible.",
  "Minimize vendor workload by grouping call-next, serve, skip, and walk-in actions around the active queue state.",
  "Support role-aware navigation for customers, vendor staff, vendor admins, and platform admins.",
  "Keep public queue screens readable on mobile phones and larger display boards.",
  "Make security steps, such as OTP, CAPTCHA, JWT sessions, and post-MVP OAuth2, understandable without adding unnecessary friction."
], M, 500, 78, colors.green, 9.2, 12.5, 11);
endPage(1);

// Page 2
startPage(
  "Target Users and Context",
  "The design brief separates the main audiences so each workflow can be evaluated against the right user need."
);
heading("Target Users", 700);
table(
  "User groups and needs",
  ["User", "Need", "Key Screen"],
  [
    ["Customer", "Join a queue, track progress, and avoid missing a turn.", "Join Queue / Public Board"],
    ["Vendor Staff", "Operate assigned queue actions quickly and safely.", "Vendor Queue Dashboard"],
    ["Vendor Admin", "Manage queue settings, locations, counters, staff, history, and reports.", "Dashboard Sections"],
    ["Platform Admin", "Monitor tenants, users, subscriptions, payments, and billing activity.", "Platform Dashboard"]
  ],
  M,
  640,
  [112, 260, 130],
  58
);
heading("Design Context", 300);
bulletList([
  "Customers may arrive from a public QR code, a shared link, or a queue display and need immediate confidence that the join action worked.",
  "Vendor staff repeatedly perform operational actions during peak queue periods, so controls must stay close to the active ticket state.",
  "Vendor admins need configuration, reporting, and staff-management screens without mixing them into the live queue operator flow.",
  "Platform admins need higher-level visibility into tenants, subscriptions, payments, users, and system health."
], M, 262, 88, colors.blue, 9.3, 12.5, 8);
endPage(2);

// Page 3
startPage(
  "User Flows: Customer and Vendor",
  "The prototype prioritizes the two highest-frequency workflows: customer queue joining and vendor queue operation."
);
heading("Primary Flow 1: Customer QR Join", 700);
bulletList([
  "Open QR or online join link for a tenant/location.",
  "Enter name, email or phone, optional notes, and notification preferences.",
  "Complete security check and OTP verification.",
  "Receive ticket number and lookup code.",
  "Open public queue board and monitor progress."
], M, 652, 80, colors.blue, 10, 14.5, 12);
heading("Primary Flow 2: Vendor Queue Operation", 455);
bulletList([
  "Open dashboard and select tenant, location, and service counter.",
  "Review current, waiting, served, skipped, and cancelled tickets.",
  "Create a walk-in ticket when needed.",
  "Call next ticket, then serve or skip the current ticket.",
  "Share join URL, QR target, and monitor URL."
], M, 407, 80, colors.orange, 10, 14.5, 12);
endPage(3);

// Page 4
startPage(
  "User Flow: Platform Monitoring",
  "The platform workflow supports oversight of tenants, billing, payments, and administrative health."
);
heading("Primary Flow 3: Platform Monitoring", 700);
bulletList([
  "Sign in through the platform operations dashboard.",
  "Review tenant, user, revenue, subscription, and payment metrics.",
  "Configure queue fees and subscription plans.",
  "Inspect tenants, users, queue join payments, subscriptions, and billing events."
], M, 652, 82, colors.violet, 10, 14.5, 12);
card(
  "Scope Note",
  "The platform-monitoring flow is included because GetPrio depends on tenant subscriptions, queue-join payments, and administrative controls. The HCI review should still prioritize customer and vendor staff tasks first because those are the highest-frequency interactions.",
  M,
  390,
  502,
  138,
  colors.violetSoft,
  colors.violet
);
endPage(4);

// Page 5
startPage(
  "Interface Requirements",
  "The HCI design uses wireframes and annotations to connect each screen to its task purpose and security consideration."
);
heading("Required Screens", 700);
table(
  "Screen inventory",
  ["Priority", "Screen", "HCI Purpose", "IAS Trace"],
  [
    ["P0", "Join Queue Form", "Complete queue join quickly.", "PI collection, CAPTCHA, OTP request."],
    ["P0", "OTP Verification", "Confirm identity/contact channel.", "OTP brute-force and enumeration risk."],
    ["P0", "Ticket Confirmed", "Show ticket, lookup code, and next action.", "Lookup-code privacy."],
    ["P0", "Public Queue Board", "Monitor queue without staff assistance.", "Public data minimization."],
    ["P0", "Vendor Queue Dashboard", "Run queue operations efficiently.", "Tenant RBAC and ticket mutation."],
    ["P1", "Platform Overview", "Monitor platform health.", "Platform admin authorization."]
  ],
  M,
  650,
  [48, 130, 190, 134],
  66
);
endPage(5);

// Page 6
startPage(
  "Interaction and Accessibility Rules",
  "These rules guide the high-fidelity prototype and usability review so GetPrio remains clear, readable, and recoverable under queue pressure."
);
heading("Interaction Rules", 700);
bulletList([
  "Use visible labels for all form fields; do not rely on placeholders alone.",
  "Keep mobile queue joining in one column with primary action visible.",
  "Use large ticket numbers and text labels for queue status, not color alone.",
  "Show clear empty, error, loading, unauthorized, OTP failed, and session-expiry states.",
  "Confirm destructive actions such as cancelling a waiting ticket.",
  "Keep dashboard actions close to the ticket state they affect."
], M, 650, 82, colors.green, 10, 14.5, 12);
card(
  "Accessibility Focus",
  "The prototype should be reviewed for readable contrast, keyboard-accessible controls, visible focus states, clear form errors, non-color-only status indicators, and mobile-friendly queue monitoring.",
  M,
  355,
  502,
  126,
  colors.greenSoft,
  colors.green
);
card(
  "Security Roadmap",
  "MVP authentication should prioritize password login, JWT/session handling, RBAC, OTP queue joins, and abuse protection. OAuth2 sign-in is planned after MVP for vendor and platform administrator accounts.",
  M,
  205,
  502,
  116,
  colors.blueSoft,
  colors.blue
);
endPage(6);

// Page 7
startPage(
  "Usability Evaluation Plan",
  "The evaluation checks whether GetPrio reduces queue uncertainty and supports repeated queue operation without unnecessary cognitive load."
);
table(
  "Usability test scenarios",
  ["Scenario", "Success Criteria", "Metric"],
  [
    ["Customer joins from QR", "Completes join, OTP verification, and ticket confirmation without staff help.", "Completion, time, errors"],
    ["Customer checks queue", "Finds current ticket, own ticket, and waiting context within 10 seconds.", "Comprehension"],
    ["Vendor calls next", "Calls next and serves/skips current ticket from main queue screen.", "Clicks, hesitation"],
    ["Vendor adds walk-in", "Creates ticket while keeping queue visibility.", "Completion, missed fields"],
    ["Platform admin reviews", "Finds tenants, users, subscriptions, payments, and billing events.", "Navigation path"]
  ],
  M,
  690,
  [150, 250, 102],
  76
);
heading("Evaluation Metrics", 205);
card(
  "Quantitative",
  "Completion rate, time on task, input errors, recovery attempts, navigation missteps, and help prompts.",
  M,
  70,
  240,
  110,
  colors.greenSoft,
  colors.green
);
card(
  "Qualitative",
  "Perceived clarity, confidence in queue status, trust in ticket confirmation, ease of next action, and perceived security friction.",
  M + 264,
  70,
  240,
  110,
  colors.violetSoft,
  colors.violet
);
endPage(7);

function pdfObject(id, body) {
  return `${id} 0 obj\n${body}\nendobj\n`;
}

let objectId = 1;
const catalogId = objectId++;
const pagesId = objectId++;
const fontRegularId = objectId++;
const fontBoldId = objectId++;
const pageIds = [];
const contentIds = [];

pages.forEach(() => {
  pageIds.push(objectId++);
  contentIds.push(objectId++);
});

objects[catalogId] = pdfObject(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
objects[pagesId] = pdfObject(
  pagesId,
  `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`
);
objects[fontRegularId] = pdfObject(fontRegularId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
objects[fontBoldId] = pdfObject(fontBoldId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

pages.forEach((content, index) => {
  objects[pageIds[index]] = pdfObject(
    pageIds[index],
    `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentIds[index]} 0 R >>`
  );
  objects[contentIds[index]] = pdfObject(
    contentIds[index],
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`
  );
});

let pdf = "%PDF-1.4\n";
const offsets = [0];
for (let id = 1; id < objectId; id += 1) {
  offsets[id] = Buffer.byteLength(pdf, "utf8");
  pdf += objects[id];
}
const xrefOffset = Buffer.byteLength(pdf, "utf8");
pdf += `xref\n0 ${objectId}\n`;
pdf += "0000000000 65535 f \n";
for (let id = 1; id < objectId; id += 1) {
  pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${objectId} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

fs.writeFileSync(out, pdf);
console.log(out);
