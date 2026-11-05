/** Keep focus inside the dialog's own scroll region without moving the page behind it. */
export function scrollTaskControlIntoView(
  main: HTMLElement,
  control: HTMLElement,
) {
  if (!main.contains(control)) return;
  // Pointer focus can land on the panel before a label activates its input.
  // Revealing that structural container moves the whole form away from the pointer.
  if (control.getAttribute?.("role") === "tabpanel") return;
  const viewport = main.getBoundingClientRect();
  const field = control.getBoundingClientRect();
  const inset = 8;
  if (field.height > viewport.height - inset * 2) {
    main.scrollTop += field.top - viewport.top - inset;
  } else if (field.bottom > viewport.bottom - inset) {
    main.scrollTop += field.bottom - viewport.bottom + inset;
  } else if (field.top < viewport.top + inset) {
    main.scrollTop += field.top - viewport.top - inset;
  }
}
