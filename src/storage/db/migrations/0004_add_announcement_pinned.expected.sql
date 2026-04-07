DO $$ BEGIN
  -- All event_announcements rows must have a pinned column
  ASSERT (
    SELECT count(*) FROM event_announcements WHERE pinned IS NULL
  ) = 0,
  'All event_announcements rows must have a non-null pinned value';
END $$;
