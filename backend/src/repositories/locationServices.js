const db = require("../config/db");

const LOCATION_SERVICE_COLUMNS = `
  id,
  tenant_id,
  location_id,
  service_id,
  capacity,
  is_active,
  sort_order,
  price_amount_cents,
  price_display,
  group_funded_enabled,
  group_funded_min_required_contributors,
  group_funded_max_required_contributors,
  group_funded_default_required_contributors,
  group_funded_min_contribution_amount_cents,
  group_funded_max_contribution_amount_cents,
  group_funded_min_deadline_hours,
  group_funded_max_deadline_days,
  group_funded_allow_public_campaigns,
  created_at,
  updated_at
`;

function buildQueryClient(client) {
  return client || db.pool;
}

function mapLocationService(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    id: String(row.id),
    tenantId: String(row.tenant_id),
    locationId: String(row.location_id),
    serviceId: String(row.service_id),
    capacity: Number(row.capacity || 1),
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order || 0),
    priceAmountCents: row.price_amount_cents === null || row.price_amount_cents === undefined ? null : Number(row.price_amount_cents),
    priceDisplay: row.price_display || null,
    groupFunded: {
      enabled: Boolean(row.group_funded_enabled),
      minRequiredContributors: row.group_funded_min_required_contributors === null || row.group_funded_min_required_contributors === undefined ? null : Number(row.group_funded_min_required_contributors),
      maxRequiredContributors: row.group_funded_max_required_contributors === null || row.group_funded_max_required_contributors === undefined ? null : Number(row.group_funded_max_required_contributors),
      defaultRequiredContributors: row.group_funded_default_required_contributors === null || row.group_funded_default_required_contributors === undefined ? null : Number(row.group_funded_default_required_contributors),
      minContributionAmountCents: row.group_funded_min_contribution_amount_cents === null || row.group_funded_min_contribution_amount_cents === undefined ? null : Number(row.group_funded_min_contribution_amount_cents),
      maxContributionAmountCents: row.group_funded_max_contribution_amount_cents === null || row.group_funded_max_contribution_amount_cents === undefined ? null : Number(row.group_funded_max_contribution_amount_cents),
      minDeadlineHours: row.group_funded_min_deadline_hours === null || row.group_funded_min_deadline_hours === undefined ? null : Number(row.group_funded_min_deadline_hours),
      maxDeadlineDays: row.group_funded_max_deadline_days === null || row.group_funded_max_deadline_days === undefined ? null : Number(row.group_funded_max_deadline_days),
      allowPublicCampaigns: Boolean(row.group_funded_allow_public_campaigns)
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function listLocationServicesByTenantId(tenantId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT ${LOCATION_SERVICE_COLUMNS}
      FROM location_services
      WHERE tenant_id = $1
      ORDER BY location_id ASC, sort_order ASC, id ASC
    `,
    [Number(tenantId)]
  );
  return result.rows.map(mapLocationService);
}

async function listLocationServicesByLocationId(tenantId, locationId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT ${LOCATION_SERVICE_COLUMNS}
      FROM location_services
      WHERE tenant_id = $1 AND location_id = $2
      ORDER BY sort_order ASC, id ASC
    `,
    [Number(tenantId), Number(locationId)]
  );
  return result.rows.map(mapLocationService);
}

async function findLocationServiceByLocationAndServiceId(tenantId, locationId, serviceId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT ${LOCATION_SERVICE_COLUMNS}
      FROM location_services
      WHERE tenant_id = $1 AND location_id = $2 AND service_id = $3
      LIMIT 1
    `,
    [Number(tenantId), Number(locationId), Number(serviceId)]
  );
  return mapLocationService(result.rows[0]);
}

async function upsertLocationService(data, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      INSERT INTO location_services (
        tenant_id,
        location_id,
        service_id,
        capacity,
        is_active,
        sort_order,
        price_amount_cents,
        price_display,
        group_funded_enabled,
        group_funded_min_required_contributors,
        group_funded_max_required_contributors,
        group_funded_default_required_contributors,
        group_funded_min_contribution_amount_cents,
        group_funded_max_contribution_amount_cents,
        group_funded_min_deadline_hours,
        group_funded_max_deadline_days,
        group_funded_allow_public_campaigns
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (location_id, service_id)
      DO UPDATE SET
        capacity = EXCLUDED.capacity,
        is_active = EXCLUDED.is_active,
        sort_order = EXCLUDED.sort_order,
        price_amount_cents = EXCLUDED.price_amount_cents,
        price_display = EXCLUDED.price_display,
        group_funded_enabled = EXCLUDED.group_funded_enabled,
        group_funded_min_required_contributors = EXCLUDED.group_funded_min_required_contributors,
        group_funded_max_required_contributors = EXCLUDED.group_funded_max_required_contributors,
        group_funded_default_required_contributors = EXCLUDED.group_funded_default_required_contributors,
        group_funded_min_contribution_amount_cents = EXCLUDED.group_funded_min_contribution_amount_cents,
        group_funded_max_contribution_amount_cents = EXCLUDED.group_funded_max_contribution_amount_cents,
        group_funded_min_deadline_hours = EXCLUDED.group_funded_min_deadline_hours,
        group_funded_max_deadline_days = EXCLUDED.group_funded_max_deadline_days,
        group_funded_allow_public_campaigns = EXCLUDED.group_funded_allow_public_campaigns,
        updated_at = NOW()
      RETURNING ${LOCATION_SERVICE_COLUMNS}
    `,
    [
      Number(data.tenantId),
      Number(data.locationId),
      Number(data.serviceId),
      Number(data.capacity || 1),
      data.isActive !== false,
      Number(data.sortOrder || 0),
      data.priceAmountCents === undefined ? null : data.priceAmountCents,
      data.priceDisplay === undefined ? null : data.priceDisplay,
      Boolean(data.groupFunded?.enabled),
      data.groupFunded?.minRequiredContributors ?? null,
      data.groupFunded?.maxRequiredContributors ?? null,
      data.groupFunded?.defaultRequiredContributors ?? null,
      data.groupFunded?.minContributionAmountCents ?? null,
      data.groupFunded?.maxContributionAmountCents ?? null,
      data.groupFunded?.minDeadlineHours ?? null,
      data.groupFunded?.maxDeadlineDays ?? null,
      Boolean(data.groupFunded?.allowPublicCampaigns)
    ]
  );
  return mapLocationService(result.rows[0]);
}

module.exports = {
  mapLocationService,
  listLocationServicesByTenantId,
  listLocationServicesByLocationId,
  findLocationServiceByLocationAndServiceId,
  upsertLocationService
};
