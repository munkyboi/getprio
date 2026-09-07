const db = require("../config/db");
const securityAudit = require("../services/securityAuditService");
const { assertPublicTextFieldsAllowed } = require("../services/contentModeration");
function fail(message, statusCode = 400) { const error = new Error(message); error.statusCode = statusCode; throw error; }
function map(row) { return { id: String(row.id), name: row.name, isActive: row.is_active, sortOrder: row.sort_order, revision: row.revision, vendorCount: Number(row.vendor_count || 0) }; }
async function list(admin = false, client = db.pool) {
  const { rows } = await client.query(`SELECT c.*${admin ? ", (SELECT COUNT(*) FROM tenants t WHERE t.business_category_id=c.id) AS vendor_count" : ""}
    FROM business_categories c ${admin ? "" : "WHERE c.is_active=TRUE"} ORDER BY c.sort_order, c.name, c.id`);
  return rows.map(map);
}
async function resolve({ id, label, currentId, currentLabel }, client = db.pool) {
  if (id === undefined && label === undefined) return null;
  if (label !== undefined && typeof label !== "string") fail("Choose a valid business category.");
  if (id !== undefined && id !== null && (typeof id !== "string" && typeof id !== "number")) fail("Choose a valid business category.");
  if (!id && !String(label || "").trim() && !currentId && !currentLabel) return null;
  if (id && !/^\d{1,18}$/.test(String(id))) fail("Choose a valid business category.");
  const { rows } = await client.query(`SELECT c.* FROM business_categories c
    ${id ? "WHERE c.id=$1" : "JOIN business_category_aliases a ON a.category_id=c.id WHERE a.label_key=LOWER(BTRIM($1))"}`,
  [id || String(label || "").trim()]);
  const category = rows[0];
  if (!category || (!category.is_active && String(category.id) !== String(currentId))) fail("Choose an active business category.");
  return map(category);
}
async function save(id, input, actor, transaction = db.withTransaction) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 80) fail("Category name must contain 1–80 characters.");
  if (typeof input.isActive !== "boolean" || !Number.isInteger(input.sortOrder) || input.sortOrder < 0 || input.sortOrder > 10000) fail("Choose a valid status and display order (0–10000).");
  if (id && (!/^\d{1,18}$/.test(id) || !Number.isInteger(input.revision))) fail("Invalid category revision.");
  assertPublicTextFieldsAllowed({ "Business category": name });
  return transaction(async (client) => {
    // Serializes catalog edits, including claims on former names.
    await client.query("SELECT pg_advisory_xact_lock(715032)");
    const before = id ? (await client.query("SELECT * FROM business_categories WHERE id=$1 FOR UPDATE", [id])).rows[0] : null;
    if (id && !before) fail("Category not found.", 404);
    if (before && before.revision !== input.revision) fail("This category changed. Refresh the list before editing again.", 409);
    const alias = (await client.query("SELECT category_id FROM business_category_aliases WHERE label_key=LOWER(BTRIM($1))", [name])).rows[0];
    if (alias && String(alias.category_id) !== String(id)) fail("That name is already used or reserved by another category.", 409);
    const { rows } = before
      ? await client.query("UPDATE business_categories SET name=$2,is_active=$3,sort_order=$4,revision=revision+1,updated_at=NOW() WHERE id=$1 RETURNING *", [id,name,input.isActive,input.sortOrder])
      : await client.query("INSERT INTO business_categories(name,is_active,sort_order) VALUES ($1,$2,$3) RETURNING *", [name,input.isActive,input.sortOrder]);
    const category = rows[0];
    await client.query("INSERT INTO business_category_aliases(label_key,category_id) VALUES (LOWER(BTRIM($1)),$2) ON CONFLICT DO NOTHING", [name,category.id]);
    if (before && before.name !== name) await client.query("UPDATE tenants SET public_profile_category=$2 WHERE business_category_id=$1", [category.id,name]);
    await securityAudit.record({ ...actor, action: before ? "business_category.update" : "business_category.create", resourceType: "business_category", resourceId: String(category.id), outcome: "success", reason: before ? "Platform category maintenance" : "Platform category creation", beforeState: before ? map(before) : null, afterState: map(category) }, { client });
    return map(category);
  });
}
module.exports = { list, resolve, save };
