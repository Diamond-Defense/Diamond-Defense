import { pbkdf2Sync, randomBytes } from 'node:crypto';

export const REFRESH_PASSWORD_ENV = 'DIAMOND_DEFENSE_REFRESH_PASSWORD';
export const REFRESH_CONFIRMATION_ENV = 'DIAMOND_DEFENSE_REFRESH_CONFIRMATION';
export const PASSWORD_ITERATIONS = 100000;
export const MINIMUM_PASSWORD_LENGTH = 12;

export const IMPORT_TABLES = [
  'users',
  'teams',
  'team_memberships',
  'situations',
  'attempts',
  'situation_submissions',
];

export const CLEANUP_TABLES = [
  'sessions',
  'audit_log',
  'situation_submissions',
  'attempts',
  'team_memberships',
  'situations',
  'users',
  'teams',
];

export function confirmationPhrase(target) {
  if (target === 'preview') return 'REFRESH PREVIEW';
  if (target === 'local') return 'REFRESH LOCAL';
  throw new Error(`Unsupported refresh target: ${target || '(missing)'}.`);
}

export function parseRefreshArguments(argumentsList) {
  const options = {
    target: null,
    anonymizePlayers: false,
    dryRun: false,
    confirmation: null,
    help: false,
  };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--target') {
      const target = argumentsList[++index];
      if (!target || target.startsWith('--')) {
        throw new Error('--target requires preview or local.');
      }
      options.target = target;
    } else if (argument === '--anonymize-players') {
      options.anonymizePlayers = true;
    } else if (argument === '--dry-run') {
      options.dryRun = true;
    } else if (argument === '--confirm') {
      const confirmation = argumentsList[++index];
      if (!confirmation || confirmation.startsWith('--')) {
        throw new Error('--confirm requires the exact confirmation phrase.');
      }
      options.confirmation = confirmation;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  if (!options.help && !['preview', 'local'].includes(options.target)) {
    throw new Error('--target must be preview or local. Production is never a refresh target.');
  }
  return options;
}

export function validateRefreshPassword(password) {
  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    throw new Error(
      `The non-production password must contain at least ${MINIMUM_PASSWORD_LENGTH} characters.`,
    );
  }
  if (password.length > 1024) {
    throw new Error('The non-production password is unexpectedly long.');
  }
}

export function createPasswordRecord(password, salt = randomBytes(16)) {
  validateRefreshPassword(password);
  return {
    hash: pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, 32, 'sha256').toString('base64'),
    salt: salt.toString('base64'),
    iterations: PASSWORD_ITERATIONS,
  };
}

export function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function insertTable(line) {
  return line.match(/^\s*INSERT INTO\s+"([^"]+)"/i)?.[1] ?? null;
}

export function productionDataFromExport(exportSql) {
  const imports = [];
  const counts = Object.fromEntries(IMPORT_TABLES.map((table) => [table, 0]));
  const allowed = new Set(IMPORT_TABLES);

  for (const line of exportSql.split(/\r?\n/)) {
    const table = insertTable(line);
    if (!table) continue;
    if (!allowed.has(table)) {
      throw new Error(
        `Production export unexpectedly included table ${table}. The refresh was stopped.`,
      );
    }
    imports.push(line.trim());
    counts[table] += 1;
  }

  for (const table of ['users', 'teams', 'situations']) {
    if (counts[table] === 0) {
      throw new Error(`Production export contains no ${table}; refusing to clear the target.`);
    }
  }
  return { imports, counts };
}

export function buildReplacementSql(exportSql, passwordRecord, options = {}) {
  const { imports, counts } = productionDataFromExport(exportSql);
  const statements = [
    'PRAGMA defer_foreign_keys=TRUE;',
    ...CLEANUP_TABLES.map((table) => `DELETE FROM "${table}";`),
    ...imports,
    `UPDATE users SET password_hash = ${sqlString(passwordRecord.hash)}, password_salt = ${sqlString(passwordRecord.salt)}, password_iterations = ${Number(passwordRecord.iterations)}, must_change_password = 0, failed_login_attempts = 0, locked_until = NULL, password_changed_at = CURRENT_TIMESTAMP;`,
    `UPDATE teams SET coach_email = CASE WHEN trim(coach_email) = '' THEN '' ELSE id || '@example.invalid' END;`,
  ];

  if (options.anonymizePlayers) {
    statements.push(
      `UPDATE users
          SET display_name = 'Player ' || printf('%03d', (
                SELECT COUNT(*) FROM users AS ranked
                 WHERE ranked.role = 'player' AND ranked.id <= users.id
              )),
              username = 'nonprod-player-' || printf('%03d', (
                SELECT COUNT(*) FROM users AS ranked
                 WHERE ranked.role = 'player' AND ranked.id <= users.id
              ))
        WHERE role = 'player';`,
      `UPDATE attempts
          SET player_name = COALESCE((
                SELECT display_name FROM users WHERE users.id = attempts.player_id
              ), player_name);`,
    );
  }

  statements.push(
    'DELETE FROM sessions;',
    'DELETE FROM audit_log;',
    'PRAGMA defer_foreign_keys=FALSE;',
  );
  return { sql: `${statements.join('\n')}\n`, counts };
}

export function buildValidationSql(anonymizePlayers = false) {
  return `SELECT
    (SELECT COUNT(*) FROM users) AS users,
    (SELECT COUNT(*) FROM teams) AS teams,
    (SELECT COUNT(*) FROM team_memberships) AS team_memberships,
    (SELECT COUNT(*) FROM situations) AS situations,
    (SELECT COUNT(*) FROM attempts) AS attempts,
    (SELECT COUNT(*) FROM situation_submissions) AS situation_submissions,
    (SELECT COUNT(*) FROM sessions) AS sessions,
    (SELECT COUNT(*) FROM audit_log) AS audit_log,
    (SELECT COUNT(DISTINCT password_hash || ':' || password_salt || ':' || password_iterations) FROM users) AS password_variants,
    (SELECT COUNT(*) FROM teams WHERE coach_email <> '' AND coach_email NOT LIKE '%@example.invalid') AS exposed_emails,
    (SELECT COUNT(*) FROM users WHERE role = 'player' AND display_name NOT GLOB 'Player [0-9][0-9][0-9]') AS non_anonymized_players,
    (SELECT COUNT(*) FROM d1_migrations) AS migrations,
    ${anonymizePlayers ? '1' : '0'} AS anonymization_expected;`;
}

export function validateRefreshResult(row, sourceCounts, expectedMigrations, anonymizePlayers) {
  for (const table of IMPORT_TABLES) {
    if (Number(row?.[table]) !== Number(sourceCounts[table])) {
      throw new Error(
        `Validation failed for ${table}: expected ${sourceCounts[table]}, found ${row?.[table] ?? 'unknown'}.`,
      );
    }
  }
  if (Number(row.sessions) !== 0 || Number(row.audit_log) !== 0) {
    throw new Error('Validation failed: sessions or production audit records remain.');
  }
  if (Number(row.password_variants) !== 1) {
    throw new Error('Validation failed: not every account received the non-production password.');
  }
  if (Number(row.exposed_emails) !== 0) {
    throw new Error('Validation failed: a production contact email remains.');
  }
  if (Number(row.migrations) !== Number(expectedMigrations)) {
    throw new Error('Validation failed: target migration history changed during data import.');
  }
  if (anonymizePlayers && Number(row.non_anonymized_players) !== 0) {
    throw new Error('Validation failed: player display names were not fully anonymized.');
  }
}
