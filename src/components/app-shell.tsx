import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, roleFlags } from "@/hooks/use-current-user";
import {
  UtensilsCrossed, LayoutDashboard, Users, Fingerprint, CalendarClock,
  CreditCard, ClipboardList, BarChart3, Settings, ShieldCheck, LogOut, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  show: (f: ReturnType<typeof roleFlags>) => boolean;
}

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, show: () => true },
  { to: "/students", label: "Students", icon: Users, show: (f) => f.isSuperAdmin || f.isManager || f.isCounterStaff || f.isAccountant },
  { to: "/biometric", label: "Biometric Mapping", icon: Fingerprint, show: (f) => f.isSuperAdmin || f.isManager },
  { to: "/subscriptions", label: "Subscriptions", icon: CalendarClock, show: (f) => f.isSuperAdmin || f.isManager || f.isAccountant },
  { to: "/payments", label: "Payments", icon: CreditCard, show: (f) => f.isSuperAdmin || f.isManager || f.isCounterStaff || f.isAccountant },
  { to: "/attendance", label: "Attendance", icon: ClipboardList, show: (f) => f.isSuperAdmin || f.isManager || f.isCounterStaff },
  { to: "/reports", label: "Reports", icon: BarChart3, show: (f) => f.isSuperAdmin || f.isManager || f.isAccountant },
  { to: "/import", label: "Import Data", icon: Upload, show: (f) => f.isSuperAdmin || f.isManager },
  { to: "/settings", label: "Settings", icon: Settings, show: (f) => f.isSuperAdmin },
  { to: "/users", label: "Users & Roles", icon: ShieldCheck, show: (f) => f.isSuperAdmin },
];

export function AppShell() {
  const { profile, roles, loading } = useCurrentUser();
  const flags = roleFlags(roles);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  };

  const primaryRole = roles[0] ?? "no role";

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-64 hidden md:flex flex-col bg-sidebar border-r text-sidebar-foreground">
        <div className="p-4 border-b flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground grid place-items-center">
            <UtensilsCrossed className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold leading-tight">Vrindavan Meals</div>
            <div className="text-xs text-muted-foreground">Canteen Portal</div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {NAV.filter((n) => n.show(flags)).map((n) => {
            const active = pathname === n.to || pathname.startsWith(n.to + "/");
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t space-y-2">
          {profile?.name ? (
            <div className="text-xs font-medium truncate">{profile.name}</div>
          ) : null}
          <Badge variant="secondary" className="capitalize">{primaryRole.replace("_", " ")}</Badge>
          <Button variant="outline" size="sm" className="w-full" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" />Sign out
          </Button>
        </div>

      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b bg-card flex items-center px-4 md:px-6 justify-between">
          <div className="md:hidden font-semibold">Vrindavan Meals</div>
          <Button variant="ghost" size="sm" className="md:hidden" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </header>
        <div className="flex-1 p-4 md:p-6 overflow-y-auto">
          {loading ? (
            <div className="text-muted-foreground">Loading…</div>
          ) : !flags.hasAny ? (
            <NoRoleNotice />
          ) : (
            <Outlet />
          )}
        </div>
      </main>
    </div>
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
