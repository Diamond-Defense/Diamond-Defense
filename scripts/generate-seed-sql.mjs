import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const teams = JSON.parse(await readFile(resolve(root, 'teams.json'), 'utf8'));
const situations = JSON.parse(await readFile(resolve(root, 'situations.json'), 'utf8'));
const createdAt = new Date().toISOString();
const iterations = 120000;
const adminPassword = process.env.DIAMOND_DEFENSE_ADMIN_PASSWORD || 'admin';
const coachPassword = process.env.DIAMOND_DEFENSE_COACH_PASSWORD || 'coach';

function quote(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function passwordFields(password) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(String(password), salt, iterations, 32, 'sha256');
  return { salt: salt.toString('base64'), hash: hash.toString('base64') };
}

function userSql({ id, username, displayName, role, password }) {
  const { salt, hash } = passwordFields(password);
  return `INSERT INTO users (id, username, display_name, role, password_hash, password_salt, password_iterations, active, created_at, updated_at) VALUES (${quote(id)}, ${quote(username)}, ${quote(displayName)}, ${quote(role)}, ${quote(hash)}, ${quote(salt)}, ${iterations}, 1, ${quote(createdAt)}, ${quote(createdAt)}) ON CONFLICT(id) DO UPDATE SET username=excluded.username, display_name=excluded.display_name, role=excluded.role, password_hash=excluded.password_hash, password_salt=excluded.password_salt, password_iterations=excluded.password_iterations, active=1, updated_at=excluded.updated_at;`;
}

const statements = ['PRAGMA foreign_keys = ON;'];

statements.push(userSql({ id: 'staff-admin', username: 'admin', displayName: 'Diamond Defense Admin', role: 'admin', password: adminPassword }));
statements.push(userSql({ id: 'staff-coach', username: 'coach', displayName: 'Diamond Defense Coach', role: 'coach', password: coachPassword }));

for (const team of teams.teams ?? []) {
  statements.push(`INSERT INTO teams (id, name, coach_email, created_at, updated_at) VALUES (${quote(team.id)}, ${quote(team.name)}, ${quote(team.coachEmail ?? '')}, ${quote(createdAt)}, ${quote(createdAt)}) ON CONFLICT(id) DO UPDATE SET name=excluded.name, coach_email=excluded.coach_email, updated_at=excluded.updated_at;`);
  for (const player of team.roster ?? []) {
    const playerId = String(player.playerId);
    statements.push(userSql({ id: playerId, username: `${team.id}:${playerId}`, displayName: player.name, role: 'player', password: player.password || 'change-me' }));
    statements.push(`INSERT INTO team_memberships (team_id, user_id, team_role, jersey_number, created_at) VALUES (${quote(team.id)}, ${quote(playerId)}, 'player', ${quote(player.number ?? '')}, ${quote(createdAt)}) ON CONFLICT(team_id, user_id) DO UPDATE SET team_role='player', jersey_number=excluded.jersey_number;`);
  }
}

const firstTeam = teams.teams?.[0];
if (firstTeam) {
  statements.push(`INSERT INTO team_memberships (team_id, user_id, team_role, jersey_number, created_at) VALUES (${quote(firstTeam.id)}, 'staff-coach', 'coach', '', ${quote(createdAt)}) ON CONFLICT(team_id, user_id) DO UPDATE SET team_role='coach';`);
}

for (const situation of situations) {
  const payload = JSON.stringify(situation);
  statements.push(`INSERT INTO situations (key, title, description, payload_json, revision, active, created_at, updated_at) VALUES (${quote(situation.key)}, ${quote(situation.title ?? situation.key)}, ${quote(situation.desc ?? '')}, ${quote(payload)}, 1, 1, ${quote(createdAt)}, ${quote(createdAt)}) ON CONFLICT(key) DO UPDATE SET title=excluded.title, description=excluded.description, payload_json=excluded.payload_json, revision=situations.revision+1, active=1, updated_at=excluded.updated_at;`);
}

const output = resolve(root, 'database/seed.sql');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${statements.join('\n')}\n`, 'utf8');
console.log(`Generated ${output} with ${situations.length} situations and ${(teams.teams ?? []).length} teams.`);
