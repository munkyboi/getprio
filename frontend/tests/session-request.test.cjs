require("tsx/cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const { sessionRequest } = require("../src/context/sessionRequest.ts");
test("session requests on ordinary app surfaces reach the API exactly once", async () => {
  const original = global.fetch; let calls = 0;
  global.fetch = async () => { calls++; return { ok: true, status: 200, json: async () => ({ user: { name: "test" } }) }; };
  try { assert.equal((await sessionRequest("/auth/me")).user.name, "test"); assert.equal(calls, 1); } finally { global.fetch = original; }
});
