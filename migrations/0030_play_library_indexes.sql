-- Existing owner/updated Board index serves the private branch of the library.
-- Active shared Situations are the other branch; avoid indexing invented metadata.
CREATE INDEX IF NOT EXISTS situations_active_updated ON situations(active, julianday(updated_at) DESC);
CREATE INDEX IF NOT EXISTS situations_active_created ON situations(active, julianday(created_at) DESC);
CREATE INDEX IF NOT EXISTS coach_boards_owner_created ON coach_boards(owner_id, julianday(created_at) DESC);
