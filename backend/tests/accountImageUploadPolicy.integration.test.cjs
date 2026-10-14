const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const url = process.env.NOTIFICATION_INBOX_TEST_DATABASE_URL;

test("account image policy uses live platform settings and upload enforcement", { skip: !url }, async t => {
  const parsed = new URL(url);
  assert.equal(parsed.pathname, "/getprio_inbox_test");
  assert.ok(["localhost", "127.0.0.1"].includes(parsed.hostname));
  process.env.DATABASE_URL = url;
  process.env.DATABASE_SSL = "false";
  const db = require("../src/config/db");
  const platform = require("../src/repositories/platform");
  const policy = require("../src/services/imageUploadPolicy");
  const originalReader = platform.getImageUploadLimitKb;
  const users = require("../src/repositories/users");
  const sessions = require("../src/services/sessionService");
  const express = require("express");
  const app = express();
  const router = require("../src/routes/accountRoutes");
  app.use("/api/account", router);
  app.use("/api/v1/account", router);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ message: error.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const paths = ["/api/account/image-upload-policy", "/api/v1/account/image-upload-policy"];
  let userId;
  const { rows: [originalSetting] } = await db.pool.query("SELECT value, updated_by_user_id FROM platform_settings WHERE key='max_image_upload_kb'");
  try {
    const suffix = crypto.randomUUID();
    const { rows: [user] } = await db.pool.query("INSERT INTO users(name,username,email) VALUES($1,$2,$3) RETURNING id", ["Policy test", suffix, suffix + "@example.invalid"]);
    userId = String(user.id);
    const session = await sessions.createAuthSession({ user: await users.findUserById(userId), authMethod: "password" });
    const headers = { authorization: "Bearer " + session.accessToken };
    const read = async path => {
      const response = await fetch(base + path, { headers });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      return response.json();
    };
    await t.test("both aliases require authentication before reading settings", async () => {
      let calls = 0;
      platform.getImageUploadLimitKb = async () => { calls++; return originalReader(); };
      try {
        for (const path of paths) {
          assert.equal((await fetch(base + path)).status, 401);
          assert.equal((await fetch(base + path, { headers: { authorization: "Bearer invalid" } })).status, 401);
        }
        assert.equal(calls, 0);
      } finally {
        platform.getImageUploadLimitKb = originalReader;
      }
    });
    await t.test("fresh reads match byte enforcement after platform updates at both bounds", async () => {
      for (const limitKb of [200, 300, 1, 8192]) {
        await db.pool.query("INSERT INTO platform_settings(key,value) VALUES('max_image_upload_kb',$1) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value", [String(limitKb)]);
        for (const path of paths) {
          const result = await read(path);
          assert.deepEqual(result, { maxImageBytes: limitKb * 1024 });
          await policy.assertImageUploadSize(result.maxImageBytes);
          await assert.rejects(policy.assertImageUploadSize(result.maxImageBytes + 1), { statusCode: 400, code: "IMAGE_UPLOAD_SIZE_EXCEEDED" });
        }
      }
    });
    await t.test("missing or invalid stored settings use the same effective default", async () => {
      await db.pool.query("DELETE FROM platform_settings WHERE key='max_image_upload_kb'");
      for (const path of paths) assert.deepEqual(await read(path), { maxImageBytes: 204800 });
      for (const value of ["0", "8193", "1.5", "invalid"]) {
        await db.pool.query("INSERT INTO platform_settings(key,value) VALUES('max_image_upload_kb',$1) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value", [value]);
        assert.deepEqual(await read(paths[0]), { maxImageBytes: 204800 });
        await policy.assertImageUploadSize(204800);
        await assert.rejects(policy.assertImageUploadSize(204801), { code: "IMAGE_UPLOAD_SIZE_EXCEEDED" });
      }
    });
    await t.test("settings failure returns an uncached error instead of an invented limit", async () => {
      platform.getImageUploadLimitKb = async () => { throw new Error("Settings unavailable"); };
      try {
        for (const path of paths) {
          const response = await fetch(base + path, { headers });
          assert.equal(response.status, 500);
          assert.equal(response.headers.get("cache-control"), "no-store");
          assert.equal(Object.hasOwn(await response.json(), "maxImageBytes"), false);
        }
        await assert.rejects(policy.assertImageUploadSize(1), /Settings unavailable/);
      } finally {
        platform.getImageUploadLimitKb = originalReader;
      }
    });
  } finally {
    platform.getImageUploadLimitKb = originalReader;
    if (originalSetting) {
      await db.pool.query("INSERT INTO platform_settings(key,value,updated_by_user_id) VALUES('max_image_upload_kb',$1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by_user_id=EXCLUDED.updated_by_user_id", [originalSetting.value, originalSetting.updated_by_user_id]);
    } else {
      await db.pool.query("DELETE FROM platform_settings WHERE key='max_image_upload_kb'");
    }
    if (userId) await db.pool.query("DELETE FROM users WHERE id=$1", [userId]);
    await new Promise(resolve => server.close(resolve));
    await db.pool.end();
  }
});
