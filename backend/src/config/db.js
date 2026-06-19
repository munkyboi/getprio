const { Pool } = require("pg");
const env = require("./env");

let activePool;

function getPool() {
  if (!activePool) {
    activePool = new Pool({
      connectionString: env.databaseUrl,
      ssl: env.databaseSsl ? { rejectUnauthorized: false } : false
    });
  }

  return activePool;
}

const pool = getPool();

async function connectDb() {
  const nextPool = getPool();
  await nextPool.query("SELECT 1");
  return nextPool;
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
  pool,
  default: {
    connectDb,
    withTransaction,
    pool
  }
};
