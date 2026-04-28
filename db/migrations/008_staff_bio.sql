DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'staff_members'
      AND column_name = 'bio'
  ) THEN
    ALTER TABLE public.staff_members
      ADD COLUMN bio TEXT;
  END IF;
END $$;
