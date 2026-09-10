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
export type SituationDifficulty = 'foundational' | 'intermediate' | 'advanced';
export type TeachingCategoryId =
  | 'cutoffs-relays'
  | 'backups-rotations'
  | 'force-plays'
  | 'fly-ball-priority'
  | 'rundowns'
  | 'bunt-defense'
  | 'first-third-defense'
  | 'double-plays'
  | 'base-coverage'
  | 'pitcher-catcher-responsibilities'
  | 'tag-ups-sacrifice-flies'
  | 'situational-alignment';

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

export type StartingBase = 'first' | 'second' | 'third';
export type RunnerDestination = 'hold' | 'second' | 'third' | 'home' | 'out';
export type BatterResult = 'out' | 'first' | 'second' | 'third' | 'home';
export type PlayResult =
  | 'single'
  | 'double'
  | 'triple'
  | 'home_run'
  | 'ground_rule_double'
  | 'groundout'
  | 'caught_fly'
  | 'caught_line'
  | 'sacrifice_bunt'
  | 'squeeze_bunt'
  | 'sacrifice_fly'
  | 'fielders_choice'
  | 'double_play'
  | 'error'
  | 'other';
export type OutType = 'force' | 'tag' | 'catch' | 'batter_first' | 'other';

export interface SituationPlayOutcome {
  result: PlayResult;
  batterResult: BatterResult;
  outsRecorded: 0 | 1 | 2 | 3;
  batterOutType?: OutType;
  batterOutOrder?: 1 | 2 | 3;
  reviewStatus: 'ready' | 'needs_review';
}

export interface SituationRunnerOutcome {
  startingBase: StartingBase;
  result: RunnerDestination;
  outType?: OutType;
  outOrder?: 1 | 2 | 3;
  taggedUp: boolean;
}

export interface Situation {
  key: string;
  /** Stable public identifier such as S01 or S21. The key remains internal. */
  displayCode?: string;
  title: string;
  desc: string;
  /** Hit/play outcome such as Singles or Extra-base hits. */
  category: string;
  difficulty: SituationDifficulty;
  primaryCategory: TeachingCategoryId;
  relatedCategories: TeachingCategoryId[];
  outs: 0 | 1 | 2;
  runnersOn: RunnersOn;
  starts: Record<PositionId, Point>;
  targets: Record<PositionId, Target>;
  hit: Point;
  hitType: HitType;
  /** Legacy animation value retained until all clients use structured outcomes. */
  batterAdvance: number;
  playOutcome?: SituationPlayOutcome;
  runnerOutcomes?: SituationRunnerOutcome[];
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
  displayName?: string;
  activeSeasonId?: string | null;
  activeSeasonName?: string | null;
  roster: Player[];
}

export interface Attempt {
  id?: string;
  runId?: string;
  assignmentId?: string;
  playerId: string;
  situationKey: string;
  situationRevision?: number | null;
  phase: 1 | 2;
  outcome?: 'passed' | 'failed' | 'abandoned';
  lifecycleStatus?: 'incomplete' | 'completed' | 'abandoned';
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
