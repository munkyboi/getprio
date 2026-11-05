import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

type Presentation = {
  report: (id: string, busy: boolean, draft: boolean) => void;
};
const AccountContext = createContext<Presentation | null>(null);

/** Shared self-account handlers keep their customer UI outside this vendor scope. */
export function AccountPresentation({
  children,
  onBusyChange,
  onDraftChange,
}: {
  children: ReactNode;
  onBusyChange: (busy: boolean) => void;
  onDraftChange: (draft: boolean) => void;
}) {
  const busyTasks = useRef(new Set<string>()),
    drafts = useRef(new Set<string>());
  const report = useCallback(
    (id: string, busy: boolean, draft: boolean) => {
      if (busy) busyTasks.current.add(id);
      else busyTasks.current.delete(id);
      if (draft) drafts.current.add(id);
      else drafts.current.delete(id);
      onBusyChange(busyTasks.current.size > 0);
      onDraftChange(drafts.current.size > 0);
    },
    [onBusyChange, onDraftChange],
  );
  const value = useMemo(() => ({ report }), [report]);
  return (
    <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
  );
}
export function useVendorAccount() {
  return Boolean(useContext(AccountContext));
}
export function discardAccountTask(vendor: boolean, edited: boolean) {
  return (
    !vendor ||
    !edited ||
    window.confirm("Discard these unsaved account changes?")
  );
}
export function useAccountTask(busy: boolean, draft = false) {
  const presentation = useContext(AccountContext),
    id = useId();
  useEffect(() => {
    presentation?.report(id, busy, draft);
  }, [presentation, id, busy, draft]);
  useEffect(
    () => () => {
      presentation?.report(id, false, false);
    },
    [presentation, id],
  );
}
