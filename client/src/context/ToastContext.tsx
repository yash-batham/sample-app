import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";

type ToastSeverity = "success" | "warning" | "error";

interface Toast {
  message: string;
  severity: ToastSeverity;
}

interface ToastContextValue {
  showSuccess: (message: string) => void;
  showWarning: (message: string) => void;
  showError: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);

  const show = useCallback((severity: ToastSeverity, message: string) => setToast({ message, severity }), []);
  const value = useMemo<ToastContextValue>(
    () => ({
      showSuccess: (message: string) => show("success", message),
      showWarning: (message: string) => show("warning", message),
      showError: (message: string) => show("error", message),
    }),
    [show]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)} variant="filled">
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
