const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createDatabasePoolConfig,
  createDatabaseSslConfig
} = require("../src/config/databaseSsl");

const validCertificate = [
  "-----BEGIN CERTIFICATE-----",
  "fictional-test-certificate",
  "-----END CERTIFICATE-----"
].join("\n");

test("database TLS stays disabled unless explicitly enabled", () => {
  assert.equal(createDatabaseSslConfig(), false);
});

test("database TLS verifies certificates with the system trust store by default", () => {
  assert.deepEqual(createDatabaseSslConfig({ enabled: true }), {
    rejectUnauthorized: true
  });
});

test("database TLS accepts an inline PEM certificate with escaped newlines", () => {
  assert.deepEqual(
    createDatabaseSslConfig({
      enabled: true,
      ca: validCertificate.replace(/\n/g, "\\n")
    }),
    {
      rejectUnauthorized: true,
      ca: validCertificate
    }
  );
});

test("database TLS reads a PEM certificate from the configured file", () => {
  let requestedPath;
  const ssl = createDatabaseSslConfig(
    { enabled: true, caFile: "/run/secrets/database-ca.pem" },
    (path, encoding) => {
      requestedPath = { path, encoding };
      return validCertificate;
    }
  );

  assert.deepEqual(requestedPath, {
    path: "/run/secrets/database-ca.pem",
    encoding: "utf8"
  });
  assert.deepEqual(ssl, {
    rejectUnauthorized: true,
    ca: validCertificate
  });
});

test("database TLS rejects ambiguous CA configuration", () => {
  assert.throws(
    () => createDatabaseSslConfig({ enabled: true, ca: validCertificate, caFile: "ca.pem" }),
    /Set only one/
  );
});

test("database TLS rejects a malformed CA before connecting", () => {
  assert.throws(
    () => createDatabaseSslConfig({ enabled: true, ca: "not-a-certificate" }),
    /not valid PEM/
  );
});

test("database pool config removes URL options that could override enabled TLS verification", () => {
  assert.deepEqual(
    createDatabasePoolConfig({
      connectionString: "postgresql://user:secret@db.example/getprio?sslmode=no-verify",
      enabled: true
    }),
    {
      connectionString: "postgresql://user:secret@db.example/getprio",
      ssl: { rejectUnauthorized: true }
    }
  );
});

test("database pool config rejects conflicting URL TLS when application TLS is disabled", () => {
  assert.throws(
    () => createDatabasePoolConfig({
      connectionString: "postgresql://user:secret@db.example/getprio?sslmode=require",
      enabled: false
    }),
    /while DATABASE_SSL is disabled/
  );
});

test("database pool config preserves unrelated URL options", () => {
  const connectionString = "postgresql://user:secret@db.example/getprio?application_name=getprio";
  assert.deepEqual(
    createDatabasePoolConfig({ connectionString, enabled: true }),
    {
      connectionString,
      ssl: { rejectUnauthorized: true }
    }
  );
});
