const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const db = require("../config/db");
const developerTestAccounts = require("../repositories/developerTestAccounts");
const securityEventService = require("./securityEventService");

const SANDBOX_APPLE_REVIEW_ACCOUNT_TTL_DAYS = 30;
const SANDBOX_TEST_USERNAME_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const SANDBOX_TEST_PASSWORD_CHARSETS = [
  "ABCDEFGHJKLMNPQRSTUVWXYZ",
  "abcdefghijkmnopqrstuvwxyz",
  "23456789",
  "!@#$%^&*"
];

function randomSandboxCharacters(alphabet, length) {
  return Array.from({ length }, () => alphabet[crypto.randomInt(0, alphabet.length)]);
}

function createSandboxTestPassword() {
  const characters = SANDBOX_TEST_PASSWORD_CHARSETS.flatMap((charset) => randomSandboxCharacters(charset, 1));
  const alphabet = SANDBOX_TEST_PASSWORD_CHARSETS.join("");
  characters.push(...randomSandboxCharacters(alphabet, 8 - characters.length));
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(0, index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }
  return characters.join("");
}

function createSandboxTestIdentity() {
  const suffix = randomSandboxCharacters(SANDBOX_TEST_USERNAME_ALPHABET, 8).join("");
  return { username: `sb_${suffix}`, email: `sb-${suffix}@test.getprio.invalid` };
}

function sandboxExpiry() {
  return new Date(Date.now() + SANDBOX_APPLE_REVIEW_ACCOUNT_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function notFound(message) {
  const error = new Error(message);
  error.statusCode = 404;
  error.code = "SANDBOX_APPLE_REVIEW_ACCOUNT_NOT_FOUND";
  return error;
}

function platformOnlyError() {
  const error = new Error("Only an Apple review Sandbox account can be reset from Platform Dashboard.");
  error.statusCode = 403;
  error.code = "SANDBOX_APPLE_REVIEW_PLATFORM_ONLY";
  return error;
}

function sandboxTestAccountResponse(account) {
  return {
    id: account.id,
    projectId: account.projectId,
    slot: account.slot,
    purpose: account.purpose || "developer",
    username: account.username,
    email: account.email,
    status: account.status,
    expiresAt: account.expiresAt,
    deviceCount: account.deviceCount,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt
  };
}

function sandboxCredentials(account, password) {
  return {
    username: account.username,
    email: account.email,
    password,
    expiresAt: account.expiresAt
  };
}

async function create({ projectId, actorId, sessionId, ipAddress, userAgent }) {
  const existingAccounts = await developerTestAccounts.list(projectId);
  if (existingAccounts.some((account) => account.purpose === "apple_review")) {
    const error = new Error("This project already has an Apple review Sandbox account. Reset it from Platform Dashboard instead.");
    error.statusCode = 409;
    error.code = "SANDBOX_APPLE_REVIEW_ACCOUNT_EXISTS";
    throw error;
  }

  const password = createSandboxTestPassword();
  const identity = createSandboxTestIdentity();
  const passwordHash = await bcrypt.hash(password, 10);
  let account;
  try {
    account = await db.withTransaction(async (client) => {
      const created = await developerTestAccounts.create({
        projectId,
        name: `Apple review tester ${identity.username.slice(-6)}`,
        username: identity.username,
        email: identity.email,
        passwordHash,
        expiresAt: sandboxExpiry(),
        purpose: "apple_review"
      }, { client });
      if (!created) return null;
      await securityEventService.logSecurityEvent({
        userId: actorId,
        sessionId,
        eventType: "platform_developer_sandbox_apple_review_account_created",
        actorRole: "platform_admin",
        ipAddress,
        userAgent,
        metadata: { projectId, testAccountId: created.id, slot: created.slot, purpose: "apple_review", ttlDays: SANDBOX_APPLE_REVIEW_ACCOUNT_TTL_DAYS }
      }, { client });
      return created;
    });
  } catch (error) {
    if (error.code === "23505" && error.constraint === "developer_project_test_accounts_one_apple_review_idx") {
      error.statusCode = 409;
      error.code = "SANDBOX_APPLE_REVIEW_ACCOUNT_EXISTS";
      error.message = "This project already has an Apple review Sandbox account. Reset it from Platform Dashboard instead.";
    }
    throw error;
  }

  if (!account) {
    const error = new Error("Developer project not found.");
    error.statusCode = 404;
    error.code = "DEVELOPER_PROJECT_NOT_FOUND";
    throw error;
  }

  return {
    testAccount: sandboxTestAccountResponse(account),
    credentials: sandboxCredentials(account, password),
    warning: "Copy these Apple review credentials now. The password will not be shown again. This account expires in 30 days."
  };
}

async function reset({ projectId, accountId, actorId, sessionId, ipAddress, userAgent }) {
  const existingAccount = await developerTestAccounts.findById(projectId, accountId);
  if (!existingAccount) throw notFound("Apple review Sandbox account not found.");
  if (existingAccount.purpose !== "apple_review") throw platformOnlyError();

  const password = createSandboxTestPassword();
  const passwordHash = await bcrypt.hash(password, 10);
  const account = await db.withTransaction(async (client) => {
    const updated = await developerTestAccounts.reset(projectId, accountId, { passwordHash, expiresAt: sandboxExpiry() }, { client });
    if (!updated) return null;
    await securityEventService.logSecurityEvent({
      userId: actorId,
      sessionId,
      eventType: "platform_developer_sandbox_apple_review_account_reset",
      actorRole: "platform_admin",
      ipAddress,
      userAgent,
      metadata: { projectId, testAccountId: updated.id, purpose: "apple_review", ttlDays: SANDBOX_APPLE_REVIEW_ACCOUNT_TTL_DAYS }
    }, { client });
    return updated;
  });
  if (!account) throw notFound("Apple review Sandbox account not found.");
  return {
    testAccount: sandboxTestAccountResponse(account),
    credentials: sandboxCredentials(account, password),
    warning: "Copy these Apple review credentials now. The previous password, sessions, and registered devices were removed. This account expires in 30 days."
  };
}

module.exports = { SANDBOX_APPLE_REVIEW_ACCOUNT_TTL_DAYS, create, reset };
