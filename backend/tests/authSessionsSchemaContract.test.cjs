const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "../..");

test("auth session schema accepts every supported OAuth provider", () => {
  const sources = [
    fs.readFileSync(path.join(repoRoot, "database/init.sql"), "utf8"),
    fs.readFileSync(path.join(repoRoot, "database/migrations/20260605_add_auth_session_security_tables.sql"), "utf8")
  ];

  for (const source of sources) {
    assert.match(source, /auth_method TEXT NOT NULL CHECK \(auth_method IN \('password', 'google', 'facebook', 'apple'\)\)/);
  }
});

test("existing databases receive the Apple auth session constraint repair", () => {
  const migration = fs.readFileSync(
    path.join(repoRoot, "database/migrations/20260918_01_allow_apple_auth_sessions.sql"),
    "utf8"
  );

  assert.match(migration, /DROP CONSTRAINT IF EXISTS auth_sessions_auth_method_check/);
  assert.match(migration, /ADD CONSTRAINT auth_sessions_auth_method_check\s+CHECK \(auth_method IN \('password', 'google', 'facebook', 'apple'\)\)/);
});
