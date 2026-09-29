const db = require('../config/db');
const notificationService = require('./notificationService');
const securityAuditService = require('./securityAuditService');
const { collectRelationalInventory, unsafeCleanupReferences } = require('./accountDeletionInventoryService');
const { applyBestEffortAnonymization } = require('./accountDeletionAnonymizationService');
const env = require('../config/env');

function emailConfigured() {
  return Boolean(env.resendApiKey || env.sendgridApiKey || (env.smtpHost && env.smtpUser && env.smtpPass));
}

async function generateInventory(client, request) {
  if (!request.user_id) return false;
  const { rows: [claimed] } = await client.query(`
    UPDATE account_deletion_requests
    SET scan_status='running', scan_started_at=COALESCE(scan_started_at,NOW()),
        scan_attempts=scan_attempts+1, scan_next_attempt_at=NOW()+INTERVAL '5 minutes',
        scan_error_code=NULL, updated_at=NOW()
    WHERE id=$1 AND scan_status IN ('queued','running')
    RETURNING id,scan_attempts
  `, [request.id]);
  if (!claimed) return false;

  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  try {
    await client.query("SET LOCAL statement_timeout='10s'");
    const report = await collectRelationalInventory(client, request.user_id);
    const unsafeReferences = unsafeCleanupReferences(report);
    const publicSources = report.sources.map(({ items = [], ...source }) => ({
      ...source,
      items: items.map(({ id, ordinal, rowKey = [], rowKeyColumns = [] }) => ({
        id,
        ordinal,
        rowIdentity: Object.fromEntries(rowKeyColumns.map((column, index) => [column, rowKey[index] == null ? null : String(rowKey[index])]))
      }))
    }));
    const unenumeratedSources = report.sources.filter((source) => source.recordCount > 0 && !source.itemsComplete);
    const blockersBySource = new Map(unsafeReferences.map((item) => [item.source, item]));
    for (const item of unenumeratedSources) blockersBySource.set(item.source, item);
    const relationalBlockers = [...blockersBySource.values()];
    const scanReport = {
      version: Number(claimed.scan_attempts),
      generatedAt: report.generatedAt,
      coverage: "partial",
      scope: report.scope,
      categories: [
        { id: "relational_references", label: "Application relational references", status: relationalBlockers.length ? "requires_review" : "scanned", sourceCount: report.sourceCount, referenceCount: report.referenceCount, reason: relationalBlockers.length ? `${relationalBlockers.length} populated user-linked sources need an approved disposition or have records the scan cannot enumerate.` : undefined, blockers: relationalBlockers.map(({ source, recordCount, deleteRules = [], items = [], itemsComplete = false }) => ({ source, recordCount, deleteRules, items: items.map(({ id, ordinal, rowIdentity }) => ({ id, ordinal, rowIdentity })), itemsComplete })) },
        { id: "copied_identifiers", label: "Copied identifiers and JSON payloads", status: "not_scanned", reason: "The current scan does not inspect copied text or JSON values." },
        { id: "object_storage", label: "Object storage and caches", status: "not_scanned", reason: "Provider-wide object and cache inventory is not connected to this scan." },
        { id: "supplier_data", label: "Supplier data", status: "not_scanned", reason: "Supplier-side inventory and deletion receipts are not connected." },
        { id: "financial_and_legal_retention", label: "Financial and legal retention", status: "requires_review", reason: "Retention disposition requires an approved category-level rule." },
        { id: "backup_disposal", label: "Backups and restore replay", status: "not_scanned", reason: "Backup lifecycle and restore-replay evidence are not connected." }
      ],
      inventory: { ...report, sources: publicSources }
    };
    await client.query(`
      UPDATE account_deletion_requests
      SET scan_status='report_ready', scan_report=$2::jsonb, scan_completed_at=NOW(),
          scan_error_code=NULL, updated_at=NOW()
      WHERE id=$1
    `, [request.id, JSON.stringify(scanReport)]);
    await securityAuditService.record({
      actorRole: 'system', action: 'account_deletion.relational_inventory.completed',
      resourceType: 'account_deletion_request', resourceId: request.id,
      reason: 'Automated relational user-ID inventory completed.', outcome: 'success',
      afterState: { scanStatus: 'report_ready', sourceCount: report.sourceCount, referenceCount: report.referenceCount },
      metadata: { inventoryVersion: report.version, scope: 'relational_user_id_references' }
    }, { client });
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    await client.query(`
      UPDATE account_deletion_requests
      SET scan_status='needs_attention', scan_error_code=$2,
          scan_next_attempt_at=NOW()+INTERVAL '1 hour', updated_at=NOW()
      WHERE id=$1
    `, [request.id, error.code || 'INVENTORY_SCAN_FAILED']);
    throw error;
  }
}

async function runApprovedCleanup(client, request) {
  const { rows: [claimed] } = await client.query(`
    UPDATE account_deletion_requests
    SET cleanup_status='running', cleanup_started_at=COALESCE(cleanup_started_at,NOW()),
        attempts=attempts+1, last_error_code=NULL, updated_at=NOW()
    WHERE id=$1 AND cleanup_status IN ('queued','running') RETURNING id
  `, [request.id]);
  if (!claimed) return false;
  await client.query('BEGIN');
  try {
    const { rows: [lockedRequest] } = await client.query(`
      SELECT r.user_id,r.cleanup_selection,r.scan_report,u.email,u.username
      FROM account_deletion_requests r LEFT JOIN users u ON u.id=r.user_id
      WHERE r.id=$1 FOR UPDATE OF r
    `, [request.id]);
    if (!lockedRequest?.user_id || lockedRequest.cleanup_selection?.selected?.relational_references !== true) {
      throw Object.assign(new Error('Cleanup selection or account target is unavailable.'), { code: 'CLEANUP_TARGET_UNAVAILABLE' });
    }
    const selected = lockedRequest.cleanup_selection.selected;
    const selectedReferences = lockedRequest.cleanup_selection.references || {};
    const exclusions = lockedRequest.cleanup_selection.exclusions || {};
    const categories = lockedRequest.scan_report?.categories || [];
    if (Number(lockedRequest.cleanup_selection.reportVersion) !== Number(lockedRequest.scan_report?.version)
      || Object.keys(selected).length !== categories.length
      || categories.some((category) => typeof selected[category.id] !== 'boolean'
        || (selected[category.id] && category.id !== 'relational_references')
        || (!selected[category.id] && String(exclusions[category.id] || '').trim().length < 8))) {
      throw Object.assign(new Error('The approved cleanup selection no longer matches the generated report.'), { code: 'CLEANUP_SELECTION_INVALID' });
    }
    const userId = lockedRequest.user_id;
    await client.query("SET LOCAL statement_timeout='20s'");
    const { rows: [lockedUser] } = await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
    if (!lockedUser) throw Object.assign(new Error('The account no longer exists at cleanup time.'), { code: 'CLEANUP_TARGET_UNAVAILABLE' });
    const currentInventory = await collectRelationalInventory(client, userId);
    const currentReferenceSources = currentInventory.sources.filter((item) => item.recordCount > 0 && item.source !== 'public.users.id');
    const storedReferenceSources = (lockedRequest.scan_report?.inventory?.sources || []).filter((item) => item.recordCount > 0 && item.source !== 'public.users.id');
    if (currentReferenceSources.length !== storedReferenceSources.length || currentReferenceSources.some((source) => {
      const stored = storedReferenceSources.find((item) => item.source === source.source);
      const expectedIds = (stored?.items || []).map((item) => item.id).sort();
      const storedItemsIdentified = (stored?.items || []).every((item) => item.rowIdentity && typeof item.rowIdentity === 'object' && Object.keys(item.rowIdentity).length > 0);
      const selectedIds = Array.isArray(selectedReferences[source.source]) ? [...selectedReferences[source.source]].sort() : [];
      const currentIds = (source.items || []).map((item) => item.id).sort();
      return !source.itemsComplete || !stored?.itemsComplete || !storedItemsIdentified || expectedIds.length !== source.recordCount
        || currentIds.length !== expectedIds.length || currentIds.some((id, index) => id !== expectedIds[index])
        || selectedIds.length !== expectedIds.length || selectedIds.some((id, index) => id !== expectedIds[index]);
    })) {
      throw Object.assign(new Error('The relational references changed or were not all included in the reviewed checklist.'), { code: 'CLEANUP_REFERENCES_CHANGED' });
    }
    const anonymization = await applyBestEffortAnonymization(client, currentInventory, userId, selectedReferences);
    const afterAnonymizationInventory = await collectRelationalInventory(client, userId);
    const unsafeReferences = unsafeCleanupReferences(afterAnonymizationInventory);
    if (unsafeReferences.length) {
      throw Object.assign(new Error('New or unresolved linked records require review before account deletion.'), {
        code: 'CLEANUP_REFERENCES_UNSAFE',
        details: unsafeReferences.map(({ source, recordCount }) => ({ source, recordCount }))
      });
    }
    const { rows: tickets } = await client.query(`UPDATE tickets SET customer_name='Deleted customer',customer_email=NULL,customer_phone=NULL,notes=NULL,
      notify_by_email=FALSE,notify_by_sms=FALSE WHERE user_id=$1 RETURNING id`, [userId]);
    const { rows: bookings } = await client.query(`UPDATE bookings SET customer_name='Deleted customer',customer_email=NULL,customer_phone=NULL,notes=NULL,
      notify_by_email=FALSE,notify_by_sms=FALSE WHERE customer_user_id=$1 RETURNING id`, [userId]);
    await client.query('DELETE FROM auth_login_attempts WHERE identifier_value=ANY($1::text[])', [[lockedRequest.email, lockedRequest.username].filter(Boolean)]);
    const { rows: securityEvents } = await client.query(`UPDATE auth_security_events
      SET user_id=NULL,session_id=NULL,ip_address=NULL,user_agent=NULL,metadata='{}'::jsonb
      WHERE user_id=$1 RETURNING id`, [userId]);
    const { rows: deletedUsers } = await client.query('DELETE FROM users WHERE id=$1 RETURNING id', [userId]);
    if (deletedUsers.length !== 1) throw Object.assign(new Error('The account row was not deleted.'), { code: 'CLEANUP_USER_DELETE_UNVERIFIED' });
    const ticketIds = tickets.map((ticket) => ticket.id);
    const bookingIds = bookings.map((booking) => booking.id);
    const securityEventIds = securityEvents.map((event) => event.id);
    const [ticketVerification, bookingVerification, eventVerification, loginVerification, remainingUser, postInventory] = await Promise.all([
      client.query(`SELECT COUNT(*)::int AS count FROM tickets WHERE id=ANY($1::bigint[])
        AND (customer_name<>'Deleted customer' OR customer_email IS NOT NULL OR customer_phone IS NOT NULL OR notes IS NOT NULL OR notify_by_email OR notify_by_sms)`, [ticketIds]),
      client.query(`SELECT COUNT(*)::int AS count FROM bookings WHERE id=ANY($1::bigint[])
        AND (customer_name<>'Deleted customer' OR customer_email IS NOT NULL OR customer_phone IS NOT NULL OR notes IS NOT NULL OR notify_by_email OR notify_by_sms)`, [bookingIds]),
      client.query("SELECT COUNT(*)::int AS count FROM auth_security_events WHERE id=ANY($1::bigint[]) AND (user_id IS NOT NULL OR session_id IS NOT NULL OR ip_address IS NOT NULL OR user_agent IS NOT NULL OR metadata<>'{}'::jsonb)", [securityEventIds]),
      client.query('SELECT COUNT(*)::int AS count FROM auth_login_attempts WHERE identifier_value=ANY($1::text[])', [[lockedRequest.email, lockedRequest.username].filter(Boolean)]),
      client.query('SELECT id FROM users WHERE id=$1', [userId]),
      collectRelationalInventory(client, userId)
    ]);
    const verifiedCounts = [ticketVerification, bookingVerification, eventVerification, loginVerification].map(({ rows }) => Number(rows[0]?.count || 0));
    if (verifiedCounts.some((count) => count !== 0) || remainingUser.rows.length || postInventory.referenceCount !== 0) {
      throw Object.assign(new Error('Post-cleanup verification found remaining account data.'), { code: 'CLEANUP_VERIFICATION_FAILED' });
    }
    const selection = lockedRequest.cleanup_selection;
    const excluded = categories.filter((category) => selected[category.id] === false)
      .map((category) => ({ categoryId: category.id, label: category.label, reason: exclusions[category.id] }));
    const cleanupReport = {
      version: 1,
      completedAt: new Date().toISOString(),
      actions: [
        { categoryId: 'relational_references', outcome: 'best_effort_anonymized', details: 'The account identity was removed; approved actor/reporter links and private notes were minimized, ownerless campaigns were frozen, and transient challenge/idempotency/recipient records were removed. File evidence and copied identifiers were not inspected by this scan.', ticketsMinimized: tickets.length, bookingsMinimized: bookings.length, securityEventsMinimized: securityEvents.length, anonymizedReferences: anonymization.anonymized, deletedTransientReferences: anonymization.deleted }
      ],
      exclusions: excluded,
      coverage: lockedRequest.scan_report?.coverage || 'partial',
      scanReportVersion: selection.reportVersion,
      verification: { userRowAbsent: true, knownPiiScrubCounts: verifiedCounts, remainingNumericReferences: postInventory.referenceCount }
    };
    await client.query(`
      UPDATE account_deletion_requests
      SET cleanup_status='completed',cleanup_report=$2::jsonb,cleanup_completed_at=NOW(),
          report_status='ready',retention_notice=$3,status='processing',last_error_code=NULL,updated_at=NOW()
      WHERE id=$1
    `, [request.id, JSON.stringify(cleanupReport), excluded.length ? `Categories excluded from automated cleanup: ${excluded.map((item) => `${item.categoryId} (${item.reason})`).join('; ')}` : 'No category exclusions were recorded.']);
    await securityAuditService.record({
      actorRole: 'system', action: 'account_deletion.cleanup.completed', resourceType: 'account_deletion_request',
      resourceId: request.id, reason: 'Approved allowlisted account cleanup completed.', outcome: 'success',
      afterState: { cleanupStatus: 'completed', ticketsMinimized: tickets.length, bookingsMinimized: bookings.length, securityEventsMinimized: securityEvents.length, anonymizedReferenceSources: anonymization.anonymized.length, deletedTransientReferenceSources: anonymization.deleted.length, exclusions: excluded.map(({ categoryId }) => categoryId) }
    }, { client });
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    await client.query(`UPDATE account_deletion_requests SET cleanup_status='needs_attention',last_error_code=$2,
      cleanup_report=$3::jsonb,next_attempt_at=NOW()+INTERVAL '1 hour',updated_at=NOW() WHERE id=$1`, [request.id, error.code || 'CLEANUP_FAILED', JSON.stringify({
        version: 1, failedAt: new Date().toISOString(), outcome: 'needs_attention',
        errorCode: error.code || 'CLEANUP_FAILED', details: error.details || [],
        message: 'The cleanup transaction rolled back; no partial changes were committed.'
      })]);
    throw error;
  }
}

async function sendUserReport(client, request) {
  if (!emailConfigured() || !request.contact_email || !request.cleanup_report) {
    await client.query(`UPDATE account_deletion_requests SET report_status='needs_attention',report_error_code='REPORT_DELIVERY_UNAVAILABLE',
      report_attempts=report_attempts+1,next_attempt_at=NOW()+INTERVAL '1 hour',updated_at=NOW() WHERE id=$1`, [request.id]);
    return false;
  }
  const report = request.cleanup_report;
  const totalCount = (items) => (items || []).reduce((total, item) => {
    const count = Number(item?.count);
    return total + (Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0);
  }, 0);
  const actions = Array.isArray(report.actions) ? report.actions : [];
  const anonymizedCount = actions.reduce((total, action) => total + totalCount(action.anonymizedReferences), 0);
  const removedCount = actions.reduce((total, action) => total + totalCount(action.deletedTransientReferences), 0);
  const minimizedCounts = actions.reduce((totals, action) => ({
    bookings: totals.bookings + (Number.isFinite(Number(action.bookingsMinimized)) ? Math.max(0, Math.trunc(Number(action.bookingsMinimized))) : 0),
    support: totals.support + (Number.isFinite(Number(action.ticketsMinimized)) ? Math.max(0, Math.trunc(Number(action.ticketsMinimized))) : 0),
    security: totals.security + (Number.isFinite(Number(action.securityEventsMinimized)) ? Math.max(0, Math.trunc(Number(action.securityEventsMinimized))) : 0)
  }), { bookings: 0, support: 0, security: 0 });
  const actionSummary = [
    '- Your GetPrio account and sign-in access were removed.',
    anonymizedCount ? `- ${anonymizedCount} account-linked ${anonymizedCount === 1 ? 'record was' : 'records were'} anonymized so they are no longer directly linked to your account.` : null,
    removedCount ? `- ${removedCount} temporary ${removedCount === 1 ? 'record was' : 'records were'} removed.` : null,
    minimizedCounts.bookings || minimizedCounts.support || minimizedCounts.security
      ? `- We minimized personal details in ${minimizedCounts.bookings} ${minimizedCounts.bookings === 1 ? 'booking' : 'bookings'}, ${minimizedCounts.support} ${minimizedCounts.support === 1 ? 'support record' : 'support records'}, and ${minimizedCounts.security} ${minimizedCounts.security === 1 ? 'security record' : 'security records'} retained for service integrity.`
      : null
  ].filter(Boolean).join('\n');
  const exclusionDescriptions = {
    relational_references: 'Some account-related records could not be fully processed automatically and may require further review.',
    copied_identifiers: 'Copies of account details embedded in messages or other content were not included in this automated process.',
    object_storage: 'Stored files and cached copies were not included in this automated process.',
    supplier_data: 'Information held by external service providers was not included in this automated process.',
    financial_and_legal_retention: 'Some information may be retained where needed for legal, financial, security, or service-integrity reasons.',
    backup_disposal: 'Backup copies were not included in this automated process and may remain until their normal expiry.'
  };
  const exclusions = [...new Set((Array.isArray(report.exclusions) ? report.exclusions : []).map((item) =>
    exclusionDescriptions[item?.categoryId] || 'Some data could not be included in this automated process.'
  ))];
  const exclusionSummary = exclusions.length ? exclusions.map((description) => `- ${description}`).join('\n') : '- No additional data categories were excluded from this automated process.';
  try {
    const sent = await notificationService.sendEmail({
      to: request.contact_email,
      subject: 'Update on your GetPrio account deletion request',
      text: `Hello,\n\nWe’ve finished processing your GetPrio account deletion request.\n\nWhat we did\n${actionSummary}\n\nWhat was not included\n${exclusionSummary}\n\nPlease note: Some information may be retained where needed for legal, financial, security, or service-integrity reasons. This report covers the automated processing described above; it does not confirm removal from external providers or backup copies unless noted.\n\nIf you have questions, please contact GetPrio Support.`,
      purpose: 'account_deletion',
      idempotencyKey: `account-deletion-report-${request.id}`
    });
    if (!sent) throw Object.assign(new Error('Report delivery was not accepted.'), { code: 'REPORT_EMAIL_NOT_ACCEPTED' });
    await client.query(`UPDATE account_deletion_requests SET report_status='sent',report_sent_at=NOW(),report_attempts=report_attempts+1,
      report_error_code=NULL,status='completed',completed_at=NOW(),completion_sent_at=NOW(),contact_email=NULL,updated_at=NOW() WHERE id=$1`, [request.id]);
    return true;
  } catch (error) {
    await client.query(`UPDATE account_deletion_requests SET report_status='needs_attention',report_error_code=$2,
      report_attempts=report_attempts+1,next_attempt_at=NOW()+INTERVAL '1 hour',updated_at=NOW() WHERE id=$1`, [request.id, error.code || 'REPORT_EMAIL_FAILED']);
    throw error;
  }
}

async function runOnce() {
  // PostgreSQL advisory lock serializes workers across server instances, including email dispatch.
  const client = await db.pool.connect();
  let locked = false;
  try {
    const { rows: [lock] } = await client.query('SELECT pg_try_advisory_lock(7090701) AS locked');
    if (!lock.locked) return;
    locked = true;
    const { rows } = await client.query(`SELECT * FROM account_deletion_requests
      WHERE (next_attempt_at<=NOW() AND (status<>'completed' OR completion_sent_at IS NULL))
         OR (scan_status IN ('queued','running') AND scan_next_attempt_at<=NOW())
         OR cleanup_status IN ('queued','running')
         OR (report_status='sending' AND next_attempt_at<=NOW())
      ORDER BY requested_at LIMIT 20`);
    for (const request of rows) {
      try {
        if (request.scan_status === 'queued' || request.scan_status === 'running') {
          await generateInventory(client, request);
        }
        if (request.cleanup_status === 'queued' || request.cleanup_status === 'running') {
          await runApprovedCleanup(client, request);
        }
        if (request.report_status === 'sending') {
          await sendUserReport(client, request);
        }
        if (!request.acknowledgement_sent_at && emailConfigured() && request.contact_email) {
          const sent = await notificationService.sendEmail({to: request.contact_email,subject:'GetPrio account deletion requested',
            text:`Your account deletion request ${request.id} was accepted. Access has been revoked. We will complete deletion by ${new Date(request.due_at).toISOString().slice(0,10)} and notify you. Only records with a documented legal retention basis may remain.`,purpose:'account_deletion'});
          if (sent) await client.query('UPDATE account_deletion_requests SET acknowledgement_sent_at=NOW() WHERE id=$1',[request.id]);
        }
        if (request.status === 'completed' && !request.completion_sent_at && emailConfigured() && request.contact_email) {
          const sent = await notificationService.sendEmail({to:request.contact_email,subject:'GetPrio account deletion completed',
            text:`Account deletion request ${request.id} is complete. Your account and non-required personal data have been removed. ${request.retention_notice}`,purpose:'account_deletion'});
          if (sent) await client.query('UPDATE account_deletion_requests SET completion_sent_at=NOW(),contact_email=NULL WHERE id=$1',[request.id]);
          else throw Object.assign(new Error('Completion notification failed'), {code: 'COMPLETION_EMAIL_FAILED'});
        }
      } catch (error) {
        await client.query(`UPDATE account_deletion_requests SET attempts=attempts+1,last_error_code=$2,
          next_attempt_at=NOW()+INTERVAL '1 hour',updated_at=NOW() WHERE id=$1`,[request.id, error.code || 'DELETION_PROCESSING_FAILED']);
      }
    }
    const { rows: [overdue] } = await client.query("SELECT count(*)::int AS count FROM account_deletion_requests WHERE status<>'completed' AND due_at<NOW()+INTERVAL '7 days'");
    if(overdue.count) console.error(`[account-deletion-deadline] ${overdue.count} requests require operator action`);
    await client.query("DELETE FROM account_deletion_requests WHERE completed_at<NOW()-INTERVAL '12 months' AND completion_sent_at IS NOT NULL");
  } finally {
    try { if (locked) await client.query('SELECT pg_advisory_unlock(7090701)'); } finally { client.release(); }
  }
}
module.exports={runOnce,generateInventory,runApprovedCleanup,sendUserReport};
