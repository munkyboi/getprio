const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function requireWithDb(dbMock) {
  const targetPath = require.resolve("../src/repositories/mfa.js");
  const dbPath = require.resolve(path.resolve(path.dirname(targetPath), "../config/db"));
  const originalDb = require.cache[dbPath];
  try {
    require.cache[dbPath] = {
      id: dbPath,
      filename: dbPath,
      loaded: true,
      exports: dbMock
    };
    delete require.cache[targetPath];
    return require(targetPath);
  } finally {
    delete require.cache[targetPath];
    if (originalDb) require.cache[dbPath] = originalDb;
    else delete require.cache[dbPath];
  }
}

test("MFA replacement keeps the active factor until confirmation swaps it transactionally", async () => {
  const startQueries = [];
  const confirmQueries = [];
  let transactionCount = 0;
  const startClient = {
    query: async (sql) => {
      startQueries.push(sql);
      if (sql.includes("INSERT INTO auth_mfa_factors")) {
        return { rows: [{ id: 2, user_id: 19, factor_type: "totp", status: "pending" }] };
      }
      return { rows: [] };
    }
  };
  const confirmClient = {
    query: async (sql) => {
      confirmQueries.push(sql);
      if (sql.includes("SELECT user_id, factor_type")) {
        return { rows: [{ user_id: 19, factor_type: "totp" }] };
      }
      if (sql.includes("RETURNING *")) {
        return { rows: [{ id: 2, user_id: 19, factor_type: "totp", status: "active" }] };
      }
      return { rows: [] };
    }
  };
  const clients = [startClient, confirmClient];
  const repository = requireWithDb({
    pool: { query: async () => { throw new Error("pool query should not run outside a transaction"); } },
    withTransaction: async (callback) => {
      const client = clients[transactionCount];
      transactionCount += 1;
      return callback(client);
    }
  });

  await repository.replacePendingTotpFactor("19", {
    ciphertext: "ciphertext",
    iv: "iv",
    authTag: "tag"
  });
  await repository.activateFactor("2");

  assert.equal(transactionCount, 2);
  assert.equal(startQueries.some((sql) => sql.includes("status = 'active'")), false);
  assert.equal(confirmQueries[0].includes("FOR UPDATE"), true);
  assert.equal(confirmQueries[1].includes("status = 'revoked'"), true);
  assert.equal(confirmQueries[1].includes("status = 'active'"), true);
  assert.equal(confirmQueries[2].includes("SET status = 'active'"), true);
});

test("canceling enrollment revokes only the pending factor", async () => {
  let query = "";
  const repository = requireWithDb({
    pool: {
      query: async (sql) => {
        query = sql;
        return { rows: [{ id: 2 }] };
      }
    }
  });

  const canceled = await repository.revokePendingTotpFactor("19");

  assert.equal(canceled, true);
  assert.match(query, /status = 'pending'/);
  assert.doesNotMatch(query, /status IN \('pending', 'active'\)/);
});
