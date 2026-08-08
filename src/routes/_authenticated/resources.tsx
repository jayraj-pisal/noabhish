import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { Download, FileText, Globe, Loader2, Lock, Search, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useAuth";
import { PageHeader, EmptyState, LoadingCards, ErrorNote } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { CATEGORIES, SEMESTERS, SUBJECTS, fmtDate, fmtSize } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/resources")({
  head: () => ({
    meta: [
      { title: "Notes & Resources — StudyHub" },
      {
        name: "description",
        content: "Upload, search and download study notes, slides and past papers.",
      },
      { property: "og:title", content: "Notes & Resources — StudyHub" },
      { property: "og:description", content: "A shared library of study material." },
    ],
  }),
  component: ResourcesPage,
});

type Resource = {
  id: string;
  title: string;
  description: string | null;
  subject: string | null;
  semester: string | null;
  topic: string | null;
  category: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  is_public: boolean;
  owner_id: string;
  download_count: number;
  created_at: string;
};

const metaSchema = z.object({
  title: z.string().trim().min(1, "Add a title").max(140),
  description: z.string().trim().max(500).optional(),
  subject: z.string().optional(),
  semester: z.string().optional(),
  topic: z.string().trim().max(80).optional(),
  category: z.string().min(1),
});

const MAX_SIZE = 20 * 1024 * 1024;

function ResourcesPage() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("all");
  const [category, setCategory] = useState("all");
  const [scope, setScope] = useState("all");
  const [open, setOpen] = useState(false);

  const resourcesQuery = useQuery({
    queryKey: ["resources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resources")
        .select(
          "id,title,description,subject,semester,topic,category,file_name,file_path,file_size,is_public,owner_id,download_count,created_at",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Resource[];
    },
  });

  const ownerIds = useMemo(
    () => Array.from(new Set((resourcesQuery.data ?? []).map((item) => item.owner_id))),
    [resourcesQuery.data],
  );

  const ownersQuery = useQuery({
    queryKey: ["resource-owners", ownerIds],
    enabled: ownerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name")
        .in("id", ownerIds);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((row) => [row.id, row.full_name])) as Record<
        string,
        string
      >;
    },
  });

  const upload = useMutation({
    mutationFn: async ({
      file,
      meta,
      isPublic,
    }: {
      file: File;
      meta: z.infer<typeof metaSchema>;
      isPublic: boolean;
    }) => {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${user!.id}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("resources")
        .upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (uploadError) throw uploadError;
      const { error } = await supabase.from("resources").insert({
        owner_id: user!.id,
        title: meta.title,
        description: meta.description || null,
        subject: meta.subject || null,
        semester: meta.semester || null,
        topic: meta.topic || null,
        category: meta.category,
        file_name: file.name,
        file_path: path,
        file_size: file.size,
        file_type: file.type || null,
        is_public: isPublic,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resources"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      setOpen(false);
      toast.success("Resource uploaded");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (resource: Resource) => {
      const { error } = await supabase.from("resources").delete().eq("id", resource.id);
      if (error) throw error;
      await supabase.storage.from("resources").remove([resource.file_path]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resources"] });
      toast.success("Resource deleted");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function download(resource: Resource) {
    const { data, error } = await supabase.storage
      .from("resources")
      .createSignedUrl(resource.file_path, 60);
    if (error || !data) {
      toast.error("Couldn't open that file");
      return;
    }
    await supabase
      .from("resources")
      .update({ download_count: resource.download_count + 1 })
      .eq("id", resource.id);
    queryClient.invalidateQueries({ queryKey: ["resources"] });
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  const items = (resourcesQuery.data ?? []).filter((item) => {
    const text = `${item.title} ${item.description ?? ""} ${item.topic ?? ""} ${item.subject ?? ""}`.toLowerCase();
    if (query && !text.includes(query.toLowerCase())) return false;
    if (subject !== "all" && item.subject !== subject) return false;
    if (category !== "all" && item.category !== category) return false;
    if (scope === "mine" && item.owner_id !== user?.id) return false;
    if (scope === "shared" && !item.is_public) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Notes & Resources"
        subtitle="Share PDFs, slides and past papers with your friends — or keep them private."
        action={
          <Button onClick={() => setOpen(true)}>
            <Upload className="size-4" /> Upload
          </Button>
        }
      />

      <div className="surface mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search notes"
            className="pl-9"
            aria-label="Search resources"
          />
        </div>
        <Select value={subject} onValueChange={setSubject}>
          <SelectTrigger aria-label="Filter by subject">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All subjects</SelectItem>
            {SUBJECTS.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger aria-label="Filter by category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {CATEGORIES.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={scope} onValueChange={setScope}>
          <SelectTrigger aria-label="Filter by owner">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everything I can see</SelectItem>
            <SelectItem value="mine">My uploads</SelectItem>
            <SelectItem value="shared">Shared publicly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {resourcesQuery.isLoading ? (
        <LoadingCards />
      ) : resourcesQuery.isError ? (
        <ErrorNote />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-6" />}
          title="No resources found"
          body="Upload your first set of notes, or loosen the filters."
          action={
            <Button onClick={() => setOpen(true)}>
              <Upload className="size-4" /> Upload a file
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.id} className="surface flex flex-col p-4">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <h3 className="min-w-0 font-medium leading-snug">{item.title}</h3>
                <span className="shrink-0 text-muted-foreground" title={item.is_public ? "Public" : "Private"}>
                  {item.is_public ? <Globe className="size-4" /> : <Lock className="size-4" />}
                </span>
              </div>
              {item.description && (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {item.subject && <Badge variant="secondary">{item.subject}</Badge>}
                <Badge variant="outline">{item.category}</Badge>
                {item.semester && <Badge variant="outline">{item.semester}</Badge>}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {ownersQuery.data?.[item.owner_id] ?? "A student"} · {fmtSize(item.file_size)} ·{" "}
                {fmtDate(item.created_at)} · {item.download_count} downloads
              </p>
              <div className="mt-3 flex gap-2 border-t border-border pt-3">
                <Button size="sm" variant="secondary" onClick={() => download(item)}>
                  <Download className="size-4" /> Open
                </Button>
                {item.owner_id === user?.id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove.mutate(item)}
                    aria-label="Delete resource"
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <UploadDialog
        open={open}
        onOpenChange={setOpen}
        pending={upload.isPending}
        onSubmit={(payload) => upload.mutate(payload)}
      />
    </div>
  );
}

function UploadDialog({
  open,
  onOpenChange,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onSubmit: (payload: {
    file: File;
    meta: z.infer<typeof metaSchema>;
    isPublic: boolean;
  }) => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPublic, setIsPublic] = useState(true);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    const parsed = metaSchema.safeParse({
      title: String(form.get("title") ?? ""),
      description: String(form.get("description") ?? ""),
      subject: String(form.get("subject") ?? ""),
      semester: String(form.get("semester") ?? ""),
      topic: String(form.get("topic") ?? ""),
      category: String(form.get("category") ?? "notes"),
    });
    const next: Record<string, string> = {};
    if (!(file instanceof File) || file.size === 0) next['file'] = "Choose a file to upload";
    else if (file.size > MAX_SIZE) next['file'] = "Files must be 20MB or smaller";
    if (!parsed.success) {
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message;
    }
    if (Object.keys(next).length > 0 || !parsed.success) {
      setErrors(next);
      return;
    }
    setErrors({});
    onSubmit({ file: file as File, meta: parsed.data, isPublic });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload a resource</DialogTitle>
          <DialogDescription>PDF, DOC, slides or images up to 20MB.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="file">File</Label>
            <Input
              id="file"
              name="file"
              type="file"
              accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp"
            />
            {errors['file'] && <p className="text-xs text-destructive">{errors['file']}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" placeholder="Thermodynamics summary" maxLength={140} />
            {errors['title'] && <p className="text-xs text-destructive">{errors['title']}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" maxLength={500} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
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
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select name="category" defaultValue="notes">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Semester</Label>
              <Select name="semester">
                <SelectTrigger>
                  <SelectValue placeholder="Semester" />
                </SelectTrigger>
                <SelectContent>
                  {SEMESTERS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="topic">Topic</Label>
              <Input id="topic" name="topic" placeholder="Entropy" maxLength={80} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
            <div>
              <Label htmlFor="is_public">Share with everyone</Label>
              <p className="text-xs text-muted-foreground">
                Off means only you can open this file.
              </p>
            </div>
            <Switch id="is_public" checked={isPublic} onCheckedChange={setIsPublic} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Upload
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
