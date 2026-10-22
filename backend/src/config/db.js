const { Pool } = require("pg");
const env = require("./env");
const { createDatabasePoolConfig } = require("./databaseSsl");

let activePool;

function getPool() {
  if (!activePool) {
    activePool = new Pool(createDatabasePoolConfig({
      connectionString: env.databaseUrl,
      enabled: env.databaseSsl,
      ca: env.databaseSslCa,
      caFile: env.databaseSslCaFile
    }));
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
