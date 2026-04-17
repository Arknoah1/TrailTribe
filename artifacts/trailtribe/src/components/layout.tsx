import React from "react";
import { Link, useLocation } from "wouter";
import { Home, Calendar, Car, MessageSquare, User as UserIcon, ShieldCheck, Sun, Moon, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetMe } from "@workspace/api-client-react";
import { NotificationBell } from "./notification-bell";
import { useTheme } from "@/lib/theme-context";

const baseNavItems = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/carpools", label: "Carpools", icon: Car },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/profile", label: "Profile", icon: UserIcon },
];

const adminNavItem = { href: "/admin", label: "Admin", icon: ShieldCheck };
const seasonBuilderNavItem = { href: "/season-builder", label: "Season Builder", icon: Layers };

function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
        className
      )}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: me } = useGetMe();

  const isCoachOrAdmin = me?.role === "coach" || me?.role === "admin";
  const navItems = isCoachOrAdmin
    ? [...baseNavItems.slice(0, 4), adminNavItem, seasonBuilderNavItem, baseNavItems[4]]
    : baseNavItems;

  const mobileItems = isCoachOrAdmin
    ? [baseNavItems[0], baseNavItems[1], baseNavItems[2], adminNavItem, baseNavItems[4]]
    : baseNavItems;

  return (
    <div className="flex min-h-[100dvh] w-full flex-col md:flex-row bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-card">
        <div className="p-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">TrailTribe</h1>
            {isCoachOrAdmin && (
              <span className="text-xs text-primary font-semibold uppercase tracking-wider mt-0.5 block">
                Coach View
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            {me && <NotificationBell />}
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || location.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile Top Bar (notification bell) */}
      {me && (
        <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-2 bg-card border-b border-border">
          <span className="text-lg font-bold text-foreground">TrailTribe</span>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <NotificationBell />
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className={cn("flex-1 overflow-y-auto pb-16 md:pb-0", me ? "pt-12 md:pt-0" : "")}>
        {children}
      </main>

      {/* Mobile Bottom Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-card flex justify-around p-2 z-50">
        {mobileItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href || location.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 p-2 text-xs font-medium transition-colors min-w-0 flex-1",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
