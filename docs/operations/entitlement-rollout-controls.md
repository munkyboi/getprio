# Entitlement rollout controls

All Free-plan, entitlement, allowance, and Usage Credit controls are server-owned environment variables and default to disabled. Client headers, query parameters, and request bodies cannot enable them. The Platform Operations owner approves activation and records the cohort, time, operator, expected signal, and rollback decision in the release log.

`ROLLOUT_COHORT` labels structured request and smoke output. It does not grant access. Risky controls use the environment keys exported by `backend/src/config/releaseControls.js` and are activated independently. Rollback means setting the affected key to `false` and restarting the application; data-bearing slices follow their own forward-repair rules once authoritative facts exist.

Before enabling a control, confirm its slice acceptance tests, database verification, dashboards, alert receiver, and rollback owner. Never enable an enforcement flag solely because its UI is visible.

## Control matrix

| Environment key | Authority or surface |
| --- | --- |
| `ENTITLEMENT_RESOLVER_SHADOW_ENABLED` | Compare legacy and new resolver decisions without changing authority. |
| `ENTITLEMENT_RESOLVER_AUTHORITY_ENABLED` | Permit the new resolver to become authoritative for compatible subscriptions. |
| `ENTITLEMENT_QUEUE_ENFORCEMENT_ENABLED` | Enforce Queue feature access. |
| `ENTITLEMENT_BRANDING_ENFORCEMENT_ENABLED` | Enforce Branding feature access. |
| `ENTITLEMENT_DISCOVERY_ENFORCEMENT_ENABLED` | Enforce Discovery feature access. |
| `ENTITLEMENT_BOOKING_ENFORCEMENT_ENABLED` | Enforce Booking feature access. |
| `ENTITLEMENT_CAMPAIGN_ENFORCEMENT_ENABLED` | Enforce Campaign feature access. |
| `ALLOWANCE_LEDGER_OBSERVE_ENABLED` | Calculate allowance decisions without denying admission. |
| `ALLOWANCE_QUEUE_TICKETS_ENABLED` | Enforce Queue Ticket allowance decisions. |
| `ALLOWANCE_QUEUE_EMAIL_JOURNEYS_ENABLED` | Meter Queue Email Journey delivery. |
| `ALLOWANCE_SERVICE_BOOKINGS_ENABLED` | Enforce Service Booking allowance decisions. |
| `FREE_PLAN_BACKFILL_ENABLED` | Permit the reviewed Free backfill apply/resume command. |
| `USAGE_CREDIT_CATALOG_ENABLED` | Expose the Usage Credit catalog and permit catalog publication. |
| `USAGE_CREDIT_GRANTS_ENABLED` | Permit manual grant and revocation operations. |
| `USAGE_CREDIT_CHECKOUT_ENABLED` | Permit vendor Usage Credit checkout, purchase reads, and synchronization. |
| `USAGE_CREDIT_REFUNDS_ENABLED` | Permit vendor refund requests and Platform Admin refund resolution. |
| `USAGE_CREDIT_DISPUTES_ENABLED` | Permit Platform Admin dispute open and resolution operations. |
| `ENTITLEMENT_OVERRIDES_ENABLED` | Permit tenant entitlement override reads and mutations. |
| `ALLOWANCE_REPAIRS_ENABLED` | Permit allowance reversal and reconciliation operations. |
| `SUBSCRIPTION_LIFECYCLE_ENABLED` | Permit new lifecycle transition, suspension, and due-execution APIs. |
| `PLAN_POLICY_MUTATIONS_ENABLED` | Permit live plan default mutation. |
| `VENDOR_CAPACITY_EXPERIENCE_ENABLED` | Expose vendor operational/commercial capacity APIs and UI. |

All keys accept only `true` or `1`; any missing or other value is disabled. Mutation gates execute before idempotency claims, confirmation consumption, database writes, or provider calls. A disabled API returns `404` with code `RELEASE_CONTROL_DISABLED`. The Plan Matrix read surface and automatic Free assignment for newly approved vendors are core product behavior, not rollout-controlled operations; policy publishing, backfill, enforcement, overrides, and commerce remain independently gated.

Do not enable authority or enforcement as a shortcut around prerequisites. Resolver shadowing precedes resolver authority; observation precedes allowance denial; catalog precedes grants and checkout; checkout precedes refunds/disputes; backend controls precede their UI controls.
