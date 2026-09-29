const IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;
const MAX_INVENTORY_SOURCES = 200;
const MAX_REFERENCE_ITEMS_PER_SOURCE = 1000;
const BEST_EFFORT_ANONYMIZATION_SOURCES = new Set([
  'public.account_email_change_challenges.user_id',
  'public.idempotency_records.actor_user_id',
  'public.organizer_campaign_contributions.accepted_by_user_id',
  'public.organizer_campaign_events.actor_user_id',
  'public.organizer_campaign_notices.recipient_user_id',
  'public.organizer_campaign_reports.reporter_user_id',
  'public.organizer_campaigns.organizer_user_id',
  'public.user_trust_ratings.rater_user_id',
  'public.user_trust_ratings.subject_user_id'
]);
const SAFE_CLEANUP_SOURCES = new Set([
  "public.users.id",
  "public.account_deletion_requests.user_id",
  "public.account_phone_change_challenges.user_id",
  "public.customer_registration_otps.user_id",
  "public.oauth_accounts.user_id",
  "public.auth_sessions.user_id",
  "public.auth_mfa_factors.user_id",
  "public.auth_mfa_recovery_codes.user_id",
  "public.auth_mfa_challenges.user_id",
  "public.password_reset_tokens.user_id",
  "public.push_subscriptions.user_id",
  "public.tickets.user_id",
  "public.bookings.customer_user_id",
  "public.auth_security_events.user_id"
]);

function quoteIdentifier(value) {
  if (!IDENTIFIER.test(String(value || ""))) {
    throw new Error("Account deletion inventory encountered an invalid database identifier.");
  }
  return `"${value}"`;
}

async function collectRelationalInventory(client, userId) {
  const { rows: columns } = await client.query(`
    SELECT columns.table_schema, columns.table_name, columns.column_name
    FROM information_schema.columns columns
    JOIN information_schema.tables tables
      ON tables.table_schema=columns.table_schema AND tables.table_name=columns.table_name
    WHERE columns.table_schema=current_schema()
      AND tables.table_type='BASE TABLE'
      AND columns.data_type IN ('bigint','integer','smallint')
      AND (
        (columns.table_name='users' AND columns.column_name='id')
        OR columns.column_name ~ '(^|_)user_id$'
        OR EXISTS (
          SELECT 1
          FROM information_schema.key_column_usage foreign_key_column
          JOIN information_schema.constraint_column_usage referenced_column
            ON referenced_column.constraint_catalog=foreign_key_column.constraint_catalog
            AND referenced_column.constraint_schema=foreign_key_column.constraint_schema
            AND referenced_column.constraint_name=foreign_key_column.constraint_name
          WHERE foreign_key_column.table_schema=columns.table_schema
            AND foreign_key_column.table_name=columns.table_name
            AND foreign_key_column.column_name=columns.column_name
            AND referenced_column.table_schema=current_schema()
            AND referenced_column.table_name='users'
            AND referenced_column.column_name='id'
        )
      )
    ORDER BY columns.table_name, columns.column_name
    LIMIT ${MAX_INVENTORY_SOURCES + 1}
  `);

  if (columns.length > MAX_INVENTORY_SOURCES) {
    throw new Error("Account deletion inventory exceeded its safe source limit; manual review is required.");
  }

  const { rows: primaryKeyColumns } = await client.query(`
    SELECT tc.table_schema,kcu.table_name,kcu.column_name,kcu.ordinal_position
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_catalog=tc.constraint_catalog
      AND kcu.constraint_schema=tc.constraint_schema
      AND kcu.constraint_name=tc.constraint_name
      AND kcu.table_schema=tc.table_schema AND kcu.table_name=tc.table_name
    WHERE tc.constraint_type='PRIMARY KEY' AND tc.table_schema=current_schema()
    ORDER BY kcu.table_schema,kcu.table_name,kcu.ordinal_position
  `);
  const primaryKeysByTable = new Map();
  for (const row of primaryKeyColumns) {
    const table = `${row.table_schema}.${row.table_name}`;
    const keys = primaryKeysByTable.get(table) || [];
    keys.push(row.column_name);
    primaryKeysByTable.set(table, keys);
  }

  const { rows: foreignKeys } = await client.query(`
    SELECT tc.table_schema,tc.table_name,kcu.column_name,rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_catalog=tc.constraint_catalog
      AND kcu.constraint_schema=tc.constraint_schema
      AND kcu.constraint_name=tc.constraint_name
      AND kcu.table_schema=tc.table_schema AND kcu.table_name=tc.table_name
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_catalog=tc.constraint_catalog
      AND ccu.constraint_schema=tc.constraint_schema
      AND ccu.constraint_name=tc.constraint_name
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_catalog=tc.constraint_catalog
      AND rc.constraint_schema=tc.constraint_schema
      AND rc.constraint_name=tc.constraint_name
    WHERE tc.constraint_type='FOREIGN KEY'
      AND tc.table_schema=current_schema()
      AND ccu.table_schema=current_schema() AND ccu.table_name='users' AND ccu.column_name='id'
  `);
  const deleteRulesBySource = new Map();
  for (const row of foreignKeys) {
    const source = `${row.table_schema}.${row.table_name}.${row.column_name}`;
    const rules = deleteRulesBySource.get(source) || [];
    if (!rules.includes(row.delete_rule)) rules.push(row.delete_rule);
    deleteRulesBySource.set(source, rules);
  }

  const sources = columns.map((column) => {
    const tableName = `${column.table_schema}.${column.table_name}`;
    const source = `${tableName}.${column.column_name}`;
    const table = `${quoteIdentifier(column.table_schema)}.${quoteIdentifier(column.table_name)}`;
    const keys = primaryKeysByTable.get(tableName) || [];
    const keyProjection = keys.map((key) => `reference_rows.${quoteIdentifier(key)}`).join(',');
    const keyOrder = keys.map((key) => `reference_rows.${quoteIdentifier(key)}`).join(',');
    const referenceKeys = keys.length
      ? `COALESCE((SELECT jsonb_agg(jsonb_build_array(${keyProjection}) ORDER BY ${keyOrder}) FROM (SELECT ${keys.map(quoteIdentifier).join(',')} FROM ${table} WHERE ${quoteIdentifier(column.column_name)}=$1 ORDER BY ${keys.map(quoteIdentifier).join(',')} LIMIT ${MAX_REFERENCE_ITEMS_PER_SOURCE + 1}) reference_rows),'[]'::jsonb)`
      : 'NULL::jsonb';
    return {
      name: source,
      hasPrimaryKey: keys.length > 0,
      deleteRules: deleteRulesBySource.get(source) || [],
      expression: `SELECT '${source}' AS source, (SELECT COUNT(*)::bigint FROM ${table} WHERE ${quoteIdentifier(column.column_name)}=$1) AS record_count, ${referenceKeys} AS reference_keys`
    };
  });
  if (!sources.some(({ name }) => name.endsWith(".users.id"))) {
    throw new Error("Account deletion inventory could not verify the user record source.");
  }

  const counts = await client.query(sources.map(({ expression }) => expression).join(" UNION ALL "), [userId]);
  const inventory = counts.rows
    .map((row) => {
      const source = String(row.source);
      const sourceInfo = sources.find((item) => item.name === source);
      const referenceKeys = Array.isArray(row.reference_keys) ? row.reference_keys : [];
      const items = sourceInfo?.hasPrimaryKey
        ? referenceKeys.map((rowKey, index) => ({
          id: require('node:crypto').createHash('sha256').update(`${userId}\0${source}\0${JSON.stringify(rowKey)}`).digest('hex').slice(0, 32),
          ordinal: index + 1,
          rowKey,
          rowKeyColumns: primaryKeysByTable.get(`${source.split('.').slice(0, 2).join('.')}`) || []
        }))
        : [];
      return {
        source,
        recordCount: Number(row.record_count),
        deleteRules: deleteRulesBySource.get(source) || [],
        items,
        itemsComplete: Boolean(sourceInfo?.hasPrimaryKey && items.length === Number(row.record_count)
          && Number(row.record_count) <= MAX_REFERENCE_ITEMS_PER_SOURCE)
      };
    })
    .sort((left, right) => left.source.localeCompare(right.source));

  if (inventory.some(({ recordCount }) => !Number.isSafeInteger(recordCount) || recordCount < 0)) {
    throw new Error("Account deletion inventory returned an invalid record count.");
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    scope: "Numeric relational references to users.id or user-ID-named columns only; copied identifiers, JSON payloads, object storage, suppliers, and backups are outside this automated scan.",
    sourceCount: inventory.length,
    referenceCount: inventory.reduce((total, item) => total + item.recordCount, 0),
    sources: inventory
  };
}

function unsafeCleanupReferences(inventory) {
  return inventory.sources.filter((source) => source.recordCount > 0
    && !SAFE_CLEANUP_SOURCES.has(source.source)
    && !BEST_EFFORT_ANONYMIZATION_SOURCES.has(source.source));
}

module.exports = { BEST_EFFORT_ANONYMIZATION_SOURCES, MAX_REFERENCE_ITEMS_PER_SOURCE, SAFE_CLEANUP_SOURCES, collectRelationalInventory, unsafeCleanupReferences };
