const test = require("node:test");
const assert = require("node:assert/strict");
const seed = require("../../shared/helpCenterSeed.json");
const db = require("../src/config/db");
const { validateContent, publicContent } = require("../src/repositories/platformHelpCenter");
const helpCenter = require("../src/repositories/platformHelpCenter");

test("audited Help Center seed validates and keeps customer payload free of review metadata", () => {
  const content = validateContent(seed, { requireReviewed: true });
  const published = publicContent(content);
  assert.equal(published.topics.length, 7);
  assert.equal(published.articles.length, 24);
  assert.equal(published.faqs.length, 17);
  assert.equal("review" in published.articles[0], false);
  assert.equal("sourceReferences" in published.articles[0], false);
  assert.equal("owner" in published.faqs[0], false);
});

test("publishing fails closed for unreviewed guides, unsupported links, or broken FAQ links", () => {
  const unreviewed = structuredClone(seed);
  unreviewed.articles[0].review.sourceReferences = [];
  assert.throws(() => validateContent(unreviewed, { requireReviewed: true }), /review date, due date, and at least one verified source/i);

  const unsafeLink = structuredClone(seed);
  unsafeLink.articles[0].link = "javascript:alert(1)";
  assert.throws(() => validateContent(unsafeLink), /safe relative GetPrio path/i);

  const brokenRelated = structuredClone(seed);
  brokenRelated.faqs[0].relatedArticleId = "missing-guide";
  assert.throws(() => validateContent(brokenRelated), /guide that does not exist/i);

  const overdue = structuredClone(seed);
  overdue.articles[0].review.lastReviewedAt = "2019-12-01";
  overdue.articles[0].review.reviewDueAt = "2020-01-01";
  assert.throws(() => validateContent(overdue, { requireReviewed: true }), /review is overdue/i);

  const invalidTimeZone = structuredClone(seed);
  invalidTimeZone.articles[0].review.timeZone = "Not/A_Time_Zone";
  assert.throws(() => validateContent(invalidTimeZone, { requireReviewed: true }), /valid IANA time zone/i);
});

test("archived help items disappear from public output while draft records remain available internally", () => {
  const content = structuredClone(seed);
  content.articles[0].archived = true;
  const published = publicContent(content);
  assert.equal(published.articles.some((item) => item.id === content.articles[0].id), false);
  assert.equal(content.articles.some((item) => item.id === "join"), true);
});

test("first-run verified seed stays publicly available while becoming the initial managed revision", async () => {
  const originalTransaction = db.withTransaction;
  let initialized = false;
  let draftSeeded = false;
  db.withTransaction = async (callback) => callback({
    query: async (sql) => {
      if (sql.includes("SELECT published_revision, draft_revision")) {
        if (!initialized) return { rows: [] };
        return { rows: [{ published_revision: draftSeeded ? 11 : null, draft_revision: draftSeeded ? 11 : null }] };
      }
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes("INSERT INTO platform_help_center_state")) { initialized = true; return { rows: [] }; }
      if (sql.includes("INSERT INTO platform_help_center_revisions")) {
        assert.match(sql, /created_by, change_reason/);
        assert.match(sql, /published_at/);
        draftSeeded = true;
        return { rows: [{ revision: 11 }] };
      }
      if (sql.includes("SET published_revision=$1, draft_revision=$1")) return { rows: [] };
      if (sql.includes("SELECT content FROM platform_help_center_revisions")) return { rows: [{ content: seed }] };
      throw new Error(`Unexpected Help Center query: ${sql}`);
    }
  });
  try {
    const content = await helpCenter.getPublished();
    assert.equal(content.topics.length, 7);
    assert.equal(content.articles.length, 24);
    assert.equal(content.faqs.length, 17);
    assert.equal(draftSeeded, true);
  } finally {
    db.withTransaction = originalTransaction;
  }
});
