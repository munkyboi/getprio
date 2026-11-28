const test = require("node:test");
const assert = require("node:assert/strict");

const { assertPublicJoinFlowSupported } = require("../src/services/publicQueueAdmission");

test("public join remains available for simple queue locations", () => {
  assert.doesNotThrow(() => assertPublicJoinFlowSupported({ queueType: "simple" }));
  assert.doesNotThrow(() => assertPublicJoinFlowSupported({}));
});

test("resource and workflow locations reject simple public join before OTP issuance", () => {
  for (const queueType of ["resource", "workflow"]) {
    assert.throws(
      () => assertPublicJoinFlowSupported({ queueType }),
      (error) => error.code === "QUEUE_TYPE_ADMISSION_REQUIRED"
        && error.statusCode === 409
        && error.queueType === queueType
        && error.supportedFlow === "booking"
    );
  }
});
