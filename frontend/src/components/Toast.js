import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const ToastContext = createContext(null);

const DEFAULT_DURATION = 4500;
const ICONS = { success: "\u2713", error: "!", info: "i" };

function ConfirmDialog({ opts, onResult }) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (cancelRef.current) cancelRef.current.focus();
    function onKey(e) {
      if (e.key === "Escape") onResult(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onResult]);

  return (
    <div className="confirm-overlay" onClick={() => onResult(false)}>
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={opts.message}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="confirm-message">{opts.message}</p>
        <div className="confirm-actions">
          <button
            type="button"
            className="confirm-btn ghost"
            ref={cancelRef}
            onClick={() => onResult(false)}
          >
            {opts.cancelLabel || "Cancel"}
          </button>
          <button
            type="button"
            className="confirm-btn danger"
            onClick={() => onResult(true)}
          >
            {opts.confirmLabel || "Yes"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Mounts one shared toast slot and a promise-based confirm dialog.
 * A new toast replaces the current one.
 */
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null); // { type, title, message }
  const [confirmState, setConfirmState] = useState(null); // { opts, resolve }
  const timer = useRef(null);
  const confirmResolve = useRef(null);

  const dismissToast = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setToast(null);
  }, []);

  const showToast = useCallback((type, title, message, opts = {}) => {
    setToast({ type, title, message });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), opts.duration || DEFAULT_DURATION);
  }, []);

  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        if (confirmResolve.current) confirmResolve.current(false);
        confirmResolve.current = resolve;
        setConfirmState({ opts });
      }),
    []
  );

  const resolveConfirm = useCallback((result) => {
    const resolve = confirmResolve.current;
    confirmResolve.current = null;
    setConfirmState(null);
    if (resolve) resolve(result);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const value = useMemo(
    () => ({ showToast, dismissToast, confirm }),
    [showToast, dismissToast, confirm]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <div className={`toast toast-${toast.type}`} role="alert">
          <span className="toast-icon" aria-hidden="true">
            {ICONS[toast.type] || "!"}
          </span>
          <div className="toast-body">
            <strong className="toast-title">{toast.title}</strong>
            {toast.message && <span className="toast-msg">{toast.message}</span>}
          </div>
          <button
            type="button"
            className="toast-close"
            onClick={dismissToast}
            aria-label="Dismiss"
          >
            {"\u00d7"}
          </button>
        </div>
      )}
      {confirmState && (
        <ConfirmDialog opts={confirmState.opts} onResult={resolveConfirm} />
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
