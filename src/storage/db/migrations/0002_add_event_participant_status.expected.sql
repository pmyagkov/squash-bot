DO $$ BEGIN
  -- All existing rows must have status 'in' (the default)
  ASSERT (
    SELECT count(*) FROM event_participants WHERE status != 'in'
  ) = 0,
  'All existing event_participants must have status = in after migration';

  -- Column must exist and be NOT NULL
  ASSERT (
    SELECT is_nullable FROM information_schema.columns
    WHERE table_name = 'event_participants' AND column_name = 'status'
  ) = 'NO',
  'status column must be NOT NULL';
END $$;
