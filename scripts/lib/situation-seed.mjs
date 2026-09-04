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

export function displayCodeForSituationKey(key) {
  const match = String(key || '').match(/^BD-(\d+)(?:-(.+))?$/i);
  if (!match) return null;
  return `S${match[1].padStart(2, '0')}${match[2] ? `.${match[2].replaceAll('-', '.')}` : ''}`;
}

export function normalizeSituationMetadata(situation) {
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
    const key = String(situation?.key || '').trim();
    const displayCode = situation.displayCode || displayCodeForSituationKey(key);
    if (!key) throw new Error('Every situation must have a key.');
    if (keys.has(key)) throw new Error(`Duplicate situation key: ${key}.`);
    keys.add(key);

    statements.push(
      `INSERT INTO situations (key, display_code, title, description, category, difficulty, difficulty_level, payload_json, revision, active, created_at, updated_at) VALUES (${quote(key)}, ${quote(displayCode)}, ${quote(situation.title ?? key)}, ${quote(situation.desc ?? '')}, ${quote(situation.category)}, ${quote(situation.difficulty === 'foundational' ? 'beginner' : situation.difficulty)}, ${quote(situation.difficulty)}, ${quote(JSON.stringify(situation))}, 1, 1, ${quote(createdAt)}, ${quote(createdAt)}) ON CONFLICT(key) DO UPDATE SET display_code=COALESCE(situations.display_code, excluded.display_code), title=excluded.title, description=excluded.description, category=excluded.category, difficulty=excluded.difficulty, difficulty_level=excluded.difficulty_level, payload_json=excluded.payload_json, revision=situations.revision+1, active=1, archived_at=NULL, archived_by=NULL, updated_at=excluded.updated_at;`,
    );
    statements.push(`DELETE FROM situation_teaching_categories WHERE situation_key = ${quote(key)};`);
    [situation.primaryCategory, ...situation.relatedCategories].forEach((categoryId, index) => {
      statements.push(`INSERT INTO situation_teaching_categories (situation_key, category_id, is_primary, sort_order) VALUES (${quote(key)}, ${quote(categoryId)}, ${index === 0 ? 1 : 0}, ${index});`);
    });
  }

  return `${statements.join('\n')}\n`;
}
