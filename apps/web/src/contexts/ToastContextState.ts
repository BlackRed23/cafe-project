import { createContext, useContext } from "react";

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

export const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToastState = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToastState must be used within a ToastProvider");
  return ctx;
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx.toast;
};
