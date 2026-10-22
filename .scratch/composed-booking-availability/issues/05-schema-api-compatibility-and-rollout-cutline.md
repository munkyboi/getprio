# Schema, API compatibility, and rollout cutline

Type: task
Status: resolved
Claimed by: Codex (/root)
Blocked by: 01, 02, 04

## Question

What is the smallest safe migration and API rollout sequence that introduces composed-visit availability without breaking existing standard bookings, existing group-funded campaigns, customer routes, vendor operations, or capacity reporting?

## Resolution must decide

1. Schema/migration changes and backfills for existing one-item rows.
2. Versioning or compatibility treatment for current single-service slot endpoints and payloads.
3. The narrow implementation slices, regression fixtures, and rollout/rollback checks.
4. Which vendor configuration/UI changes, if any, are actually required for v1.

## Resolution

See [schema, API, and rollout cutline](../assets/05-schema-api-rollout-cutline.md).

The safe path is additive: parent-level `execution_mode` fields defaulted to `parallel`, canonical item-row occupancy, a new server-side composed-slot evaluator, and unchanged legacy one-service routes/payloads. The work is split into schema/repository, shared evaluator, standard booking, group-funded lifecycle, and Visit planner UI/verification slices.

No vendor-maintained package catalog or named-staff/resource configuration is required for v1. The only vendor-facing clarification is that a location-scoped availability rule owns one shared branch capacity.

## Implementation progress

- Slice A implemented locally: additive parent execution-mode migration, repository mappers/default writes, canonical normal-booking item occupancy query, focused repository regressions, and local Docker migration verification.
