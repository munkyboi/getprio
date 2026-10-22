CREATE TABLE IF NOT EXISTS usage_credit_packs (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'enabled' CHECK (state IN ('draft','enabled','disabled','archived')),
  current_revision INTEGER NOT NULL DEFAULT 1 CHECK (current_revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usage_credit_pack_revisions (
  id BIGSERIAL PRIMARY KEY,
  pack_id BIGINT NOT NULL REFERENCES usage_credit_packs(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK (revision > 0),
  ticket_units INTEGER NOT NULL CHECK (ticket_units >= 0),
  journey_units INTEGER NOT NULL CHECK (journey_units >= 0),
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  currency TEXT NOT NULL DEFAULT 'PHP' CHECK (currency = 'PHP'),
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pack_id, revision),
  CHECK (ticket_units > 0 OR journey_units > 0)
);

INSERT INTO usage_credit_packs (code, name, state)
VALUES ('P100','P100 Usage Credits','enabled'), ('P500','P500 Usage Credits','enabled'), ('P1000','P1000 Usage Credits','enabled')
ON CONFLICT (code) DO NOTHING;

INSERT INTO usage_credit_pack_revisions (pack_id, revision, ticket_units, journey_units, price_cents, currency, reason)
SELECT id, 1,
  CASE code WHEN 'P100' THEN 100 WHEN 'P500' THEN 500 ELSE 1000 END,
  CASE code WHEN 'P100' THEN 100 WHEN 'P500' THEN 500 ELSE 1000 END,
  CASE code WHEN 'P100' THEN 9900 WHEN 'P500' THEN 39900 ELSE 69900 END,
  'PHP', 'Initial settled Usage Credit catalog'
FROM usage_credit_packs
ON CONFLICT (pack_id, revision) DO NOTHING;

CREATE TABLE IF NOT EXISTS usage_credit_purchases (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  pack_id BIGINT NOT NULL REFERENCES usage_credit_packs(id) ON DELETE RESTRICT,
  pack_revision_id BIGINT NOT NULL REFERENCES usage_credit_pack_revisions(id) ON DELETE RESTRICT,
  purchase_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','paid','fulfilled','refund_pending','refunded','failed','disputed')),
  ticket_units INTEGER NOT NULL CHECK (ticket_units >= 0),
  journey_units INTEGER NOT NULL CHECK (journey_units >= 0),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL CHECK (currency = 'PHP'),
  provider TEXT NOT NULL DEFAULT 'manual',
  provider_checkout_id TEXT,
  checkout_url TEXT,
  provider_payment_id TEXT,
  purchased_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, purchase_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS usage_credit_purchase_provider_checkout_idx
  ON usage_credit_purchases (provider, provider_checkout_id)
  WHERE provider_checkout_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS usage_credit_lots (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  resource_key TEXT NOT NULL CHECK (resource_key IN ('queueTickets','queueEmailJourneys')),
  source_type TEXT NOT NULL CHECK (source_type IN ('promotional','purchased')),
  source_reference TEXT NOT NULL,
  granted_units INTEGER NOT NULL CHECK (granted_units > 0),
  revoked_units INTEGER NOT NULL DEFAULT 0 CHECK (revoked_units >= 0),
  frozen_units INTEGER NOT NULL DEFAULT 0 CHECK (frozen_units >= 0),
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','frozen','revoked','expired')),
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, resource_key, source_type, source_reference),
  CHECK (revoked_units + frozen_units <= granted_units)
);
CREATE INDEX IF NOT EXISTS usage_credit_lots_consumption_idx
  ON usage_credit_lots (tenant_id, resource_key, status, expires_at, created_at);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'allowance_allocations_credit_lot_fk') THEN
    ALTER TABLE allowance_allocations
      ADD CONSTRAINT allowance_allocations_credit_lot_fk
      FOREIGN KEY (credit_lot_id) REFERENCES usage_credit_lots(id) ON DELETE RESTRICT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'allowance_reservation_allocations_credit_lot_fk') THEN
    ALTER TABLE allowance_reservation_allocations ADD CONSTRAINT allowance_reservation_allocations_credit_lot_fk FOREIGN KEY (credit_lot_id) REFERENCES usage_credit_lots(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS usage_credit_refunds (
  id BIGSERIAL PRIMARY KEY,
  purchase_id BIGINT NOT NULL REFERENCES usage_credit_purchases(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('requested','provider_pending','confirmed','failed')),
  reason TEXT NOT NULL,
  requested_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  provider_refund_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (purchase_id)
);

CREATE TABLE IF NOT EXISTS usage_credit_disputes (
  id BIGSERIAL PRIMARY KEY,
  purchase_id BIGINT NOT NULL REFERENCES usage_credit_purchases(id) ON DELETE RESTRICT,
  provider_dispute_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('open','won','lost','closed')),
  consumed_exposure_units INTEGER NOT NULL DEFAULT 0 CHECK (consumed_exposure_units >= 0),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
