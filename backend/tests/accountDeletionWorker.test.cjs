const test = require('node:test');
const assert = require('node:assert/strict');

function workerWith(client, sendEmail, config, auditEvents = []) {
  const target = require.resolve('../src/services/accountDeletionWorker');
  const mocks = {
    '../src/config/db': {pool: {connect: async () => client}},
    '../src/services/notificationService': {sendEmail},
    '../src/services/securityAuditService': {record: async (event) => auditEvents.push(event)},
    '../src/config/env': config
  };
  const originals = new Map();
  for (const [path,value] of Object.entries(mocks)) {
    const id = require.resolve(path);
    originals.set(id,require.cache[id]);
    require.cache[id] = {id, filename:id, loaded:true, exports:value};
  }
  delete require.cache[target];
  try { return require(target); }
  finally {
    delete require.cache[target];
    for (const [id,original] of originals) {
      if (original) require.cache[id]=original;
      else delete require.cache[id];
    }
  }
}
function fixture({locked=true, completed=false, scanStatus='not_started'}={}) {
  const calls=[];
  const request={id:'request', user_id:1, status:completed?'completed':'pending',
    acknowledgement_sent_at:new Date(), contact_email:'fixture@example.invalid', retention_notice:'No retained data.',
    completion_sent_at:null, scan_status:scanStatus, scan_next_attempt_at:new Date()};
  const client={
    async query(sql) {
      calls.push(sql);
      if (sql.includes('pg_try_advisory_lock')) return {rows:[{locked}]};
      if (sql.startsWith('SELECT * FROM account_deletion_requests')) return {rows:[request]};
      if (sql.startsWith('SELECT kind,status,evidence')) return {rows:[
        'application_relational_inventory','personal_data_inventory','object_storage_versions_and_caches','supplier_data','financial_and_legal_retention','backup_disposal'
      ].map(kind=>({kind,status:'completed',evidence:'case-reference'}))};
      if (sql.startsWith('SELECT * FROM users')) return {rows:[]};
      if (sql.includes('count(*)')) return {rows:[{count:0}]};
      return {rows:[]};
    },
    release(){calls.push('RELEASE');}
  };
  return {calls,client};
}
test('worker does not unlock another worker and always releases its connection', async()=>{
  const {calls,client}=fixture({locked:false});
  await workerWith(client,async()=>{throw Error('must not send');},{}).runOnce();
  assert.equal(calls.at(-1),'RELEASE');
  assert.equal(calls.some(sql=>sql.includes('pg_advisory_unlock')),false);
});
test('worker polling excludes idle acknowledged requests from its bounded batch', async()=>{
  const {calls,client}=fixture();
  await workerWith(client,async()=>true,{resendApiKey:'fixture'}).runOnce();
  const selection=calls.find(sql=>sql.startsWith('SELECT * FROM account_deletion_requests'));
  assert.match(selection,/acknowledgement_sent_at IS NULL/);
  assert.doesNotMatch(selection,/status<>'completed'/);
});
test('sending the completion report cannot be followed by a stale deletion acknowledgment', async()=>{
  const {calls,client}=fixture();
  const sent=[];
  const requestQuery=client.query;
  client.query=async(sql)=>{
    if(sql.startsWith('SELECT * FROM account_deletion_requests')) return {rows:[{
      id:'request', status:'processing', report_status:'sending', acknowledgement_sent_at:null,
      contact_email:'fixture@example.invalid', cleanup_report:{actions:[],exclusions:[]}
    }]};
    return requestQuery(sql);
  };
  await workerWith(client,async(message)=>{sent.push(message);return true;},{resendApiKey:'fixture'}).runOnce();
  assert.equal(sent.length,1);
  assert.match(sent[0].subject,/Update on your GetPrio account deletion request/);
  assert.doesNotMatch(sent[0].text,/request .* was accepted/);
});
test('completion notification is sent for an already-completed request and clears contact only after sending',async()=>{
  const {calls,client}=fixture({completed:true});
  await workerWith(client,async()=>{
    assert.equal(calls.some(sql=>sql.includes('contact_email=NULL')),false);
    calls.push('SENT');
    return true;
  },{resendApiKey:'fixture'}).runOnce();
  assert.ok(calls.findIndex(sql=>sql.includes('contact_email=NULL'))>calls.indexOf('SENT'));
});
test('failed completion email retains its destination and schedules a retry',async()=>{
  const {calls,client}=fixture({completed:true});
  await workerWith(client,async()=>{throw Error('delivery failed');},{resendApiKey:'fixture'}).runOnce();
  assert.equal(calls.some(sql=>sql.includes('contact_email=NULL')),false);
  assert.ok(calls.some(sql=>sql.includes('attempts=attempts+1')));
});
test('missing email configuration does not block scan or trigger destructive cleanup',async()=>{
  const {calls,client}=fixture();
  await workerWith(client,async()=>{throw Error('must not send');},{}).runOnce();
  assert.equal(calls.some(sql=>sql.includes("last_error_code='EMAIL_NOT_CONFIGURED'")),false);
  assert.equal(calls.includes('BEGIN'),false);
  assert.equal(calls.some(sql=>sql.includes('DELETE FROM users')),false);
  assert.equal(calls.some(sql=>sql.includes("SET status='completed'")),false);
});

test('worker records a categorized privacy-minimized relational inventory without deleting account data', async () => {
  const calls = [];
  const request = {
    id: 'request-inventory', user_id: 42, status: 'pending', acknowledgement_sent_at: new Date(),
    contact_email: 'fixture@example.invalid', retention_notice: null, scan_status: 'queued'
  };
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }] };
      if (sql.startsWith('SELECT * FROM account_deletion_requests')) return { rows: [request] };
      if (sql.includes("SET scan_status='running'")) return { rows: [{ id: request.id, scan_attempts: 1 }], rowCount: 1 };
      if (sql.includes('information_schema.columns')) return { rows: [
        { table_schema: 'public', table_name: 'tickets', column_name: 'user_id' },
        { table_schema: 'public', table_name: 'bookings', column_name: 'customer_user_id' },
        { table_schema: 'public', table_name: 'security_audit_events', column_name: 'actor_id' },
        { table_schema: 'public', table_name: 'users', column_name: 'id' }
      ] };
      if (sql.includes('PRIMARY KEY') && sql.includes('information_schema.key_column_usage')) return { rows: [
        { table_schema: 'public', table_name: 'tickets', column_name: 'id', ordinal_position: 1 },
        { table_schema: 'public', table_name: 'bookings', column_name: 'id', ordinal_position: 1 },
        { table_schema: 'public', table_name: 'security_audit_events', column_name: 'id', ordinal_position: 1 },
        { table_schema: 'public', table_name: 'users', column_name: 'id', ordinal_position: 1 }
      ] };
      if (sql.includes('AS reference_keys')) return { rows: [
        { source: 'public.tickets.user_id', record_count: 2, reference_keys: [['101'], ['102']] },
        { source: 'public.bookings.customer_user_id', record_count: 1, reference_keys: [['201']] },
        { source: 'public.security_audit_events.actor_id', record_count: 4, reference_keys: [['301'], ['302'], ['303'], ['304']] },
        { source: 'public.users.id', record_count: 1, reference_keys: [['42']] }
      ] };
      if (sql.includes("SET scan_status='report_ready'")) return { rowCount: 1, rows: [] };
      if (sql.startsWith('SELECT * FROM users')) return { rows: [] };
      if (sql.includes('count(*)')) return { rows: [{ count: 0 }] };
      return { rows: [] };
    },
    release() { calls.push({ sql: 'RELEASE', params: [] }); }
  };

  const auditEvents = [];
  await workerWith(client, async () => true, { resendApiKey: 'fixture' }, auditEvents).runOnce();

  const scanReportUpdate = calls.find(({ sql }) => sql.includes("SET scan_status='report_ready'"));
  assert.ok(scanReportUpdate, 'the worker publishes a categorized read-only report');
  const scanReport = JSON.parse(scanReportUpdate.params[1]);
  assert.equal(scanReport.coverage, 'partial');
  assert.equal(scanReport.version, 1);
  assert.deepEqual(scanReport.inventory.sources.map(({ source, recordCount }) => ({ source, recordCount })), [
    { source: 'public.bookings.customer_user_id', recordCount: 1 },
    { source: 'public.security_audit_events.actor_id', recordCount: 4 },
    { source: 'public.tickets.user_id', recordCount: 2 },
    { source: 'public.users.id', recordCount: 1 }
  ]);
  assert.ok(scanReport.inventory.sources.every((source) => source.items.length === source.recordCount && source.itemsComplete));
  assert.ok(scanReport.inventory.sources.flatMap((source) => source.items).every(({ id, ordinal, rowKey }) => /^[a-f0-9]{32}$/.test(id) && Number.isInteger(ordinal) && rowKey === undefined));
  const ticketItems = scanReport.inventory.sources.find(({ source }) => source === 'public.tickets.user_id').items;
  assert.deepEqual(ticketItems.map(({ rowIdentity }) => rowIdentity), [{ id: '101' }, { id: '102' }]);
  assert.match(scanReport.inventory.scope, /numeric relational references/i);
  assert.equal(scanReport.inventory.referenceCount, 8);
  const relationalCategory = scanReport.categories.find((category) => category.id === 'relational_references');
  assert.equal(relationalCategory.status, 'requires_review');
  assert.ok(relationalCategory.blockers.some(({ source }) => source === 'public.security_audit_events.actor_id'));
  assert.equal(scanReport.categories.find((category) => category.id === 'object_storage').status, 'not_scanned');
  assert.equal(auditEvents.length, 1, JSON.stringify(calls.map(({ sql }) => sql)));
  assert.equal(auditEvents[0].actorRole, 'system');
  assert.equal(auditEvents[0].action, 'account_deletion.relational_inventory.completed');
  assert.equal(calls.some(({ sql }) => sql.includes('DELETE FROM users')), false, 'a scan never performs deletion');
});

test('approved cleanup is transactional, emits a reviewed report, and only executes relational allowlisted actions', async () => {
  const calls = [];
  const auditEvents = [];
  let userDeleted = false;
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes("SET cleanup_status='running'")) return { rows: [{ id: 'request-cleanup' }], rowCount: 1 };
      if (sql.includes('SELECT r.user_id,r.cleanup_selection')) return { rows: [{ user_id: 42, email: 'owner@example.invalid', username: 'owner', cleanup_selection: { reportVersion: 1, selected: { relational_references: true, object_storage: false }, references: {}, exclusions: { object_storage: 'Provider inventory is unavailable.' } }, scan_report: { version: 1, coverage: 'partial', categories: [{ id: 'relational_references' }, { id: 'object_storage' }], inventory: { sources: [] } } }] };
      if (sql.startsWith('UPDATE tickets')) return { rows: [{ id: 1 }, { id: 2 }] };
      if (sql.startsWith('UPDATE bookings')) return { rows: [{ id: 3 }] };
      if (sql.startsWith('UPDATE auth_security_events')) return { rows: [{ id: 4 }, { id: 5 }] };
      if (sql.includes('information_schema.columns')) return { rows: [{ table_schema: 'public', table_name: 'users', column_name: 'id' }] };
      if (sql.includes('information_schema.table_constraints')) return { rows: [] };
      if (sql.includes('UNION ALL') && sql.includes('public.users.id')) return { rows: [{ source: 'public.users.id', record_count: userDeleted ? 0 : 1 }] };
      if (sql.startsWith('DELETE FROM users')) { userDeleted = true; return { rowCount: 1, rows: [{ id: 42 }] }; }
      if (sql.startsWith('SELECT id FROM users')) return { rows: userDeleted ? [] : [{ id: 42 }] };
      return { rows: [], rowCount: 1 };
    }
  };
  const worker = workerWith(client, async () => true, {}, auditEvents);
  assert.equal(await worker.runApprovedCleanup(client, { id: 'request-cleanup' }), true);
  assert.ok(calls.some(({ sql }) => sql === 'BEGIN'));
  assert.ok(calls.some(({ sql }) => sql === 'COMMIT'));
  assert.ok(calls.some(({ sql }) => sql === 'DELETE FROM mobile_push_registrations WHERE user_id=$1'));
  assert.ok(calls.some(({ sql }) => sql.startsWith('DELETE FROM users')));
  const update = calls.find(({ sql }) => sql.includes("SET cleanup_status='completed'"));
  const report = JSON.parse(update.params[1]);
  assert.equal(report.actions[0].ticketsMinimized, 2);
  assert.equal(report.actions[0].bookingsMinimized, 1);
  assert.equal(report.actions[0].securityEventsMinimized, 2);
  assert.equal(report.verification.userRowAbsent, true);
  assert.equal(report.verification.remainingNumericReferences, 0);
  assert.deepEqual(report.exclusions.map(({ categoryId }) => categoryId), ['object_storage']);
  assert.equal(auditEvents[0].action, 'account_deletion.cleanup.completed');
});

test('a failed account delete rolls back every cleanup mutation and records needs-attention state', async () => {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes("SET cleanup_status='running'")) return { rows: [{ id: 'request-cleanup' }], rowCount: 1 };
      if (sql.includes('SELECT r.user_id,r.cleanup_selection')) return { rows: [{ user_id: 42, email: 'owner@example.invalid', username: 'owner', cleanup_selection: { reportVersion: 1, selected: { relational_references: true }, references: {}, exclusions: {} }, scan_report: { version: 1, coverage: 'partial', categories: [{ id: 'relational_references' }], inventory: { sources: [] } } }] };
      if (sql.startsWith('SELECT id FROM users')) return { rows: [{ id: 42 }] };
      if (sql.includes('information_schema.columns')) return { rows: [{ table_schema: 'public', table_name: 'users', column_name: 'id' }] };
      if (sql.includes('information_schema.table_constraints')) return { rows: [] };
      if (sql.includes('UNION ALL') && sql.includes('public.users.id')) return { rows: [{ source: 'public.users.id', record_count: 1 }] };
      if (sql.startsWith('DELETE FROM users')) throw Object.assign(new Error('referenced account'), { code: '23503' });
      return { rows: [], rowCount: 1 };
    }
  };
  const worker = workerWith(client, async () => true, {});
  await assert.rejects(() => worker.runApprovedCleanup(client, { id: 'request-cleanup' }), { code: '23503' });
  assert.ok(calls.includes('ROLLBACK'));
  assert.ok(!calls.includes('COMMIT'));
  assert.ok(calls.some((sql) => sql.includes("SET cleanup_status='needs_attention'")));
});

test('user report marks the request completed only after email provider acceptance', async () => {
  const calls = [];
  let resolveSend;
  const client = { async query(sql) { calls.push(sql); return { rows: [] }; } };
  const worker = workerWith(client, async () => new Promise((resolve) => { resolveSend = resolve; }), { resendApiKey: 'fixture' });
  const pending = worker.sendUserReport(client, { id: 'request-report', contact_email: 'owner@example.invalid', cleanup_report: { coverage: 'partial', actions: [], exclusions: [] } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.some((sql) => sql.includes("status='completed'")), false);
  resolveSend(true);
  assert.equal(await pending, true);
  assert.ok(calls.some((sql) => sql.includes("report_status='sent'") && sql.includes("status='completed'")));
});

test('customer deletion report uses plain-language summaries without internal schema identifiers', async () => {
  let email;
  const client = { async query() { return { rows: [] }; } };
  const worker = workerWith(client, async (message) => { email = message; return true; }, { resendApiKey: 'fixture' });
  await worker.sendUserReport(client, {
    id: 'internal-request-uuid',
    contact_email: 'owner@example.invalid',
    cleanup_report: {
      coverage: 'partial',
      actions: [{
        categoryId: 'relational_references',
        outcome: 'best_effort_anonymized',
        ticketsMinimized: 2,
        bookingsMinimized: 3,
        securityEventsMinimized: 4,
        anonymizedReferences: [{ source: 'public.user_trust_ratings.subject_user_id', count: 5 }],
        deletedTransientReferences: [{ source: 'public.auth_mfa_challenges.user_id', count: 6 }]
      }],
      exclusions: [
        { categoryId: 'object_storage', label: 'public.user_files.user_id' },
        { categoryId: 'backup_disposal', label: 'public.backups.user_id' }
      ]
    }
  });

  assert.equal(email.subject, 'Update on your GetPrio account deletion request');
  assert.match(email.text, /Your GetPrio account and sign-in access were removed\./);
  assert.match(email.text, /5 account-linked records were anonymized/);
  assert.match(email.text, /6 temporary records were removed/);
  assert.match(email.text, /We minimized personal details in 3 bookings, 2 support records, and 4 security records retained for service integrity\./);
  assert.match(email.text, /Stored files and cached copies were not included in this automated process\./);
  assert.match(email.text, /Backup copies were not included in this automated process/);
  assert.doesNotMatch(email.text, /public\.|subject_user_id|auth_mfa_challenges|user_id|relational_references|object_storage|internal-request-uuid/);
});
