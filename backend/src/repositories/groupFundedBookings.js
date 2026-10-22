const crypto = require("node:crypto");
const db = require("../config/db");

const CAMPAIGN_STATUSES = Object.freeze({
  DRAFT: "draft",
  FUNDING: "funding",
  ORGANIZER_CANCELED: "organizer_canceled",
  FUNDING_FAILED: "funding_failed",
  FUNDED: "funded",
  SLOT_RECOVERY: "slot_recovery",
  VENDOR_REVIEW: "vendor_review",
  REPLACEMENT_PROPOSED: "replacement_proposed",
  VENDOR_APPROVED: "vendor_approved",
  VENDOR_REJECTED: "vendor_rejected",
  VENDOR_REVIEW_EXPIRED: "vendor_review_expired",
  CONFIRMED: "confirmed",
  VENDOR_CANCELED: "vendor_canceled",
  POLICY_REVIEW_REQUIRED: "policy_review_required"
});

const PARTICIPANT_ROLES = Object.freeze({
  ORGANIZER: "organizer",
  CONTRIBUTOR: "contributor"
});

const CONTRIBUTION_STATUSES = Object.freeze({
  PENDING_PROOF: "pending_proof",
  SUBMITTED: "submitted",
  VERIFIED: "verified",
  REJECTED: "rejected",
  REFUND_PENDING: "refund_pending",
  REFUNDED: "refunded",
  POLICY_REVIEW_REQUIRED: "policy_review_required"
});

const REFUND_STATUSES = Object.freeze({
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  REJECTED: "rejected",
  POLICY_REVIEW_REQUIRED: "policy_review_required"
});

const CAPACITY_HOLD_STATUSES = Object.freeze({
  ACTIVE: "active",
  RELEASED: "released",
  EXPIRED: "expired",
  CONVERTED: "converted"
});

const EVENT_TYPES = Object.freeze({
  CAMPAIGN_CREATED: "campaign_created",
  CAMPAIGN_VISIBILITY_CHANGED: "campaign_visibility_changed",
  DESCRIPTION_UPDATED: "description_updated",
  ORGANIZER_CANCELED: "organizer_canceled",
  CONTRIBUTION_CREATED: "contribution_created",
  CONTRIBUTION_SUBMITTED: "contribution_submitted",
  CONTRIBUTION_VERIFIED: "contribution_verified",
  CONTRIBUTION_REJECTED: "contribution_rejected",
  FUNDING_COMPLETED: "funding_completed",
  FUNDING_DEADLINE_EXPIRED: "funding_deadline_expired",
  CAPACITY_HOLD_CREATED: "capacity_hold_created",
  CAPACITY_HOLD_EXPIRED: "capacity_hold_expired",
  REPLACEMENT_SLOT_PROPOSED: "replacement_slot_proposed",
  REPLACEMENT_SLOT_ACCEPTED: "replacement_slot_accepted",
  REPLACEMENT_SLOT_DECLINED: "replacement_slot_declined",
  VENDOR_APPROVED: "vendor_approved",
  VENDOR_REJECTED: "vendor_rejected",
  LINKED_BOOKING_CREATED: "linked_booking_created",
  REFUND_OBLIGATION_CREATED: "refund_obligation_created",
  REFUND_MARKED_IN_PROGRESS: "refund_marked_in_progress",
  REFUND_MARKED_COMPLETED: "refund_marked_completed",
  ABUSE_REPORTED: "abuse_reported",
  POLICY_REVIEW_REQUIRED: "policy_review_required"
});

const CAMPAIGN_COLUMNS = `
  id,
  public_token,
  tenant_id,
  location_id,
  service_id,
  location_service_id,
  organizer_user_id,
  linked_booking_id,
  campaign_status,
  visibility,
  organizer_display_name,
  campaign_title,
  description,
  service_name_snapshot,
  service_slug_snapshot,
  location_name_snapshot,
  location_slug_snapshot,
  booking_quantity,
  execution_mode,
  scheduled_start_at,
  scheduled_end_at,
  funding_deadline_at,
  currency,
  target_amount_cents,
  required_contribution_amount_cents,
  rounding_adjustment_cents,
  required_contributors,
  paid_participant_count,
  funded_amount_cents,
  funded_at,
  vendor_review_started_at,
  vendor_review_expires_at,
  replacement_scheduled_start_at,
  replacement_scheduled_end_at,
  replacement_proposed_at,
  replacement_proposed_by_user_id,
  replacement_note,
  confirmed_at,
  canceled_at,
  cancellation_reason,
  eligibility_snapshot,
  created_at,
  updated_at
`;

const PARTICIPANT_COLUMNS = `
  id,
  campaign_id,
  user_id,
  participant_role,
  display_name,
  joined_at,
  created_at,
  updated_at
`;

const CONTRIBUTION_COLUMNS = `
  id,
  campaign_id,
  participant_id,
  user_id,
  amount_cents,
  currency,
  contribution_status,
  payment_reference,
  payment_proof_object_key,
  payment_proof_file_name,
  payment_proof_content_type,
  payment_proof_size_bytes,
  payment_proof_uploaded_at,
  submitted_at,
  verified_at,
  verified_by_user_id,
  rejected_at,
  rejected_by_user_id,
  rejection_reason,
  refund_status,
  created_at,
  updated_at
`;

const REFUND_COLUMNS = `
  id,
  campaign_id,
  contribution_id,
  user_id,
  amount_cents,
  currency,
  refund_reason,
  refund_status,
  vendor_actor_user_id,
  notes,
  evidence_object_key,
  evidence_file_name,
  evidence_content_type,
  evidence_size_bytes,
  completed_at,
  created_at,
  updated_at
`;

const EVENT_COLUMNS = `
  id,
  campaign_id,
  tenant_id,
  location_id,
  event_type,
  actor_user_id,
  actor_role,
  source,
  metadata,
  created_at
`;

const CAPACITY_HOLD_COLUMNS = `
  id,
  campaign_id,
  group_funded_booking_item_id,
  tenant_id,
  location_id,
  service_id,
  scheduled_start_at,
  scheduled_end_at,
  booking_quantity,
  hold_status,
  expires_at,
  released_at,
  converted_booking_id,
  created_at,
  updated_at
`;

const CAMPAIGN_ITEM_COLUMNS = `
  id,
  campaign_id,
  tenant_id,
  location_id,
  service_id,
  location_service_id,
  service_name_snapshot,
  service_slug_snapshot,
  booking_quantity,
  price_amount_cents,
  currency,
  execution_mode,
  scheduled_start_at,
  scheduled_end_at,
  sort_order,
  created_at,
  updated_at
`;

function campaignSelectColumns(alias = "campaign") {
  const columns = CAMPAIGN_COLUMNS
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean)
    .map((column) => {
      if (column === "organizer_display_name") {
        return `COALESCE(NULLIF(organizer.display_name, ''), ${alias}.organizer_display_name) AS organizer_display_name`;
      }

      return `${alias}.${column}`;
    })
    .join(", ");

  return `${columns}, NULLIF(organizer.display_name, '') AS organizer_profile_display_name`;
}

function buildQueryClient(client) {
  return client || db.pool;
}

function generatePublicToken() {
  return crypto.randomBytes(16).toString("hex");
}

async function withTransaction(callback) {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function parseMetadata(value) {
  if (!value) {
    return {};
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value;
}

function mapCampaign(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    id: String(row.id),
    publicToken: row.public_token,
    tenantId: String(row.tenant_id),
    locationId: String(row.location_id),
    serviceId: String(row.service_id),
    locationServiceId: row.location_service_id ? String(row.location_service_id) : null,
    organizerUserId: String(row.organizer_user_id),
    linkedBookingId: row.linked_booking_id ? String(row.linked_booking_id) : null,
    campaignStatus: row.campaign_status,
    visibility: row.visibility,
    organizerDisplayName: row.organizer_display_name,
    organizerProfileDisplayName: row.organizer_profile_display_name || "",
    campaignTitle: row.campaign_title || "",
    description: row.description || "",
    serviceNameSnapshot: row.service_name_snapshot,
    serviceSlugSnapshot: row.service_slug_snapshot,
    locationNameSnapshot: row.location_name_snapshot,
    locationSlugSnapshot: row.location_slug_snapshot,
    bookingQuantity: Number(row.booking_quantity || 1),
    executionMode: row.execution_mode || "parallel",
    scheduledStartAt: row.scheduled_start_at,
    scheduledEndAt: row.scheduled_end_at,
    fundingDeadlineAt: row.funding_deadline_at,
    currency: row.currency || "PHP",
    targetAmountCents: Number(row.target_amount_cents || 0),
    requiredContributionAmountCents: Number(row.required_contribution_amount_cents || 0),
    roundingAdjustmentCents: Number(row.rounding_adjustment_cents || 0),
    requiredContributors: Number(row.required_contributors || 0),
    paidParticipantCount: Number(row.paid_participant_count || 0),
    fundedAmountCents: Number(row.funded_amount_cents || 0),
    fundedAt: row.funded_at || null,
    vendorReviewStartedAt: row.vendor_review_started_at || null,
    vendorReviewExpiresAt: row.vendor_review_expires_at || null,
    replacementScheduledStartAt: row.replacement_scheduled_start_at || null,
    replacementScheduledEndAt: row.replacement_scheduled_end_at || null,
    replacementProposedAt: row.replacement_proposed_at || null,
    replacementProposedByUserId: row.replacement_proposed_by_user_id ? String(row.replacement_proposed_by_user_id) : null,
    replacementNote: row.replacement_note || "",
    confirmedAt: row.confirmed_at || null,
    canceledAt: row.canceled_at || null,
    cancellationReason: row.cancellation_reason || "",
    contributorReservationTotals: row.verified_contributor_count === undefined
      ? null
      : {
          verifiedContributorCount: Number(row.verified_contributor_count || 0),
          pendingVerificationContributorCount: Number(row.pending_verification_contributor_count || 0)
        },
    refundSummary: row.refund_count === undefined
      ? null
      : {
          totalCount: Number(row.refund_count || 0),
          completedCount: Number(row.completed_refund_count || 0),
          eligibleContributionCount: Number(row.refund_eligible_contribution_count || 0)
        },
    eligibilitySnapshot: parseMetadata(row.eligibility_snapshot),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapParticipant(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    id: String(row.id),
    campaignId: String(row.campaign_id),
    userId: String(row.user_id),
    participantRole: row.participant_role,
    displayName: row.display_name,
    joinedAt: row.joined_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapContribution(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    id: String(row.id),
    campaignId: String(row.campaign_id),
    participantId: String(row.participant_id),
    userId: String(row.user_id),
    participantDisplayName: row.participant_display_name || row.display_name || "",
    amountCents: Number(row.amount_cents || 0),
    currency: row.currency || "PHP",
    contributionStatus: row.contribution_status,
    paymentReference: row.payment_reference || "",
    paymentProofObjectKey: row.payment_proof_object_key || "",
    paymentProofFileName: row.payment_proof_file_name || "",
    paymentProofContentType: row.payment_proof_content_type || "",
    paymentProofSizeBytes: row.payment_proof_size_bytes ? Number(row.payment_proof_size_bytes) : null,
    paymentProofUploadedAt: row.payment_proof_uploaded_at || null,
    submittedAt: row.submitted_at || null,
    verifiedAt: row.verified_at || null,
    verifiedByUserId: row.verified_by_user_id ? String(row.verified_by_user_id) : null,
    rejectedAt: row.rejected_at || null,
    rejectedByUserId: row.rejected_by_user_id ? String(row.rejected_by_user_id) : null,
    rejectionReason: row.rejection_reason || "",
    refundStatus: row.refund_status || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRefund(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    id: String(row.id),
    campaignId: String(row.campaign_id),
    contributionId: String(row.contribution_id),
    userId: String(row.user_id),
    amountCents: Number(row.amount_cents || 0),
    currency: row.currency || "PHP",
    refundReason: row.refund_reason,
    refundStatus: row.refund_status,
    vendorActorUserId: row.vendor_actor_user_id ? String(row.vendor_actor_user_id) : null,
    notes: row.notes || "",
    evidenceObjectKey: row.evidence_object_key || "",
    evidenceFileName: row.evidence_file_name || "",
    evidenceContentType: row.evidence_content_type || "",
    evidenceSizeBytes: row.evidence_size_bytes ? Number(row.evidence_size_bytes) : null,
    completedAt: row.completed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapEvent(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    id: String(row.id),
    campaignId: String(row.campaign_id),
    tenantId: String(row.tenant_id),
    locationId: row.location_id ? String(row.location_id) : null,
    eventType: row.event_type,
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
    actorRole: row.actor_role || "",
    source: row.source,
    metadata: parseMetadata(row.metadata),
    createdAt: row.created_at
  };
}

function mapCampaignItem(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    id: String(row.id),
    campaignId: String(row.campaign_id),
    campaignItemId: row.group_funded_booking_item_id ? String(row.group_funded_booking_item_id) : null,
    tenantId: String(row.tenant_id),
    locationId: String(row.location_id),
    serviceId: String(row.service_id),
    locationServiceId: row.location_service_id ? String(row.location_service_id) : null,
    serviceNameSnapshot: row.service_name_snapshot,
    serviceSlugSnapshot: row.service_slug_snapshot,
    bookingQuantity: Number(row.booking_quantity || 1),
    priceAmountCents: Number(row.price_amount_cents || 0),
    currency: row.currency || "PHP",
    executionMode: row.execution_mode || "parallel",
    scheduledStartAt: row.scheduled_start_at,
    scheduledEndAt: row.scheduled_end_at,
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapCapacityHold(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    id: String(row.id),
    campaignId: String(row.campaign_id),
    campaignItemId: row.group_funded_booking_item_id ? String(row.group_funded_booking_item_id) : null,
    tenantId: String(row.tenant_id),
    locationId: String(row.location_id),
    serviceId: String(row.service_id),
    scheduledStartAt: row.scheduled_start_at,
    scheduledEndAt: row.scheduled_end_at,
    bookingQuantity: Number(row.booking_quantity || 1),
    holdStatus: row.hold_status,
    expiresAt: row.expires_at,
    releasedAt: row.released_at || null,
    convertedBookingId: row.converted_booking_id ? String(row.converted_booking_id) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function createCampaign(data, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      INSERT INTO group_funded_bookings (
        public_token,
        tenant_id,
        location_id,
        service_id,
        location_service_id,
        organizer_user_id,
        campaign_status,
        visibility,
        organizer_display_name,
        campaign_title,
        description,
        service_name_snapshot,
        service_slug_snapshot,
        location_name_snapshot,
        location_slug_snapshot,
        booking_quantity,
        execution_mode,
        scheduled_start_at,
        scheduled_end_at,
        funding_deadline_at,
        currency,
        target_amount_cents,
        required_contribution_amount_cents,
        rounding_adjustment_cents,
        required_contributors,
        eligibility_snapshot
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26::jsonb)
      RETURNING ${CAMPAIGN_COLUMNS}
    `,
    [
      data.publicToken || generatePublicToken(),
      Number(data.tenantId),
      Number(data.locationId),
      Number(data.serviceId),
      data.locationServiceId ? Number(data.locationServiceId) : null,
      Number(data.organizerUserId),
      data.campaignStatus || CAMPAIGN_STATUSES.FUNDING,
      data.visibility || "private_link",
      data.organizerDisplayName,
      data.campaignTitle || "",
      data.description || "",
      data.serviceNameSnapshot,
      data.serviceSlugSnapshot,
      data.locationNameSnapshot,
      data.locationSlugSnapshot,
      Number(data.bookingQuantity || 1),
      data.executionMode || "parallel",
      data.scheduledStartAt,
      data.scheduledEndAt,
      data.fundingDeadlineAt,
      data.currency || "PHP",
      Number(data.targetAmountCents || 0),
      Number(data.requiredContributionAmountCents || 0),
      Number(data.roundingAdjustmentCents || 0),
      Number(data.requiredContributors),
      JSON.stringify(data.eligibilitySnapshot || {})
    ]
  );
  return mapCampaign(result.rows[0]);
}

async function createCampaignItem(data, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      INSERT INTO group_funded_booking_items (
        campaign_id,
        tenant_id,
        location_id,
        service_id,
        location_service_id,
        service_name_snapshot,
        service_slug_snapshot,
        booking_quantity,
        price_amount_cents,
        currency,
        execution_mode,
        scheduled_start_at,
        scheduled_end_at,
        sort_order
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING ${CAMPAIGN_ITEM_COLUMNS}
    `,
    [
      Number(data.campaignId),
      Number(data.tenantId),
      Number(data.locationId),
      Number(data.serviceId),
      data.locationServiceId ? Number(data.locationServiceId) : null,
      data.serviceNameSnapshot,
      data.serviceSlugSnapshot,
      Number(data.bookingQuantity || 1),
      Number(data.priceAmountCents || 0),
      data.currency || "PHP",
      data.executionMode || "parallel",
      data.scheduledStartAt,
      data.scheduledEndAt,
      Number(data.sortOrder || 0)
    ]
  );
  return mapCampaignItem(result.rows[0]);
}

async function listCampaignItemsByCampaign(campaignId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT ${CAMPAIGN_ITEM_COLUMNS}
      FROM group_funded_booking_items
      WHERE campaign_id = $1
      ORDER BY sort_order ASC, id ASC
    `,
    [Number(campaignId)]
  );
  return result.rows.map(mapCampaignItem);
}

async function listCampaignItemsByCampaignIds(campaignIds, options = {}) {
  const ids = Array.isArray(campaignIds) ? campaignIds.map(Number).filter(Number.isFinite) : [];
  if (!ids.length) {
    return [];
  }
  const result = await buildQueryClient(options.client).query(
    `
      SELECT ${CAMPAIGN_ITEM_COLUMNS}
      FROM group_funded_booking_items
      WHERE campaign_id = ANY($1::bigint[])
      ORDER BY campaign_id ASC, sort_order ASC, id ASC
    `,
    [ids]
  );
  return result.rows.map(mapCampaignItem);
}

async function shiftCampaignItemsScheduledSlot(data, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      UPDATE group_funded_booking_items
      SET
        scheduled_start_at = $2::timestamptz + (scheduled_start_at - $3::timestamptz),
        scheduled_end_at = $2::timestamptz + (scheduled_end_at - $3::timestamptz),
        updated_at = NOW()
      WHERE campaign_id = $1
      RETURNING ${CAMPAIGN_ITEM_COLUMNS}
    `,
    [
      Number(data.campaignId),
      data.scheduledStartAt,
      data.previousScheduledStartAt
    ]
  );
  return result.rows.map(mapCampaignItem);
}

async function findCampaignById(campaignId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT ${campaignSelectColumns("campaign")}
      FROM group_funded_bookings campaign
      LEFT JOIN users organizer
        ON organizer.id = campaign.organizer_user_id
      WHERE campaign.id = $1
      LIMIT 1
      ${options.forUpdate ? "FOR UPDATE OF campaign" : ""}
    `,
    [Number(campaignId)]
  );
  return mapCampaign(result.rows[0]);
}

async function findCampaignByPublicToken(publicToken, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT ${campaignSelectColumns("campaign")}
      FROM group_funded_bookings campaign
      LEFT JOIN users organizer
        ON organizer.id = campaign.organizer_user_id
      WHERE campaign.public_token = $1
      LIMIT 1
      ${options.forUpdate ? "FOR UPDATE OF campaign" : ""}
    `,
    [String(publicToken || "").trim()]
  );
  return mapCampaign(result.rows[0]);
}

async function listCampaignsForUser(userId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT DISTINCT ${campaignSelectColumns("gfb")}
      FROM group_funded_bookings gfb
      LEFT JOIN users organizer
        ON organizer.id = gfb.organizer_user_id
      LEFT JOIN group_funded_booking_participants participant
        ON participant.campaign_id = gfb.id
      WHERE gfb.organizer_user_id = $1
        OR participant.user_id = $1
      ORDER BY gfb.created_at DESC
      LIMIT $2
    `,
    [Number(userId), Number(options.limit || 50)]
  );
  return result.rows.map(mapCampaign);
}

async function listCampaignsForVendor(tenantId, options = {}) {
  const values = [Number(tenantId)];
  const whereClauses = ["gfb.tenant_id = $1"];

  if (options.locationId) {
    values.push(Number(options.locationId));
    whereClauses.push(`gfb.location_id = $${values.length}`);
  }

  const statuses = Array.isArray(options.statuses)
    ? options.statuses
    : options.status
      ? [options.status]
      : [];
  if (statuses.length) {
    values.push(statuses);
    whereClauses.push(`gfb.campaign_status = ANY($${values.length})`);
  }

  values.push(Number(options.limit || 50));

  const result = await buildQueryClient(options.client).query(
    `
      SELECT
        ${campaignSelectColumns("gfb")},
        COALESCE(refund_summary.refund_count, 0)::INTEGER AS refund_count,
        COALESCE(refund_summary.completed_refund_count, 0)::INTEGER AS completed_refund_count,
        COALESCE(refund_summary.refund_eligible_contribution_count, 0)::INTEGER AS refund_eligible_contribution_count
      FROM group_funded_bookings gfb
      LEFT JOIN users organizer
        ON organizer.id = gfb.organizer_user_id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::INTEGER AS refund_count,
          COUNT(*) FILTER (WHERE refund_status = 'completed')::INTEGER AS completed_refund_count,
          (
            SELECT COUNT(*)::INTEGER
            FROM group_funded_booking_contributions
            WHERE campaign_id = gfb.id
              AND contribution_status IN ('verified', 'refund_pending', 'refunded', 'policy_review_required')
          ) AS refund_eligible_contribution_count
        FROM group_funded_booking_refunds
        WHERE campaign_id = gfb.id
      ) refund_summary ON TRUE
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY gfb.created_at DESC
      LIMIT $${values.length}
    `,
    values
  );
  return result.rows.map(mapCampaign);
}

async function listVendorAlertEvents(tenantId, options = {}) {
  const values = [Number(tenantId)];
  const whereClauses = ["event.tenant_id = $1"];

  if (options.locationId) {
    values.push(Number(options.locationId));
    whereClauses.push(`event.location_id = $${values.length}`);
  }

  const eventTypes = Array.isArray(options.eventTypes) ? options.eventTypes.filter(Boolean) : [];
  if (eventTypes.length) {
    values.push(eventTypes);
    whereClauses.push(`event.event_type = ANY($${values.length})`);
  }

  values.push(Number(options.limit || 20));

  const result = await buildQueryClient(options.client).query(
    `
      SELECT
        to_jsonb(event) AS event_row,
        to_jsonb(campaign) || jsonb_build_object(
          'organizer_display_name',
          COALESCE(NULLIF(organizer.display_name, ''), campaign.organizer_display_name)
        ) AS campaign_row
      FROM group_funded_booking_events event
      INNER JOIN group_funded_bookings campaign
        ON campaign.id = event.campaign_id
       AND campaign.tenant_id = event.tenant_id
      LEFT JOIN users organizer
        ON organizer.id = campaign.organizer_user_id
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY event.created_at DESC
      LIMIT $${values.length}
    `,
    values
  );

  return result.rows.map((row) => ({
    event: mapEvent(row.event_row),
    campaign: mapCampaign(row.campaign_row)
  }));
}

async function listPublicCampaignsForVendorLocation(tenantId, locationId, options = {}) {
  const values = [Number(tenantId), Number(locationId)];
  const whereClauses = [
    "gfb.tenant_id = $1",
    "gfb.location_id = $2",
    "gfb.visibility = 'public'",
    "gfb.campaign_status IN ('funding', 'funded', 'vendor_review', 'replacement_proposed', 'confirmed')",
    `EXISTS (
      SELECT 1
      FROM group_funded_booking_contributions organizer_contribution
      WHERE organizer_contribution.campaign_id = gfb.id
        AND organizer_contribution.user_id = gfb.organizer_user_id
        AND organizer_contribution.contribution_status = 'verified'
    )`,
    "location_service.id IS NOT NULL",
    "COALESCE(location_service.group_funded_allow_public_campaigns, FALSE) = TRUE"
  ];

  if (options.serviceSlug) {
    values.push(String(options.serviceSlug));
    whereClauses.push(`gfb.service_slug_snapshot = $${values.length}`);
  }

  if (options.search) {
    values.push(`%${String(options.search).trim().toLowerCase()}%`);
    whereClauses.push(`(
      LOWER(gfb.campaign_title) LIKE $${values.length}
      OR LOWER(gfb.description) LIKE $${values.length}
      OR LOWER(gfb.service_name_snapshot) LIKE $${values.length}
      OR LOWER(gfb.location_name_snapshot) LIKE $${values.length}
      OR LOWER(gfb.organizer_display_name) LIKE $${values.length}
    )`);
  }

  if (Array.isArray(options.statuses) && options.statuses.length) {
    values.push(options.statuses);
    whereClauses.push(`gfb.campaign_status = ANY($${values.length})`);
  }

  if (options.scheduledDateFrom) {
    values.push(options.scheduledDateFrom);
    whereClauses.push(`gfb.scheduled_start_at >= $${values.length}::date`);
  }

  if (options.scheduledDateTo) {
    values.push(options.scheduledDateTo);
    whereClauses.push(`gfb.scheduled_start_at < ($${values.length}::date + INTERVAL '1 day')`);
  }

  values.push(Number(options.pageSize || options.limit || 20));
  const limitIndex = values.length;
  values.push(Number(options.offset || 0));
  const offsetIndex = values.length;

  const result = await buildQueryClient(options.client).query(
    `
      SELECT
        ${campaignSelectColumns("gfb")},
        COUNT(*) OVER()::int AS total_count,
        COALESCE(contribution_summary.verified_contributor_count, 0)::INTEGER AS verified_contributor_count,
        COALESCE(contribution_summary.pending_verification_contributor_count, 0)::INTEGER AS pending_verification_contributor_count
      FROM group_funded_bookings gfb
      LEFT JOIN users organizer
        ON organizer.id = gfb.organizer_user_id
      LEFT JOIN location_services location_service
        ON location_service.tenant_id = gfb.tenant_id
       AND location_service.location_id = gfb.location_id
       AND location_service.service_id = gfb.service_id
       AND location_service.is_active = TRUE
       AND (
         location_service.id = gfb.location_service_id
         OR gfb.location_service_id IS NULL
       )
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE contribution_status = 'verified')::INTEGER AS verified_contributor_count,
          COUNT(*) FILTER (WHERE contribution_status = 'submitted')::INTEGER AS pending_verification_contributor_count
        FROM group_funded_booking_contributions
        WHERE campaign_id = gfb.id
      ) contribution_summary ON TRUE
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY gfb.funding_deadline_at ASC, gfb.created_at DESC
      LIMIT $${limitIndex}
      OFFSET $${offsetIndex}
    `,
    values
  );
  const campaigns = result.rows.map(mapCampaign);
  campaigns.totalItems = Number(result.rows[0]?.total_count || campaigns.length);
  return campaigns;
}

async function createParticipant(data, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      INSERT INTO group_funded_booking_participants (
        campaign_id,
        user_id,
        participant_role,
        display_name,
        joined_at
      )
      VALUES ($1, $2, $3, $4, COALESCE($5, NOW()))
      RETURNING ${PARTICIPANT_COLUMNS}
    `,
    [
      Number(data.campaignId),
      Number(data.userId),
      data.participantRole || PARTICIPANT_ROLES.CONTRIBUTOR,
      data.displayName,
      data.joinedAt || null
    ]
  );
  return mapParticipant(result.rows[0]);
}

async function findParticipantByCampaignAndUser(campaignId, userId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT ${PARTICIPANT_COLUMNS}
      FROM group_funded_booking_participants
      WHERE campaign_id = $1 AND user_id = $2
      LIMIT 1
    `,
    [Number(campaignId), Number(userId)]
  );
  return mapParticipant(result.rows[0]);
}

async function createContribution(data, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      INSERT INTO group_funded_booking_contributions (
        campaign_id,
        participant_id,
        user_id,
        amount_cents,
        currency,
        contribution_status,
        payment_reference,
        payment_proof_object_key,
        payment_proof_file_name,
        payment_proof_content_type,
        payment_proof_size_bytes,
        payment_proof_uploaded_at,
        submitted_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING ${CONTRIBUTION_COLUMNS}
    `,
    [
      Number(data.campaignId),
      Number(data.participantId),
      Number(data.userId),
      Number(data.amountCents || 0),
      data.currency || "PHP",
      data.contributionStatus || CONTRIBUTION_STATUSES.PENDING_PROOF,
      data.paymentReference || null,
      data.paymentProofObjectKey || null,
      data.paymentProofFileName || null,
      data.paymentProofContentType || null,
      data.paymentProofSizeBytes ?? null,
      data.paymentProofUploadedAt || null,
      data.submittedAt || null
    ]
  );
  return mapContribution(result.rows[0]);
}

async function findContributionById(contributionId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT ${CONTRIBUTION_COLUMNS}
      FROM group_funded_booking_contributions
      WHERE id = $1
      LIMIT 1
      ${options.forUpdate ? "FOR UPDATE" : ""}
    `,
    [Number(contributionId)]
  );
  return mapContribution(result.rows[0]);
}

async function findContributionByCampaignAndUser(campaignId, userId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT ${CONTRIBUTION_COLUMNS}
      FROM group_funded_booking_contributions
      WHERE campaign_id = $1 AND user_id = $2
      LIMIT 1
      ${options.forUpdate ? "FOR UPDATE" : ""}
    `,
    [Number(campaignId), Number(userId)]
  );
  return mapContribution(result.rows[0]);
}

async function listContributionsByCampaign(campaignId, options = {}) {
  const values = [Number(campaignId)];
  let statusClause = "";
  if (Array.isArray(options.statuses) && options.statuses.length) {
    values.push(options.statuses);
    statusClause = `AND contribution_status = ANY($${values.length})`;
  }

  const result = await buildQueryClient(options.client).query(
    `
      SELECT
        ${CONTRIBUTION_COLUMNS.split(",").map((column) => `contribution.${column.trim()}`).join(", ")},
        participant.display_name AS participant_display_name
      FROM group_funded_booking_contributions contribution
      LEFT JOIN group_funded_booking_participants participant
        ON participant.id = contribution.participant_id
      WHERE contribution.campaign_id = $1
      ${statusClause ? statusClause.replace("contribution_status", "contribution.contribution_status") : ""}
      ORDER BY contribution.created_at ASC
    `,
    values
  );
  return result.rows.map(mapContribution);
}

async function getContributionReservationSummary(campaignId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT
        COUNT(*) FILTER (WHERE contribution_status = 'verified')::INTEGER AS verified_contributor_count,
        COUNT(*) FILTER (WHERE contribution_status = 'submitted')::INTEGER AS pending_verification_contributor_count
      FROM group_funded_booking_contributions
      WHERE campaign_id = $1
    `,
    [Number(campaignId)]
  );
  const row = result.rows[0] || {};
  return {
    verifiedContributorCount: Number(row.verified_contributor_count || 0),
    pendingVerificationContributorCount: Number(row.pending_verification_contributor_count || 0)
  };
}

async function updateContribution(data, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      UPDATE group_funded_booking_contributions
      SET
        contribution_status = COALESCE($2, contribution_status),
        payment_reference = COALESCE($3, payment_reference),
        payment_proof_object_key = COALESCE($4, payment_proof_object_key),
        payment_proof_file_name = COALESCE($5, payment_proof_file_name),
        payment_proof_content_type = COALESCE($6, payment_proof_content_type),
        payment_proof_size_bytes = COALESCE($7, payment_proof_size_bytes),
        payment_proof_uploaded_at = COALESCE($8, payment_proof_uploaded_at),
        submitted_at = COALESCE($9, submitted_at),
        verified_at = COALESCE($10, verified_at),
        verified_by_user_id = COALESCE($11, verified_by_user_id),
        rejected_at = CASE WHEN $16::boolean THEN NULL ELSE COALESCE($12, rejected_at) END,
        rejected_by_user_id = CASE WHEN $16::boolean THEN NULL ELSE COALESCE($13, rejected_by_user_id) END,
        rejection_reason = CASE WHEN $16::boolean THEN NULL ELSE COALESCE($14, rejection_reason) END,
        refund_status = COALESCE($15, refund_status),
        updated_at = NOW()
      WHERE id = $1
      RETURNING ${CONTRIBUTION_COLUMNS}
    `,
    [
      Number(data.contributionId),
      data.contributionStatus || null,
      data.paymentReference || null,
      data.paymentProofObjectKey || null,
      data.paymentProofFileName || null,
      data.paymentProofContentType || null,
      data.paymentProofSizeBytes ?? null,
      data.paymentProofUploadedAt || null,
      data.submittedAt || null,
      data.verifiedAt || null,
      data.verifiedByUserId ? Number(data.verifiedByUserId) : null,
      data.rejectedAt || null,
      data.rejectedByUserId ? Number(data.rejectedByUserId) : null,
      data.rejectionReason || null,
      data.refundStatus || null,
      data.clearRejection === true
    ]
  );
  return mapContribution(result.rows[0]);
}

async function recomputeCampaignFunding(campaignId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      WITH totals AS (
        SELECT
          COALESCE(SUM(amount_cents), 0)::INTEGER AS funded_amount_cents,
          COUNT(*)::INTEGER AS paid_participant_count
        FROM group_funded_booking_contributions
        WHERE campaign_id = $1
          AND contribution_status = 'verified'
      )
      UPDATE group_funded_bookings campaign
      SET
        funded_amount_cents = totals.funded_amount_cents,
        paid_participant_count = totals.paid_participant_count,
        campaign_status = CASE
          WHEN campaign.campaign_status = 'funding'
            AND totals.funded_amount_cents >= campaign.target_amount_cents + campaign.rounding_adjustment_cents
          THEN 'funded'
          ELSE campaign.campaign_status
        END,
        funded_at = CASE
          WHEN campaign.funded_at IS NULL
            AND campaign.campaign_status = 'funding'
            AND totals.funded_amount_cents >= campaign.target_amount_cents + campaign.rounding_adjustment_cents
          THEN NOW()
          ELSE campaign.funded_at
        END,
        updated_at = NOW()
      FROM totals
      WHERE campaign.id = $1
      RETURNING ${CAMPAIGN_COLUMNS.split(",").map((column) => `campaign.${column.trim()}`).join(", ")}
    `,
    [Number(campaignId)]
  );
  return mapCampaign(result.rows[0]);
}

async function updateCampaignStatus(data, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      UPDATE group_funded_bookings
      SET
        campaign_status = $2,
        canceled_at = COALESCE($3, canceled_at),
        cancellation_reason = COALESCE($4, cancellation_reason),
        updated_at = NOW()
      WHERE id = $1
      RETURNING ${CAMPAIGN_COLUMNS}
    `,
    [
      Number(data.campaignId),
      data.campaignStatus,
      data.canceledAt || null,
      data.cancellationReason || null
    ]
  );
  return mapCampaign(result.rows[0]);
}

async function updateCampaignDetails(data, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      UPDATE group_funded_bookings
      SET
        campaign_title = $2,
        description = $3,
        visibility = $4,
        updated_at = NOW()
      WHERE id = $1
      RETURNING ${CAMPAIGN_COLUMNS}
    `,
    [
      Number(data.campaignId),
      data.campaignTitle || "",
      data.description || "",
      data.visibility || "private_link"
    ]
  );
  return mapCampaign(result.rows[0]);
}

async function updateCampaignReviewFields(data, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      UPDATE group_funded_bookings
      SET
        campaign_status = COALESCE($2, campaign_status),
        vendor_review_started_at = COALESCE($3, vendor_review_started_at),
        vendor_review_expires_at = COALESCE($4, vendor_review_expires_at),
        linked_booking_id = COALESCE($5, linked_booking_id),
        confirmed_at = COALESCE($6, confirmed_at),
        canceled_at = COALESCE($7, canceled_at),
        cancellation_reason = COALESCE($8, cancellation_reason),
        replacement_scheduled_start_at = CASE WHEN $9::boolean THEN $10::timestamptz ELSE replacement_scheduled_start_at END,
        replacement_scheduled_end_at = CASE WHEN $9::boolean THEN $11::timestamptz ELSE replacement_scheduled_end_at END,
        replacement_proposed_at = CASE WHEN $9::boolean THEN $12::timestamptz ELSE replacement_proposed_at END,
        replacement_proposed_by_user_id = CASE WHEN $9::boolean THEN $13::bigint ELSE replacement_proposed_by_user_id END,
        replacement_note = CASE WHEN $9::boolean THEN $14::text ELSE replacement_note END,
        scheduled_start_at = CASE WHEN $15::boolean THEN $16::timestamptz ELSE scheduled_start_at END,
        scheduled_end_at = CASE WHEN $15::boolean THEN $17::timestamptz ELSE scheduled_end_at END,
        updated_at = NOW()
      WHERE id = $1
      RETURNING ${CAMPAIGN_COLUMNS}
    `,
    [
      Number(data.campaignId),
      data.campaignStatus || null,
      data.vendorReviewStartedAt || null,
      data.vendorReviewExpiresAt || null,
      data.linkedBookingId ? Number(data.linkedBookingId) : null,
      data.confirmedAt || null,
      data.canceledAt || null,
      data.cancellationReason || null,
      Boolean(data.setReplacementProposal),
      data.replacementScheduledStartAt || null,
      data.replacementScheduledEndAt || null,
      data.replacementProposedAt || null,
      data.replacementProposedByUserId ? Number(data.replacementProposedByUserId) : null,
      data.replacementNote || null,
      Boolean(data.setScheduledSlot),
      data.scheduledStartAt || null,
      data.scheduledEndAt || null
    ]
  );
  return mapCampaign(result.rows[0]);
}

async function findRefundById(refundId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT ${REFUND_COLUMNS}
      FROM group_funded_booking_refunds
      WHERE id = $1
      LIMIT 1
      ${options.forUpdate ? "FOR UPDATE" : ""}
    `,
    [Number(refundId)]
  );
  return mapRefund(result.rows[0]);
}

async function findRefundByContributionId(contributionId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT ${REFUND_COLUMNS}
      FROM group_funded_booking_refunds
      WHERE contribution_id = $1
      LIMIT 1
      ${options.forUpdate ? "FOR UPDATE" : ""}
    `,
    [Number(contributionId)]
  );
  return mapRefund(result.rows[0]);
}

async function createRefund(data, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      INSERT INTO group_funded_booking_refunds (
        campaign_id,
        contribution_id,
        user_id,
        amount_cents,
        currency,
        refund_reason,
        refund_status,
        vendor_actor_user_id,
        notes,
        evidence_object_key,
        evidence_file_name,
        evidence_content_type,
        evidence_size_bytes,
        completed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING ${REFUND_COLUMNS}
    `,
    [
      Number(data.campaignId),
      Number(data.contributionId),
      Number(data.userId),
      Number(data.amountCents || 0),
      data.currency || "PHP",
      data.refundReason,
      data.refundStatus || REFUND_STATUSES.PENDING,
      data.vendorActorUserId ? Number(data.vendorActorUserId) : null,
      data.notes || null,
      data.evidenceObjectKey || null,
      data.evidenceFileName || null,
      data.evidenceContentType || null,
      data.evidenceSizeBytes ?? null,
      data.completedAt || null
    ]
  );
  return mapRefund(result.rows[0]);
}

async function updateRefund(data, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      UPDATE group_funded_booking_refunds
      SET
        refund_status = COALESCE($2, refund_status),
        vendor_actor_user_id = COALESCE($3, vendor_actor_user_id),
        notes = COALESCE($4, notes),
        evidence_object_key = COALESCE($5, evidence_object_key),
        evidence_file_name = COALESCE($6, evidence_file_name),
        evidence_content_type = COALESCE($7, evidence_content_type),
        evidence_size_bytes = COALESCE($8, evidence_size_bytes),
        completed_at = COALESCE($9, completed_at),
        updated_at = NOW()
      WHERE id = $1
      RETURNING ${REFUND_COLUMNS}
    `,
    [
      Number(data.refundId),
      data.refundStatus || null,
      data.vendorActorUserId ? Number(data.vendorActorUserId) : null,
      data.notes || null,
      data.evidenceObjectKey || null,
      data.evidenceFileName || null,
      data.evidenceContentType || null,
      data.evidenceSizeBytes ?? null,
      data.completedAt || null
    ]
  );
  return mapRefund(result.rows[0]);
}

async function listRefundsByCampaign(campaignId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT ${REFUND_COLUMNS}
      FROM group_funded_booking_refunds
      WHERE campaign_id = $1
      ORDER BY created_at ASC
    `,
    [Number(campaignId)]
  );
  return result.rows.map(mapRefund);
}

async function recordEvent(data, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      INSERT INTO group_funded_booking_events (
        campaign_id,
        tenant_id,
        location_id,
        event_type,
        actor_user_id,
        actor_role,
        source,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      RETURNING ${EVENT_COLUMNS}
    `,
    [
      Number(data.campaignId),
      Number(data.tenantId),
      data.locationId ? Number(data.locationId) : null,
      data.eventType,
      data.actorUserId ? Number(data.actorUserId) : null,
      data.actorRole || null,
      data.source || "system",
      JSON.stringify(data.metadata || {})
    ]
  );
  return mapEvent(result.rows[0]);
}

async function createCapacityHold(data, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      INSERT INTO group_funded_capacity_holds (
        campaign_id,
        group_funded_booking_item_id,
        tenant_id,
        location_id,
        service_id,
        scheduled_start_at,
        scheduled_end_at,
        booking_quantity,
        hold_status,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING ${CAPACITY_HOLD_COLUMNS}
    `,
    [
      Number(data.campaignId),
      data.campaignItemId ? Number(data.campaignItemId) : null,
      Number(data.tenantId),
      Number(data.locationId),
      Number(data.serviceId),
      data.scheduledStartAt,
      data.scheduledEndAt,
      Number(data.bookingQuantity || 1),
      data.holdStatus || CAPACITY_HOLD_STATUSES.ACTIVE,
      data.expiresAt
    ]
  );
  return mapCapacityHold(result.rows[0]);
}

async function findActiveCapacityHoldByCampaign(campaignId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT ${CAPACITY_HOLD_COLUMNS}
      FROM group_funded_capacity_holds
      WHERE campaign_id = $1
        AND hold_status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
      ${options.forUpdate ? "FOR UPDATE" : ""}
    `,
    [Number(campaignId)]
  );
  return mapCapacityHold(result.rows[0]);
}

async function listActiveCapacityHoldsByCampaign(campaignId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT ${CAPACITY_HOLD_COLUMNS}
      FROM group_funded_capacity_holds
      WHERE campaign_id = $1
        AND hold_status = 'active'
      ORDER BY created_at ASC, id ASC
      ${options.forUpdate ? "FOR UPDATE" : ""}
    `,
    [Number(campaignId)]
  );
  return result.rows.map(mapCapacityHold);
}

async function listCapacityHoldsByCampaign(campaignId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT ${CAPACITY_HOLD_COLUMNS}
      FROM group_funded_capacity_holds
      WHERE campaign_id = $1
      ORDER BY created_at ASC
    `,
    [Number(campaignId)]
  );
  return result.rows.map(mapCapacityHold);
}

async function countOverlappingActiveCapacityHolds(tenantId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT COUNT(*)::int AS count
      FROM group_funded_capacity_holds
      WHERE tenant_id = $1
        AND location_id = $2
        AND ($3::bigint IS NULL OR service_id = $3::bigint)
        AND hold_status = 'active'
        AND expires_at > NOW()
        AND scheduled_start_at < $5::timestamptz
        AND scheduled_end_at > $4::timestamptz
        AND ($6::bigint IS NULL OR campaign_id <> $6::bigint)
    `,
    [
      Number(tenantId),
      Number(options.locationId),
      options.serviceId ? Number(options.serviceId) : null,
      options.startsAt,
      options.endsAt,
      options.excludeCampaignId ? Number(options.excludeCampaignId) : null
    ]
  );
  return Number(result.rows[0]?.count || 0);
}

async function updateCapacityHold(data, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      UPDATE group_funded_capacity_holds
      SET
        hold_status = COALESCE($2, hold_status),
        expires_at = COALESCE($3, expires_at),
        released_at = COALESCE($4, released_at),
        converted_booking_id = COALESCE($5, converted_booking_id),
        updated_at = NOW()
      WHERE id = $1
      RETURNING ${CAPACITY_HOLD_COLUMNS}
    `,
    [
      Number(data.capacityHoldId),
      data.holdStatus || null,
      data.expiresAt || null,
      data.releasedAt || null,
      data.convertedBookingId ? Number(data.convertedBookingId) : null
    ]
  );
  return mapCapacityHold(result.rows[0]);
}

module.exports = {
  CAMPAIGN_STATUSES,
  PARTICIPANT_ROLES,
  CONTRIBUTION_STATUSES,
  REFUND_STATUSES,
  CAPACITY_HOLD_STATUSES,
  EVENT_TYPES,
  withTransaction,
  countOverlappingActiveCapacityHolds,
  createCampaign,
  createCampaignItem,
  createCapacityHold,
  createContribution,
  createParticipant,
  createRefund,
  findCampaignById,
  findCampaignByPublicToken,
  findActiveCapacityHoldByCampaign,
  findContributionByCampaignAndUser,
  findContributionById,
  findParticipantByCampaignAndUser,
  findRefundByContributionId,
  findRefundById,
  listCampaignsForVendor,
  listCampaignItemsByCampaign,
  listCampaignItemsByCampaignIds,
  listActiveCapacityHoldsByCampaign,
  getContributionReservationSummary,
  listVendorAlertEvents,
  listPublicCampaignsForVendorLocation,
  listCampaignsForUser,
  listCapacityHoldsByCampaign,
  listContributionsByCampaign,
  listRefundsByCampaign,
  mapCampaign,
  mapCapacityHold,
  mapCampaignItem,
  mapContribution,
  mapEvent,
  mapParticipant,
  mapRefund,
  recomputeCampaignFunding,
  shiftCampaignItemsScheduledSlot,
  updateCampaignDetails,
  updateCampaignReviewFields,
  updateCampaignStatus,
  updateCapacityHold,
  updateContribution,
  updateRefund,
  recordEvent
};
