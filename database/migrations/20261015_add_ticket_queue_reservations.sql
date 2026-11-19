BEGIN;

-- Queue calls reserve the selected single-service interval without pretending
-- that the ticket is a booking. Existing booking bindings remain unchanged.
ALTER TABLE resource_ledger_reservations
  ALTER COLUMN booking_id DROP NOT NULL,
  ALTER COLUMN booking_item_id DROP NOT NULL;

ALTER TABLE resource_ledger_reservations
  ADD COLUMN ticket_id BIGINT,
  ADD CONSTRAINT resource_reservation_source_check CHECK (
    (booking_id IS NOT NULL AND booking_item_id IS NOT NULL AND ticket_id IS NULL)
    OR (booking_id IS NULL AND booking_item_id IS NULL AND ticket_id IS NOT NULL)
  ),
  ADD CONSTRAINT resource_reservation_ticket_scope_fkey
    FOREIGN KEY (ticket_id, tenant_id, location_id)
    REFERENCES tickets (id, tenant_id, location_id) ON DELETE RESTRICT;

ALTER TABLE resource_ledger_commands DROP CONSTRAINT IF EXISTS resource_ledger_commands_command_check;
ALTER TABLE resource_ledger_commands ADD CONSTRAINT resource_ledger_commands_command_check
  CHECK (command IN ('reserve', 'reserveTicket', 'cancelReservation', 'allocate', 'release'));

CREATE UNIQUE INDEX resource_reservation_live_ticket_idx
  ON resource_ledger_reservations (tenant_id, location_id, ticket_id)
  WHERE ticket_id IS NOT NULL AND state IN ('protected', 'converted');

COMMIT;
