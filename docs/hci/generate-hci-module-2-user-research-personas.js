const fs = require("fs");
const path = require("path");

const out = path.join(__dirname, "getprio-hci-module-2-user-research-personas.pdf");

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

function bullet(value, x, y, maxChars, color = colors.orange, size = 9.5, lineHeight = 13.5) {
  const markerSize = 5;
  rect(x, y + 7 + size * 0.38, markerSize, markerSize, color);
  return paragraph(value, x + 16, y + 7, maxChars, size, lineHeight, { color: colors.ink });
}

function bulletList(items, x, y, maxChars, color, size = 9.5, lineHeight = 13.5, gap = 10) {
  return items.reduce((cursor, item) => {
    const next = bullet(item, x, cursor, maxChars, color, size, lineHeight);
    return next - gap;
  }, y);
}

function heading(value, y, subtitle = null) {
  text(value, M, y, 22, { bold: true, color: colors.ink });
  if (subtitle) paragraph(subtitle, M, y - 24, 88, 9.7, 13, { color: colors.muted });
}

function card(title, body, x, y, w, h, fillColor, accentColor) {
  rect(x, y, w, h, fillColor, accentColor);
  text(title, x + 16, y + h - 28, 13, { bold: true, color: accentColor });
  paragraph(body, x + 16, y + h - 50, Math.floor((w - 32) / 5.1), 9.4, 12.5, {
    color: colors.ink
  });
}

function table(name, cols, rows, x, y, widths, rowH = 56) {
  const totalW = widths.reduce((sum, width) => sum + width, 0);
  const totalH = rowH * (rows.length + 1);
  rect(x, y - totalH, totalW, totalH, colors.surface, colors.line);
  let cx = x;
  cols.forEach((col, i) => {
    rect(cx, y - rowH, widths[i], rowH, colors.ink);
    text(col, cx + 8, y - 31, 8.5, { bold: true, color: colors.surface });
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
  text("GETPRIO HCI MODULE 2", M, H - 45, 9, { bold: true, color: colors.orange });
  text(title, M, H - 78, 25, { bold: true, color: colors.ink });
  if (subtitle) paragraph(subtitle, M, H - 104, 88, 9.5, 13, { color: colors.muted });
}

function endPage(number) {
  centered(`Page ${number}`, 28, 8, { color: colors.muted });
  pages.push(ops.join("\n"));
}

function personaPage(number, persona) {
  startPage(persona.title, persona.subtitle);
  card("Role", persona.role, M, 555, 240, 110, persona.soft, persona.accent);
  card("Core Need", persona.need, M + 264, 555, 240, 110, colors.surface, persona.accent);
  heading("Goals", 515);
  bulletList(persona.goals, M, 475, 78, persona.accent, 9.4, 13.5, 10);
  heading("Frustrations", 335);
  bulletList(persona.frustrations, M, 295, 78, colors.red, 9.4, 13.5, 10);
  heading("Design Implications", 170);
  bulletList(persona.implications, M, 130, 78, colors.green, 9.2, 13, 9);
  endPage(number);
}

// Page 1
startPage(
  "User Research Report & Personas",
  "A focused HCI Module 2 deliverable for GetPrio, a QR-based digital queue management system for customers, vendor staff, vendor admins, and platform admins."
);
card(
  "Student",
  "Roberto Carlo Abella | Student ID: 2025040965 | Capstone App: GetPrio",
  M,
  585,
  240,
  110,
  colors.blueSoft,
  colors.blue
);
card(
  "Module Purpose",
  "This report translates queue-management research into personas, needs, pain points, and design requirements for the GetPrio prototype.",
  M + 264,
  585,
  240,
  110,
  colors.orangeSoft,
  colors.orange
);
heading("Research Scope", 530);
bulletList([
  "Understand how customers experience uncertainty while waiting in manual or poorly visible queues.",
  "Identify staff actions that must be fast, repeatable, and hard to misuse during active queue operations.",
  "Clarify what vendor admins need to configure and monitor without interrupting daily queue work.",
  "Trace privacy, OTP, role-based access, and public-display concerns into interface decisions."
], M, 490, 84, colors.green, 9.5, 13.5, 11);
heading("Research Assumption", 300);
paragraph(
  "This deliverable is written as a capstone research synthesis using the current GetPrio requirements, task analysis, interface drafts, and reasonable user scenarios for queue-based service environments. The personas should be validated later through interviews or usability tests.",
  M,
  262,
  88,
  9.7,
  13,
  { color: colors.muted }
);
endPage(1);

// Page 2
startPage(
  "Research Objectives and Method",
  "The research plan focuses on task clarity, queue confidence, staff efficiency, administrative control, and privacy-aware interaction."
);
heading("Research Objectives", 700);
bulletList([
  "Discover what information customers need before, during, and after joining a digital queue.",
  "Identify the most frequent vendor staff actions and where mistakes are most likely to happen.",
  "Map admin requirements for locations, counters, staff, tenant settings, subscriptions, and reports.",
  "Evaluate where security steps should be visible, explained, or minimized, including JWT sessions in MVP and OAuth2 as a post-MVP admin enhancement."
], M, 660, 86, colors.blue, 9.6, 13.5, 11);
heading("Research Method", 405);
table(
  "Research activities",
  ["Activity", "Input", "Output"],
  [
    ["Requirement review", "Capstone scope, HCI/IAS needs, Figma drafts.", "User groups, key tasks, screen priorities."],
    ["Task analysis", "Customer, vendor, admin workflows.", "Step-by-step user flows and failure points."],
    ["Heuristic review", "Wireframes and queue UI states.", "Clarity, feedback, recovery, and accessibility issues."],
    ["Persona synthesis", "Observed needs and expected usage contexts.", "Four actionable personas for design decisions."]
  ],
  M,
  340,
  [126, 192, 184],
  60
);
endPage(2);

// Page 3
startPage(
  "Key Findings",
  "The findings summarize the strongest HCI patterns discovered from the GetPrio queue workflows."
);
card(
  "Finding 1: Queue Confidence",
  "Customers need immediate confirmation that they joined correctly, where they are in line, and what happens next.",
  M,
  570,
  240,
  118,
  colors.blueSoft,
  colors.blue
);
card(
  "Finding 2: Operational Speed",
  "Vendor staff need call-next, serve, skip, cancel, and walk-in actions close to the active queue state.",
  M + 264,
  570,
  240,
  118,
  colors.orangeSoft,
  colors.orange
);
card(
  "Finding 3: Admin Separation",
  "Configuration, reports, staff management, and tenant settings should not clutter the live queue operator screen.",
  M,
  420,
  240,
  118,
  colors.greenSoft,
  colors.green
);
card(
  "Finding 4: Security Clarity",
  "OTP, CAPTCHA, lookup codes, JWT sessions, public boards, and RBAC need plain explanations and predictable failure states. OAuth2 should be introduced after MVP for admin sign-in.",
  M + 264,
  420,
  240,
  118,
  colors.violetSoft,
  colors.violet
);
heading("Pain Points", 350);
bulletList([
  "Manual queues make customers repeatedly ask staff whether their turn is near.",
  "Busy staff can accidentally skip, repeat, or lose track of ticket state without clear controls.",
  "Public queue boards can reveal too much if names, phone numbers, or private notes are exposed.",
  "Administrators need metrics and configuration screens, but only after live queue operations stay stable."
], M, 310, 86, colors.red, 9.5, 13.5, 11);
endPage(3);

personaPage(4, {
  title: "Persona 1: Customer",
  subtitle: "Mika Santos, 21, student and frequent walk-in customer who joins service queues from a phone.",
  role: "Customer who scans a QR code, submits basic contact details, verifies through OTP, and monitors queue progress while waiting nearby.",
  need: "Needs confidence that the queue join worked, that their ticket number is visible, and that they will not miss their turn.",
  goals: [
    "Join a queue quickly without installing another app.",
    "Know ticket number, queue position, current ticket, and expected next action.",
    "Receive a clear warning before their turn arrives.",
    "Recover from OTP or session issues without starting over."
  ],
  frustrations: [
    "Unclear forms that do not explain required contact details.",
    "Not knowing whether a ticket is active, expired, skipped, or already called.",
    "Queue boards that are hard to read on a phone.",
    "Security errors that blame the user without recovery steps."
  ],
  implications: [
    "Use a one-column mobile join form with clear labels.",
    "Show ticket confirmation, lookup code, current ticket, and next action together.",
    "Use readable status text and avoid color-only indicators."
  ],
  soft: colors.blueSoft,
  accent: colors.blue
});

personaPage(5, {
  title: "Persona 2: Vendor Staff",
  subtitle: "Jon Reyes, 34, front-desk staff member who operates queues during peak customer hours.",
  role: "Queue operator responsible for reviewing waiting tickets, calling the next customer, adding walk-ins, and marking tickets served, skipped, or cancelled.",
  need: "Needs fast controls, clear ticket state, and low-risk actions while customers are waiting in real time.",
  goals: [
    "See current, waiting, served, skipped, and cancelled tickets at a glance.",
    "Call the next ticket without searching through multiple menus.",
    "Add walk-in customers while keeping the queue visible.",
    "Avoid accidental destructive actions during busy periods."
  ],
  frustrations: [
    "Controls that are separated from the ticket they affect.",
    "No confirmation or undo path for risky actions.",
    "Too much admin configuration mixed into daily queue work.",
    "Ambiguous empty states when no one is waiting."
  ],
  implications: [
    "Place call-next, serve, skip, and walk-in controls near the active queue panel.",
    "Use confirmation for cancel actions and clear labels for every state.",
    "Keep admin settings outside the main operator workflow."
  ],
  soft: colors.orangeSoft,
  accent: colors.orange
});

personaPage(6, {
  title: "Persona 3: Vendor Admin",
  subtitle: "Lea Dizon, 42, branch owner who manages locations, counters, staff access, and queue performance.",
  role: "Tenant-side administrator responsible for configuring services, assigning staff, reviewing queue history, and improving customer throughput.",
  need: "Needs business-level control and reports without disrupting front-line queue operations.",
  goals: [
    "Configure locations, services, counters, staff roles, and queue settings.",
    "Review queue history, served counts, skipped tickets, and peak periods.",
    "Share QR links and monitor URLs for branches or counters.",
    "Understand whether the queue setup improves customer waiting experience."
  ],
  frustrations: [
    "No separation between staff controls and admin-only settings.",
    "Reports that are too technical or disconnected from daily decisions.",
    "Unclear staff permissions that create accountability issues.",
    "Difficulty locating QR or monitor links when setting up a branch."
  ],
  implications: [
    "Provide clear navigation for settings, staff, reports, and QR management.",
    "Summarize operational metrics in plain business language.",
    "Use role-based screens so admins and staff see appropriate tools."
  ],
  soft: colors.greenSoft,
  accent: colors.green
});

personaPage(7, {
  title: "Persona 4: Platform Admin",
  subtitle: "Paolo Mendoza, 29, platform operator who monitors tenants, users, payments, subscriptions, and billing events.",
  role: "System-level administrator responsible for platform visibility, tenant support, subscription health, and billing/payment oversight.",
  need: "Needs a secure administrative view that separates platform operations from tenant queue operation.",
  goals: [
    "Monitor tenant activity, users, subscriptions, queue payments, and billing events.",
    "Find account or payment issues quickly when a tenant needs support.",
    "Review queue fees and plan settings without exposing customer private data.",
    "Maintain confidence that platform actions follow proper authorization, JWT/session handling, and future OAuth2 sign-in expectations."
  ],
  frustrations: [
    "Tenant data mixed together without clear ownership boundaries.",
    "Payment and subscription states that do not show next action.",
    "Public or operational screens exposing more information than needed.",
    "Admin actions without role clarity or audit expectations."
  ],
  implications: [
    "Keep platform dashboards separate from vendor dashboards.",
    "Show tenant, payment, and subscription statuses with clear next steps.",
    "Minimize public data and make role boundaries visible."
  ],
  soft: colors.violetSoft,
  accent: colors.violet
});

// Page 8
startPage(
  "Design Requirements From Research",
  "These requirements translate the research report and personas into actionable prototype decisions."
);
table(
  "Research-to-design traceability",
  ["Research Insight", "Design Response", "Affected Screen"],
  [
    ["Customers need queue confidence.", "Show ticket number, current ticket, position, lookup code, and next action.", "Ticket Confirmed / Public Board"],
    ["Staff need fast repeated actions.", "Group call-next, serve, skip, cancel, and walk-in controls near ticket state.", "Vendor Queue Dashboard"],
    ["Admins need separated controls.", "Separate live queue operation from settings, reports, staff, and billing areas.", "Vendor Admin Dashboard"],
    ["Security should be understandable.", "Provide clear OTP, CAPTCHA, JWT/session, unauthorized, expired, and failed-payment states. Mark OAuth2 as post-MVP.", "Join / OTP / Admin"],
    ["Public data must be minimized.", "Avoid exposing private contact details, notes, or internal payment data on public screens.", "Public Queue Board"]
  ],
  M,
  665,
  [158, 224, 120],
  68
);
heading("Recommended Next Step", 230);
paragraph(
  "Validate these personas through usability testing with at least one participant or reviewer per main role. The first test should prioritize the customer QR join flow and the vendor queue operation flow because they carry the highest frequency and highest risk of queue confusion.",
  M,
  190,
  88,
  9.7,
  13,
  { color: colors.muted }
);
endPage(8);

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
