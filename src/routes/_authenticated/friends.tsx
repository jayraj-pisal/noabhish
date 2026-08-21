import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  Loader2,
  MessagesSquare,
  Search,
  UserPlus,
  UserRound,
  UserX,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useAuth";
import { useFriendships, useInvitations, useSocialRealtime, type FriendProfile } from "@/hooks/useSocial";
import { PageHeader, EmptyState, LoadingCards, ErrorNote } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initialsOf } from "@/hooks/useAuth";
import { fmtDayLabel } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/friends")({
  head: () => ({
    meta: [
      { title: "Friends — StudyHub" },
      {
        name: "description",
        content: "Find classmates, send friend requests and invite friends into study groups and rooms.",
      },
      { property: "og:title", content: "Friends — StudyHub" },
      { property: "og:description", content: "Build your study circle on StudyHub." },
    ],
  }),
  component: FriendsPage,
});

function PersonRow({
  person,
  meta,
  children,
}: {
  person: FriendProfile | null;
  meta?: string;
  children?: React.ReactNode;
}) {
  const name = person?.full_name?.trim() || "Student";
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3">
      <Avatar className="size-10">
        {person?.avatar_url && <AvatarImage src={person.avatar_url} alt="" />}
        <AvatarFallback className="bg-secondary text-xs text-secondary-foreground">
          {initialsOf(name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {meta ?? [person?.course, person?.institution].filter(Boolean).join(" · ") || "Student on StudyHub"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">{children}</div>
    </li>
  );
}

function FriendsPage() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");

  useSocialRealtime(user?.id);
  const friendships = useFriendships(user?.id);
  const invitations = useInvitations(user?.id);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["friendships"] });
    queryClient.invalidateQueries({ queryKey: ["invitations"] });
  };

  const search = useQuery({
    queryKey: ["student-search", query],
    enabled: query.trim().length > 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name,avatar_url,institution,course,bio")
        .ilike("full_name", `%${query.trim()}%`)
        .neq("id", user!.id)
        .limit(20);
      if (error) throw error;
      return (data ?? []) as FriendProfile[];
    },
  });

  const myTargets = useQuery({
    queryKey: ["invite-targets", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const [memberships, rooms] = await Promise.all([
        supabase.from("group_members").select("group_id").eq("user_id", user!.id),
        supabase.from("study_rooms").select("id,name,scheduled_at").eq("host_id", user!.id).order("scheduled_at"),
      ]);
      const groupIds = (memberships.data ?? []).map((row) => row.group_id);
      const groups = groupIds.length
        ? (await supabase.from("groups").select("id,name").in("id", groupIds)).data ?? []
        : [];
      return { groups, rooms: rooms.data ?? [] };
    },
  });

  const sendRequest = useMutation({
    mutationFn: async (targetId: string) => {
      const { error } = await supabase
        .from("friendships")
        .insert({ requester_id: user!.id, addressee_id: targetId, status: "pending" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Friend request sent");
      refresh();
    },
    onError: (error: Error) =>
      toast.error(
        error.message.includes("duplicate") ? "You already have a request with this student." : error.message,
      ),
  });

  const respond = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "accepted" | "declined" }) => {
      const { error } = await supabase.from("friendships").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      toast.success(variables.status === "accepted" ? "You're friends now 🎉" : "Request declined");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeFriend = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("friendships").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const invite = useMutation({
    mutationFn: async ({
      kind,
      targetId,
      inviteeId,
    }: {
      kind: "group" | "room";
      targetId: string;
      inviteeId: string;
    }) => {
      const { error } = await supabase.from("invitations").insert({
        kind,
        target_id: targetId,
        inviter_id: user!.id,
        invitee_id: inviteeId,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Invite sent"),
    onError: (error: Error) =>
      toast.error(error.message.includes("duplicate") ? "Already invited." : error.message),
  });

  const respondInvite = useMutation({
    mutationFn: async ({
      id,
      kind,
      targetId,
      status,
    }: {
      id: string;
      kind: "group" | "room";
      targetId: string;
      status: "accepted" | "declined";
    }) => {
      if (status === "accepted") {
        const join =
          kind === "group"
            ? await supabase.from("group_members").insert({ group_id: targetId, user_id: user!.id })
            : await supabase.from("room_participants").insert({ room_id: targetId, user_id: user!.id });
        if (join.error && !join.error.message.includes("duplicate")) throw join.error;
      }
      const { error } = await supabase.from("invitations").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      toast.success(variables.status === "accepted" ? "Joined!" : "Invite declined");
      refresh();
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (friendships.isLoading) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Friends" />
        <LoadingCards count={3} />
      </div>
    );
  }
  if (friendships.isError) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Friends" />
        <ErrorNote />
      </div>
    );
  }

  const data = friendships.data!;
  const relatedIds = new Set(data.all.map((row) => (row.requester_id === user?.id ? row.addressee_id : row.requester_id)));
  const incomingInvites = invitations.data?.incoming ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Friends"
        subtitle="Find classmates, swap notes and study together."
      />

      <form
        className="surface mb-5 flex gap-2 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(term);
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search students by name"
            className="pl-9"
            maxLength={80}
          />
        </div>
        <Button type="submit" className="shrink-0">
          Search
        </Button>
      </form>

      {query.trim().length > 1 && (
        <section className="surface mb-5 p-5">
          <h2 className="mb-1 font-medium">Search results</h2>
          {search.isLoading ? (
            <p className="py-4 text-sm text-muted-foreground">Searching…</p>
          ) : (search.data ?? []).length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No students matched “{query}”.</p>
          ) : (
            <ul className="divide-y divide-border">
              {(search.data ?? []).map((person) => (
                <PersonRow key={person.id} person={person}>
                  {relatedIds.has(person.id) ? (
                    <Badge variant="outline">Connected</Badge>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => sendRequest.mutate(person.id)}
                      disabled={sendRequest.isPending}
                    >
                      <UserPlus className="size-4" /> Add
                    </Button>
                  )}
                </PersonRow>
              ))}
            </ul>
          )}
        </section>
      )}

      <Tabs defaultValue="friends">
        <TabsList className="mb-4">
          <TabsTrigger value="friends">Friends ({data.friends.length})</TabsTrigger>
          <TabsTrigger value="requests">Requests ({data.incoming.length + incomingInvites.length})</TabsTrigger>
          <TabsTrigger value="sent">Sent ({data.outgoing.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="friends">
          {data.friends.length === 0 ? (
            <EmptyState
              icon={<UserRound className="size-6" />}
              title="No friends yet"
              body="Search for a classmate above and send them a request."
            />
          ) : (
            <ul className="surface divide-y divide-border px-5">
              {data.friends.map((row) => (
                <PersonRow key={row.id} person={row.other}>
                  <Button asChild size="sm" variant="secondary">
                    <Link to="/messages" search={{ friend: row.other?.id ?? "" }}>
                      <MessagesSquare className="size-4" />
                    </Link>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline">
                        Invite
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Your groups</DropdownMenuLabel>
                      {(myTargets.data?.groups ?? []).length === 0 ? (
                        <DropdownMenuItem disabled>No groups yet</DropdownMenuItem>
                      ) : (
                        (myTargets.data?.groups ?? []).map((group) => (
                          <DropdownMenuItem
                            key={group.id}
                            onSelect={() =>
                              invite.mutate({
                                kind: "group",
                                targetId: group.id,
                                inviteeId: row.other!.id,
                              })
                            }
                          >
                            {group.name}
                          </DropdownMenuItem>
                        ))
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Rooms you host</DropdownMenuLabel>
                      {(myTargets.data?.rooms ?? []).length === 0 ? (
                        <DropdownMenuItem disabled>No rooms yet</DropdownMenuItem>
                      ) : (
                        (myTargets.data?.rooms ?? []).map((room) => (
                          <DropdownMenuItem
                            key={room.id}
                            onSelect={() =>
                              invite.mutate({ kind: "room", targetId: room.id, inviteeId: row.other!.id })
                            }
                          >
                            <span className="truncate">{room.name}</span>
                          </DropdownMenuItem>
                        ))
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remove friend"
                    onClick={() => removeFriend.mutate(row.id)}
                  >
                    <UserX className="size-4" />
                  </Button>
                </PersonRow>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="requests" className="space-y-5">
          {data.incoming.length === 0 && incomingInvites.length === 0 ? (
            <EmptyState
              icon={<UserPlus className="size-6" />}
              title="No pending requests"
              body="When someone adds you or invites you to a group, it shows up here."
            />
          ) : (
            <>
              {data.incoming.length > 0 && (
                <ul className="surface divide-y divide-border px-5">
                  {data.incoming.map((row) => (
                    <PersonRow key={row.id} person={row.other} meta="Wants to be friends">
                      <Button
                        size="sm"
                        onClick={() => respond.mutate({ id: row.id, status: "accepted" })}
                        disabled={respond.isPending}
                      >
                        {respond.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                        Accept
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Decline"
                        onClick={() => respond.mutate({ id: row.id, status: "declined" })}
                      >
                        <X className="size-4" />
                      </Button>
                    </PersonRow>
                  ))}
                </ul>
              )}

              {incomingInvites.length > 0 && (
                <ul className="surface divide-y divide-border px-5">
                  {incomingInvites.map((row) => (
                    <PersonRow
                      key={row.id}
                      person={row.inviter}
                      meta={`Invited you to ${row.kind === "group" ? "group" : "room"} “${row.targetName}”`}
                    >
                      <Button
                        size="sm"
                        onClick={() =>
                          respondInvite.mutate({
                            id: row.id,
                            kind: row.kind,
                            targetId: row.target_id,
                            status: "accepted",
                          })
                        }
                      >
                        <Check className="size-4" /> Join
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Decline invite"
                        onClick={() =>
                          respondInvite.mutate({
                            id: row.id,
                            kind: row.kind,
                            targetId: row.target_id,
                            status: "declined",
                          })
                        }
                      >
                        <X className="size-4" />
                      </Button>
                    </PersonRow>
                  ))}
                </ul>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="sent">
          {data.outgoing.length === 0 ? (
            <EmptyState title="Nothing pending" body="Requests you send will appear here until answered." />
          ) : (
            <ul className="surface divide-y divide-border px-5">
              {data.outgoing.map((row) => (
                <PersonRow
                  key={row.id}
                  person={row.other}
                  meta={`Sent ${fmtDayLabel(row.created_at)}`}
                >
                  <Badge variant="outline">Pending</Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Cancel request"
                    onClick={() => removeFriend.mutate(row.id)}
                  >
                    <X className="size-4" />
                  </Button>
                </PersonRow>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
