// Development data maintenance only. Never opens a remote or test database.
import { DatabaseSync, backup } from 'node:sqlite';
import { readdir, mkdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { suggestSituationName, situationIdentity } from '../src/lib/domain/situation-identity.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apply = process.argv.includes('--apply');
if (process.argv.slice(2).some(arg => arg !== '--apply')) throw new Error('Usage: node scripts/rename-local-situations.mjs [--apply]');
const directory = resolve(root, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const files = (await readdir(directory)).filter(file => file.endsWith('.sqlite') && file !== 'metadata.sqlite');
if (files.length !== 1) throw new Error('Expected exactly one local development database. No data changed.');
const db = new DatabaseSync(resolve(directory, files[0]), { readOnly: !apply });
const rows = db.prepare('SELECT * FROM situations ORDER BY display_code').all();
const locations = { 'BD-01':'LF','BD-02':'CF','BD-03':'RF','BD-04':'LF','BD-05':'CF','BD-06':'RF','BD-07':'LF','BD-08':'CF','BD-09':'RF','BD-10-1':'LF','BD-10-2':'LF','BD-10-3':'LF','BD-11':'CF','BD-12':'RF','BD-13':'LF Line','BD-14':'Left-Center','BD-15':'Right-Center','BD-16':'RF Line','BD-17':'LF Line','BD-18':'Left-Center','BD-19':'Right-Center','BD-20':'RF Line','S-MTMU286H-0':'Catcher' };
const updates = [];
for (const row of rows) {
  if (!row.active || !locations[row.key]) continue;
  const situation = JSON.parse(row.payload_json);
  const titleIsReviewed = /^(Single to|Hit |Squeeze Bunt$)/i.test(row.title);
  if (!titleIsReviewed) continue; // Never replace a subsequent custom name.
  situation.ballLocation = locations[row.key];
  situation.title = suggestSituationName(situation);
  updates.push({ row, situation });
}
const duplicate = rows.find(row => row.key === 'BD-10-3' && row.active);
const retained = rows.find(row => row.key === 'BD-07' && row.active);
if (duplicate && (!retained || JSON.stringify(JSON.parse(retained.payload_json).playSeq) !== '["LF","3B","C"]' || JSON.stringify(JSON.parse(duplicate.payload_json).playSeq) !== '["LF","3B","SS"]')) throw new Error('The reviewed duplicate sequences changed. Re-review before archiving.');
if (duplicate && !updates.some(item=>item.row.key===duplicate.key)) updates.push({row:duplicate,situation:JSON.parse(duplicate.payload_json)});
for (const {row,situation} of updates) console.log(`${row.display_code}: ${row.title} → ${situation.title}${row.key==='BD-10-3'?' (archive duplicate)':''}`);
if (!apply) { console.log('Preview only. Add --apply to update local development data.'); db.close(); process.exit(0); }
const backupDir = resolve(root,'.wrangler/local-maintenance-backups');
await mkdir(backupDir,{recursive:true});
const backupPath = resolve(backupDir,`before-situation-names-${Date.now()}.sqlite`);
await backup(db,backupPath);
const migrationName = '0023_situation_identity_and_order.sql';
const migration = await readFile(resolve(root,'migrations',migrationName),'utf8');
const now = new Date().toISOString();
const actor = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get()?.id;
if (!actor) throw new Error('Local administrator account is required for the maintenance audit.');
try {
  db.exec('BEGIN IMMEDIATE');
  if (!db.prepare('SELECT 1 FROM d1_migrations WHERE name = ?').get(migrationName)) {
    db.exec(migration);
    db.prepare('INSERT INTO d1_migrations(name) VALUES(?)').run(migrationName);
  }
  // Archive first so its formerly shared name cannot block the retained record.
  if (duplicate) db.prepare('UPDATE situations SET active=0, archived_at=?, archived_by=? WHERE key=?').run(now,actor,duplicate.key);
  for (const {row,situation} of updates) {
    db.prepare('UPDATE situations SET title=?, payload_json=?, identity_key=?, revision=revision+1, updated_at=? WHERE key=? AND revision=?').run(situation.title,JSON.stringify(situation),situationIdentity(situation),now,row.key,row.revision);
    const nextRevision = row.revision+1;
    db.prepare('INSERT INTO situation_versions(situation_key,revision,title,category,difficulty,payload_json,created_at) VALUES(?,?,?,?,?,?,?)').run(row.key,nextRevision,situation.title,row.category,row.difficulty_level,JSON.stringify(situation),now);
    for (const [current,version] of [['situation_teaching_categories','situation_version_teaching_categories'],['situation_play_outcomes','situation_version_play_outcomes'],['situation_runner_outcomes','situation_version_runner_outcomes']]) {
      const columns=db.prepare(`PRAGMA table_info(${current})`).all().map(column=>column.name).filter(name=>name!=='situation_key');
      const quoted=columns.map(name=>`"${name}"`).join(',');
      db.prepare(`INSERT INTO ${version}(situation_key,situation_revision,${quoted}) SELECT situation_key,?,${quoted} FROM ${current} WHERE situation_key=?`).run(nextRevision,row.key);
    }
    db.prepare('INSERT INTO audit_log(id,actor_user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),actor,row.key==='BD-10-3'?'archive-and-rename':'rename','situation',row.key,row.payload_json,JSON.stringify(situation),now);
  }
  db.exec('COMMIT');
  console.log(`Updated ${updates.length} local records; duplicate archived. Backup: ${backupPath}`);
} catch(error) { db.exec('ROLLBACK'); throw error; } finally { db.close(); }
