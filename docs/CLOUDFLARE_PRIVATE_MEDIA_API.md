# Cloudflare private media API

The Cloudflare Worker supports private media operations at `/api/admin/graphics`:

- `GET`: list metadata; pass `?id=<uuid>` to retrieve an image stream.
- `POST`: upload a PNG, JPEG or WebP using JSON `{ action: "upload", mimeType, imageData, altText }`.
- `DELETE`: delete by JSON `{ id }`; the object is snapshotted and restored if metadata deletion fails.

Required Worker secrets: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SERVICE_ROLE_KEY1`). Optional variable: `SUPABASE_MEDIA_BUCKET`, default `newsroom-private-media`.

Uploads are limited to 3 MB, validated against actual file signatures, written to private Supabase Storage and indexed in `media_assets` with `rights_status=pending_review`. Object upload is rolled back if metadata insertion fails. Reads are authenticated and use `private, no-store`; no public URL is created.

This Cloudflare slice intentionally does not port AI image generation yet. Generated graphics still require a separately reviewed provider integration and must be persisted privately before being exposed. No database migration, bucket creation, or deployment is performed by this PR.
