const db = require("../config/db");

async function createVendorReview({ bookingId, tenantId, customerUserId, stars, comment }) {
  const { rows } = await db.pool.query(
    `INSERT INTO vendor_reviews (booking_id, tenant_id, customer_user_id, stars, comment)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`, [Number(bookingId), Number(tenantId), Number(customerUserId), stars, comment || null]
  );
  return rows[0];
}

async function createTrustRating(data) {
  const { rows } = await db.pool.query(
    `INSERT INTO user_trust_ratings (interaction_type, booking_id, campaign_id, contribution_id, rater_user_id, subject_user_id, stars, reason_category, private_note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [data.interactionType, data.bookingId ? Number(data.bookingId) : null, data.campaignId ? Number(data.campaignId) : null, data.contributionId ? Number(data.contributionId) : null, Number(data.raterUserId), Number(data.subjectUserId), data.stars, data.reasonCategory || null, data.privateNote || null]
  );
  return rows[0];
}

async function getVendorAggregate(tenantId) {
  const { rows } = await db.pool.query("SELECT COALESCE(ROUND(AVG(stars)::numeric, 1), 0)::float AS average, count(*)::int AS count FROM vendor_reviews WHERE tenant_id = $1 AND moderation_status = 'active'", [Number(tenantId)]);
  return rows[0];
}

async function listPublicVendorReviews(tenantId, limit = 20) {
  const { rows } = await db.pool.query(
    `SELECT reviews.id, reviews.stars, reviews.comment, reviews.vendor_reply, reviews.created_at,
      COALESCE(NULLIF(users.display_name, ''), users.name) AS customer_display_name
     FROM vendor_reviews reviews JOIN users ON users.id = reviews.customer_user_id
     WHERE reviews.tenant_id = $1 AND reviews.moderation_status = 'active'
     ORDER BY reviews.created_at DESC LIMIT $2`, [Number(tenantId), Number(limit)]
  );
  return rows;
}

async function getUserTrustAggregate(subjectUserId) {
  const { rows } = await db.pool.query("SELECT COALESCE(ROUND(AVG(stars)::numeric, 1), 0)::float AS average, count(*)::int AS count FROM user_trust_ratings WHERE subject_user_id = $1 AND moderation_status = 'active'", [Number(subjectUserId)]);
  return rows[0];
}

async function findVendorReviewById(reviewId) {
  const { rows } = await db.pool.query("SELECT * FROM vendor_reviews WHERE id = $1 LIMIT 1", [Number(reviewId)]);
  return rows[0] || null;
}

async function findTrustRatingById(ratingId) {
  const { rows } = await db.pool.query("SELECT * FROM user_trust_ratings WHERE id = $1 LIMIT 1", [Number(ratingId)]);
  return rows[0] || null;
}

async function listDisputes() {
  const { rows } = await db.pool.query(
    `SELECT disputes.*, users.email AS reporter_email FROM rating_disputes disputes
     JOIN users ON users.id = disputes.reporter_user_id ORDER BY disputes.created_at DESC LIMIT 200`
  );
  return rows;
}

async function resolveDispute({ disputeId, actorUserId, status, moderationStatus }) {
  return db.withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE rating_disputes SET dispute_status = $2, resolved_by_user_id = $3, resolved_at = NOW()
       WHERE id = $1 AND dispute_status IN ('open','reviewing') RETURNING *`,
      [Number(disputeId), status, Number(actorUserId)]
    );
    const dispute = result.rows[0];
    if (!dispute) return null;
    const table = dispute.rating_type === "vendor_review" ? "vendor_reviews" : "user_trust_ratings";
    await client.query(`UPDATE ${table} SET moderation_status = $2 WHERE id = $1`, [Number(dispute.rating_id), moderationStatus]);
    return dispute;
  });
}

async function reviseVendorReview({ reviewId, customerUserId, stars, comment }) {
  return db.withTransaction(async (client) => {
    const currentResult = await client.query(
      `SELECT * FROM vendor_reviews WHERE id = $1 AND customer_user_id = $2 AND revision_count = 0
       AND created_at >= NOW() - INTERVAL '7 days' FOR UPDATE`, [Number(reviewId), Number(customerUserId)]
    );
    const current = currentResult.rows[0];
    if (!current) return null;
    await client.query(
      `INSERT INTO vendor_review_revisions (review_id, previous_stars, previous_comment, revised_by_user_id)
       VALUES ($1,$2,$3,$4)`, [Number(reviewId), current.stars, current.comment, Number(customerUserId)]
    );
    const { rows } = await client.query(
      "UPDATE vendor_reviews SET stars = $2, comment = $3, revision_count = 1, revised_at = NOW() WHERE id = $1 RETURNING *",
      [Number(reviewId), stars, comment || null]
    );
    return rows[0] || null;
  });
}

async function replyToVendorReview({ reviewId, tenantId, actorUserId, reply }) {
  const { rows } = await db.pool.query(
    `UPDATE vendor_reviews SET vendor_reply = $4, vendor_replied_by_user_id = $3, vendor_replied_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND vendor_reply IS NULL RETURNING *`,
    [Number(reviewId), Number(tenantId), Number(actorUserId), reply]
  );
  return rows[0] || null;
}

async function createDispute({ ratingType, ratingId, reporterUserId, reason }) {
  const table = ratingType === "vendor_review" ? "vendor_reviews" : "user_trust_ratings";
  return db.withTransaction(async (client) => {
    const { rows } = await client.query("INSERT INTO rating_disputes (rating_type, rating_id, reporter_user_id, reason) VALUES ($1,$2,$3,$4) RETURNING *", [ratingType, Number(ratingId), Number(reporterUserId), reason]);
    await client.query(`UPDATE ${table} SET moderation_status = 'disputed' WHERE id = $1`, [Number(ratingId)]);
    return rows[0];
  });
}

module.exports = { createDispute, createTrustRating, createVendorReview, findTrustRatingById, findVendorReviewById, getUserTrustAggregate, getVendorAggregate, listDisputes, listPublicVendorReviews, replyToVendorReview, resolveDispute, reviseVendorReview };
