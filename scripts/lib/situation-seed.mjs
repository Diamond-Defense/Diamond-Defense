function quote(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function buildSituationSeedSql(situations, createdAt = new Date().toISOString()) {
  if (!Array.isArray(situations) || situations.length === 0) {
    throw new Error('At least one situation is required.');
  }

  const keys = new Set();
  const statements = ['PRAGMA foreign_keys = ON;'];
  for (const situation of situations) {
    const key = String(situation?.key || '').trim();
    if (!key) throw new Error('Every situation must have a key.');
    if (keys.has(key)) throw new Error(`Duplicate situation key: ${key}.`);
    keys.add(key);

    statements.push(
      `INSERT INTO situations (key, title, description, payload_json, revision, active, created_at, updated_at) VALUES (${quote(key)}, ${quote(situation.title ?? key)}, ${quote(situation.desc ?? '')}, ${quote(JSON.stringify(situation))}, 1, 1, ${quote(createdAt)}, ${quote(createdAt)}) ON CONFLICT(key) DO UPDATE SET title=excluded.title, description=excluded.description, payload_json=excluded.payload_json, revision=situations.revision+1, active=1, archived_at=NULL, archived_by=NULL, updated_at=excluded.updated_at;`,
    );
  }

  return `${statements.join('\n')}\n`;
}
