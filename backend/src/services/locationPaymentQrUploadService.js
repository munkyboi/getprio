const crypto = require("crypto");
const { GetObjectCommand, PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const env = require("../config/env");

const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

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

function assertB2Configured() {
  const missing = [
    ["B2_S3_ENDPOINT", env.b2S3Endpoint],
    ["B2_BUCKET_PUBLIC_BOARD", env.b2BucketPublicBoard],
    ["B2_KEY_ID", env.b2KeyId],
    ["B2_APPLICATION_KEY", env.b2ApplicationKey],
    ["B2_PUBLIC_BASE_URL", env.b2PublicBaseUrl]
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length) {
    const error = new Error(`Payment QR uploads are not configured. Missing: ${missing.join(", ")}.`);
    error.statusCode = 503;
    throw error;
  }
}

function getExtension(fileName, contentType) {
  const extension = String(fileName || "").toLowerCase().match(/\.(jpe?g|png|webp)$/)?.[1];
  if (extension) {
    return extension === "jpeg" ? "jpg" : extension;
  }

  if (contentType === "image/png") {
    return "png";
  }
  if (contentType === "image/webp") {
    return "webp";
  }
  return "jpg";
}

function normalizeFileName(fileName) {
  return String(fileName || "payment-qr")
    .trim()
    .replace(/[^\w.\- ]+/g, "")
    .slice(0, 160) || "payment-qr";
}

function buildObjectKey({ tenant, location, fileName, contentType }) {
  const extension = getExtension(fileName, contentType);
  const randomId = crypto.randomBytes(10).toString("hex");

  return `payment-qrs/tenants/${tenant._id}/locations/${location.slug}/${Date.now()}-${randomId}.${extension}`;
}

function buildPublicUrl(objectKey) {
  const publicBaseUrl = normalizeHttpUrl(env.b2PublicBaseUrl);
  const bucketPrefix = `/file/${env.b2BucketPublicBoard}`;

  if (publicBaseUrl.includes(bucketPrefix)) {
    return `${publicBaseUrl}/${objectKey}`;
  }

  return `${publicBaseUrl}${bucketPrefix}/${objectKey}`;
}

function getObjectKeyFromPublicUrl(publicUrl) {
  let expectedUrl;
  let assetUrl;
  try {
    expectedUrl = new URL(buildPublicUrl(""));
    assetUrl = new URL(String(publicUrl || ""));
  } catch {
    const error = new Error("Payment QR image is unavailable.");
    error.statusCode = 404;
    throw error;
  }

  if (assetUrl.origin !== expectedUrl.origin || !assetUrl.pathname.startsWith(expectedUrl.pathname)) {
    const error = new Error("Payment QR image is unavailable.");
    error.statusCode = 404;
    throw error;
  }

  let objectKey;
  try {
    objectKey = decodeURIComponent(assetUrl.pathname.slice(expectedUrl.pathname.length));
  } catch {
    const error = new Error("Payment QR image is unavailable.");
    error.statusCode = 404;
    throw error;
  }
  if (!objectKey.startsWith("payment-qrs/")) {
    const error = new Error("Payment QR image is unavailable.");
    error.statusCode = 404;
    throw error;
  }

  return objectKey;
}

async function uploadBinary({ tenant, location, body, fileBuffer }) {
  assertB2Configured();

  const fileName = normalizeFileName(body.fileName);
  const contentType = String(body.contentType || "").toLowerCase();

  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    const error = new Error("Only JPEG, PNG, and WebP QR images are supported.");
    error.statusCode = 400;
    throw error;
  }

  if (!Buffer.isBuffer(fileBuffer) || !fileBuffer.length || fileBuffer.length > MAX_UPLOAD_BYTES) {
    const error = new Error("QR image must be between 1 byte and 8 MB.");
    error.statusCode = 400;
    throw error;
  }

  const objectKey = buildObjectKey({ tenant, location, fileName, contentType });
  const publicUrl = buildPublicUrl(objectKey);

  await getS3Client().send(new PutObjectCommand({
    Bucket: env.b2BucketPublicBoard,
    Key: objectKey,
    ContentType: contentType,
    Body: fileBuffer
  }));

  return {
    asset: {
      objectKey,
      publicUrl,
      contentType,
      sizeBytes: fileBuffer.length
    }
  };
}

async function downloadBinary({ publicUrl }) {
  assertB2Configured();
  const objectKey = getObjectKeyFromPublicUrl(publicUrl);

  try {
    const response = await getS3Client().send(new GetObjectCommand({
      Bucket: env.b2BucketPublicBoard,
      Key: objectKey
    }));
    if (!response.Body || typeof response.Body.transformToByteArray !== "function") {
      const error = new Error("Payment QR image is unavailable.");
      error.statusCode = 404;
      throw error;
    }

    const body = Buffer.from(await response.Body.transformToByteArray());
    if (!body.length || body.length > MAX_UPLOAD_BYTES) {
      const error = new Error("Payment QR image is unavailable.");
      error.statusCode = 404;
      throw error;
    }

    const contentType = String(response.ContentType || "").toLowerCase();
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      const error = new Error("Payment QR image is unavailable.");
      error.statusCode = 404;
      throw error;
    }

    const extension = contentType === "image/png"
      ? "png"
      : contentType === "image/webp"
        ? "webp"
        : "jpg";
    return { body, contentType, fileName: `payment-qr.${extension}` };
  } catch (error) {
    if (!error.statusCode && error?.$metadata?.httpStatusCode === 404) {
      error.statusCode = 404;
    }
    throw error;
  }
}

module.exports = {
  downloadBinary,
  uploadBinary
};
