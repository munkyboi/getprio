# Platform-controlled image byte limit and pre-upload preparation

Carlo requires clients to resize/compress supported images before upload to fit the effective Platform byte limit. The server remains authoritative. This work does not change production settings, credentials, providers or existing accepted image formats/signature checks.

## Existing authoritative policy

Global `platform_settings.max_image_upload_kb` applies to image uploads across customer, vendor and mobile surfaces; no tenant override. Platform settings GET/PATCH DTO uses `maxImageUploadKb`. Valid whole-number setting1–8192, with the existing server-only fallback200 when storage is missing/invalid. Legacy “KB/Kb” means1024bytes:200=>204800,8192=>8388608. Setting lookup failures remain errors, never an invented client limit.

- Public `GET /api/public/upload-policy`, also `/api/v1/public/upload-policy`: `{maxImageUploadKb,maxImageUploadBytes}`.
- Authenticated `GET /api/account/image-upload-policy`, also `/api/v1/account/image-upload-policy`: `{maxImageBytes}`.
- Both represent the same effective policy; public/account discovery and enforcement share `imageUploadPolicy.js`. Responses and errors are no-store. Client types are [shared/imageUploadPolicy.ts](../../shared/imageUploadPolicy.ts).
- Platform settings changes retain existing `platform.settings.manage`, audit reason and optimistic expectedSettings controls. This feature changes no policy value.

Fetch current policy for each upload attempt. Validate a positive integer byte limit, then prepare the image and check the actual encoded output length before requesting a signed URL or sending binary bytes. Do not copy fallback200 into browser/mobile code. Raw parser8MiB and independent source-pixel/decode limits are processing bounds, not client-side policy defaults.

## Server inventory and enforcement

| Active surface | Route under `/api` (same v1 aliases) | Authoritative storage boundary |
| --- | --- | --- |
| Customer/mobile avatar | POST `/account/profile/avatar` | userAvatarUploadService actual buffer length; existing JPEG/PNG/WebP signature check |
| Customer/mobile booking payment proof | POST `/account/bookings/:id/payment-proof/uploads/direct` | paymentProofStorageService actual buffer length |
| Vendor location/profile/gallery media | POST `/vendor/tenant/:slug/location-media/uploads/direct` | vendorMediaUploadService actual buffer length |
| Vendor service images | POST `/vendor/tenant/:slug/service-media/uploads/direct` | vendorMediaUploadService actual buffer length |
| Vendor board logo/background | POST `/vendor/tenant/:slug/public-board-theme/uploads/direct` | publicBoardThemeUploadService actual buffer length |
| Vendor payment QR | POST `/vendor/tenant/:slug/location-payment-qrs/uploads/direct`, or `/locations/:locationSlug/payment-qr/uploads/direct` | locationPaymentQrUploadService actual buffer length |

All active binary paths already enforce `assertImageUploadSize` before storage using actual bytes, not caller metadata. Legacy signed vendor media/theme/proof upload services also reject oversized metadata and sign ContentLength. Actual SDK signing tests verify content-length is bound; no external storage/provider roundtrip is claimed. The8MiB raw body ceiling matches the maximum possible policy value, while the effective lower limit is checked by the service. Existing MIME/auth/ownership/entitlement checks remain intact.

Proof submission/asset attachment metadata is not a new upload or permission to rewrite older stored files. The policy is enforced at upload/signing boundaries; historical attachments are not retroactively resized. Retired group-funded PDF code keeps its separate8MiB PDF ceiling and is not reintroduced as product scope. API oversized-image error remains400 `IMAGE_UPLOAD_SIZE_EXCEEDED`. Storage/provider configuration failures are separate from compression errors.

## Client owners and acceptance

Vendor owns shared browser `apiUpload` preprocessing and inventory of its wrappers, customer avatar and proof flows. All currently active browser image wrappers pass through this common upload function. Supported files already within the limit preserve their bytes. Oversized supported static files use bounded decode/encode/downscale work, preserve aspect and supported format semantics, and fail clearly when unsupported or impossible to fit. Cancellation must abort before upload. New encoded MIME/filename/size must agree wherever signing/metadata is used. Do not claim identical visual quality after compression.

Mobile owns shared `compressed_image.dart`/`image_upload_policy.dart` and both avatar/proof repositories. Its8MiB/24MP input bounds remain independent; supported still-image, orientation, alpha conversion and aspect behavior remain documented. Require the fetched policy explicitly and validate final encoded bytes. Device acceptance is Zero32-only under the existing user constraint.

Platform owns settings copy/default fixture consistency; no Platform image-file control was found in the current dashboard. API owns discovery compatibility, server enforcement tests and this contract. Queue owns the existing5007 local demo runtime; preserve its history and effective provider/network blockade.

Local byte preparation can be tested using the real read-only policy and browser/mobile decoding plus local request adapters. The current5007 fixture has no storage provider configured; do not add fake credentials, activate a provider or remove outbound guards for acceptance. Prepared-file preview and no-network service tests do not establish external upload/persistence. Real provider/device acceptance remains explicit until authorized and exercised.

## Validation

Focused tests exercise all binary service paths with actual buffer byte counts, three signed paths and real AWS signed headers, dynamic limit changes, exact boundary acceptance/one-byte-over rejection, policy failure, avatar signature/deleting-user behavior and authenticated policy guards. New PostgreSQL/public HTTP tests verify both anonymous aliases, existing account DTO equivalence, live setting changes,1/200/300/8192units, missing/invalid fallback and uncached read failures. All setting mutations occur only in isolated local test schemas.
