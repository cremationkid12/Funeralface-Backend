-- Org-level funeral director contact shown on settings and family communications.
ALTER TABLE funeral_homes
  ADD COLUMN IF NOT EXISTS director_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS director_phone TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS director_email TEXT,
  ADD COLUMN IF NOT EXISTS director_image_url TEXT;
