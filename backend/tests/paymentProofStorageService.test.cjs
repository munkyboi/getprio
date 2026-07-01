const test = require("node:test");
const assert = require("node:assert/strict");

function requireWithMocks(targetPath, mocks) {
  const resolvedTarget = require.resolve(targetPath);
  const originals = new Map();
  for (const [requestPath, mockExports] of Object.entries(mocks)) {
    const resolvedDependency = require.resolve(requestPath, { paths: [require("node:path").dirname(resolvedTarget)] });
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

test("payment proof storage validates metadata and booking ownership", async () => {
  const service = requireWithMocks("../src/services/paymentProofStorageService.js", {
    "../config/env": {
      b2Region: "us-west-004",
      b2S3Endpoint: "https://s3.example.test",
      b2BucketPaymentProof: "proof-bucket",
      b2KeyId: "key-id",
      b2ApplicationKey: "app-key"
    },
    "@aws-sdk/client-s3": {
      GetObjectCommand: class GetObjectCommand { constructor(input) { this.input = input; } },
      PutObjectCommand: class PutObjectCommand { constructor(input) { this.input = input; } },
      S3Client: class S3Client { constructor() {} send() { return Promise.resolve(); } }
    },
    "@aws-sdk/s3-request-presigner": {
      getSignedUrl: async (_client, command) => `https://signed.example/${command.input.Key || "upload"}`
    }
  });

  assert.throws(() => service.assertUploadMetadata({ contentType: "text/plain", sizeBytes: 10 }), (error) => error.statusCode === 400);
  assert.equal(service.assertObjectKeyBelongsToBooking({ tenantId: "tenant-1", _id: "booking-1" }, "payment-proofs/tenants/tenant-1/bookings/booking-1/file.jpg"), "payment-proofs/tenants/tenant-1/bookings/booking-1/file.jpg");
  await assert.rejects(
    () => service.createViewAccess({ booking: { tenantId: "tenant-1", _id: "booking-1" } }),
    (error) => error.statusCode === 404
  );
});

test("payment proof storage creates uploads and binary access records", async () => {
  const service = requireWithMocks("../src/services/paymentProofStorageService.js", {
    "../config/env": {
      b2Region: "us-west-004",
      b2S3Endpoint: "https://s3.example.test",
      b2BucketPaymentProof: "proof-bucket",
      b2KeyId: "key-id",
      b2ApplicationKey: "app-key"
    },
    "@aws-sdk/client-s3": {
      GetObjectCommand: class GetObjectCommand { constructor(input) { this.input = input; } },
      PutObjectCommand: class PutObjectCommand { constructor(input) { this.input = input; } },
      S3Client: class S3Client { constructor() {} send() { return Promise.resolve(); } }
    },
    "@aws-sdk/s3-request-presigner": {
      getSignedUrl: async (_client, command) => `https://signed.example/${command.input.Key || "upload"}`
    }
  });

  const upload = await service.createUpload({
    booking: { tenantId: "tenant-1", _id: "booking-1" },
    body: { fileName: "proof.png", contentType: "image/png", sizeBytes: 100 }
  });
  assert.equal(upload.proof.fileName, "proof.png");
  assert.match(upload.upload.url, /https:\/\/signed\.example\//);

  const binary = await service.uploadBinary({
    booking: { tenantId: "tenant-1", _id: "booking-1" },
    body: { fileName: "proof.png", contentType: "image/png", sizeBytes: 4 },
    fileBuffer: Buffer.from("test")
  });
  assert.equal(binary.proof.contentType, "image/png");
});
