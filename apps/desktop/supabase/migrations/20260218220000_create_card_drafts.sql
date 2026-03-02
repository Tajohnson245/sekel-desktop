-- Card Drafts: temporary holding area for AI-generated cards
-- Max 5 drafts per user, enforced by trigger

CREATE TABLE public.card_drafts (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    front      text NOT NULL,
    back       text NOT NULL,
    source     text,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.card_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own drafts"
    ON public.card_drafts
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Enforce max 5 drafts per user
CREATE OR REPLACE FUNCTION public.check_draft_limit()
RETURNS TRIGGER AS $$
BEGIN
    IF (
        SELECT COUNT(*)
        FROM public.card_drafts
        WHERE user_id = NEW.user_id
    ) >= 5 THEN
        RAISE EXCEPTION 'Draft limit reached (max 5 per user)';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_draft_limit
    BEFORE INSERT ON public.card_drafts
    FOR EACH ROW EXECUTE FUNCTION public.check_draft_limit();
