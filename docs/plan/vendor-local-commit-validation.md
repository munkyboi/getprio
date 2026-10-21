# Vendor Dashboard local checkpoint — 22 October 2026

This checkpoint captures the Vendor Dashboard work developed in this conversation: the At a glance Dashboard, live service-request queue and counter controls, request drafts and recovery, resource configuration and location scoping, service/location editors, image uploads, store-hours guidance, and their shared components, API adapters, contracts, dependencies, tests and acceptance notes. It is a local source checkpoint, not a production release.

## Scope and preservation

The reviewed code inventory contains 225 paths on `codex/vendor-reference-composition`, based on `0d6c9a016c1174f0eab583b52aa1c09a21bd62dd`. Documentation is recorded separately. Existing backend auth-rate-limit edits, frontend session-retry and maintenance-polling edits, generic business-category copy, agent caches, ignored environment files, private fixtures and runtime evidence are excluded and preserved. Shared DTOs required by the new UI are included; local data is not part of Git.

The inventory and verification packet lives outside the repository at `/tmp/getprio-vendor-commit-inventory-20261022`. The import closure found 881 local references, with no unresolved imports or excluded untracked dependencies. An archive of the exact staged tree passed frontend TypeScript with the excluded files at their committed baseline. This source check is distinct from authenticated runtime acceptance.

## Evidence and limits

The latest focused resource-picker/duration run passed 49 tests and frontend TypeScript. The corresponding isolated browser report records immediate duration updates in 8–37 ms and real store-hours mutation → SSE → GET → visible update in 62/74/171 ms, preserving selected resources and duration count. Its controlled matrix covers new requests, saved drafts and published amendments; it does not prove live capacity causality for every matrix case.

Retained evidence files are local-only and identified by SHA-256:

| Packet | SHA-256 |
| --- | --- |
| Duration/picker QA, `getprio-duration-picker-qa-20261021/QA-FINAL-REPORT.json` | `afe6f0bb0db7473dddab2075ce01ed9300e4bd65c3317a2997db31873b244b24` |
| Published-amendment guard v2, `getprio-picker-sse-qa/QA-V2-PUBLISHED-AMEND-AVAILABILITY-FINAL.json` | `432772d7197cefabf1875ffa7b76f13809accf0ef2f2d9617b61be6aa5d89fb7` |
| Picker real release SSE, `getprio-picker-sse-qa/QA-FINAL-REPORT.json` | `55b4acb17129bb120a702dd18287167d0c300a69dc37e9fcb2dcf83ea59ffa56` |
| Controls flex layout, `getprio-controls-flex-qa/QA-FINAL-REPORT.json` | `da34dfa244397feb941bbeccbf235a44c71263e95bae949a06dbc6b134bb1e31` |

These packets accept their frozen local snapshots and explicit coverage; they are not blanket acceptance of every file in this checkpoint. Direct-extra runtime coverage remains **UNTESTED**. Historical Dashboard configuration timing still needs an observer attached to a stable root, and first-publish browser causality still needs a controlled Dashboard-route rerun. The fresh-database migration dependency order remains a backend deployment gate. No timer is evidence of completion or capacity release.

The local pre-commit hook remains enabled. A scoped pre-commit reconciliation removed unused declarations, gave Lexical commands typed payloads and stable lazy configuration, replaced render-time mutable owner refs with retained owner state, and sampled the duration clock in its effect. The 30 focused checks for these changes passed, including owner retention across missing/new setup, initial editor configuration retention, and fresh-hours clock sampling. All 154 staged source paths passed non-mutating ESLint with zero errors and seven existing dependency warnings; the exact updated staged-tree archive passed frontend TypeScript with excluded files at baseline. Missing ignored lint dependencies and Husky shims were repaired from verified matching installed versions; no policy rules were changed. The normal Husky pre-commit hook ran successfully for local code commit `a7b1831463c34dc48360123b71c289155ca85df9`: lint-staged completed `eslint --fix` for 144 frontend and 10 shared source files. The committed tree exactly matched the reviewed tree and all 225 approved source hashes; all seven excluded-file hashes remained unchanged. No hook bypass was used. No push, pull request, merge, deployment, production activation, schema change or original business-data mutation is included in this checkpoint operation.

## Post-reconciliation source identity

These behavior-sensitive files were frozen for independent QA after lint reconciliation:

| File | SHA-256 |
| --- | --- |
| `CampaignDescriptionEditor.tsx` | `7b773b8bc8786f2f45a413b181d048ab70063f4735430f4ad35556fbb1871be0` |
| `ResourceSetupPanel.tsx` | `4e6fc0d8ba181032b67a18678d0aaba6c9eff8d754de09f8e86ba385b1b91391` |
| `NamedQueuePlanDialog.tsx` | `4669eb6ee6a9cd83afd83aa910df70134b4b11d3f80425ee8ce2caced92f94f7` |

The staged code tree before the local commit is `9c5664fcaa0adb58b12d60b340e05779fb43c5ad`; the 225-file manifest SHA-256 is `b9308150852f80bed121107c2316958e58bfb5460f3ff8e3698338831ed70722`. Historical runtime report hashes above do not establish acceptance of this later tree; independent post-reconciliation runtime results are recorded separately.

## Independent check of the committed clock changes

`/tmp/getprio-commit-clock-qa-20261022/QA-FINAL-REPORT.json` has SHA-256 `93985c4c4ffe6ba9b4145b85ec58fe085d9a5dd7f0a27fade8ee14a61866c993`. It verifies the three source identities above against the frozen runtime and current source. Actual selected-count changes appeared in 30/21/14 ms; real store-hours changes reached the same open saved-draft input through SSE in 184/92 ms. Selected resources, count eight and quantity one remained intact, with no observed errors.

The resource-owner component harness retained each owner with one mount and zero unmounts across setup disappearance and new-pool arrival, including simulated pending state; it did not perform an activation POST. Lexical was checked by source review and a focused initial-configuration test, not a new browser editing session. The isolated run preserved 13 core tables and restored baseline logical hours; its owned services were stopped while original services remained running. This bounded check does not resolve the historical Dashboard, direct-extra, migration-order or production gates listed above.
