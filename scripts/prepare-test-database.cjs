// Builds only the explicitly named, local disposable integration database.
const { Client } = require('pg');
const fs = require('node:fs');
const path = require('node:path');

const DATABASES = {
  ACCOUNT_DELETION_TEST_DATABASE_URL: { name: 'getprio_deletion_test', createSql: 'CREATE DATABASE getprio_deletion_test' },
  NOTIFICATION_INBOX_TEST_DATABASE_URL: { name: 'getprio_inbox_test', createSql: 'CREATE DATABASE getprio_inbox_test' }
};

async function prepareTestDatabase(variable, { connectionString = process.env[variable], clientClass = Client } = {}) {
  const database = DATABASES[variable];
  if (!Object.hasOwn(DATABASES, variable)) throw Error('Unsupported disposable test database.');
  const url = new URL(connectionString);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== `/${database.name}`) {
    throw Error(`Only a local ${database.name} database may be bootstrapped.`);
  }
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new clientClass({connectionString: adminUrl.toString()});
  await admin.connect();
  try {
    await admin.query(database.createSql);
  } catch (error) {
    if (error.code !== '42P04') throw error;
  } finally { await admin.end(); }
  const client = new clientClass({connectionString: url.toString()});
  await client.connect();
  try {
    const root = path.resolve(__dirname, '..');
    await client.query(fs.readFileSync(path.join(root, 'database/init.sql'), 'utf8'));
    const dir = path.join(root, 'database/migrations');
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
      await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
    }
  } finally { await client.end(); }
}

function runPreparation(variable) {
  return prepareTestDatabase(variable).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
module.exports = { prepareTestDatabase, runPreparation };
