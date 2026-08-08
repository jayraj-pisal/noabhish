import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { CalendarDays, Check, Clock, Loader2, Plus, Target, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useAuth";
import { PageHeader, EmptyState, LoadingCards, ErrorNote } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/planner")({
  head: () => ({
    meta: [
      { title: "Study Planner — StudyHub" },
      {
        name: "description",
        content: "Plan study sessions on a calendar with goals, deadlines and reminders.",
      },
      { property: "og:title", content: "Study Planner — StudyHub" },
      { property: "og:description", content: "Your study calendar and session goals." },
    ],
  }),
  component: PlannerPage,
});

type StudySession = {
  id: string;
  title: string;
  subject: string | null;
  goal: string | null;
  starts_at: string;
  ends_at: string;
  reminder_at: string | null;
  completed: boolean;
};

const sessionSchema = z
  .object({
    title: z.string().trim().min(1, "Give the session a name").max(140),
    subject: z.string().optional(),
    goal: z.string().trim().max(300).optional(),
    date: z.string().min(1, "Pick a date"),
    start: z.string().min(1, "Pick a start time"),
    end: z.string().min(1, "Pick an end time"),
    remind: z.string().optional(),
  })
  .refine((values) => values.end > values.start, {
    message: "End time must be after the start time",
    path: ["end"],
  });

function PlannerPage() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Date>(new Date());
  const [open, setOpen] = useState(false);

  const sessionsQuery = useQuery({
    queryKey: ["sessions", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("study_sessions")
        .select("id,title,subject,goal,starts_at,ends_at,reminder_at,completed")
        .order("starts_at");
      if (error) throw error;
      return data as StudySession[];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
    queryClient.invalidateQueries({ queryKey: ["reminders"] });
    queryClient.invalidateQueries({ queryKey: ["stats"] });
  };

  const create = useMutation({
    mutationFn: async (values: z.infer<typeof sessionSchema>) => {
      const starts = new Date(`${values.date}T${values.start}`);
      const ends = new Date(`${values.date}T${values.end}`);
      const reminder = values.remind && values.remind !== "none"
        ? new Date(starts.getTime() - Number(values.remind) * 60000).toISOString()
        : null;
      const { error } = await supabase.from("study_sessions").insert({
        user_id: user!.id,
        title: values.title,
        subject: values.subject || null,
        goal: values.goal || null,
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        reminder_at: reminder,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setOpen(false);
      toast.success("Study session scheduled");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleDone = useMutation({
    mutationFn: async (session: StudySession) => {
      const { error } = await supabase
        .from("study_sessions")
        .update({ completed: !session.completed })
        .eq("id", session.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("study_sessions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Session removed");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sessions = sessionsQuery.data ?? [];
  const selectedKey = toDateKey(selected);
  const daySessions = sessions.filter((s) => toDateKey(new Date(s.starts_at)) === selectedKey);
  const upcoming = sessions
    .filter((s) => new Date(s.starts_at) >= new Date() && !s.completed)
    .slice(0, 4);
  const plannedDays = useMemo(
    () => sessions.map((s) => new Date(s.starts_at)),
    [sessions],
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Study Planner"
        subtitle="Block out sessions, set a goal for each one and get a nudge before it starts."
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Plan session
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[auto_minmax(0,1fr)]">
        <div className="surface p-3">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) => date && setSelected(date)}
            modifiers={{ planned: plannedDays }}
            modifiersClassNames={{ planned: "font-bold text-primary underline" }}
            className={cn("p-2 pointer-events-auto")}
          />
          <div className="mt-2 border-t border-border px-2 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Next up
            </p>
            {upcoming.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nothing scheduled yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {upcoming.map((session) => (
                  <li key={session.id} className="text-sm">
                    <p className="truncate font-medium">{session.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDayLabel(session.starts_at)} · {fmtTime(session.starts_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <section className="min-w-0">
          <h2 className="mb-3 text-lg font-semibold">
            {fmtDayLabel(selected)}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              · {daySessions.length} session{daySessions.length === 1 ? "" : "s"}
            </span>
          </h2>
          {sessionsQuery.isLoading ? (
            <LoadingCards />
          ) : sessionsQuery.isError ? (
            <ErrorNote />
          ) : daySessions.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="size-6" />}
              title="No sessions this day"
              body="Pick a time block and give it one clear goal — that's usually enough."
              action={
                <Button onClick={() => setOpen(true)}>
                  <Plus className="size-4" /> Plan a session
                </Button>
              }
            />
          ) : (
            <ul className="space-y-3">
              {daySessions.map((session) => (
                <li key={session.id} className="surface p-4">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "font-medium",
                          session.completed && "text-muted-foreground line-through",
                        )}
                      >
                        {session.title}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Clock className="size-3.5" />
                        {fmtTime(session.starts_at)} – {fmtTime(session.ends_at)}
                      </p>
                      {session.goal && (
                        <p className="mt-2 flex items-start gap-1.5 text-sm text-muted-foreground">
                          <Target className="mt-0.5 size-3.5 shrink-0" />
                          {session.goal}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {session.subject && <Badge variant="secondary">{session.subject}</Badge>}
                        {session.reminder_at && (
                          <Badge variant="outline">Reminder {fmtTime(session.reminder_at)}</Badge>
                        )}
                        {session.completed && (
                          <Badge className="bg-success text-success-foreground">Done</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Toggle completed"
                        onClick={() => toggleDone.mutate(session)}
                      >
                        <Check className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Delete session"
                        onClick={() => remove.mutate(session.id)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <SessionDialog
        open={open}
        onOpenChange={setOpen}
        defaultDate={selectedKey}
        pending={create.isPending}
        onSubmit={(values) => create.mutate(values)}
      />
    </div>
  );
}

function SessionDialog({
  open,
  onOpenChange,
  defaultDate,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate: string;
  pending: boolean;
  onSubmit: (values: z.infer<typeof sessionSchema>) => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = sessionSchema.safeParse({
      title: String(form.get("title") ?? ""),
      subject: String(form.get("subject") ?? ""),
      goal: String(form.get("goal") ?? ""),
      date: String(form.get("date") ?? ""),
      start: String(form.get("start") ?? ""),
      end: String(form.get("end") ?? ""),
      remind: String(form.get("remind") ?? "none"),
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Plan a study session</DialogTitle>
          <DialogDescription>One block, one goal. You've got this.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" key={defaultDate}>
          <div className="space-y-1.5">
            <Label htmlFor="title">Session name</Label>
            <Input id="title" name="title" placeholder="Calculus deep work" maxLength={140} />
            {errors['title'] && <p className="text-xs text-destructive">{errors['title']}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Select name="subject">
              <SelectTrigger>
                <SelectValue placeholder="Pick a subject" />
              </SelectTrigger>
              <SelectContent>
                {SUBJECTS.map((subject) => (
                  <SelectItem key={subject} value={subject}>
                    {subject}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="goal">Goal for this session</Label>
            <Textarea
              id="goal"
              name="goal"
              placeholder="Finish the integration worksheet"
              maxLength={300}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3 space-y-1.5 sm:col-span-1">
              <Label htmlFor="date">Date</Label>
              <Input id="date" name="date" type="date" defaultValue={defaultDate} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="start">Start</Label>
              <Input id="start" name="start" type="time" defaultValue="18:00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end">End</Label>
              <Input id="end" name="end" type="time" defaultValue="20:00" />
            </div>
          </div>
          {errors['end'] && <p className="text-xs text-destructive">{errors['end']}</p>}
          <div className="space-y-1.5">
            <Label>Reminder</Label>
            <Select name="remind" defaultValue="15">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No reminder</SelectItem>
                <SelectItem value="10">10 minutes before</SelectItem>
                <SelectItem value="15">15 minutes before</SelectItem>
                <SelectItem value="30">30 minutes before</SelectItem>
                <SelectItem value="60">1 hour before</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Schedule session
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
