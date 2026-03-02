ALTER TABLE scaffolds ADD COLUMN is_private integer DEFAULT 0 NOT NULL;
ALTER TABLE events ADD COLUMN is_private integer DEFAULT 0 NOT NULL;
ALTER TABLE events ADD COLUMN telegram_chat_id text;

CREATE TABLE IF NOT EXISTS scaffold_participants (
  id text PRIMARY KEY,
  scaffold_id text NOT NULL REFERENCES scaffolds(id) ON DELETE CASCADE,
  participant_id text NOT NULL REFERENCES participants(id),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE(scaffold_id, participant_id)
);
