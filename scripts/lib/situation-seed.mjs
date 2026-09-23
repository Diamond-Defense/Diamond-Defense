function quote(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

export const TEACHING_CATEGORIES = [
  ['cutoffs-relays', 'Cutoffs & Relays', 10],
  ['backups-rotations', 'Backups & Rotations', 20],
  ['force-plays', 'Force Plays', 30],
  ['fly-ball-priority', 'Fly-Ball Priority', 40],
  ['rundowns', 'Rundowns', 50],
  ['bunt-defense', 'Bunt Defense', 60],
  ['first-third-defense', 'First-and-Third Defense', 70],
  ['double-plays', 'Double Plays', 80],
  ['base-coverage', 'Base Coverage', 90],
  ['pitcher-catcher-responsibilities', 'Pitcher & Catcher Responsibilities', 100],
  ['tag-ups-sacrifice-flies', 'Tag-Ups & Sacrifice Flies', 110],
  ['situational-alignment', 'Situational Alignment', 120],
];
const TEACHING_CATEGORY_IDS = new Set(TEACHING_CATEGORIES.map(([id]) => id));
const STARTING_BASES = ['first', 'second', 'third'];
const PLAY_RESULTS = new Set([
  'single', 'double', 'triple', 'home_run', 'ground_rule_double',
  'groundout', 'caught_fly', 'caught_line', 'sacrifice_bunt',
  'squeeze_bunt', 'sacrifice_fly', 'fielders_choice', 'double_play',
  'error', 'other',
]);
const BATTER_RESULTS = new Set(['out', 'first', 'second', 'third', 'home']);
const RUNNER_RESULTS = new Set(['hold', 'second', 'third', 'home', 'out']);
const OUT_TYPES = new Set(['force', 'tag', 'catch', 'batter_first', 'other']);

export function displayCodeForSituationKey(key) {
  const match = String(key || '').match(/^BD-(\d+)(?:-(.+))?$/i);
  if (!match) return null;
  return `S${match[1].padStart(2, '0')}${match[2] ? `.${match[2].replaceAll('-', '.')}` : ''}`;
}

export function normalizeSituationMetadata(situation) {
  // Move legacy numbered labels to the descriptive name, preserving custom names.
  if (/^Situation\s*#?\d[\d.-]*$/i.test(String(situation.title || '').trim()) && String(situation.desc || '').trim()) {
    situation = { ...situation, title: situation.desc.trim(), desc: '' };
  }
  const runnerCount = Object.values(situation?.runnersOn || {}).filter(Boolean).length;
  const advance = Number(situation?.batterAdvance || 0);
  const description = String(situation?.desc || situation?.title || '');
  const derivedCategory = /\bsingle\b/i.test(description)
    ? 'Singles'
    : /\bhit\b/i.test(description)
      ? 'Extra-base hits'
      : 'General';
  const category = String(situation?.category || derivedCategory).trim();
  const difficulty = String(situation?.difficulty || (
    runnerCount >= 2 || (runnerCount >= 1 && advance >= 2)
      ? 'advanced'
      : runnerCount >= 1 || advance >= 2
        ? 'intermediate'
        : 'foundational'
  )).trim().toLowerCase();
  const normalizedDifficulty = difficulty === 'beginner' ? 'foundational' : difficulty;
  if (!category || category.length > 60) throw new Error(`Invalid category for ${situation?.key || 'situation'}.`);
  if (!['foundational', 'intermediate', 'advanced'].includes(normalizedDifficulty)) {
    throw new Error(`Invalid difficulty for ${situation?.key || 'situation'}.`);
  }
  const primaryCategory = String(situation?.primaryCategory || 'cutoffs-relays');
  const relatedCategories = [...new Set(Array.isArray(situation?.relatedCategories)
    ? situation.relatedCategories.map(String)
    : ['backups-rotations', 'base-coverage'])]
    .filter((id) => id !== primaryCategory);
  if (!TEACHING_CATEGORY_IDS.has(primaryCategory)
    || relatedCategories.some((id) => !TEACHING_CATEGORY_IDS.has(id))) {
    throw new Error(`Invalid teaching category for ${situation?.key || 'situation'}.`);
  }
  return { ...situation, category, difficulty: normalizedDifficulty, primaryCategory, relatedCategories };
}

function integer(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function playResultFromLegacy(situation, advance) {
  const title = String(situation?.title || '').toLowerCase();
  const category = String(situation?.category || '').toLowerCase();
  if (title.includes('squeeze')) return 'squeeze_bunt';
  if (title.includes('bunt')) return 'sacrifice_bunt';
  if (category.includes('ground-rule')) return 'ground_rule_double';
  if (advance === 1) return 'single';
  if (advance === 2) return 'double';
  if (advance === 3) return 'triple';
  if (advance >= 4) return 'home_run';
  if (situation?.hitType === 'grounder') return 'groundout';
  if (situation?.hitType === 'popup') return 'caught_fly';
  if (situation?.hitType === 'line') return 'caught_line';
  return 'other';
}

function batterResultFromAdvance(advance) {
  return ['out', 'first', 'second', 'third', 'home'][advance] || 'out';
}

function advanceFromBatterResult(result) {
  return { out: 0, first: 1, second: 2, third: 3, home: 4 }[result] ?? 0;
}

function destinationAfter(base, advance) {
  const index = STARTING_BASES.indexOf(base) + advance;
  if (advance <= 0) return 'hold';
  if (index === 1) return 'second';
  if (index === 2) return 'third';
  return 'home';
}

function defaultOutType(result, batterResult) {
  if (batterResult !== 'out') return null;
  if (['caught_fly', 'caught_line', 'sacrifice_fly'].includes(result)) return 'catch';
  if (['groundout', 'sacrifice_bunt', 'squeeze_bunt'].includes(result)) return 'batter_first';
  return 'other';
}

export function normalizeSituationOutcomeSeed(situation) {
  const legacyAdvance = integer(situation?.batterAdvance, 0, 4, 0);
  const expectedBases = STARTING_BASES.filter((base) => Boolean(situation?.runnersOn?.[base]));
  const suppliedPlay = situation?.playOutcome;
  const suppliedRunners = Array.isArray(situation?.runnerOutcomes) ? situation.runnerOutcomes : null;
  const structuredAdvance = BATTER_RESULTS.has(suppliedPlay?.batterResult)
    ? advanceFromBatterResult(suppliedPlay.batterResult)
    : -1;
  const suppliedBases = suppliedRunners?.map((runner) => runner.startingBase) || [];
  const structuredMatchesLegacy = suppliedPlay && suppliedRunners
    && PLAY_RESULTS.has(suppliedPlay.result)
    && structuredAdvance === legacyAdvance
    && expectedBases.length === suppliedBases.length
    && expectedBases.every((base) => suppliedBases.includes(base));

  if (structuredMatchesLegacy) {
    const playOutcome = {
      result: suppliedPlay.result,
      batterResult: suppliedPlay.batterResult,
      outsRecorded: integer(suppliedPlay.outsRecorded, 0, 3, suppliedPlay.batterResult === 'out' ? 1 : 0),
      ...(OUT_TYPES.has(suppliedPlay.batterOutType) ? { batterOutType: suppliedPlay.batterOutType } : {}),
      ...(integer(suppliedPlay.batterOutOrder, 1, 3, 0)
        ? { batterOutOrder: integer(suppliedPlay.batterOutOrder, 1, 3, 0) }
        : {}),
      reviewStatus: suppliedPlay.reviewStatus === 'needs_review' ? 'needs_review' : 'ready',
    };
    const runnerOutcomes = suppliedRunners.map((runner) => ({
      startingBase: runner.startingBase,
      result: RUNNER_RESULTS.has(runner.result) ? runner.result : 'hold',
      ...(OUT_TYPES.has(runner.outType) ? { outType: runner.outType } : {}),
      ...(integer(runner.outOrder, 1, 3, 0) ? { outOrder: integer(runner.outOrder, 1, 3, 0) } : {}),
      taggedUp: Boolean(runner.taggedUp),
    }));
    return { playOutcome, runnerOutcomes, batterAdvance: structuredAdvance };
  }

  const result = playResultFromLegacy(situation, legacyAdvance);
  const batterResult = batterResultFromAdvance(legacyAdvance);
  const outType = defaultOutType(result, batterResult);
  return {
    playOutcome: {
      result,
      batterResult,
      outsRecorded: batterResult === 'out' ? 1 : 0,
      ...(outType ? { batterOutType: outType } : {}),
      ...(batterResult === 'out' ? { batterOutOrder: 1 } : {}),
      reviewStatus: legacyAdvance === 0 || result === 'other' ? 'needs_review' : 'ready',
    },
    runnerOutcomes: expectedBases.map((startingBase) => ({
      startingBase,
      result: destinationAfter(startingBase, legacyAdvance),
      taggedUp: false,
    })),
    batterAdvance: legacyAdvance,
  };
}

export function buildSituationOutcomeSql(situation) {
  const { playOutcome, runnerOutcomes } = normalizeSituationOutcomeSeed(situation);
  const key = String(situation.key);
  const statements = [
    `DELETE FROM situation_runner_outcomes WHERE situation_key = ${quote(key)};`,
    `DELETE FROM situation_play_outcomes WHERE situation_key = ${quote(key)};`,
    `INSERT INTO situation_play_outcomes (situation_key, play_result, batter_result, outs_recorded, batter_out_type, batter_out_order, review_status) VALUES (${quote(key)}, ${quote(playOutcome.result)}, ${quote(playOutcome.batterResult)}, ${playOutcome.outsRecorded}, ${quote(playOutcome.batterOutType)}, ${playOutcome.batterOutOrder ?? 'NULL'}, ${quote(playOutcome.reviewStatus)});`,
  ];
  runnerOutcomes.forEach((runner) => {
    statements.push(`INSERT INTO situation_runner_outcomes (situation_key, starting_base, runner_result, out_type, out_order, tagged_up) VALUES (${quote(key)}, ${quote(runner.startingBase)}, ${quote(runner.result)}, ${quote(runner.outType)}, ${runner.outOrder ?? 'NULL'}, ${runner.taggedUp ? 1 : 0});`);
  });
  return statements;
}

export function buildSituationSeedSql(situations, createdAt = new Date().toISOString()) {
  if (!Array.isArray(situations) || situations.length === 0) {
    throw new Error('At least one situation is required.');
  }

  const keys = new Set();
  const statements = ['PRAGMA foreign_keys = ON;'];
  for (const [id, label, sortOrder] of TEACHING_CATEGORIES) {
    statements.push(`INSERT OR IGNORE INTO teaching_categories (id, label, sort_order) VALUES (${quote(id)}, ${quote(label)}, ${sortOrder});`);
  }
  for (const rawSituation of situations) {
    const situation = normalizeSituationMetadata(rawSituation);
    const outcomes = normalizeSituationOutcomeSeed(situation);
    const payloadSituation = { ...situation, ...outcomes };
    const key = String(situation?.key || '').trim();
    const displayCode = situation.displayCode || displayCodeForSituationKey(key);
    if (!key) throw new Error('Every situation must have a key.');
    if (keys.has(key)) throw new Error(`Duplicate situation key: ${key}.`);
    keys.add(key);

    statements.push(
      `INSERT INTO situations (key, display_code, title, description, category, difficulty, difficulty_level, payload_json, revision, active, created_at, updated_at) VALUES (${quote(key)}, ${quote(displayCode)}, ${quote(situation.title ?? key)}, ${quote(situation.desc ?? '')}, ${quote(situation.category)}, ${quote(situation.difficulty === 'foundational' ? 'beginner' : situation.difficulty)}, ${quote(situation.difficulty)}, ${quote(JSON.stringify(payloadSituation))}, 1, 1, ${quote(createdAt)}, ${quote(createdAt)}) ON CONFLICT(key) DO UPDATE SET display_code=COALESCE(situations.display_code, excluded.display_code), title=excluded.title, description=excluded.description, category=excluded.category, difficulty=excluded.difficulty, difficulty_level=excluded.difficulty_level, payload_json=excluded.payload_json, revision=situations.revision+1, active=1, archived_at=NULL, archived_by=NULL, updated_at=excluded.updated_at;`,
    );
    statements.push(...buildSituationOutcomeSql(payloadSituation));
    statements.push(`DELETE FROM situation_teaching_categories WHERE situation_key = ${quote(key)};`);
    [situation.primaryCategory, ...situation.relatedCategories].forEach((categoryId, index) => {
      statements.push(`INSERT INTO situation_teaching_categories (situation_key, category_id, is_primary, sort_order) VALUES (${quote(key)}, ${quote(categoryId)}, ${index === 0 ? 1 : 0}, ${index});`);
    });
  }

  return `${statements.join('\n')}\n`;
}
