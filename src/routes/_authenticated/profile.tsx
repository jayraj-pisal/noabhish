import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession, initialsOf } from "@/hooks/useAuth";
import { PageHeader, LoadingCards, ErrorNote } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Your Profile — StudyHub" },
      { name: "description", content: "Update your name, course, institution and bio." },
      { property: "og:title", content: "Your Profile — StudyHub" },
      { property: "og:description", content: "Manage your StudyHub profile." },
    ],
  }),
  component: ProfilePage,
});

const profileSchema = z.object({
  full_name: z.string().trim().min(1, "Add your name").max(80),
  institution: z.string().trim().max(120).optional(),
  course: z.string().trim().max(120).optional(),
  bio: z.string().trim().max(400).optional(),
});

function ProfilePage() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name,institution,course,bio")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async (values: z.infer<typeof profileSchema>) => {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: values.full_name,
          institution: values.institution || null,
          course: values.course || null,
          bio: values.bio || null,
        })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (profileQuery.isLoading) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Profile" />
        <LoadingCards count={2} />
      </div>
    );
  }

  if (profileQuery.isError) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Profile" />
        <ErrorNote />
      </div>
    );
  }

  const profile = profileQuery.data;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Your profile" subtitle="This is what your friends see on shared notes." />

      <div className="surface mb-5 flex items-center gap-4 p-5">
        <Avatar className="size-14">
          <AvatarFallback className="bg-primary text-primary-foreground">
            {initialsOf(user)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate font-medium">{profile?.full_name ?? "Student"}</p>
          <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
        </div>
      </div>

      <form
        className="surface space-y-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const parsed = profileSchema.safeParse({
            full_name: String(form.get("full_name") ?? ""),
            institution: String(form.get("institution") ?? ""),
            course: String(form.get("course") ?? ""),
            bio: String(form.get("bio") ?? ""),
          });
          if (!parsed.success) {
            const next: Record<string, string> = {};
            for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message;
            setErrors(next);
            return;
          }
          setErrors({});
          save.mutate(parsed.data);
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="full_name">Full name</Label>
          <Input id="full_name" name="full_name" defaultValue={profile?.full_name ?? ""} maxLength={80} />
          {errors['full_name'] && <p className="text-xs text-destructive">{errors['full_name']}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="institution">Institution</Label>
            <Input
              id="institution"
              name="institution"
              defaultValue={profile?.institution ?? ""}
              placeholder="University of ..."
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="course">Course</Label>
            <Input
              id="course"
              name="course"
              defaultValue={profile?.course ?? ""}
              placeholder="BSc Computer Science"
              maxLength={120}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bio">Short bio</Label>
          <Textarea id="bio" name="bio" defaultValue={profile?.bio ?? ""} maxLength={400} />
        </div>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          Save changes
        </Button>
      </form>
    </div>
  );
}
