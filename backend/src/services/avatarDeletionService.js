const { S3Client, ListObjectVersionsCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

// Enumerate before deleting so removals cannot invalidate a pagination cursor.
async function listVersions(storage, bucket, prefix) {
  const versions = [];
  const cursors = new Set();
  let cursor = {};
  for (let page = 0; page < 100; page += 1) {
    const result = await storage.send(new ListObjectVersionsCommand({
      Bucket: bucket, Prefix: prefix, MaxKeys: 1000, ...cursor
    }));
    for (const item of [...(result.Versions || []), ...(result.DeleteMarkers || [])]) {
      if (typeof item.Key !== 'string' || !item.Key.startsWith(prefix) ||
          typeof item.VersionId !== 'string' || !item.VersionId.length) {
        throw new Error('Invalid avatar version listing; cleanup stopped.');
      }
      versions.push({ Key: item.Key, VersionId: item.VersionId });
    }
    if (!result.IsTruncated) return versions;
    if (!result.NextKeyMarker || !result.NextVersionIdMarker) {
      throw new Error('Incomplete avatar pagination cursor; cleanup stopped.');
    }
    cursor = { KeyMarker: result.NextKeyMarker, VersionIdMarker: result.NextVersionIdMarker };
    const identity = JSON.stringify(cursor);
    if (cursors.has(identity)) throw new Error('Repeated avatar pagination cursor; cleanup stopped.');
    cursors.add(identity);
  }
  throw new Error('Avatar listing exceeds cleanup limit; operator review required.');
}

function createAvatarDeletionService({ transaction, storage, bucket }) {
  return async function cleanupAvatars({ requestId, apply = false }) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId || '')) {
      throw new Error('A deletion request UUID is required.');
    }
    if (!bucket) throw new Error('Avatar storage is not configured.');
    return transaction(async (client) => {
      // Same user-row lock as acceptance and upload. Never take a caller-supplied object prefix.
      const { rows: [request] } = await client.query(`SELECT u.id, u.deletion_requested_at, r.status
        FROM account_deletion_requests r JOIN users u ON u.id=r.user_id
        WHERE r.id=$1 FOR UPDATE OF u`, [requestId]);
      if (!request || !request.deletion_requested_at || request.status === 'completed' ||
          !/^[1-9][0-9]*$/.test(String(request.id))) {
        throw new Error('An incomplete deletion request for a deletion-disabled account is required.');
      }
      const prefix = `user-avatars/users/${request.id}/`;
      const versions = await listVersions(storage, bucket, prefix);
      if (!apply) return { mode: 'preview', versions: versions.length };
      for (const version of versions) {
        // Always specify VersionId: an unversioned delete can create only a delete marker.
        await storage.send(new DeleteObjectCommand({ Bucket: bucket, ...version }));
      }
      if ((await listVersions(storage, bucket, prefix)).length) {
        throw new Error('Avatar versions remain; retry cleanup before recording evidence.');
      }
      // This is origin-only verification. Never attest the broader storage/cache task here.
      return { mode: 'apply', deletedVersions: versions.length, originEmpty: true, taskAttested: false };
    });
  };
}

async function cleanupAvatars(options) {
  const env = require('../config/env');
  const db = require('../config/db');
  if (!env.b2S3Endpoint || !env.b2Region || !env.b2KeyId || !env.b2ApplicationKey) {
    throw new Error('Avatar storage is not configured.');
  }
  const endpoint = /^https?:\/\//i.test(env.b2S3Endpoint) ? env.b2S3Endpoint : `https://${env.b2S3Endpoint}`;
  const storage = new S3Client({
    endpoint, region: env.b2Region, forcePathStyle: true,
    credentials: { accessKeyId: env.b2KeyId, secretAccessKey: env.b2ApplicationKey }
  });
  try {
    return await createAvatarDeletionService({transaction: db.withTransaction, storage, bucket: env.b2BucketPublicBoard})(options);
  } finally { storage.destroy(); }
}

module.exports = { createAvatarDeletionService, cleanupAvatars };
