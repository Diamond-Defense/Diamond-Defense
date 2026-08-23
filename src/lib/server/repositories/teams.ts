import type { SqliteDatabaseAdapter } from '$lib/server/database/adapter';
import { createPasswordHash } from '$lib/server/security/passwords';
import { writeAudit } from './audit';
import {
  RecordNotFoundError,
  RecordValidationError,
  RevisionConflictError,
} from './errors';

interface TeamRow {
  id: string;
  name: string;
  coach_email: string;
  revision: number;
  active: number;
  archived_at: string | null;
}

interface MemberRow {
  team_id: string;
  user_id: string;
  display_name: string;
  role: 'player' | 'coach';
  jersey_number: string;
  membership_revision: number;
  user_revision: number;
  active: number;
}

export interface TeamMemberRecord {
  playerId: string;
  name: string;
  number: string;
  role: 'player' | 'coach';
  revision: number;
  userRevision: number;
  active: boolean;
}

export interface TeamOption {
  id: string;
  name: string;
  coachEmail: string;
  revision: number;
  active: boolean;
  archivedAt?: string | null;
  roster: TeamMemberRecord[];
}

export interface TeamInput {
  id: string;
  name: string;
  coachEmail?: string;
}

export interface MemberInput {
  userId: string;
  name: string;
  number?: string;
  role: 'player' | 'coach';
  password?: string;
}

function validateId(value: unknown, label: string): string {
  const id = String(value || '').trim();
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(id)) {
    throw new RecordValidationError(`${label} must use 2–80 lowercase letters, numbers, or hyphens.`);
  }
  return id;
}

function validateName(value: unknown, label: string): string {
  const name = String(value || '').trim();
  if (!name || name.length > 100) {
    throw new RecordValidationError(`${label} is required and must be 100 characters or fewer.`);
  }
  return name;
}

function validateEmail(value: unknown): string {
  const email = String(value || '').trim();
  if (email && (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254)) {
    throw new RecordValidationError('Coach email must be a valid email address.');
  }
  return email;
}

function validatePassword(value: unknown, required: boolean): string {
  const password = String(value || '');
  if (required && password.length < 4) {
    throw new RecordValidationError('A password of at least 4 characters is required.');
  }
  if (password && password.length < 4) {
    throw new RecordValidationError('Passwords must contain at least 4 characters.');
  }
  return password;
}

function mapTeam(team: TeamRow, members: MemberRow[]): TeamOption {
  return {
    id: team.id,
    name: team.name,
    coachEmail: team.coach_email,
    revision: Number(team.revision),
    active: Boolean(team.active),
    archivedAt: team.archived_at,
    roster: members
      .filter((member) => member.team_id === team.id)
      .map((member) => ({
        playerId: member.user_id,
        name: member.display_name,
        number: member.jersey_number,
        role: member.role,
        revision: Number(member.membership_revision),
        userRevision: Number(member.user_revision),
        active: Boolean(member.active),
      })),
  };
}

export class SqliteTeamRepository {
  constructor(private readonly database: SqliteDatabaseAdapter) {}

  private async rows(includeArchived: boolean): Promise<{ teams: TeamRow[]; members: MemberRow[] }> {
    const teams = await this.database.all<TeamRow>(
      `SELECT id, name, coach_email, revision, active, archived_at
         FROM teams ${includeArchived ? '' : 'WHERE active = 1'} ORDER BY name`,
    );
    const members = await this.database.all<MemberRow>(
      `SELECT tm.team_id, tm.user_id, u.display_name, u.role,
              tm.jersey_number, tm.revision AS membership_revision,
              u.revision AS user_revision,
              CASE WHEN tm.active = 1 AND u.active = 1 THEN 1 ELSE 0 END AS active
         FROM team_memberships tm
         JOIN users u ON u.id = tm.user_id
        ${includeArchived ? '' : "WHERE tm.active = 1 AND u.active = 1"}
        ORDER BY tm.team_id, tm.team_role, CAST(tm.jersey_number AS INTEGER), u.display_name`,
    );
    return { teams, members };
  }

  async listOptions(): Promise<TeamOption[]> {
    const { teams, members } = await this.rows(false);
    return teams.map((team) => mapTeam(team, members.filter((member) => member.role === 'player')));
  }

  async listCoachOptions(): Promise<TeamOption[]> {
    const { teams, members } = await this.rows(false);
    return teams
      .map((team) =>
        mapTeam(
          team,
          members.filter(
            (member) => member.role === 'coach' && member.team_id === team.id,
          ),
        ),
      )
      .filter((team) => team.roster.length > 0);
  }

  async listForAdministration(includeArchived = false): Promise<TeamOption[]> {
    const { teams, members } = await this.rows(includeArchived);
    return teams.map((team) => mapTeam(team, members));
  }

  async get(id: string, includeArchived = false): Promise<TeamOption | null> {
    const { teams, members } = await this.rows(includeArchived);
    const team = teams.find((item) => item.id === id);
    return team ? mapTeam(team, members) : null;
  }

  async create(input: TeamInput, actorUserId: string): Promise<TeamOption> {
    const id = validateId(input.id, 'Team ID');
    const name = validateName(input.name, 'Team name');
    const coachEmail = validateEmail(input.coachEmail);
    const now = new Date().toISOString();
    const result = await this.database.execute(
      `INSERT OR IGNORE INTO teams
        (id, name, coach_email, revision, active, created_at, updated_at)
       VALUES (?1, ?2, ?3, 1, 1, ?4, ?4)`,
      [id, name, coachEmail, now],
    );
    if (!result.changes) throw new RecordValidationError('A team with that ID already exists.');
    const created = await this.get(id, true);
    await writeAudit(this.database, actorUserId, 'create', 'team', id, null, created);
    return created!;
  }

  async update(id: string, input: Partial<TeamInput>, expectedRevision: number, actorUserId: string): Promise<TeamOption> {
    const before = await this.get(id, true);
    if (!before) throw new RecordNotFoundError('Team not found.');
    const name = validateName(input.name ?? before.name, 'Team name');
    const coachEmail = validateEmail(input.coachEmail ?? before.coachEmail);
    const result = await this.database.execute(
      `UPDATE teams SET name = ?2, coach_email = ?3, revision = revision + 1,
                        updated_at = ?4
        WHERE id = ?1 AND revision = ?5`,
      [id, name, coachEmail, new Date().toISOString(), expectedRevision],
    );
    if (!result.changes) throw new RevisionConflictError();
    const updated = await this.get(id, true);
    await writeAudit(this.database, actorUserId, 'update', 'team', id, before, updated);
    return updated!;
  }

  async setActive(id: string, active: boolean, expectedRevision: number, actorUserId: string): Promise<TeamOption> {
    const before = await this.get(id, true);
    if (!before) throw new RecordNotFoundError('Team not found.');
    const now = new Date().toISOString();
    const result = await this.database.execute(
      `UPDATE teams SET active = ?2, revision = revision + 1, updated_at = ?3,
                        archived_at = ?4, archived_by = ?5
        WHERE id = ?1 AND revision = ?6`,
      [id, active ? 1 : 0, now, active ? null : now, active ? null : actorUserId, expectedRevision],
    );
    if (!result.changes) throw new RevisionConflictError();
    const updated = await this.get(id, true);
    await writeAudit(this.database, actorUserId, active ? 'restore' : 'archive', 'team', id, before, updated);
    return updated!;
  }

  async createMember(teamId: string, input: MemberInput, actorUserId: string): Promise<TeamMemberRecord> {
    if (!(await this.get(teamId, true))) throw new RecordNotFoundError('Team not found.');
    const userId = validateId(input.userId, 'User ID');
    const name = validateName(input.name, input.role === 'coach' ? 'Coach name' : 'Player name');
    const role = input.role === 'coach' ? 'coach' : 'player';
    const number = String(input.number || '').trim();
    if (role === 'player' && !number) throw new RecordValidationError('Player number is required.');
    const password = validatePassword(input.password, true);
    const existing = await this.database.one<{ id: string }>('SELECT id FROM users WHERE id = ?1', [userId]);
    if (existing) throw new RecordValidationError('A user with that ID already exists. Restore or update it instead.');
    const credentials = await createPasswordHash(password);
    const now = new Date().toISOString();
    await this.database.execute(
      `INSERT INTO users
        (id, username, display_name, role, password_hash, password_salt,
         password_iterations, active, revision, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, 1, ?8, ?8)`,
      [userId, `${teamId}:${userId}`, name, role, credentials.hash, credentials.salt, credentials.iterations, now],
    );
    await this.database.execute(
      `INSERT INTO team_memberships
        (team_id, user_id, team_role, jersey_number, revision, active, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, 1, 1, ?5, ?5)`,
      [teamId, userId, role, number, now],
    );
    const member = await this.getMember(teamId, userId, true);
    await writeAudit(this.database, actorUserId, 'create', 'membership', `${teamId}:${userId}`, null, member);
    return member!;
  }

  async getMember(teamId: string, userId: string, includeArchived = false): Promise<TeamMemberRecord | null> {
    const row = await this.database.one<MemberRow>(
      `SELECT tm.team_id, tm.user_id, u.display_name, u.role,
              tm.jersey_number, tm.revision AS membership_revision,
              u.revision AS user_revision,
              CASE WHEN tm.active = 1 AND u.active = 1 THEN 1 ELSE 0 END AS active
         FROM team_memberships tm JOIN users u ON u.id = tm.user_id
        WHERE tm.team_id = ?1 AND tm.user_id = ?2
          ${includeArchived ? '' : 'AND tm.active = 1 AND u.active = 1'}`,
      [teamId, userId],
    );
    return row ? mapTeam({ id: teamId, name: '', coach_email: '', revision: 1, active: 1, archived_at: null }, [row]).roster[0] : null;
  }

  async updateMember(teamId: string, userId: string, input: Partial<MemberInput>, expectedRevision: number, actorUserId: string): Promise<TeamMemberRecord> {
    const before = await this.getMember(teamId, userId, true);
    if (!before) throw new RecordNotFoundError('Team member not found.');
    const name = validateName(input.name ?? before.name, before.role === 'coach' ? 'Coach name' : 'Player name');
    const number = String(input.number ?? before.number).trim();
    if (before.role === 'player' && !number) throw new RecordValidationError('Player number is required.');
    const now = new Date().toISOString();
    const membership = await this.database.execute(
      `UPDATE team_memberships SET jersey_number = ?3, revision = revision + 1, updated_at = ?4
        WHERE team_id = ?1 AND user_id = ?2 AND revision = ?5`,
      [teamId, userId, number, now, expectedRevision],
    );
    if (!membership.changes) throw new RevisionConflictError();
    await this.database.execute(
      `UPDATE users SET display_name = ?2, username = ?3, revision = revision + 1, updated_at = ?4
        WHERE id = ?1`,
      [userId, name, `${teamId}:${userId}`, now],
    );
    if (input.password) await this.resetPassword(userId, input.password, actorUserId, false);
    const updated = await this.getMember(teamId, userId, true);
    await writeAudit(this.database, actorUserId, 'update', 'membership', `${teamId}:${userId}`, before, updated);
    return updated!;
  }

  async setMemberActive(teamId: string, userId: string, active: boolean, expectedRevision: number, actorUserId: string): Promise<TeamMemberRecord> {
    const before = await this.getMember(teamId, userId, true);
    if (!before) throw new RecordNotFoundError('Team member not found.');
    const now = new Date().toISOString();
    const result = await this.database.execute(
      `UPDATE team_memberships SET active = ?3, revision = revision + 1, updated_at = ?4,
                                   archived_at = ?5, archived_by = ?6
        WHERE team_id = ?1 AND user_id = ?2 AND revision = ?7`,
      [teamId, userId, active ? 1 : 0, now, active ? null : now, active ? null : actorUserId, expectedRevision],
    );
    if (!result.changes) throw new RevisionConflictError();
    if (active) {
      await this.database.execute(
        `UPDATE users SET active = 1, archived_at = NULL, archived_by = NULL,
                          revision = revision + 1, updated_at = ?2 WHERE id = ?1`,
        [userId, now],
      );
    } else {
      await this.database.execute(
        `UPDATE users SET active = 0, archived_at = ?2, archived_by = ?3,
                          revision = revision + 1, updated_at = ?2
          WHERE id = ?1 AND NOT EXISTS (
            SELECT 1 FROM team_memberships
             WHERE user_id = ?1 AND active = 1
          )`,
        [userId, now, actorUserId],
      );
      await this.database.execute('DELETE FROM sessions WHERE user_id = ?1', [userId]);
    }
    const updated = await this.getMember(teamId, userId, true);
    await writeAudit(this.database, actorUserId, active ? 'restore' : 'archive', 'membership', `${teamId}:${userId}`, before, updated);
    return updated!;
  }

  async resetPassword(userId: string, passwordValue: unknown, actorUserId: string, audit = true): Promise<void> {
    const password = validatePassword(passwordValue, true);
    const existing = await this.database.one<{ id: string }>('SELECT id FROM users WHERE id = ?1', [userId]);
    if (!existing) throw new RecordNotFoundError('User not found.');
    const credentials = await createPasswordHash(password);
    await this.database.execute(
      `UPDATE users SET password_hash = ?2, password_salt = ?3,
                        password_iterations = ?4, revision = revision + 1, updated_at = ?5
        WHERE id = ?1`,
      [userId, credentials.hash, credentials.salt, credentials.iterations, new Date().toISOString()],
    );
    await this.database.execute('DELETE FROM sessions WHERE user_id = ?1', [userId]);
    if (audit) await writeAudit(this.database, actorUserId, 'password_reset', 'user', userId, null, { reset: true });
  }
}
