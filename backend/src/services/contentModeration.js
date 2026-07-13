const BLOCKED_TERMS = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "puta",
  "gago",
  "tangina",
  "ulol"
];

function normalizeModerationText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s._-]+/g, " ")
    .trim();
}

function findBlockedTerm(value) {
  const normalized = normalizeModerationText(value);
  if (!normalized) {
    return "";
  }

  return BLOCKED_TERMS.find((term) => new RegExp(`(^|\\W)${term}(\\W|$)`, "i").test(normalized)) || "";
}

function assertPublicTextAllowed(value, label = "Text") {
  const blockedTerm = findBlockedTerm(value);
  if (!blockedTerm) {
    return;
  }

  const error = new Error(`${label} contains language that is not allowed on public GetPrio pages.`);
  error.statusCode = 400;
  throw error;
}

module.exports = {
  assertPublicTextAllowed,
  findBlockedTerm,
  normalizeModerationText
};
