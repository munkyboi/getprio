BEGIN;

-- Enrollment persists after confirmation/expiry so static credentials cannot
-- bypass rotating protection. Ticket deletion removes this short-lived state.
CREATE TABLE queue_ticket_barcodes (
  ticket_id BIGINT PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE,
  nonce TEXT NOT NULL CHECK (nonce ~ '^[A-F0-9]{32}$'),
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT queue_ticket_barcode_duration_check CHECK (expires_at = issued_at + INTERVAL '120 seconds')
);

COMMIT;
