-- helper: updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  institution TEXT,
  course TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_read" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- TASKS
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  subject TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  due_date DATE,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks_own" ON public.tasks FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER tasks_updated BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- STUDY SESSIONS
CREATE TABLE public.study_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title TEXT NOT NULL,
  subject TEXT,
  goal TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reminder_at TIMESTAMPTZ,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_sessions TO authenticated;
GRANT ALL ON public.study_sessions TO service_role;
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions_own" ON public.study_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER sessions_updated BEFORE UPDATE ON public.study_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RESOURCES
CREATE TABLE public.resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  subject TEXT,
  topic TEXT,
  semester TEXT,
  category TEXT NOT NULL DEFAULT 'notes',
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  is_public BOOLEAN NOT NULL DEFAULT true,
  download_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resources TO authenticated;
GRANT ALL ON public.resources TO service_role;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "resources_read" ON public.resources FOR SELECT TO authenticated USING (is_public OR auth.uid() = owner_id);
CREATE POLICY "resources_insert_own" ON public.resources FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "resources_update_own" ON public.resources FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "resources_delete_own" ON public.resources FOR DELETE TO authenticated USING (auth.uid() = owner_id);
CREATE TRIGGER resources_updated BEFORE UPDATE ON public.resources FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- STUDY ROOMS
CREATE TABLE public.study_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT,
  description TEXT,
  meeting_url TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_rooms TO authenticated;
GRANT ALL ON public.study_rooms TO service_role;
ALTER TABLE public.study_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rooms_read" ON public.study_rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "rooms_insert_own" ON public.study_rooms FOR INSERT TO authenticated WITH CHECK (auth.uid() = host_id);
CREATE POLICY "rooms_update_own" ON public.study_rooms FOR UPDATE TO authenticated USING (auth.uid() = host_id) WITH CHECK (auth.uid() = host_id);
CREATE POLICY "rooms_delete_own" ON public.study_rooms FOR DELETE TO authenticated USING (auth.uid() = host_id);
CREATE TRIGGER rooms_updated BEFORE UPDATE ON public.study_rooms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.room_participants (
  room_id UUID NOT NULL REFERENCES public.study_rooms ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.room_participants TO authenticated;
GRANT ALL ON public.room_participants TO service_role;
ALTER TABLE public.room_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants_read" ON public.room_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "participants_join_self" ON public.room_participants FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "participants_leave_self" ON public.room_participants FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- GROUPS
CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  subject TEXT,
  created_by UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups TO authenticated;
GRANT ALL ON public.groups TO service_role;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "groups_read" ON public.groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "groups_insert_own" ON public.groups FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "groups_update_own" ON public.groups FOR UPDATE TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
CREATE POLICY "groups_delete_own" ON public.groups FOR DELETE TO authenticated USING (auth.uid() = created_by);

CREATE TABLE public.group_members (
  group_id UUID NOT NULL REFERENCES public.groups ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.group_members TO authenticated;
GRANT ALL ON public.group_members TO service_role;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_read" ON public.group_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "members_join_self" ON public.group_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "members_leave_self" ON public.group_members FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.is_group_member(_group_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = _group_id AND user_id = _user_id);
$$;

CREATE TABLE public.group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.group_messages TO authenticated;
GRANT ALL ON public.group_messages TO service_role;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_read_members" ON public.group_messages FOR SELECT TO authenticated USING (public.is_group_member(group_id, auth.uid()));
CREATE POLICY "messages_insert_members" ON public.group_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND public.is_group_member(group_id, auth.uid()));
CREATE POLICY "messages_delete_own" ON public.group_messages FOR DELETE TO authenticated USING (auth.uid() = user_id);
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;

-- storage policies for the resources bucket
CREATE POLICY "res_upload_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'resources' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "res_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'resources' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "res_read_allowed" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'resources' AND ((storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (SELECT 1 FROM public.resources r WHERE r.file_path = storage.objects.name AND r.is_public)));

-- new user bootstrap + sample data
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE gid UUID;
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)), NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.tasks (user_id, title, notes, subject, priority, due_date, completed) VALUES
    (NEW.id, 'Revise Chapter 4 — Integration by parts', 'Do 10 practice problems', 'Mathematics', 'high', CURRENT_DATE, false),
    (NEW.id, 'Finish Physics lab report', 'Graphs + error analysis', 'Physics', 'high', CURRENT_DATE, false),
    (NEW.id, 'Read 20 pages of Organic Chemistry', NULL, 'Chemistry', 'medium', CURRENT_DATE, true),
    (NEW.id, 'Make flashcards for Data Structures', 'Trees and graphs', 'Computer Science', 'medium', CURRENT_DATE + 1, false),
    (NEW.id, 'Submit English essay draft', NULL, 'English', 'low', CURRENT_DATE + 3, false);

  INSERT INTO public.study_sessions (user_id, title, subject, goal, starts_at, ends_at, reminder_at) VALUES
    (NEW.id, 'Calculus deep work', 'Mathematics', 'Finish integration worksheet', date_trunc('day', now()) + interval '18 hour', date_trunc('day', now()) + interval '20 hour', date_trunc('day', now()) + interval '17 hour 45 minute'),
    (NEW.id, 'Physics problem set with friends', 'Physics', 'Chapters 6-7', date_trunc('day', now()) + interval '1 day 10 hour', date_trunc('day', now()) + interval '1 day 12 hour', NULL),
    (NEW.id, 'Weekly revision sprint', 'All subjects', 'Recap the week', date_trunc('day', now()) + interval '3 day 9 hour', date_trunc('day', now()) + interval '3 day 11 hour 30 minute', NULL);

  INSERT INTO public.study_rooms (host_id, name, subject, description, meeting_url, scheduled_at)
  VALUES (NEW.id, 'Late-night Maths grind', 'Mathematics', 'Silent co-working with a 5 min break every hour.', 'https://meet.jit.si/studyhub-maths-' || substr(NEW.id::text, 1, 8), date_trunc('day', now()) + interval '20 hour')
  RETURNING id INTO gid;
  INSERT INTO public.room_participants (room_id, user_id) VALUES (gid, NEW.id);

  INSERT INTO public.groups (name, description, subject, created_by)
  VALUES ('Semester 4 Study Squad', 'Share notes, ask doubts, keep each other accountable.', 'General', NEW.id)
  RETURNING id INTO gid;
  INSERT INTO public.group_members (group_id, user_id) VALUES (gid, NEW.id);
  INSERT INTO public.group_messages (group_id, user_id, body) VALUES (gid, NEW.id, 'Welcome to StudyHub! Drop your notes and doubts here 📚');

  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();