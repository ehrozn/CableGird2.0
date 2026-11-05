import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode, useEffect, useSyncExternalStore } from "react";

import { useT } from "@/lib/i18n";
import { storageError } from "@/lib/store";

/** Catches render crashes so one broken screen never blanks the whole app. Data stays in the browser. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("CableGrid crashed", error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="blueprint grid min-h-dvh place-items-center p-6">
        <div className="panel w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-bad-soft text-bad">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-extrabold">Something went wrong · Algo salió mal · Что-то пошло не так</h1>
          <p className="mt-2 text-sm text-sub">Your data is safe in this browser. Reload the page; if it repeats, make a backup in Settings.</p>
          <pre className="mt-4 max-h-28 overflow-auto rounded-lg bg-[#F6F8F5] p-2 text-left font-mono text-[11px] text-sub">{this.state.error.message}</pre>
          <button onClick={() => location.reload()} className="mt-5 inline-flex h-10 items-center gap-2 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white">
            <RotateCcw className="h-4 w-4" /> Reload
          </button>
        </div>
      </div>
    );
  }
}

const sub = (f: () => void) => {
  storageError.listeners.add(f);
  return () => void storageError.listeners.delete(f);
};

/** Asks the browser not to evict data, and warns loudly when saving to the device fails. */
export const StorageGuard = () => {
  const t = useT();
  const err = useSyncExternalStore(sub, () => storageError.current);
  useEffect(() => {
    void navigator.storage?.persist?.().catch(() => undefined);
  }, []);
  if (!err) return null;
  return (
    <div role="alert" className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 bg-bad px-4 py-2 text-sm font-semibold text-white shadow-lg">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      {err === "QuotaExceededError"
        ? t("The browser storage is full — recent changes are NOT saved. Export a backup now and free up space.")
        : t("Changes could not be saved on this device. Export a backup now (Settings → Backup).")}
    </div>
  );
};
