import { Link, createFileRoute } from "@tanstack/react-router";
import { BookOpen, CalendarDays, CheckCircle2, MessagesSquare, Users, Video } from "lucide-react";
import heroImage from "@/assets/study-hero.jpg";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "StudyHub — Share notes, plan study, stay on track" },
      {
        name: "description",
        content:
          "A friendly study hub for students and friends: daily tasks, a study planner, shared notes and resources, online study rooms and group chat.",
      },
      { property: "og:title", content: "StudyHub — Share notes, plan study, stay on track" },
      {
        property: "og:description",
        content: "Daily tasks, study planner, shared notes and study rooms in one friendly place.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: CheckCircle2,
    title: "Daily tasks",
    body: "Capture today's to-dos, set priorities and deadlines, and tick them off as you go.",
  },
  {
    icon: CalendarDays,
    title: "Study planner",
    body: "Block out study sessions on a calendar, set goals and get reminded before you start.",
  },
  {
    icon: BookOpen,
    title: "Notes & resources",
    body: "Upload PDFs, slides, docs and images. Organise by subject, topic and semester.",
  },
  {
    icon: Video,
    title: "Study rooms",
    body: "Spin up an instant video room and co-work with friends, no extra accounts needed.",
  },
  {
    icon: MessagesSquare,
    title: "Group chat",
    body: "Ask doubts and share links in live group threads with your study squad.",
  },
  {
    icon: Users,
    title: "Profiles",
    body: "See what your friends are sharing and what they're studying this semester.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-6">
        <Link to="/" className="flex min-w-0 items-center gap-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl gradient-hero text-primary-foreground">
            <BookOpen className="size-5" />
          </span>
          <span className="truncate font-display text-xl font-semibold">StudyHub</span>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link to="/auth">Log in</Link>
          </Button>
          <Button asChild>
            <Link to="/auth">Get started</Link>
          </Button>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10 paper-grid opacity-70" aria-hidden />
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-8 lg:grid-cols-2 lg:pb-24">
            <div className="animate-rise">
              <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                Built for students & friends
              </span>
              <h1 className="mt-5 text-4xl leading-[1.05] font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Your study life,
                <span className="relative ml-2 inline-block">
                  <span className="relative z-10">sorted.</span>
                  <span
                    className="absolute inset-x-0 bottom-1 -z-0 h-3 rounded-sm bg-highlight/70"
                    aria-hidden
                  />
                </span>
              </h1>
              <p className="mt-5 max-w-lg text-base text-muted-foreground sm:text-lg">
                Plan every study session, keep today's tasks in one list, and share notes with the
                friends you actually study with.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link to="/auth">Create a free account</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/auth" search={{ mode: "login" }}>
                    I already have one
                  </Link>
                </Button>
              </div>
              <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 text-left">
                {[
                  ["7", "sections"],
                  ["100%", "yours & private"],
                  ["0", "setup needed"],
                ].map(([value, label]) => (
                  <div key={label}>
                    <dt className="font-display text-2xl font-semibold text-primary">{value}</dt>
                    <dd className="text-xs text-muted-foreground">{label}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="relative">
              <img
                src={heroImage}
                alt="A study desk with notebooks, a laptop showing a study calendar, highlighters and coffee"
                width={1408}
                height={1008}
                className="w-full rounded-3xl border border-border shadow-[var(--shadow-lift)]"
              />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-20">
          <h2 className="text-2xl font-semibold sm:text-3xl">Everything a study group needs</h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Tasks and planning come first — the rest is there when you want to study together.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, body }) => (
              <article key={title} className="surface p-5 transition-shadow hover:shadow-[var(--shadow-lift)]">
                <span className="grid size-10 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-20">
          <div className="gradient-hero rounded-3xl px-6 py-12 text-center text-primary-foreground sm:px-12">
            <h2 className="text-2xl font-semibold sm:text-3xl">Study with your friends tonight</h2>
            <p className="mx-auto mt-3 max-w-md text-sm opacity-90">
              Sign up in seconds — your dashboard comes pre-filled with a sample plan you can edit.
            </p>
            <Button asChild size="lg" variant="secondary" className="mt-7">
              <Link to="/auth">Get started free</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        StudyHub — made for students and friends.
      </footer>
    </div>
  );
}
