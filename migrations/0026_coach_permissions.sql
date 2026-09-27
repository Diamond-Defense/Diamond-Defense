CREATE TABLE coach_team_access (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
 PRIMARY KEY(user_id,team_id)
);
CREATE TABLE coach_permissions (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 publish_situations INTEGER NOT NULL DEFAULT 0 CHECK(publish_situations IN (0,1))
);
