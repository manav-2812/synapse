import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { Icon } from "../components/ui/Icon";

export type ToastType = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  type: ToastType;
  title?: string;
  message: string;
}

interface ToastValue {
  toast: (type: ToastType, title: string | undefined, message: string) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (type: ToastType, title: string | undefined, message: string) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, type, title, message }]);

      // Automatically dispatch to workspace inbox
      const lower = `${title || ""} ${message}`.toLowerCase();
      const kind = lower.includes("quiz")
        ? "quiz"
        : lower.includes("doc") || lower.includes("file") || lower.includes("upload")
        ? "document"
        : "system";

      window.dispatchEvent(
        new CustomEvent("synapse:new-notification", {
          detail: {
            id: `toast:${id}`,
            kind,
            title: title || message,
            subtitle: title ? message : undefined,
            at: new Date().toISOString(),
            to: kind === "quiz" ? "/quiz" : kind === "document" ? "/documents" : "/dashboard",
          },
        })
      );

      window.setTimeout(() => {
        dismissToast(id);
      }, 3800);
    },
    [dismissToast],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="toast-region"
        role="region"
        aria-live="polite"
        aria-label="Notifications"
      >
        {toasts.map((t) => {
          const iconName =
            t.type === "success"
              ? "check"
              : t.type === "error"
              ? "close"
              : t.type === "warning"
              ? "sparkles"
              : "info";

          return (
            <div key={t.id} className={`toast toast-${t.type}`} role="status">
              {/* Subtle Inline Status Icon */}
              <span className={`toast-inline-icon icon-${t.type}`}>
                <Icon name={iconName} size={15} />
              </span>

              {/* Toast Text Content */}
              <div className="toast-body">
                {t.title && <div className="toast-title">{t.title}</div>}
                <div className="toast-msg">{t.message}</div>
              </div>

              {/* Minimal Dismiss Button */}
              <button
                type="button"
                className="toast-close-btn"
                onClick={() => dismissToast(t.id)}
                aria-label="Dismiss notification"
              >
                <Icon name="close" size={11} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
