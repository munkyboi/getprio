const assert = require('node:assert/strict');
async function waitForDatabaseLock(pool, applicationName, fragment) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const result = await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE $2", [applicationName, `%${fragment}%`]);
    if (result.rowCount) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(`No lock waiter for ${fragment}`);
}
module.exports = { waitForDatabaseLock };
