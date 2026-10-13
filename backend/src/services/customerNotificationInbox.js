const crypto = require("node:crypto");
const db = require("../config/db");
const env = require("../config/env");
const PAGE_SIZE = 50;
const MAX_ID = 9223372036854775807n;
function invalid(message = "Invalid notification cursor or cutoff.") {
  return Object.assign(new Error(message), { statusCode: 400 });
}
function validId(value, allowZero = false) {
  return typeof value === "string" && /^(0|[1-9]\d{0,18})$/u.test(value)
    && BigInt(value) <= MAX_ID && (allowZero || value !== "0");
}

function createInbox({ transaction = db.withTransaction, pool = db.pool, secret = env.jwtSecret } = {}) {
  function encode(userId, max, last = null) {
    const data = Buffer.from(JSON.stringify({ v: 1, user: String(userId), max, last })).toString("base64url");
    const signature = crypto.createHmac("sha256", secret).update(`notification-inbox:${data}`).digest("base64url");
    return `${data}.${signature}`;
  }
  function decode(token, userId, cursor) {
    if (typeof token !== "string" || token.length > 1024) throw invalid();
    const parts = token.split(".");
    if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/u.test(parts[0])) throw invalid();
    const expected = crypto.createHmac("sha256", secret).update(`notification-inbox:${parts[0]}`).digest();
    const supplied = Buffer.from(parts[1], "base64url");
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) throw invalid();
    let value;
    try { value = JSON.parse(Buffer.from(parts[0], "base64url").toString()); } catch { throw invalid(); }
    if (value.v !== 1 || value.user !== String(userId) || !validId(value.max, true)
      || (cursor ? !validId(value.last) || BigInt(value.last) > BigInt(value.max) : value.last !== null)) throw invalid();
    return value;
  }
  // Serialize per account with deletion and other inbox writes. IDs allocated only
  // after this lock cannot enter an earlier snapshot, even across concurrent requests.
  async function lock(client, userId) {
    const { rows } = await client.query("SELECT id,deletion_requested_at FROM users WHERE id=$1 FOR UPDATE", [userId]);
    return rows[0] && !rows[0].deletion_requested_at;
  }
  async function counts(client, userId) {
    const { rows } = await client.query(`SELECT COUNT(*)::int AS total_count, COUNT(*) FILTER (WHERE read_at IS NULL)::int AS unread_count
      FROM customer_notification_inbox WHERE user_id=$1 AND cleared_at IS NULL
        AND created_at > clock_timestamp() - INTERVAL '90 days'`, [userId]);
    return {unreadCount:rows[0].unread_count,totalCount:rows[0].total_count};
  }
  async function record({ userId, notificationId, title, body, silent = false, occurredAt }) {
    if (silent || !userId) return null;
    if (typeof notificationId !== "string" || !notificationId.length || notificationId.length > 512
      || typeof title !== "string" || typeof body !== "string") throw invalid("Invalid notification content.");
    return transaction(async client => {
      if (!await lock(client, userId)) return null;
      const { rows } = await client.query(`INSERT INTO customer_notification_inbox(user_id,notification_key,title,body)
        SELECT $1,$2,$3,$4 FROM customer_notification_inbox_policy
        WHERE singleton=TRUE AND ($5::timestamptz IS NULL OR $5 >= started_at)
        ON CONFLICT(user_id,notification_key) DO NOTHING RETURNING id::text`,
      [userId, notificationId, title, body, occurredAt || null]);
      return rows[0]?.id || null;
    });
  }
  async function list(userId, cursor) {
    const previous = cursor === undefined ? null : decode(cursor, userId, true);
    return transaction(async client => {
      if (!await lock(client, userId)) throw Object.assign(new Error("Please sign in again."), { statusCode: 401 });
      const { rows: [boundary] } = await client.query(`SELECT COALESCE(MAX(id),0)::text AS max
        FROM customer_notification_inbox WHERE user_id=$1`, [userId]);
      const max = previous?.max || boundary.max;
      const { rows } = await client.query(`SELECT id::text,title,body,created_at,read_at FROM customer_notification_inbox
        WHERE user_id=$1 AND id <= $2 AND ($3::bigint IS NULL OR id < $3)
          AND cleared_at IS NULL AND created_at > clock_timestamp() - INTERVAL '90 days'
        ORDER BY customer_notification_inbox.id DESC LIMIT $4`, [userId, max, previous?.last || null, PAGE_SIZE + 1]);
      const page = rows.slice(0, PAGE_SIZE);
      return {
        notifications: page.map(row => ({ id: row.id, title: row.title, body: row.body,
          createdAt: row.created_at, readAt: row.read_at })),
        ...await counts(client, userId),
        nextCursor: rows.length > PAGE_SIZE ? encode(userId, max, page.at(-1).id) : null,
        snapshotCutoff: encode(userId, max)
      };
    });
  }
  async function mutate(userId, action, value) {
    const max = action === "read" ? value : decode(value, userId, false).max;
    if (!validId(max, action !== "read")) throw invalid("Invalid notification ID.");
    return transaction(async client => {
      if (!await lock(client, userId)) throw Object.assign(new Error("Please sign in again."), { statusCode: 401 });
      const set = action === "clear" ? "title=NULL,body=NULL,cleared_at=clock_timestamp()" : "read_at=COALESCE(read_at,clock_timestamp())";
      await client.query(`UPDATE customer_notification_inbox SET ${set}
        WHERE user_id=$1 AND id ${action === "read" ? "=" : "<="} $2
          AND cleared_at IS NULL AND created_at > clock_timestamp() - INTERVAL '90 days'`, [userId, max]);
      // Unknown/foreign IDs remain idempotent no-ops, revealing no foreign data.
      return { unreadCount: (await counts(client, userId)).unreadCount };
    });
  }
  async function pruneExpired() {
    const result = await pool.query(`DELETE FROM customer_notification_inbox WHERE id IN
      (SELECT id FROM customer_notification_inbox WHERE created_at <= clock_timestamp() - INTERVAL '90 days'
        ORDER BY created_at LIMIT 10000)`);
    return result.rowCount;
  }
  return { record, list, markRead: (user, id) => mutate(user, "read", id),
    markAllRead: (user, before) => mutate(user, "read-all", before),
    clear: (user, before) => mutate(user, "clear", before), pruneExpired };
}
module.exports = { createInbox, ...createInbox() };
