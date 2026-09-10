import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "../button";
import { Dialog } from "./dialog";

export interface ConfirmationOptions {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string | null;
  destructive?: boolean;
}
type Confirm = (options: ConfirmationOptions) => Promise<boolean>;
const ConfirmationContext = createContext<Confirm | null>(null);

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmationOptions | null>(null);
  const [open, setOpen] = useState(false);
  const pending = useRef<((confirmed: boolean) => void) | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const confirm = useCallback<Confirm>((next) => {
    if (pending.current) return Promise.resolve(false);
    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setOptions(next);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      pending.current = resolve;
    });
  }, []);
  const finish = useCallback((confirmed: boolean) => {
    const resolve = pending.current;
    pending.current = null;
    setOpen(false);
    resolve?.(confirmed);
  }, []);
  useEffect(
    () => () => {
      pending.current?.(false);
      pending.current = null;
    },
    [],
  );
  return (
    <ConfirmationContext.Provider value={confirm}>
      {children}
      <Dialog.Root
        role="alertdialog"
        open={open}
        onOpenChange={(next) => {
          if (!next) finish(false);
        }}
        onOpenChangeComplete={(next) => {
          if (!next && !pending.current) setOptions(null);
        }}
      >
        {options && (
          <Dialog
            size="base"
            className="space-y-4"
            finalFocus={() =>
              previousFocus.current?.isConnected ? previousFocus.current : false
            }
          >
            <Dialog.Title>{options.title}</Dialog.Title>
            <Dialog.Description>{options.description}</Dialog.Description>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              {options.cancelLabel !== null && (
                <Dialog.Close render={<Button />}>
                  {options.cancelLabel ?? "Cancel"}
                </Dialog.Close>
              )}
              <Button
                variant={options.destructive ? "destructive" : "primary"}
                onClick={() => finish(true)}
              >
                {options.confirmLabel ?? "Continue"}
              </Button>
            </div>
          </Dialog>
        )}
      </Dialog.Root>
    </ConfirmationContext.Provider>
  );
}

export function useConfirmation(): Confirm {
  const confirm = useContext(ConfirmationContext);
  if (!confirm)
    throw new Error("useConfirmation requires ConfirmationProvider.");
  return confirm;
}
