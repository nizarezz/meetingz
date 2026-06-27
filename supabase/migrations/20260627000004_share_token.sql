ALTER TABLE meetings ADD COLUMN share_token uuid DEFAULT gen_random_uuid() NOT NULL;
CREATE UNIQUE INDEX idx_meetings_share_token ON meetings(share_token);
