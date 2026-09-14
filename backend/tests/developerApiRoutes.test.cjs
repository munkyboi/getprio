const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const router = require("../src/routes/developerApiRoutes");

async function startServer() {
  const app = express();
  app.use((req, _res, next) => {
    req.context = { correlationId: "test-correlation-123" };
    next();
  });
  app.use("/v1", router);
  const server = await new Promise((resolve) => {
    const nextServer = app.listen(0, "127.0.0.1", () => resolve(nextServer));
  });
  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`
  };
}

function requestJson(url, host) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { headers: { host } }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({
        status: response.statusCode,
        headers: { get: (name) => response.headers[String(name).toLowerCase()] },
        body: JSON.parse(body)
      }));
    });
    request.on("error", reject);
  });
}

test("developer API metadata identifies the production environment", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { status, headers, body } = await requestJson(`${baseUrl}/`, "api.getprio.online");

    assert.equal(status, 200);
    assert.equal(headers.get("x-api-version"), "v1");
    assert.equal(headers.get("cache-control"), "no-store");
    assert.deepEqual(body, {
      data: {
        service: "getprio-queue-api",
        version: "v1",
        environment: "production",
        base_url: "https://api.getprio.online/v1",
        documentation_url: "https://developers.getprio.online"
      },
      request_id: "test-correlation-123"
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("developer API health identifies the sandbox environment", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { status, body } = await requestJson(`${baseUrl}/health`, "sandbox-api.getprio.online");

    assert.equal(status, 200);
    assert.deepEqual(body, {
      data: {
        status: "ok",
        service: "getprio-queue-api",
        version: "v1",
        environment: "sandbox"
      },
      request_id: "test-correlation-123"
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("developer API metadata does not claim an environment for an unknown host", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { status, body } = await requestJson(`${baseUrl}/`, "localhost");

    assert.equal(status, 200);
    assert.equal(body.data.environment, "unknown");
    assert.equal(body.data.base_url, null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
