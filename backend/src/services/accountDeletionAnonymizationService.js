const { BEST_EFFORT_ANONYMIZATION_SOURCES, SAFE_CLEANUP_SOURCES } = require('./accountDeletionInventoryService');

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;
const DELETE_SOURCES = new Set([
  'public.customer_favorites.customer_user_id',
  'public.account_email_change_challenges.user_id',
  'public.idempotency_records.actor_user_id',
  'public.organizer_campaign_notices.recipient_user_id'
]);

function quoteIdentifier(identifier) {
  if (!IDENTIFIER.test(String(identifier || ''))) throw Object.assign(new Error('Invalid identifier in account anonymization policy.'), { code: 'CLEANUP_POLICY_INVALID' });
  return `"${identifier}"`;
}

function statementFor(source) {
  switch (source) {
    case 'public.queue_events.actor_user_id':
    case 'public.tickets.service_started_by_user_id':
    case 'public.tickets.service_ended_by_user_id':
    case 'public.ticket_service_plans.created_by_user_id':
    case 'public.resource_ledger_commands.actor_user_id':
    case 'public.organizer_campaign_contributions.accepted_by_user_id':
    case 'public.organizer_campaign_events.actor_user_id':
      return ({ table, foreignKey }) => `UPDATE ${table} SET ${quoteIdentifier(foreignKey)}=NULL`;
    case 'public.organizer_campaign_notices.recipient_user_id':
      return ({ table }) => `DELETE FROM ${table}`;
    case 'public.organizer_campaign_reports.reporter_user_id':
      return ({ table }) => `UPDATE ${table} SET reporter_user_id=NULL,details=NULL`;
    case 'public.organizer_campaigns.organizer_user_id':
      return ({ table }) => `UPDATE ${table} SET organizer_user_id=NULL,campaign_status='frozen',visibility='private_link',frozen_at=COALESCE(frozen_at,NOW()),frozen_reason=COALESCE(frozen_reason,'Owner account deleted; campaign frozen for continuity.')`;
    case 'public.user_trust_ratings.rater_user_id':
      return ({ table }) => `UPDATE ${table} SET rater_user_id=NULL,moderation_status='hidden',private_note=NULL`;
    case 'public.user_trust_ratings.subject_user_id':
      return ({ table }) => `UPDATE ${table} SET subject_user_id=NULL,moderation_status='hidden',private_note=NULL`;
    default:
      if (DELETE_SOURCES.has(source)) return ({ table }) => `DELETE FROM ${table}`;
      return null;
  }
}

async function applyBestEffortAnonymization(client, inventory, userId, referenceSelection) {
  const populatedSources = inventory.sources.filter((source) => source.recordCount > 0 && source.source !== 'public.users.id');
  const expectedSources = new Set(populatedSources.map((source) => source.source));
  if (!referenceSelection || Object.keys(referenceSelection).length !== expectedSources.size
    || Object.keys(referenceSelection).some((source) => !expectedSources.has(source))) {
    throw Object.assign(new Error('The approved per-reference selection is incomplete.'), { code: 'CLEANUP_SELECTION_INVALID' });
  }

  const result = { anonymized: [], deleted: [] };
  for (const sourceInfo of populatedSources) {
    const { source, recordCount, items = [] } = sourceInfo;
    const selectedIds = Array.isArray(referenceSelection[source]) ? [...referenceSelection[source]].sort() : [];
    const actualIds = items.map((item) => item.id).sort();
    if (!sourceInfo.itemsComplete || items.length !== recordCount || selectedIds.length !== actualIds.length
      || selectedIds.some((id, index) => id !== actualIds[index])) {
      throw Object.assign(new Error(`The reviewed references changed or were not fully selected in ${source}.`), { code: 'CLEANUP_SELECTION_INVALID' });
    }
    if (SAFE_CLEANUP_SOURCES.has(source)) continue;
    const buildStatement = statementFor(source);
    if (!BEST_EFFORT_ANONYMIZATION_SOURCES.has(source) || !buildStatement) {
      throw Object.assign(new Error(`No approved anonymization rule exists for ${source}.`), { code: 'CLEANUP_SOURCE_UNSUPPORTED' });
    }
    const [schema, tableName, foreignKey] = source.split('.');
    const table = `${quoteIdentifier(schema)}.${quoteIdentifier(tableName)}`;
    const action = DELETE_SOURCES.has(source) ? 'deleted' : 'anonymized';
    for (const item of items) {
      if (!Array.isArray(item.rowKey) || item.rowKey.length === 0) {
        throw Object.assign(new Error(`A stable row key is unavailable for ${source}.`), { code: 'CLEANUP_ROW_KEY_UNAVAILABLE' });
      }
      const keyNames = item.rowKeyColumns;
      if (!Array.isArray(keyNames) || keyNames.length !== item.rowKey.length) {
        throw Object.assign(new Error(`Primary-key metadata is unavailable for ${source}.`), { code: 'CLEANUP_ROW_KEY_UNAVAILABLE' });
      }
      const where = [...keyNames.map((key, index) => `${quoteIdentifier(key)}=$${index + 1}`), `${quoteIdentifier(foreignKey)}=$${keyNames.length + 1}`].join(' AND ');
      const sql = `${buildStatement({ table, foreignKey })} WHERE ${where}`;
      const response = await client.query(sql, [...item.rowKey, userId]);
      if (response.rowCount !== 1) {
        throw Object.assign(new Error(`The reviewed reference changed while processing ${source}.`), { code: 'CLEANUP_REFERENCE_CHANGED' });
      }
    }
    result[action].push({ source, count: items.length });
  }
  return result;
}

module.exports = { applyBestEffortAnonymization };
