function quote(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
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
        : 'beginner'
  )).trim().toLowerCase();
  if (!category || category.length > 60) throw new Error(`Invalid category for ${situation?.key || 'situation'}.`);
  if (!['beginner', 'intermediate', 'advanced'].includes(difficulty)) {
    throw new Error(`Invalid difficulty for ${situation?.key || 'situation'}.`);
  }
  return { ...situation, category, difficulty };
}

export function buildSituationSeedSql(situations, createdAt = new Date().toISOString()) {
  if (!Array.isArray(situations) || situations.length === 0) {
    throw new Error('At least one situation is required.');
  }

  const keys = new Set();
  const statements = ['PRAGMA foreign_keys = ON;'];
  for (const rawSituation of situations) {
    const situation = normalizeSituationMetadata(rawSituation);
    const key = String(situation?.key || '').trim();
    if (!key) throw new Error('Every situation must have a key.');
    if (keys.has(key)) throw new Error(`Duplicate situation key: ${key}.`);
    keys.add(key);

    statements.push(
      `INSERT INTO situations (key, title, description, category, difficulty, payload_json, revision, active, created_at, updated_at) VALUES (${quote(key)}, ${quote(situation.title ?? key)}, ${quote(situation.desc ?? '')}, ${quote(situation.category)}, ${quote(situation.difficulty)}, ${quote(JSON.stringify(situation))}, 1, 1, ${quote(createdAt)}, ${quote(createdAt)}) ON CONFLICT(key) DO UPDATE SET title=excluded.title, description=excluded.description, category=excluded.category, difficulty=excluded.difficulty, payload_json=excluded.payload_json, revision=situations.revision+1, active=1, archived_at=NULL, archived_by=NULL, updated_at=excluded.updated_at;`,
    );
  }

  return `${statements.join('\n')}\n`;
}
