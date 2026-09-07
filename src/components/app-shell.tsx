import { useState } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, roleFlags } from "@/hooks/use-current-user";
import {
  UtensilsCrossed, LayoutDashboard, Users, CalendarClock,
  ClipboardList, BarChart3, Settings, ShieldCheck, LogOut, Receipt, ShoppingCart, Menu,
  ChevronsLeft, ChevronsRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  show: (f: ReturnType<typeof roleFlags>) => boolean;
}

// Primary nav — money-first order. Operational tools (biometric, imports,
// users, raw payments log) are reachable from /settings for admins.
const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, show: (f) => f.isSuperAdmin || f.isManager || f.isAccountant },
  { to: "/dues", label: "Dues / Ledger", icon: Receipt, show: (f) => f.isSuperAdmin || f.isManager || f.isAccountant },
  { to: "/students", label: "Students", icon: Users, show: (f) => f.isSuperAdmin || f.isManager || f.isCounterStaff || f.isAccountant },
  { to: "/subscriptions", label: "Subscriptions", icon: CalendarClock, show: (f) => f.isSuperAdmin || f.isManager || f.isAccountant },
  { to: "/attendance", label: "Attendance", icon: ClipboardList, show: (f) => f.isSuperAdmin || f.isManager || f.isCounterStaff },
  { to: "/pos", label: "POS", icon: ShoppingCart, show: (f) => f.isSuperAdmin || f.isManager || f.isCounterStaff || f.isAccountant },
  { to: "/reports", label: "Reports", icon: BarChart3, show: (f) => f.isSuperAdmin || f.isManager || f.isAccountant },
  { to: "/settings", label: "Settings", icon: Settings, show: (f) => f.isSuperAdmin },
];

// Bottom tab bar on phones — the five most-used destinations.
const BOTTOM_TABS = ["/dashboard", "/dues", "/students", "/pos", "/attendance"];

const isActivePath = (pathname: string, to: string) =>
  pathname === to || pathname.startsWith(to + "/");

const SIDEBAR_COLLAPSED_KEY = "vm-sidebar-collapsed";

export function AppShell() {
  const { profile, roles, loading } = useCurrentUser();
  const flags = roleFlags(roles);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return typeof window !== "undefined" && localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1"; } catch { return false; }
  });

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  };

  const primaryRole = roles[0] ?? "no role";
  const items = NAV.filter((n) => n.show(flags));
  const tabs = items.filter((n) => BOTTOM_TABS.includes(n.to)).slice(0, 5);

  const navLinks = (onNavigate?: () => void, iconOnly = false) =>
    items.map((n) => {
      const active = isActivePath(pathname, n.to);
      const link = (
        <Link
          key={n.to}
          to={n.to}
          onClick={onNavigate}
          aria-label={iconOnly ? n.label : undefined}
          className={cn(
            "flex items-center gap-3 px-3 min-h-11 rounded-md text-sm transition-colors",
            iconOnly && "justify-center px-0",
            active
              ? "bg-sidebar-primary text-sidebar-primary-foreground"
              : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          )}
        >
          <n.icon className="h-4 w-4 shrink-0" />
          {!iconOnly && n.label}
        </Link>
      );
      if (!iconOnly) return link;
      return (
        <Tooltip key={n.to}>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right">{n.label}</TooltipContent>
        </Tooltip>
      );
    });

  return (
    <TooltipProvider delayDuration={200}>
    <div className="min-h-screen flex bg-background overflow-x-hidden">
      <aside className={cn(
        "hidden md:flex flex-col bg-sidebar border-r text-sidebar-foreground transition-[width] duration-200",
        collapsed ? "w-16" : "w-64",
      )}>
        <div className={cn("p-4 border-b flex items-center gap-2", collapsed && "justify-center p-3")}>
          <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground grid place-items-center shrink-0">
            <UtensilsCrossed className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="font-semibold leading-tight truncate">Vrindavan Meals</div>
              <div className="text-xs text-muted-foreground">Canteen Portal</div>
            </div>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={toggleCollapsed}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{collapsed ? "Expand sidebar" : "Collapse sidebar"}</TooltipContent>
          </Tooltip>
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto overflow-x-hidden">{navLinks(undefined, collapsed)}</nav>
        <div className={cn("p-3 border-t space-y-2", collapsed && "p-2 flex flex-col items-center")}>
          {!collapsed && profile?.name ? (
            <div className="text-xs font-medium truncate">{profile.name}</div>
          ) : null}
          {!collapsed && <Badge variant="secondary" className="capitalize">{primaryRole.replace("_", " ")}</Badge>}
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={signOut} aria-label="Sign out">
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Sign out</TooltipContent>
            </Tooltip>
          ) : (
            <Button variant="outline" size="sm" className="w-full" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-2" />Sign out
            </Button>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden h-14 border-b bg-card sticky top-0 z-30 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-2">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[17rem] p-0 bg-sidebar text-sidebar-foreground">
              <div className="p-4 border-b flex items-center gap-2">
                <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground grid place-items-center shrink-0">
                  <UtensilsCrossed className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold leading-tight truncate">Vrindavan Meals</div>
                  <div className="text-xs text-muted-foreground">Canteen Portal</div>
                </div>
              </div>
              <nav className="p-2 space-y-1 overflow-y-auto">{navLinks(() => setDrawerOpen(false))}</nav>
              <div className="p-3 border-t space-y-2">
                {profile?.name ? <div className="text-xs font-medium truncate">{profile.name}</div> : null}
                <Badge variant="secondary" className="capitalize">{primaryRole.replace("_", " ")}</Badge>
                <Button variant="outline" size="sm" className="w-full min-h-11" onClick={signOut}>
                  <LogOut className="h-4 w-4 mr-2" />Sign out
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          <div className="font-semibold truncate">Vrindavan Meals</div>
          <Button variant="ghost" size="icon" className="h-11 w-11" onClick={signOut} aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </header>
        <div className="flex-1 p-3 pb-24 sm:p-4 md:p-6 md:pb-6 overflow-x-hidden">
          <PullToRefresh>
            {/* Only gate on the very first load. Background auth refreshes must never
                unmount <Outlet />, or in-progress form input would be lost. */}
            {loading && roles.length === 0 && !profile ? (
              <div className="text-muted-foreground">Loading…</div>
            ) : !flags.hasAny ? (
              <NoRoleNotice />
            ) : (
              <Outlet />
            )}
          </PullToRefresh>
        </div>


        {tabs.length > 0 && (
          <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-card grid print:hidden"
            style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
            {tabs.map((n) => {
              const active = isActivePath(pathname, n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 min-h-14 text-[11px] px-1",
                    active ? "text-primary font-semibold" : "text-muted-foreground",
                  )}
                >
                  <n.icon className="h-5 w-5" />
                  <span className="truncate max-w-full">{n.label.split(" ")[0]}</span>
                </Link>
              );
            })}
          </nav>
        )}
      </main>
    </div>
    </TooltipProvider>
  );
}

function NoRoleNotice() {
  return (
    <div className="max-w-lg mx-auto mt-16 text-center space-y-3">
      <div className="mx-auto h-12 w-12 rounded-full bg-warning/20 grid place-items-center">
        <ShieldCheck className="h-6 w-6 text-warning-foreground" />
      </div>
      <h2 className="text-xl font-semibold">Account pending role assignment</h2>
      <p className="text-muted-foreground">
        Your account has been created but no role has been assigned yet.
        Please ask a Super Admin to grant you access.
      </p>
    </div>
  );
}
