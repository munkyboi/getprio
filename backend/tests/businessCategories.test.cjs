const test = require("node:test");
const assert = require("node:assert/strict");
const categories = require("../src/repositories/businessCategories");

test("category selection rejects structured values before reaching the database", async () => {
  const client = { query: () => assert.fail("Invalid input reached the database") };
  for (const input of [{ id: ["1"] }, { label: ["Health and Wellness"] }, { id: {} }, { label: {} }]) {
    await assert.rejects(categories.resolve(input, client), { statusCode: 400 });
  }
  assert.equal(await categories.resolve({}, client), null);
});

test("inactive categories can only be retained by their current vendor", async () => {
  const client = { query: async () => ({ rows: [{ id: "9", name: "Legacy category", is_active: false }] }) };
  await assert.rejects(categories.resolve({ id: "9", currentId: "8" }, client), { statusCode: 400 });
  assert.equal((await categories.resolve({ id: "9", currentId: "9" }, client)).name, "Legacy category");
});

test("category selection rejects names and IDs outside the maintained list", async () => {
  const client = { query: async () => ({ rows: [] }) };
  for (const input of [{ label: "Unlisted business" }, { id: "999999" }]) {
    await assert.rejects(categories.resolve(input, client), { statusCode: 400 });
  }
});

test("category selection uses the catalog name instead of a supplied custom label", async () => {
  const client = { query: async () => ({ rows: [{ id: "1", name: "Sports and Recreation", is_active: true }] }) };
  const category = await categories.resolve({ id: "1", label: "Unlisted business" }, client);
  assert.equal(category.name, "Sports and Recreation");
});
