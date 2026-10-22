// Preserve the simple contact-email policy without regex backtracking.
function isValidContactEmail(value) {
  if (typeof value !== "string" || /\s/.test(value)) return false;
  const at = value.indexOf("@");
  if (at < 1 || value.indexOf("@", at + 1) !== -1) return false;
  const dot = value.indexOf(".", at + 2);
  return dot !== -1 && dot < value.length - 1;
}

module.exports = { isValidContactEmail };
