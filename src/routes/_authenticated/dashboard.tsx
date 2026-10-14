import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CheckSquare, FileText, UserRound, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession, displayName, initialsOf } from "@/hooks/useAuth";
import { useFriendships, useInvitations, useUnreadMessages } from "@/hooks/useSocial";
import { PageHeader, LoadingCards } from "@/components/Page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { fmtDayLabel, fmtTime, toDateKey } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — StudyHub" },
      {
        name: "description",
        content: "Your study day at a glance: today's tasks, sessions and shared resources.",
      },
      { property: "og:title", content: "Dashboard — StudyHub" },
      { property: "og:description", content: "Your personalised study overview." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = useSession();
  const todayKey = toDateKey(new Date());

  const friendships = useFriendships(user?.id);
  const invitations = useInvitations(user?.id);
  const unreadDms = useUnreadMessages(user?.id);

  const overview = useQuery({
    queryKey: ["stats", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const [tasks, sessions, resources, rooms] = await Promise.all([
        supabase.from("tasks").select("id,title,priority,due_date,completed"),
        supabase.from("study_sessions").select("id,title,subject,starts_at,completed").order("starts_at"),
        supabase.from("resources").select("id"),
        supabase.from("study_rooms").select("id,name,scheduled_at,meeting_url").order("scheduled_at"),
      ]);
      if (tasks.error) throw tasks.error;
      if (sessions.error) throw sessions.error;
      return {
        tasks: tasks.data ?? [],
        sessions: sessions.data ?? [],
        resourceCount: resources.data?.length ?? 0,
        rooms: rooms.data ?? [],
      };
    },
  });

  if (overview.isLoading || !overview.data) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Dashboard" />
        <LoadingCards count={4} />
      </div>
    );
  }

  const { tasks, sessions, resourceCount, rooms } = overview.data;
  const openToday = tasks.filter(
    (task) => !task.completed && task.due_date !== null && task.due_date <= todayKey,
  );
  const done = tasks.filter((task) => task.completed).length;
  const todaysSessions = sessions.filter(
    (session) => toDateKey(new Date(session.starts_at)) === todayKey,
  );
  const nextRoom = rooms[0];

  const stats = [
    { label: "Tasks due today", value: openToday.length, icon: CheckSquare, to: "/tasks" as const },
    { label: "Sessions today", value: todaysSessions.length, icon: CalendarDays, to: "/planner" as const },
    { label: "Resources shared", value: resourceCount, icon: FileText, to: "/resources" as const },
    { label: "Tasks completed", value: done, icon: UserRound, to: "/tasks" as const },
  ];

  const friends = friendships.data?.friends ?? [];
  const pendingRequests = friendships.data?.incoming.length ?? 0;
  const incomingInvites = invitations.data?.incoming.length ?? 0;
  const unreadCount = unreadDms.data?.length ?? 0;
  const socialNotes = [
    pendingRequests > 0
      ? { text: `${pendingRequests} friend request${pendingRequests > 1 ? "s" : ""} waiting`, to: "/friends" as const }
      : null,
    incomingInvites > 0
      ? {
          text: `${incomingInvites} group invite${incomingInvites > 1 ? "s" : ""} for you`,
          to: "/friends" as const,
        }
      : null,
    unreadCount > 0
      ? { text: `${unreadCount} unread message${unreadCount > 1 ? "s" : ""}`, to: "/messages" as const }
      : null,
  ].filter((note) => note !== null);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={`Hi, ${displayName(user).split(" ")[0]}`}
        subtitle={`${fmtDayLabel(new Date())} — here's what your day looks like.`}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.label} to={stat.to} className="surface p-4 transition-shadow hover:shadow-[var(--shadow-lift)]">
            <stat.icon className="size-5 text-muted-foreground" />
            <p className="mt-3 font-serif text-3xl font-semibold">{stat.value}</p>
            <p className="text-sm text-muted-foreground">{stat.label}</p>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className="surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Today's tasks</h2>
            <Button asChild size="sm" variant="ghost">
              <Link to="/tasks">Open</Link>
            </Button>
          </div>
          {openToday.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing due today. Enjoy the breathing room.</p>
          ) : (
            <ul className="space-y-2.5">
              {openToday.slice(0, 5).map((task) => (
                <li key={task.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <span className="truncate text-sm">{task.title}</span>
                  <Badge variant="outline" className="shrink-0">
                    {task.priority}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Study sessions</h2>
            <Button asChild size="sm" variant="ghost">
              <Link to="/planner">Plan</Link>
            </Button>
          </div>
          {todaysSessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions scheduled today.</p>
          ) : (
            <ul className="space-y-3">
              {todaysSessions.map((session) => (
                <li key={session.id}>
                  <p className="truncate text-sm font-medium">{session.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtTime(session.starts_at)}
                    {session.subject ? ` · ${session.subject}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="surface mt-5 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">Study circle</h2>
          <Button asChild size="sm" variant="ghost">
            <Link to="/friends">Manage</Link>
          </Button>
        </div>
        {friends.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No friends yet — search for a classmate and send them a request to start sharing.
          </p>
        ) : (
          <div className="flex items-center gap-3">
            <ul className="flex flex-wrap items-center gap-2">
              {friends.slice(0, 7).map((row) => (
                <li key={row.id}>
                  <Avatar className="size-9">
                    {row.other?.avatar_url && <AvatarImage src={row.other.avatar_url} alt="" />}
                    <AvatarFallback className="bg-secondary text-xs text-secondary-foreground">
                      {initialsOf(row.other?.full_name || "Student")}
                    </AvatarFallback>
                  </Avatar>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              {friends.length} {friends.length === 1 ? "friend" : "friends"}
              {friends.length > 7 ? ` · +${friends.length - 7} more` : ""}
            </p>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {socialNotes.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing new from your circle right now.</p>
          ) : (
            socialNotes.map((note) => (
              <Button asChild key={note.text} size="sm" variant="outline">
                <Link to={note.to}>{note.text}</Link>
              </Button>
            ))
          )}
        </div>
      </section>

      {nextRoom && (
        <section className="surface mt-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 p-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Study room
            </p>
            <p className="mt-1 truncate font-medium">{nextRoom.name}</p>
            <p className="text-sm text-muted-foreground">
              {fmtDayLabel(nextRoom.scheduled_at)} · {fmtTime(nextRoom.scheduled_at)}
            </p>
          </div>
          <Button asChild className="shrink-0">
            <Link to="/rooms">
              <Video className="size-4" /> Rooms
            </Link>
          </Button>
        </section>
      )}
    </div>
  );
}
