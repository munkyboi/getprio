const test = require("node:test");
const assert = require("node:assert/strict");

const { buildOperationIdentity } = require("../src/middleware/idempotency");
const { requestHash } = require("../src/services/idempotencyService");

test("idempotency identity binds tenant, operation, target, and request body", () => {
  const identity = buildOperationIdentity({
    authorizedTenant: { _id: "12" },
    params: { purchaseId: "44", tenantSlug: "demo" },
    body: { outcome: "confirmed" }
  }, "tenant.credit_refund.request");
  assert.deepEqual(identity, { operation: "tenant.credit_refund.request", tenantId: "12", target: "44" });
  assert.notEqual(
    requestHash({ identity, body: { outcome: "confirmed" } }),
    requestHash({ identity: { ...identity, target: "45" }, body: { outcome: "confirmed" } })
  );
});

test("production review idempotency identity binds the submission", () => {
  const identity = buildOperationIdentity({
    params: { projectId: "project-1", submissionId: "submission-44" },
    body: { status: "approved" }
  }, "platform.developer_production_approval.review");
  assert.deepEqual(identity, {
    operation: "platform.developer_production_approval.review",
    tenantId: "platform",
    target: "submission-44"
  });
});
