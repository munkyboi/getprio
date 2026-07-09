const crypto = require("crypto");
const { PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const env = require("../config/env");
const publicBoardThemeRepository = require("../repositories/publicBoardThemes");

const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const UPLOAD_EXPIRES_SECONDS = 300;

let s3Client;

function normalizeHttpUrl(value) {
  const text = String(value || "").trim().replace(/\/$/, "");
  if (!text) return "";
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
  ].filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) {
    const error = new Error(`Vendor media uploads are not configured. Missing: ${missing.join(", ")}.`);
    error.statusCode = 503;
    throw error;
  }
}

function getExtension(fileName, contentType) {
  const extension = String(fileName || "").toLowerCase().match(/\.(jpe?g|png|webp)$/)?.[1];
  if (extension) return extension === "jpeg" ? "jpg" : extension;
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

function normalizeFileName(fileName, fallback) {
  return String(fileName || fallback).trim().replace(/[^\w.\- ]+/g, "").slice(0, 160) || fallback;
}

function buildObjectKey({ tenantId, location, assetType, fileName, contentType }) {
  const extension = getExtension(fileName, contentType);
  const locationPart = location?.slug ? `locations/${location.slug}` : "tenant-default";
  const randomId = crypto.randomBytes(10).toString("hex");
  return `vendor-media/tenants/${tenantId}/${locationPart}/${assetType}/${Date.now()}-${randomId}.${extension}`;
}

function buildPublicUrl(objectKey) {
  const publicBaseUrl = normalizeHttpUrl(env.b2PublicBaseUrl);
  const bucketPrefix = `/file/${env.b2BucketPublicBoard}`;
  if (publicBaseUrl.includes(bucketPrefix)) return `${publicBaseUrl}/${objectKey}`;
  return `${publicBaseUrl}${bucketPrefix}/${objectKey}`;
}

async function createUpload({ tenant, location, user, body, assetType = "location" }) {
  assertB2Configured();
  const fileName = normalizeFileName(body.fileName, `${assetType}-image`);
  const contentType = String(body.contentType || "").toLowerCase();
  const sizeBytes = Number(body.sizeBytes || 0);
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    const error = new Error("Only JPEG, PNG, and WebP images are supported.");
    error.statusCode = 400;
    throw error;
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_UPLOAD_BYTES) {
    const error = new Error("Image must be between 1 byte and 8 MB.");
    error.statusCode = 400;
    throw error;
  }

  const objectKey = buildObjectKey({ tenantId: tenant._id, location, assetType, fileName, contentType });
  const publicUrl = buildPublicUrl(objectKey);
  const command = new PutObjectCommand({
    Bucket: env.b2BucketPublicBoard,
    Key: objectKey,
    ContentType: contentType
  });
  const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: UPLOAD_EXPIRES_SECONDS });
  const asset = await publicBoardThemeRepository.createAsset({
    tenantId: tenant._id,
    locationId: location?._id,
    assetType,
    objectKey,
    publicUrl,
    fileName,
    contentType,
    sizeBytes,
    userId: user?._id
  });

  return {
    asset: {
      id: String(asset._id),
      assetType: asset.assetType,
      objectKey: asset.objectKey,
      publicUrl: asset.publicUrl,
      contentType: asset.contentType,
      sizeBytes: asset.sizeBytes
    },
    upload: {
      method: "PUT",
      url: uploadUrl,
      headers: { "Content-Type": contentType },
      expiresInSeconds: UPLOAD_EXPIRES_SECONDS
    }
  };
}

async function uploadBinary({ tenant, location, user, body, fileBuffer, assetType = "location" }) {
  assertB2Configured();
  const fileName = normalizeFileName(body.fileName, `${assetType}-image`);
  const contentType = String(body.contentType || "").toLowerCase();
  const sizeBytes = Number(body.sizeBytes || fileBuffer?.length || 0);
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    const error = new Error("Only JPEG, PNG, and WebP images are supported.");
    error.statusCode = 400;
    throw error;
  }
  if (!Buffer.isBuffer(fileBuffer) || !fileBuffer.length || fileBuffer.length > MAX_UPLOAD_BYTES) {
    const error = new Error("Image must be between 1 byte and 8 MB.");
    error.statusCode = 400;
    throw error;
  }

  const objectKey = buildObjectKey({ tenantId: tenant._id, location, assetType, fileName, contentType });
  const publicUrl = buildPublicUrl(objectKey);
  await getS3Client().send(new PutObjectCommand({
    Bucket: env.b2BucketPublicBoard,
    Key: objectKey,
    ContentType: contentType,
    Body: fileBuffer
  }));

  const asset = await publicBoardThemeRepository.createAsset({
    tenantId: tenant._id,
    locationId: location?._id,
    assetType,
    objectKey,
    publicUrl,
    fileName,
    contentType,
    sizeBytes,
    userId: user?._id
  });

  return {
    asset: {
      id: String(asset._id),
      assetType: asset.assetType,
      objectKey: asset.objectKey,
      publicUrl: asset.publicUrl,
      contentType: asset.contentType,
      sizeBytes: asset.sizeBytes
    }
  };
}

module.exports = { createUpload, uploadBinary };
