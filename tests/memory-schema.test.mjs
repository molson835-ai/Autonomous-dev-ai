import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  ensureExperienceExternalIdColumn,
  findExperienceByExternalId,
} from "../agent/lib/memory-schema.mjs";

function sqlAdapter(db) {
  return {
    exec(statement, ...params) {
      if (/^\s*(PRAGMA|SELECT)\b/i.test(statement)) {
        return { toArray: () => db.prepare(statement).all(...params) };
      }
      db.exec(statement);
      return { toArray: () => [] };
    },
  };
}

function legacyDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE experiences (
      id TEXT PRIMARY KEY,
      task TEXT NOT NULL,
      outcome TEXT NOT NULL,
      result TEXT NOT NULL CHECK (result IN ('success', 'failure', 'partial')),
      evidence TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    INSERT INTO experiences VALUES (
      'legacy-uuid', 'old task', 'old outcome', 'success', 'old evidence',
      '2026-11-01T00:00:00.000Z'
    );
  `);
  return db;
}

test("migration adds nullable external_id without changing existing experience rows", () => {
  const db = legacyDatabase();
  const sql = sqlAdapter(db);

  ensureExperienceExternalIdColumn(sql);

  const row = db.prepare("SELECT * FROM experiences WHERE id = ?").get("legacy-uuid");
  assert.equal(row.task, "old task");
  assert.equal(row.outcome, "old outcome");
  assert.equal(row.result, "success");
  assert.equal(row.external_id, null);
  assert.ok(db.prepare("PRAGMA table_info(experiences)").all().some((column) => column.name === "external_id"));
  db.close();
});

test("migration is safe to run repeatedly", () => {
  const db = legacyDatabase();
  const sql = sqlAdapter(db);

  assert.doesNotThrow(() => {
    ensureExperienceExternalIdColumn(sql);
    ensureExperienceExternalIdColumn(sql);
  });
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM experiences").get().count, 1);
  db.close();
});

test("migration is idempotent when the database already has external_id", () => {
  const db = legacyDatabase();
  db.exec("ALTER TABLE experiences ADD COLUMN external_id TEXT");
  db.prepare("UPDATE experiences SET external_id = ? WHERE id = ?").run("already-present", "legacy-uuid");
  const sql = sqlAdapter(db);
  assert.doesNotThrow(() => { ensureExperienceExternalIdColumn(sql); ensureExperienceExternalIdColumn(sql); });
  assert.equal(db.prepare("SELECT external_id FROM experiences WHERE id = ?").get("legacy-uuid").external_id, "already-present");
  assert.ok(db.prepare("PRAGMA index_list(experiences)").all().some((index) => index.name === "experiences_external_id_unique"));
  db.close();
});
test("external identifier lookup is exact, not a keyword or substring search", () => {
  const db = legacyDatabase();
  const sql = sqlAdapter(db);
  ensureExperienceExternalIdColumn(sql);
  db.prepare("UPDATE experiences SET external_id = ? WHERE id = ?").run(
    "MEMORY-CONNECTION-TEST-001",
    "legacy-uuid",
  );
  db.prepare(`
    INSERT INTO experiences (id, external_id, task, outcome, result, evidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    "second-uuid", "MEMORY-CONNECTION-TEST-001-OTHER", "other task",
    "other outcome", "partial", "", "2026-11-02T00:00:00.000Z",
  );

  assert.equal(findExperienceByExternalId(sql, "MEMORY-CONNECTION-TEST-001").id, "legacy-uuid");
  assert.equal(findExperienceByExternalId(sql, "MEMORY-CONNECTION-TEST"), null);
  assert.equal(findExperienceByExternalId(sql, "missing-id"), null);
  db.close();
});

test("unique external identifiers cannot silently overwrite an existing experience", () => {
  const db = legacyDatabase();
  const sql = sqlAdapter(db);
  ensureExperienceExternalIdColumn(sql);
  db.prepare("UPDATE experiences SET external_id = ? WHERE id = ?").run("same-id", "legacy-uuid");

  assert.throws(() => {
    db.prepare("INSERT INTO experiences (id, external_id, task, outcome, result, evidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("duplicate-uuid", "same-id", "task", "outcome", "success", "", "2026-11-03T00:00:00.000Z");
  }, /UNIQUE constraint failed/);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM experiences").get().count, 1);
  db.close();
});

test("experience result constraint accepts success, failure, and partial only", () => {
  const db = legacyDatabase();
  const sql = sqlAdapter(db);
  ensureExperienceExternalIdColumn(sql);

  for (const [index, result] of ["success", "failure", "partial"].entries()) {
    db.prepare(
      "INSERT INTO experiences (id, external_id, task, outcome, result, evidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      `result-${index}`, null, "test task", "observed outcome", result, "",
      `2026-11-0${index + 2}T00:00:00.000Z`,
    );
  }

  assert.throws(() => {
    db.prepare(
      "INSERT INTO experiences (id, external_id, task, outcome, result, evidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("invalid-result", null, "test task", "unknown", "unknown", "", "2026-11-05T00:00:00.000Z");
  }, /CHECK constraint failed/);

  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM experiences WHERE result IN ('success', 'failure', 'partial')").get().count,
    4,
  );
  db.close();
});
