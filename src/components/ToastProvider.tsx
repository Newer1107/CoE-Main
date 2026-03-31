"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

type ToastVariant = "success" | "error" | "info";

type ToastRecord = {
  id: number;
  message: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  pushToast: (message: string, variant?: ToastVariant, durationMs?: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const variantStyles: Record<ToastVariant, string> = {
  success: "bg-green-50 border-green-300 text-green-800",
  error: "bg-red-50 border-red-300 text-red-700",
  info: "bg-[#eef4ff] border-[#b9c7de] text-[#1a3766]",
};

const variantIcons: Record<ToastVariant, string> = {
  success: "✔",
  error: "✖",
  info: "ℹ",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (message: string, variant: ToastVariant = "info", durationMs = 3500) => {
      if (!message) return;

      const id = Date.now() + Math.floor(Math.random() * 1000);
      setToasts((prev) => [...prev, { id, message, variant }]);

      window.setTimeout(() => {
        dismissToast(id);
      }, durationMs);
    },
    [dismissToast]
  );

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className="pointer-events-none fixed right-4 top-[96px] z-[160] flex w-[min(92vw,420px)] flex-col gap-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto border rounded-xl shadow-lg px-4 py-3 flex items-start gap-3 transition-all duration-300 ease-out animate-[slideIn_0.25s_ease] ${variantStyles[toast.variant]}`}
            role="status"
            aria-live="polite"
          >
            <div className="text-base mt-0.5">{variantIcons[toast.variant]}</div>

            <div className="flex-1 text-sm leading-snug">
              {toast.message}
            </div>

            <button
              onClick={() => dismissToast(toast.id)}
              className="text-xs font-bold opacity-60 hover:opacity-100 transition"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <style jsx global>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(40px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return context;
}
