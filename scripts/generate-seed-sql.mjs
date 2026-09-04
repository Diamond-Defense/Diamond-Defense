import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { displayCodeForSituationKey, normalizeSituationMetadata, TEACHING_CATEGORIES } from './lib/situation-seed.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const situations = JSON.parse(await readFile(resolve(root, 'situations.json'), 'utf8'));
const createdAt = new Date().toISOString();
const iterations = 100000;
const testPassword = process.env.DIAMOND_DEFENSE_TEST_PASSWORD || 'password';
const teams = [
  {
    id: '13u-black', name: '13U Black', season: 'Spring 2027',
    coach: { id: 'staff-coach', name: 'Jamie Rivera' },
    players: [
      { id: '13u-black-bob-smith-11', name: 'Bob Smith', number: '11' },
      { id: '13u-black-kevin-smith-22', name: 'Kevin Smith', number: '22' },
    ],
  },
  {
    id: '13u-orange', name: '13U Orange', season: 'Spring 2027',
    coach: { id: 'staff-orange-coach', name: 'Chris Lee' },
    players: [
      { id: 'player-maya-jones-8', name: 'Maya Jones', number: '8' },
      { id: 'player-alex-carter-17', name: 'Alex Carter', number: '17' },
    ],
  },
];
const unassignedPlayer = { id: 'player-taylor-morgan', name: 'Taylor Morgan' };

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

for (const [id, label, sortOrder] of TEACHING_CATEGORIES) {
  statements.push(`INSERT OR IGNORE INTO teaching_categories (id, label, sort_order) VALUES (${quote(id)}, ${quote(label)}, ${sortOrder});`);
}

statements.push(userSql({ id: 'staff-admin', username: 'admin', displayName: 'Diamond Defense Admin', role: 'admin', password: testPassword }));

for (const team of teams) {
  const seasonId = `${team.id}-spring-2027`;
  statements.push(`INSERT INTO teams (id, name, created_at, updated_at) VALUES (${quote(team.id)}, ${quote(team.name)}, ${quote(createdAt)}, ${quote(createdAt)}) ON CONFLICT(id) DO UPDATE SET name=excluded.name, active=1, archived_at=NULL, archived_by=NULL, updated_at=excluded.updated_at;`);
  statements.push(`INSERT INTO team_seasons (id, team_id, name, status, starts_on, created_at, updated_at) VALUES (${quote(seasonId)}, ${quote(team.id)}, ${quote(team.season)}, 'active', '2027-03-01', ${quote(createdAt)}, ${quote(createdAt)}) ON CONFLICT(id) DO UPDATE SET name=excluded.name, status='active', updated_at=excluded.updated_at;`);
  const members = [
    ...team.players.map((player) => ({ ...player, role: 'player' })),
    { ...team.coach, role: 'coach', number: '' },
  ];
  for (const member of members) {
    statements.push(userSql({ id: member.id, username: member.id, displayName: member.name, role: member.role, password: testPassword }));
    statements.push(`INSERT INTO team_memberships (team_id, user_id, team_role, jersey_number, created_at, season_id) VALUES (${quote(team.id)}, ${quote(member.id)}, ${quote(member.role)}, ${quote(member.number ?? '')}, ${quote(createdAt)}, ${quote(seasonId)}) ON CONFLICT(team_id, user_id) DO UPDATE SET team_role=excluded.team_role, jersey_number=excluded.jersey_number, season_id=excluded.season_id, active=1, archived_at=NULL, archived_by=NULL, updated_at=excluded.created_at;`);
    statements.push(`INSERT INTO season_memberships (season_id, team_id, user_id, team_role, display_name_snapshot, jersey_number_snapshot, status, joined_at) VALUES (${quote(seasonId)}, ${quote(team.id)}, ${quote(member.id)}, ${quote(member.role)}, ${quote(member.name)}, ${quote(member.number ?? '')}, 'active', ${quote(createdAt)}) ON CONFLICT(season_id, user_id) DO UPDATE SET display_name_snapshot=excluded.display_name_snapshot, jersey_number_snapshot=excluded.jersey_number_snapshot, status='active', removed_at=NULL, removed_by=NULL;`);
  }
}

statements.push(userSql({ id: unassignedPlayer.id, username: unassignedPlayer.id, displayName: unassignedPlayer.name, role: 'player', password: testPassword }));

const closedSeasonId = '13u-black-fall-2026';
statements.push(`INSERT INTO team_seasons (id, team_id, name, status, starts_on, ends_on, closed_at, created_at, updated_at) VALUES (${quote(closedSeasonId)}, '13u-black', 'Fall 2026', 'closed', '2026-08-01', '2026-11-30', ${quote(createdAt)}, ${quote(createdAt)}, ${quote(createdAt)}) ON CONFLICT(id) DO UPDATE SET name=excluded.name, status='closed', ends_on=excluded.ends_on, closed_at=excluded.closed_at, updated_at=excluded.updated_at;`);
for (const member of [...teams[0].players.map((player) => ({ ...player, role: 'player' })), { ...teams[0].coach, role: 'coach', number: '' }]) {
  statements.push(`INSERT INTO season_memberships (season_id, team_id, user_id, team_role, display_name_snapshot, jersey_number_snapshot, status, joined_at) VALUES (${quote(closedSeasonId)}, '13u-black', ${quote(member.id)}, ${quote(member.role)}, ${quote(member.name)}, ${quote(member.number ?? '')}, 'active', '2026-08-01') ON CONFLICT(season_id, user_id) DO UPDATE SET display_name_snapshot=excluded.display_name_snapshot, jersey_number_snapshot=excluded.jersey_number_snapshot;`);
}

for (const rawSituation of situations) {
  const situation = normalizeSituationMetadata(rawSituation);
  const payload = JSON.stringify(situation);
  const displayCode = situation.displayCode || displayCodeForSituationKey(situation.key);
  statements.push(`INSERT INTO situations (key, display_code, title, description, category, difficulty, difficulty_level, payload_json, revision, active, created_at, updated_at) VALUES (${quote(situation.key)}, ${quote(displayCode)}, ${quote(situation.title ?? situation.key)}, ${quote(situation.desc ?? '')}, ${quote(situation.category)}, ${quote(situation.difficulty === 'foundational' ? 'beginner' : situation.difficulty)}, ${quote(situation.difficulty)}, ${quote(payload)}, 1, 1, ${quote(createdAt)}, ${quote(createdAt)}) ON CONFLICT(key) DO UPDATE SET display_code=COALESCE(situations.display_code, excluded.display_code), title=excluded.title, description=excluded.description, category=excluded.category, difficulty=excluded.difficulty, difficulty_level=excluded.difficulty_level, payload_json=excluded.payload_json, revision=situations.revision+1, active=1, updated_at=excluded.updated_at;`);
  statements.push(`DELETE FROM situation_teaching_categories WHERE situation_key = ${quote(situation.key)};`);
  [situation.primaryCategory, ...situation.relatedCategories].forEach((categoryId, index) => {
    statements.push(`INSERT INTO situation_teaching_categories (situation_key, category_id, is_primary, sort_order) VALUES (${quote(situation.key)}, ${quote(categoryId)}, ${index === 0 ? 1 : 0}, ${index});`);
  });
}

const output = resolve(root, 'database/seed.sql');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${statements.join('\n')}\n`, 'utf8');
console.log(`Generated ${output} with ${situations.length} situations, ${teams.length} teams, and one unassigned player.`);
