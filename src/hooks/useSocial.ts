import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FriendProfile = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  institution: string | null;
  course: string | null;
  bio: string | null;
};

export type FriendshipRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
  created_at: string;
};

async function fetchProfiles(ids: string[]) {
  if (ids.length === 0) return [] as FriendProfile[];
  const { data, error } = await supabase
    .from("profiles")
    .select("id,full_name,avatar_url,institution,course,bio")
    .in("id", ids);
  if (error) throw error;
  return (data ?? []) as FriendProfile[];
}

/** Every friendship row that involves the current user. */
export function useFriendships(userId: string | undefined) {
  return useQuery({
    queryKey: ["friendships", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("friendships")
        .select("id,requester_id,addressee_id,status,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as FriendshipRow[];
      const otherIds = rows.map((row) => (row.requester_id === userId ? row.addressee_id : row.requester_id));
      const profiles = await fetchProfiles([...new Set(otherIds)]);
      const byId = new Map(profiles.map((profile) => [profile.id, profile]));

      const decorate = (row: FriendshipRow) => ({
        ...row,
        other: byId.get(row.requester_id === userId ? row.addressee_id : row.requester_id) ?? null,
      });

      const all = rows.map(decorate);
      return {
        all,
        friends: all.filter((row) => row.status === "accepted"),
        incoming: all.filter((row) => row.status === "pending" && row.addressee_id === userId),
        outgoing: all.filter((row) => row.status === "pending" && row.requester_id === userId),
      };
    },
  });
}

export type Invitation = {
  id: string;
  kind: "group" | "room";
  target_id: string;
  inviter_id: string;
  invitee_id: string;
  status: string;
  created_at: string;
};

export function useInvitations(userId: string | undefined) {
  return useQuery({
    queryKey: ["invitations", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invitations")
        .select("id,kind,target_id,inviter_id,invitee_id,status,created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as Invitation[];
      const incoming = rows.filter((row) => row.invitee_id === userId);

      const groupIds = incoming.filter((r) => r.kind === "group").map((r) => r.target_id);
      const roomIds = incoming.filter((r) => r.kind === "room").map((r) => r.target_id);
      const [groups, rooms, profiles] = await Promise.all([
        groupIds.length
          ? supabase.from("groups").select("id,name,subject").in("id", groupIds)
          : Promise.resolve({ data: [] as { id: string; name: string; subject: string | null }[] }),
        roomIds.length
          ? supabase.from("study_rooms").select("id,name,subject,scheduled_at").in("id", roomIds)
          : Promise.resolve({
              data: [] as { id: string; name: string; subject: string | null; scheduled_at: string }[],
            }),
        fetchProfiles([...new Set(incoming.map((r) => r.inviter_id))]),
      ]);
      const names = new Map<string, string>();
      for (const g of groups.data ?? []) names.set(g.id, g.name);
      for (const r of rooms.data ?? []) names.set(r.id, r.name);
      const byId = new Map(profiles.map((p) => [p.id, p]));

      return {
        incoming: incoming.map((row) => ({
          ...row,
          targetName: names.get(row.target_id) ?? "Untitled",
          inviter: byId.get(row.inviter_id) ?? null,
        })),
        outgoing: rows.filter((row) => row.inviter_id === userId),
      };
    },
  });
}

/** Unread direct messages, grouped by sender. */
export function useUnreadMessages(userId: string | undefined) {
  return useQuery({
    queryKey: ["dm-unread", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("direct_messages")
        .select("id,sender_id,body,created_at")
        .eq("recipient_id", userId!)
        .is("read_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Live refresh for social tables. */
export function useSocialRealtime(userId: string | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`social-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => {
        queryClient.invalidateQueries({ queryKey: ["friendships"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "invitations" }, () => {
        queryClient.invalidateQueries({ queryKey: ["invitations"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "direct_messages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["dm-unread"] });
        queryClient.invalidateQueries({ queryKey: ["dm-thread"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}
