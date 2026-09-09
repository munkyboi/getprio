// Generates local fixtures only. Does not load the sender or contact a provider.
const fs = require("node:fs");
const path = require("node:path");
const { createBrandedEmail } = require("../backend/src/services/emailTemplates");
const { queueLifecycleEmail, queueOtpEmail } = require("../backend/src/services/queueEmailTemplates");
const { bookingEmailTemplate } = require("../backend/src/services/bookingEmailTemplates");

const output = path.resolve(__dirname, "../.scratch/email-preview");
fs.mkdirSync(output, { recursive: true });
fs.cpSync(path.resolve(__dirname, "../frontend/public/email"), path.join(output, "email"), { recursive: true });
const tenant = { name: "Northside Studio", slug: "northside-studio" };
const ticket = { ticketNumber: "A024", lookupCode: "SAMPLE-ONLY", status: "waiting" };
const booking = { _id: "sample-booking", customerUserId: "sample-user", customerName: "Alex", reference: "GP-20481",
  tenantName: "Northside Studio", locationName: "Makati", serviceName: "Haircut & style", status: "confirmed",
  scheduledStartAt: "2026-09-18T06:30:00Z", locationTimezone: "Asia/Manila" };
const fixtures = {
  welcome: createBrandedEmail({ subject: "Welcome to GetPrio.", subtitle: "A little less waiting. A little more living.", greeting: "Hi Alex,", message: "Discover services, book your next visit and keep track of your place in line.", illustration: "welcome", hero: true, actionLabel: "Explore GetPrio", actionUrl: "https://getprio.online/vendors" }),
  verification: createBrandedEmail({ subject: "Verify your email.", greeting: "Hi Alex,", message: "Enter this code in GetPrio to verify your email and finish setting up your account.", illustration: "account-verification", code: "482916", expiryText: "This code expires in 10 minutes.", footer: "If you did not create this account, you can ignore this email." }),
  "queue-verification": queueOtpEmail({ tenant, code: "012345", expiresMinutes: 15 }),
  booking: createBrandedEmail({ subject: "You’re booked in.", message: "Your booking is confirmed. Here are the details for your upcoming visit.", ...bookingEmailTemplate(booking) }),
  "booking-submitted": createBrandedEmail({ subject: "Booking request submitted", message: "Your booking is pending vendor confirmation.", ...bookingEmailTemplate({ ...booking, status: "pending" }) }),
  queue: queueLifecycleEmail({ tenant, ticket, kind: "near_turn", position: 4 }),
  security: createBrandedEmail({ subject: "Your GetPrio security method changed", message: "Your authenticator and recovery codes were updated. Other signed-in sessions were closed for your protection. If you did not make this change, reset your password and contact GetPrio support." }),
  reminder: createBrandedEmail({ subject: "Your visit is coming up.", message: "Review your booking before you set off.", ...bookingEmailTemplate(booking), illustration: "reminder" }),
  "long-content": createBrandedEmail({ subject: "An update about your upcoming appointment at Northside Studio", greeting: "Hi Alex,", message: "Your appointment details have changed. Please review the venue and schedule below before your visit.", ...bookingEmailTemplate({ ...booking, serviceName: "Consultation and follow-up with a specialist for an extended appointment", locationName: "A long venue name with a building, floor and unit number that should wrap cleanly on mobile" }) })
};
for (const [name, email] of Object.entries(fixtures)) {
  fs.writeFileSync(path.join(output, `${name}.html`), email.html);
  fs.writeFileSync(path.join(output, `${name}.txt`), email.text);
}
fs.writeFileSync(path.join(output, "index.html"), `<!doctype html><html lang="en"><title>GetPrio email previews</title><body style="font:16px Arial;background:#FFFAF4;padding:24px"><h1>GetPrio email previews</h1><p>Fictional local fixtures. Booking confirmation and reminder are design examples. Signup welcome emails are enabled separately.</p><ul>${Object.keys(fixtures).map(name => `<li style="padding:8px"><a href="${name}.html">${name}</a></li>`).join("")}</ul></body></html>`);
console.log(`Email previews written to ${output}`);
