const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("public Help Center responds only with the repository's published content and short cache lifetime", async () => {
  const routes = [];
  const router = new Proxy({}, { get: (_, method) => (...args) => { routes.push({ method, args }); } });
  const publicContent = { topics: [{ id: "queues", title: "Queues" }], articles: [{ id: "join", title: "Join a queue" }], faqs: [] };
  const fallback = new Proxy({}, { get: () => () => undefined });
  const mocks = {
    express: { Router: () => router },
    "../middleware/asyncHandler": (handler) => handler,
    "../repositories/platformHelpCenter": { getPublished: async () => publicContent }
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../src/routes/publicRoutes.js"), "utf8"), {
    require: (name) => mocks[name] || fallback,
    module: { exports: {} }
  });
  const route = routes.find(({ method, args }) => method === "get" && args[0] === "/help-center");
  assert.ok(route);
  const res = { headers: {}, body: null, set(key, value) { this.headers[key.toLowerCase()] = value; return this; }, setHeader(key, value) { this.headers[key.toLowerCase()] = value; return this; }, json(body) { this.body = body; return this; } };
  await route.args.at(-1)({}, res);
  assert.deepEqual(JSON.parse(JSON.stringify(res.body)), publicContent);
  assert.equal(res.headers["cache-control"], "public, max-age=60");
  assert.equal("review" in res.body.articles[0], false);
});
