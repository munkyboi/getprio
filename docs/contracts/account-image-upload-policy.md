# Account image upload policy

Authenticated accounts can read the current effective platform image limit from `GET /api/account/image-upload-policy` or `GET /api/v1/account/image-upload-policy`. Both aliases use the normal account authentication middleware and return `Cache-Control: no-store`.

```json
{ "maxImageBytes": 204800 }
```

`maxImageBytes` is an integer byte count, calculated from the same effective `max_image_upload_kb` platform setting used by profile photo and payment receipt image upload validation: `getImageUploadLimitKb() * 1024`. The permitted setting is 1–8192 KB. Missing or invalid stored values use the existing 200 KB default (204800 bytes). A settings read failure returns an error, not a successful response with a guessed limit. Other platform settings are not exposed.

Clients should fetch this policy immediately before preparing each selected image, compress to at most the returned byte count, and offer retry when policy retrieval fails. The upload endpoint still checks the current policy against the actual uploaded bytes. If an administrator lowers the setting between policy retrieval and upload, the upload can reject with `IMAGE_UPLOAD_SIZE_EXCEEDED`; refetch the policy before retrying preparation. This endpoint describes image size only; allowed file types, proof authorization, and PDF limits retain their existing upload rules.
