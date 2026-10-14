import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  BookOpen,
  CalendarDays,
  CheckSquare,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  User,
  UserRound,
  Users,
  Video,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession, displayName, initialsOf } from "@/hooks/useAuth";
import { useFriendships, useUnreadMessages } from "@/hooks/useSocial";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/tasks", label: "Daily Tasks", icon: CheckSquare, core: true },
  { to: "/planner", label: "Study Planner", icon: CalendarDays, core: true },
  { to: "/resources", label: "Notes & Resources", icon: BookOpen },
  { to: "/rooms", label: "Study Rooms", icon: Video },
  { to: "/groups", label: "Groups", icon: Users },
  { to: "/friends", label: "Friends", icon: UserRound },
  { to: "/messages", label: "Messages", icon: MessagesSquare },
  { to: "/profile", label: "Profile", icon: User },
] as const;

const MOBILE_PATHS = ["/dashboard", "/tasks", "/planner", "/rooms", "/friends", "/messages"] as const;
const MOBILE_NAV = NAV.filter((item) => (MOBILE_PATHS as readonly string[]).includes(item.to));

function NavLinks({ onNavigate, counts }: { onNavigate?: () => void; counts: Record<string, number> }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="space-y-1">
      {NAV.map(({ to, label, icon: Icon, ...rest }) => {
        const active = pathname === to;
        const count = counts[to] ?? 0;
        return (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-[var(--shadow-card)]"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{label}</span>
            {count > 0 ? (
              <span className="ml-auto grid size-5 shrink-0 place-items-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                {count > 9 ? "9+" : count}
              </span>
            ) : (
              "core" in rest &&
              rest.core &&
              !active && (
                <span className="ml-auto rounded-full bg-highlight/25 px-2 py-0.5 text-[10px] font-semibold text-highlight-foreground">
                  core
                </span>
              )
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function useReminders(userId: string | undefined) {
  return useQuery({
    queryKey: ["reminders", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const today = new Date();
      const iso = today.toISOString();
      const soon = new Date(today.getTime() + 24 * 3600 * 1000).toISOString();
      const dateStr = iso.slice(0, 10);
      const [tasks, sessions] = await Promise.all([
        supabase
          .from("tasks")
          .select("id,title,due_date")
          .eq("completed", false)
          .lte("due_date", dateStr)
          .order("due_date"),
        supabase
          .from("study_sessions")
          .select("id,title,starts_at")
          .gte("starts_at", iso)
          .lte("starts_at", soon)
          .order("starts_at"),
      ]);
      return [
        ...(tasks.data ?? []).map((t) => ({
          id: t.id,
          text: t.title,
          meta: t.due_date === dateStr ? "Due today" : "Overdue",
          to: "/tasks" as const,
        })),
        ...(sessions.data ?? []).map((s) => ({
          id: s.id,
          text: s.title,
          meta: `Starts ${new Date(s.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
          to: "/planner" as const,
        })),
      ];
    },
  });
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name,avatar_url")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });
  const { data: reminders = [] } = useReminders(user?.id);
  const friendships = useFriendships(user?.id);
  const unreadDms = useUnreadMessages(user?.id);

  const pendingRequests = friendships.data?.incoming.length ?? 0;
  const unreadCount = unreadDms.data?.length ?? 0;
  const counts = { "/friends": pendingRequests, "/messages": unreadCount };

  const allReminders = [
    ...reminders,
    ...(pendingRequests > 0
      ? [
          {
            id: "friend-requests",
            text: `${pendingRequests} friend request${pendingRequests > 1 ? "s" : ""}`,
            meta: "Waiting for your reply",
            to: "/friends" as const,
          },
        ]
      : []),
    ...(unreadCount > 0
      ? [
          {
            id: "unread-dms",
            text: `${unreadCount} unread message${unreadCount > 1 ? "s" : ""}`,
            meta: "Direct messages",
            to: "/messages" as const,
          },
        ]
      : []),
  ];

  const name = displayName(user, profile?.full_name);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const brand = (
    <Link to="/dashboard" className="flex min-w-0 items-center gap-2">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl gradient-hero text-primary-foreground">
        <BookOpen className="size-5" />
      </span>
      <span className="truncate font-display text-lg font-semibold">StudyHub</span>
    </Link>
  );

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-sidebar-border bg-sidebar p-4 lg:flex">
        {brand}
        <div className="mt-7 flex-1 overflow-y-auto">
          <NavLinks counts={counts} />
        </div>
        <button
          onClick={signOut}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent"
        >
          <LogOut className="size-4" /> Sign out
        </button>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 bg-sidebar p-4">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                {brand}
                <div className="mt-6">
                  <NavLinks onNavigate={() => setMobileOpen(false)} counts={counts} />
                </div>
                <button
                  onClick={signOut}
                  className="mt-4 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent"
                >
                  <LogOut className="size-4" /> Sign out
                </button>
              </SheetContent>
            </Sheet>
            <span className="truncate text-sm text-muted-foreground">
              Hi <span className="font-medium text-foreground">{name}</span> 👋
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative" aria-label="Reminders">
                  <Bell className="size-5" />
                  {allReminders.length > 0 && (
                    <span className="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                      {allReminders.length}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <p className="border-b border-border px-4 py-3 text-sm font-semibold">Reminders</p>
                {allReminders.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                    Nothing urgent. Enjoy the calm ✨
                  </p>
                ) : (
                  <ul className="max-h-72 divide-y divide-border overflow-y-auto">
                    {allReminders.map((r) => (
                      <li key={r.id}>
                        <Link to={r.to} className="block px-4 py-3 hover:bg-muted">
                          <p className="truncate text-sm font-medium">{r.text}</p>
                          <p className="text-xs text-muted-foreground">{r.meta}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </PopoverContent>
            </Popover>
            <Link to="/profile" aria-label="Profile">
              <Avatar className="size-9">
                {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt="" />}
                <AvatarFallback className="bg-secondary text-xs text-secondary-foreground">
                  {initialsOf(name)}
                </AvatarFallback>
              </Avatar>
            </Link>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 pb-24 pt-6 sm:px-6 lg:pb-10">{children}</main>

        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-6 border-t border-border bg-background/95 backdrop-blur lg:hidden">
          {MOBILE_NAV.map(({ to, label, icon: Icon }) => {
            const count = counts[to] ?? 0;
            return (
              <Link
                key={to}
                to={to}
                className="relative flex flex-col items-center gap-1 py-2.5 text-[9px] text-muted-foreground"
                activeProps={{ className: "text-primary font-semibold" }}
              >
                <Icon className="size-5" />
                <span className="truncate px-0.5">{label.split(" ")[0]}</span>
                {count > 0 && (
                  <span className="absolute right-2 top-1 grid size-4 place-items-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                    {count > 9 ? "9+" : count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
