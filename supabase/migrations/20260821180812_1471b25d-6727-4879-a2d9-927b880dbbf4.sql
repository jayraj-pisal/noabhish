-- FRIENDSHIPS
CREATE TABLE public.friendships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT friendships_status_check CHECK (status IN ('pending','accepted','declined')),
  CONSTRAINT friendships_not_self CHECK (requester_id <> addressee_id),
  CONSTRAINT friendships_unique_pair UNIQUE (requester_id, addressee_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.friendships TO authenticated;
GRANT ALL ON public.friendships TO service_role;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "friendships_read_own" ON public.friendships
  FOR SELECT TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE POLICY "friendships_insert_requester" ON public.friendships
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requester_id AND status = 'pending');

CREATE POLICY "friendships_update_addressee" ON public.friendships
  FOR UPDATE TO authenticated
  USING (auth.uid() = addressee_id)
  WITH CHECK (auth.uid() = addressee_id);

CREATE POLICY "friendships_delete_either" ON public.friendships
  FOR DELETE TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE TRIGGER friendships_updated BEFORE UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX friendships_addressee_idx ON public.friendships (addressee_id, status);
CREATE INDEX friendships_requester_idx ON public.friendships (requester_id, status);

-- INVITATIONS (group / room)
CREATE TABLE public.invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind TEXT NOT NULL,
  target_id UUID NOT NULL,
  inviter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT invitations_kind_check CHECK (kind IN ('group','room')),
  CONSTRAINT invitations_status_check CHECK (status IN ('pending','accepted','declined')),
  CONSTRAINT invitations_not_self CHECK (inviter_id <> invitee_id),
  CONSTRAINT invitations_unique UNIQUE (kind, target_id, invitee_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invitations_read_own" ON public.invitations
  FOR SELECT TO authenticated
  USING (auth.uid() = inviter_id OR auth.uid() = invitee_id);

CREATE POLICY "invitations_insert_inviter" ON public.invitations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = inviter_id AND status = 'pending');

CREATE POLICY "invitations_update_invitee" ON public.invitations
  FOR UPDATE TO authenticated
  USING (auth.uid() = invitee_id)
  WITH CHECK (auth.uid() = invitee_id);

CREATE POLICY "invitations_delete_inviter" ON public.invitations
  FOR DELETE TO authenticated
  USING (auth.uid() = inviter_id);

CREATE TRIGGER invitations_updated BEFORE UPDATE ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX invitations_invitee_idx ON public.invitations (invitee_id, status);

-- DIRECT MESSAGES
CREATE TABLE public.direct_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dm_not_self CHECK (sender_id <> recipient_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.direct_messages TO authenticated;
GRANT ALL ON public.direct_messages TO service_role;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dm_read_participants" ON public.direct_messages
  FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE POLICY "dm_insert_friends" ON public.direct_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND ((f.requester_id = auth.uid() AND f.addressee_id = direct_messages.recipient_id)
          OR (f.addressee_id = auth.uid() AND f.requester_id = direct_messages.recipient_id))
    )
  );

CREATE POLICY "dm_update_recipient" ON public.direct_messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

CREATE POLICY "dm_delete_sender" ON public.direct_messages
  FOR DELETE TO authenticated
  USING (auth.uid() = sender_id);

CREATE INDEX dm_pair_idx ON public.direct_messages (sender_id, recipient_id, created_at DESC);
CREATE INDEX dm_recipient_idx ON public.direct_messages (recipient_id, read_at);

ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
ALTER PUBLICATION supabase_realtime ADD TABLE public.invitations;