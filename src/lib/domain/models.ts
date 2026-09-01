export const POSITION_IDS = [
  'P',
  'C',
  '1B',
  '2B',
  'SS',
  '3B',
  'LF',
  'CF',
  'RF',
] as const;

export type PositionId = (typeof POSITION_IDS)[number];
export type HitType = 'line' | 'popup' | 'grounder';
export type SituationDifficulty = 'beginner' | 'intermediate' | 'advanced';

export interface Point {
  x: number;
  y: number;
}

export interface Target extends Point {
  tol: number;
  note?: string;
}

export interface RunnersOn {
  first: boolean;
  second: boolean;
  third: boolean;
}

export interface Situation {
  key: string;
  title: string;
  desc: string;
  category: string;
  difficulty: SituationDifficulty;
  outs: 0 | 1 | 2;
  runnersOn: RunnersOn;
  starts: Record<PositionId, Point>;
  targets: Record<PositionId, Target>;
  hit: Point;
  hitType: HitType;
  batterAdvance: number;
  playSeq: PositionId[];
  playSeq2?: PositionId[];
  seqNote?: string;
}

export interface Player {
  playerId: string;
  name: string;
  number: string;
  password?: string;
}

export interface Team {
  id: string;
  name: string;
  coachEmail: string;
  roster: Player[];
}

export interface Attempt {
  id?: string;
  runId?: string;
  playerId: string;
  situationKey: string;
  situationRevision?: number | null;
  phase: 1 | 2;
  outcome?: 'passed' | 'failed' | 'abandoned';
  abandonReason?: string | null;
  startedAt?: string;
  completedAt?: string;
  score?: number;
  total?: number;
  success?: boolean;
  triesUsed: number;
  timeElapsed: number;
  createdAt: string;
}
