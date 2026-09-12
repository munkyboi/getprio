const test = require('node:test');
const assert = require('node:assert/strict');
const { createStaffAccessEmailService, buildEmail } = require('../src/services/staffAccessEmailService');
const { createWorker } = require('../src/services/staffAccessEmailWorker');

function setup({ role = 'staff', active = true, verified = true, ownerActor = false } = {}) {
  let member = { _id: '2', name: '<Staff>', email: 'member@example.test', emailVerified: verified,
    tenantMemberships: role ? [{ tenantId: '1', role, isActive: active }] : [] };
  let assigned = ['10'];
  const owner = { _id: '3', email: 'owner@example.test', emailVerified: true,
    tenantMemberships: [{ tenantId: '1', role: 'owner' }] };
  const inserts = []; let committed = false;
  const client = { query: async (sql, values) => { if (sql.includes('INSERT INTO')) inserts.push(values); return { rows: [] }; } };
  const database = { withTransaction: async cb => {
    const saved = structuredClone(member); const old = [...assigned];
    try { const result = await cb(client); committed = true; return result; }
    catch(e) { member = saved; assigned = old; inserts.length = 0; throw e; }
  } };
  const service = createStaffAccessEmailService({ database,
    userRepository: { findUserById: async (_id, options) => { assert.equal(options.client, client); return structuredClone(member); },
      listUsersByTenantId: async () => [member, owner, { ...owner, _id: '4', tenantMemberships: [{ tenantId: '99', role: 'owner' }] }] },
    locationRepository: { listAssignedLocationIdsByUserIds: async () => new Map([['2', assigned]]) } });
  return { inserts, change: cb => service.change({ tenant: { _id: '1', name: 'Studio' }, userId: '2', actorId: ownerActor ? '3' : '8' }, cb),
    mutate: value => { member.tenantMemberships = value; }, locations: value => { assigned = value; }, committed: () => committed };
}

test('combined role, status and locations create one event per authorized recipient', async () => {
  const s = setup();
  await s.change(() => { s.mutate([{ tenantId: '1', role: 'admin', isActive: false }]); s.locations(['11']); });
  assert.equal(s.committed(), true); assert.equal(s.inserts.length, 2);
  assert.deepEqual(s.inserts.map(x => x[2]), ['2','3']);
  assert.equal(s.inserts[0][0], s.inserts[1][0]);
  const payload = JSON.parse(s.inserts[0][5]);
  assert.equal(payload.before.role, 'staff'); assert.equal(payload.after.active, false);
  assert.deepEqual(payload.after.locations, ['11']);
});

test('no-op and reordered location sets do not enqueue mail', async () => {
  const s = setup(); await s.change(() => s.locations(['10','10'])); assert.equal(s.inserts.length, 0);
});

test('failed multi-field mutation rolls back without a notification intent', async () => {
  const s = setup(); await assert.rejects(s.change(() => { s.mutate([]); throw Error('invalid location'); }), /invalid location/);
  assert.equal(s.committed(), false); assert.equal(s.inserts.length, 0);
});

test('removed member receives security notice without needing membership; actor owner is not duplicated', async () => {
  const s = setup({ ownerActor: true }); await s.change(() => s.mutate([]));
  assert.equal(s.inserts.length, 1); assert.equal(JSON.parse(s.inserts[0][5]).after, null);
});

test('unverified affected account is excluded from recipients', async () => {
  const s = setup({ verified: false }); await s.change(() => s.mutate([]));
  assert.deepEqual(s.inserts.map(x => x[2]), ['3']);
});

test('addition produces saved-access copy and safe shared HTML/plain text', async () => {
  const s = setup({ role: null }); await s.change(() => s.mutate([{ tenantId: '1', role: 'staff' }]));
  const payload = JSON.parse(s.inserts[0][5]); const email = buildEmail(payload, 'member');
  assert.match(email.text, /no invitation acceptance is required/);
  assert.match(email.html, /getprio-logo/);
  assert.match(buildEmail(payload, 'owner').html, /&lt;Staff&gt;/);
  const removed = buildEmail({ ...payload, before: payload.after, after: null }, 'member');
  assert.match(removed.text, /\/login/); assert.doesNotMatch(removed.text, /\/dashboard/);
});

function workerSetup({ eligible = true, fail = false, age = 0, email } = {}) {
  let delivered = false; let sendCount = 0; const updates = []; let message;
  const intent = { id: '1', event_id: 'event', recipient_user_id: '2', recipient_email: 'member@example.test',
    audience: 'member', tenant_id: '1', created_at: new Date(Date.now() - age),
    payload: { email: email || { subject: 'Access removed', html: '<p>Removed</p>', text: 'Removed' } } };
  const client = { query: async (sql, values) => {
    if (sql.startsWith('SELECT *')) { if (delivered) return { rows: [] }; delivered = true; return { rows: [intent] }; }
    if (sql.startsWith('SELECT u.id')) return { rows: eligible ? [{ id: '2' }] : [] };
    updates.push({ sql, values }); return { rows: [] };
  } };
  const worker = createWorker({ enabled: () => true, database: { withTransaction: cb => cb(client) },
    sendEmail: async data => { sendCount++; message = data; if (fail) throw Error('provider failure'); return true; } });
  return { worker, updates, sends: () => sendCount, message: () => message };
}

test('worker uses stable provider idempotency key and sends once after processing', async () => {
  const s = workerSetup(); await s.worker.runOnce(); await s.worker.runOnce();
  assert.equal(s.sends(), 1); assert.equal(s.message().idempotencyKey, 'staff-access/event/2');
  assert.match(s.updates[0].sql, /status = 'sent'/);
});

test('changed email, missing account or lost owner authority skips the notice', async () => {
  const s = workerSetup({ eligible: false }); await s.worker.runOnce();
  assert.equal(s.sends(), 0); assert.match(s.updates[0].sql, /status = 'skipped'/);
});

test('provider failure records bounded retry without throwing away the intent', async () => {
  const s = workerSetup({ fail: true }); await s.worker.runOnce();
  assert.equal(s.sends(), 1); assert.match(s.updates[0].sql, /attempts >= 5/);
});

test('expired provider deduplication window stops automatic delivery', async () => {
  const s = workerSetup({ age: 24 * 60 * 60 * 1000 }); await s.worker.runOnce();
  assert.equal(s.sends(), 0); assert.match(s.updates[0].sql, /status = 'failed'/);
});

test('disabled worker never reads or sends', async () => {
  const worker = createWorker({ enabled: () => false, database: { withTransaction: () => assert.fail() }, sendEmail: () => assert.fail() });
  await worker.runOnce();
});

test('managed templates select all three lifecycle aliases and keep HTML values safe', () => {
  const { buildTemplateEmail, templateContent, aliases, previewEmail } = require('../src/services/staffAccessResendTemplates');
  for (const kind of ['added', 'changed', 'removed']) {
    const state = { role: 'staff', active: true, locations: [] };
    const payload = { before: kind === 'added' ? null : state, after: kind === 'removed' ? null : state,
      tenantName: '<img src=x onerror=bad()> & Studio', memberName: '<Member>', occurredAt: '2026-09-13T00:00:00.000Z' };
    const email = buildTemplateEmail(payload, 'owner');
    assert.equal(email.resendTemplate.id, aliases[kind]);
    assert.equal(email.resendTemplate.variables.BUSINESS_HTML, '&lt;img src=x onerror=bad()&gt; &amp; Studio');
    const template = templateContent(kind);
    const referenced = [...new Set((template.html + template.text + template.subject).match(/\{\{\{[A-Z_]+\}\}\}/g).map(v => v.slice(3, -3)))].sort();
    assert.deepEqual(referenced, Object.keys(email.resendTemplate.variables).sort());
    const preview = previewEmail(payload, 'owner');
    assert.doesNotMatch(preview.html, /<img src=x|GPVAR_|\{\{\{/);
    assert.match(preview.text, /<Member>/);
    assert.match(preview.html, /&lt;Member&gt;/);
  }
});


test('worker preserves the queued managed template and variables across delivery', async () => {
  const email = { subject: 'Access added', resendTemplate: { id: 'getprio-vendor-staff-added', variables: { BUSINESS_TEXT: 'Saved business name' } } };
  const s = workerSetup({ email }); await s.worker.runOnce();
  assert.deepEqual(s.message().resendTemplate, email.resendTemplate);
  assert.equal(s.message().html, undefined); assert.equal(s.message().text, undefined);
});
