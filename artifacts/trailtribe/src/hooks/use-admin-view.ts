import { useState } from "react";

const STORAGE_KEY = "trailtribe_admin_view_v2";

/**
 * Persists the admin view preference in localStorage.
 * Defaults to false (clean view) so admins don't see the Admin and
 * Season Builder tabs until they explicitly enable admin mode.
 */
export function useAdminView() {
  const [adminViewEnabled, setAdminViewEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const toggleAdminView = () => {
    setAdminViewEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  };

  const setAdminView = (value: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {}
    setAdminViewEnabled(value);
  };

  return { adminViewEnabled, toggleAdminView, setAdminView };
}
