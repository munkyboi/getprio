const db = require("../config/db");
const seed = require("../../../shared/helpCenterSeed.json");

const ADVISORY_LOCK = 918274;
const APPLIES_TO = new Set(["web", "mobile"]);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function fail(message, statusCode = 400, code = "INVALID_HELP_CONTENT") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  throw error;
}

function validText(value, label, max = 2000, { optional = false } = {}) {
  if (optional && (value === null || value === undefined || value === "")) return value ?? null;
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) fail(`${label} must contain 1–${max} characters.`);
  return value.trim();
}

function validateId(value, label) {
  if (typeof value !== "string" || !ID_PATTERN.test(value) || value.length > 80) fail(`${label} must be a lowercase, URL-safe identifier.`);
  return value;
}

function todayInTimeZone(timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  } catch {
    fail("Review time zone must be a valid IANA time zone.");
  }
}

function validateReview(review, label, requireReviewed) {
  if (!review || typeof review !== "object" || Array.isArray(review)) fail(`${label} needs review ownership and sources.`);
  const owner = validText(review.owner, `${label} owner`, 120);
  const timeZone = validText(review.timeZone, `${label} review time zone`, 80);
  if (!Number.isInteger(review.cadenceDays) || review.cadenceDays < 30 || review.cadenceDays > 365) fail(`${label} review cadence must be 30–365 days.`);
  const appliesTo = Array.isArray(review.appliesTo) ? [...new Set(review.appliesTo)] : [];
  if (!appliesTo.length || appliesTo.some((item) => !APPLIES_TO.has(item))) fail(`${label} must identify whether it applies to web, mobile, or both.`);
  const sourceReferences = Array.isArray(review.sourceReferences)
    ? review.sourceReferences.map((item) => validText(item, `${label} source reference`, 240))
    : [];
  const lastReviewedAt = review.lastReviewedAt || null;
  const reviewDueAt = review.reviewDueAt || null;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (requireReviewed && (!lastReviewedAt || !reviewDueAt || !datePattern.test(lastReviewedAt) || !datePattern.test(reviewDueAt) || sourceReferences.length === 0)) {
    fail(`${label} must have a review date, due date, and at least one verified source before publishing.`);
  }
  if (lastReviewedAt && !datePattern.test(lastReviewedAt)) fail(`${label} review date must use YYYY-MM-DD.`);
  if (reviewDueAt && !datePattern.test(reviewDueAt)) fail(`${label} review due date must use YYYY-MM-DD.`);
  if (lastReviewedAt && reviewDueAt && reviewDueAt < lastReviewedAt) fail(`${label} review due date cannot precede its review date.`);
  if (requireReviewed) {
    const today = todayInTimeZone(timeZone);
    if (lastReviewedAt > today) fail(`${label} review date cannot be in the future.`);
    if (reviewDueAt < today) fail(`${label} review is overdue and must be renewed before publishing.`);
  }
  return { owner, timeZone, cadenceDays: review.cadenceDays, appliesTo, lastReviewedAt, reviewDueAt, sourceReferences };
}

function validateContent(input, { requireReviewed = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("Help Center content must be an object.");
  for (const key of ["topics", "articles", "faqs"]) if (!Array.isArray(input[key])) fail(`Help Center ${key} must be a list.`);
  if (input.topics.length > 20 || input.articles.length > 100 || input.faqs.length > 200) fail("Help Center content exceeds the supported item limit.");

  const ids = { topics: new Set(), articles: new Set(), faqs: new Set() };
  const topics = input.topics.map((item) => {
    const id = validateId(item?.id, "Topic ID");
    if (ids.topics.has(id)) fail(`Duplicate topic ID: ${id}.`);
    ids.topics.add(id);
    return { id, title: validText(item.title, "Topic title", 100), description: validText(item.description, "Topic description", 220), archived: Boolean(item.archived) };
  });
  const articles = input.articles.map((item) => {
    const id = validateId(item?.id, "Guide ID");
    if (ids.articles.has(id)) fail(`Duplicate guide ID: ${id}.`);
    ids.articles.add(id);
    if (!ids.topics.has(item.topic)) fail(`Guide ${id} must belong to an existing topic.`);
    if (!Array.isArray(item.steps) || item.steps.length < 1 || item.steps.length > 20) fail(`Guide ${id} must have 1–20 steps.`);
    const link = item.link ? validText(item.link, `Guide ${id} link`, 240) : null;
    if (link && (!link.startsWith("/") || link.startsWith("//") || /[\r\n\\]/.test(link))) fail(`Guide ${id} link must be a safe relative GetPrio path.`);
    return {
      id, topic: item.topic, title: validText(item.title, `Guide ${id} title`, 160),
      intro: validText(item.intro, `Guide ${id} introduction`, 600),
      steps: item.steps.map((step, index) => validText(step, `Guide ${id} step ${index + 1}`, 600)),
      note: validText(item.note, `Guide ${id} note`, 1000), link,
      linkLabel: link ? validText(item.linkLabel, `Guide ${id} link label`, 100) : null,
      archived: Boolean(item.archived), review: validateReview(item.review, `Guide ${id}`, requireReviewed)
    };
  });
  const faqs = input.faqs.map((item) => {
    const id = validateId(item?.id, "FAQ ID");
    if (ids.faqs.has(id)) fail(`Duplicate FAQ ID: ${id}.`);
    ids.faqs.add(id);
    if (item.relatedArticleId && !ids.articles.has(item.relatedArticleId)) fail(`FAQ ${id} refers to a guide that does not exist.`);
    return {
      id, question: validText(item.question, `FAQ ${id} question`, 240), answer: validText(item.answer, `FAQ ${id} answer`, 1200),
      relatedArticleId: item.relatedArticleId || null, archived: Boolean(item.archived),
      review: validateReview(item.review, `FAQ ${id}`, requireReviewed)
    };
  });
  return { topics, articles, faqs };
}

function publicContent(content) {
  const safe = validateContent(content);
  const topics = safe.topics.filter((topic) => !topic.archived).map(({ archived, ...topic }) => topic);
  const activeTopics = new Set(topics.map((topic) => topic.id));
  const articles = safe.articles.filter((article) => !article.archived && activeTopics.has(article.topic)).map(({ review, archived, ...article }) => article);
  const activeArticles = new Set(articles.map((article) => article.id));
  const faqs = safe.faqs.filter((faq) => !faq.archived && (!faq.relatedArticleId || activeArticles.has(faq.relatedArticleId))).map(({ review, archived, ...faq }) => faq);
  return { topics, articles, faqs };
}

async function initialize(client) {
  let state = (await client.query("SELECT published_revision, draft_revision FROM platform_help_center_state WHERE singleton=TRUE")).rows[0];
  if (state && (state.published_revision || state.draft_revision)) return state;

  await client.query("SELECT pg_advisory_xact_lock($1)", [ADVISORY_LOCK]);
  await client.query("INSERT INTO platform_help_center_state (singleton) VALUES (TRUE) ON CONFLICT (singleton) DO NOTHING");
  state = (await client.query("SELECT published_revision, draft_revision FROM platform_help_center_state WHERE singleton=TRUE FOR UPDATE")).rows[0];
  if (!state.published_revision && !state.draft_revision) {
    const content = validateContent(seed, { requireReviewed: true });
    const inserted = (await client.query(
      "INSERT INTO platform_help_center_revisions (content, created_by, change_reason) VALUES ($1::jsonb, NULL, 'Initial audited Help Center content — awaiting Platform Admin preview and publish') RETURNING revision",
      [JSON.stringify(content)]
    )).rows[0];
    await client.query("UPDATE platform_help_center_state SET draft_revision=$1, updated_at=NOW() WHERE singleton=TRUE", [inserted.revision]);
    state = { published_revision: null, draft_revision: inserted.revision };
  }
  return state;
}

async function getPublished() {
  return db.withTransaction(async (client) => {
    const state = await initialize(client);
    const row = (await client.query("SELECT content FROM platform_help_center_revisions WHERE revision=$1", [state.published_revision])).rows[0];
    return publicContent(row?.content || { topics: [], articles: [], faqs: [] });
  });
}

async function getAdmin() {
  return db.withTransaction(async (client) => {
    const state = await initialize(client);
    const revisions = (await client.query(`SELECT revision, content, created_by, created_at, change_reason, published_at, published_by
      FROM platform_help_center_revisions ORDER BY revision DESC LIMIT 25`)).rows;
    const draft = revisions.find((item) => String(item.revision) === String(state.draft_revision)) || null;
    const published = revisions.find((item) => String(item.revision) === String(state.published_revision)) || null;
    return {
      publishedRevision: state.published_revision ? Number(state.published_revision) : null,
      draftRevision: state.draft_revision ? Number(state.draft_revision) : null,
      content: draft?.content || published?.content || seed,
      revisions: revisions.map(({ content, ...row }) => ({ ...row, revision: Number(row.revision), createdAt: row.created_at, createdBy: row.created_by, changeReason: row.change_reason, publishedAt: row.published_at, publishedBy: row.published_by }))
    };
  });
}

async function saveDraft(input, actorId, reason, { client } = {}) {
  const content = validateContent(input);
  const save = async (connection) => {
    const state = await initialize(connection);
    const row = (await connection.query("INSERT INTO platform_help_center_revisions (content, created_by, change_reason) VALUES ($1::jsonb, $2, $3) RETURNING revision, created_at", [JSON.stringify(content), actorId, reason])).rows[0];
    await connection.query("UPDATE platform_help_center_state SET draft_revision=$1, updated_at=NOW() WHERE singleton=TRUE", [row.revision]);
    return { revision: Number(row.revision), createdAt: row.created_at, publishedRevision: state.published_revision ? Number(state.published_revision) : null };
  };
  return client ? save(client) : db.withTransaction(save);
}

async function publishDraft(revision, actorId, reason, { client } = {}) {
  if (!Number.isInteger(Number(revision)) || Number(revision) < 1) fail("Choose the draft revision to publish.");
  const publish = async (connection) => {
    const state = await initialize(connection);
    if (String(state.draft_revision) !== String(revision)) fail("This draft has changed. Refresh the Help Center before publishing.", 409, "HELP_DRAFT_CHANGED");
    const row = (await connection.query("SELECT content FROM platform_help_center_revisions WHERE revision=$1 FOR SHARE", [revision])).rows[0];
    if (!row) fail("Draft revision not found.", 404, "HELP_REVISION_NOT_FOUND");
    validateContent(row.content, { requireReviewed: true });
    await connection.query("UPDATE platform_help_center_revisions SET published_at=NOW(), published_by=$2 WHERE revision=$1 AND published_at IS NULL", [revision, actorId]);
    await connection.query("UPDATE platform_help_center_state SET published_revision=$1, draft_revision=NULL, updated_at=NOW() WHERE singleton=TRUE", [revision]);
    return { publishedRevision: Number(revision), previousPublishedRevision: state.published_revision ? Number(state.published_revision) : null };
  };
  return client ? publish(client) : db.withTransaction(publish);
}

async function restoreRevision(revision, actorId, reason, { client } = {}) {
  if (!Number.isInteger(Number(revision)) || Number(revision) < 1) fail("Choose a valid Help Center revision.");
  const restore = async (connection) => {
    const source = (await connection.query("SELECT content FROM platform_help_center_revisions WHERE revision=$1", [revision])).rows[0];
    if (!source) fail("Help Center revision not found.", 404, "HELP_REVISION_NOT_FOUND");
    const content = validateContent(source.content);
    const row = (await connection.query("INSERT INTO platform_help_center_revisions (content, created_by, change_reason) VALUES ($1::jsonb, $2, $3) RETURNING revision, created_at", [JSON.stringify(content), actorId, reason])).rows[0];
    await connection.query("UPDATE platform_help_center_state SET draft_revision=$1, updated_at=NOW() WHERE singleton=TRUE", [row.revision]);
    return { revision: Number(row.revision), restoredFromRevision: Number(revision), createdAt: row.created_at };
  };
  return client ? restore(client) : db.withTransaction(restore);
}

module.exports = { getPublished, getAdmin, saveDraft, publishDraft, restoreRevision, validateContent, publicContent };
