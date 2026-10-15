const fs = require("node:fs/promises");
const { constants } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  randomBytes,
  createHash,
  createHmac,
  timingSafeEqual,
} = require("node:crypto");
const {
  localPoolDemoConfiguration,
  readLocalPoolDemoScope,
} = require("./localPoolDemoScope");
const { assertImageUploadSize } = require("./imageUploadPolicy");
const MIME = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);
function unavailable() {
  throw Object.assign(
    new Error("Local image storage is unavailable for this location."),
    { statusCode: 503, code: "IMAGE_UPLOAD_UNAVAILABLE" },
  );
}
function notFound() {
  throw Object.assign(new Error("Image not found."), { statusCode: 404 });
}
function localImageStorageEnabled() {
  return (
    process.env.LOCAL_IMAGE_STORAGE_ENABLED === "1" &&
    Boolean(localPoolDemoConfiguration())
  );
}
function rootFor(databaseName) {
  return path.join(
    os.tmpdir(),
    `getprio-local-images-${createHash("sha256").update(databaseName).digest("hex")}`,
  );
}
function publicBase() {
  try {
    const url = new URL(process.env.SERVER_URL);
    if (
      url.protocol !== "http:" ||
      !(
        ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
        /^[a-z0-9-]+\.localhost$/u.test(url.hostname)
      ) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !["", "/"].includes(url.pathname)
    )
      unavailable();
    return url.origin;
  } catch {
    unavailable();
  }
}
function matchesSignature(bytes, type) {
  if (type === "image/png")
    return (
      bytes.length >= 8 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    );
  if (type === "image/jpeg")
    return (
      bytes.length >= 3 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255
    );
  return (
    type === "image/webp" &&
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  );
}
async function privateRoot(root, { create = false } = {}) {
  if (create) await fs.mkdir(root, { mode: 0o700 });
  const stat = await fs.lstat(root);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    (process.getuid && stat.uid !== process.getuid()) ||
    (stat.mode & 0o077) !== 0
  )
    unavailable();
}
async function readPrivateFile(file, maxBytes) {
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes) notFound();
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}
function createLocalImageStorage({ pool, assertSize = assertImageUploadSize }) {
  // Ephemeral capabilities are issued only after normal booking authorization.
  // Restarting this disposable runtime revokes all outstanding proof URLs.
  const accessKey = randomBytes(32);
  function signature(id, expires) {
    return createHmac("sha256", accessKey)
      .update(`${id}:${expires}`)
      .digest("hex");
  }
  function validAccess(id, access) {
    const expires = String(access?.expires || "");
    const supplied = String(access?.signature || "");
    return (
      /^\d{13}$/u.test(expires) &&
      Number(expires) > Date.now() &&
      Number(expires) <= Date.now() + 300000 &&
      /^[a-f0-9]{64}$/u.test(supplied) &&
      timingSafeEqual(
        Buffer.from(supplied, "hex"),
        Buffer.from(signature(id, expires), "hex"),
      )
    );
  }
  async function resolveScope(client, { tenant, location, user, booking }) {
    let rows;
    if (booking) {
      rows = (
        await client.query(
          `SELECT tenant_id::text, location_id::text FROM bookings
        WHERE id=$1 AND tenant_id=$2 AND location_id=$3 AND customer_user_id=$4`,
          [
            booking._id,
            booking.tenantId,
            booking.locationId,
            booking.customerUserId,
          ],
        )
      ).rows;
    } else if (user) {
      rows = (
        await client.query(
          `SELECT s.tenant_id::text,s.location_id::text FROM public.local_pool_demo_scopes s
        JOIN users u ON u.id=$1 AND u.deletion_requested_at IS NULL AND u.platform_access_suspended_at IS NULL
        WHERE s.fixture_key='four-court-v1' AND (
          EXISTS (SELECT 1 FROM tenant_memberships m WHERE m.tenant_id=s.tenant_id AND m.user_id=u.id AND m.is_active=TRUE)
          OR EXISTS (SELECT 1 FROM bookings b WHERE b.tenant_id=s.tenant_id AND b.location_id=s.location_id AND b.customer_user_id=u.id))`,
          [user._id],
        )
      ).rows;
    } else {
      rows = (
        await client.query(
          `SELECT l.tenant_id::text,l.id::text AS location_id FROM store_locations l
        JOIN public.local_pool_demo_scopes s ON s.tenant_id=l.tenant_id AND s.location_id=l.id AND s.fixture_key='four-court-v1'
        WHERE l.tenant_id=$1 AND ($2::text IS NULL OR l.slug=$2) AND ($3::bigint IS NULL OR l.id=$3)`,
          [tenant?._id, location?.slug || null, location?._id || null],
        )
      ).rows;
    }
    if (rows.length !== 1) unavailable();
    const scope = {
      tenantId: rows[0].tenant_id,
      locationId: rows[0].location_id,
    };
    if (!(await readLocalPoolDemoScope(client, scope))) unavailable();
    return scope;
  }
  let writes = Promise.resolve();
  async function scoped(callback) {
    if (!localImageStorageEnabled()) return null;
    const client = await pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      const result = await callback(client, localPoolDemoConfiguration());
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async function storeUnchecked({
    tenant,
    location,
    user,
    booking,
    objectKey,
    contentType,
    body,
  }) {
    if (!localImageStorageEnabled()) return null;
    if (
      !Buffer.isBuffer(body) ||
      !MIME.has(contentType) ||
      !matchesSignature(body, contentType)
    )
      throw Object.assign(
        new Error(
          "Image content does not match the selected JPEG, PNG, or WebP format.",
        ),
        { statusCode: 400 },
      );
    await assertSize(body.length);
    return scoped(async (client, configuration) => {
      const scope = await resolveScope(client, {
        tenant,
        location,
        user,
        booking,
      });
      const root = rootFor(configuration.databaseName),
        base = publicBase();
      const perform = async () => {
        try {
          await privateRoot(root);
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
          try {
            await privateRoot(root, { create: true });
          } catch (next) {
            if (next.code !== "EEXIST") throw next;
            await privateRoot(root);
          }
        }
        const files = await fs.readdir(root, { withFileTypes: true });
        if (files.length >= 256) unavailable();
        let total = 0;
        for (const entry of files) {
          if (entry.isSymbolicLink() || !entry.isFile()) unavailable();
          total += (await fs.lstat(path.join(root, entry.name))).size;
        }
        if (total + body.length > 64 * 1024 * 1024) unavailable();
        const id = objectKey
            ? createHash("sha256").update(objectKey).digest("hex").slice(0, 48)
            : randomBytes(24).toString("hex"),
          image = path.join(root, `${id}.image`),
          meta = path.join(root, `${id}.json`);
        const metadata = {
          id,
          ...scope,
          visibility: booking ? "private" : "public",
          actorUserId: user ? String(user._id) : null,
          bookingId: booking ? String(booking._id) : null,
          objectKey: objectKey || `local-images/${id}`,
          contentType,
          sizeBytes: body.length,
          digest: createHash("sha256").update(body).digest("hex"),
        };
        await fs.writeFile(image, body, { mode: 0o600, flag: "wx" });
        try {
          await fs.writeFile(meta, JSON.stringify(metadata), {
            mode: 0o600,
            flag: "wx",
          });
        } catch (error) {
          await fs.unlink(image);
          throw error;
        }
        return {
          objectKey: metadata.objectKey,
          publicUrl: booking ? null : `${base}/api/local-image-assets/${id}`,
          contentType,
          sizeBytes: body.length,
        };
      };
      const result = writes.then(perform);
      writes = result.catch(() => {});
      return result;
    });
  }
  async function store(input) {
    try {
      return await storeUnchecked(input);
    } catch (error) {
      if (error.statusCode === 400 || error.statusCode === 403) throw error;
      unavailable();
    }
  }
  async function read(id, access) {
    if (!/^[a-f0-9]{48}$/u.test(id)) notFound();
    if (!localImageStorageEnabled()) notFound();
    try {
      return await scoped(async (client, configuration) => {
        const root = rootFor(configuration.databaseName);
        await privateRoot(root);
        const metadata = JSON.parse(
          (await readPrivateFile(path.join(root, `${id}.json`), 4096)).toString(
            "utf8",
          ),
        );
        if (
          metadata.id !== id ||
          !MIME.has(metadata.contentType) ||
          !Number.isInteger(metadata.sizeBytes) ||
          metadata.sizeBytes < 1 ||
          metadata.sizeBytes > 8 * 1024 * 1024 ||
          !/^\d+$/u.test(metadata.tenantId) ||
          !/^\d+$/u.test(metadata.locationId) ||
          !(await readLocalPoolDemoScope(client, metadata))
        )
          notFound();
        if (
          metadata.visibility !== "public" &&
          metadata.visibility !== "private"
        )
          notFound();
        if (metadata.visibility === "private") {
          if (!validAccess(id, access)) notFound();
          const row = (
            await client.query(
              `SELECT payment_proof_object_key FROM bookings WHERE id=$1
            AND tenant_id=$2 AND location_id=$3`,
              [metadata.bookingId, metadata.tenantId, metadata.locationId],
            )
          ).rows[0];
          if (!row || row.payment_proof_object_key !== metadata.objectKey)
            notFound();
        } else if (access) notFound();
        if (metadata.actorUserId) {
          const scope = await resolveScope(client, {
            user: { _id: metadata.actorUserId },
          });
          if (
            scope.tenantId !== metadata.tenantId ||
            scope.locationId !== metadata.locationId
          )
            notFound();
        }
        const body = await readPrivateFile(
          path.join(root, `${id}.image`),
          8 * 1024 * 1024,
        );
        if (
          body.length !== metadata.sizeBytes ||
          createHash("sha256").update(body).digest("hex") !== metadata.digest ||
          !matchesSignature(body, metadata.contentType)
        )
          notFound();
        return {
          body,
          contentType: metadata.contentType,
          extension: MIME.get(metadata.contentType),
        };
      });
    } catch {
      notFound();
    }
  }
  async function proofAccess(booking) {
    if (!localImageStorageEnabled()) return null;
    const objectKey = booking.paymentProofObjectKey;
    if (!objectKey) notFound();
    const id = createHash("sha256")
      .update(objectKey)
      .digest("hex")
      .slice(0, 48);
    const expires = String(Date.now() + 300000);
    const access = { expires, signature: signature(id, expires) };
    // Verify persisted booking association, bytes and marker before issuing access.
    await read(id, access);
    return `${publicBase()}/api/local-image-assets/private/${id}?expires=${expires}&signature=${access.signature}`;
  }
  return { store, read, proofAccess };
}
let instance;
function defaultStorage() {
  instance ||= createLocalImageStorage({ pool: require("../config/db").pool });
  return instance;
}
module.exports = {
  localImageStorageEnabled,
  createLocalImageStorage,
  rootFor,
  storeLocalPaymentQr: (input) => defaultStorage().store(input),
  storeLocalImage: (input) => defaultStorage().store(input),
  readLocalImage: (id, access) => defaultStorage().read(id, access),
  localProofAccess: (booking) => defaultStorage().proofAccess(booking),
};
