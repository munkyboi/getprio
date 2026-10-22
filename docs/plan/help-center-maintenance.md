# Help Center maintenance improvements

Added: 2026-09-10. Status: deferred; no target date. Planning only; no implementation or automation is activated by this document.

## Purpose

Keep public guides accurate as GetPrio changes, with clear responsibility for reviewing each article. Preserve the selected topic-directory design and stable public links.

Current baseline: articles, topics and FAQs live in `frontend/src/pages/helpContent.ts`; layout and search presentation live in `frontend/src/pages/HelpPage.tsx`. Content changes currently ship with the web app. See [Public Help Center](../specs/public-help-center.md).

## Next improvement: ownership and review dates

Continue maintaining content in code. Add lightweight review metadata and a report before considering an editor.

Proposed metadata for each article:

- `owner`: internal responsible team or role; assign an actual accountable owner before release.
- `lastReviewedAt`: date the instructions were checked against the applicable released experience; leave unset until verified.
- `reviewDueAt`: next review date, distinct from the last text edit.
- `appliesTo`: web, mobile, or both, to make verification boundaries explicit.
- `sourceReferences`: internal feature, policy or behavior references used for verification.

Apply the same ownership/review approach to standalone FAQ answers; where an FAQ summarizes a guide, associate it with that guide to reduce duplicate maintenance.

Workflow:

1. Inventory the existing articles and FAQs and assign owners. Treat unreviewed content as needing review, without inventing historical dates.
2. Check each guide against the relevant released web/mobile behavior. A local source inspection alone must not mark a mobile release as verified.
3. Record the review date and next due date. Suggested initial cadence: every 90 days, plus an immediate review when the underlying feature or policy changes. Confirm the cadence when implementation begins.
4. Add a command that lists unassigned, unreviewed and overdue content. Keep this report internal and actionable; no scheduled reminders are part of this phase.
5. Add a feature-change checklist item to review affected help content in the same change. Update review dates only after checking the instructions, not automatically on every edit or deployment.
6. Display a public “Last reviewed” date only when verification is recorded. Internal owners and source references stay out of the public response/bundle; use a separate internal metadata source or an explicitly filtered build output.

Completion criteria:

- Every published guide and standalone FAQ has an assigned owner and an explicit review state.
- The report correctly identifies missing owners, missing dates and overdue reviews, using a documented date boundary and timezone.
- Public review dates match recorded verification; editing text does not silently advance them.
- Existing article URLs remain valid and internal metadata is absent from public assets.
- The review process documents what to do when content is found inaccurate: correct it, or remove it from discovery with a useful fallback for its existing URL.

## Later option: Platform Admin content editor

Revisit when routine updates need to be made by someone without repository access, or deployment dependencies regularly delay corrections. This phase is conditional and is not needed to complete the next improvement.

Candidate scope:

- Mobile-first topic/article/FAQ editing with draft, preview, publish and archive states.
- Revision history, author/reviewer attribution, rollback and review reminders within the admin UI.
- Server-enforced Platform Admin permissions and an audit trail for publication changes.
- Public readers receive published content only; drafts and internal review metadata remain private.
- Stable IDs and URLs, safe content rendering, search refresh on publication, and recovery for archived guides.
- Migrate existing content with parity checks and a rollback plan; keep policies as the authoritative source of refund and privacy rules.

Before implementation, choose the storage/editor approach and determine whether publishing requires a separate reviewer. Do not assume a CMS vendor, new service, or paid subscription.

Completion would require a verified draft-to-publish flow, correct public search updates, restoration of an earlier revision, preserved existing links, and denial of editing/publishing access for other roles.

## Boundaries and activation

The terms/privacy wording review from the footer audit remains a separate outstanding content task. Article metadata does not establish that those policies have been reconciled with operations.

This plan is independent of the deferred Platform Admin Support Inbox. Neither inbox implementation nor a CMS is required for the initial maintenance improvement.

When this work is selected for implementation, confirm ownership and cadence, inspect current content and release behavior again, and convert the next improvement into scoped execution tasks. Keep the conditional editor phase deferred unless separately selected.
