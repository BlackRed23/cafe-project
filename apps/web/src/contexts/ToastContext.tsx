import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  link?: string;
}

interface ToastContextType {
  toasts: Toast[];
  toast: {
    success: (title: string, message?: string, link?: string) => void;
    error: (title: string, message?: string, link?: string) => void;
    warning: (title: string, message?: string, link?: string) => void;
    info: (title: string, message?: string, link?: string) => void;
  };
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToastState = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToastState must be used within a ToastProvider");
  return ctx;
};

const ICONS = {
  success: <CheckCircle size={18} className="text-emerald-500 flex-shrink-0" />,
  error: <XCircle size={18} className="text-rose-500 flex-shrink-0" />,
  warning: <AlertTriangle size={18} className="text-amber-500 flex-shrink-0" />,
  info: <Info size={18} className="text-blue-500 flex-shrink-0" />,
};

const STYLES = {
  success: "border-emerald-200 bg-white",
  error: "border-rose-200 bg-white",
  warning: "border-amber-200 bg-white",
  info: "border-blue-200 bg-white",
};

const BAR_STYLES = {
  success: "bg-emerald-500",
  error: "bg-rose-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

const TITLE_STYLES = {
  success: "text-emerald-800",
  error: "text-rose-800",
  warning: "text-amber-800",
  info: "text-blue-800",
};

const DURATION = 4000; // ms

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const [exiting, setExiting] = React.useState(false);

  const handleDismiss = React.useCallback(() => {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 280);
  }, [onDismiss, toast.id]);

  React.useEffect(() => {
    const timer = setTimeout(handleDismiss, DURATION);
    return () => clearTimeout(timer);
  }, [handleDismiss]);

  return (
    <div
      className={`relative w-80 max-w-[calc(100vw-2rem)] rounded-2xl shadow-xl border overflow-hidden
        ${STYLES[toast.type]}
        ${exiting ? "animate-toast-out" : "animate-toast-in"}
      `}
      role="alert"
    >
      {/* Progress bar */}
      <div
        className={`absolute top-0 left-0 h-0.5 w-full ${BAR_STYLES[toast.type]}`}
        style={{
          animation: `toast-progress ${DURATION}ms linear forwards`,
        }}
      />

      <div className="flex items-start gap-3 p-4">
        {ICONS[toast.type]}
        <div className="flex-1 min-w-0 pt-0.5">
          <p className={`text-[13px] font-bold leading-tight ${TITLE_STYLES[toast.type]}`}>
            {toast.title}
          </p>
          {toast.message && (
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">{toast.message}</p>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 p-0.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-all"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

const LOCAL_STORAGE_KEY = "admin_local_toasts";

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<Toast[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [floatingToasts, setFloatingToasts] = useState<Toast[]>([]);

  React.useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(toasts));
  }, [toasts]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissFloating = useCallback((id: string) => {
    setFloatingToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastType, title: string, message?: string, link?: string) => {
      const id = `${Date.now()}-${Math.random()}`;
      const t = { id, type, title, message, link };
      setToasts((prev) => [...prev.slice(-49), t]); // Keep up to 50 in history
      setFloatingToasts((prev) => [...prev, t]); // Show as floating
    },
    []
  );

  const toast = {
    success: (title: string, message?: string, link?: string) => addToast("success", title, message, link),
    error: (title: string, message?: string, link?: string) => addToast("error", title, message, link),
    warning: (title: string, message?: string, link?: string) => addToast("warning", title, message, link),
    info: (title: string, message?: string, link?: string) => addToast("info", title, message, link),
  };

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(100%) scale(0.96); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes toast-out {
          from { opacity: 1; transform: translateX(0) scale(1); }
          to   { opacity: 0; transform: translateX(110%) scale(0.96); }
        }
        @keyframes toast-progress {
          from { width: 100%; }
          to   { width: 0%; }
        }
        .animate-toast-in  { animation: toast-in  0.3s cubic-bezier(.22,1,.36,1) both; }
        .animate-toast-out { animation: toast-out 0.28s cubic-bezier(.55,0,1,.45) both; }
      `}</style>

      {children}

      {/* Toast portal (Top Right near the Bell) */}
      <div
        className="fixed top-20 right-5 z-[9999] flex flex-col gap-2.5 items-end pointer-events-none"
        aria-live="polite"
      >
        {floatingToasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onDismiss={dismissFloating} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx.toast;
};
