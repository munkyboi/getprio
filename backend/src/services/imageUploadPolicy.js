const platformRepository = require("../repositories/platform");

async function assertImageUploadSize(sizeBytes) {
  const limitKb = await platformRepository.getImageUploadLimitKb();
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > limitKb * 1024) {
    const error = new Error(`Image must be between 1 byte and ${limitKb} KB. Choose a smaller image or compress it before uploading.`);
    error.statusCode = 400;
    error.code = "IMAGE_UPLOAD_SIZE_EXCEEDED";
    throw error;
  }
}

module.exports = { assertImageUploadSize };
