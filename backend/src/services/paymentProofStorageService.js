const crypto = require("crypto");
const { GetObjectCommand, PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const env = require("../config/env");

const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const GROUP_FUNDED_ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const UPLOAD_EXPIRES_SECONDS = 300;
const VIEW_EXPIRES_SECONDS = 300;

let s3Client;

function normalizeHttpUrl(value) {
  const text = String(value || "").trim().replace(/\/$/, "");
  if (!text) {
    return "";
  }

  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}

function getS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({
      region: env.b2Region,
      endpoint: normalizeHttpUrl(env.b2S3Endpoint),
      credentials: {
        accessKeyId: env.b2KeyId,
        secretAccessKey: env.b2ApplicationKey
      },
      forcePathStyle: true
    });
  }

  return s3Client;
}

function assertPaymentProofStorageConfigured() {
  const missing = [
    ["B2_S3_ENDPOINT", env.b2S3Endpoint],
    ["B2_BUCKET_PAYMENT_PROOF", env.b2BucketPaymentProof],
    ["B2_KEY_ID", env.b2KeyId],
    ["B2_APPLICATION_KEY", env.b2ApplicationKey]
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length) {
    const error = new Error(`Payment proof storage is not configured. Missing: ${missing.join(", ")}.`);
    error.statusCode = 503;
    throw error;
  }
}

function getExtension(fileName, contentType) {
  const extension = String(fileName || "").toLowerCase().match(/\.(jpe?g|png|webp|pdf)$/)?.[1];
  if (extension) {
    return extension === "jpeg" ? "jpg" : extension;
  }

  if (contentType === "application/pdf") {
    return "pdf";
  }
  if (contentType === "image/png") {
    return "png";
  }
  if (contentType === "image/webp") {
    return "webp";
  }
  return "jpg";
}

function normalizeObjectKeySegment(value, fallback) {
  return String(value || fallback)
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || fallback;
}

function normalizeFileName(fileName) {
  const normalized = Array.isArray(fileName) ? fileName[0] : fileName;
  return String(normalized || "payment-proof")
    .trim()
    .replace(/[^\w.\- ]+/g, "")
    .slice(0, 160) || "payment-proof";
}

function assertUploadMetadata({ contentType, sizeBytes }) {
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    const error = new Error("Only JPEG, PNG, and WebP proof images are supported.");
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_UPLOAD_BYTES) {
    const error = new Error("Payment proof image must be between 1 byte and 8 MB.");
    error.statusCode = 400;
    throw error;
  }
}

function assertGroupFundedUploadMetadata({ contentType, sizeBytes }) {
  if (!GROUP_FUNDED_ALLOWED_CONTENT_TYPES.has(contentType)) {
    const error = new Error("Only JPEG, PNG, WebP, and PDF contribution proof files are supported.");
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_UPLOAD_BYTES) {
    const error = new Error("Contribution proof file must be between 1 byte and 8 MB.");
    error.statusCode = 400;
    throw error;
  }
}

function buildObjectKey({ booking, fileName, contentType }) {
  const extension = getExtension(fileName, contentType);
  const randomId = crypto.randomBytes(10).toString("hex");

  return `payment-proofs/tenants/${booking.tenantId}/bookings/${booking._id}/${Date.now()}-${randomId}.${extension}`;
}

function buildGroupFundedObjectKey({ campaign, user, fileName, contentType }) {
  const extension = getExtension(fileName, contentType);
  const randomId = crypto.randomBytes(10).toString("hex");
  const campaignToken = normalizeObjectKeySegment(campaign.publicToken || campaign._id, "campaign");
  const userId = normalizeObjectKeySegment(user?._id || "user", "user");

  return `group-funded/${campaignToken}/${userId}/${Date.now()}-${randomId}.${extension}`;
}

function assertObjectKeyBelongsToBooking(booking, objectKey) {
  const key = String(objectKey || "").trim();
  const prefix = `payment-proofs/tenants/${booking.tenantId}/bookings/${booking._id}/`;

  if (!key || !key.startsWith(prefix)) {
    const error = new Error("Payment proof upload does not belong to this booking.");
    error.statusCode = 400;
    throw error;
  }

  return key;
}

async function createUpload({ booking, body }) {
  assertPaymentProofStorageConfigured();

  const fileName = normalizeFileName(body.fileName);
  const contentType = String(body.contentType || "").toLowerCase();
  const sizeBytes = Number(body.sizeBytes || 0);
  assertUploadMetadata({ contentType, sizeBytes });

  const objectKey = buildObjectKey({ booking, fileName, contentType });
  const command = new PutObjectCommand({
    Bucket: env.b2BucketPaymentProof,
    Key: objectKey,
    ContentType: contentType
  });
  const uploadUrl = await getSignedUrl(getS3Client(), command, {
    expiresIn: UPLOAD_EXPIRES_SECONDS
  });

  return {
    proof: {
      objectKey,
      fileName,
      contentType,
      sizeBytes
    },
    upload: {
      method: "PUT",
      url: uploadUrl,
      headers: {
        "Content-Type": contentType
      },
      expiresInSeconds: UPLOAD_EXPIRES_SECONDS
    }
  };
}

async function uploadBinary({ booking, body, fileBuffer }) {
  assertPaymentProofStorageConfigured();

  const fileName = normalizeFileName(body.fileName);
  const contentType = String(body.contentType || "").toLowerCase();
  const sizeBytes = Number(body.sizeBytes || fileBuffer?.length || 0);
  assertUploadMetadata({ contentType, sizeBytes });

  if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length !== sizeBytes) {
    const error = new Error("Payment proof upload payload is invalid.");
    error.statusCode = 400;
    throw error;
  }

  const objectKey = buildObjectKey({ booking, fileName, contentType });
  await getS3Client().send(new PutObjectCommand({
    Bucket: env.b2BucketPaymentProof,
    Key: objectKey,
    ContentType: contentType,
    Body: fileBuffer
  }));

  return {
    proof: {
      objectKey,
      fileName,
      contentType,
      sizeBytes
    }
  };
}

async function uploadGroupFundedBinary({ campaign, user, body, fileBuffer }) {
  assertPaymentProofStorageConfigured();

  const fileName = normalizeFileName(body.fileName);
  const contentType = String(body.contentType || "").toLowerCase();
  const sizeBytes = Number(body.sizeBytes || fileBuffer?.length || 0);
  assertGroupFundedUploadMetadata({ contentType, sizeBytes });

  if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length !== sizeBytes) {
    const error = new Error("Contribution proof upload payload is invalid.");
    error.statusCode = 400;
    throw error;
  }

  const objectKey = buildGroupFundedObjectKey({ campaign, user, fileName, contentType });
  await getS3Client().send(new PutObjectCommand({
    Bucket: env.b2BucketPaymentProof,
    Key: objectKey,
    ContentType: contentType,
    Body: fileBuffer
  }));

  return {
    proof: {
      objectKey,
      fileName,
      contentType,
      sizeBytes
    }
  };
}

async function createViewAccess({ booking }) {
  assertPaymentProofStorageConfigured();

  if (!booking.paymentProofObjectKey) {
    const error = new Error("Payment proof has not been submitted for this booking.");
    error.statusCode = 404;
    throw error;
  }

  const command = new GetObjectCommand({
    Bucket: env.b2BucketPaymentProof,
    Key: booking.paymentProofObjectKey
  });
  const url = await getSignedUrl(getS3Client(), command, {
    expiresIn: VIEW_EXPIRES_SECONDS
  });

  return {
    proof: {
      fileName: booking.paymentProofFileName,
      contentType: booking.paymentProofContentType,
      sizeBytes: booking.paymentProofSizeBytes,
      uploadedAt: booking.paymentProofUploadedAt
    },
    access: {
      method: "GET",
      url,
      expiresInSeconds: VIEW_EXPIRES_SECONDS
    }
  };
}

module.exports = {
  assertObjectKeyBelongsToBooking,
  assertGroupFundedUploadMetadata,
  assertUploadMetadata,
  createUpload,
  uploadBinary,
  uploadGroupFundedBinary,
  createViewAccess
};
