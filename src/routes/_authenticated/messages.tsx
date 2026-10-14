import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2, MessagesSquare, Send, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession, initialsOf } from "@/hooks/useAuth";
import { useFriendships, useSocialRealtime, useUnreadMessages } from "@/hooks/useSocial";
import { PageHeader, EmptyState, LoadingCards, ErrorNote } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { fmtDayLabel, fmtTime } from "@/lib/format";

type MessageRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

export const Route = createFileRoute("/_authenticated/messages")({
  head: () => ({
    meta: [
      { title: "Messages — StudyHub" },
      {
        name: "description",
        content: "Private one-to-one chats with the friends you study with.",
      },
      { property: "og:title", content: "Messages — StudyHub" },
      { property: "og:description", content: "Chat privately with your study circle." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { friend?: string } => ({
    friend: typeof search.friend === "string" && search.friend.length > 0 ? search.friend : undefined,
  }),
  component: MessagesPage,
});

function MessagesPage() {
  const { user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { friend: friendId } = Route.useSearch();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useSocialRealtime(user?.id);
  const friendships = useFriendships(user?.id);
  const unread = useUnreadMessages(user?.id);

  const previews = useQuery({
    queryKey: ["dm-previews", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("direct_messages")
        .select("id,sender_id,recipient_id,body,created_at,read_at")
        .or(`sender_id.eq.${user!.id},recipient_id.eq.${user!.id}`)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as MessageRow[];
    },
  });

  const thread = useQuery({
    queryKey: ["dm-thread", user?.id, friendId],
    enabled: Boolean(user?.id && friendId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("direct_messages")
        .select("id,sender_id,recipient_id,body,created_at,read_at")
        .or(
          `and(sender_id.eq.${user!.id},recipient_id.eq.${friendId}),and(sender_id.eq.${friendId},recipient_id.eq.${user!.id})`,
        )
        .order("created_at", { ascending: true })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as MessageRow[];
    },
  });

  // Opening a conversation clears its unread marks.
  useEffect(() => {
    if (!user?.id || !friendId) return;
    const hasUnread = (unread.data ?? []).some((row) => row.sender_id === friendId);
    if (!hasUnread) return;
    void supabase
      .from("direct_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", user.id)
      .eq("sender_id", friendId)
      .is("read_at", null);
    queryClient.invalidateQueries({ queryKey: ["dm-unread"] });
  }, [user?.id, friendId, unread.data, queryClient]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [thread.data?.length, friendId]);

  const send = useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase
        .from("direct_messages")
        .insert({ sender_id: user!.id, recipient_id: friendId!, body });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["dm-thread"] });
      queryClient.invalidateQueries({ queryKey: ["dm-previews"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const friends = useMemo(() => friendships.data?.friends ?? [], [friendships.data]);

  const { lastByPeer, unreadByPeer } = useMemo(() => {
    const last = new Map<string, MessageRow>();
    for (const message of previews.data ?? []) {
      const peer = message.sender_id === user?.id ? message.recipient_id : message.sender_id;
      if (!last.has(peer)) last.set(peer, message);
    }
    const counts = new Map<string, number>();
    for (const message of unread.data ?? []) {
      counts.set(message.sender_id, (counts.get(message.sender_id) ?? 0) + 1);
    }
    return { lastByPeer: last, unreadByPeer: counts };
  }, [previews.data, unread.data, user?.id]);

  const ordered = useMemo(() => {
    return [...friends]
      .filter((row) => row.other)
      .sort((a, b) => {
        const aTime = lastByPeer.get(a.other!.id)?.created_at ?? "";
        const bTime = lastByPeer.get(b.other!.id)?.created_at ?? "";
        if (aTime !== bTime) return bTime.localeCompare(aTime);
        return (a.other!.full_name ?? "").localeCompare(b.other!.full_name ?? "");
      });
  }, [friends, lastByPeer]);

  const selected = friends.find((row) => row.other?.id === friendId)?.other ?? null;

  if (friendships.isLoading) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Messages" />
        <LoadingCards count={3} />
      </div>
    );
  }
  if (friendships.isError) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Messages" />
        <ErrorNote />
      </div>
    );
  }

  if (ordered.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Messages" subtitle="Private chats open once you're friends." />
        <EmptyState
          icon={<MessagesSquare className="size-6" />}
          title="No conversations yet"
          body="Add a classmate as a friend and you can message each other one-to-one."
          action={
            <Button asChild>
              <Link to="/friends">Find classmates</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Messages" subtitle="Private chats with your study circle." />

      <div className="grid gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className={cn("surface overflow-hidden p-2", selected && "hidden lg:block")}>
          <ul className="max-h-[32rem] divide-y divide-border overflow-y-auto">
            {ordered.map((row) => {
              const person = row.other!;
              const last = lastByPeer.get(person.id);
              const pending = unreadByPeer.get(person.id) ?? 0;
              const active = person.id === friendId;
              return (
                <li key={row.id}>
                  <button
                    onClick={() => navigate({ to: "/messages", search: { friend: person.id } })}
                    className={cn(
                      "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-3 text-left transition-colors",
                      active ? "bg-secondary" : "hover:bg-muted",
                    )}
                  >
                    <Avatar className="size-9">
                      {person.avatar_url && <AvatarImage src={person.avatar_url} alt="" />}
                      <AvatarFallback className="bg-secondary text-xs text-secondary-foreground">
                        {initialsOf(person.full_name || "Student")}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{person.full_name || "Student"}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {last ? (last.mine_hint ?? "") : "No messages yet"}
                        {last ? last.body : ""}
                      </span>
                    </span>
                    {pending > 0 && (
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                        {pending}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className={cn("surface flex min-h-[30rem] flex-col overflow-hidden", !selected && "hidden lg:flex")}>
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-14 text-center">
              <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
                <MessagesSquare className="size-6" />
              </span>
              <h3 className="mt-4 text-lg font-semibold">Pick a friend</h3>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Choose someone on the left to read and reply to your private chat.
              </p>
            </div>
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-border px-4 py-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Back to conversations"
                  onClick={() => navigate({ to: "/messages", search: { friend: undefined } })}
                >
                  <ArrowLeft className="size-4" />
                </Button>
                <Avatar className="size-8">
                  {selected.avatar_url && <AvatarImage src={selected.avatar_url} alt="" />}
                  <AvatarFallback className="bg-secondary text-xs text-secondary-foreground">
                    {initialsOf(selected.full_name || "Student")}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{selected.full_name || "Student"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {selected.institution || selected.course ? "Study friend" : "Direct chat"}
                  </p>
                </div>
              </header>

              <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {thread.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading chat…</p>
                ) : (thread.data ?? []).length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No messages yet — say hello and plan a session.
                  </p>
                ) : (
                  (thread.data ?? []).map((message) => {
                    const mine = message.sender_id === user?.id;
                    return (
                      <div key={message.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                        <div
                          className={cn(
                            "max-w-[80%] rounded-2xl px-3.5 py-2",
                            mine
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-secondary-foreground",
                          )}
                        >
                          <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
                          <p className={cn("mt-1 text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                            {fmtDayLabel(message.created_at) === "Today"
                              ? fmtTime(message.created_at)
                              : `${fmtDayLabel(message.created_at)} · ${fmtTime(message.created_at)}`}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <form
                className="flex items-center gap-2 border-t border-border p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const body = draft.trim();
                  if (!body) return;
                  send.mutate(body.slice(0, 2000));
                }}
              >
                <Input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={`Message ${selected.full_name?.split(" ")[0] || "your friend"}…`}
                  maxLength={2000}
                  autoFocus
                />
                <Button type="submit" size="icon" className="shrink-0" disabled={send.isPending || !draft.trim()} aria-label="Send message">
                  {send.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </Button>
              </form>
            </>
          )}
        </section>
      </div>

      <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <UserRound className="size-3.5" />
        Only friends you've both accepted can message you here.
      </p>
    </div>
  );
}
