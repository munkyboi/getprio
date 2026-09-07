# Queue auto-close prototype decision

## Selected direction

Use **Option C — Global action tray** as the production interaction.

During the 15-minute warning phase, a compact danger-flavored tray remains
visible across vendor dashboard sections. It shows the server-derived live
countdown, states that tickets require an outcome, and provides one prominent
`Review & extend` action. Selecting it opens a focused modal on wider screens
and a bottom sheet on mobile.

The expanded surface shows the close deadline, ticket-outcome counts, and two
actions:

- `Cancel auto-close` starts confirmation for one 30-minute Queue Auto-Close
  Extension. Helper copy says `Adds 30 minutes and records your action.`
- `Close queue now` starts a destructive manual-close confirmation.

The extension confirmation title is
`Extend <location> by 30 minutes?`; its primary action is
`Confirm 30-minute extension`. Success replaces the old warning deadline with
the new authoritative deadline and explains that another warning starts 15
minutes before it. Canceling auto-close never disables future auto-close.

## Placement and persistence

- Mount the tray at the vendor dashboard root so changing vendor sections does
  not dismiss it or reset its countdown.
- Scope it to the selected tenant and location. Changing location replaces the
  displayed warning with that location's authoritative state.
- On mobile, keep the compact tray above the safe area and open the detailed
  controls as a bottom sheet. The prototype switcher is not production UI.
- Do not use the tray outside warning or recovery-worthy states. Normal open,
  unopened, and ordinary closed availability use their standard queue status
  surfaces.

## Trust and concurrent staff sessions

- Render the countdown from the backend's authoritative deadline, never from a
  client-created 15-minute timer.
- Use the client clock only to display the remaining duration between server
  synchronizations.
- Revalidate on mount, focus, reconnect, selected-location change, and after
  every extend or close mutation.
- If another staff member extends or closes the Queue Day, live state replaces
  the local warning immediately.
- Disable duplicate submission while a mutation is pending. The backend still
  owns authorization, idempotency, and stale-deadline rejection.

## State replacements

- **Extended:** show the new deadline and success feedback. Disable another
  extension until its new warning phase, while leaving manual close available.
- **Closing / reconciling:** replace countdown and controls with a short-lived
  locked progress state. Do not introduce a persistent draining lifecycle.
- **Closed:** replace the warning with the close time and summarized ticket
  outcomes.
- **Reconciliation failure or unconfirmed state:** replace the controls with a
  danger recovery message, keep queue mutations fail-closed, and offer
  `Retry status`.
- **Permission denied:** keep the countdown visible for awareness, disable
  extend/close controls, and explain that an authorized queue operator is
  required.
- **Reconnect / reload:** restore the server deadline and announce that live
  state was synchronized.

## Prototype asset

Development-only comparison route:

`/dashboard/queue?queueClosePrototype=1&variant=C&prototypeState=warning`

Scenario values:

`warning`, `extended`, `reconciling`, `closed`, `error`, `denied`, and
`reconnected`.

Source assets:

- `frontend/src/pages/prototypes/QueueAutoClosePrototype.tsx`
- `frontend/src/pages/prototypes/QueueAutoClosePrototype.css`
- development-only routing in `frontend/src/App.tsx`

The prototype is a disposable interaction reference, not the production queue
lifecycle implementation.
