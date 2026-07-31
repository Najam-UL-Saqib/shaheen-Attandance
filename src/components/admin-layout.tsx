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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

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

function getDisplayName(email: string | undefined) {
  if (!email) return "Admin";
  const namePart = email.split("@")[0].replace(/[._-]+/g, " ");
  return namePart.replace(/\b\w/g, (c) => c.toUpperCase());
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  const initials = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : name.slice(0, 2);
  return initials.toUpperCase();
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const displayName = getDisplayName(user?.email);

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
        <div className="px-5 py-5 border-b border-sidebar-border flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/90 shadow-sm shrink-0">
            <School className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm leading-tight truncate">Shaheen P.S.C.</div>
            <div className="text-xs opacity-70 truncate">Kallar Sayedan</div>
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
                className={`group relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-150 ${
                  active
                    ? "bg-sidebar-accent text-sidebar-foreground font-medium"
                    : "hover:bg-sidebar-accent/60 opacity-80 hover:opacity-100"
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r bg-primary" />
                )}
                <Icon className={`h-4 w-4 shrink-0 ${active ? "text-primary" : ""}`} />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-md">
            <Avatar className="h-8 w-8 shrink-0 ring-2 ring-sidebar-border">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                {getInitials(displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{displayName}</div>
              <div className="text-xs opacity-60 truncate">{user.email}</div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground mt-1"
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
