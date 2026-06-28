ALTER TABLE users ADD CONSTRAINT users_name_team_unique UNIQUE (name, team_id);
