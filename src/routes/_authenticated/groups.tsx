import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2, LogIn, MessageCircle, Plus, Send, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useAuth";
import { PageHeader, EmptyState, LoadingCards, ErrorNote } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SUBJECTS, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/groups")({
  head: () => ({
    meta: [
      { title: "Study Groups — StudyHub" },
      {
        name: "description",
        content: "Join subject study groups and chat with friends in real time.",
      },
      { property: "og:title", content: "Study Groups — StudyHub" },
      { property: "og:description", content: "Group chat for collaborative studying." },
    ],
  }),
  component: GroupsPage,
});

type Group = {
  id: string;
  name: string;
  description: string | null;
  subject: string | null;
  created_by: string;
};

type Message = { id: string; body: string; user_id: string; created_at: string };

const groupSchema = z.object({
  name: z.string().trim().min(1, "Name your group").max(120),
  description: z.string().trim().max(400).optional(),
  subject: z.string().optional(),
});

function GroupsPage() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const groupsQuery = useQuery({
    queryKey: ["groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("groups")
        .select("id,name,description,subject,created_by")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Group[];
    },
  });

  const membershipQuery = useQuery({
    queryKey: ["group-members", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase.from("group_members").select("group_id,user_id");
      if (error) throw error;
      return data ?? [];
    },
  });

  const myGroupIds = useMemo(
    () =>
      new Set(
        (membershipQuery.data ?? [])
          .filter((row) => row.user_id === user?.id)
          .map((row) => row.group_id),
      ),
    [membershipQuery.data, user?.id],
  );

  const active = (groupsQuery.data ?? []).find((group) => group.id === activeId) ?? null;
  const isMember = active ? myGroupIds.has(active.id) : false;

  const messagesQuery = useQuery({
    queryKey: ["group-messages", activeId],
    enabled: Boolean(activeId) && isMember,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("group_messages")
        .select("id,body,user_id,created_at")
        .eq("group_id", activeId!)
        .order("created_at")
        .limit(200);
      if (error) throw error;
      return data as Message[];
    },
  });

  const authorIds = useMemo(
    () => Array.from(new Set((messagesQuery.data ?? []).map((m) => m.user_id))),
    [messagesQuery.data],
  );

  const authorsQuery = useQuery({
    queryKey: ["message-authors", authorIds],
    enabled: authorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name")
        .in("id", authorIds);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((row) => [row.id, row.full_name])) as Record<
        string,
        string
      >;
    },
  });

  useEffect(() => {
    if (!activeId || !isMember) return;
    const channel = supabase
      .channel(`group-${activeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_messages",
          filter: `group_id=eq.${activeId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ["group-messages", activeId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeId, isMember, queryClient]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messagesQuery.data]);

  const createGroup = useMutation({
    mutationFn: async (values: z.infer<typeof groupSchema>) => {
      const { data, error } = await supabase
        .from("groups")
        .insert({
          created_by: user!.id,
          name: values.name,
          description: values.description || null,
          subject: values.subject || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: memberError } = await supabase
        .from("group_members")
        .insert({ group_id: data.id, user_id: user!.id });
      if (memberError) throw memberError;
      return data.id as string;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["group-members"] });
      setOpen(false);
      setActiveId(id);
      toast.success("Group created");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const joinGroup = useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase
        .from("group_members")
        .upsert({ group_id: groupId, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: (_data, groupId) => {
      queryClient.invalidateQueries({ queryKey: ["group-members"] });
      setActiveId(groupId);
      toast.success("You've joined the group");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const send = useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase
        .from("group_messages")
        .insert({ group_id: activeId!, user_id: user!.id, body });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["group-messages", activeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const groups = groupsQuery.data ?? [];
  const memberCounts = (membershipQuery.data ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.group_id] = (acc[row.group_id] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Study Groups"
        subtitle="Small groups, real conversations — ask questions and share what you find."
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> New group
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="min-w-0">
          {groupsQuery.isLoading ? (
            <LoadingCards />
          ) : groupsQuery.isError ? (
            <ErrorNote />
          ) : groups.length === 0 ? (
            <EmptyState
              icon={<Users className="size-6" />}
              title="No groups yet"
              body="Start one for your course and invite your friends."
            />
          ) : (
            <ul className="space-y-2">
              {groups.map((group) => (
                <li key={group.id}>
                  <button
                    onClick={() => setActiveId(group.id)}
                    className={cn(
                      "surface w-full px-4 py-3 text-left transition-colors hover:bg-secondary/60",
                      activeId === group.id && "border-primary/40 bg-secondary/70",
                    )}
                  >
                    <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                      <span className="truncate text-sm font-medium">{group.name}</span>
                      <Badge variant="outline" className="shrink-0">
                        {memberCounts[group.id] ?? 0}
                      </Badge>
                    </span>
                    {group.subject && (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {group.subject}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="surface flex min-h-[26rem] flex-col overflow-hidden">
          {!active ? (
            <div className="grid flex-1 place-items-center px-6 py-16 text-center">
              <div>
                <MessageCircle className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  Pick a group to open its chat.
                </p>
              </div>
            </div>
          ) : (
            <>
              <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <h2 className="truncate font-medium">{active.name}</h2>
                  {active.description && (
                    <p className="truncate text-xs text-muted-foreground">{active.description}</p>
                  )}
                </div>
                {!isMember && (
                  <Button size="sm" onClick={() => joinGroup.mutate(active.id)}>
                    <LogIn className="size-4" /> Join
                  </Button>
                )}
              </header>

              {!isMember ? (
                <div className="grid flex-1 place-items-center px-6 py-14 text-center text-sm text-muted-foreground">
                  Join this group to read and send messages.
                </div>
              ) : (
                <>
                  <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                    {messagesQuery.isLoading ? (
                      <LoadingCards count={2} />
                    ) : (messagesQuery.data ?? []).length === 0 ? (
                      <p className="py-10 text-center text-sm text-muted-foreground">
                        No messages yet — say hello.
                      </p>
                    ) : (
                      (messagesQuery.data ?? []).map((message) => {
                        const mine = message.user_id === user?.id;
                        return (
                          <div
                            key={message.id}
                            className={cn("flex", mine ? "justify-end" : "justify-start")}
                          >
                            <div
                              className={cn(
                                "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm",
                                mine
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-secondary text-secondary-foreground",
                              )}
                            >
                              {!mine && (
                                <p className="mb-0.5 text-xs font-semibold opacity-80">
                                  {authorsQuery.data?.[message.user_id] ?? "Student"}
                                </p>
                              )}
                              <p className="whitespace-pre-wrap break-words">{message.body}</p>
                              <p className="mt-1 text-[0.65rem] opacity-70">
                                {fmtTime(message.created_at)}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={endRef} />
                  </div>
                  <form
                    className="flex gap-2 border-t border-border p-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const body = draft.trim();
                      if (!body) return;
                      send.mutate(body.slice(0, 1000));
                    }}
                  >
                    <Input
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder="Write a message"
                      maxLength={1000}
                      aria-label="Message"
                    />
                    <Button type="submit" disabled={send.isPending || draft.trim().length === 0}>
                      {send.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Send className="size-4" />
                      )}
                    </Button>
                  </form>
                </>
              )}
            </>
          )}
        </section>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create a study group</DialogTitle>
            <DialogDescription>Anyone on StudyHub can find and join it.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const parsed = groupSchema.safeParse({
                name: String(form.get("name") ?? ""),
                description: String(form.get("description") ?? ""),
                subject: String(form.get("subject") ?? ""),
              });
              if (!parsed.success) {
                toast.error(parsed.error.issues[0]?.message ?? "Check the form");
                return;
              }
              createGroup.mutate(parsed.data);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="name">Group name</Label>
              <Input id="name" name="name" placeholder="CS Year 2" maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" maxLength={400} />
            </div>
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Select name="subject">
                <SelectTrigger>
                  <SelectValue placeholder="Subject" />
                </SelectTrigger>
                <SelectContent>
                  {SUBJECTS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createGroup.isPending}>
                {createGroup.isPending && <Loader2 className="size-4 animate-spin" />}
                Create group
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
