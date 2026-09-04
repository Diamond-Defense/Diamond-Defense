import type { SqliteDatabaseAdapter } from '$lib/server/database/adapter';
import type { Situation } from '$lib/domain/models';
import { writeAudit } from './audit';
import { RecordNotFoundError, RecordValidationError } from './errors';

export type AssignmentStatus = 'draft' | 'active' | 'completed' | 'archived';
export type AssignmentView = 'active' | 'draft' | 'completed' | 'closed' | 'archived';
export type AssignmentSort = 'newest' | 'oldest' | 'due' | 'title';
export type RecipientStatus = 'assigned' | 'in_progress' | 'completed';
export type SituationProgressStatus = 'not_started' | 'incomplete' | 'completed';

export interface AssignmentSituationInput {
  situationKey: string;
  requiredRepetitions?: number;
}

export interface PracticeAssignmentInput {
  title: string;
  instructions?: string;
  dueAt?: string | null;
  playerIds: string[];
  situations: AssignmentSituationInput[];
  publish?: boolean;
}

export interface PracticeAssignmentUpdateInput {
  title: string;
  instructions?: string;
  dueAt?: string | null;
  playerIds?: string[];
  situations?: AssignmentSituationInput[];
  addPlayerIds?: string[];
}

export interface AssignmentListOptions {
  view?: AssignmentView;
  search?: string;
  sort?: AssignmentSort;
}

interface AssignmentRow {
  id: string;
  team_id: string;
  season_id: string;
  coach_id: string;
  coach_name: string;
  title: string;
  instructions: string;
  status: AssignmentStatus;
  due_at: string | null;
  published_at: string | null;
  completed_at: string | null;
  closed_at: string | null;
  cancelled_at: string | null;
  archived_from_status: AssignmentStatus | null;
  source_assignment_id: string | null;
  cycle_number: number;
  created_at: string;
  updated_at: string;
  recipient_count: number;
  completed_recipient_count: number;
  situation_count: number;
}

interface RecipientRow {
  assignment_id: string;
  player_id: string;
  player_name: string;
  player_number: string;
  status: RecipientStatus;
  assigned_at: string;
  started_at: string | null;
  completed_at: string | null;
  lock_active: number;
  released_at: string | null;
  withdrawn_at: string | null;
}

interface SituationRow {
  assignment_id: string;
  situation_key: string;
  display_code: string | null;
  title: string;
  category: string;
  difficulty: string;
  primary_category: string;
  related_categories: string | null;
  sort_order: number;
  situation_revision: number;
  required_repetitions: number;
  completed_repetitions: number;
  passed_repetitions: number;
  progress_status: SituationProgressStatus;
  started_at: string | null;
  completed_at: string | null;
  payload_json: string;
}

export interface PracticeAssignment {
  id: string;
  teamId: string;
  seasonId: string;
  coachId: string;
  coachName: string;
  title: string;
  instructions: string;
  status: AssignmentStatus;
  dueAt: string | null;
  publishedAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  archivedFromStatus: AssignmentStatus | null;
  sourceAssignmentId: string | null;
  cycleNumber: number;
  createdAt: string;
  updatedAt: string;
  recipientCount: number;
  completedRecipientCount: number;
  situationCount: number;
  overdue: boolean;
  recipients: Array<{
    playerId: string;
    playerName: string;
    playerNumber: string;
    status: RecipientStatus;
    assignedAt: string;
    startedAt: string | null;
    completedAt: string | null;
    lockActive: boolean;
    releasedAt: string | null;
    withdrawnAt: string | null;
  }>;
  situations: Array<{
    situationKey: string;
    displayCode?: string;
    title: string;
    category: string;
    difficulty: string;
    primaryCategory: string;
    relatedCategories: string[];
    sortOrder: number;
    situationRevision: number;
    requiredRepetitions: number;
    completedRepetitions: number;
    passedRepetitions: number;
    progressStatus: SituationProgressStatus;
    startedAt: string | null;
    completedAt: string | null;
    situation: Situation;
  }>;
}

export interface PlayerPracticeState {
  pendingCount: number;
  overdueCount: number;
  freePlayAllowed: boolean;
  lockedAssignmentId: string | null;
  lockedAssignment: PracticeAssignment | null;
  nextSituation: PracticeAssignment['situations'][number] | null;
}

function text(value: unknown, label: string, max: number, required = true): string {
  const result = String(value || '').trim();
  if ((required && !result) || result.length > max) {
    throw new RecordValidationError(`${label} ${required ? 'is required and ' : ''}must be ${max} characters or fewer.`);
  }
  return result;
}

function dueDate(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:59.999Z` : raw);
  if (Number.isNaN(parsed.getTime())) throw new RecordValidationError('Due date is invalid.');
  return parsed.toISOString();
}

function normalizedInput(input: PracticeAssignmentInput): PracticeAssignmentInput {
  const players = [...new Set((input.playerIds || []).map((id) => String(id).trim()).filter(Boolean))];
  if (!players.length) throw new RecordValidationError('Select at least one player.');
  const situationKeys = new Set<string>();
  for (const item of input.situations || []) {
    const key = String(item.situationKey || '').trim();
    if (!key) continue;
    situationKeys.add(key);
  }
  if (!situationKeys.size) throw new RecordValidationError('Select at least one situation.');
  return {
    title: text(input.title, 'Assignment title', 120),
    instructions: text(input.instructions, 'Instructions', 1000, false),
    dueAt: dueDate(input.dueAt),
    playerIds: players,
    situations: [...situationKeys].map((situationKey) => ({
      situationKey,
      requiredRepetitions: 1,
    })),
    publish: input.publish === true,
  };
}

function normalizedMetadata(input: PracticeAssignmentUpdateInput) {
  return {
    title: text(input.title, 'Assignment title', 120),
    instructions: text(input.instructions, 'Instructions', 1000, false),
    dueAt: dueDate(input.dueAt),
  };
}

function mapAssignment(row: AssignmentRow, recipients: RecipientRow[], situations: SituationRow[]): PracticeAssignment {
  const now = Date.now();
  return {
    id: row.id,
    teamId: row.team_id,
    seasonId: row.season_id,
    coachId: row.coach_id,
    coachName: row.coach_name,
    title: row.title,
    instructions: row.instructions,
    status: row.status,
    dueAt: row.due_at,
    publishedAt: row.published_at,
    completedAt: row.completed_at,
    closedAt: row.closed_at,
    cancelledAt: row.cancelled_at,
    archivedFromStatus: row.archived_from_status,
    sourceAssignmentId: row.source_assignment_id,
    cycleNumber: Number(row.cycle_number || 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    recipientCount: Number(row.recipient_count || 0),
    completedRecipientCount: Number(row.completed_recipient_count || 0),
    situationCount: Number(row.situation_count || 0),
    overdue: row.status === 'active'
      && !row.closed_at
      && !row.cancelled_at
      && Boolean(row.due_at)
      && new Date(row.due_at!).getTime() < now,
    recipients: recipients.filter((item) => item.assignment_id === row.id).map((item) => ({
      playerId: item.player_id,
      playerName: item.player_name,
      playerNumber: item.player_number,
      status: item.status,
      assignedAt: item.assigned_at,
      startedAt: item.started_at,
      completedAt: item.completed_at,
      lockActive: item.lock_active === 1,
      releasedAt: item.released_at,
      withdrawnAt: item.withdrawn_at,
    })),
    situations: situations.filter((item) => item.assignment_id === row.id).map((item) => ({
      situationKey: item.situation_key,
      displayCode: item.display_code || undefined,
      title: item.title,
      category: item.category,
      difficulty: item.difficulty,
      primaryCategory: item.primary_category,
      relatedCategories: item.related_categories ? item.related_categories.split('|').filter(Boolean) : [],
      sortOrder: Number(item.sort_order),
      situationRevision: Number(item.situation_revision),
      requiredRepetitions: Number(item.required_repetitions),
      completedRepetitions: Number(item.completed_repetitions || 0),
      passedRepetitions: Number(item.passed_repetitions || 0),
      progressStatus: item.progress_status,
      startedAt: item.started_at,
      completedAt: item.completed_at,
      situation: {
        ...(JSON.parse(item.payload_json) as Situation),
        key: item.situation_key,
        displayCode: item.display_code || undefined,
        title: item.title,
        category: item.category,
        difficulty: item.difficulty as Situation['difficulty'],
        primaryCategory: item.primary_category as Situation['primaryCategory'],
        relatedCategories: (item.related_categories ? item.related_categories.split('|').filter(Boolean) : []) as Situation['relatedCategories'],
        revision: Number(item.situation_revision),
      } as Situation,
    })),
  };
}

export class SqlitePracticeAssignmentRepository {
  constructor(private readonly database: SqliteDatabaseAdapter) {}

  private async hydrate(rows: AssignmentRow[], playerId?: string): Promise<PracticeAssignment[]> {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const placeholders = ids.map((_, index) => `?${index + 1}`).join(', ');
    const recipients = await this.database.all<RecipientRow>(
      `SELECT ar.assignment_id, ar.player_id,
              COALESCE(NULLIF(ar.player_name_snapshot, ''), u.display_name) AS player_name,
              COALESCE(NULLIF(ar.player_number_snapshot, ''), tm.jersey_number, '') AS player_number,
              ar.status, ar.assigned_at,
              ar.started_at, ar.completed_at, ar.lock_active, ar.released_at,
              ar.withdrawn_at
         FROM assignment_recipients ar
         JOIN practice_assignments pa ON pa.id = ar.assignment_id
         JOIN users u ON u.id = ar.player_id
         LEFT JOIN team_memberships tm
           ON tm.team_id = pa.team_id AND tm.user_id = ar.player_id
        WHERE ar.assignment_id IN (${placeholders})
        ORDER BY CAST(tm.jersey_number AS INTEGER), u.display_name`,
      ids,
    );
    const situationParams: unknown[] = [...ids];
    let progressJoin = '';
    let progressValues = `0 AS completed_repetitions, 0 AS passed_repetitions,
      'not_started' AS progress_status, NULL AS started_at, NULL AS completed_at`;
    if (playerId) {
      situationParams.push(playerId);
      const playerPlaceholder = `?${situationParams.length}`;
      progressJoin = `LEFT JOIN assignment_progress ap
        ON ap.assignment_id = ast.assignment_id
       AND ap.situation_key = ast.situation_key
       AND ap.player_id = ${playerPlaceholder}`;
      progressValues = `COALESCE(ap.completed_repetitions, 0) AS completed_repetitions,
        COALESCE(ap.passed_repetitions, 0) AS passed_repetitions,
        COALESCE(ap.progress_status, 'not_started') AS progress_status,
        ap.started_at, ap.completed_at`;
    }
    const situations = await this.database.all<SituationRow>(
      `SELECT ast.assignment_id, ast.situation_key, s.display_code, sv.title, sv.category,
              sv.difficulty, sv.payload_json, ast.sort_order, ast.situation_revision,
              (SELECT category_id FROM situation_version_teaching_categories
                WHERE situation_key = sv.situation_key AND situation_revision = sv.revision
                  AND is_primary = 1 LIMIT 1) AS primary_category,
              (SELECT GROUP_CONCAT(category_id, '|') FROM situation_version_teaching_categories
                WHERE situation_key = sv.situation_key AND situation_revision = sv.revision
                  AND is_primary = 0 ORDER BY sort_order) AS related_categories,
              ast.required_repetitions,
              ${progressValues}
         FROM assignment_situations ast
         JOIN situation_versions sv
           ON sv.situation_key = ast.situation_key
          AND sv.revision = ast.situation_revision
         JOIN situations s ON s.key = ast.situation_key
         ${progressJoin}
        WHERE ast.assignment_id IN (${placeholders})
        ORDER BY ast.assignment_id, ast.sort_order, ast.situation_key`,
      situationParams,
    );
    return rows.map((row) => mapAssignment(row, recipients, situations));
  }

  private baseSelect(): string {
    return `SELECT pa.id, pa.team_id, pa.season_id, pa.coach_id, u.display_name AS coach_name,
                   pa.title, pa.instructions, pa.status, pa.due_at,
                   pa.published_at, pa.completed_at, pa.closed_at,
                   pa.cancelled_at, pa.archived_from_status,
                   pa.source_assignment_id, pa.cycle_number,
                   pa.created_at, pa.updated_at,
                   COUNT(DISTINCT ar.player_id) AS recipient_count,
                   COUNT(DISTINCT CASE WHEN ar.status = 'completed' THEN ar.player_id END)
                     AS completed_recipient_count,
                   COUNT(DISTINCT ast.situation_key) AS situation_count
              FROM practice_assignments pa
              JOIN users u ON u.id = pa.coach_id
              LEFT JOIN assignment_recipients ar ON ar.assignment_id = pa.id
              LEFT JOIN assignment_situations ast ON ast.assignment_id = pa.id`;
  }

  async listForTeam(
    teamId: string,
    page: number,
    pageSize: number,
    options: AssignmentListOptions = {},
  ): Promise<{ assignments: PracticeAssignment[]; total: number }> {
    const offset = (page - 1) * pageSize;
    const conditions = ['pa.team_id = ?1'];
    const params: unknown[] = [teamId];
    const viewConditions: Record<AssignmentView, string> = {
      active: "pa.status = 'active' AND pa.closed_at IS NULL AND pa.cancelled_at IS NULL",
      draft: "pa.status = 'draft'",
      completed: "pa.status = 'completed'",
      closed: "pa.status = 'active' AND (pa.closed_at IS NOT NULL OR pa.cancelled_at IS NOT NULL)",
      archived: "pa.status = 'archived'",
    };
    if (options.view) conditions.push(viewConditions[options.view]);
    else conditions.push("pa.status <> 'archived'");
    const search = String(options.search || '').trim();
    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      conditions.push(`(LOWER(pa.title) LIKE ?${params.length} OR LOWER(pa.instructions) LIKE ?${params.length})`);
    }
    const where = conditions.join(' AND ');
    const orderBy: Record<AssignmentSort, string> = {
      newest: 'pa.updated_at DESC, pa.created_at DESC',
      oldest: 'pa.created_at, pa.id',
      due: 'pa.due_at IS NULL, pa.due_at, pa.updated_at DESC',
      title: 'LOWER(pa.title), pa.updated_at DESC',
    };
    const total = await this.database.one<{ total: number }>(
      `SELECT COUNT(*) AS total FROM practice_assignments pa WHERE ${where}`,
      params,
    );
    const pageSizePlaceholder = `?${params.length + 1}`;
    const offsetPlaceholder = `?${params.length + 2}`;
    const rows = await this.database.all<AssignmentRow>(
      `${this.baseSelect()}
        WHERE ${where}
        GROUP BY pa.id
        ORDER BY ${orderBy[options.sort || 'newest']}
        LIMIT ${pageSizePlaceholder} OFFSET ${offsetPlaceholder}`,
      [...params, pageSize, offset],
    );
    return { assignments: await this.hydrate(rows), total: Number(total?.total || 0) };
  }

  async listForPlayer(playerId: string, page: number, pageSize: number): Promise<{ assignments: PracticeAssignment[]; total: number }> {
    const offset = (page - 1) * pageSize;
    const total = await this.database.one<{ total: number }>(
      `SELECT COUNT(*) AS total
         FROM assignment_recipients ar
         JOIN practice_assignments pa ON pa.id = ar.assignment_id
        WHERE ar.player_id = ?1 AND pa.status IN ('active', 'completed')
          AND ar.withdrawn_at IS NULL
          AND pa.closed_at IS NULL AND pa.cancelled_at IS NULL`,
      [playerId],
    );
    const rows = await this.database.all<AssignmentRow>(
      `${this.baseSelect()}
         JOIN assignment_recipients mine
           ON mine.assignment_id = pa.id AND mine.player_id = ?1
        WHERE pa.status IN ('active', 'completed')
          AND mine.withdrawn_at IS NULL
          AND pa.closed_at IS NULL AND pa.cancelled_at IS NULL
        GROUP BY pa.id
        ORDER BY CASE mine.status WHEN 'in_progress' THEN 0 WHEN 'assigned' THEN 1 ELSE 2 END,
                 pa.due_at IS NULL, pa.due_at, pa.created_at DESC
        LIMIT ?2 OFFSET ?3`,
      [playerId, pageSize, offset],
    );
    const assignments = (await this.hydrate(rows, playerId)).map((assignment) => ({
      ...assignment,
      recipients: assignment.recipients.filter((recipient) => recipient.playerId === playerId),
    }));
    return { assignments, total: Number(total?.total || 0) };
  }

  async get(id: string, playerId?: string): Promise<PracticeAssignment | null> {
    const rows = await this.database.all<AssignmentRow>(
      `${this.baseSelect()} WHERE pa.id = ?1 GROUP BY pa.id`,
      [id],
    );
    const assignment = (await this.hydrate(rows, playerId))[0] || null;
    if (assignment && playerId) {
      assignment.recipients = assignment.recipients.filter((recipient) => recipient.playerId === playerId);
    }
    return assignment;
  }

  async playerState(playerId: string): Promise<PlayerPracticeState> {
    const now = new Date().toISOString();
    const counts = await this.database.one<{ pending_count: number; overdue_count: number }>(
      `SELECT COUNT(*) AS pending_count,
              SUM(CASE WHEN pa.due_at IS NOT NULL AND pa.due_at < ?2 THEN 1 ELSE 0 END)
                AS overdue_count
         FROM assignment_recipients ar
         JOIN practice_assignments pa ON pa.id = ar.assignment_id
        WHERE ar.player_id = ?1 AND ar.status <> 'completed'
          AND ar.withdrawn_at IS NULL
          AND pa.status = 'active'
          AND pa.closed_at IS NULL AND pa.cancelled_at IS NULL`,
      [playerId, now],
    );
    const locked = await this.database.one<{ assignment_id: string }>(
      `SELECT ar.assignment_id
         FROM assignment_recipients ar
         JOIN practice_assignments pa ON pa.id = ar.assignment_id
        WHERE ar.player_id = ?1 AND ar.lock_active = 1
          AND ar.status <> 'completed' AND ar.withdrawn_at IS NULL
          AND pa.status = 'active'
          AND pa.closed_at IS NULL AND pa.cancelled_at IS NULL
        LIMIT 1`,
      [playerId],
    );
    const lockedAssignment = locked ? await this.get(locked.assignment_id, playerId) : null;
    const nextSituation = lockedAssignment?.situations.find(
      (item) => item.progressStatus !== 'completed',
    ) || null;
    const pendingCount = Number(counts?.pending_count || 0);
    return {
      pendingCount,
      overdueCount: Number(counts?.overdue_count || 0),
      freePlayAllowed: pendingCount === 0,
      lockedAssignmentId: lockedAssignment?.id || null,
      lockedAssignment,
      nextSituation,
    };
  }

  async startForPlayer(assignmentId: string, playerId: string): Promise<PlayerPracticeState> {
    const available = await this.database.one<{ assignment_id: string }>(
      `SELECT ar.assignment_id
         FROM assignment_recipients ar
         JOIN practice_assignments pa ON pa.id = ar.assignment_id
        WHERE ar.assignment_id = ?1 AND ar.player_id = ?2
          AND ar.status <> 'completed' AND ar.withdrawn_at IS NULL
          AND pa.status = 'active'
          AND pa.closed_at IS NULL AND pa.cancelled_at IS NULL`,
      [assignmentId, playerId],
    );
    if (!available) throw new RecordNotFoundError('This practice assignment is no longer available.');
    const existing = await this.database.one<{ assignment_id: string }>(
      `SELECT assignment_id FROM assignment_recipients
        WHERE player_id = ?1 AND lock_active = 1 AND withdrawn_at IS NULL LIMIT 1`,
      [playerId],
    );
    if (existing && existing.assignment_id !== assignmentId) {
      throw new RecordValidationError('Finish your current practice assignment before starting another.');
    }
    const now = new Date().toISOString();
    try {
      await this.database.execute(
        `UPDATE assignment_recipients
            SET lock_active = 1,
                status = CASE WHEN status = 'assigned' THEN 'in_progress' ELSE status END,
                started_at = COALESCE(started_at, ?3), released_at = NULL
          WHERE assignment_id = ?1 AND player_id = ?2
            AND status <> 'completed'
            AND withdrawn_at IS NULL
            AND EXISTS (
              SELECT 1 FROM practice_assignments pa
               WHERE pa.id = assignment_recipients.assignment_id
                 AND pa.status = 'active'
                 AND pa.closed_at IS NULL AND pa.cancelled_at IS NULL
            )`,
        [assignmentId, playerId, now],
      );
    } catch {
      throw new RecordValidationError('Another practice assignment is already in progress. Reload Your Practice.');
    }
    const state = await this.playerState(playerId);
    if (state.lockedAssignmentId !== assignmentId || !state.nextSituation) {
      throw new RecordValidationError('This practice assignment cannot be started. Reload Your Practice.');
    }
    return state;
  }

  async create(teamId: string, coachId: string, input: PracticeAssignmentInput): Promise<PracticeAssignment> {
    const normalized = normalizedInput(input);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const status: AssignmentStatus = normalized.publish ? 'active' : 'draft';
    const season = await this.database.one<{ id: string }>(
      "SELECT id FROM team_seasons WHERE team_id = ?1 AND status = 'active' LIMIT 1",
      [teamId],
    );
    if (!season) throw new RecordValidationError('Create an active season before assigning practice.');
    const validPlayers = await this.database.all<{ user_id: string; player_name: string; player_number: string }>(
      `SELECT tm.user_id, u.display_name AS player_name,
              COALESCE(tm.jersey_number, '') AS player_number
         FROM team_memberships tm JOIN users u ON u.id = tm.user_id
        WHERE tm.team_id = ?1 AND tm.team_role = 'player'
          AND tm.season_id = ?2 AND tm.active = 1 AND u.active = 1`,
      [teamId, season.id],
    );
    const playerSet = new Set(validPlayers.map((row) => row.user_id));
    const playerSnapshots = new Map(validPlayers.map((row) => [row.user_id, row]));
    if (normalized.playerIds.some((playerId) => !playerSet.has(playerId))) {
      throw new RecordValidationError('Every assignment recipient must be an active player on this team.');
    }
    const validSituations = await this.database.all<{ key: string; revision: number }>(
      `SELECT key, revision FROM situations WHERE active = 1`,
    );
    const situationRevisions = new Map(validSituations.map((row) => [row.key, Number(row.revision)]));
    if (normalized.situations.some((item) => !situationRevisions.has(item.situationKey))) {
      throw new RecordValidationError('Every assigned situation must be active.');
    }
    const commands = [
      ...normalized.situations.flatMap((item) => ([
        {
          sql: `INSERT OR IGNORE INTO situation_versions
            (situation_key, revision, title, category, difficulty, payload_json, created_at)
           SELECT key, revision, title, category, difficulty_level, payload_json, ?2
             FROM situations WHERE key = ?1`,
          params: [item.situationKey, now],
        },
        {
          sql: `INSERT OR IGNORE INTO situation_version_teaching_categories
            (situation_key, situation_revision, category_id, is_primary, sort_order)
           SELECT stc.situation_key, s.revision, stc.category_id, stc.is_primary, stc.sort_order
             FROM situation_teaching_categories stc
             JOIN situations s ON s.key = stc.situation_key
            WHERE stc.situation_key = ?1`,
          params: [item.situationKey],
        },
      ])),
      {
        sql: `INSERT INTO practice_assignments
          (id, team_id, season_id, coach_id, title, instructions, status, due_at,
           published_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`,
        params: [id, teamId, season.id, coachId, normalized.title, normalized.instructions,
          status, normalized.dueAt, normalized.publish ? now : null, now],
      },
      ...normalized.playerIds.map((playerId) => ({
        sql: `INSERT INTO assignment_recipients
          (assignment_id, player_id, status, assigned_at,
           player_name_snapshot, player_number_snapshot)
         VALUES (?1, ?2, 'assigned', ?3, ?4, ?5)`,
        params: [id, playerId, now, playerSnapshots.get(playerId)!.player_name,
          playerSnapshots.get(playerId)!.player_number],
      })),
      ...normalized.situations.map((item, index) => ({
        sql: `INSERT INTO assignment_situations
          (assignment_id, situation_key, sort_order, required_repetitions,
           created_at, situation_revision)
         VALUES (?1, ?2, ?3, 1, ?4, ?5)`,
        params: [id, item.situationKey, index, now, situationRevisions.get(item.situationKey)!],
      })),
      ...normalized.playerIds.flatMap((playerId) => normalized.situations.map((item) => ({
        sql: `INSERT INTO assignment_progress
          (assignment_id, player_id, situation_key, updated_at)
         VALUES (?1, ?2, ?3, ?4)`,
        params: [id, playerId, item.situationKey, now],
      }))),
    ];
    await this.database.batch(commands);
    const created = await this.get(id);
    await writeAudit(this.database, coachId, 'create', 'practice_assignment', id, null, created);
    return created!;
  }

  async publish(id: string, teamId: string, actorId: string): Promise<PracticeAssignment> {
    const before = await this.get(id);
    if (!before || before.teamId !== teamId) throw new RecordNotFoundError('Assignment not found.');
    if (before.status !== 'draft') throw new RecordValidationError('Only draft assignments can be published.');
    const activeSeason = await this.database.one<{ id: string }>(
      "SELECT id FROM team_seasons WHERE team_id = ?1 AND status = 'active' LIMIT 1",
      [teamId],
    );
    if (!activeSeason || activeSeason.id !== before.seasonId) {
      throw new RecordValidationError('Only a draft from the active season can be published.');
    }
    if (!before.recipients.length || !before.situations.length) {
      throw new RecordValidationError('A practice needs at least one player and one situation before publishing.');
    }
    const activeRecipients = await this.database.one<{ total: number }>(
      `SELECT COUNT(*) AS total
         FROM assignment_recipients ar
         JOIN users u ON u.id = ar.player_id
         JOIN team_memberships tm ON tm.user_id = ar.player_id AND tm.team_id = ?2
        WHERE ar.assignment_id = ?1 AND u.active = 1 AND tm.active = 1
          AND tm.season_id = ?3 AND ar.withdrawn_at IS NULL
          AND tm.team_role = 'player'`,
      [id, teamId, before.seasonId],
    );
    if (Number(activeRecipients?.total || 0) !== before.recipients.length) {
      throw new RecordValidationError('Remove inactive or transferred players before publishing this practice.');
    }
    const now = new Date().toISOString();
    await this.database.batch([
      {
        sql: `UPDATE assignment_recipients
                 SET player_name_snapshot = COALESCE((SELECT display_name FROM users WHERE id = player_id), player_name_snapshot),
                     player_number_snapshot = COALESCE((SELECT jersey_number FROM team_memberships
                       WHERE team_id = ?2 AND user_id = player_id LIMIT 1), player_number_snapshot)
               WHERE assignment_id = ?1`,
        params: [id, teamId],
      },
      {
        sql: `UPDATE practice_assignments
                 SET status = 'active', published_at = ?2, updated_at = ?2
               WHERE id = ?1 AND status = 'draft'`,
        params: [id, now],
      },
    ]);
    const updated = await this.get(id);
    await writeAudit(this.database, actorId, 'publish', 'practice_assignment', id, before, updated);
    return updated!;
  }

  async update(
    id: string,
    teamId: string,
    actorId: string,
    input: PracticeAssignmentUpdateInput,
  ): Promise<PracticeAssignment> {
    const before = await this.get(id);
    if (!before || before.teamId !== teamId) throw new RecordNotFoundError('Assignment not found.');
    if (before.status === 'archived' || before.status === 'completed' || before.closedAt || before.cancelledAt) {
      throw new RecordValidationError('Only drafts and open active practices can be edited.');
    }
    const metadata = normalizedMetadata(input);
    const now = new Date().toISOString();
    if (before.status === 'active') {
      const requested = [...new Set((input.addPlayerIds || []).map(String).map((value) => value.trim()).filter(Boolean))]
        .filter((playerId) => !before.recipients.some((recipient) => recipient.playerId === playerId));
      const players = requested.length
        ? await this.database.all<{ user_id: string; player_name: string; player_number: string }>(
          `SELECT tm.user_id, u.display_name AS player_name, COALESCE(tm.jersey_number, '') AS player_number
             FROM team_memberships tm JOIN users u ON u.id = tm.user_id
            WHERE tm.team_id = ?1 AND tm.season_id = ?2
              AND tm.team_role = 'player' AND tm.active = 1 AND u.active = 1`,
          [teamId, before.seasonId],
        )
        : [];
      const playerMap = new Map(players.map((player) => [player.user_id, player]));
      if (requested.some((playerId) => !playerMap.has(playerId))) {
        throw new RecordValidationError('New recipients must be active players on this team.');
      }
      await this.database.batch([
        {
          sql: `UPDATE practice_assignments SET title = ?2, instructions = ?3,
                  due_at = ?4, updated_at = ?5 WHERE id = ?1`,
          params: [id, metadata.title, metadata.instructions, metadata.dueAt, now],
        },
        ...requested.map((playerId) => ({
          sql: `INSERT INTO assignment_recipients
            (assignment_id, player_id, status, assigned_at, player_name_snapshot, player_number_snapshot)
           VALUES (?1, ?2, 'assigned', ?3, ?4, ?5)`,
          params: [id, playerId, now, playerMap.get(playerId)!.player_name, playerMap.get(playerId)!.player_number],
        })),
        ...requested.flatMap((playerId) => before.situations.map((situation) => ({
          sql: `INSERT INTO assignment_progress
            (assignment_id, player_id, situation_key, updated_at)
           VALUES (?1, ?2, ?3, ?4)`,
          params: [id, playerId, situation.situationKey, now],
        }))),
      ]);
    } else {
      const normalized = normalizedInput({
        ...input,
        playerIds: input.playerIds || [],
        situations: input.situations || [],
        publish: false,
      });
      const players = await this.database.all<{ user_id: string; player_name: string; player_number: string }>(
        `SELECT tm.user_id, u.display_name AS player_name, COALESCE(tm.jersey_number, '') AS player_number
           FROM team_memberships tm JOIN users u ON u.id = tm.user_id
          WHERE tm.team_id = ?1 AND tm.season_id = ?2
            AND tm.team_role = 'player' AND tm.active = 1 AND u.active = 1`,
        [teamId, before.seasonId],
      );
      const playerMap = new Map(players.map((player) => [player.user_id, player]));
      if (normalized.playerIds.some((playerId) => !playerMap.has(playerId))) {
        throw new RecordValidationError('Every assignment recipient must be an active player on this team.');
      }
      const situations = await this.database.all<{ key: string; revision: number }>(
        'SELECT key, revision FROM situations WHERE active = 1',
      );
      const revisions = new Map(situations.map((situation) => [situation.key, Number(situation.revision)]));
      if (normalized.situations.some((situation) => !revisions.has(situation.situationKey))) {
        throw new RecordValidationError('Every assigned situation must be active.');
      }
      await this.database.batch([
        ...normalized.situations.flatMap((item) => ([
          {
            sql: `INSERT OR IGNORE INTO situation_versions
              (situation_key, revision, title, category, difficulty, payload_json, created_at)
             SELECT key, revision, title, category, difficulty_level, payload_json, ?2 FROM situations WHERE key = ?1`,
            params: [item.situationKey, now],
          },
          {
            sql: `INSERT OR IGNORE INTO situation_version_teaching_categories
              (situation_key, situation_revision, category_id, is_primary, sort_order)
             SELECT stc.situation_key, s.revision, stc.category_id, stc.is_primary, stc.sort_order
               FROM situation_teaching_categories stc
               JOIN situations s ON s.key = stc.situation_key
              WHERE stc.situation_key = ?1`,
            params: [item.situationKey],
          },
        ])),
        { sql: 'DELETE FROM assignment_progress WHERE assignment_id = ?1', params: [id] },
        { sql: 'DELETE FROM assignment_situations WHERE assignment_id = ?1', params: [id] },
        { sql: 'DELETE FROM assignment_recipients WHERE assignment_id = ?1', params: [id] },
        {
          sql: `UPDATE practice_assignments SET title = ?2, instructions = ?3,
                  due_at = ?4, updated_at = ?5 WHERE id = ?1 AND status = 'draft'`,
          params: [id, metadata.title, metadata.instructions, metadata.dueAt, now],
        },
        ...normalized.playerIds.map((playerId) => ({
          sql: `INSERT INTO assignment_recipients
            (assignment_id, player_id, status, assigned_at, player_name_snapshot, player_number_snapshot)
           VALUES (?1, ?2, 'assigned', ?3, ?4, ?5)`,
          params: [id, playerId, now, playerMap.get(playerId)!.player_name, playerMap.get(playerId)!.player_number],
        })),
        ...normalized.situations.map((item, index) => ({
          sql: `INSERT INTO assignment_situations
            (assignment_id, situation_key, sort_order, required_repetitions, created_at, situation_revision)
           VALUES (?1, ?2, ?3, 1, ?4, ?5)`,
          params: [id, item.situationKey, index, now, revisions.get(item.situationKey)!],
        })),
        ...normalized.playerIds.flatMap((playerId) => normalized.situations.map((item) => ({
          sql: `INSERT INTO assignment_progress
            (assignment_id, player_id, situation_key, updated_at) VALUES (?1, ?2, ?3, ?4)`,
          params: [id, playerId, item.situationKey, now],
        }))),
      ]);
    }
    const updated = await this.get(id);
    await writeAudit(this.database, actorId, 'update', 'practice_assignment', id, before, updated);
    return updated!;
  }

  async archive(id: string, teamId: string, actorId: string): Promise<PracticeAssignment> {
    const before = await this.get(id);
    if (!before || before.teamId !== teamId) throw new RecordNotFoundError('Assignment not found.');
    if (before.status === 'archived') throw new RecordValidationError('This practice is already archived.');
    const now = new Date().toISOString();
    await this.database.batch([
      {
        sql: `UPDATE practice_assignments SET archived_from_status = status,
                status = 'archived', archived_at = ?2,
                updated_at = ?2 WHERE id = ?1`,
        params: [id, now],
      },
      {
        sql: `UPDATE attempts SET outcome = 'abandoned', lifecycle_status = 'abandoned',
                abandon_reason = 'assignment_archived', completed_at = COALESCE(completed_at, ?2),
                updated_at = ?2
              WHERE assignment_id = ?1 AND lifecycle_status = 'incomplete'`,
        params: [id, now],
      },
      {
        sql: `UPDATE assignment_recipients SET lock_active = 0,
                released_at = COALESCE(released_at, ?2) WHERE assignment_id = ?1`,
        params: [id, now],
      },
    ]);
    const updated = await this.get(id);
    await writeAudit(this.database, actorId, 'archive', 'practice_assignment', id, before, updated);
    return updated!;
  }

  async end(id: string, teamId: string, actorId: string, action: 'close' | 'cancel'): Promise<PracticeAssignment> {
    const before = await this.get(id);
    if (!before || before.teamId !== teamId) throw new RecordNotFoundError('Assignment not found.');
    if (before.status !== 'active' || before.closedAt || before.cancelledAt) {
      throw new RecordValidationError('Only an active assignment can be closed or cancelled.');
    }
    const now = new Date().toISOString();
    const column = action === 'close' ? 'closed_at' : 'cancelled_at';
    const commands = [
      {
        sql: `UPDATE practice_assignments SET ${column} = ?2, ended_by = ?3,
                updated_at = ?2 WHERE id = ?1`,
        params: [id, now, actorId],
      },
      {
        sql: `UPDATE assignment_recipients SET lock_active = 0,
                released_at = COALESCE(released_at, ?2) WHERE assignment_id = ?1`,
        params: [id, now],
      },
    ];
    if (action === 'cancel') {
      commands.push({
        sql: `UPDATE attempts SET outcome = 'abandoned', lifecycle_status = 'abandoned',
                abandon_reason = 'assignment_cancelled', completed_at = COALESCE(completed_at, ?2),
                updated_at = ?2
              WHERE assignment_id = ?1 AND lifecycle_status = 'incomplete'`,
        params: [id, now],
      });
    }
    await this.database.batch(commands);
    const updated = await this.get(id);
    await writeAudit(this.database, actorId, action, 'practice_assignment', id, before, updated);
    return updated!;
  }

  async restore(id: string, teamId: string, actorId: string): Promise<PracticeAssignment> {
    const before = await this.get(id);
    if (!before || before.teamId !== teamId) throw new RecordNotFoundError('Assignment not found.');
    if (before.status !== 'archived') throw new RecordValidationError('Only archived practices can be restored.');
    const now = new Date().toISOString();
    await this.database.batch([
      {
        sql: `UPDATE practice_assignments
                 SET status = CASE archived_from_status
                       WHEN 'draft' THEN 'draft'
                       WHEN 'completed' THEN 'completed'
                       ELSE 'active'
                     END,
                     closed_at = CASE
                       WHEN archived_from_status = 'active'
                         AND closed_at IS NULL AND cancelled_at IS NULL THEN ?2
                       ELSE closed_at
                     END,
                     archived_at = NULL, updated_at = ?2
               WHERE id = ?1 AND status = 'archived'`,
        params: [id, now],
      },
      {
        sql: `UPDATE assignment_recipients SET lock_active = 0,
                released_at = COALESCE(released_at, ?2) WHERE assignment_id = ?1`,
        params: [id, now],
      },
    ]);
    const updated = await this.get(id);
    await writeAudit(this.database, actorId, 'restore', 'practice_assignment', id, before, updated);
    return updated!;
  }

  async duplicate(id: string, teamId: string, actorId: string, retake = false): Promise<PracticeAssignment> {
    const before = await this.get(id);
    if (!before || before.teamId !== teamId) throw new RecordNotFoundError('Assignment not found.');
    if (retake && before.status === 'draft') throw new RecordValidationError('Publish this draft before creating a retake.');
    const activeSeason = await this.database.one<{ id: string }>(
      "SELECT id FROM team_seasons WHERE team_id = ?1 AND status = 'active' LIMIT 1",
      [teamId],
    );
    if (!activeSeason) {
      throw new RecordValidationError('Create an active season before duplicating a practice.');
    }
    const rootId = before.sourceAssignmentId || before.id;
    const highest = retake
      ? await this.database.one<{ cycle: number }>(
        `SELECT MAX(cycle_number) AS cycle FROM practice_assignments
          WHERE id = ?1 OR source_assignment_id = ?1`,
        [rootId],
      )
      : null;
    const cycle = retake ? Number(highest?.cycle || before.cycleNumber || 1) + 1 : 1;
    const newId = crypto.randomUUID();
    const now = new Date().toISOString();
    const title = text(
      (retake ? `${before.title} — Retake ${cycle}` : `${before.title} (Copy)`).slice(0, 120),
      'Assignment title',
      120,
    );
    const currentPlayers = await this.database.all<{
      user_id: string;
      display_name: string;
      jersey_number: string;
    }>(
      `SELECT tm.user_id, u.display_name, COALESCE(tm.jersey_number, '') AS jersey_number
         FROM team_memberships tm JOIN users u ON u.id = tm.user_id
        WHERE tm.team_id = ?1 AND tm.season_id = ?2 AND tm.team_role = 'player'
          AND tm.active = 1 AND u.active = 1`,
      [teamId, activeSeason.id],
    );
    const currentPlayerMap = new Map(currentPlayers.map((player) => [player.user_id, player]));
    const copiedRecipients = before.recipients
      .filter((recipient) => !recipient.withdrawnAt && currentPlayerMap.has(recipient.playerId))
      .map((recipient) => ({
        ...recipient,
        playerName: currentPlayerMap.get(recipient.playerId)!.display_name,
        playerNumber: currentPlayerMap.get(recipient.playerId)!.jersey_number,
      }));
    await this.database.batch([
      {
        sql: `INSERT INTO practice_assignments
          (id, team_id, season_id, coach_id, title, instructions, status, due_at,
           created_at, updated_at, source_assignment_id, cycle_number)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'draft', NULL, ?7, ?7, ?8, ?9)`,
        params: [newId, teamId, activeSeason.id, actorId, title, before.instructions, now, rootId, cycle],
      },
      ...copiedRecipients.map((recipient) => ({
        sql: `INSERT INTO assignment_recipients
          (assignment_id, player_id, status, assigned_at, player_name_snapshot, player_number_snapshot)
         VALUES (?1, ?2, 'assigned', ?3, ?4, ?5)`,
        params: [newId, recipient.playerId, now, recipient.playerName, recipient.playerNumber],
      })),
      ...before.situations.map((situation, index) => ({
        sql: `INSERT INTO assignment_situations
          (assignment_id, situation_key, sort_order, required_repetitions, created_at, situation_revision)
         VALUES (?1, ?2, ?3, 1, ?4, ?5)`,
        params: [newId, situation.situationKey, index, now, situation.situationRevision],
      })),
      ...copiedRecipients.flatMap((recipient) => before.situations.map((situation) => ({
        sql: `INSERT INTO assignment_progress
          (assignment_id, player_id, situation_key, updated_at) VALUES (?1, ?2, ?3, ?4)`,
        params: [newId, recipient.playerId, situation.situationKey, now],
      }))),
    ]);
    const created = await this.get(newId);
    await writeAudit(this.database, actorId, retake ? 'retake' : 'duplicate', 'practice_assignment', newId, before, created);
    return created!;
  }

  async deleteUnusedDraft(id: string, teamId: string, actorId: string): Promise<void> {
    const before = await this.get(id);
    if (!before || before.teamId !== teamId) throw new RecordNotFoundError('Assignment not found.');
    if (before.status !== 'draft') throw new RecordValidationError('Only unused drafts can be permanently deleted.');
    const attempt = await this.database.one<{ id: string }>(
      'SELECT id FROM attempts WHERE assignment_id = ?1 LIMIT 1',
      [id],
    );
    if (attempt) throw new RecordValidationError('This draft has results and cannot be permanently deleted.');
    await this.database.execute("DELETE FROM practice_assignments WHERE id = ?1 AND status = 'draft'", [id]);
    await writeAudit(this.database, actorId, 'delete', 'practice_assignment', id, before, null);
  }

  async assertFreePlayAccess(playerId: string, runId?: string | null): Promise<void> {
    if (runId) {
      const existing = await this.database.one<{ id: string }>(
        `SELECT id FROM attempts
          WHERE player_id = ?1 AND run_id = ?2 AND assignment_id IS NULL LIMIT 1`,
        [playerId, runId],
      );
      if (existing) return;
    }
    const pending = await this.database.one<{ id: string }>(
      `SELECT pa.id
         FROM assignment_recipients ar
         JOIN practice_assignments pa ON pa.id = ar.assignment_id
        WHERE ar.player_id = ?1 AND ar.status <> 'completed'
          AND ar.withdrawn_at IS NULL
          AND pa.status = 'active'
          AND pa.closed_at IS NULL AND pa.cancelled_at IS NULL
        LIMIT 1`,
      [playerId],
    );
    if (pending) {
      throw new RecordValidationError('Complete your assigned practice before starting free play.');
    }
  }

  async assertPlayerAccess(
    assignmentId: string,
    playerId: string,
    situationKey: string,
    situationRevision?: number | null,
    runId?: string | null,
  ): Promise<void> {
    const normalizedRunId = String(runId || '').trim();
    if (!normalizedRunId) {
      throw new RecordValidationError('Assigned practice requires an attempt identifier. Reload your practice and try again.');
    }
    const existingAttempt = await this.database.one<{ situation_revision: number }>(
      `SELECT ast.situation_revision
         FROM attempts a
         JOIN assignment_situations ast
           ON ast.assignment_id = a.assignment_id
          AND ast.situation_key = a.situation_key
        WHERE a.assignment_id = ?1 AND a.player_id = ?2
          AND a.situation_key = ?3 AND a.run_id = ?4`,
      [assignmentId, playerId, situationKey, normalizedRunId],
    );
    if (existingAttempt) {
      if (
        situationRevision != null
        && Number.isInteger(Number(situationRevision))
        && Number(situationRevision) !== Number(existingAttempt.situation_revision)
      ) {
        throw new RecordValidationError('This assignment uses a different revision of the situation. Reload your practice and try again.');
      }
      return;
    }
    const row = await this.database.one<{ situation_revision: number }>(
      `SELECT ast.situation_revision
         FROM practice_assignments pa
         JOIN assignment_recipients ar ON ar.assignment_id = pa.id
         JOIN assignment_situations ast ON ast.assignment_id = pa.id
         JOIN assignment_progress ap
           ON ap.assignment_id = ast.assignment_id
          AND ap.situation_key = ast.situation_key
          AND ap.player_id = ar.player_id
        WHERE pa.id = ?1 AND ar.player_id = ?2 AND ast.situation_key = ?3
          AND pa.status = 'active' AND pa.closed_at IS NULL AND pa.cancelled_at IS NULL
          AND ar.lock_active = 1 AND ar.withdrawn_at IS NULL
          AND ap.progress_status = 'not_started'
          AND (ap.attempt_run_id IS NULL OR ap.attempt_run_id = ?4)
              AND NOT EXISTS (
                SELECT 1
                  FROM assignment_situations earlier_situation
                  JOIN assignment_progress earlier_progress
                    ON earlier_progress.assignment_id = earlier_situation.assignment_id
                   AND earlier_progress.situation_key = earlier_situation.situation_key
                   AND earlier_progress.player_id = ar.player_id
                 WHERE earlier_situation.assignment_id = pa.id
                   AND earlier_progress.progress_status <> 'completed'
                   AND (
                     earlier_situation.sort_order < ast.sort_order
                     OR (earlier_situation.sort_order = ast.sort_order
                       AND earlier_situation.situation_key < ast.situation_key)
                   )
              )`,
      [assignmentId, playerId, situationKey, normalizedRunId],
    );
    if (!row) throw new RecordValidationError('This situation is not available in your active practice assignment.');
    if (
      situationRevision != null
      && Number.isInteger(Number(situationRevision))
      && Number(situationRevision) !== Number(row.situation_revision)
    ) {
      throw new RecordValidationError('This assignment uses a different revision of the situation. Reload your practice and try again.');
    }
    const claim = await this.database.execute(
      `UPDATE assignment_progress
          SET attempt_run_id = ?4, updated_at = ?5
        WHERE assignment_id = ?1 AND player_id = ?2 AND situation_key = ?3
          AND progress_status = 'not_started'
          AND (attempt_run_id IS NULL OR attempt_run_id = ?4)`,
      [assignmentId, playerId, situationKey, normalizedRunId, new Date().toISOString()],
    );
    if (claim.changes === 0) {
      throw new RecordValidationError('This practice situation already has an attempt. Continue to the next situation.');
    }
  }

  async recordStart(
    assignmentId: string,
    playerId: string,
    situationKey: string,
    attemptId: string,
    startedAt: string,
  ): Promise<void> {
    await this.database.batch([
      {
        sql: `UPDATE assignment_progress
                 SET progress_status = CASE
                       WHEN progress_status = 'completed' THEN 'completed'
                       ELSE 'incomplete'
                     END,
                     started_at = COALESCE(started_at, ?5),
                     last_attempt_id = CASE
                       WHEN progress_status = 'completed' THEN last_attempt_id
                       ELSE ?4
                     END,
                     updated_at = ?5
               WHERE assignment_id = ?1 AND player_id = ?2 AND situation_key = ?3
                 AND EXISTS (
                   SELECT 1 FROM practice_assignments pa
                   JOIN assignment_recipients ar ON ar.assignment_id = pa.id
                    WHERE pa.id = assignment_progress.assignment_id
                      AND ar.player_id = assignment_progress.player_id
                      AND ar.lock_active = 1 AND ar.withdrawn_at IS NULL
                      AND pa.status = 'active'
                      AND pa.closed_at IS NULL AND pa.cancelled_at IS NULL
                 )`,
        params: [assignmentId, playerId, situationKey, attemptId, startedAt],
      },
      {
        sql: `UPDATE assignment_recipients
                 SET status = CASE WHEN status = 'assigned' THEN 'in_progress' ELSE status END,
                     started_at = COALESCE(started_at, ?3)
               WHERE assignment_id = ?1 AND player_id = ?2 AND lock_active = 1
                 AND withdrawn_at IS NULL`,
        params: [assignmentId, playerId, startedAt],
      },
    ]);
  }

  async recordAttempt(assignmentId: string, playerId: string, situationKey: string, attemptId: string, passed: boolean, completedAt: string): Promise<boolean> {
    const progress = await this.database.execute(
      `UPDATE assignment_progress
                 SET completed_repetitions = 1,
                     passed_repetitions = CASE WHEN ?4 = 1 THEN 1 ELSE passed_repetitions END,
                     progress_status = 'completed',
                     started_at = COALESCE(started_at, ?6),
                     last_attempt_id = ?5, updated_at = ?6,
                     completed_at = COALESCE(completed_at, ?6)
               WHERE assignment_id = ?1 AND player_id = ?2 AND situation_key = ?3
                 AND progress_status <> 'completed'
                 AND EXISTS (
                   SELECT 1 FROM practice_assignments pa
                   JOIN assignment_recipients ar ON ar.assignment_id = pa.id
                    WHERE pa.id = assignment_progress.assignment_id
                      AND ar.player_id = assignment_progress.player_id
                      AND ar.lock_active = 1 AND ar.withdrawn_at IS NULL
                      AND pa.status = 'active'
                      AND pa.closed_at IS NULL AND pa.cancelled_at IS NULL
                 )`,
      [assignmentId, playerId, situationKey, passed ? 1 : 0, attemptId, completedAt],
    );
    if (progress.changes === 0) return false;
    const remaining = await this.database.one<{ remaining: number }>(
      `SELECT COUNT(*) AS remaining
         FROM assignment_progress ap
        WHERE ap.assignment_id = ?1 AND ap.player_id = ?2
          AND ap.progress_status <> 'completed'`,
      [assignmentId, playerId],
    );
    if (Number(remaining?.remaining || 0) === 0) {
      await this.database.execute(
        `UPDATE assignment_recipients
            SET status = 'completed', completed_at = COALESCE(completed_at, ?3),
                lock_active = 0, released_at = COALESCE(released_at, ?3)
          WHERE assignment_id = ?1 AND player_id = ?2`,
        [assignmentId, playerId, completedAt],
      );
    }
    const incompleteRecipients = await this.database.one<{ remaining: number }>(
      `SELECT COUNT(*) AS remaining FROM assignment_recipients
        WHERE assignment_id = ?1 AND status <> 'completed' AND withdrawn_at IS NULL`,
      [assignmentId],
    );
    if (Number(incompleteRecipients?.remaining || 0) === 0) {
      await this.database.execute(
        `UPDATE practice_assignments
            SET status = 'completed', completed_at = COALESCE(completed_at, ?2), updated_at = ?2
          WHERE id = ?1 AND status = 'active'`,
        [assignmentId, completedAt],
      );
    }
    return true;
  }
}
