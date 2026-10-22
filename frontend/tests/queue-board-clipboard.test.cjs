require("tsx/cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const { copyQueueBoardUrl } = require("../src/utils/queueBoardClipboard.ts");
const fallback = "Could not copy the URL. Select and copy it from the field above.";
test("board copy explains manual fallback when clipboard is absent or denied", async () => {
  assert.equal(await copyQueueBoardUrl("https://example.test/queue-board/id", undefined), fallback);
  assert.equal(await copyQueueBoardUrl("board", {}), fallback);
  assert.equal(await copyQueueBoardUrl("board", { writeText() { throw new Error("Unavailable"); } }), fallback);
  assert.equal(await copyQueueBoardUrl("board", { async writeText() { throw new Error("Denied"); } }), fallback);
});
test("board copy writes exact URL with clipboard receiver and reports success", async () => {
  const clipboard = { value: null, async writeText(value) { this.value = value; } };
  const url = "https://example.test/queue-board/unique-id";
  assert.equal(await copyQueueBoardUrl(url, clipboard), "Board URL copied.");
  assert.equal(clipboard.value, url);
});
