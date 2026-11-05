type EditorControl = HTMLElement & {willValidate?: boolean; validity?: ValidityState; validationMessage?: string; reportValidity?: () => boolean};
type State = {quantityError:string;checkingSlug:boolean;slugAvailable:boolean;slugMessage:string};

/** Select through the real tab control, then focus only after the kept panel is shown. */
export function revealServiceEditorField(form:HTMLFormElement, control:EditorControl) {
  const tab=control.closest<HTMLElement>('[data-service-tab]')?.dataset.serviceTab;
  if(tab==='general'||tab==='booking'||tab==='locations')
    form.querySelector<HTMLButtonElement>(`[data-service-tab-trigger="${tab}"]`)?.click();
  window.requestAnimationFrame(()=>{
    if(!control.isConnected)return;
    control.focus();
    control.reportValidity?.();
  });
}

/** Native and async/custom constraints participate in the same complete DOM-order pass. */
export function validateServiceEditor(form:HTMLFormElement,state:State):string|null {
  const slug=form.querySelector<EditorControl>('[data-service-field="slug"]');
  const quantity=form.querySelector<EditorControl>('[data-service-field="quantity"] input[type="number"]');
  for(const element of Array.from(form.elements)) {
    const control=element as EditorControl;
    if(!control.willValidate)continue;
    const message=control===slug&&state.checkingSlug?'Checking booking link availability. Please try again in a moment.':
      control===slug&&!state.slugAvailable?(state.slugMessage||'Choose an available booking link name before saving.'):
      control===quantity&&state.quantityError?state.quantityError:
      control.validity&&!control.validity.valid?(control.validationMessage||'Review the highlighted field.'):'';
    if(message){revealServiceEditorField(form,control);return message;}
  }
  // An unmounted/unsupported slug control must never bypass the existing async gate.
  if(state.checkingSlug||!state.slugAvailable)return state.slugMessage||'Wait for an available booking link name before saving.';
  if(state.quantityError)return state.quantityError;
  return null;
}
