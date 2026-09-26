CREATE TABLE team_playbook_state (
 team_id TEXT PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL DEFAULT 1,
 token TEXT NOT NULL DEFAULT ''
);
CREATE TABLE team_playbook_situations (
 team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
 situation_key TEXT NOT NULL REFERENCES situations(key) ON DELETE CASCADE,
 PRIMARY KEY(team_id,situation_key)
);
-- Preserve the current library for teams that exist at rollout only.
INSERT INTO team_playbook_state(team_id) SELECT id FROM teams;
INSERT INTO team_playbook_situations(team_id,situation_key)
 SELECT teams.id,situations.key FROM teams CROSS JOIN situations WHERE situations.active=1;
CREATE TRIGGER team_playbook_initialize AFTER INSERT ON teams BEGIN
 INSERT INTO team_playbook_state(team_id) VALUES(NEW.id);
END;
