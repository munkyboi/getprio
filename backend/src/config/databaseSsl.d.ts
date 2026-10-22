export type DatabaseSslConfig = false | {
  rejectUnauthorized: true;
  ca?: string;
};

export function createDatabaseSslConfig(
  options?: {
    enabled?: boolean;
    ca?: string;
    caFile?: string;
  },
  readFileSync?: (path: string, encoding: "utf8") => string,
): DatabaseSslConfig;

export function normalizeDatabaseConnectionString(
  connectionString: string,
  sslEnabled?: boolean,
): string;

export function createDatabasePoolConfig(
  options: {
    connectionString: string;
    enabled?: boolean;
    ca?: string;
    caFile?: string;
  },
  readFileSync?: (path: string, encoding: "utf8") => string,
): {
  connectionString: string;
  ssl: DatabaseSslConfig;
};

export function normalizeCertificate(value: unknown): string;
