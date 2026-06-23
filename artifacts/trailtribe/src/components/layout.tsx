import React from "react";
import { Link, useLocation } from "wouter";
import { Home, Calendar, Car, MessageSquare, User as UserIcon, ShieldCheck, Sun, Moon, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetMe } from "@workspace/api-client-react";
import { NotificationBell } from "./notification-bell";
import { useTheme } from "@/lib/theme-context";
import { RidgelineBanner } from "./illustrations";

const baseNavItems = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/carpools", label: "Carpools", icon: Car },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/profile", label: "Profile", icon: UserIcon },
];

const adminNavItem = { href: "/admin", label: "Admin", icon: ShieldCheck };
const seasonBuilderNavItem = { href: "/season-builder", label: "Season", icon: Layers };

function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border-2 border-[#0a0c10] bg-secondary text-muted-foreground hover:text-foreground shadow-cel-sm cel-interactive transition-colors",
        className
      )}
      title={theme === "dark" ? "Day Ride mode" : "Night Ride mode"}
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
    ? [baseNavItems[0], baseNavItems[1], baseNavItems[2], adminNavItem, seasonBuilderNavItem, baseNavItems[4]]
    : baseNavItems;

  return (
    <div className="flex min-h-[100dvh] w-full flex-col md:flex-row bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r-2 border-[#0a0c10] bg-card">
        {/* Wordmark */}
        <div className="p-6 flex items-start justify-between border-b-2 border-[#0a0c10]">
          <div>
            <h1 className="font-display text-3xl tracking-wider text-primary leading-none">TrailTribe</h1>
            {isCoachOrAdmin && (
              <span className="text-[10px] text-accent font-bold uppercase tracking-[0.12em] mt-1 block">
                Coach View
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            {me && <NotificationBell />}
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || location.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold uppercase tracking-wide transition-all border-2 cel-interactive",
                  isActive
                    ? "border-[#0a0c10] bg-primary text-primary-foreground shadow-cel-sm"
                    : "border-transparent text-muted-foreground hover:border-[#0a0c10] hover:bg-secondary hover:text-foreground hover:shadow-cel-sm"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {item.label}
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-current" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar footer with ridgeline */}
        <div className="border-t-2 border-[#0a0c10] overflow-hidden">
          <RidgelineBanner animated className="h-14 opacity-60" />
        </div>
      </aside>

      {/* Mobile Top Bar */}
      {me && (
        <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-2 bg-card border-b-2 border-[#0a0c10] shadow-cel-sm">
          <span className="font-display text-2xl tracking-wider text-primary leading-none">TrailTribe</span>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <NotificationBell />
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className={cn("flex-1 overflow-y-auto pb-20 md:pb-0", me ? "pt-14 md:pt-0" : "")}>
        {children}
      </main>

      {/* Mobile Bottom Bar — ridgeline divider + 64px tabs */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50">
        {/* Ridgeline silhouette chrome strip */}
        <svg
          viewBox="0 0 390 16"
          className="w-full block"
          preserveAspectRatio="none"
          aria-hidden="true"
          style={{ height: 14, marginBottom: -1 }}
        >
          <path
            d="M0 16 L0 10 L20 8 L40 12 L60 6 L80 10 L100 4 L118 9 L130 5 L145 11 L160 7 L175 10 L190 3 L205 8 L220 5 L235 10 L250 6 L265 12 L280 8 L295 5 L310 9 L325 4 L340 10 L355 7 L370 11 L390 6 L390 16 Z"
            fill="hsl(var(--card))"
            stroke="#0a0c10"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
        <nav
          className="bg-card border-t-2 border-[#0a0c10] flex justify-around items-stretch"
          style={{ height: 64 }}
        >
        {mobileItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href || location.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-bold uppercase tracking-wide transition-all min-w-0 flex-1 relative",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {isActive && (
                <span className="absolute top-0 left-2 right-2 h-1 bg-primary rounded-b-sm" />
              )}
              <Icon className={cn("h-5 w-5 shrink-0", isActive && "text-primary")} />
              <span className="truncate leading-none">{item.label}</span>
            </Link>
          );
        })}
        </nav>
      </div>
    </div>
  );
}
