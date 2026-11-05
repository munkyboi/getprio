# Image upload size limit

Platform administrators with `platform.settings.manage` can change **Settings → General → Maximum image upload size (KB)**. The default is **200 KB (204,800 bytes)**; allowed values are whole numbers from 1 to 8192 KB. Saving takes effect for subsequent upload requests without restarting the API.

The setting covers avatars, vendor location/service media, public-board logos/backgrounds, payment QR images, campaign report screenshots, and payment/contribution/reimbursement proof images. Oversized uploads are rejected with the configured limit in the error message. Images are not automatically compressed. Existing stored images are unchanged; PDF evidence retains its existing 8 MB limit.

`platform_settings.max_image_upload_kb` stores the value and the editor's user ID. An absent or invalid stored value uses 200 KB. A database read failure stops the upload. The public `GET /api/public/upload-policy` response exposes only the image limit and is not cached; administrative settings remain permission-protected.

Binary upload services check actual received bytes before writing to storage. Legacy presigned uploads bind the approved content length into the signature; already issued URLs retain their original authorization until their existing five-minute expiry. Request-body parsers retain an 8 MB safety ceiling.

For deployment, apply `database/migrations/20260914_add_image_upload_limit.sql` and release the API before the frontend/dashboard. The migration is repeatable and does not overwrite a saved limit. No production migration or deployment was performed during this implementation.

## Local verification

- Backend: 524 passed, 4 skipped, using a disposable PostgreSQL database for the concurrency test.
- Frontend: 158 passed. Platform dashboard: 10 passed.
- Upload tests cover the exact default boundary, one byte over, updated settings, spoofed metadata, storage failure prevention, all seven binary paths, signed content length, and the unchanged PDF ceiling.
- Migration checked on disposable PostgreSQL: inserts 200 and preserves a configured 512 on rerun.
- Dashboard checked against a local API fixture at 390, 768, and 1440 pixels wide: saved value survives reload, empty input prevents saving, failures remain visible and can be retried, 44-pixel input target, no horizontal overflow. This is local UI evidence, not a live B2 upload or production deployment check.
