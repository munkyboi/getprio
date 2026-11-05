BEGIN;

ALTER TABLE organizer_campaigns
  DROP CONSTRAINT IF EXISTS organizer_campaigns_description_check;

ALTER TABLE organizer_campaigns
  ADD CONSTRAINT organizer_campaigns_description_check
  CHECK (char_length(description) <= 20000);

ALTER TABLE organizer_campaigns
  DROP CONSTRAINT IF EXISTS organizer_campaigns_payment_instructions_check;

ALTER TABLE organizer_campaigns
  ADD CONSTRAINT organizer_campaigns_payment_instructions_check
  CHECK (char_length(payment_instructions) BETWEEN 1 AND 40000);

COMMIT;
