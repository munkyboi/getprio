/** Track each form separately so saving one does not discard another's edits. */
export function createDirtyForms() {
  const forms = new Set();
  return {
    mark(form) { forms.add(form); },
    clear(form) { if (form) forms.delete(form); else forms.clear(); },
    hasEdits() {
      // Closed task dialogs and departed tabs intentionally discard their forms.
      for (const form of forms) if (!form.isConnected) forms.delete(form);
      return forms.size > 0;
    }
  };
}
