-- Add OS and Mac chip fields to feedback table
ALTER TABLE public.feedback ADD COLUMN os text;
ALTER TABLE public.feedback ADD COLUMN mac_chip text;
