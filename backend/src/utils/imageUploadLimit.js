const DEFAULT_IMAGE_UPLOAD_KB = 200;
const MAX_IMAGE_UPLOAD_KB = 8192;

function isValidImageUploadLimit(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_IMAGE_UPLOAD_KB;
}

module.exports = { DEFAULT_IMAGE_UPLOAD_KB, MAX_IMAGE_UPLOAD_KB, isValidImageUploadLimit };
