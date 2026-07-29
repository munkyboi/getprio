const crypto = require("node:crypto");
const db = require("../config/db");

const CAMPAIGN_STATUSES = Object.freeze({
  DRAFT: "draft",
  COLLECTING: "collecting",
  COLLECTED: "collected",
  REFUND_PENDING: "refund_pending",
  CANCELLED: "cancelled",
  FROZEN: "frozen"
});
const CONTRIBUTION_STATUSES = Object.freeze({
  PENDING_PROOF: "pending_proof",
  SUBMITTED: "submitted",
  REVIEW_OVERDUE: "review_overdue",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  EXPIRED: "expired",
  WITHDRAWN: "withdrawn",
  REFUND_PENDING: "refund_pending",
  REFUND_SENT: "refund_sent",
  REFUND_CONFIRMED: "refund_confirmed",
  REFUND_DISPUTED: "refund_disputed"
});

function generatePublicToken() {
  return crypto.randomBytes(16).toString("hex");
}

function mapCampaign(row) {
  if (!row) return null;

  return {
    id: String(row.id),
    publicToken: row.public_token,
    bookingId: String(row.booking_id),
    organizerUserId: String(row.organizer_user_id),
    organizerDisplayName: row.organizer_display_name || "Organizer",
    organizerAvatarUrl: row.organizer_avatar_url || "",
    ...(row.organizer_trust_count == null ? {} : {
      organizerTrustRating: {
        average: Number(row.organizer_trust_average || 0),
        count: Number(row.organizer_trust_count || 0)
      }
    }),
    ...(row.tenant_name ? {
      vendor: { name: row.tenant_name, slug: row.tenant_slug }
    } : {}),
    ...(row.location_name ? {
      location: {
        name: row.location_name,
        slug: row.location_slug,
        city: row.location_city || "",
        province: row.location_province || ""
      }
    } : {}),
    status: row.campaign_status,
    visibility: row.visibility,
    title: row.title,
    description: row.description,
    deadlineAt: row.deadline_at,
    contributionFeeCents: Number(row.contribution_fee_cents),
    requiredContributors: Number(row.required_contributors),
    acceptedContributors: row.accepted_contributors == null ? undefined : Number(row.accepted_contributors),
    joinedContributors: row.joined_contributors == null ? undefined : Number(row.joined_contributors),
    reservedContributors: row.reserved_contributors == null ? undefined : Number(row.reserved_contributors),
    underReviewContributors: row.under_review_contributors == null ? undefined : Number(row.under_review_contributors),
    availableContributors: row.available_contributors == null ? undefined : Number(row.available_contributors),
    acceptedAmountCents: row.accepted_amount_cents == null ? undefined : Number(row.accepted_amount_cents),
    paymentInstructions: row.payment_instructions,
    currency: row.currency,
    scheduledStartAt: row.scheduled_start_at || null,
    publishedAt: row.published_at || null,
    collectedAt: row.collected_at || null,
    cancellationReason: row.cancellation_reason || null,
    frozenAt: row.frozen_at || null,
    frozenReason: row.frozen_reason || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapPublicCampaign(row) {
  if (!row) return null;
  return {
    id: String(row.id), publicToken: row.public_token, bookingId: String(row.booking_id), status: row.campaign_status, visibility: row.visibility,
    title: row.title, description: row.description, deadlineAt: row.deadline_at,
    contributionFeeCents: Number(row.contribution_fee_cents), requiredContributors: Number(row.required_contributors), currency: row.currency,
    acceptedContributors: Number(row.accepted_contributors || 0), filledContributors: Number(row.filled_contributors || 0),
    reservedContributors: Number(row.reserved_contributors || 0),
    underReviewContributors: Number(row.under_review_contributors || 0),
    availableContributors: Number(row.available_contributors || 0),
    organizerDisplayName: row.organizer_display_name || "Organizer",
    organizerAvatarUrl: row.organizer_avatar_url || "",
    organizerTrustRating: {
      average: Number(row.organizer_trust_average || 0),
      count: Number(row.organizer_trust_count || 0)
    },
    scheduledStartAt: row.scheduled_start_at,
    vendor: { name: row.tenant_name, slug: row.tenant_slug },
    location: { name: row.location_name, slug: row.location_slug },
    service: { name: row.service_name, slug: row.service_slug }, publishedAt: row.published_at
  };
}

const PUBLIC_CAMPAIGN_SELECT = `SELECT campaigns.*, bookings.scheduled_start_at,
  tenants.name AS tenant_name, tenants.slug AS tenant_slug, store_locations.name AS location_name,
  store_locations.slug AS location_slug, vendor_services.name AS service_name, vendor_services.slug AS service_slug,
  COALESCE(NULLIF(users.display_name, ''), users.name) AS organizer_display_name,
  users.avatar_url AS organizer_avatar_url,
  (SELECT COALESCE(ROUND(AVG(ratings.stars)::numeric, 1), 0)::float
   FROM user_trust_ratings ratings
   WHERE ratings.subject_user_id = campaigns.organizer_user_id AND ratings.moderation_status = 'active') AS organizer_trust_average,
  (SELECT COUNT(*)::int
   FROM user_trust_ratings ratings
   WHERE ratings.subject_user_id = campaigns.organizer_user_id AND ratings.moderation_status = 'active') AS organizer_trust_count,
  COUNT(contributions.id) FILTER (WHERE contributions.contribution_status = 'accepted') AS accepted_contributors,
  COUNT(contributions.id) FILTER (
    WHERE contributions.contribution_status = 'pending_proof'
      AND contributions.reservation_expires_at > NOW()
  ) AS reserved_contributors,
  COUNT(contributions.id) FILTER (WHERE contributions.contribution_status IN ('submitted','review_overdue')) AS under_review_contributors,
  COUNT(contributions.id) FILTER (
    WHERE (contributions.contribution_status = 'pending_proof' AND contributions.reservation_expires_at > NOW())
      OR contributions.contribution_status IN ('submitted','review_overdue','accepted')
  ) AS filled_contributors,
  GREATEST(
    campaigns.required_contributors - COUNT(contributions.id) FILTER (
      WHERE (contributions.contribution_status = 'pending_proof' AND contributions.reservation_expires_at > NOW())
        OR contributions.contribution_status IN ('submitted','review_overdue','accepted')
    ),
    0
  ) AS available_contributors
  FROM organizer_campaigns campaigns JOIN bookings ON bookings.id = campaigns.booking_id
  JOIN tenants ON tenants.id = bookings.tenant_id JOIN store_locations ON store_locations.id = bookings.location_id
  JOIN vendor_services ON vendor_services.id = bookings.service_id JOIN users ON users.id = campaigns.organizer_user_id
  LEFT JOIN organizer_campaign_contributions contributions ON contributions.campaign_id = campaigns.id`;

async function findPublicCampaignByToken(publicToken) {
  const { rows } = await db.pool.query(`${PUBLIC_CAMPAIGN_SELECT} WHERE campaigns.public_token = $1 AND campaigns.published_at IS NOT NULL AND campaigns.campaign_status <> 'frozen' GROUP BY campaigns.id, bookings.id, tenants.id, store_locations.id, vendor_services.id, users.id LIMIT 1`, [publicToken]);
  return mapPublicCampaign(rows[0]);
}

async function listPublicCampaigns({ limit = 50, search = "", date = "" } = {}) {
  const values = [];
  const filters = ["campaigns.visibility = 'public'", "campaigns.campaign_status = 'collecting'", "campaigns.deadline_at > NOW()"];
  if (search) {
    values.push(`%${String(search)}%`);
    const placeholder = `$${values.length}`;
    filters.push(`(
      campaigns.title ILIKE ${placeholder}
      OR COALESCE(NULLIF(users.display_name, ''), users.name) ILIKE ${placeholder}
      OR tenants.name ILIKE ${placeholder}
      OR store_locations.name ILIKE ${placeholder}
      OR concat_ws(' ', store_locations.address_line1, store_locations.address_line2, store_locations.city, store_locations.province) ILIKE ${placeholder}
    )`);
  }
  if (date) {
    values.push(String(date));
    filters.push(`(bookings.scheduled_start_at AT TIME ZONE store_locations.timezone)::date = $${values.length}::date`);
  }
  values.push(Number(limit));
  const { rows } = await db.pool.query(`${PUBLIC_CAMPAIGN_SELECT} WHERE ${filters.join(" AND ")} GROUP BY campaigns.id, bookings.id, tenants.id, store_locations.id, vendor_services.id, users.id ORDER BY campaigns.deadline_at ASC, campaigns.published_at DESC LIMIT $${values.length}`, values);
  return rows.map(mapPublicCampaign);
}

async function listExpiredCollectingCampaigns() {
  const { rows } = await db.pool.query("SELECT * FROM organizer_campaigns WHERE campaign_status = 'collecting' AND deadline_at <= NOW() ORDER BY deadline_at ASC LIMIT 100");
  return rows.map(mapCampaign);
}

async function countReportsByUserSince(reporterUserId, since) {
  const { rows } = await db.pool.query("SELECT count(*)::int AS count FROM organizer_campaign_reports WHERE reporter_user_id = $1 AND created_at >= $2", [Number(reporterUserId), since]);
  return Number(rows[0]?.count || 0);
}

async function createReport({ campaignId, reporterUserId, category, details }) {
  const { rows } = await db.pool.query("INSERT INTO organizer_campaign_reports (campaign_id, reporter_user_id, category, details) VALUES ($1,$2,$3,$4) RETURNING *", [Number(campaignId), Number(reporterUserId), category, details || null]);
  return rows[0];
}

async function listReports() {
  const { rows } = await db.pool.query(
    `SELECT reports.*, campaigns.title AS campaign_title, campaigns.campaign_status, campaigns.public_token,
      users.email AS reporter_email FROM organizer_campaign_reports reports
     JOIN organizer_campaigns campaigns ON campaigns.id = reports.campaign_id
     JOIN users ON users.id = reports.reporter_user_id ORDER BY reports.created_at DESC LIMIT 200`
  );
  return rows;
}

async function findReportById(reportId) {
  const { rows } = await db.pool.query("SELECT * FROM organizer_campaign_reports WHERE id = $1 LIMIT 1", [Number(reportId)]);
  return rows[0] || null;
}

async function freezeCampaign({ campaignId, actorUserId, reason }) {
  return db.withTransaction(async (client) => {
    const { rows } = await client.query("UPDATE organizer_campaigns SET campaign_status = 'frozen', frozen_at = NOW(), frozen_reason = $2 WHERE id = $1 AND campaign_status <> 'cancelled' RETURNING *", [Number(campaignId), reason]);
    const campaign = mapCampaign(rows[0]);
    if (campaign) await client.query(
      `INSERT INTO organizer_campaign_events (campaign_id, event_type, actor_user_id, actor_role, source, metadata)
       VALUES ($1,'campaign_frozen',$2,'platform_admin','platform',$3::jsonb)`,
      [Number(campaignId), actorUserId ? Number(actorUserId) : null, JSON.stringify({ reason })]
    );
    return campaign;
  });
}

async function updateReportStatus({ reportId, status }) {
  const { rows } = await db.pool.query("UPDATE organizer_campaign_reports SET report_status = $2 WHERE id = $1 RETURNING *", [Number(reportId), status]);
  return rows[0];
}

async function createCampaign({
  publicToken = generatePublicToken(),
  bookingId,
  organizerUserId,
  status = CAMPAIGN_STATUSES.DRAFT,
  visibility = "private_link",
  title,
  description = "",
  deadlineAt,
  contributionFeeCents,
  requiredContributors,
  paymentInstructions
}) {
  const { rows } = await db.pool.query(
    `INSERT INTO organizer_campaigns (
      public_token, booking_id, organizer_user_id, campaign_status, visibility,
      title, description, deadline_at, contribution_fee_cents,
      required_contributors, payment_instructions
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *`,
    [
      publicToken,
      bookingId,
      organizerUserId,
      status,
      visibility,
      title,
      description,
      deadlineAt,
      contributionFeeCents,
      requiredContributors,
      paymentInstructions
    ]
  );

  return mapCampaign(rows[0]);
}

async function findCampaignById(id) {
  const { rows } = await db.pool.query(
    `SELECT campaigns.*, bookings.scheduled_start_at,
       COALESCE(NULLIF(users.display_name, ''), users.name) AS organizer_display_name,
       users.avatar_url AS organizer_avatar_url,
       COALESCE((
         SELECT COUNT(*)::int
         FROM organizer_campaign_contributions
         WHERE campaign_id = campaigns.id AND contribution_status = 'accepted'
       ), 0) AS accepted_contributors,
       COALESCE((
         SELECT COUNT(*)::int
         FROM organizer_campaign_contributions
         WHERE campaign_id = campaigns.id
           AND (
             (contribution_status = 'pending_proof' AND reservation_expires_at > NOW())
             OR contribution_status IN ('submitted', 'review_overdue', 'accepted')
           )
       ), 0) AS joined_contributors,
       COALESCE((
         SELECT COUNT(*)::int
         FROM organizer_campaign_contributions
         WHERE campaign_id = campaigns.id
           AND contribution_status = 'pending_proof'
           AND reservation_expires_at > NOW()
       ), 0) AS reserved_contributors,
       COALESCE((
         SELECT COUNT(*)::int
         FROM organizer_campaign_contributions
         WHERE campaign_id = campaigns.id
           AND contribution_status IN ('submitted', 'review_overdue')
       ), 0) AS under_review_contributors,
       GREATEST(campaigns.required_contributors - COALESCE((
         SELECT COUNT(*)::int
         FROM organizer_campaign_contributions
         WHERE campaign_id = campaigns.id
           AND (
             (contribution_status = 'pending_proof' AND reservation_expires_at > NOW())
             OR contribution_status IN ('submitted', 'review_overdue', 'accepted')
           )
       ), 0), 0) AS available_contributors,
       COALESCE((
         SELECT SUM(amount_cents)
         FROM organizer_campaign_contributions
         WHERE campaign_id = campaigns.id AND contribution_status = 'accepted'
       ), 0) AS accepted_amount_cents
     FROM organizer_campaigns campaigns
     JOIN bookings ON bookings.id = campaigns.booking_id
     JOIN users ON users.id = campaigns.organizer_user_id
     WHERE campaigns.id = $1
     LIMIT 1`,
    [Number(id)]
  );
  return mapCampaign(rows[0]);
}

async function findCampaignByBookingId(bookingId) {
  const { rows } = await db.pool.query("SELECT campaigns.*, bookings.scheduled_start_at, COALESCE(NULLIF(users.display_name, ''), users.name) AS organizer_display_name, users.avatar_url AS organizer_avatar_url FROM organizer_campaigns campaigns JOIN bookings ON bookings.id = campaigns.booking_id JOIN users ON users.id = campaigns.organizer_user_id WHERE campaigns.booking_id = $1 LIMIT 1", [Number(bookingId)]);
  return mapCampaign(rows[0]);
}

async function listCampaignsForOrganizer(organizerUserId) {
  const { rows } = await db.pool.query(
    "SELECT campaigns.*, bookings.scheduled_start_at, COALESCE(NULLIF(users.display_name, ''), users.name) AS organizer_display_name, users.avatar_url AS organizer_avatar_url FROM organizer_campaigns campaigns JOIN bookings ON bookings.id = campaigns.booking_id JOIN users ON users.id = campaigns.organizer_user_id WHERE campaigns.organizer_user_id = $1 ORDER BY campaigns.created_at DESC",
    [Number(organizerUserId)]
  );
  return rows.map(mapCampaign);
}

async function listCampaignsForCustomer(userId) {
  const { rows } = await db.pool.query(
    `SELECT campaigns.*, bookings.scheduled_start_at,
       COALESCE(NULLIF(users.display_name, ''), users.name) AS organizer_display_name,
       users.avatar_url AS organizer_avatar_url,
       tenants.name AS tenant_name,
       tenants.slug AS tenant_slug,
       store_locations.name AS location_name,
       store_locations.slug AS location_slug,
       store_locations.city AS location_city,
       store_locations.province AS location_province,
       (SELECT COALESCE(ROUND(AVG(ratings.stars)::numeric, 1), 0)::float
        FROM user_trust_ratings ratings
        WHERE ratings.subject_user_id = campaigns.organizer_user_id
          AND ratings.moderation_status = 'active') AS organizer_trust_average,
       (SELECT COUNT(*)::int
        FROM user_trust_ratings ratings
        WHERE ratings.subject_user_id = campaigns.organizer_user_id
          AND ratings.moderation_status = 'active') AS organizer_trust_count,
       COALESCE((
         SELECT COUNT(*)::int
         FROM organizer_campaign_contributions
         WHERE campaign_id = campaigns.id AND contribution_status = 'accepted'
       ), 0) AS accepted_contributors,
       COALESCE((
         SELECT COUNT(*)::int
         FROM organizer_campaign_contributions
         WHERE campaign_id = campaigns.id
           AND (
             (contribution_status = 'pending_proof' AND reservation_expires_at > NOW())
             OR contribution_status IN ('submitted', 'review_overdue', 'accepted')
           )
       ), 0) AS joined_contributors,
       COALESCE((
         SELECT COUNT(*)::int FROM organizer_campaign_contributions
         WHERE campaign_id = campaigns.id AND contribution_status = 'pending_proof'
           AND reservation_expires_at > NOW()
       ), 0) AS reserved_contributors,
       COALESCE((
         SELECT COUNT(*)::int FROM organizer_campaign_contributions
         WHERE campaign_id = campaigns.id AND contribution_status IN ('submitted', 'review_overdue')
       ), 0) AS under_review_contributors,
       GREATEST(campaigns.required_contributors - COALESCE((
         SELECT COUNT(*)::int FROM organizer_campaign_contributions
         WHERE campaign_id = campaigns.id
           AND (
             (contribution_status = 'pending_proof' AND reservation_expires_at > NOW())
             OR contribution_status IN ('submitted', 'review_overdue', 'accepted')
           )
       ), 0), 0) AS available_contributors,
       COALESCE((
         SELECT SUM(amount_cents)
         FROM organizer_campaign_contributions
         WHERE campaign_id = campaigns.id AND contribution_status = 'accepted'
       ), 0) AS accepted_amount_cents
     FROM organizer_campaigns campaigns
     JOIN bookings ON bookings.id = campaigns.booking_id
     JOIN tenants ON tenants.id = bookings.tenant_id
     JOIN store_locations ON store_locations.id = bookings.location_id
     JOIN users ON users.id = campaigns.organizer_user_id
     WHERE campaigns.organizer_user_id = $1
     OR EXISTS (SELECT 1 FROM organizer_campaign_contributions WHERE campaign_id = campaigns.id AND contributor_user_id = $1)
     ORDER BY campaigns.created_at DESC`, [Number(userId)]
  );
  return rows.map(mapCampaign);
}

async function listContributionsByCampaign(campaignId) {
  const { rows } = await db.pool.query(
    `SELECT contributions.*, COALESCE(NULLIF(users.display_name, ''), users.name) AS contributor_display_name,
       users.avatar_url AS contributor_avatar_url
     FROM (
       SELECT organizer_campaign_contributions.*,
         ROW_NUMBER() OVER (PARTITION BY campaign_id ORDER BY created_at ASC, id ASC)::int AS slot_number
       FROM organizer_campaign_contributions
     ) contributions
     JOIN users ON users.id = contributions.contributor_user_id
     WHERE contributions.campaign_id = $1
     ORDER BY contributions.slot_number ASC`, [Number(campaignId)]
  );
  return rows.map(mapContribution);
}

async function listReimbursementsByCampaign(campaignId) {
  const { rows } = await db.pool.query("SELECT * FROM organizer_campaign_reimbursements WHERE campaign_id = $1 ORDER BY created_at ASC", [Number(campaignId)]);
  return rows.map(mapReimbursement);
}

async function listEventsByCampaign(campaignId) {
  const { rows } = await db.pool.query(
    `SELECT events.id, events.event_type, events.actor_role, events.source, events.metadata, events.created_at,
       COALESCE(NULLIF(users.display_name, ''), users.name) AS actor_display_name
     FROM organizer_campaign_events events
     LEFT JOIN users ON users.id = events.actor_user_id
     WHERE events.campaign_id = $1
     ORDER BY events.created_at DESC
     LIMIT 100`,
    [Number(campaignId)]
  );
  return rows.map((row) => ({
    id: String(row.id),
    eventType: row.event_type,
    actorRole: row.actor_role,
    actorDisplayName: row.actor_display_name || null,
    source: row.source,
    metadata: row.metadata || {},
    createdAt: row.created_at
  }));
}

async function createNotice({ campaignId, recipientUserId, eventType, title, body }) {
  const { rows } = await db.pool.query(
    `INSERT INTO organizer_campaign_notices (campaign_id, recipient_user_id, event_type, title, body)
     VALUES ($1,$2,$3,$4,$5) RETURNING id, event_type, title, body, created_at`,
    [Number(campaignId), Number(recipientUserId), eventType, title, body]
  );
  return rows[0];
}

async function listNotices({ campaignId, recipientUserId }) {
  const { rows } = await db.pool.query(
    `SELECT id, event_type, title, body, created_at FROM organizer_campaign_notices
     WHERE campaign_id = $1 AND recipient_user_id = $2 ORDER BY created_at DESC LIMIT 50`,
    [Number(campaignId), Number(recipientUserId)]
  );
  return rows.map((row) => ({ id: String(row.id), eventType: row.event_type, title: row.title, body: row.body, createdAt: row.created_at }));
}

async function countActivePublicCampaignsForOrganizer(organizerUserId) {
  const { rows } = await db.pool.query(
    "SELECT count(*)::int AS count FROM organizer_campaigns WHERE organizer_user_id = $1 AND visibility = 'public' AND campaign_status = 'collecting'",
    [Number(organizerUserId)]
  );
  return Number(rows[0]?.count || 0);
}

async function publishCampaign({ campaignId, visibility }) {
  const { rows } = await db.pool.query(
    `UPDATE organizer_campaigns
     SET campaign_status = $2, visibility = $3, published_at = NOW()
     WHERE id = $1 AND campaign_status = $4
     RETURNING *`,
    [Number(campaignId), CAMPAIGN_STATUSES.COLLECTING, visibility, CAMPAIGN_STATUSES.DRAFT]
  );
  return mapCampaign(rows[0]);
}

async function publishPublicCampaignWithinCap({ campaignId, organizerUserId, maximum = 2 }) {
  return db.withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [Number(organizerUserId)]);
    const countResult = await client.query(
      "SELECT count(*)::int AS count FROM organizer_campaigns WHERE organizer_user_id = $1 AND visibility = 'public' AND campaign_status = 'collecting'",
      [Number(organizerUserId)]
    );
    if (Number(countResult.rows[0]?.count || 0) >= maximum) return null;
    const { rows } = await client.query(
      `UPDATE organizer_campaigns SET campaign_status = 'collecting', visibility = 'public', published_at = NOW()
       WHERE id = $1 AND organizer_user_id = $2 AND campaign_status = 'draft' RETURNING *`,
      [Number(campaignId), Number(organizerUserId)]
    );
    return mapCampaign(rows[0]);
  });
}

async function updateDraftCampaign({ campaignId, title, description, deadlineAt, contributionFeeCents, requiredContributors, paymentInstructions }) {
  const { rows } = await db.pool.query(
    `UPDATE organizer_campaigns SET title = $2, description = $3, deadline_at = $4,
       contribution_fee_cents = $5, required_contributors = $6, payment_instructions = $7
     WHERE id = $1 AND campaign_status = 'draft' RETURNING *`,
    [Number(campaignId), title, description, deadlineAt, contributionFeeCents, requiredContributors, paymentInstructions]
  );
  return mapCampaign(rows[0]);
}

async function unpublishCampaign(campaignId) {
  const { rows } = await db.pool.query(
    `UPDATE organizer_campaigns campaigns SET campaign_status = 'draft', visibility = 'private_link', published_at = NULL
     WHERE campaigns.id = $1 AND campaigns.campaign_status = 'collecting'
       AND NOT EXISTS (SELECT 1 FROM organizer_campaign_contributions WHERE campaign_id = campaigns.id)
     RETURNING *`, [Number(campaignId)]
  );
  return mapCampaign(rows[0]);
}

async function createContribution({ campaignId, contributorUserId, amountCents }) {
  return db.withTransaction(async (client) => {
    const campaignResult = await client.query(
      "SELECT id, required_contributors, deadline_at FROM organizer_campaigns WHERE id = $1 AND campaign_status = 'collecting' AND deadline_at > NOW() FOR UPDATE",
      [Number(campaignId)]
    );
    const campaign = campaignResult.rows[0];
    if (!campaign) return null;
    await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [Number(contributorUserId)]);
    await client.query(
      `UPDATE organizer_campaign_contributions
       SET contribution_status = 'expired',
         retry_available_at = COALESCE(reservation_expires_at, NOW()) + INTERVAL '2 minutes'
       WHERE contribution_status = 'pending_proof'
         AND (reservation_expires_at IS NULL OR reservation_expires_at <= NOW())
         AND (campaign_id = $1 OR contributor_user_id = $2)`,
      [Number(campaignId), Number(contributorUserId)]
    );
    const existingResult = await client.query(
      `SELECT * FROM organizer_campaign_contributions
       WHERE campaign_id = $1 AND contributor_user_id = $2
       FOR UPDATE`,
      [Number(campaignId), Number(contributorUserId)]
    );
    const existing = existingResult.rows[0];
    if (existing && ![CONTRIBUTION_STATUSES.EXPIRED, CONTRIBUTION_STATUSES.WITHDRAWN].includes(existing.contribution_status)) {
      return { joinFailure: "already_joined" };
    }
    if (existing && Number(existing.reservation_attempt_count || 1) >= 2) {
      return { joinFailure: "retry_exhausted" };
    }
    if (existing?.retry_available_at && new Date(existing.retry_available_at).getTime() > Date.now()) {
      return { joinFailure: "cooldown", retryAvailableAt: existing.retry_available_at };
    }
    const unpaidResult = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM organizer_campaign_contributions
       WHERE contributor_user_id = $1
         AND contribution_status = 'pending_proof'
         AND reservation_expires_at > NOW()`,
      [Number(contributorUserId)]
    );
    if (Number(unpaidResult.rows[0]?.count || 0) >= 3) {
      return { joinFailure: "unpaid_limit" };
    }
    const countResult = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM organizer_campaign_contributions
       WHERE campaign_id = $1
         AND (
           (contribution_status = 'pending_proof' AND reservation_expires_at > NOW())
           OR contribution_status IN ('submitted', 'review_overdue', 'accepted')
         )`,
      [Number(campaignId)]
    );
    if (Number(countResult.rows[0]?.count || 0) >= Number(campaign.required_contributors)) return null;
    if (existing) {
      const { rows } = await client.query(
        `UPDATE organizer_campaign_contributions
         SET contribution_status = 'pending_proof',
           reservation_expires_at = LEAST(NOW() + INTERVAL '15 minutes', $3::timestamptz),
           reservation_attempt_count = reservation_attempt_count + 1,
           retry_available_at = NULL,
           rejection_reason = NULL,
           rejected_at = NULL,
           rejected_by_user_id = NULL
         WHERE id = $1 AND contributor_user_id = $2 AND contribution_status IN ('expired', 'withdrawn')
         RETURNING *`,
        [Number(existing.id), Number(contributorUserId), campaign.deadline_at]
      );
      return mapContribution(rows[0]);
    }
    const { rows } = await client.query(
      `INSERT INTO organizer_campaign_contributions (
         campaign_id, contributor_user_id, amount_cents, reservation_expires_at
       ) VALUES (
         $1, $2, $3, LEAST(NOW() + INTERVAL '15 minutes', $4::timestamptz)
       ) RETURNING *`,
      [Number(campaignId), Number(contributorUserId), amountCents, campaign.deadline_at]
    );
    return mapContribution(rows[0]);
  });
}

async function findContributionByCampaignAndUser(campaignId, contributorUserId) {
  const { rows } = await db.pool.query(
    `SELECT ranked.*
     FROM (
       SELECT organizer_campaign_contributions.*,
         ROW_NUMBER() OVER (PARTITION BY campaign_id ORDER BY created_at ASC, id ASC)::int AS slot_number
       FROM organizer_campaign_contributions
     ) ranked
     WHERE ranked.campaign_id = $1 AND ranked.contributor_user_id = $2
     LIMIT 1`,
    [Number(campaignId), Number(contributorUserId)]
  );
  return mapContribution(rows[0]);
}

async function withdrawPendingContribution({ campaignId, contributionId, contributorUserId }) {
  const { rows } = await db.pool.query(
    `UPDATE organizer_campaign_contributions
     SET contribution_status = 'withdrawn',
       retry_available_at = NOW() + INTERVAL '2 minutes'
     WHERE id = $1
       AND campaign_id = $2
       AND contributor_user_id = $3
       AND contribution_status = 'pending_proof'
     RETURNING *`,
    [Number(contributionId), Number(campaignId), Number(contributorUserId)]
  );
  return mapContribution(rows[0]);
}

async function submitContributionProof({ contributionId, paymentReference, proof }) {
  return db.withTransaction(async (client) => {
    const currentResult = await client.query(
      `SELECT contributions.*, campaigns.required_contributors FROM organizer_campaign_contributions contributions
       JOIN organizer_campaigns campaigns ON campaigns.id = contributions.campaign_id
       WHERE contributions.id = $1 FOR UPDATE OF campaigns, contributions`, [Number(contributionId)]
    );
    const current = currentResult.rows[0];
    if (current?.contribution_status === CONTRIBUTION_STATUSES.PENDING_PROOF) {
      const expiredResult = await client.query(
        `UPDATE organizer_campaign_contributions
         SET contribution_status = 'expired',
           retry_available_at = COALESCE(reservation_expires_at, NOW()) + INTERVAL '2 minutes'
         WHERE id = $1
           AND contribution_status = 'pending_proof'
           AND (reservation_expires_at IS NULL OR reservation_expires_at <= NOW())
         RETURNING id`,
        [Number(contributionId)]
      );
      if (expiredResult.rows[0]) return null;
    }
    if (!current || !["pending_proof", "rejected"].includes(current.contribution_status) || (current.contribution_status === "rejected" && Number(current.resubmission_count) >= 1)) return null;
    if (current.contribution_status === CONTRIBUTION_STATUSES.REJECTED
      && current.retry_available_at
      && new Date(current.retry_available_at).getTime() > Date.now()) return null;
    if (current.contribution_status === "rejected") {
      const countResult = await client.query(
        `SELECT COUNT(*)::int AS count FROM organizer_campaign_contributions
         WHERE campaign_id = $1
           AND (
             (contribution_status = 'pending_proof' AND reservation_expires_at > NOW())
             OR contribution_status IN ('submitted', 'review_overdue', 'accepted')
           )`,
        [Number(current.campaign_id)]
      );
      if (Number(countResult.rows[0]?.count || 0) >= Number(current.required_contributors)) return null;
    }
    const { rows } = await client.query(
      `UPDATE organizer_campaign_contributions SET contribution_status = $2, payment_reference = $3,
       payment_proof_object_key = $4, payment_proof_file_name = $5, payment_proof_content_type = $6,
       payment_proof_size_bytes = $7, submitted_at = NOW(),
       resubmission_count = CASE WHEN contribution_status = 'rejected' THEN resubmission_count + 1 ELSE resubmission_count END,
       retry_available_at = NULL
       WHERE id = $1 RETURNING *`,
      [Number(contributionId), CONTRIBUTION_STATUSES.SUBMITTED, paymentReference, proof.objectKey, proof.fileName, proof.contentType, proof.sizeBytes]
    );
    return mapContribution(rows[0]);
  });
}

async function markOverdueReviews() {
  const { rows } = await db.pool.query(
    `UPDATE organizer_campaign_contributions contributions SET contribution_status = 'review_overdue'
     FROM organizer_campaigns campaigns
     WHERE campaigns.id = contributions.campaign_id AND contributions.contribution_status = 'submitted'
       AND (contributions.submitted_at <= NOW() - INTERVAL '48 hours' OR campaigns.deadline_at <= NOW())
     RETURNING contributions.*`
  );
  return rows.map(mapContribution);
}

async function expireStaleReservations(campaignId) {
  const { rows } = await db.pool.query(
    `UPDATE organizer_campaign_contributions
     SET contribution_status = 'expired',
       retry_available_at = COALESCE(reservation_expires_at, NOW()) + INTERVAL '2 minutes'
     WHERE campaign_id = $1
       AND contribution_status = 'pending_proof'
       AND (reservation_expires_at IS NULL OR reservation_expires_at <= NOW())
     RETURNING id`,
    [Number(campaignId)]
  );
  return rows.length;
}

async function findContributionById(contributionId) {
  const { rows } = await db.pool.query("SELECT * FROM organizer_campaign_contributions WHERE id = $1 LIMIT 1", [Number(contributionId)]);
  return mapContribution(rows[0]);
}

async function findContributionEvidenceById(contributionId) {
  const { rows } = await db.pool.query(
    `SELECT id, campaign_id, contributor_user_id, payment_proof_object_key AS object_key,
      payment_proof_file_name AS file_name, payment_proof_content_type AS content_type,
      payment_proof_size_bytes AS size_bytes FROM organizer_campaign_contributions WHERE id = $1 LIMIT 1`,
    [Number(contributionId)]
  );
  return rows[0] || null;
}

async function reviewContribution({ contributionId, actorUserId, decision, rejectionReason = null }) {
  const status = decision === "accept" ? CONTRIBUTION_STATUSES.ACCEPTED : CONTRIBUTION_STATUSES.REJECTED;
  const { rows } = await db.pool.query(
    `UPDATE organizer_campaign_contributions
     SET contribution_status = $2,
       accepted_at = CASE WHEN $2 = 'accepted' THEN NOW() ELSE accepted_at END,
       accepted_by_user_id = CASE WHEN $2 = 'accepted' THEN $3 ELSE accepted_by_user_id END,
       rejected_at = CASE WHEN $2 = 'rejected' THEN NOW() ELSE rejected_at END,
       rejected_by_user_id = CASE WHEN $2 = 'rejected' THEN $3 ELSE rejected_by_user_id END,
       rejection_reason = CASE WHEN $2 = 'rejected' THEN $4 ELSE NULL END,
       retry_available_at = CASE
         WHEN $2 = 'rejected' THEN NOW() + INTERVAL '2 minutes'
         ELSE NULL
       END,
       resubmission_count = CASE
         WHEN contribution_status = 'pending_proof' AND $2 = 'rejected' THEN 1
         ELSE resubmission_count
       END
     WHERE id = $1
       AND (
         ($2 = 'accepted' AND contribution_status IN ('submitted', 'review_overdue'))
         OR ($2 = 'rejected' AND contribution_status IN ('pending_proof', 'submitted', 'review_overdue'))
       )
     RETURNING *`,
    [Number(contributionId), status, Number(actorUserId), rejectionReason]
  );
  return mapContribution(rows[0]);
}

async function markCollectedIfTargetReached(campaignId) {
  const { rows } = await db.pool.query(
    `UPDATE organizer_campaigns campaigns SET campaign_status = 'collected', collected_at = NOW()
     WHERE campaigns.id = $1 AND campaigns.campaign_status = 'collecting'
       AND (SELECT count(*) FROM organizer_campaign_contributions WHERE campaign_id = campaigns.id AND contribution_status = 'accepted') >= campaigns.required_contributors
     RETURNING *`, [Number(campaignId)]
  );
  return mapCampaign(rows[0]);
}

async function listAcceptedContributions(campaignId) {
  const { rows } = await db.pool.query(
    "SELECT * FROM organizer_campaign_contributions WHERE campaign_id = $1 AND contribution_status = 'accepted' ORDER BY id ASC",
    [Number(campaignId)]
  );
  return rows.map(mapContribution);
}

async function beginCancellation({ campaignId, reason }) {
  const { rows } = await db.pool.query(
    `UPDATE organizer_campaigns
     SET campaign_status = 'refund_pending', cancellation_reason = $2
     WHERE id = $1 AND campaign_status IN ('draft', 'collecting', 'collected')
     RETURNING *`,
    [Number(campaignId), reason]
  );
  return mapCampaign(rows[0]);
}

async function cancelWithoutRefund({ campaignId, reason }) {
  const { rows } = await db.pool.query(
    `UPDATE organizer_campaigns
     SET campaign_status = 'cancelled', cancellation_reason = $2
     WHERE id = $1 AND campaign_status IN ('draft', 'collecting', 'collected')
     RETURNING *`,
    [Number(campaignId), reason]
  );
  return mapCampaign(rows[0]);
}

async function createReimbursement({ campaignId, contribution }) {
  const { rows } = await db.pool.query(
    `INSERT INTO organizer_campaign_reimbursements (campaign_id, contribution_id, contributor_user_id, amount_cents)
     VALUES ($1, $2, $3, $4) ON CONFLICT (contribution_id) DO NOTHING RETURNING *`,
    [Number(campaignId), Number(contribution.id), Number(contribution.contributorUserId), contribution.amountCents]
  );
  return rows[0] || null;
}

async function beginCancellationWithReimbursements({ campaignId, reason }) {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const campaignResult = await client.query(
      `UPDATE organizer_campaigns SET campaign_status = 'refund_pending', cancellation_reason = $2
       WHERE id = $1 AND campaign_status IN ('draft','collecting','collected') RETURNING *`,
      [Number(campaignId), reason]
    );
    if (!campaignResult.rows[0]) { await client.query("ROLLBACK"); return null; }
    await client.query(
      `INSERT INTO organizer_campaign_reimbursements (campaign_id, contribution_id, contributor_user_id, amount_cents)
       SELECT campaign_id, id, contributor_user_id, amount_cents FROM organizer_campaign_contributions
       WHERE campaign_id = $1 AND contribution_status = 'accepted'
       ON CONFLICT (contribution_id) DO NOTHING`, [Number(campaignId)]
    );
    await client.query(
      "UPDATE organizer_campaign_contributions SET contribution_status = 'refund_pending' WHERE campaign_id = $1 AND contribution_status = 'accepted'",
      [Number(campaignId)]
    );
    await client.query("COMMIT");
    return mapCampaign(campaignResult.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

async function markContributionRefundPending(contributionId) {
  const { rows } = await db.pool.query(
    "UPDATE organizer_campaign_contributions SET contribution_status = 'refund_pending' WHERE id = $1 AND contribution_status = 'accepted' RETURNING *",
    [Number(contributionId)]
  );
  return mapContribution(rows[0]);
}

function mapReimbursement(row) {
  if (!row) return null;
  return { id: String(row.id), campaignId: String(row.campaign_id), contributionId: String(row.contribution_id), contributorUserId: String(row.contributor_user_id), status: row.reimbursement_status, amountCents: Number(row.amount_cents), sentAt: row.sent_at || null, confirmedAt: row.confirmed_at || null };
}

async function findReimbursementByContributionId(contributionId) {
  const { rows } = await db.pool.query("SELECT * FROM organizer_campaign_reimbursements WHERE contribution_id = $1 LIMIT 1", [Number(contributionId)]);
  return mapReimbursement(rows[0]);
}

async function findReimbursementEvidenceByContributionId(contributionId) {
  const { rows } = await db.pool.query(
    `SELECT id, campaign_id, contribution_id, contributor_user_id, evidence_object_key AS object_key,
      evidence_file_name AS file_name, evidence_content_type AS content_type, evidence_size_bytes AS size_bytes
     FROM organizer_campaign_reimbursements WHERE contribution_id = $1 LIMIT 1`, [Number(contributionId)]
  );
  return rows[0] || null;
}

async function markReimbursementSent({ reimbursementId, proof }) {
  const { rows } = await db.pool.query(
    `UPDATE organizer_campaign_reimbursements SET reimbursement_status = 'sent', evidence_object_key = $2, evidence_file_name = $3, evidence_content_type = $4, evidence_size_bytes = $5, sent_at = NOW()
     WHERE id = $1 AND reimbursement_status = 'pending' RETURNING *`,
    [Number(reimbursementId), proof.objectKey, proof.fileName, proof.contentType, proof.sizeBytes]
  );
  return mapReimbursement(rows[0]);
}

async function markReimbursementSentWithContribution({ reimbursementId, contributionId, proof }) {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE organizer_campaign_reimbursements SET reimbursement_status = 'sent', evidence_object_key = $2,
       evidence_file_name = $3, evidence_content_type = $4, evidence_size_bytes = $5, sent_at = NOW()
       WHERE id = $1 AND contribution_id = $6 AND reimbursement_status = 'pending' RETURNING *`,
      [Number(reimbursementId), proof.objectKey, proof.fileName, proof.contentType, proof.sizeBytes, Number(contributionId)]
    );
    if (!result.rows[0]) { await client.query("ROLLBACK"); return null; }
    await client.query("UPDATE organizer_campaign_contributions SET contribution_status = 'refund_sent' WHERE id = $1 AND contribution_status = 'refund_pending'", [Number(contributionId)]);
    await client.query("COMMIT"); return mapReimbursement(result.rows[0]);
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

async function confirmReimbursement({ reimbursementId, contributorUserId }) {
  const { rows } = await db.pool.query(
    `UPDATE organizer_campaign_reimbursements SET reimbursement_status = 'confirmed', confirmed_at = NOW()
     WHERE id = $1 AND contributor_user_id = $2 AND reimbursement_status = 'sent' RETURNING *`,
    [Number(reimbursementId), Number(contributorUserId)]
  );
  return mapReimbursement(rows[0]);
}

async function confirmReimbursementAndMaybeCancel({ campaignId, contributionId, contributorUserId }) {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const reimbursementResult = await client.query(
      `UPDATE organizer_campaign_reimbursements SET reimbursement_status = 'confirmed', confirmed_at = NOW()
       WHERE contribution_id = $1 AND contributor_user_id = $2 AND reimbursement_status = 'sent' RETURNING *`,
      [Number(contributionId), Number(contributorUserId)]
    );
    if (!reimbursementResult.rows[0]) { await client.query("ROLLBACK"); return null; }
    await client.query("UPDATE organizer_campaign_contributions SET contribution_status = 'refund_confirmed' WHERE id = $1 AND contribution_status = 'refund_sent'", [Number(contributionId)]);
    const campaignResult = await client.query(
      `UPDATE organizer_campaigns SET campaign_status = 'cancelled' WHERE id = $1 AND campaign_status = 'refund_pending'
       AND NOT EXISTS (SELECT 1 FROM organizer_campaign_reimbursements WHERE campaign_id = $1 AND reimbursement_status <> 'confirmed') RETURNING *`,
      [Number(campaignId)]
    );
    await client.query("COMMIT");
    return { reimbursement: mapReimbursement(reimbursementResult.rows[0]), campaign: mapCampaign(campaignResult.rows[0]) };
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

async function markContributionRefundConfirmed(contributionId) {
  const { rows } = await db.pool.query("UPDATE organizer_campaign_contributions SET contribution_status = 'refund_confirmed' WHERE id = $1 AND contribution_status = 'refund_sent' RETURNING *", [Number(contributionId)]);
  return mapContribution(rows[0]);
}

async function markContributionRefundSent(contributionId) {
  const { rows } = await db.pool.query("UPDATE organizer_campaign_contributions SET contribution_status = 'refund_sent' WHERE id = $1 AND contribution_status = 'refund_pending' RETURNING *", [Number(contributionId)]);
  return mapContribution(rows[0]);
}

async function finalizeCancellationIfFullyConfirmed(campaignId) {
  const { rows } = await db.pool.query(
    `UPDATE organizer_campaigns SET campaign_status = 'cancelled'
     WHERE id = $1 AND campaign_status = 'refund_pending'
       AND NOT EXISTS (SELECT 1 FROM organizer_campaign_reimbursements WHERE campaign_id = $1 AND reimbursement_status <> 'confirmed')
     RETURNING *`, [Number(campaignId)]
  );
  return mapCampaign(rows[0]);
}

async function disputeReimbursement({ reimbursementId, contributorUserId, reason }) {
  const { rows } = await db.pool.query(
    `UPDATE organizer_campaign_reimbursements
     SET reimbursement_status = 'disputed', disputed_at = NOW(), dispute_reason = $3
     WHERE id = $1 AND contributor_user_id = $2 AND reimbursement_status = 'sent'
     RETURNING *`,
    [Number(reimbursementId), Number(contributorUserId), reason]
  );
  return mapReimbursement(rows[0]);
}

async function disputeReimbursementWithContribution({ reimbursementId, contributionId, contributorUserId, reason }) {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE organizer_campaign_reimbursements SET reimbursement_status = 'disputed', disputed_at = NOW(), dispute_reason = $3
       WHERE id = $1 AND contributor_user_id = $2 AND contribution_id = $4 AND reimbursement_status = 'sent' RETURNING *`,
      [Number(reimbursementId), Number(contributorUserId), reason, Number(contributionId)]
    );
    if (!result.rows[0]) { await client.query("ROLLBACK"); return null; }
    await client.query("UPDATE organizer_campaign_contributions SET contribution_status = 'refund_disputed' WHERE id = $1 AND contribution_status = 'refund_sent'", [Number(contributionId)]);
    await client.query("COMMIT"); return mapReimbursement(result.rows[0]);
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

async function markContributionRefundDisputed(contributionId) {
  const { rows } = await db.pool.query(
    "UPDATE organizer_campaign_contributions SET contribution_status = 'refund_disputed' WHERE id = $1 AND contribution_status = 'refund_sent' RETURNING *",
    [Number(contributionId)]
  );
  return mapContribution(rows[0]);
}

async function recordEvent({ campaignId, eventType, actorUserId = null, actorRole = null, source = "account", metadata = {} }) {
  const { rows } = await db.pool.query(
    `INSERT INTO organizer_campaign_events (campaign_id, event_type, actor_user_id, actor_role, source, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING *`,
    [Number(campaignId), eventType, actorUserId ? Number(actorUserId) : null, actorRole, source, JSON.stringify(metadata)]
  );
  return rows[0];
}

function mapContribution(row) {
  if (!row) return null;
  const paymentProof = row.payment_proof_object_key
    ? {
        fileName: row.payment_proof_file_name || "Payment proof",
        contentType: row.payment_proof_content_type || "application/octet-stream",
        sizeBytes: Number(row.payment_proof_size_bytes || 0)
      }
    : null;
  return {
    id: String(row.id), campaignId: String(row.campaign_id), contributorUserId: String(row.contributor_user_id),
    slotNumber: row.slot_number == null ? undefined : Number(row.slot_number),
    status: row.contribution_status, amountCents: Number(row.amount_cents), currency: row.currency,
    paymentReference: row.payment_reference || "", submittedAt: row.submitted_at || null,
    paymentProof,
    acceptedAt: row.accepted_at || null, rejectedAt: row.rejected_at || null,
    rejectionReason: row.rejection_reason || null, resubmissionCount: Number(row.resubmission_count || 0),
    reservationExpiresAt: row.reservation_expires_at || null,
    reservationAttemptCount: Number(row.reservation_attempt_count || 1),
    retryAvailableAt: row.retry_available_at || null,
    contributorDisplayName: row.contributor_display_name || undefined,
    contributorAvatarUrl: row.contributor_avatar_url || "",
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

module.exports = {
  CAMPAIGN_STATUSES,
  CONTRIBUTION_STATUSES,
  createCampaign,
  createReport,
  createNotice,
  beginCancellation,
  cancelWithoutRefund,
  createReimbursement,
  beginCancellationWithReimbursements,
  createContribution,
  countActivePublicCampaignsForOrganizer,
  countReportsByUserSince,
  findCampaignById,
  findCampaignByBookingId,
  findPublicCampaignByToken,
  findReportById,
  findContributionById,
  findContributionEvidenceById,
  findReimbursementByContributionId,
  findReimbursementEvidenceByContributionId,
  freezeCampaign,
  findContributionByCampaignAndUser,
  listCampaignsForOrganizer,
  listCampaignsForCustomer,
  listContributionsByCampaign,
  listReimbursementsByCampaign,
  listEventsByCampaign,
  listNotices,
  listReports,
  listPublicCampaigns,
  listExpiredCollectingCampaigns,
  listAcceptedContributions,
  markContributionRefundPending,
  markContributionRefundSent,
  markContributionRefundConfirmed,
  markReimbursementSent,
  markReimbursementSentWithContribution,
  confirmReimbursement,
  disputeReimbursement,
  disputeReimbursementWithContribution,
  expireStaleReservations,
  finalizeCancellationIfFullyConfirmed,
  markContributionRefundDisputed,
  markCollectedIfTargetReached,
  markOverdueReviews,
  recordEvent,
  mapContribution,
  publishCampaign,
  publishPublicCampaignWithinCap,
  unpublishCampaign,
  updateDraftCampaign,
  confirmReimbursementAndMaybeCancel,
  reviewContribution,
  submitContributionProof,
  withdrawPendingContribution,
  updateReportStatus,
  mapCampaign
};
