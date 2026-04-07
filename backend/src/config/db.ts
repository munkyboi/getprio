import { Pool, type PoolClient } from "pg";
import env from "./env";

type TransactionCallback<T> = (client: PoolClient) => Promise<T>;

let activePool: Pool | undefined;

function getPool(): Pool {
  if (!activePool) {
    activePool = new Pool({
      connectionString: env.databaseUrl,
      ssl: env.databaseSsl ? { rejectUnauthorized: false } : false
    });
  }

  return activePool;
}

export const pool = getPool();

export async function connectDb(): Promise<Pool> {
  const nextPool = getPool();
  await nextPool.query("SELECT 1");
  return nextPool;
}

export async function withTransaction<T>(callback: TransactionCallback<T>): Promise<T> {
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

const db = {
  connectDb,
  withTransaction,
  pool
};

export default db;
