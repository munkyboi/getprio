// IDs are opaque string hashes. Preserve code-unit ordering independently of locale.
function compareReferenceIds(left, right) {
  const leftText = String(left);
  const rightText = String(right);
  if (leftText < rightText) return -1;
  if (leftText > rightText) return 1;
  return 0;
}
module.exports = { compareReferenceIds };
