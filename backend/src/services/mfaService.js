const crypto = require("node:crypto");

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function decodeBase32(value) {
  const normalized = String(value || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("Invalid Base32 secret.");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

function encodeBase32(buffer) {
  const bits = [...buffer].map((byte) => byte.toString(2).padStart(8, "0")).join("");
  let output = "";
  for (let offset = 0; offset < bits.length; offset += 5) {
    output += BASE32_ALPHABET[Number.parseInt(bits.slice(offset, offset + 5).padEnd(5, "0"), 2)];
  }
  return output;
}

function generateTotp(secret, options = {}) {
  const digits = Number(options.digits || 6);
  const stepSeconds = Number(options.stepSeconds || 30);
  const counter = Math.floor(Number(options.now ?? Date.now()) / 1000 / stepSeconds);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % (10 ** digits);
  return String(binary).padStart(digits, "0");
}

function verifyTotp(secret, code, options = {}) {
  const window = Number(options.window ?? 1);
  const stepSeconds = Number(options.stepSeconds || 30);
  const now = Number(options.now ?? Date.now());
  const candidate = String(code || "").replace(/\D/g, "");
  for (let offset = -window; offset <= window; offset += 1) {
    const expected = generateTotp(secret, {
      ...options,
      now: now + offset * stepSeconds * 1000
    });
    const actualBuffer = Buffer.from(candidate);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
      return true;
    }
  }
  return false;
}

function createTotpSecret() {
  return encodeBase32(crypto.randomBytes(20));
}

function normalizeRecoveryCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hashRecoveryCode(value, pepper) {
  return crypto.createHmac("sha256", String(pepper || "")).update(normalizeRecoveryCode(value)).digest("hex");
}

function createRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const value = crypto.randomBytes(5).toString("hex").toUpperCase();
    return `${value.slice(0, 5)}-${value.slice(5)}`;
  });
}

function encryptionKey(secret) {
  return crypto.createHash("sha256").update(String(secret || "")).digest();
}

function encryptSecret(value, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64")
  };
}

function decryptSecret(encrypted, secret) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(secret),
    Buffer.from(encrypted.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
}

function userRequiresPrivilegedMfa(user) {
  return (user?.roles || []).includes("platform_admin") ||
    (user?.tenantMemberships || []).some(
      (membership) => membership.isActive !== false && ["owner", "admin"].includes(membership.role)
    );
}

module.exports = {
  createRecoveryCodes,
  createTotpSecret,
  decryptSecret,
  encryptSecret,
  generateTotp,
  hashRecoveryCode,
  normalizeRecoveryCode,
  userRequiresPrivilegedMfa,
  verifyTotp
};
