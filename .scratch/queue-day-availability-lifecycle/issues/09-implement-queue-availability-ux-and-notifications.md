# Implement queue availability UX and notifications

Type: task
Status: resolved
Claimed by: Codex (/root)
Blocked by: 05, 06, 08

## Question

Implement the approved vendor, customer, and public queue-availability experience, including the prototype-selected warning and extension controls.

## Completion requirements

1. Add vendor controls and states for unopened, open, paused, warning, extended, short-lived closing/reconciling, closed, and reconciliation error without presenting draining as a Queue Day lifecycle state.
2. Implement the 15-minute danger countdown and audited 30-minute extension interaction selected by the prototype.
3. Present deterministic ticket consequences and recovery actions without hiding operationally important details.
4. Update public/joined/customer surfaces so store status and Queue Day availability are distinct and accurately explained.
5. Wire in-app, Web Push, and existing notification channels according to the approved contract.
6. Verify mobile-first layout, keyboard and screen-reader behavior, long content, reconnect/reload state, and multi-session consistency.

## Resolution

Implemented the production queue-availability experience without redesigning the
storefront:

- Added the prototype-selected global vendor action tray, server-derived
  15-minute danger countdown, deterministic consequence review, manual close,
  audited 30-minute extension confirmation, reconciliation lock/error states,
  and manual in-hours open/reopen controls.
- Kept store-hours eligibility distinct from Queue Day state throughout vendor,
  public join/monitor, joined-ticket, and customer history surfaces.
- Added location-scoped staff Web Push, durable reconciliation-failure alerts,
  and truthful carry-over, expiration, close-outcome, and reconciliation
  notification copy across the existing delivery channels.
- Corrected initial deadline versioning and made every extended Queue Day
  re-enter the warning phase 15 minutes before its new deadline.
- Verified 334 backend tests, 88 frontend tests, workspace typecheck, lint with
  no errors, production frontend build, and `git diff --check`.
- Live browser QA covered the unopened/manual-open flow, global tray persistence,
  extension audit/deadline behavior, repeated warnings, mobile bottom-sheet
  dimensions and isolated scrolling, 44-pixel actions, Escape dismissal with
  focus return, desktop centering, reload persistence, public monitor copy, and
  the 390-pixel public join flow without horizontal overflow.
