const db = require("../config/db");

async function consume({ bucketKey, limit, windowSeconds, blockedMessage }, options = {}) {
  const run = async (client) => {
    await client.query(
      `INSERT INTO security_rate_limit_buckets (bucket_key,window_started_at,hit_count) VALUES ($1,NOW(),0)
       ON CONFLICT (bucket_key) DO NOTHING`, [bucketKey]
    );
    const result = await client.query(`SELECT * FROM security_rate_limit_buckets WHERE bucket_key=$1 FOR UPDATE`, [bucketKey]);
    const bucket = result.rows[0];
    const now = Date.now();
    if (bucket.blocked_until && new Date(bucket.blocked_until).getTime() > now) {
      const error = new Error(blockedMessage);
      error.statusCode = 429; error.code = "RATE_LIMITED";
      error.retryAfterSeconds = Math.ceil((new Date(bucket.blocked_until).getTime() - now) / 1000);
      throw error;
    }
    const windowStart = new Date(bucket.window_started_at);
    if (now - windowStart.getTime() >= windowSeconds * 1000) {
      await client.query(`UPDATE security_rate_limit_buckets SET window_started_at=NOW(),hit_count=1,blocked_until=NULL,updated_at=NOW() WHERE bucket_key=$1`, [bucketKey]);
      return { allowed: true, remaining: limit - 1 };
    }
    if (Number(bucket.hit_count) >= limit) {
      const blockedUntil = new Date(windowStart.getTime() + windowSeconds * 1000);
      await client.query(`UPDATE security_rate_limit_buckets SET blocked_until=$2,updated_at=NOW() WHERE bucket_key=$1`, [bucketKey, blockedUntil]);
      const error = new Error(blockedMessage);
      error.statusCode = 429; error.code = "RATE_LIMITED";
      error.retryAfterSeconds = Math.max(1, Math.ceil((blockedUntil.getTime() - now) / 1000));
      throw error;
    }
    await client.query(`UPDATE security_rate_limit_buckets SET hit_count=hit_count+1,updated_at=NOW() WHERE bucket_key=$1`, [bucketKey]);
    return { allowed: true, remaining: limit - Number(bucket.hit_count) - 1 };
  };
  if (options.client) return run(options.client);
  return db.withTransaction(run);
}

module.exports = { consume };
