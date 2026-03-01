import { Database } from "bun:sqlite";

type SqlValue = string | number | boolean | null | Uint8Array;

export interface DatabaseAdapter {
  query(sql: string, params?: SqlValue[]): Record<string, SqlValue>[] | Promise<Record<string, SqlValue>[]>;
  run(sql: string, params?: SqlValue[]): { changes: number } | Promise<{ changes: number }>;
  close(): void;
}

export function createSQLiteAdapter(path: string = "./data.db"): DatabaseAdapter {
  const db = new Database(path);
  db.run("PRAGMA journal_mode=WAL");

  return {
    query(sql: string, params: SqlValue[] = []): Record<string, SqlValue>[] {
      return db.prepare(sql).all(...params) as Record<string, SqlValue>[];
    },
    run(sql: string, params: SqlValue[] = []): { changes: number } {
      const result = db.prepare(sql).run(...params);
      return { changes: result.changes };
    },
    close(): void {
      db.close();
    },
  };
}
