"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { CheckCircle, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "info" | "error";

type Toast = {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
};

type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
};

type ToastContextValue = {
  toast: (input: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((items) => items.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    ({ title, description, tone = "info" }: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((items) => [...items.slice(-3), { id, title, description, tone }]);
      window.setTimeout(() => removeToast(id), 4200);
    },
    [removeToast]
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[80] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((item) => (
          <ToastItem key={item.id} toast={item} onClose={() => removeToast(item.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      toast: () => {},
    };
  }
  return context;
}

function ToastItem({
  toast,
  onClose,
}: {
  toast: Toast;
  onClose: () => void;
}) {
  const Icon = toast.tone === "success" ? CheckCircle : toast.tone === "error" ? XCircle : Info;

  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border bg-white p-3 shadow-lg shadow-slate-200/70",
        toast.tone === "success" && "border-[#A6E45E]",
        toast.tone === "info" && "border-[#71E0E7]",
        toast.tone === "error" && "border-red-200"
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          toast.tone === "success" && "text-lime-600",
          toast.tone === "info" && "text-cyan-600",
          toast.tone === "error" && "text-red-600"
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-950">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 text-sm leading-5 text-slate-500">{toast.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded p-1 text-slate-400 hover:text-slate-700"
        aria-label="Dismiss notification"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
