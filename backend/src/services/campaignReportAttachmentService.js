const crypto = require("crypto");
const { PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const env = require("../config/env");

const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

let s3Client;

function normalizeHttpUrl(value) {
  const text = String(value || "").trim().replace(/\/$/, "");
  return text ? (/^https?:\/\//i.test(text) ? text : `https://${text}`) : "";
}

function assertConfigured() {
  const missing = [
    ["B2_S3_ENDPOINT", env.b2S3Endpoint],
    ["B2_BUCKET_PUBLIC_BOARD", env.b2BucketPublicBoard],
    ["B2_KEY_ID", env.b2KeyId],
    ["B2_APPLICATION_KEY", env.b2ApplicationKey],
    ["B2_PUBLIC_BASE_URL", env.b2PublicBaseUrl]
  ].filter(([, value]) => !value).map(([key]) => key);

  if (missing.length) {
    const error = new Error(`Campaign report uploads are not configured. Missing: ${missing.join(", ")}.`);
    error.statusCode = 503;
    throw error;
  }
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

function requireString(value, label) {
  if (typeof value !== "string") {
    const error = new Error(`${label} must be a string.`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function optionalString(value, label) {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  return requireString(value, label);
}

function getExtension(fileName, contentType) {
  const extension = fileName.toLowerCase().match(/\.(jpe?g|png|webp)$/)?.[1];
  if (extension) return extension === "jpeg" ? "jpg" : extension;
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

function normalizeFileName(fileName) {
  return (fileName || "campaign-report")
    .trim()
    .replace(/[^\w.\- ]+/g, "")
    .slice(0, 160) || "campaign-report";
}

function buildPublicUrl(objectKey) {
  const publicBaseUrl = normalizeHttpUrl(env.b2PublicBaseUrl);
  const bucketPrefix = `/file/${env.b2BucketPublicBoard}`;
  return publicBaseUrl.includes(bucketPrefix)
    ? `${publicBaseUrl}/${objectKey}`
    : `${publicBaseUrl}${bucketPrefix}/${objectKey}`;
}

function buildObjectKey({ tenant, campaign, fileName, contentType }) {
  return `campaign-reports/tenants/${tenant._id}/campaigns/${campaign._id}/${Date.now()}-${crypto.randomBytes(10).toString("hex")}.${getExtension(fileName, contentType)}`;
}

async function uploadBinary({ tenant, campaign, body, fileBuffer }) {
  assertConfigured();
  const contentType = requireString(body?.contentType, "Content type").toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    const error = new Error("Only JPEG, PNG, and WebP screenshots are supported.");
    error.statusCode = 400;
    throw error;
  }
  if (!Buffer.isBuffer(fileBuffer)) {
    const error = new Error("Screenshot must be between 1 byte and 8 MB.");
    error.statusCode = 400;
    throw error;
  }
  const fileSizeBytes = fileBuffer.byteLength;
  if (!fileSizeBytes || fileSizeBytes > MAX_UPLOAD_BYTES) {
    const error = new Error("Screenshot must be between 1 byte and 8 MB.");
    error.statusCode = 400;
    throw error;
  }

  const fileName = normalizeFileName(optionalString(body?.fileName, "File name"));
  const objectKey = buildObjectKey({ tenant, campaign, fileName, contentType });
  await getS3Client().send(new PutObjectCommand({
    Bucket: env.b2BucketPublicBoard,
    Key: objectKey,
    Body: fileBuffer,
    ContentType: contentType
  }));

  return {
    attachment: {
      objectKey,
      publicUrl: buildPublicUrl(objectKey),
      fileName,
      contentType,
      sizeBytes: fileSizeBytes
    }
  };
}

function getAttachmentForCampaign({ tenant, campaign, objectKey, fileName }) {
  assertConfigured();
  const normalizedObjectKey = requireString(objectKey, "Attachment key").trim();
  const expectedPrefix = `campaign-reports/tenants/${tenant._id}/campaigns/${campaign._id}/`;
  if (!normalizedObjectKey || !normalizedObjectKey.startsWith(expectedPrefix)) {
    const error = new Error("Campaign report attachment is invalid.");
    error.statusCode = 400;
    throw error;
  }
  return {
    objectKey: normalizedObjectKey,
    publicUrl: buildPublicUrl(normalizedObjectKey),
    fileName: normalizeFileName(optionalString(fileName, "File name"))
  };
}

module.exports = { getAttachmentForCampaign, uploadBinary };
