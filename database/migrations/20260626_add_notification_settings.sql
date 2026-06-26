BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notification_settings JSONB NOT NULL DEFAULT '{"bookingAlerts":true,"queueAlerts":true}'::JSONB;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS notification_settings JSONB NOT NULL DEFAULT '{"bookingIntake":true,"paymentProofReview":true,"bookingStatusChanges":true}'::JSONB;

COMMIT;
