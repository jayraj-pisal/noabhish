DROP POLICY "messages_read_members" ON public.group_messages;
DROP POLICY "messages_insert_members" ON public.group_messages;
CREATE POLICY "messages_read_members" ON public.group_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.group_members m WHERE m.group_id = group_messages.group_id AND m.user_id = auth.uid()));
CREATE POLICY "messages_insert_members" ON public.group_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.group_members m WHERE m.group_id = group_messages.group_id AND m.user_id = auth.uid()));
DROP FUNCTION IF EXISTS public.is_group_member(UUID, UUID);
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM anon, authenticated, PUBLIC;