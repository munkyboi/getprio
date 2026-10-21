# Vendor queue local validation

This local checkpoint includes service-request drafts and publication, named and pooled resources, published amendments, counter dispatch, store-hours eligibility, scoped SSE reads, resource configuration, and guarded local preview support. It is a source checkpoint, not a deployment approval.

The published-amendment guard checks positive resource-demand additions against other live holds and allocations. Existing demand and pure reductions remain editable; new drafts and publications may request busy resources without reserving them. The guard runs within the existing location-first ledger transaction before replacing protection or plan history.

## Recorded validation

- Focused backend checks: **31 passed, 2 PostgreSQL cases skipped**; backend TypeScript check passed.
- Independent isolated runtime QA: held and in-service named-resource additions returned `409 RESOURCE_CAPACITY_UNAVAILABLE` without changing the target plan or ledger; eligible amendments succeeded after release; new busy-resource drafts still saved and published as waiting without holds; pooled positive-demand boundaries passed; genuine staff amendments saved and reopened correctly.
- Unchanged/reduced demand, regenerated selection IDs, duration extensions, flattened extras, stage isolation, and lock ordering have focused helper coverage. The runtime staff removal/reopen case also passed; this is not a full runtime matrix for every unchanged or reduction case.
- Nested-extra runtime validation remains **UNTESTED**. No extra catalog was introduced for that QA run.

Evidence identifiers (raw QA artifacts and private fixtures are intentionally excluded from Git):

- Guard source manifest SHA-256: `19b940dcd146b5d60d544701c0eaa8e374385e61e5f70ca2cff94f8c8780a3c7`.
- `QA-V2-PUBLISHED-AMEND-AVAILABILITY-FINAL.json` SHA-256: `432772d7197cefabf1875ffa7b76f13809accf0ef2f2d9617b61be6aa5d89fb7` (`PASS_WITH_EXPLICIT_LIMITS`).

## Setup and release limits

The new same-day migration filenames are not lexically dependency-safe: member archival, named extras, skip/recall, child execution, and V4 configuration require reviewed dependency ordering. All schema dependencies are included, but this checkpoint is **not fresh-deployment-ready**. No migration is executed or renamed by this checkpoint.

The original local API runs through a guarded loopback-only, app-only launcher. QA used disposable isolated services and normal admin/staff authentication; original business data and services were not mutated by QA. Private environment files, fixture credentials, browser sessions, and raw QA logs are not part of this checkpoint. No push, PR, merge, or deployment is implied.

The three historical local verification scripts are retained as inert source. Their fixture guards differ; the counter verification script deliberately changes synthetic fixture data through SQL. Retaining them is not authorization to execute them against an active fixture or any deployed database.
