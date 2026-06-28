DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meetings' AND column_name = 'share_token') THEN
    ALTER TABLE meetings ADD COLUMN share_token uuid DEFAULT gen_random_uuid() NOT NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_share_token ON meetings(share_token);
