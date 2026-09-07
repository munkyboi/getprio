// Builds only the explicitly named, local disposable integration database.
const { Client } = require('pg');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const url = new URL(process.env.ACCOUNT_DELETION_TEST_DATABASE_URL);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/getprio_deletion_test') {
    throw Error('Only a local getprio_deletion_test database may be bootstrapped.');
  }
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new Client({connectionString: adminUrl.toString()});
  await admin.connect();
  try {
    await admin.query('CREATE DATABASE getprio_deletion_test');
  } catch (error) {
    if (error.code !== '42P04') throw error;
  } finally { await admin.end(); }
  const client = new Client({connectionString: url.toString()});
  await client.connect();
  try {
    const root = path.resolve(__dirname, '..');
    await client.query(fs.readFileSync(path.join(root, 'database/init.sql'), 'utf8'));
    const dir = path.join(root, 'database/migrations');
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
      await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
    }
  } finally { await client.end(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
