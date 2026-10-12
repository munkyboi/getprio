const crypto = require("node:crypto");
const db = require("../config/db");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAIRING_CODE = /^[0-9a-f]{32}$/i;
const hash = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
function unavailable() {
  return Object.assign(new Error("Queue board or pairing request unavailable."), { statusCode: 404 });
}
function displayGrant(row) {
  return { id: row.id, displayName: row.display_name, createdAt: row.created_at,
    lastSeenAt: row.last_seen_at, expiresAt: row.expires_at, revokedAt: row.revoked_at };
}
async function findBoard(boardId, client = db.pool) {
  if (!UUID.test(String(boardId))) throw unavailable();
  const { rows } = await client.query(`SELECT l.id, l.tenant_id, l.name, l.slug,
    l.queue_board_id, l.queue_board_public, t.slug AS tenant_slug
    FROM store_locations l JOIN tenants t ON t.id=l.tenant_id
    WHERE l.queue_board_id=$1 AND l.is_active AND t.is_active`, [boardId]);
  if (!rows[0]) throw unavailable();
  return rows[0];
}
async function canRead(board, browserSecret, client = db.pool) {
  if (board.queue_board_public) return true;
  if (!browserSecret || !/^[a-f0-9]{64}$/.test(browserSecret)) return false;
  const { rows } = await client.query(`UPDATE queue_board_display_grants SET last_seen_at=now()
    WHERE location_id=$1 AND board_id=$2 AND secret_hash=$3
    AND revoked_at IS NULL AND expires_at>now() RETURNING id`,
  [board.id, board.queue_board_id, hash(browserSecret)]);
  return rows.length > 0;
}
async function requestPairing(board, secret) {
  const code = crypto.randomBytes(16).toString("hex");
  const matchCode = String(crypto.randomInt(100000, 1000000));
  return db.withTransaction(async (client) => {
    const current = await findBoard(board.queue_board_id, client);
    // Lock the location before creating/approving requests or rotating its URL.
    await client.query("SELECT id FROM store_locations WHERE id=$1 FOR UPDATE", [current.id]);
    await client.query("DELETE FROM queue_board_pairing_requests WHERE expires_at<now()");
    await client.query(`DELETE FROM queue_board_pairing_requests WHERE board_id=$1 AND browser_hash=$2 AND approved_at IS NULL`, [board.queue_board_id, hash(secret)]);
    const { rows } = await client.query(`INSERT INTO queue_board_pairing_requests
      (location_id,board_id,code_hash,browser_hash,match_code) VALUES($1,$2,$3,$4,$5)
      RETURNING expires_at`, [board.id, board.queue_board_id, hash(code), hash(secret), matchCode]);
    return { code, matchCode, expiresAt: rows[0].expires_at };
  });
}
async function pairingForLocation(locationId, code, client = db.pool, lock = false) {
  if (!PAIRING_CODE.test(String(code))) throw unavailable();
  const { rows } = await client.query(`SELECT r.* FROM queue_board_pairing_requests r
    JOIN store_locations l ON l.id=r.location_id AND l.queue_board_id=r.board_id
    WHERE r.location_id=$1 AND r.code_hash=$2 AND r.expires_at>now() AND r.approved_at IS NULL
    ${lock ? "FOR UPDATE OF r" : ""}`, [locationId, hash(code.toLowerCase())]);
  if (!rows[0]) throw unavailable();
  return rows[0];
}
async function approve(locationId, code, name, userId) {
  const displayName = String(name || "").trim();
  if (!displayName || displayName.length>80) throw Object.assign(new Error("Enter a display name of 1–80 characters."), { statusCode: 400 });
  return db.withTransaction(async (client) => {
    await client.query("SELECT id FROM store_locations WHERE id=$1 FOR UPDATE", [locationId]);
    const request = await pairingForLocation(locationId, code, client, true);
    const { rows } = await client.query(`INSERT INTO queue_board_display_grants
      (location_id,board_id,secret_hash,display_name,approved_by,expires_at)
      VALUES($1,$2,$3,$4,$5,now()+interval '30 days')
      ON CONFLICT(board_id,secret_hash) DO UPDATE SET display_name=EXCLUDED.display_name,
      approved_by=EXCLUDED.approved_by,expires_at=EXCLUDED.expires_at,revoked_at=NULL RETURNING *`,
    [locationId, request.board_id, request.browser_hash, displayName, userId]);
    await client.query("UPDATE queue_board_pairing_requests SET approved_at=now(),approved_by=$2 WHERE id=$1", [request.id, userId]);
    return displayGrant(rows[0]);
  });
}
async function settings(locationId) {
  const { rows } = await db.pool.query("SELECT queue_board_id,queue_board_public FROM store_locations WHERE id=$1", [locationId]);
  if (!rows[0]) throw unavailable();
  const grants = await db.pool.query("SELECT * FROM queue_board_display_grants WHERE location_id=$1 AND board_id=$2 ORDER BY created_at DESC", [locationId, rows[0].queue_board_id]);
  return { boardId: rows[0].queue_board_id, isPublic: rows[0].queue_board_public, displays: grants.rows.map(displayGrant) };
}
async function updateSettings(locationId, isPublic, rotate) {
  if (isPublic !== undefined && typeof isPublic !== "boolean") throw Object.assign(new Error("isPublic must be a boolean."), { statusCode: 400 });
  await db.withTransaction(async (client) => {
    await client.query("SELECT id FROM store_locations WHERE id=$1 FOR UPDATE", [locationId]);
    await client.query(`UPDATE store_locations SET queue_board_public=COALESCE($2,queue_board_public),
      queue_board_id=CASE WHEN $3 THEN gen_random_uuid() ELSE queue_board_id END WHERE id=$1`, [locationId, isPublic ?? null, rotate === true]);
    if (rotate === true) {
      await client.query("UPDATE queue_board_display_grants SET revoked_at=now() WHERE location_id=$1 AND revoked_at IS NULL", [locationId]);
      await client.query("DELETE FROM queue_board_pairing_requests WHERE location_id=$1", [locationId]);
    }
  });
  return settings(locationId);
}
async function changeGrant(locationId, id, renew) {
  if (!UUID.test(String(id))) throw unavailable();
  const { rows } = await db.pool.query(`UPDATE queue_board_display_grants g
    SET ${renew ? "expires_at=now()+interval '30 days'" : "revoked_at=now()"}
    FROM store_locations l WHERE g.id=$1 AND g.location_id=$2 AND l.id=g.location_id
    AND g.board_id=l.queue_board_id AND g.revoked_at IS NULL RETURNING g.id`, [id, locationId]);
  if (!rows.length) throw unavailable();
}
module.exports = { UUID, hash, findBoard, canRead, requestPairing, pairingForLocation, approve, settings, updateSettings, changeGrant };
