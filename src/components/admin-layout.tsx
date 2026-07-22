import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  BookOpen,
  GraduationCap,
  Users,
  DoorOpen,
  ClipboardList,
  CalendarDays,
  CalendarClock,
  BarChart3,
  Settings,
  LogOut,
  LayoutDashboard,
  School,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/subjects", label: "Subjects", icon: BookOpen },
  { to: "/classes", label: "Classes & Sections", icon: GraduationCap },
  { to: "/teachers", label: "Teachers", icon: Users },
  { to: "/rooms", label: "Rooms", icon: DoorOpen },
  { to: "/allocations", label: "Workload Allocation", icon: ClipboardList },
  { to: "/timetable", label: "Timetable", icon: CalendarDays },
  { to: "/day-view", label: "Day View", icon: CalendarClock },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AdminLayout({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="w-64 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="px-5 py-5 border-b border-sidebar-border flex items-center gap-2">
          <School className="h-6 w-6" />
          <div>
            <div className="font-semibold text-sm leading-tight">Shaheen P.S.C.</div>
            <div className="text-xs opacity-70">Kallar Sayedan</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((n) => {
            const active =
              n.to === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(n.to);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "hover:bg-sidebar-accent/60 opacity-90"
                }`}
              >
                <Icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border space-y-2">
          <div className="text-xs opacity-70 px-2 truncate">{user.email}</div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
            onClick={async () => {
              await signOut();
              navigate({ to: "/login" });
            }}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
