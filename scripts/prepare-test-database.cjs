// Builds only the explicitly named, local disposable integration database.
const { Client } = require('pg');
const fs = require('node:fs');
const path = require('node:path');
const { orderedMigrationFiles } = require('./helpers/migration-order.cjs');

const DATABASES = {
  BOOKING_REMINDER_TEST_DATABASE_URL: { name: 'getprio_reminders_test', createSql: 'CREATE DATABASE getprio_reminders_test' },
  ACCOUNT_DELETION_TEST_DATABASE_URL: { name: 'getprio_deletion_test', createSql: 'CREATE DATABASE getprio_deletion_test' },
  NOTIFICATION_INBOX_TEST_DATABASE_URL: { name: 'getprio_inbox_test', createSql: 'CREATE DATABASE getprio_inbox_test' }
};

async function prepareTestDatabase(variable, { connectionString = process.env[variable], clientClass = Client } = {}) {
  const database = DATABASES[variable];
  if (!Object.hasOwn(DATABASES, variable)) throw new Error('Unsupported disposable test database.');
  const url = new URL(connectionString);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== `/${database.name}`) {
    throw new Error(`Only a local ${database.name} database may be bootstrapped.`);
  }
  const root = path.resolve(__dirname, '..');
  // Resolve the complete dependency graph before creating/resetting a database.
  const migrations = orderedMigrationFiles(path.join(root, 'database/migrations'));
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
    await client.query(fs.readFileSync(path.join(root, 'database/init.sql'), 'utf8'));
    for (const file of migrations) {
      await client.query(fs.readFileSync(file, 'utf8'));
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
