const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createBrandedEmail } = require("../src/services/emailTemplates");
const { bookingEmailTemplate } = require("../src/services/bookingEmailTemplates");

test("minimal emails omit optional sections and preserve live text without images", () => {
  const email = createBrandedEmail({ subject: "Account update", message: "First paragraph.\n\nSecond paragraph." });
  assert.match(email.html, /First paragraph\.<\/p><p[^>]*>Second paragraph/);
  assert.match(email.html, /alt="GetPrio"/);
  assert.match(email.html, /getprio-logo\.png\?rev=20260909/);
  assert.doesNotMatch(email.html, /VERIFICATION CODE|YOUR QUEUE NUMBER|Email preferences|Unsubscribe|<td[^>]*><\/td>/);
  assert.match(email.text, /First paragraph/);
  assert.match(email.html, /max-width:600px/);
});

test("dynamic email text is escaped and unsafe action or attachment URLs are omitted", () => {
  const email = createBrandedEmail({ subject: '<script>alert("title")</script>', greeting: 'Hi <Alex>,',
    message: '<img src=x onerror=alert(1)>', details: [{ label: '<b>Venue</b>', value: 'A & B' }],
    actionLabel: 'Bad action', actionUrl: 'javascript:alert(1)', secondaryLabel: 'Unsafe', secondaryUrl: 'data:text/html,x',
    attachment: { url: 'javascript:alert(1)', alt: 'x' }, code: '<123456>' });
  assert.doesNotMatch(email.html, /<script|<img src=x|href="javascript:|href="data:|src="javascript:/i);
  assert.match(email.html, /Hi &lt;Alex&gt;/);
  assert.match(email.html, /A &amp; B/);
  assert.match(email.html, /&lt;123456&gt;/);
  assert.doesNotMatch(email.text, /javascript:|data:text/);
});

test("inline links keep readable text in both formats without accepting raw HTML", () => {
  const email = createBrandedEmail({ subject: "Help", message: [
    ["You can ", { text: "contact support", url: "https://getprio.online/contact" }, " for help."],
    [{ text: "<SCRIPT>unsafe</SCRIPT>", url: "javascript:alert(1)" }]
  ] });
  assert.match(email.html, /href="https:\/\/getprio.online\/contact"/);
  assert.match(email.text, /You can contact support \(https:\/\/getprio.online\/contact\) for help/);
  assert.doesNotMatch(email.html, /<script\b|javascript:/i);
});

test("zero values, code expiry and queue status remain available in both alternatives", () => {
  const email = createBrandedEmail({ subject: "Verify", message: "Use the code in GetPrio.", code: "012345", expiryText: "Expires in 10 minutes.",
    details: [{ label: "People ahead", value: 0 }, { label: "Missing", value: "" }], queue: { number: 'A024', status: 'waiting' },
    illustration: 'account-verification', actionLabel: 'Open GetPrio', actionUrl: 'https://getprio.online/account?a=1&b=2' });
  for (const content of [email.text, email.html]) {
    assert.match(content, /012345/); assert.match(content, /Expires in 10 minutes/); assert.match(content, /A024/); assert.match(content, /waiting/);
    assert.doesNotMatch(content, /Missing/);
  }
  assert.match(email.text, /People ahead: 0/);
  assert.match(email.html, /a=1&amp;b=2/);
  assert.match(email.html, /getprio-account-verification-compact.png/);
});

test("marketing artwork and preference links are opt-in and bundled assets have correct dimensions", () => {
  const email = createBrandedEmail({ subject: "Welcome", message: "Hello", hero: true, illustration: "welcome",
    preferencesUrl: 'https://getprio.online/preferences', unsubscribeUrl: 'https://getprio.online/unsubscribe' });
  assert.match(email.html, /getprio-welcome-hero.png/); assert.match(email.html, /Email preferences/); assert.match(email.text, /Unsubscribe:/);
  for (const name of ['welcome', 'account-verification', 'booking-confirmation', 'queue-update', 'reminder']) {
    for (const [variant, width, height] of [['hero', 1200, 600], ['compact', 600, 400]]) {
      const bytes = fs.readFileSync(path.join(__dirname, `../../frontend/public/email/v1/getprio-${name}-${variant}.png`));
      assert.equal(bytes.readUInt32BE(16), width); assert.equal(bytes.readUInt32BE(20), height);
    }
  }
});

test("booking details use the venue timezone and account actions require an owner", () => {
  const booking = { _id: 'book/123', reference: 'GP-20481', status: 'confirmed', customerName: 'Alex', customerUserId: 'user-1',
    tenantName: 'Northside', locationName: 'Makati', serviceName: 'Haircut', scheduledStartAt: '2026-09-18T06:30:00Z', locationTimezone: 'Asia/Manila' };
  const email = createBrandedEmail({ subject: 'Booking confirmed', message: 'Your visit is all set.', ...bookingEmailTemplate(booking) });
  assert.match(email.text, /2:30 PM/); assert.match(email.text, /Asia\/Manila/); assert.match(email.html, /book%2F123/);
  assert.match(email.html, /getprio-booking-confirmation-compact/);
  const guest = bookingEmailTemplate({ ...booking, customerUserId: null, status: 'pending' });
  assert.equal(guest.actionUrl, ''); assert.equal(guest.illustration, undefined);
  assert.equal(bookingEmailTemplate({}).details.find(d => d.label === 'Date and time').value, '');
  assert.match(bookingEmailTemplate({ ...booking, locationTimezone: 'invalid' }).details.find(d => d.label === 'Date and time').value, /2026-09-18T06:30:00.000Z/);
});
