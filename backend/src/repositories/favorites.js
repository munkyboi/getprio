const db = require("../config/db");
async function list(userId) {
  const { rows } = await db.pool.query(`SELECT t.slug, COALESCE(NULLIF(t.public_profile_display_name, ''), t.name) AS name,
    t.public_profile_category AS category, theme.theme->>'logoUrl' AS "logoUrl"
    FROM customer_favorites f JOIN tenants t ON t.id = f.tenant_id
    LEFT JOIN public_board_themes theme ON theme.tenant_id = t.id AND theme.location_id IS NULL
    WHERE f.customer_user_id = $1 ORDER BY f.created_at DESC, f.tenant_id DESC`, [Number(userId)]);
  return rows;
}
async function add(userId, slug) {
  const { rows } = await db.pool.query(`INSERT INTO customer_favorites (customer_user_id, tenant_id)
    SELECT $1, id FROM tenants WHERE slug = $2 AND is_active = TRUE AND public_profile_enabled = TRUE AND vendor_approval_status = 'approved'
    ON CONFLICT (customer_user_id, tenant_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id RETURNING tenant_id`, [Number(userId), slug]);
  return rows[0] || null;
}
async function remove(userId, slug) {
  await db.pool.query(`DELETE FROM customer_favorites f USING tenants t WHERE f.tenant_id = t.id AND f.customer_user_id = $1 AND t.slug = $2`, [Number(userId), slug]);
}
module.exports = { list, add, remove };
