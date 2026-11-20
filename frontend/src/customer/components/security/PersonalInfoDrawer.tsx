import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { SheetClose } from "../shadcn/sheet";
import { CustomerDialog } from "../details/CustomerDialog";
import { Button } from "../ui";
import { ResponsiveDrawer } from "../vendor/ResponsiveDrawer";
type CommandState = { busy: boolean; dirty: boolean; discard?: () => void };
const CommandContext = createContext<
  ((key: string, state: CommandState | null) => void) | null
>(null);
// Observe existing controller state only; commands and OTP effects stay in their owners.
export function usePersonalInfoCommand(
  key: string,
  busy: boolean,
  dirty: boolean,
  onDiscard?: () => void,
) {
  const report = useContext(CommandContext);
  const discardRef = useRef(onDiscard);
  useLayoutEffect(() => { discardRef.current = onDiscard; }, [onDiscard]);
  useLayoutEffect(() => {
    report?.(key, { busy, dirty, discard: () => discardRef.current?.() });
    return () => report?.(key, null);
  }, [report, key, busy, dirty]);
}
export function PersonalInfoDrawer({
  children,
  trigger,
  footer,
  busy,
  dirty,
  onDiscard,
  title = "Personal info",
  description = "Keep your contact details up to date.",
}: {
  children: ReactNode;
  trigger: ReactNode;
  footer: ReactNode;
  busy: boolean;
  dirty: boolean;
  onDiscard: () => void;
  title?: string;
  description?: string;
}) {
  const [commands, setCommands] = useState<Record<string, CommandState>>({});
  const report = useCallback(
    (key: string, state: CommandState | null) =>
      setCommands((current) => {
        const next = { ...current };
        if (state) next[key] = state;
        else delete next[key];
        return next;
      }),
    [],
  );
  const [discard, setDiscard] = useState(false),
    [open, setOpen] = useState(false);
  const blocked = busy || Object.values(commands).some((value) => value.busy);
  const hasDraft =
    dirty || Object.values(commands).some((value) => value.dirty);
  return (
    <CommandContext.Provider value={report}>
      <ResponsiveDrawer
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        trigger={trigger}
        footer={
          <>
            <SheetClose
              disabled={blocked}
              render={<Button variant="outline" />}
            >
              Cancel
            </SheetClose>
            {footer}
          </>
        }
        busy={blocked}
        canClose={() => {
          if (hasDraft) {
            setDiscard(true);
            return false;
          }
          return true;
        }}
      >
        {children}
      </ResponsiveDrawer>
      <CustomerDialog
        title="Discard unsaved changes?"
        description="Your changes have not been saved."
        open={discard}
        onOpenChange={setDiscard}
        footer={
          <>
            <Button variant="outline" onClick={() => setDiscard(false)}>
              Keep editing
            </Button>
            <Button
              onClick={() => {
                Object.values(commands).forEach((command) =>
                  command.discard?.(),
                );
                onDiscard();
                setDiscard(false);
                setOpen(false);
              }}
            >
              Discard changes
            </Button>
          </>
        }
      />
    </CommandContext.Provider>
  );
}
