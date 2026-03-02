-- Migration: Development-only anon access policies
-- TODO: Remove before production deployment

-- Allow anonymous users full access for development
CREATE POLICY "Dev: Anon can do all on decks" 
    ON public.decks FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Dev: Anon can do all on note_types" 
    ON public.note_types FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Dev: Anon can do all on notes" 
    ON public.notes FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Dev: Anon can do all on cards" 
    ON public.cards FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Dev: Anon can do all on reviews" 
    ON public.reviews FOR ALL TO anon USING (true) WITH CHECK (true);
