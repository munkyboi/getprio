const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "../..");

test("clean-slate bootstrap removes migration-owned child tables before rebuilding parents", () => {
  const initSql = fs.readFileSync(path.join(repositoryRoot, "database", "init.sql"), "utf8");
  const migrationSql = fs.readdirSync(path.join(repositoryRoot, "database", "migrations"))
    .filter((fileName) => fileName.endsWith(".sql"))
    .map((fileName) => fs.readFileSync(path.join(repositoryRoot, "database", "migrations", fileName), "utf8"))
    .join("\n");
  const bookingDropAt = initSql.indexOf("DROP TABLE IF EXISTS bookings CASCADE;");
  const bundleDropAt = initSql.indexOf("DROP TABLE IF EXISTS booking_bundle_items CASCADE;");
  const migrationOwnedTables = [...migrationSql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)? ([a-z0-9_]+)/gi)]
    .map((match) => match[1]);

  assert.notEqual(bookingDropAt, -1);
  assert.notEqual(bundleDropAt, -1);
  assert.ok(bundleDropAt < bookingDropAt, "migration-owned booking children must be dropped before bookings");
  assert.doesNotMatch(initSql, /DROP SCHEMA IF EXISTS public CASCADE/);
  for (const tableName of new Set(migrationOwnedTables)) {
    assert.match(initSql, new RegExp(`DROP TABLE IF EXISTS ${tableName} CASCADE;`), `${tableName} must be included in clean-slate bootstrap`);
  }
});

test("booking bundle repair restores vendor and location boundary constraints", () => {
  const migrationSql = fs.readFileSync(
    path.join(repositoryRoot, "database", "migrations", "20260719_repair_booking_bundle_integrity.sql"),
    "utf8"
  );

  const bookingsLockAt = migrationSql.indexOf("LOCK TABLE bookings IN SHARE ROW EXCLUSIVE MODE;");
  const bundleLockAt = migrationSql.indexOf("LOCK TABLE booking_bundle_items IN SHARE ROW EXCLUSIVE MODE;");
  assert.notEqual(bookingsLockAt, -1);
  assert.notEqual(bundleLockAt, -1);
  assert.ok(bookingsLockAt < bundleLockAt, "migration must lock booking parents before bundle rows");
  assert.match(migrationSql, /DELETE FROM booking_bundle_items/);
  assert.match(migrationSql, /RETURNING to_jsonb\(bundle_item\) AS bundle_item_snapshot/);
  assert.match(migrationSql, /INSERT INTO booking_bundle_integrity_repairs/);
  assert.match(migrationSql, /FOREIGN KEY \(booking_id, tenant_id, location_id\)/);
  assert.match(migrationSql, /FOREIGN KEY \(location_id, tenant_id\)/);
  assert.match(migrationSql, /FOREIGN KEY \(service_id, tenant_id\)/);

  const verifier = fs.readFileSync(path.join(repositoryRoot, "scripts", "db-verify-schema.sh"), "utf8");
  assert.match(verifier, /pg_get_constraintdef\(oid\) = required\.required_definition/);
  assert.match(verifier, /Found % cross-boundary booking bundle rows/);
});
