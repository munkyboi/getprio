const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function loadUploads(state) {
  const base = path.resolve(__dirname, "../src/services");
  const saved = new Map();
  const mock = (request, exports) => {
    const id = require.resolve(request, { paths: [base] });
    saved.set(id, require.cache[id]);
    require.cache[id] = { id, filename: id, loaded: true, exports };
  };
  mock("../repositories/platform", { getImageUploadLimitKb: async () => {
    if (state.failure) throw new Error("Settings unavailable");
    return state.limit;
  } });
  mock("../config/env", {
    b2Region: "us-west-004", b2S3Endpoint: "https://s3.example.test",
    b2BucketPublicBoard: "images", b2BucketPaymentProof: "proofs",
    b2KeyId: "test", b2ApplicationKey: "test", b2PublicBaseUrl: "https://cdn.example.test"
  });
  mock("../repositories/users", { updateUser: async () => ({ _id: "1" }) });
  mock("../repositories/publicBoardThemes", { createAsset: async (asset) => ({ _id: "1", ...asset }) });
  mock("@aws-sdk/client-s3", {
    PutObjectCommand: class { constructor(input) { this.input = input; } },
    GetObjectCommand: class { constructor(input) { this.input = input; } },
    S3Client: class { async send(command) { state.writes.push(command.input); } }
  });
  mock("@aws-sdk/s3-request-presigner", { getSignedUrl: async (_client, command, options) => {
    state.signatures.push({ input: command.input, options });
    return "https://signed.example.test";
  } });
  const names = ["imageUploadPolicy", "userAvatarUploadService", "vendorMediaUploadService", "publicBoardThemeUploadService", "locationPaymentQrUploadService", "campaignReportAttachmentService", "paymentProofStorageService"];
  const services = {};
  try {
    for (const name of names) {
      const id = require.resolve(path.join(base, name));
      saved.set(id, require.cache[id]);
      delete require.cache[id];
      services[name] = require(id);
    }
    return services;
  } finally {
    for (const [id, original] of saved) {
      if (original) require.cache[id] = original;
      else delete require.cache[id];
    }
  }
}
function args(size, contentType = "image/png") {
  const fileBuffer = Buffer.alloc(size);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(fileBuffer);
  return {
    tenant: { _id: "1" }, location: { _id: "2", slug: "main" }, user: { _id: "3" },
    campaign: { _id: "4", tenantId: "1" }, booking: { _id: "5", tenantId: "1" },
    fileName: "test.png", contentType, fileBuffer,
    body: { fileName: "test.png", contentType, sizeBytes: 1 }
  };
}

test("every binary image path enforces current policy on actual bytes before storage", async () => {
  const state = { limit: 200, writes: [], signatures: [] };
  const services = loadUploads(state);
  const uploads = [
    services.userAvatarUploadService.uploadAvatar,
    services.vendorMediaUploadService.uploadBinary,
    services.publicBoardThemeUploadService.uploadBinary,
    services.locationPaymentQrUploadService.uploadBinary,
    services.campaignReportAttachmentService.uploadBinary,
    services.paymentProofStorageService.uploadBinary,
    services.paymentProofStorageService.uploadGroupFundedBinary
  ];
  for (const upload of uploads) {
    state.limit = 200;
    const before = state.writes.length;
    await assert.rejects(upload(args(204801)), { code: "IMAGE_UPLOAD_SIZE_EXCEEDED", statusCode: 400 });
    assert.equal(state.writes.length, before);
    const result = await upload(args(204800));
    assert.equal(state.writes.at(-1).Body.length, 204800);
    const asset = result.asset || result.attachment || result.proof;
    if (asset) assert.equal(asset.sizeBytes, 204800, "metadata uses actual bytes, not caller's size");
    state.limit = 300;
    await upload(args(204801));
    state.limit = 100;
    await assert.rejects(upload(args(204800)), /100 KB/);
    state.failure = true;
    await assert.rejects(upload(args(10)), /Settings unavailable/);
    state.failure = false;
  }
});

test("presigned image uploads reject oversized metadata and bind accepted size into signature", async () => {
  const state = { limit: 200, writes: [], signatures: [] };
  const services = loadUploads(state);
  for (const service of [services.vendorMediaUploadService, services.publicBoardThemeUploadService, services.paymentProofStorageService]) {
    const input = args(10);
    input.body.sizeBytes = 204801;
    await assert.rejects(service.createUpload(input), { code: "IMAGE_UPLOAD_SIZE_EXCEEDED" });
    input.body.sizeBytes = 204800;
    await service.createUpload(input);
    assert.equal(state.signatures.at(-1).input.ContentLength, 204800);
    assert.ok(state.signatures.at(-1).options.signableHeaders.has("content-length"));
  }
});

test("PDF proof uploads retain their 8 MB ceiling", async () => {
  const state = { limit: 200, writes: [], signatures: [] };
  const service = loadUploads(state).paymentProofStorageService;
  await service.uploadGroupFundedBinary(args(8 * 1024 * 1024, "application/pdf"));
  await assert.rejects(service.uploadGroupFundedBinary(args(8 * 1024 * 1024 + 1, "application/pdf")), /8 MB/);
});

test("AWS presigner includes content-length in signed headers without network access", async () => {
  const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
  const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
  const client = new S3Client({ region: "us-west-004", endpoint: "https://s3.example.test", credentials: { accessKeyId: "test", secretAccessKey: "test" }, forcePathStyle: true });
  const url = await getSignedUrl(client, new PutObjectCommand({ Bucket: "images", Key: "test.png", ContentType: "image/png", ContentLength: 204800 }), { expiresIn: 300, signableHeaders: new Set(["content-length"]) });
  assert.ok(new URL(url).searchParams.get("X-Amz-SignedHeaders").split(";").includes("content-length"));
  client.destroy();
});
