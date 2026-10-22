BEGIN;
-- Old flat pooled extra snapshots/identities are unchanged; new named leaves
-- retain their flat extra-group identity in the immutable snapshot.
DO $$ DECLARE entry RECORD; BEGIN
  FOR entry IN SELECT conname FROM pg_constraint WHERE conrelid='queue_selection_definitions'::regclass AND contype='c'
    AND pg_get_constraintdef(oid) LIKE '%parent_kind%' AND pg_get_constraintdef(oid) LIKE '%resource_member_id IS NULL%'
  LOOP EXECUTE format('ALTER TABLE queue_selection_definitions DROP CONSTRAINT %I',entry.conname); END LOOP;
END $$;
ALTER TABLE queue_selection_definitions ADD CONSTRAINT queue_selection_shape_named_extra_v1 CHECK(
 (kind='service' AND parent_selection_id IS NULL AND parent_kind IS NULL AND pool_id IS NULL AND units IS NULL AND duration_minutes IS NULL)
 OR(kind='resource' AND parent_selection_id IS NOT NULL AND parent_kind='service' AND pool_id IS NOT NULL AND units IS NOT NULL AND duration_minutes IS NOT NULL AND units BETWEEN 1 AND 100 AND duration_minutes BETWEEN 5 AND 480)
 OR(kind='extra' AND parent_selection_id IS NOT NULL AND parent_kind='resource' AND pool_id IS NOT NULL AND units IS NOT NULL AND duration_minutes IS NOT NULL AND units BETWEEN 1 AND 100 AND duration_minutes BETWEEN 5 AND 480
    AND (resource_member_id IS NULL OR COALESCE((units=1 AND snapshot->>'inputContractVersion'='4' AND snapshot->>'namedExtraVersion'='1' AND snapshot->>'extraGroupId' ~ '^[A-Za-z0-9_-]{1,80}$'),FALSE)))
);
COMMIT;
