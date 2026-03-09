INSERT INTO settings (key, value) VALUES ('main_chat_id', '-1001797061265') ON CONFLICT DO NOTHING;
INSERT INTO settings (key, value) VALUES ('admin_id', '652751380') ON CONFLICT DO NOTHING;
INSERT INTO settings (key, value) VALUES ('court_price', '2000') ON CONFLICT DO NOTHING;
INSERT INTO settings (key, value) VALUES ('timezone', 'Europe/Belgrade') ON CONFLICT DO NOTHING;
INSERT INTO settings (key, value) VALUES ('announcement_deadline', '-1d 10:00') ON CONFLICT DO NOTHING;
INSERT INTO settings (key, value) VALUES ('cancellation_deadline', '-1d 20:00') ON CONFLICT DO NOTHING;
INSERT INTO settings (key, value) VALUES ('max_players_per_court', '3') ON CONFLICT DO NOTHING;
INSERT INTO settings (key, value) VALUES ('min_players_per_court', '2') ON CONFLICT DO NOTHING;
INSERT INTO settings (key, value) VALUES ('default_collector_id', '652751380') ON CONFLICT DO NOTHING;
