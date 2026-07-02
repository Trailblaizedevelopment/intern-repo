'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastData {
  id: number;
  message: string;
  type: ToastType;
  durationMs: number;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, durationMs?: number) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

const TOAST_ICONS: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const MAX_VISIBLE_TOASTS = 5;
const DEFAULT_DURATION_MS = 4500;

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [mounted, setMounted] = useState(false);
  const idRef = useRef(0);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    setMounted(true);
    return () => {
      timersRef.current.forEach(timer => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  const dismissToast = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'success', durationMs = DEFAULT_DURATION_MS) => {
      const id = ++idRef.current;
      setToasts(prev => [...prev.slice(-(MAX_VISIBLE_TOASTS - 1)), { id, message, type, durationMs }]);

      const timer = setTimeout(() => dismissToast(id), durationMs);
      timersRef.current.set(id, timer);
    },
    [dismissToast]
  );

  const toastStack =
    mounted && toasts.length > 0
      ? createPortal(
          <div className="crm-toast-stack" aria-live="polite">
            {toasts.map(toast => {
              const Icon = TOAST_ICONS[toast.type];
              return (
                <div
                  key={toast.id}
                  className={`crm-toast crm-toast-${toast.type} crm-toast-enter`}
                  role="status"
                >
                  <Icon size={18} className="crm-toast-icon" aria-hidden />
                  <span className="crm-toast-text">{toast.message}</span>
                  <button
                    type="button"
                    className="crm-toast-dismiss"
                    aria-label="Dismiss notification"
                    onClick={() => dismissToast(toast.id)}
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>,
          document.body
        )
      : null;

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toastStack}
    </ToastContext.Provider>
  );
}
