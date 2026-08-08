import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { CheckSquare, Loader2, Plus, Trash2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useAuth";
import { PageHeader, EmptyState, LoadingCards, ErrorNote } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { SUBJECTS, fmtDayLabel, toDateKey } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({
    meta: [
      { title: "Daily Tasks — StudyHub" },
      { name: "description", content: "Create, prioritise and complete your daily study tasks." },
      { property: "og:title", content: "Daily Tasks — StudyHub" },
      { property: "og:description", content: "Your daily study to-do list." },
    ],
  }),
  component: TasksPage,
});

type Task = {
  id: string;
  title: string;
  notes: string | null;
  subject: string | null;
  priority: string;
  due_date: string | null;
  completed: boolean;
};

const taskSchema = z.object({
  title: z.string().trim().min(1, "Give your task a title").max(140),
  notes: z.string().trim().max(500).optional(),
  subject: z.string().optional(),
  priority: z.enum(["high", "medium", "low"]),
  due_date: z.string().optional(),
});

const priorityStyles: Record<string, string> = {
  high: "bg-destructive/12 text-destructive border-destructive/25",
  medium: "bg-highlight/25 text-highlight-foreground border-highlight/35",
  low: "bg-secondary text-secondary-foreground border-border",
};

function TasksPage() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("today");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const tasksQuery = useQuery({
    queryKey: ["tasks", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id,title,notes,subject,priority,due_date,completed")
        .order("completed")
        .order("due_date", { nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Task[];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["reminders"] });
    queryClient.invalidateQueries({ queryKey: ["stats"] });
  };

  const saveTask = useMutation({
    mutationFn: async (values: z.infer<typeof taskSchema> & { id?: string }) => {
      const payload = {
        title: values.title,
        notes: values.notes || null,
        subject: values.subject || null,
        priority: values.priority,
        due_date: values.due_date || null,
      };
      if (values.id) {
        const { error } = await supabase.from("tasks").update(payload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tasks").insert({ ...payload, user_id: user!.id });
        if (error) throw error;
      }
    },
    onSuccess: (_data, values) => {
      invalidate();
      setOpen(false);
      setEditing(null);
      toast.success(values.id ? "Task updated" : "Task added");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggle = useMutation({
    mutationFn: async (task: Task) => {
      const { error } = await supabase
        .from("tasks")
        .update({ completed: !task.completed })
        .eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Task deleted");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const all = tasksQuery.data ?? [];
  const todayKey = toDateKey(new Date());
  const filtered = all.filter((task) => {
    if (filter === "today")
      return !task.completed && task.due_date !== null && task.due_date <= todayKey;
    if (filter === "upcoming")
      return !task.completed && (task.due_date === null || task.due_date > todayKey);
    if (filter === "done") return task.completed;
    return true;
  });

  const doneToday = all.filter((t) => t.completed).length;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Daily Tasks"
        subtitle={`${all.filter((t) => !t.completed).length} open · ${doneToday} completed`}
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="size-4" /> New task
          </Button>
        }
      />

      <Tabs value={filter} onValueChange={setFilter} className="mb-4">
        <TabsList className="w-full">
          <TabsTrigger value="today" className="flex-1">
            Today
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="flex-1">
            Upcoming
          </TabsTrigger>
          <TabsTrigger value="done" className="flex-1">
            Done
          </TabsTrigger>
          <TabsTrigger value="all" className="flex-1">
            All
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tasksQuery.isLoading ? (
        <LoadingCards />
      ) : tasksQuery.isError ? (
        <ErrorNote />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<CheckSquare className="size-6" />}
          title={filter === "done" ? "Nothing completed yet" : "No tasks here"}
          body="Add what you want to get done and keep the list short and honest."
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="size-4" /> Add your first task
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {filtered.map((task) => (
            <li
              key={task.id}
              className="surface flex items-start gap-3 px-4 py-3.5 transition-shadow hover:shadow-[var(--shadow-lift)]"
            >
              <Checkbox
                checked={task.completed}
                onCheckedChange={() => toggle.mutate(task)}
                className="mt-0.5"
                aria-label={`Mark ${task.title} as ${task.completed ? "not done" : "done"}`}
              />
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm font-medium",
                    task.completed && "text-muted-foreground line-through",
                  )}
                >
                  {task.title}
                </p>
                {task.notes && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{task.notes}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className={priorityStyles[task.priority]}>
                    {task.priority}
                  </Badge>
                  {task.subject && <Badge variant="secondary">{task.subject}</Badge>}
                  {task.due_date && (
                    <span className="text-xs text-muted-foreground">
                      {fmtDayLabel(`${task.due_date}T12:00:00`)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-0.5">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Edit task"
                  onClick={() => {
                    setEditing(task);
                    setOpen(true);
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Delete task"
                  onClick={() => remove.mutate(task.id)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <TaskDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setEditing(null);
        }}
        task={editing}
        pending={saveTask.isPending}
        onSubmit={(values) => saveTask.mutate({ ...values, ...(editing ? { id: editing.id } : {}) })}
      />
    </div>
  );
}

function TaskDialog({
  open,
  onOpenChange,
  task,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  pending: boolean;
  onSubmit: (values: z.infer<typeof taskSchema>) => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = taskSchema.safeParse({
      title: String(form.get("title") ?? ""),
      notes: String(form.get("notes") ?? ""),
      subject: String(form.get("subject") ?? ""),
      priority: String(form.get("priority") ?? "medium"),
      due_date: String(form.get("due_date") ?? ""),
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
          <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription>Keep it small enough to actually finish today.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" key={task?.id ?? "new"}>
          <div className="space-y-1.5">
            <Label htmlFor="title">Task</Label>
            <Input
              id="title"
              name="title"
              defaultValue={task?.title ?? ""}
              placeholder="Revise chapter 4"
              maxLength={140}
            />
            {errors['title'] && <p className="text-xs text-destructive">{errors['title']}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" name="notes" defaultValue={task?.notes ?? ""} maxLength={500} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Select name="subject" defaultValue={task?.subject ?? ""}>
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
              <Label>Priority</Label>
              <Select name="priority" defaultValue={task?.priority ?? "medium"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="due_date">Deadline</Label>
            <Input
              id="due_date"
              name="due_date"
              type="date"
              defaultValue={task?.due_date ?? toDateKey(new Date())}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {task ? "Save changes" : "Add task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
