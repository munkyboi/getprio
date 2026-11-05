const fs = require("node:fs");

function normalizeCertificate(value) {
  const certificate = String(value || "").replace(/\\n/g, "\n").trim();
  if (!certificate) {
    throw new Error("The configured database CA certificate is empty.");
  }
  if (
    !certificate.startsWith("-----BEGIN CERTIFICATE-----") ||
    !certificate.endsWith("-----END CERTIFICATE-----")
  ) {
    throw new Error("The configured database CA certificate is not valid PEM.");
  }
  return certificate;
}

function createDatabaseSslConfig(
  { enabled = false, ca = "", caFile = "" } = {},
  readFileSync = fs.readFileSync
) {
  if (!enabled) return false;
  if (ca && caFile) {
    throw new Error("Set only one of DATABASE_SSL_CA or DATABASE_SSL_CA_FILE.");
  }

  const certificate = ca
    ? normalizeCertificate(ca)
    : caFile
      ? normalizeCertificate(readFileSync(caFile, "utf8"))
      : undefined;

  return certificate
    ? { rejectUnauthorized: true, ca: certificate }
    : { rejectUnauthorized: true };
}

function normalizeDatabaseConnectionString(connectionString, sslEnabled) {
  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch {
    return connectionString;
  }

  const conflictingOptions = ["sslmode", "sslcert", "sslkey", "sslrootcert"].filter(
    (name) => parsed.searchParams.has(name)
  );
  if (!conflictingOptions.length) return connectionString;
  if (!sslEnabled) {
    throw new Error(
      `DATABASE_URL contains TLS options (${conflictingOptions.join(", ")}) while ` +
        "DATABASE_SSL is disabled."
    );
  }

  conflictingOptions.forEach((name) => parsed.searchParams.delete(name));
  return parsed.toString();
}

function createDatabasePoolConfig(options, readFileSync = fs.readFileSync) {
  return {
    connectionString: normalizeDatabaseConnectionString(
      options.connectionString,
      options.enabled
    ),
    ssl: createDatabaseSslConfig(options, readFileSync)
  };
}

module.exports = {
  createDatabasePoolConfig,
  createDatabaseSslConfig,
  normalizeDatabaseConnectionString,
  normalizeCertificate
};
