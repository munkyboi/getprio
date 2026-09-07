// Run only against the intended environment. Evidence contains a reference, never personal data.
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const db=require('../backend/src/config/db');
const [command,requestId,kind,evidence]=process.argv.slice(2);
try {
  if(command==='list') {
    const {rows}=await db.pool.query(`SELECT id,status,requested_at,due_at,last_error_code FROM account_deletion_requests WHERE status<>'completed' OR completion_sent_at IS NULL ORDER BY due_at`);
    console.table(rows);
  } else if(command==='tasks' && requestId) {
    const {rows}=await db.pool.query('SELECT kind,status,evidence FROM account_deletion_tasks WHERE request_id=$1',[requestId]);
    console.table(rows);
  } else if(command==='attest' && requestId && kind && evidence) {
    const {rowCount}=await db.pool.query(`UPDATE account_deletion_tasks SET status='completed',evidence=$3,completed_at=NOW()
      WHERE request_id=$1 AND kind=$2 AND status='pending'`,[requestId,kind,evidence]);
    if(!rowCount) throw Error('No pending task matched.');
    await db.pool.query('UPDATE account_deletion_requests SET next_attempt_at=NOW() WHERE id=$1',[requestId]);
    console.log('Task attested. Remaining tasks must be completed before account erasure.');
  } else if(command==='notice' && requestId && kind) {
    await db.pool.query('UPDATE account_deletion_requests SET retention_notice=$2,next_attempt_at=NOW() WHERE id=$1',[requestId,kind]);
    console.log('Completion notice stored.');
  } else if(command==='run') {
    await require('../backend/src/services/accountDeletionWorker').runOnce();
  } else throw Error('Usage: account-deletion.mjs list | tasks REQUEST | attest REQUEST KIND EVIDENCE_REFERENCE | notice REQUEST NOTICE_TEXT | run');
} finally {await db.pool.end();}
