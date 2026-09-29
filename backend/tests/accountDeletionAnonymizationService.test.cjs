const test = require('node:test');
const assert = require('node:assert/strict');
const { applyBestEffortAnonymization } = require('../src/services/accountDeletionAnonymizationService');

test('best-effort anonymization applies approved row-level dispositions and reports counts', async () => {
  const calls = [];
  const client = { async query(sql, params) { calls.push({ sql, params }); return { rowCount: 1, rows: [] }; } };
  const inventory = { sources: [
    { source: 'public.organizer_campaign_events.actor_user_id', recordCount: 1, items: [{ id: 'event-1', ordinal: 1, rowKey: ['17'], rowKeyColumns: ['id'] }], itemsComplete: true },
    { source: 'public.organizer_campaigns.organizer_user_id', recordCount: 1, items: [{ id: 'campaign-1', ordinal: 1, rowKey: ['18'], rowKeyColumns: ['id'] }], itemsComplete: true },
    { source: 'public.account_email_change_challenges.user_id', recordCount: 1, items: [{ id: 'challenge-1', ordinal: 1, rowKey: ['challenge-uuid'], rowKeyColumns: ['id'] }], itemsComplete: true }
  ] };

  const result = await applyBestEffortAnonymization(client, inventory, 42, {
    'public.organizer_campaign_events.actor_user_id': ['event-1'],
    'public.organizer_campaigns.organizer_user_id': ['campaign-1'],
    'public.account_email_change_challenges.user_id': ['challenge-1']
  });

  assert.deepEqual(result.anonymized, [
    { source: 'public.organizer_campaign_events.actor_user_id', count: 1 },
    { source: 'public.organizer_campaigns.organizer_user_id', count: 1 }
  ]);
  assert.deepEqual(result.deleted, [{ source: 'public.account_email_change_challenges.user_id', count: 1 }]);
  assert.ok(calls.some(({ sql }) => sql.includes('actor_user_id"=NULL')));
  assert.ok(calls.some(({ sql }) => sql.includes("campaign_status='frozen'")));
  assert.ok(calls.some(({ sql }) => sql.startsWith('DELETE FROM "public"."account_email_change_challenges"')));
});

test('best-effort anonymization fails closed when a reviewed reference is stale or unsupported', async () => {
  const client = { async query() { return { rowCount: 0, rows: [] }; } };
  await assert.rejects(() => applyBestEffortAnonymization(client, { sources: [
    { source: 'public.organizer_campaign_events.actor_user_id', recordCount: 1, items: [{ id: 'event-1', ordinal: 1, rowKey: ['17'], rowKeyColumns: ['id'] }], itemsComplete: true }
  ] }, 42, { 'public.organizer_campaign_events.actor_user_id': [] }), { code: 'CLEANUP_SELECTION_INVALID' });
  await assert.rejects(() => applyBestEffortAnonymization(client, { sources: [
    { source: 'public.unknown_records.user_id', recordCount: 1, items: [{ id: 'unknown-1', ordinal: 1, rowKey: ['19'], rowKeyColumns: ['id'] }], itemsComplete: true }
  ] }, 42, { 'public.unknown_records.user_id': ['unknown-1'] }), { code: 'CLEANUP_SOURCE_UNSUPPORTED' });
});

test('all known personal-reference columns have explicit row-level best-effort policies', async () => {
  const sources = [
    'public.account_email_change_challenges.user_id',
    'public.idempotency_records.actor_user_id',
    'public.organizer_campaign_contributions.accepted_by_user_id',
    'public.organizer_campaign_events.actor_user_id',
    'public.organizer_campaign_notices.recipient_user_id',
    'public.organizer_campaign_reports.reporter_user_id',
    'public.organizer_campaigns.organizer_user_id',
    'public.user_trust_ratings.rater_user_id',
    'public.user_trust_ratings.subject_user_id'
  ];
  const calls = [];
  const client = { async query(sql) { calls.push(sql); return { rowCount: 1, rows: [] }; } };
  const inventory = { sources: sources.map((source, index) => ({
    source,
    recordCount: 1,
    itemsComplete: true,
    items: [{ id: `item-${index}`, ordinal: 1, rowKey: [String(index + 1)], rowKeyColumns: ['id'] }]
  })) };
  const selection = Object.fromEntries(inventory.sources.map((source) => [source.source, source.items.map((item) => item.id)]));

  const result = await applyBestEffortAnonymization(client, inventory, 42, selection);

  assert.equal(result.anonymized.length, 6);
  assert.equal(result.deleted.length, 3);
  assert.equal(calls.length, 9);
  assert.ok(calls.some((sql) => sql.includes('reporter_user_id=NULL,details=NULL')));
  assert.ok(calls.some((sql) => sql.includes('rater_user_id=NULL,moderation_status=\'hidden\',private_note=NULL')));
  assert.ok(calls.some((sql) => sql.includes('subject_user_id=NULL,moderation_status=\'hidden\',private_note=NULL')));
});
