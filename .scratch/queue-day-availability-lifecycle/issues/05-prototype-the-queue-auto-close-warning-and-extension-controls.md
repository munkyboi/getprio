# Prototype the queue auto-close warning and extension controls

Type: prototype
Status: resolved
Claimed by:
Blocked by: 02, 03

## Question

How should the vendor experience present the 15-minute danger countdown,
auto-close consequences, Cancel auto-close action, 30-minute extension, manual
close, short-lived reconciliation, and closed/recovery states clearly on
mobile, tablet, desktop, and short viewports?

## Prototype requirements

- Use the `/prototype` skill and treat the user as the decision-maker.
- Compare more than one rough interaction approach before selecting a production direction.
- Include a prominent live countdown, danger styling, extension confirmation, expired-extension behavior, reconnect/reload behavior, and permission-denied state.
- Show what will happen to waiting, carried-over, skipped, and called tickets without overwhelming staff.
- Verify accessible announcements, focus behavior, touch targets, reduced motion, and narrow-screen layout.

## Resolution must decide

1. Placement and persistence of the warning across vendor dashboard navigation.
2. Exact labels, consequence copy, confirmation behavior, and success/error feedback.
3. How countdown state remains trustworthy across reloads and multiple staff sessions.
4. What replaces the countdown during extension, closing/reconciling, closed,
   and reconciliation failure; there is no persistent draining state.
5. The selected production interaction and linked prototype asset.

## Prototype checkpoint

The dev-only comparison is available on the existing queue route:

`/dashboard/queue?queueClosePrototype=1&variant=A&prototypeState=warning`

Use the floating switcher or the `variant=A|B|C` query parameter to compare:

- **A — Sticky command banner:** highest visibility and clearest inline consequences.
- **B — Queue command rail:** keeps operations dominant while reserving a persistent command area.
- **C — Global action tray:** least disruptive, with a focused modal/bottom sheet for consequences and actions.

The `prototypeState` parameter supports `warning`, `extended`, `reconciling`,
`closed`, `error`, `denied`, and `reconnected`. The prototype includes the
audited 30-minute extension confirmation, manual close confirmation,
state-replacement behavior after the deadline, locked recovery, accessible live
regions, keyboard variant switching, reduced-motion handling, 44-pixel mobile
targets, and mobile/tablet/desktop layouts.

Implementation assets:

- `frontend/src/pages/prototypes/QueueAutoClosePrototype.tsx`
- `frontend/src/pages/prototypes/QueueAutoClosePrototype.css`
- dev-only routing in `frontend/src/App.tsx`

Verification completed before user review:

- `npm --workspace frontend run typecheck`
- `npm --workspace frontend run build`
- live interaction checks at 390x844, 768x1024, and the default desktop viewport

The user decision below selects which interaction the later production
implementation should follow. The comparison code remains throwaway reference
material.

## Resolution

The user selected **Option C — Global action tray**. The production interaction
decision is recorded in
[`../assets/05-auto-close-prototype-decision.md`](../assets/05-auto-close-prototype-decision.md).

The 15-minute warning will persist as a compact dashboard-root danger tray with
the authoritative live countdown and a `Review & extend` action. Its focused
desktop modal/mobile bottom sheet shows ticket consequences, the
`Cancel auto-close` 30-minute extension flow, and manual close.

The server deadline remains authoritative across reloads and concurrent staff
sessions. Extension, closing/reconciliation, closed, failure, permission-denied,
and reconnect states replace or qualify the warning exactly as defined in the
decision asset. The selected interaction introduces no new domain term or
lifecycle state, so `CONTEXT.md` requires no glossary change.
