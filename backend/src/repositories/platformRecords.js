const db = require("../config/db");

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}

function integer(value, fallback, max) {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(String(value))) badRequest("Invalid pagination value.");
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > max) badRequest("Invalid pagination value.");
  return number;
}

async function listRecords(kind, options = {}, client = db.pool) {
  const page = integer(options.page, 1, 1000000);
  const limit = integer(options.limit, 25, 100);
  const values = [];
  const bind = (value) => { values.push(value); return `$${values.length}`; };
  const conditions = [];
  const search = typeof options.search === "string" ? options.search.trim().slice(0, 200) : "";
  let from, fields, searchFields;
  if (kind === "tenants") {
    from = `tenants records
      LEFT JOIN LATERAL (
        SELECT users.id AS user_id, users.username FROM tenant_memberships membership
        JOIN users ON users.id = membership.user_id
        WHERE membership.tenant_id = records.id AND membership.role = 'owner' AND membership.is_active = TRUE
        ORDER BY membership.id LIMIT 1
      ) owner_account ON TRUE
      LEFT JOIN LATERAL (
        SELECT plan_slug FROM tenant_subscriptions WHERE tenant_id = records.id
        ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'past_due' THEN 1 WHEN 'unpaid' THEN 2 ELSE 3 END,
        updated_at DESC, id DESC LIMIT 1
      ) subscription ON TRUE`;
    fields = `records.id::text, owner_account.user_id::text AS "userId", records.name, records.slug,
      owner_account.username, records.is_active AS "isActive", subscription.plan_slug AS "planSlug",
      (SELECT COUNT(*)::int FROM tickets WHERE tenant_id = records.id) AS "ticketCount",
      records.created_at AS "createdAt"`;
    searchFields = ["records.id::text", "owner_account.user_id::text", "records.name", "records.slug", "owner_account.username"];
    if (options.status) {
      if (!["active", "inactive"].includes(options.status)) badRequest("Invalid tenant status.");
      conditions.push(`records.is_active = ${bind(options.status === "active")}`);
    }
    if (options.plan) conditions.push(`subscription.plan_slug = ${bind(String(options.plan).slice(0, 80))}`);
  } else if (kind === "users") {
    from = "users records";
    fields = `records.id::text, records.name, records.username, records.email, records.roles, records.created_at AS "createdAt"`;
    searchFields = ["records.id::text", "records.name", "records.username", "records.email"];
    if (options.role) {
      if (!["customer", "platform_admin", "owner", "admin", "staff"].includes(options.role)) badRequest("Invalid user role.");
      const role = bind(options.role);
      conditions.push(`(${role} = ANY(records.roles) OR EXISTS (SELECT 1 FROM tenant_memberships membership
        WHERE membership.user_id = records.id AND membership.is_active = TRUE AND membership.role = ${role}))`);
    }
  } else if (kind === "audit") {
    from = "security_audit_events records LEFT JOIN users ON users.id = records.actor_user_id";
    fields = `records.id::text, records.occurred_at, records.action_key, records.outcome, records.resource_type,
      records.resource_id, records.reason, records.tenant_id::text, records.actor_user_id::text, users.email AS actor_email`;
    searchFields = ["records.id::text", "records.action_key", "records.resource_type", "records.resource_id", "records.reason", "users.email", "records.actor_user_id::text"];
    if (options.outcome) {
      if (!["success", "failed", "denied", "conflict", "pending"].includes(options.outcome)) badRequest("Invalid audit outcome.");
      conditions.push(`records.outcome = ${bind(options.outcome)}`);
    }
    if (options.tenantId) {
      if (!/^\d{1,18}$/.test(String(options.tenantId))) badRequest("Invalid tenant ID.");
      conditions.push(`records.tenant_id = ${bind(options.tenantId)}`);
    }
    for (const [key, operator] of [["from", ">="], ["to", "<"]]) {
      if (!options[key]) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(options[key])) || !Number.isFinite(Date.parse(options[key]))) badRequest("Invalid audit date.");
      if (new Date(options[key]).toISOString().slice(0, 10) !== options[key]) badRequest("Invalid audit date.");
      conditions.push(`records.occurred_at ${operator} ${bind(`${options[key]}T00:00:00Z`)}::timestamptz${key === "to" ? " + INTERVAL '1 day'" : ""}`);
    }
    if (options.from && options.to && options.from > options.to) badRequest("Start date must be before the end date.");
    // A browsing snapshot prevents new events from shifting older pages.
    if (options.snapshot) {
      if (!/^\d{1,18}$/.test(String(options.snapshot))) badRequest("Invalid audit snapshot.");
      conditions.push(`records.id <= ${bind(options.snapshot)}`);
    }
  } else {
    badRequest("Unknown record type.");
  }
  if (search) {
    const term = bind(`%${search.replace(/[\\%_]/g, "\\$&")}%`);
    conditions.push(`(${searchFields.map((field) => `${field} ILIKE ${term}`).join(" OR ")})`);
  }
  const result = await client.query(`SELECT ${fields} FROM ${from}
    ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
    ORDER BY records.id DESC LIMIT ${bind(limit + 1)} OFFSET ${bind((page - 1) * limit)}`, values);
  const items = result.rows.slice(0, limit);
  return { items, pagination: { page, limit, hasNext: result.rows.length > limit,
    snapshot: kind === "audit" ? String(options.snapshot || items[0]?.id || "0") : undefined } };
}

module.exports = { listRecords };
