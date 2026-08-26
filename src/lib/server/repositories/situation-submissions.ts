import type { Situation } from '$lib/domain/models';
import type { SqliteDatabaseAdapter } from '$lib/server/database/adapter';
import { writeAudit } from './audit';
import {
  RecordNotFoundError,
  RecordValidationError,
  RevisionConflictError,
} from './errors';
import { SqliteSituationRepository, type SituationRecord } from './situations';

export type SituationSubmissionStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'withdrawn';

interface SubmissionRow {
  id: string;
  situation_key: string;
  submission_type: 'create' | 'update';
  payload_json: string;
  base_revision: number | null;
  status: SituationSubmissionStatus;
  review_notes: string;
  rationale: string;
  accepted_fields_json: string;
  submitted_by: string;
  submitter_name: string;
  reviewed_by: string | null;
  reviewer_name: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
}

export interface SituationSubmissionRecord {
  id: string;
  situationKey: string;
  submissionType: 'create' | 'update';
  situation: Situation;
  baseRevision: number | null;
  status: SituationSubmissionStatus;
  reviewNotes: string;
  rationale: string;
  acceptedFields: string[];
  submittedBy: string;
  submitterName: string;
  reviewedBy: string | null;
  reviewerName: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
}

function validateSubmissionSituation(input: Situation): Situation {
  const key = String(input?.key || '').trim();
  const title = String(input?.title || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,79}$/.test(key)) {
    throw new RecordValidationError(
      'Situation key must use 2–80 letters, numbers, hyphens, or underscores.',
    );
  }
  if (!title || title.length > 120) {
    throw new RecordValidationError(
      'Situation title is required and must be 120 characters or fewer.',
    );
  }
  return { ...input, key, title };
}

function mapRow(row: SubmissionRow): SituationSubmissionRecord {
  return {
    id: row.id,
    situationKey: row.situation_key,
    submissionType: row.submission_type,
    situation: JSON.parse(row.payload_json) as Situation,
    baseRevision:
      row.base_revision == null ? null : Number(row.base_revision),
    status: row.status,
    reviewNotes: row.review_notes,
    rationale: row.rationale,
    acceptedFields: JSON.parse(row.accepted_fields_json || '[]') as string[],
    submittedBy: row.submitted_by,
    submitterName: row.submitter_name,
    reviewedBy: row.reviewed_by,
    reviewerName: row.reviewer_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at,
  };
}

export class SqliteSituationSubmissionRepository {
  constructor(private readonly database: SqliteDatabaseAdapter) {}

  private baseSelect(): string {
    return `SELECT ss.id, ss.situation_key, ss.submission_type,
                   ss.payload_json, ss.base_revision, ss.status,
                   ss.review_notes, ss.rationale, ss.accepted_fields_json,
                   ss.submitted_by,
                   submitter.display_name AS submitter_name,
                   ss.reviewed_by,
                   reviewer.display_name AS reviewer_name,
                   ss.created_at, ss.updated_at, ss.reviewed_at
              FROM situation_submissions ss
              JOIN users submitter ON submitter.id = ss.submitted_by
              LEFT JOIN users reviewer ON reviewer.id = ss.reviewed_by`;
  }

  async list(options: {
    submittedBy?: string;
    status?: SituationSubmissionStatus;
  } = {}): Promise<SituationSubmissionRecord[]> {
    const filters: string[] = [];
    const params: unknown[] = [];
    if (options.submittedBy) {
      params.push(options.submittedBy);
      filters.push(`ss.submitted_by = ?${params.length}`);
    }
    if (options.status) {
      params.push(options.status);
      filters.push(`ss.status = ?${params.length}`);
    }
    const rows = await this.database.all<SubmissionRow>(
      `${this.baseSelect()}${filters.length ? ` WHERE ${filters.join(' AND ')}` : ''}
       ORDER BY CASE ss.status WHEN 'pending' THEN 0 ELSE 1 END,
                ss.created_at DESC`,
      params,
    );
    return rows.map(mapRow);
  }

  async get(id: string): Promise<SituationSubmissionRecord | null> {
    const row = await this.database.one<SubmissionRow>(
      `${this.baseSelect()} WHERE ss.id = ?1`,
      [id],
    );
    return row ? mapRow(row) : null;
  }

  async submit(
    situationInput: Situation,
    userId: string,
    rationaleInput = '',
  ): Promise<SituationSubmissionRecord> {
    const situation = validateSubmissionSituation(situationInput);
    const rationale = String(rationaleInput || '').trim();
    if (!rationale || rationale.length > 1000) {
      throw new RecordValidationError(
        'Add a proposal reason of 1–1000 characters.',
      );
    }
    const published = await new SqliteSituationRepository(this.database).get(
      situation.key,
      true,
    );
    if (published && published.active === false) {
      throw new RecordValidationError(
        'This situation is archived. An administrator must restore it before changes can be proposed.',
      );
    }
    const existingPending = await this.database.one<{ id: string }>(
      `SELECT id FROM situation_submissions
        WHERE submitted_by = ?1 AND situation_key = ?2 AND status = 'pending'
        LIMIT 1`,
      [userId, situation.key],
    );
    if (existingPending) {
      throw new RecordValidationError(
        'You already have a pending proposal for this situation.',
      );
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.database.execute(
      `INSERT INTO situation_submissions
        (id, situation_key, submission_type, payload_json, base_revision,
         status, review_notes, rationale, accepted_fields_json,
         submitted_by, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 'pending', '', ?6, '[]', ?7, ?8, ?8)`,
      [
        id,
        situation.key,
        published ? 'update' : 'create',
        JSON.stringify(situation),
        published ? published.revision : null,
        rationale,
        userId,
        now,
      ],
    );
    const created = await this.get(id);
    await writeAudit(
      this.database,
      userId,
      'submit',
      'situation_submission',
      id,
      null,
      created,
    );
    return created!;
  }

  async withdraw(
    id: string,
    userId: string,
  ): Promise<SituationSubmissionRecord> {
    const before = await this.get(id);
    if (!before || before.submittedBy !== userId) {
      throw new RecordNotFoundError('Situation proposal not found.');
    }
    if (before.status !== 'pending') {
      throw new RecordValidationError(
        'Only pending proposals can be withdrawn.',
      );
    }
    const now = new Date().toISOString();
    await this.database.execute(
      `UPDATE situation_submissions
          SET status = 'withdrawn', updated_at = ?2
        WHERE id = ?1 AND status = 'pending'`,
      [id, now],
    );
    const updated = await this.get(id);
    await writeAudit(
      this.database,
      userId,
      'withdraw',
      'situation_submission',
      id,
      before,
      updated,
    );
    return updated!;
  }

  async review(
    id: string,
    decision: 'approve' | 'reject',
    notes: string,
    adminUserId: string,
    acceptedFieldsInput: string[] = [],
  ): Promise<{
    submission: SituationSubmissionRecord;
    published: SituationRecord | null;
  }> {
    const before = await this.get(id);
    if (!before) throw new RecordNotFoundError('Situation proposal not found.');
    if (before.status !== 'pending') {
      throw new RecordValidationError(
        'Only pending proposals can be reviewed.',
      );
    }
    const reviewNotes = String(notes || '').trim();
    if (decision === 'reject' && !reviewNotes) {
      throw new RecordValidationError(
        'Add a short note explaining why the proposal was rejected.',
      );
    }

    const selectableFields = [
      'title', 'desc', 'outs', 'runnersOn', 'starts', 'targets', 'hit',
      'hitType', 'batterAdvance', 'playSeq', 'seqNote',
    ];
    const acceptedFields = Array.from(new Set(acceptedFieldsInput))
      .filter((field) => selectableFields.includes(field));
    let published: SituationRecord | null = null;
    if (decision === 'approve') {
      const situations = new SqliteSituationRepository(this.database);
      const current = await situations.get(before.situationKey, true);
      if (before.submissionType === 'create') {
        if (current) {
          throw new RevisionConflictError(
            'A situation with this key now exists. Reject this proposal or submit it again as an update.',
          );
        }
        published = await situations.create(before.situation, adminUserId);
      } else {
        if (!current || current.active === false) {
          throw new RevisionConflictError(
            'The published situation is missing or archived.',
          );
        }
        if (current.revision !== before.baseRevision) {
          throw new RevisionConflictError(
            'The published situation changed after this proposal was submitted. Reject it and ask the coach to submit a fresh revision.',
          );
        }
        if (!acceptedFields.length) {
          throw new RecordValidationError(
            'Select at least one proposed change to publish.',
          );
        }
        const {
          revision: _revision,
          active: _active,
          archivedAt: _archivedAt,
          ...currentSituation
        } = current;
        const merged = { ...currentSituation } as Situation;
        for (const field of acceptedFields) {
          (merged as unknown as Record<string, unknown>)[field] =
            structuredClone(
              (before.situation as unknown as Record<string, unknown>)[field],
            );
        }
        published = await situations.update(
          merged,
          current.revision,
          adminUserId,
        );
      }
    }

    const now = new Date().toISOString();
    await this.database.execute(
      `UPDATE situation_submissions
          SET status = ?2, review_notes = ?3, reviewed_by = ?4,
              reviewed_at = ?5, updated_at = ?5, accepted_fields_json = ?6
        WHERE id = ?1 AND status = 'pending'`,
      [
        id,
        decision === 'approve' ? 'approved' : 'rejected',
        reviewNotes,
        adminUserId,
        now,
        JSON.stringify(
          decision === 'approve'
            ? before.submissionType === 'create' ? selectableFields : acceptedFields
            : [],
        ),
      ],
    );
    const submission = await this.get(id);
    await writeAudit(
      this.database,
      adminUserId,
      decision,
      'situation_submission',
      id,
      before,
      submission,
    );
    return { submission: submission!, published };
  }
}
