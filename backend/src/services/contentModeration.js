const BLOCKED_TERMS = [
  // English profanity, obscenity, and high-confidence bullying terms.
  "asshole", "assholes", "bastard", "bastards", "bitch", "bitches", "bullshit", "cocksucker",
  "cocksuckers", "cunt", "cunts", "dick", "dickhead", "dickheads", "dicks", "dumbass",
  "dumbasses", "fag", "faggot", "faggots", "fatso", "fucker", "fuckers", "fucked", "fuck",
  "fucking", "idiot", "idiots", "loser", "losers", "motherfucker", "motherfuckers", "moron",
  "morons", "nigger", "niggers", "prick", "pricks", "retard", "retarded", "shit", "shits",
  "shitty", "skank", "skanks", "slut", "sluts", "twat", "twats", "wanker", "wankers", "whore", "whores",

  // Filipino / Tagalog profanity, harassment, and derogatory terms.
  "bobo", "boba", "bwisit", "gaga", "gago", "hayop", "inutil", "kupal", "leche", "malandi",
  "peste", "pokpok", "pota", "pucha", "punyeta", "puta", "putangina", "siraulo", "tanga",
  "tangina", "tarantada", "tarantado", "ulol", "walanghiya",

  // Bisaya / Cebuano profanity, harassment, and derogatory terms.
  "animal", "atay", "bilat", "bogo", "boang", "buang", "giatay", "iyot", "iyota", "kolera",
  "kulera", "pakyu", "piste", "pisti", "yati", "yawa"
];

const LEET_REPLACEMENTS = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  "$": "s"
};

const BLOCKED_TERM_MATCHERS = BLOCKED_TERMS.map((term) => ({
  term,
  matcher: new RegExp(`(^|[^a-z])${term.split("").join("[^a-z]*")}($|[^a-z])`, "i")
}));

function normalizeModerationText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[013457@$]/g, (character) => LEET_REPLACEMENTS[character] || character)
    .replace(/[^a-z]+/g, " ")
    .trim();
}

function findBlockedTerm(value) {
  const normalized = normalizeModerationText(value);
  if (!normalized) {
    return "";
  }

  return BLOCKED_TERM_MATCHERS.find(({ matcher }) => matcher.test(normalized))?.term || "";
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
