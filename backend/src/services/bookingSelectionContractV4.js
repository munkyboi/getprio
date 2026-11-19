// Inert foundation: existing booking routes must not consume this contract until
// scheduled reservation and Queue lifecycle writers pass their integration gate.
function fail(code, message, statusCode = 400) {
  throw Object.assign(new Error(message), { code, statusCode });
}
function exact(value, fields) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length
    && fields.every(key => Object.hasOwn(value, key));
}
function positiveId(value) {
  return typeof value === 'string' && /^[1-9]\d{0,18}$/u.test(value)
    && BigInt(value) <= 9223372036854775807n;
}
const logicalId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/u.test(value);
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value))
    fail('INVALID_BOOKING_START', 'Choose an explicit scheduled time with its timezone offset.');
  const date = new Date(value);
  const [year, month, day] = value.slice(0,10).split('-').map(Number);
  if (!Number.isFinite(date.getTime()) || month < 1 || month > 12 || day < 1
      || day > new Date(Date.UTC(year, month, 0)).getUTCDate())
    fail('INVALID_BOOKING_START', 'Choose a valid scheduled time.');
  return date;
}
function validate(input) {
  if (!exact(input, ['contractVersion','scheduledStartAt','selections']) || input.contractVersion !== 4)
    fail('INVALID_BOOKING_SELECTION', 'Provide an explicit version 4 booking selection.');
  instant(input.scheduledStartAt);
  if (!Array.isArray(input.selections) || input.selections.length !== 1)
    fail('UNSUPPORTED_BOOKING_SELECTION', 'This booking foundation supports one service and one named resource.');
  const root = input.selections[0];
  if (!exact(root, ['serviceSelectionId','serviceId','resources']) || !logicalId(root.serviceSelectionId) || !positiveId(root.serviceId))
    fail('INVALID_BOOKING_SELECTION', 'Provide a valid service and stable selection identity.');
  if (!Array.isArray(root.resources) || root.resources.length !== 1)
    fail('UNSUPPORTED_BOOKING_SELECTION', 'Select exactly one named resource.');
  const leaf = root.resources[0];
  if (!exact(leaf, ['resourceSelectionId','resourceMemberId','quantity','durationCount','durationPolicyRevision','extras'])
      || !logicalId(leaf.resourceSelectionId) || leaf.resourceSelectionId === root.serviceSelectionId
      || typeof leaf.resourceMemberId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(leaf.resourceMemberId))
    fail('INVALID_BOOKING_SELECTION', 'Provide a named resource and unique stable selection identity.');
  if (leaf.quantity !== 1 || !Array.isArray(leaf.extras) || leaf.extras.length)
    fail('UNSUPPORTED_BOOKING_SELECTION', 'Multiple units and extras are unavailable in this booking foundation.');
  if (!Number.isSafeInteger(leaf.durationCount) || leaf.durationCount < 1 || leaf.durationCount > 96)
    fail('INVALID_DURATION_COUNT', 'Choose a positive whole duration count.');
  if (!positiveId(leaf.durationPolicyRevision))
    fail('STALE_DURATION_POLICY', 'Review the current duration policy.', 409);
  return structuredClone(input);
}
function capabilities() {
  return { contractVersion: 4, enabled: false, confirmation: false,
    reasonCode: 'BOOKING_V4_NOT_ENABLED' };
}
function assertConfirmationEnabled() {
  fail('BOOKING_V4_NOT_ENABLED', 'Scheduled booking resource protection is not enabled.', 409);
}
function publicSelection(capture) {
  // Explicit allowlist: no member IDs, policy/ledger revisions or booking lineage.
  return { serviceName: capture.serviceName, resourceName: capture.resourceMemberName,
    scheduledStartAt: capture.scheduledStartAt, scheduledEndAt: capture.scheduledEndAt,
    durationCount: capture.durationCount, durationMinutes: capture.durationMinutes };
}
module.exports = { validate, capabilities, assertConfirmationEnabled, publicSelection, fail, positiveId, instant };
