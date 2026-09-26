const test = require("node:test");
const assert = require("node:assert/strict");
const { runRetentionSweep } = require("../src/services/developerApiRetentionService");

test("developer API retention removes expired replay records and minimizes terminal customer data", async () => {
  const queries = [];
  const result = await runRetentionSweep({ client: { query: async (sql) => {
    queries.push(sql);
    return { rowCount: queries.length === 1 ? 3 : 2, rows: [] };
  } } });
  assert.deepEqual(result, { expiredOperationCount: 3, deletedCustomerDataCount: 2 });
  assert.match(queries[0], /DELETE FROM developer_api_operations/);
  assert.match(queries[1], /terminal_at < NOW\(\) - INTERVAL '90 days'/);
  assert.match(queries[1], /recipient_email = NULL/);
});
