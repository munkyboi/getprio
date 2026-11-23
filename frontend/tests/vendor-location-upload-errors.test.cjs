const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('src/pages/VendorDashboardPage.tsx', 'utf8');
const uploadStart = source.indexOf('  async function uploadLocationPaymentQr(');
const uploadEnd = source.indexOf('  async function handleSaveTheme()', uploadStart);
const upload = source.slice(uploadStart, uploadEnd);

test('payment QR upload requires a location slug before calling the endpoint', () => {
  assert.match(upload, /const locationSlug = locationForm\.slug\.trim\(\)/);
  assert.match(upload, /if \(!locationSlug\)/);
  assert.match(upload, /Location slug is required before uploading a payment QR/);
  assert.match(upload, /setPaymentQrUploadFile\(null\)/);
});

test('payment QR upload preserves the saved image until a usable URL is returned', () => {
  assert.match(upload, /vendorDashboardOperations\.uploadLocationPaymentQr\(/);
  assert.match(upload, /if \(!data\.asset\?\.publicUrl\)/);
  assert.match(upload, /Payment QR upload completed without a usable image URL/);
  assert.match(upload, /paymentQrImageUrl: data\.asset\.publicUrl/);
});

test('payment QR upload reports errors and always clears its busy state', () => {
  assert.match(upload, /setBusyAction\("payment-qr-upload"\)/);
  assert.match(upload, /catch \(uploadError\)/);
  assert.match(upload, /setError\(getErrorMessage\(uploadError\)\)/);
  assert.match(upload, /finally \{/);
  assert.match(upload, /setBusyAction\(""\)/);
});
