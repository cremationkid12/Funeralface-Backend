DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'settings'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'funeral_homes'
  ) THEN
    ALTER TABLE public.settings RENAME TO funeral_homes;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'settings_org_id_key'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'funeral_homes_org_id_key'
  ) THEN
    ALTER INDEX public.settings_org_id_key RENAME TO funeral_homes_org_id_key;
  END IF;
END $$;
