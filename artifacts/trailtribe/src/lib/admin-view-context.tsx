import { createContext, useState, useCallback, useContext } from "react";

const STORAGE_KEY = "trailtribe_admin_view_v2";

interface AdminViewContextValue {
  adminViewEnabled: boolean;
  toggleAdminView: () => void;
  setAdminView: (value: boolean) => void;
}

export const AdminViewContext = createContext<AdminViewContextValue | null>(null);

export function AdminViewProvider({ children }: { children: React.ReactNode }) {
  const [adminViewEnabled, setAdminViewEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const toggleAdminView = useCallback(() => {
    setAdminViewEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  const setAdminView = useCallback((value: boolean) => {
    try { localStorage.setItem(STORAGE_KEY, String(value)); } catch {}
    setAdminViewEnabled(value);
  }, []);

  return (
    <AdminViewContext.Provider value={{ adminViewEnabled, toggleAdminView, setAdminView }}>
      {children}
    </AdminViewContext.Provider>
  );
}

export function useAdminViewContext(): AdminViewContextValue {
  const ctx = useContext(AdminViewContext);
  if (!ctx) throw new Error("useAdminViewContext must be used within AdminViewProvider");
  return ctx;
}
