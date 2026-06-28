DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'action_items') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE action_items;
  END IF;
END $$;
