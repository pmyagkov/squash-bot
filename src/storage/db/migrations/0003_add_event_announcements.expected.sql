DO $$ BEGIN
  -- Every announced event with telegram_message_id should have at least one announcement row
  ASSERT (
    SELECT count(*) FROM events
    WHERE telegram_message_id IS NOT NULL
      AND telegram_chat_id IS NOT NULL
      AND id NOT IN (SELECT event_id FROM event_announcements)
  ) = 0,
  'All announced events must have a corresponding event_announcements row';

  -- Announcement count must match events with telegram_message_id
  ASSERT (
    SELECT count(*) FROM event_announcements
  ) = (
    SELECT count(*) FROM events
    WHERE telegram_message_id IS NOT NULL AND telegram_chat_id IS NOT NULL
  ),
  'event_announcements row count must match events with telegram message IDs';
END $$;
