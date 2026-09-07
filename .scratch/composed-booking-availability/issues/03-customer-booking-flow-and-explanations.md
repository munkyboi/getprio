# Customer booking flow and arrangement explanations

Type: prototype
Status: resolved
Claimed by: Codex (/root)
Blocked by: 01, 02

## Question

How should the customer booking UI make Together and Back-to-back intuitive, retain the one-service fast path, collect per-service units, and explain unavailable arrangements or services without exposing capacity internals?

## Prototype asset and verdict

- [Customer booking flow prototype verdict](../assets/03-customer-booking-flow-prototype-verdict.md) — the customer selected the Visit planner layout as the production base; the throwaway route was removed after the verdict.

## Resolution must decide

1. The exact standard and group-funded step sequences.
2. Customer-facing labels, helper copy, disabled states, and recovery actions.
3. When the date and time picker appears relative to service selection and calculated visit duration.
4. How the summary explains item order, total duration, price, and payment compatibility.

## Resolution

Use the **Visit planner** layout. It puts location/visit intent at the top, arrangement and service composition in the primary workspace, and an always-visible computed visit summary beside it on desktop.

The standard and group-funded flows share this composition section. The one-service fast path bypasses arrangement choice. A multi-service visit exposes Together and Back-to-back, then per-item units where supported. Back-to-back order is controlled through the agreed Mantine handle-based drag-and-drop list. Only after the composition is valid does the customer pick date/time from server-evaluated composed slots.

Unavailable services or arrangements stay visible with a plain explanation and recovery action, never a raw capacity count. The summary explains service order, total duration, summed price, and the single compatible payment requirement.
