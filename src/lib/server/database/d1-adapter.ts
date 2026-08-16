import type {
  SqlCommand,
  SqlExecutionResult,
  SqliteDatabaseAdapter,
} from './adapter';

interface D1StatementLike {
  bind(...values: unknown[]): D1StatementLike;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results?: T[] }>;
  run(): Promise<{ meta?: { changes?: number; last_row_id?: number } }>;
}

export interface D1DatabaseLike {
  prepare(sql: string): D1StatementLike;
  batch(
    statements: D1StatementLike[],
  ): Promise<Array<{ meta?: { changes?: number; last_row_id?: number } }>>;
}

function resultMeta(result: {
  meta?: { changes?: number; last_row_id?: number };
}): SqlExecutionResult {
  return {
    changes: Number(result.meta?.changes ?? 0),
    lastRowId:
      result.meta?.last_row_id == null
        ? undefined
        : Number(result.meta.last_row_id),
  };
}

export class D1SqliteAdapter implements SqliteDatabaseAdapter {
  constructor(private readonly database: D1DatabaseLike) {}

  private statement(sql: string, params: unknown[] = []): D1StatementLike {
    const statement = this.database.prepare(sql);
    return params.length ? statement.bind(...params) : statement;
  }

  async one<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    return this.statement(sql, params).first<T>();
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.statement(sql, params).all<T>();
    return result.results ?? [];
  }

  async execute(
    sql: string,
    params: unknown[] = [],
  ): Promise<SqlExecutionResult> {
    return resultMeta(await this.statement(sql, params).run());
  }

  async batch(commands: SqlCommand[]): Promise<SqlExecutionResult[]> {
    if (!commands.length) return [];
    const statements = commands.map(({ sql, params = [] }) =>
      this.statement(sql, params),
    );
    return (await this.database.batch(statements)).map(resultMeta);
  }
}
