import React, { useState, useEffect, useRef, useCallback } from "react";
import { Bell, X, Car, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { useAuthedFetch } from "@/lib/use-authed-fetch";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

interface AppNotification {
  id: number;
  recipientUserId: number;
  type: string;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

function notifIcon(type: string) {
  if (type === "carpool_request_matched") return <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />;
  if (type === "carpool_offer_posted") return <Car className="h-5 w-5 text-primary shrink-0" />;
  return <AlertCircle className="h-5 w-5 text-orange-400 shrink-0" />;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();
  const authedFetch = useAuthedFetch();

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await authedFetch(`${BASE_URL}/api/notifications`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch {}
  }, [authedFetch]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleOpen = async () => {
    setOpen((prev) => !prev);
    if (!open && unreadCount > 0) {
      try {
        await authedFetch(`${BASE_URL}/api/notifications/read-all`, { method: "PATCH" });
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      } catch {}
    }
  };

  const handleDismiss = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      await authedFetch(`${BASE_URL}/api/notifications/${id}`, { method: "DELETE" });
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch {}
  };

  const handleNotifClick = (notif: AppNotification) => {
    setOpen(false);
    if (notif.link) {
      navigate(notif.link);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={handleOpen}
        className="relative flex items-center justify-center h-9 w-9 rounded-full hover:bg-accent transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed right-4 top-20 z-[100] w-[min(20rem,calc(100vw-2rem))] max-h-[calc(100dvh-6rem)] rounded-xl border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="font-semibold text-sm">Notifications</span>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded hover:bg-muted transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          <div className="max-h-[calc(100dvh-10rem)] overflow-y-auto divide-y divide-border">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No notifications yet
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleNotifClick(notif)}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors group",
                    !notif.isRead && "bg-orange-500/5"
                  )}
                >
                  {notifIcon(notif.type)}
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-medium leading-tight", !notif.isRead && "text-foreground")}>
                      {notif.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.body}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleDismiss(e, notif.id)}
                    className="p-1 rounded opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-muted transition-all shrink-0"
                    aria-label="Dismiss"
                  >
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
