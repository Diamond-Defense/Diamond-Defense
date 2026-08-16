export interface SqlCommand {
  sql: string;
  params?: unknown[];
}

export interface SqlExecutionResult {
  changes: number;
  lastRowId?: number;
}

export interface SqliteDatabaseAdapter {
  one<T>(sql: string, params?: unknown[]): Promise<T | null>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<SqlExecutionResult>;
  batch(commands: SqlCommand[]): Promise<SqlExecutionResult[]>;
}
