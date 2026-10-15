# Disposable local image upload storage

This adapter supports actual picker/upload/save/render/reload acceptance without enabling B2. It is not a production storage backend. Queue owns launcher opt-in and runtime restart; Vendor owns real browser acceptance. No PR until Carlo approves the corrected preview.

Enable only through the guarded launcher with `LOCAL_IMAGE_STORAGE_ENABLED=1`, existing `LOCAL_POOL_DEMO_ENABLED=1`, development/test mode, literal loopback PostgreSQL URL, correctly named disposable database, actual database/server identity, and exact `four-court-v1` tenant/location marker. The HTTP asset reader additionally requires a direct loopback socket. Invalid scope fails closed; it never falls through to a provider while the local adapter is enabled.

| Existing direct flow | Local storage and normal persistence |
| --- | --- |
| Tenant business logo/cover; branch board logo/background | Public image; normal public-board asset row; existing theme Save persists returned URL. A tenant-default upload requires exactly one marked branch to establish storage scope, without changing the asset row's tenant-default location semantics. |
| Location/service images | Public image; normal asset row and entity Save. Exact existing marked location or unique marked tenant scope. |
| Payment QR | Public image; exact marked existing location; existing location Save persists URL. No provider download path is added. |
| Account avatar | Public avatar bound to actor ID; current nondeleted/nonsuspended user must have an active fixture membership or own a real fixture booking. Existing deletion lock and user avatar update remain. Reads recheck association/account state. |
| Ordinary booking proof | Private image with original booking object-key prefix; existing customer ownership/payment validation precedes upload; existing proof submit persists metadata. Normal authenticated customer/vendor access endpoint issues a five-minute HMAC capability only after checking actual saved booking association. Anonymous public reader always rejects private images. Restart revokes capabilities. |

Only current active direct/binary browser flows use the adapter. Legacy presigned PUT exports keep their real provider implementation and report sanitized unavailable errors with blank provider configuration; no fabricated signed URL is returned. Retired group-funded/PDF flows are not reactivated.

Every stored image passes the current global actual-byte policy and JPEG/PNG/WebP content signature validation. Storage is a server-derived temporary directory named by database hash, mode0700, immutable random/hash-ID files mode0600, no-follow reads, SHA256 integrity checks, at most256 directory entries and64MiB total. No express.static mount, arbitrary path, inherited root override, external network or provider activation. Unexpected upload errors are sanitized; reads return generic404. Asset responses are no-store/nosniff with restrictive CSP.

Automated acceptance covers real isolated PostgreSQL identity/markers, real filesystem bytes/modes, adapter restart persistence, disabled/production/wrong DB/location/marker denial, invalid content/byte bounds, actor/customer boundaries, private persisted proof association, capability expiry/tampering/restart, loopback HTTP public/private reads, symlink/tamper rejection and sanitized failures. These checks do not replace Vendor's actual Opera picker, Save, render and reload acceptance for every flow.
