// Independently enabled local image storage. Production B2 and demo adapters keep
// their own policies. Public assets and signed private receipts never share a read path.
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { assertImageUploadSize } = require('./imageUploadPolicy');
const { readAuthorizedVendorQueueActor } = require('./vendorQueueTransactionService');
const MIME = new Map([['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/webp', 'webp']]);
const PUBLIC_PERMISSIONS = new Map([
  ['theme-logo', 'tenant.theme.manage'], ['theme-background', 'tenant.theme.manage'],
  ['location', 'tenant.location.manage'], ['service', 'tenant.service.manage'],
  ['payment-qr', 'tenant.location.manage']
]);
const validId = value => /^[1-9]\d*$/.test(String(value || ''));
const validSlug = value => typeof value === 'string' && value.length <= 160 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const unavailable = () => Object.assign(new Error('Local image storage is unavailable.'), { statusCode: 503, code: 'IMAGE_UPLOAD_UNAVAILABLE' });
const notFound = () => Object.assign(new Error('Image is unavailable.'), { statusCode: 404 });
const forbidden = () => Object.assign(new Error('You cannot upload or access this image.'), { statusCode: 403, code: 'NOT_AUTHORIZED' });
function configuration(source = process.env) {
  if (source.LOCAL_APPLICATION_IMAGE_STORAGE_ENABLED !== '1' || !['development', 'test'].includes(source.NODE_ENV)) return null;
  try {
    const database = new URL(source.DATABASE_URL);
    const databaseName = decodeURIComponent(database.pathname.slice(1));
    const origin = new URL(source.LOCAL_APPLICATION_IMAGE_PUBLIC_ORIGIN);
    const local = new Set(['127.0.0.1', 'localhost', '[::1]']);
    if (!['postgres:', 'postgresql:'].includes(database.protocol) || !local.has(database.hostname) || database.search || database.hash
      || !/^getprio_local_pool_demo(?:_[a-z0-9_]+)?$/.test(databaseName) || source.LOCAL_APPLICATION_IMAGE_DATABASE !== databaseName
      || origin.protocol !== 'http:' || !local.has(origin.hostname) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) return null;
    const storageRoot = source.LOCAL_APPLICATION_IMAGE_ROOT || '';
    if (storageRoot && (!path.isAbsolute(storageRoot) || path.resolve(storageRoot) !== storageRoot || storageRoot === path.parse(storageRoot).root)) return null;
    return { databaseName, origin: origin.origin, storageRoot };
  } catch { return null; }
}
function matchesSignature(bytes, type) {
  return type === 'image/png' ? bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : type === 'image/jpeg' ? bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : type === 'image/webp' && bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}
function createStorage({ pool, source = () => process.env, directory = os.tmpdir(), assertSize = assertImageUploadSize, authorize = readAuthorizedVendorQueueActor, now = Date.now }) {
  const signingKey = crypto.randomBytes(32);
  let writes = Promise.resolve();
  const configured = () => { const c = configuration(source()); if (!c) throw unavailable(); return c; };
  const root = c => c.storageRoot || path.join(directory, `getprio-local-application-images-${hash(c.databaseName)}`);
  async function privateRoot(dir, create = false) {
    if (create) await fs.mkdir(dir, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const stat = await fs.lstat(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.mode & 0o077 || (process.getuid && stat.uid !== process.getuid())) throw unavailable();
  }
  async function readFile(file, max) {
    const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.mode & 0o077 || stat.size > max || (process.getuid && stat.uid !== process.getuid())) throw notFound();
      return await handle.readFile();
    } finally { await handle.close(); }
  }
  async function scoped(c, callback, existingClient) {
    const client = existingClient || await pool.connect();
    try {
      if (!existingClient) await client.query('BEGIN READ ONLY');
      const identity = (await client.query('SELECT current_database() AS database_name, host(inet_server_addr()) AS server_address')).rows[0];
      if (!identity || identity.database_name !== c.databaseName || !['127.0.0.1', '::1'].includes(identity.server_address)) throw unavailable();
      const result = await callback(client);
      if (!existingClient) await client.query('COMMIT');
      return result;
    } catch (error) {
      if (!existingClient) await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { if (!existingClient) client.release(); }
  }
  async function activeUser(client, id) {
    if (!validId(id)) throw forbidden();
    const rows = (await client.query('SELECT id FROM users WHERE id=$1 AND deletion_requested_at IS NULL AND platform_access_suspended_at IS NULL', [String(id)])).rows;
    if (rows.length !== 1) throw forbidden();
  }
  async function tenantScope(client, metadata) {
    if (!validId(metadata.tenantId) || (await client.query('SELECT id FROM tenants WHERE id=$1', [metadata.tenantId])).rows.length !== 1) throw forbidden();
    if (metadata.locationId && (await client.query('SELECT id FROM store_locations WHERE tenant_id=$1 AND id=$2', [metadata.tenantId, metadata.locationId])).rows.length !== 1) throw forbidden();
  }
  async function bookingScope(client, metadata, reader, upload = false) {
    await tenantScope(client, metadata);
    if (!validId(metadata.bookingId) || !validId(metadata.ownerUserId)) throw forbidden();
    const booking = (await client.query(`SELECT id,tenant_id,location_id,customer_user_id,payment_proof_object_key,status,checked_in_at,queue_ticket_id,group_funded_booking_id,booking_payment_source
      FROM bookings WHERE id=$1 AND tenant_id=$2 AND location_id=$3 AND customer_user_id=$4`,
    [metadata.bookingId, metadata.tenantId, metadata.locationId, metadata.ownerUserId])).rows[0];
    if (!booking) throw forbidden();
    await activeUser(client, reader.userId);
    if (reader.kind === 'customer') { if (String(reader.userId) !== metadata.ownerUserId) throw forbidden(); }
    else if (reader.kind === 'vendor') {
      if (!await authorize(client, { tenantId: metadata.tenantId, locationId: metadata.locationId, actorUserId: String(reader.userId) }, 'tenant.booking.manage')) throw forbidden();
    } else throw forbidden();
    if (upload && (reader.kind !== 'customer' || !['pending', 'confirmed', 'rescheduled'].includes(booking.status) || booking.checked_in_at || booking.queue_ticket_id || booking.group_funded_booking_id || booking.booking_payment_source === 'group_funded' || booking.payment_proof_object_key)) throw forbidden();
    if (!upload && booking.payment_proof_object_key !== metadata.objectKey) throw forbidden();
    return booking;
  }
  async function authorizeUpload(client, input, metadata) {
    await activeUser(client, input.actorUserId);
    if (metadata.purpose === 'avatar') {
      if (String(input.actorUserId) !== metadata.ownerUserId) throw forbidden();
      return;
    }
    if (metadata.purpose === 'booking-proof') return bookingScope(client, metadata, { kind: 'customer', userId: input.actorUserId }, true);
    if (!PUBLIC_PERMISSIONS.has(metadata.purpose)) throw forbidden();
    await tenantScope(client, metadata);
    if (metadata.requestedLocationSlug) {
      if (!validSlug(metadata.requestedLocationSlug)) throw forbidden();
      const rows = (await client.query('SELECT id FROM store_locations WHERE tenant_id=$1 AND slug=$2', [metadata.tenantId, metadata.requestedLocationSlug])).rows;
      if (rows.length > 1 || (metadata.locationId && String(rows[0]?.id) !== metadata.locationId)) throw forbidden();
      // A new branch image/QR can precede its location. Its tenant/actor stay authoritative.
      if (!metadata.locationId && rows.length) metadata.locationId = String(rows[0].id);
    }
    if (!await authorize(client, { tenantId: metadata.tenantId, locationId: metadata.locationId, actorUserId: String(input.actorUserId) }, PUBLIC_PERMISSIONS.get(metadata.purpose))) throw forbidden();
  }
  async function store(input, existingClient) {
    if (source().LOCAL_APPLICATION_IMAGE_STORAGE_ENABLED !== '1') return null;
    const c = configured(), bytes = input.body, type = input.contentType;
    if (!Buffer.isBuffer(bytes) || !MIME.has(type) || !matchesSignature(bytes, type)) throw Object.assign(new Error('Image content does not match its JPEG, PNG, or WebP format.'), { statusCode: 400 });
    await assertSize(bytes.length);
    const booking = input.booking;
    const purpose = input.purpose;
    const id = purpose === 'booking-proof' ? hash(input.objectKey || '').slice(0, 48) : crypto.randomBytes(24).toString('hex');
    const metadata = { id, databaseName:c.databaseName, purpose, visibility: purpose === 'booking-proof' ? 'private' : 'public',
      tenantId: String(booking?.tenantId || input.tenant?._id || ''), locationId: booking?.locationId ? String(booking.locationId) : input.location?._id ? String(input.location._id) : null,
      requestedLocationSlug: input.location?.slug || null, ownerUserId: String(booking?.customerUserId || input.user?._id || ''), bookingId: booking?._id ? String(booking._id) : null,
      objectKey: input.objectKey || `local-application-images/${id}`, contentType: type, sizeBytes: bytes.length, digest: hash(bytes) };
    if (purpose === 'booking-proof' && !new RegExp(`^payment-proofs/tenants/${metadata.tenantId}/bookings/${metadata.bookingId}/[a-zA-Z0-9.-]+$`).test(metadata.objectKey)) throw forbidden();
    const perform = async () => {
      const created = [];
      try {
        return await scoped(c, async client => {
          await authorizeUpload(client, input, metadata);
          const dir = root(c); await privateRoot(dir, true);
          const files = await fs.readdir(dir, { withFileTypes: true });
          if (files.length + 2 > 256) throw unavailable();
          let total = 0;
          for (const file of files) { const stat = await fs.lstat(path.join(dir, file.name)); if (!stat.isFile() || stat.isSymbolicLink()) throw unavailable(); total += stat.size; }
          const encoded = Buffer.from(JSON.stringify(metadata));
          if (total + bytes.length + encoded.length > 64 * 1024 * 1024) throw unavailable();
          const image = path.join(dir, `${id}.image`), meta = path.join(dir, `${id}.json`);
          async function writeNew(file, content) {
            const handle = await fs.open(file, 'wx', 0o600); created.push(file);
            try { await handle.writeFile(content); } finally { await handle.close(); }
          }
          await writeNew(image, bytes);
          await writeNew(meta, encoded);
          const asset = { objectKey: metadata.objectKey, contentType: type, sizeBytes: bytes.length };
          if (metadata.visibility === 'public') asset.publicUrl = `${c.origin}/api/local-image-assets/application/${id}`;
          // Trusted service-only cleanup; never serialized into upload responses.
          Object.defineProperty(asset, 'cleanup', { value: async () => { await Promise.all(created.map(file => fs.unlink(file).catch(() => {}))); } });
          return asset;
        }, existingClient);
      } catch (error) { await Promise.all(created.map(file => fs.unlink(file).catch(() => {}))); throw error; }
    };
    const result = writes.then(perform); writes = result.catch(() => {}); return result;
  }
  async function metadataFor(c, id) {
    if (!/^[a-f0-9]{48}$/.test(id)) throw notFound();
    const dir = root(c); await privateRoot(dir);
    const metadata = JSON.parse((await readFile(path.join(dir, `${id}.json`), 8192)).toString());
    if (metadata.id !== id || metadata.databaseName !== c.databaseName || !MIME.has(metadata.contentType) || !Number.isInteger(metadata.sizeBytes) || metadata.sizeBytes < 1 || metadata.sizeBytes > 8 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(metadata.digest)) throw notFound();
    await assertSize(metadata.sizeBytes); return metadata;
  }
  async function imageFor(c, metadata) {
    const body = await readFile(path.join(root(c), `${metadata.id}.image`), 8 * 1024 * 1024);
    if (body.length !== metadata.sizeBytes || hash(body) !== metadata.digest || !matchesSignature(body, metadata.contentType)) throw notFound();
    return { body, contentType: metadata.contentType, extension: MIME.get(metadata.contentType) };
  }
  async function readPublic(id) {
    try {
      const c = configured();
      return await scoped(c, async client => {
        const metadata = await metadataFor(c, id);
        if (metadata.visibility !== 'public') throw notFound();
        if (metadata.purpose === 'avatar') await activeUser(client, metadata.ownerUserId);
        else if (PUBLIC_PERMISSIONS.has(metadata.purpose)) await tenantScope(client, metadata);
        else throw notFound();
        return imageFor(c, metadata);
      });
    } catch { throw notFound(); }
  }
  const sign = (id, expires, reader) => crypto.createHmac('sha256', signingKey).update(`${id}:${expires}:${reader.kind}:${reader.userId}`).digest('hex');
  async function proofAccess({ booking, actorUserId, readerKind }) {
    if (source().LOCAL_APPLICATION_IMAGE_STORAGE_ENABLED !== '1') return null;
    const c = configured(), id = hash(booking.paymentProofObjectKey || '').slice(0, 48);
    return scoped(c, async client => {
      let metadata;
      try { metadata = await metadataFor(c, id); } catch (error) { if (error.code === 'ENOENT') return null; throw notFound(); }
      if (metadata.visibility !== 'private' || metadata.purpose !== 'booking-proof' || metadata.objectKey !== booking.paymentProofObjectKey || metadata.bookingId !== String(booking._id)) throw notFound();
      const reader = { kind: readerKind, userId: String(actorUserId || '') };
      await bookingScope(client, metadata, reader); await imageFor(c, metadata);
      const expires = now() + 300000;
      return `${c.origin}/api/local-image-assets/application-private/${id}?expires=${expires}&readerKind=${reader.kind}&readerId=${reader.userId}&signature=${sign(id, expires, reader)}`;
    });
  }
  async function readPrivate(id, access) {
    try {
      const c = configured(), expires = Number(access.expires), reader = { kind: access.readerKind, userId: String(access.readerId || '') }, signature = String(access.signature || '');
      if (!/^[a-f0-9]{48}$/.test(id) || !Number.isSafeInteger(expires) || expires <= now() || expires > now() + 300000 || !/^[a-f0-9]{64}$/.test(signature)
        || !crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(id, expires, reader), 'hex'))) throw notFound();
      return await scoped(c, async client => {
        const metadata = await metadataFor(c, id);
        if (metadata.visibility !== 'private' || metadata.purpose !== 'booking-proof') throw notFound();
        await bookingScope(client, metadata, reader); return imageFor(c, metadata);
      });
    } catch { throw notFound(); }
  }
  return { store, readPublic, proofAccess, readPrivate };
}
let instance;
const storage = () => instance ||= createStorage({ pool: require('../config/db').pool });
module.exports = { configuration, createStorage, storeApplicationImage: (input, client) => storage().store(input, client), readApplicationImage: id => storage().readPublic(id), applicationProofAccess: input => storage().proofAccess(input), readApplicationProof: (id, access) => storage().readPrivate(id, access) };
