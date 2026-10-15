# Platform image upload policy

## Existing authority

The global `platform_settings.max_image_upload_kb` setting is the single image-file byte limit. The settings DTO field is `maxImageUploadKb`: an integer from 1 through 8192, with a 200 KB fallback when absent or invalid. One KB means 1024 bytes. No tenant override is defined by this setting.

Platform settings updates retain the existing capability check, audit reason, transaction and `expectedSettings` conflict check. This work does not update a production setting or change that authorization contract.

Clients discover the effective policy with `GET /api/public/upload-policy`, returning `{ maxImageUploadKb, maxImageUploadBytes }` with `Cache-Control: no-store`. The repository queries the setting for each read. The internal server helper uses `maxImageBytes`; that is not a new public response field.

## Delivery boundaries

- Platform owns the policy editor and truthful fixture presentation. Neither Platform dashboard currently exposes a binary image upload control.
- Vendor owns the web shared resize/compression path and upload call-site coverage. Before upload, oversized supported images must be resized/compressed to the fetched byte limit, preserving aspect ratio and endpoint-specific format/dimension requirements. An image that cannot safely fit must produce a clear error without uploading it.
- API owns authoritative byte enforcement, MIME/pixel validation and endpoint coverage. Client preparation does not authorize bypassing server validation. A policy change between discovery and upload may still cause rejection.
- Mobile integration belongs to its owner and must use the same effective policy, not an independently chosen byte limit.
- Existing images and PDF-specific limits remain unchanged.

## Evidence and remaining acceptance

Platform source regression checks cover the fixture default, units/scope copy and existing settings audit/concurrency boundary. These checks do not prove automatic resizing, real image decoding, HTTP upload enforcement, mobile behavior or production settings interaction. Those boundaries require the respective owner tests and acceptance evidence. No end-to-end completion or deployment is claimed by this document.
