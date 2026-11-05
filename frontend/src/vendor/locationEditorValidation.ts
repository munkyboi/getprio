/** Reveal the first invalid field, including a field in a kept-mounted tab. */
export function validateLocationEditor(form: HTMLFormElement, selectTab: (tab: string) => void) {
  const invalid = Array.from(form.elements).find((element): element is HTMLInputElement =>
    "willValidate" in element && Boolean(element.willValidate) && "validity" in element && !(element.validity as ValidityState).valid,
  );
  if (!invalid) return true;
  const tab = invalid.closest<HTMLElement>("[data-location-tab]")?.dataset.locationTab;
  if (tab) selectTab(tab);
  window.requestAnimationFrame(() => {
    if (!invalid.isConnected) return;
    invalid.focus();
    invalid.reportValidity();
  });
  return false;
}
