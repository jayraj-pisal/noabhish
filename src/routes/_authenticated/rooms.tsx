import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { Copy, Loader2, Plus, Trash2, Users, Video } from "lucide-react";
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
import { SUBJECTS, fmtDayLabel, fmtTime, toDateKey } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/rooms")({
  head: () => ({
    meta: [
      { title: "Study Rooms — StudyHub" },
      {
        name: "description",
        content: "Create instant video study rooms and revise together with friends.",
      },
      { property: "og:title", content: "Study Rooms — StudyHub" },
      { property: "og:description", content: "Online study rooms for group revision." },
    ],
  }),
  component: RoomsPage,
});

type Room = {
  id: string;
  name: string;
  description: string | null;
  subject: string | null;
  meeting_url: string;
  scheduled_at: string;
  host_id: string;
};

const roomSchema = z
  .object({
    name: z.string().trim().min(1, "Name your room").max(120),
    description: z.string().trim().max(400).optional(),
    subject: z.string().optional(),
    date: z.string().min(1, "Pick a date"),
    time: z.string().min(1, "Pick a time"),
  })
  .transform((values) => values);

function RoomsPage() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const roomsQuery = useQuery({
    queryKey: ["rooms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("study_rooms")
        .select("id,name,description,subject,meeting_url,scheduled_at,host_id")
        .order("scheduled_at");
      if (error) throw error;
      return data as Room[];
    },
  });

  const participantsQuery = useQuery({
    queryKey: ["room-participants"],
    queryFn: async () => {
      const { data, error } = await supabase.from("room_participants").select("room_id,user_id");
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (values: z.infer<typeof roomSchema>) => {
      const slug = `studyhub-${Math.random().toString(36).slice(2, 10)}`;
      const startsAt = new Date(`${values.date}T${values.time}`);
      const { data, error } = await supabase
        .from("study_rooms")
        .insert({
          host_id: user!.id,
          name: values.name,
          description: values.description || null,
          subject: values.subject || null,
          meeting_url: `https://meet.jit.si/${slug}`,
          scheduled_at: startsAt.toISOString(),
        })
        .select("id")
        .single();
      if (error) throw error;
      await supabase.from("room_participants").insert({ room_id: data.id, user_id: user!.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["room-participants"] });
      setOpen(false);
      toast.success("Study room created");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const join = useMutation({
    mutationFn: async (room: Room) => {
      const { error } = await supabase
        .from("room_participants")
        .upsert({ room_id: room.id, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: (_data, room) => {
      queryClient.invalidateQueries({ queryKey: ["room-participants"] });
      window.open(room.meeting_url, "_blank", "noopener,noreferrer");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("study_rooms").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      toast.success("Room closed");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rooms = roomsQuery.data ?? [];
  const counts = (participantsQuery.data ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.room_id] = (acc[row.room_id] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Study Rooms"
        subtitle="Instant video rooms — no accounts, no installs, just a link you can share."
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> New room
          </Button>
        }
      />

      {roomsQuery.isLoading ? (
        <LoadingCards />
      ) : roomsQuery.isError ? (
        <ErrorNote />
      ) : rooms.length === 0 ? (
        <EmptyState
          icon={<Video className="size-6" />}
          title="No rooms open"
          body="Create a room, share the link, and study together in real time."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Create a room
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {rooms.map((room) => (
            <li key={room.id} className="surface flex flex-col p-4">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <h3 className="min-w-0 font-medium leading-snug">{room.name}</h3>
                <Badge variant="outline" className="shrink-0">
                  <Users className="size-3" /> {counts[room.id] ?? 0}
                </Badge>
              </div>
              {room.description && (
                <p className="mt-1 text-sm text-muted-foreground">{room.description}</p>
              )}
              <p className="mt-2 text-sm text-muted-foreground">
                {fmtDayLabel(room.scheduled_at)} · {fmtTime(room.scheduled_at)}
              </p>
              {room.subject && (
                <div className="mt-2">
                  <Badge variant="secondary">{room.subject}</Badge>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                <Button size="sm" onClick={() => join.mutate(room)}>
                  <Video className="size-4" /> Join
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await navigator.clipboard.writeText(room.meeting_url);
                    toast.success("Link copied");
                  }}
                >
                  <Copy className="size-4" /> Copy link
                </Button>
                {room.host_id === user?.id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Close room"
                    onClick={() => remove.mutate(room.id)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <RoomDialog
        open={open}
        onOpenChange={setOpen}
        pending={create.isPending}
        onSubmit={(values) => create.mutate(values)}
      />
    </div>
  );
}

function RoomDialog({
  open,
  onOpenChange,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onSubmit: (values: z.infer<typeof roomSchema>) => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = roomSchema.safeParse({
      name: String(form.get("name") ?? ""),
      description: String(form.get("description") ?? ""),
      subject: String(form.get("subject") ?? ""),
      date: String(form.get("date") ?? ""),
      time: String(form.get("time") ?? ""),
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    onSubmit(parsed.data);
  }

  const now = new Date();
  const defaultTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a study room</DialogTitle>
          <DialogDescription>
            We'll generate a private video link you can share with anyone.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Room name</Label>
            <Input id="name" name="name" placeholder="Physics cram session" maxLength={120} />
            {errors['name'] && <p className="text-xs text-destructive">{errors['name']}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">What are you working on?</Label>
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="date">Date</Label>
              <Input id="date" name="date" type="date" defaultValue={toDateKey(now)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="time">Start time</Label>
              <Input id="time" name="time" type="time" defaultValue={defaultTime} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Create room
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
