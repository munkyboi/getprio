const db = require("../config/db");

const DEFAULT_PUBLIC_BOARD_THEME = {
  presetId: "classic",
  heroTitle: "",
  heroSubtitle: "",
  logoUrl: "",
  backgroundImageUrl: "",
  pageBackgroundColor: "#f8efe3",
  cardBackgroundColor: "#fffaf4",
  cardAlpha: 0.9,
  cardBorderSize: 1,
  cardBorderRadius: 28,
  cardBorderColor: "#eadccf",
  headerColor: "#24160f",
  subheaderColor: "#8a5c39",
  bodyColor: "#3f3027",
  buttonBackgroundColor: "#ea6a1f",
  buttonTextColor: "#ffffff",
  buttonBorderColor: "#ea6a1f"
};

const THEME_COLUMNS = `
  id,
  tenant_id,
  location_id,
  theme,
  updated_by_user_id,
  created_at,
  updated_at
`;

const ASSET_COLUMNS = `
  id,
  tenant_id,
  location_id,
  asset_type,
  object_key,
  public_url,
  file_name,
  content_type,
  size_bytes,
  created_by_user_id,
  created_at
`;

function buildQueryClient(client) {
  return client || db.pool;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, number));
}

function normalizeColor(value, fallback) {
  const text = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(text)) {
    return text;
  }

  return fallback;
}

function normalizeText(value, fallback, maxLength) {
  return String(value ?? fallback ?? "").trim().slice(0, maxLength);
}

function normalizeUrl(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  try {
    const url = new URL(text);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    return "";
  }

  return "";
}

function normalizePresetId(value) {
  return ["classic", "neura", "clinic"].includes(value) ? value : "classic";
}

function normalizeTheme(input = {}, fallback = DEFAULT_PUBLIC_BOARD_THEME) {
  return {
    presetId: normalizePresetId(input.presetId || fallback.presetId),
    heroTitle: normalizeText(input.heroTitle, fallback.heroTitle, 80),
    heroSubtitle: normalizeText(input.heroSubtitle, fallback.heroSubtitle, 220),
    logoUrl: normalizeUrl(input.logoUrl || fallback.logoUrl),
    backgroundImageUrl: normalizeUrl(input.backgroundImageUrl || fallback.backgroundImageUrl),
    pageBackgroundColor: normalizeColor(input.pageBackgroundColor, fallback.pageBackgroundColor),
    cardBackgroundColor: normalizeColor(input.cardBackgroundColor, fallback.cardBackgroundColor),
    cardAlpha: clampNumber(input.cardAlpha, 0.15, 1, fallback.cardAlpha),
    cardBorderSize: clampNumber(input.cardBorderSize, 0, 12, fallback.cardBorderSize),
    cardBorderRadius: clampNumber(input.cardBorderRadius, 0, 48, fallback.cardBorderRadius),
    cardBorderColor: normalizeColor(input.cardBorderColor, fallback.cardBorderColor),
    headerColor: normalizeColor(input.headerColor, fallback.headerColor),
    subheaderColor: normalizeColor(input.subheaderColor, fallback.subheaderColor),
    bodyColor: normalizeColor(input.bodyColor, fallback.bodyColor),
    buttonBackgroundColor: normalizeColor(
      input.buttonBackgroundColor,
      fallback.buttonBackgroundColor
    ),
    buttonTextColor: normalizeColor(input.buttonTextColor, fallback.buttonTextColor),
    buttonBorderColor: normalizeColor(input.buttonBorderColor, fallback.buttonBorderColor)
  };
}

function mapTheme(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    tenantId: String(row.tenant_id),
    locationId: row.location_id ? String(row.location_id) : null,
    theme: normalizeTheme(row.theme),
    updatedByUserId: row.updated_by_user_id ? String(row.updated_by_user_id) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAsset(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    tenantId: String(row.tenant_id),
    locationId: row.location_id ? String(row.location_id) : null,
    assetType: row.asset_type,
    objectKey: row.object_key,
    publicUrl: row.public_url,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    createdByUserId: row.created_by_user_id ? String(row.created_by_user_id) : null,
    createdAt: row.created_at
  };
}

async function findTenantDefaultTheme(tenantId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `SELECT ${THEME_COLUMNS} FROM public_board_themes WHERE tenant_id = $1 AND location_id IS NULL LIMIT 1`,
    [Number(tenantId)]
  );

  return mapTheme(result.rows[0]);
}

async function findLocationTheme(locationId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `SELECT ${THEME_COLUMNS} FROM public_board_themes WHERE location_id = $1 LIMIT 1`,
    [Number(locationId)]
  );

  return mapTheme(result.rows[0]);
}

async function getResolvedTheme(tenantId, locationId, options = {}) {
  const locationTheme = locationId ? await findLocationTheme(locationId, options) : null;
  if (locationTheme) {
    return {
      scope: "location",
      theme: normalizeTheme(locationTheme.theme)
    };
  }

  const tenantTheme = await findTenantDefaultTheme(tenantId, options);
  if (tenantTheme) {
    return {
      scope: "tenant",
      theme: normalizeTheme(tenantTheme.theme)
    };
  }

  return {
    scope: "fallback",
    theme: normalizeTheme(DEFAULT_PUBLIC_BOARD_THEME)
  };
}

async function upsertTenantDefaultTheme({ tenantId, theme, userId }, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      INSERT INTO public_board_themes (tenant_id, location_id, theme, updated_by_user_id)
      VALUES ($1, NULL, $2::JSONB, $3)
      ON CONFLICT (tenant_id) WHERE location_id IS NULL
      DO UPDATE SET theme = EXCLUDED.theme, updated_by_user_id = EXCLUDED.updated_by_user_id
      RETURNING ${THEME_COLUMNS}
    `,
    [Number(tenantId), JSON.stringify(normalizeTheme(theme)), userId ? Number(userId) : null]
  );

  return mapTheme(result.rows[0]);
}

async function upsertLocationTheme({ tenantId, locationId, theme, userId }, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      INSERT INTO public_board_themes (tenant_id, location_id, theme, updated_by_user_id)
      VALUES ($1, $2, $3::JSONB, $4)
      ON CONFLICT (location_id) WHERE location_id IS NOT NULL
      DO UPDATE SET theme = EXCLUDED.theme, updated_by_user_id = EXCLUDED.updated_by_user_id
      RETURNING ${THEME_COLUMNS}
    `,
    [
      Number(tenantId),
      Number(locationId),
      JSON.stringify(normalizeTheme(theme)),
      userId ? Number(userId) : null
    ]
  );

  return mapTheme(result.rows[0]);
}

async function applyThemeToAllLocations({ tenantId, theme, userId }, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const locations = await queryClient.query(
    `SELECT id FROM store_locations WHERE tenant_id = $1`,
    [Number(tenantId)]
  );

  for (const location of locations.rows) {
    await upsertLocationTheme({
      tenantId,
      locationId: location.id,
      theme,
      userId
    }, { client: queryClient });
  }
}

async function saveTheme({ tenantId, locationId, theme, applyToAllLocations, userId }) {
  const normalizedTheme = normalizeTheme(theme);

  return db.withTransaction(async (client) => {
    if (applyToAllLocations) {
      const tenantTheme = await upsertTenantDefaultTheme({
        tenantId,
        theme: normalizedTheme,
        userId
      }, { client });
      await applyThemeToAllLocations({
        tenantId,
        theme: normalizedTheme,
        userId
      }, { client });

      return {
        scope: "tenant",
        theme: normalizeTheme(tenantTheme.theme)
      };
    }

    const locationTheme = await upsertLocationTheme({
      tenantId,
      locationId,
      theme: normalizedTheme,
      userId
    }, { client });

    return {
      scope: "location",
      theme: normalizeTheme(locationTheme.theme)
    };
  });
}

async function createAsset(data, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      INSERT INTO public_board_assets (
        tenant_id,
        location_id,
        asset_type,
        object_key,
        public_url,
        file_name,
        content_type,
        size_bytes,
        created_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING ${ASSET_COLUMNS}
    `,
    [
      Number(data.tenantId),
      data.locationId ? Number(data.locationId) : null,
      data.assetType,
      data.objectKey,
      data.publicUrl,
      data.fileName,
      data.contentType,
      Number(data.sizeBytes),
      data.userId ? Number(data.userId) : null
    ]
  );

  return mapAsset(result.rows[0]);
}

module.exports = {
  DEFAULT_PUBLIC_BOARD_THEME,
  normalizeTheme,
  findTenantDefaultTheme,
  findLocationTheme,
  getResolvedTheme,
  saveTheme,
  createAsset
};
