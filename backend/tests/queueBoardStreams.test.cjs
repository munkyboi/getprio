const test = require("node:test");
const assert = require("node:assert/strict");
const { createStreamBudget } = require("../src/services/queueBoardStreams");
test("stream work is bounded across IPs, boards and the process and releases idempotently", () => {
  const budget = createStreamBudget({perIp: 2, perBoard: 2, total: 3});
  const a = budget.acquire("ip1", "board1");
  const b = budget.acquire("ip1", "board2");
  assert.equal(budget.acquire("ip1", "board3"), null);
  const c = budget.acquire("ip2", "board1");
  assert.equal(budget.acquire("ip3", "board1"), null);
  assert.equal(budget.acquire("ip3", "board3"), null);
  a(); a();
  const d = budget.acquire("ip3", "board1");
  assert.ok(d);
  assert.equal(budget.acquire("ip4", "board4"), null);
  b(); c(); d();
  assert.ok(budget.acquire("ip4", "board4"));
});
