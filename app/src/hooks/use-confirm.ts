import { createContext, useCallback, useContext, useRef, useState } from "react";
import { createElement } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmCtx);
  if (!fn) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return fn;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    resolverRef.current?.(false); // auto-cancel any pending confirm
    setOpts(options);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  function handle(result: boolean) {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOpen(false);
    setOpts(null);
  }

  return createElement(
    ConfirmCtx.Provider,
    { value: confirm },
    children,
    opts &&
      createElement(ConfirmDialog, {
        open,
        ...opts,
        onConfirm: () => handle(true),
        onCancel: () => handle(false),
      })
  );
}
