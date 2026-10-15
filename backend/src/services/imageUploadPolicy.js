const platformRepository = require("../repositories/platform");

async function getImageUploadPolicy() {
  const limitKb = await platformRepository.getImageUploadLimitKb();
  return { maxImageBytes: limitKb * 1024 };
}

async function getPublicImageUploadPolicy() {
  const { maxImageBytes } = await getImageUploadPolicy();
  return { maxImageUploadKb: maxImageBytes / 1024, maxImageUploadBytes: maxImageBytes };
}

async function assertImageUploadSize(sizeBytes) {
  const { maxImageBytes } = await getImageUploadPolicy();
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > maxImageBytes) {
    const limitKb = maxImageBytes / 1024;
    const error = new Error(`Image must be between 1 byte and ${limitKb} KB. Choose a smaller image or compress it before uploading.`);
    error.statusCode = 400;
    error.code = "IMAGE_UPLOAD_SIZE_EXCEEDED";
    throw error;
  }
}

module.exports = { getImageUploadPolicy, getPublicImageUploadPolicy, assertImageUploadSize };
