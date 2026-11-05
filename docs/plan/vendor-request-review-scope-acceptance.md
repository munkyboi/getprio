# Request review scope and refresh failure

Status: local fix verified in actual Opera. No PR, production or deployment claim.

## Cause and deterministic reproduction

The `request` query parameter survived a location/business change, but the request read used the newly selected location. A QA Recovery request was consequently fetched under Demo Courts. Retry repeated the same invalid scope instead of recovering.

In separate owned Opera tab5671, with no editor open, the exact reported Request review alert reproduced. Retry issued GET `/vendor/tenant/vd-sports-club/queue/plans/8bcbf0fd-1285-420c-855a-f4a5716b0539?location=demo-courts`: HTTP404, code `INVALID_PLAN`, message `Plan not found.`, correlation `c36e5507-6fb5-49f9-a51a-e902d538bee2`; preflight204. The same request under `qa-recovery-20261017` returned200 and displayed ServedQA28. Active-list/catalog/counter/user-request reads were healthy. The focused console404 query was empty; the network response supplied the definitive error. Queue independently reproduced the same scoped404/200 and found matching API logs. This was not an auth, limiter or general API outage.

## Fix

- Explicit business/location changes clear request identity and its location binding only after the existing unsaved-change guard accepts the context change. A cancelled change does not execute this cleanup.
- New request-review links include `requestLocation`. Initial selection resolves it only from the authorized location inventory before reading details. A mismatched bound request is never fetched into another location.
- Existing unbound links retain normal scoped404 handling; the client never guesses or bypasses authorization to locate a request.
- Real errors retain their alert and Retry action. Cached detail actions remain disabled while their read fails or refreshes; independently fresh active-list actions use their own query state. Counter actions retain their separate authoritative context guard.
- Hook signatures were unchanged. No user editor was closed, clicked, refreshed or navigated. No backend change/restart or ticket command was needed.

## Acceptance

1. A branch-bound QA link bootstrapped QA Recovery and displayed ServedQA28 with no Retry alert.
2. Switching to Demo Courts removed both `request` and `requestLocation` from the URL and removed obsolete detail selection; no wrong-branch QA read followed.
3. Opening Demo Courts’ VD019 review created its own location binding and returned200; active list, selected detail and counter next target agreed.
4. Read-only fault injection aborted only the detail GET in owned5671. The original generic alert stayed visible; cached detail Amend/Call buttons were disabled. The separately fresh active-list card remained independent.
5. After clearing interception, clicking actual Retry records returned200 for the same correct-scoped detail, removed the alert and reenabled refreshed detail actions without any page reload. No ticket command was issued.

Three route/scope regressions were written before the fix and passed afterward. Full frontend327/327 tests, typecheck, focused ESLint and diff whitespace checks passed. No temporary debug logging was added. Fetch interception was cleared; no viewport/theme override was used. The user’s separately active tab was not operated.

Evidence: `/Users/carloabella/.codex/visualizations/2026/10/17/vendor-multiservice/request-review-scope-diagnosis.json` and `request-review-scoped-retry-healthy.png`.
