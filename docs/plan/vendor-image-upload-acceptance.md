# Local image upload acceptance matrix

Carlo's 15 October requirement: every actual image upload must work end to end in the local preview, including resizing and notifications above dialogs. **No correction/upload PR before explicit new preview approval.** API owns guarded local filesystem storage; Queue owns canonical5007 runtime; vendor chat owns browser acceptance. No production credentials, external dispatch or fake upload success.

## Required evidence for each applicable flow

Actual Opera picker → fresh effective platform policy → prepared bytes within limit → successful actual API POST → persisted asset → separate entity Save where required → image render and persisted URL after reload. Also check valid-image passthrough, oversized static aspect/orientation/alpha as applicable, rejected input preserving prior image, and visible toast above the actual task overlay. Helper tests alone are not end-to-end acceptance.

| Flow / actual UI | Transport | Entity persistence | Current evidence / remaining work |
| --- | --- | --- | --- |
| Business company logo | vendor public-board-theme direct, assetType logo, no location | Save business profile | Pending local adapter + picker/POST/save/render/reload |
| Business cover/profile background | same direct, assetType background, no location | Save business profile | Pending |
| Location image | location-media direct, locationSlug | Save location | Pending |
| Location/board page background | public-board-theme direct background with location | Save theme | Pending |
| Location/board background image | same background flow, separate configured target | Save theme | Pending; retain target field and fit semantics |
| Location/board logo | public-board-theme direct logo with location | Save theme | Pending |
| Service image | service-media direct, locationSlug | Save service | Pending |
| Location payment QR | location-payment-qrs direct, locationSlug | Save location | Guarded adapter active. Carlo selected/uploaded/saved real QR; fresh Opera bootstrap + reopened editor rendered persisted440×330 asset,200912<=204800 bytes, Sample Test values retained. Original selected-file bytes and automated picker/POST capture still pending; do not mark complete. |
| Shared account avatar | account/profile/avatar | Upload updates user profile | Pending; actual shared customer account screen, vendor shell has no separate avatar picker |
| Booking payment proof (booking request) | account/bookings/:id/payment-proof/uploads/direct | Submit proof metadata/payment reference | Pending eligible synthetic booking + adapter |
| Booking payment proof (booking detail) | same direct route | Submit proof metadata/payment reference | Pending eligible synthetic booking + adapter; separate entry path |
| Contact form attachment | No upload transport: current ContactForm only sets local submitted flag | No persisted attachment exists | Existing implementation gap; do not count local selection or success copy as upload proof. Confirm separately before expanding contact-delivery behavior. |

All active upload API wrappers use shared `apiUpload`; no active presigned browser bypass found. URL-only image inputs are hosted references, not file uploads. QR downloads are exports, not uploads.

## Available limited evidence

Before adapter integration, real Opera canvas against live5007 policy204800 bytes prepared a2363413-byte1024×768 PNG into150703-byte243×182 PNG; valid transparent110-byte PNG was unchanged. Source processing independently bounded before decode; animation/format/abort/fitting failures covered. File-chooser extension API requires file URL permission not currently granted; no browser protection setting was changed. Native file chooser fallback remains to be exercised for actual picker acceptance. These facts do **not** satisfy POST/persist/render/reload rows above.

Actual demo context remains VD Sports Club / Demo Courts on127.0.0.1:5187 with guarded API5007; existing session/history/settings retained. Use a dedicated acceptance tab; do not navigate the user's active tab or reset the fixture.

## Processing verification update

After adding32MiB source and24MP header/decoded safety bounds, Opera prepared a2690394-byte1024×768 alpha PNG into145242-byte243×182 PNG under the current204800-byte policy; sampled alpha remained127. Evidence `image-bounded-alpha.png`. The attempted oriented-JPEG browser fixture did not reach a completed result before cleanup; `image-bounded-orientation.png` contains an intermediate Working state and is **not acceptance evidence**. EXIF orientation browser acceptance remains pending. Shared helper focused8 tests pass, full231 tests/typecheck/targeted lint/build passed before the final additional abort-during-read case. No image-flow matrix row is marked end-to-end complete.

AI created legitimate synthetic booking1/BKG-7F589BA4 for current LocalCourtAdmin, pending/unpaid/manual-payment required, with separate service3 and no fabricated proof; existing settings/services/active allocations preserved. This is fixture admission, not evidence of public booking/OTP behavior.

## Broken QR preview resolved

Actual asset `/api/local-image-assets/389ddfe0fea69b0b5e4211520540f50dd14f733470e8af39` was a valid200912-byte440×330 RGBA PNG and direct Opera image navigation decoded it. Embedding from127:5187 failed with natural0×0 for both127 and localhost API hostnames. API's guarded local-reader fix89088b24 removed sandbox CSP and changed CORP to cross-origin on that route only; fresh embedding then decoded both host variants440×330. This was not a failed image resize or storage write.

Original user had saved GCash/Sample Test before the inspection. A fresh independent Opera dashboard load and reopened editor showed the same saved URL, Sample Test account identifier and440×330 rendered QR. Evidence `actual-qr-preview-fixed-persisted.png` and `actual-qr-fresh-load-persisted.png`. No original unsaved values were discarded and no redundant upload/Save was performed by the vendor chat.

`PaymentQrImageField` now receives the actual processed Blob from shared upload preflight and previews its object URL before POST completes. On success it preloads the returned persistent image, switches only after successful decode and revokes object URLs on replacement/unmount. Failure preserves the previous URL; failed image rendering shows Retry preview instead of a broken-image icon. No object URL is saved to the entity. New frontend validation232 tests passed, types passed.

Actual native picker fallback reached Opera Easy Files → Show all files → macOS Open → exact `/tmp/vendor-oversize-image.png` selection. The final Open action was interrupted and the dedicated verification window disappeared; no successful request from that attempt was observed. This does not count as an automated end-to-end row. Browser file URL permission was not changed or bypassed. Remaining actual picker checks require a stable native verification window or a human file-selection handoff.

### 15 October 04:34 UTC continuation

The saved QR was additionally verified in the actual editor at375×800 in both dark and light themes, natural440×330 with263px rendered width and no lost Sample Test identifier. Evidence `actual-qr-persisted-dark-375.png` and `actual-qr-persisted-light-375.png`. Viewport overrides were cleared and original dark theme restored. Original user dialog was left intact; dedicated acceptance tab is retained for unfinished work. Full232 tests, TypeScript and focused lint passed after the QR component changes. Existing design-conformance release gate and every unverified picker/POST/entity-save row remain open.

### Under-limit source bounds follow-up (2026-10-15)

All JPEG/PNG/WebP sources now undergo header dimension validation before the unchanged-byte passthrough. A small compressed source can no longer evade the24MP safety bound merely by fitting the platform byte limit, preventing that source from reaching the QR object preview through shared upload preparation. Valid supported sources still return the exact original Blob without decoding/re-encoding/upscaling. Oversized-source animation handling remains unchanged. Tests use actual small PNG/WebP bytes for transport/CSRF fixtures and add under-limit100MP/malformed-header rejection. This closes the source-level review gap; it does not replace the outstanding complete native-picker upload matrix. No local ticket or Mobile fixture changes were made.
