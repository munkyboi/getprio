const { Pool } = require("pg");
const env = require("./env");

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: env.databaseUrl,
      ssl: env.databaseSsl ? { rejectUnauthorized: false } : false
    });
  }

  return pool;
}

async function connectDb() {
  const activePool = getPool();
  await activePool.query("SELECT 1");
  return activePool;
}

async function withTransaction(callback) {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  connectDb,
  withTransaction,
  get pool() {
    return getPool();
  }
};
