CREATE TABLE IF NOT EXISTS public_board_assets (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT REFERENCES store_locations(id) ON DELETE SET NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('background', 'logo')),
  object_key TEXT NOT NULL,
  public_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public_board_themes (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT REFERENCES store_locations(id) ON DELETE CASCADE,
  theme JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_public_board_assets_tenant_created
  ON public_board_assets (tenant_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_public_board_themes_tenant_default
  ON public_board_themes (tenant_id)
  WHERE location_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_public_board_themes_location
  ON public_board_themes (location_id)
  WHERE location_id IS NOT NULL;

CREATE OR REPLACE TRIGGER set_public_board_themes_updated_at
BEFORE UPDATE ON public_board_themes
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
