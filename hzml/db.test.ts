import { describe, expect, test } from "bun:test";
import { createSQLiteAdapter } from "./db";

describe("createSQLiteAdapter (:memory:)", () => {
  test("run reports changes and query returns rows", () => {
    const db = createSQLiteAdapter(":memory:");
    db.run("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)");
    const insert = db.run("INSERT INTO t (name) VALUES (?), (?)", ["a", "b"]);
    expect(insert).toEqual({ changes: 2 });
    const rows = db.query("SELECT name FROM t ORDER BY id") as Record<string, unknown>[];
    expect(rows).toEqual([{ name: "a" }, { name: "b" }]);
    db.close();
  });

  test("params bind positionally", () => {
    const db = createSQLiteAdapter(":memory:");
    db.run("CREATE TABLE t (a TEXT, b TEXT)");
    db.run("INSERT INTO t (a, b) VALUES (?, ?)", ["first", "second"]);
    const rows = db.query("SELECT * FROM t WHERE a = ? AND b = ?", ["first", "second"]) as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(db.query("SELECT * FROM t WHERE a = ?", ["second"])).toHaveLength(0);
    db.close();
  });

  test("close releases the database", () => {
    const db = createSQLiteAdapter(":memory:");
    db.run("CREATE TABLE t (id INTEGER)");
    db.close();
    expect(() => db.query("SELECT * FROM t")).toThrow();
  });
});
