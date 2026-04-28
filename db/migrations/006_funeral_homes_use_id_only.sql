DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'funeral_homes'
      AND column_name = 'org_id'
  ) THEN
    -- Normalize ID to the organization UUID before dropping org_id.
    UPDATE public.funeral_homes
    SET id = org_id
    WHERE org_id IS NOT NULL
      AND id IS DISTINCT FROM org_id;

    IF EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'funeral_homes_org_id_key'
    ) THEN
      DROP INDEX public.funeral_homes_org_id_key;
    END IF;

    ALTER TABLE public.funeral_homes DROP COLUMN org_id;
  END IF;
END $$;
