# Services and Availability local review

Fixed point: main `9fd91e569cf0caafbccf85bb8af7c5a81d3cdf4d` (#409). Reviewed implementation: `93a95917`. Review command: `git diff 9fd91e569cf0caafbccf85bb8af7c5a81d3cdf4d...HEAD`. Specification: full audit G06 and Services/Availability inventory, preservation checklist and rework design. Standards: AGENTS.md, vendor UI rules and the existing scoped configuration/task primitives. Independent reviews follow the code-review skill's two axes.

## Standards

One actionable finding: preserve service-specific whole-day exceptions when opening the editor. The existing `openAvailabilityExceptionDialog` inferred its global checkbox from blocked mode and empty times without checking `serviceId`; the new explicit whole-day payload would clear the scope. This violated the UI rule preserving service/branch scope and distinguishing the all-service whole-day control. No additional documented-standard violations or actionable heuristic smells were reported.

Correction: infer the global checkbox only for a blocked date-only exception without a service scope. Existing single-service date-only blocks retain their selected service when reopened. A focused handler/payload regression and browser reopen/save scenario cover this case.

## Spec

One actionable finding: editing only the reason of an existing single-service whole-day block could expand it to every service. Full audit G06 requires “Preserve all service/branch scopes … whole-day/partial exceptions.” No other missing requirements or scope creep were reported. Authenticated mutations and device evidence remain separate from the synthetic checks.

Correction: the same saved-scope distinction fixes this path; whole-day all-service blocking occurs only when that explicit control is selected or the original exception was already global.

Summary: Standards 1 finding corrected; Spec 1 finding corrected. The worst issue in each axis was the same scope expansion, now covered by regression tests. Local user review, PR publication/review, deployment and runtime activation remain separate gates.
