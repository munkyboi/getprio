import { Pool, type PoolClient } from "pg";
import env from "./env";
import { createDatabasePoolConfig } from "./databaseSsl";

type TransactionCallback<T> = (client: PoolClient) => Promise<T>;

let activePool: Pool | undefined;

function getPool(): Pool {
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
