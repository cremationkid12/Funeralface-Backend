DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'staff_members'
      AND column_name = 'profile_image_url'
  ) THEN
    ALTER TABLE public.staff_members
      ADD COLUMN profile_image_url TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'staff_members'
      AND column_name = 'provider'
  ) THEN
    ALTER TABLE public.staff_members
      ADD COLUMN provider TEXT NOT NULL DEFAULT 'email';
  END IF;
END $$;

UPDATE public.staff_members
SET provider = COALESCE(NULLIF(TRIM(provider), ''), 'email')
WHERE provider IS NULL
   OR TRIM(provider) = '';
