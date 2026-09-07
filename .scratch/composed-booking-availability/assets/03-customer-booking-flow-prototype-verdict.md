# Customer booking flow prototype verdict

## Question

Which UI structure best makes a composed visit understandable without turning it into a package catalog?

## Prototype reviewed

The dev-only prototype compared three layouts on the existing visual system:

- A — guided stepper
- B — visit planner
- C — timeline-first

## Verdict

Use **B — Visit planner** as the production implementation base.

It presents the selected branch and visit intent at the top, keeps arrangement and service selection in a focused working column, and keeps an always-visible visit summary beside it on wider screens. The summary must show selected items, order when Back-to-back is chosen, computed duration, total price, one payment requirement, and the next recovery action.

## Required interaction rules

1. The one-service fast path does not show arrangement selection.
2. A multi-service visit shows **Together** and **Back-to-back** with plain helper copy.
3. A Back-to-back service list uses Mantine UI's handle-based drag-and-drop pattern; visual order is submitted order.
4. Only services with units enabled show an item-level unit control.
5. The date/time action follows composition setup; candidate slots come only from the server-side composed-slot evaluator.
6. Unsupported arrangements/services remain visible but disabled with a customer-safe reason and a recovery action. Capacity numbers and internal scope names are never shown.

The throwaway route and variants were deleted after this verdict; this document is the durable prototype result.
