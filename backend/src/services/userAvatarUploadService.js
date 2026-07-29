const crypto = require("node:crypto");
const { PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const env = require("../config/env");
const userRepository = require("../repositories/users");

const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

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

function assertConfigured() {
  const missing = [
    ["B2_S3_ENDPOINT", env.b2S3Endpoint],
    ["B2_BUCKET_PUBLIC_BOARD", env.b2BucketPublicBoard],
    ["B2_KEY_ID", env.b2KeyId],
    ["B2_APPLICATION_KEY", env.b2ApplicationKey],
    ["B2_PUBLIC_BASE_URL", env.b2PublicBaseUrl]
  ].filter(([, value]) => !value).map(([key]) => key);

  if (missing.length) {
    const error = new Error(`Customer avatar uploads are not configured. Missing: ${missing.join(", ")}.`);
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

function buildPublicUrl(objectKey) {
  const publicBaseUrl = normalizeHttpUrl(env.b2PublicBaseUrl);
  const bucketPrefix = `/file/${env.b2BucketPublicBoard}`;
  if (publicBaseUrl.includes(bucketPrefix)) return `${publicBaseUrl}/${objectKey}`;
  return `${publicBaseUrl}${bucketPrefix}/${objectKey}`;
}

function matchesImageSignature(contentType, fileBuffer) {
  if (contentType === "image/jpeg") {
    return fileBuffer.length >= 3 &&
      fileBuffer[0] === 0xff &&
      fileBuffer[1] === 0xd8 &&
      fileBuffer[2] === 0xff;
  }
  if (contentType === "image/png") {
    return fileBuffer.length >= 8 &&
      fileBuffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (contentType === "image/webp") {
    return fileBuffer.length >= 12 &&
      fileBuffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      fileBuffer.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

async function uploadAvatar({ user, fileName, contentType, fileBuffer }) {
  assertConfigured();

  const normalizedContentType = String(contentType || "").toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.has(normalizedContentType)) {
    const error = new Error("Only JPEG, PNG, and WebP avatar images are supported.");
    error.statusCode = 400;
    throw error;
  }

  if (!Buffer.isBuffer(fileBuffer) || !fileBuffer.length || fileBuffer.length > MAX_UPLOAD_BYTES) {
    const error = new Error("Avatar image must be between 1 byte and 5 MB.");
    error.statusCode = 400;
    throw error;
  }
  if (!matchesImageSignature(normalizedContentType, fileBuffer)) {
    const error = new Error("Avatar image content does not match the selected format.");
    error.statusCode = 400;
    throw error;
  }

  const extension = getExtension(fileName, normalizedContentType);
  const randomId = crypto.randomBytes(10).toString("hex");
  const userId = String(user?._id || "").replace(/[^\w-]/g, "");
  if (!userId) {
    const error = new Error("Authenticated user is required.");
    error.statusCode = 401;
    throw error;
  }
  const objectKey = `user-avatars/users/${userId}/${Date.now()}-${randomId}.${extension}`;
  const avatarUrl = buildPublicUrl(objectKey);

  await getS3Client().send(new PutObjectCommand({
    Bucket: env.b2BucketPublicBoard,
    Key: objectKey,
    ContentType: normalizedContentType,
    CacheControl: "public, max-age=31536000, immutable",
    Body: fileBuffer
  }));

  const updatedUser = await userRepository.updateUser(user._id, { avatarUrl });
  return {
    avatarUrl,
    user: updatedUser
  };
}

module.exports = {
  ALLOWED_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
  matchesImageSignature,
  uploadAvatar
};
