BEGIN;

ALTER TABLE public_board_assets
  DROP CONSTRAINT IF EXISTS public_board_assets_asset_type_check;

ALTER TABLE public_board_assets
  ADD CONSTRAINT public_board_assets_asset_type_check
  CHECK (asset_type IN ('background', 'logo', 'location', 'service'));

COMMIT;
