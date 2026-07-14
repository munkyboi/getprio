const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function requireWithMocks(targetPath, mocks) {
  const resolvedTarget = require.resolve(targetPath);
  const originals = new Map();

  for (const [requestPath, mockExports] of Object.entries(mocks)) {
    const resolvedDependency = require.resolve(requestPath, { paths: [path.dirname(resolvedTarget)] });
    originals.set(resolvedDependency, require.cache[resolvedDependency]);
    require.cache[resolvedDependency] = {
      id: resolvedDependency,
      filename: resolvedDependency,
      loaded: true,
      exports: mockExports
    };
  }

  delete require.cache[resolvedTarget];
  try {
    return require(resolvedTarget);
  } finally {
    delete require.cache[resolvedTarget];
    for (const [resolvedDependency, originalEntry] of originals.entries()) {
      if (originalEntry) require.cache[resolvedDependency] = originalEntry;
      else delete require.cache[resolvedDependency];
    }
  }
}

function loadService() {
  return requireWithMocks("../src/services/campaignReportAttachmentService.js", {
    "../config/env": {
      b2Region: "us-west-004",
      b2S3Endpoint: "https://s3.example.test",
      b2BucketPublicBoard: "public-board",
      b2KeyId: "key-id",
      b2ApplicationKey: "app-key",
      b2PublicBaseUrl: "https://files.example.test"
    },
    "@aws-sdk/client-s3": {
      PutObjectCommand: class PutObjectCommand { constructor(input) { this.input = input; } },
      S3Client: class S3Client { send() { return Promise.resolve(); } }
    }
  });
}

test("campaign report attachment service rejects non-string request fields", async () => {
  const service = loadService();
  const tenant = { _id: "tenant-1" };
  const campaign = { _id: "campaign-1" };

  await assert.rejects(
    () => service.uploadBinary({
      tenant,
      campaign,
      body: { contentType: ["image/png"], fileName: "report.png" },
      fileBuffer: Buffer.from("test")
    }),
    (error) => error.statusCode === 400 && /content type must be a string/i.test(error.message)
  );

  await assert.rejects(
    () => service.uploadBinary({
      tenant,
      campaign,
      body: { contentType: "image/png", fileName: ["report.png"] },
      fileBuffer: Buffer.from("test")
    }),
    (error) => error.statusCode === 400 && /file name must be a string/i.test(error.message)
  );

  assert.throws(
    () => service.getAttachmentForCampaign({
      tenant,
      campaign,
      objectKey: ["campaign-reports/tenants/tenant-1/campaigns/campaign-1/report.png"],
      fileName: "report.png"
    }),
    (error) => error.statusCode === 400 && /attachment key must be a string/i.test(error.message)
  );
});
