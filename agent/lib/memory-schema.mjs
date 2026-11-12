export function ensureExperienceExternalIdColumn(sql) {
  try {
    sql.exec("ALTER TABLE experiences ADD COLUMN external_id TEXT");
  } catch (error) {
    if (!/duplicate column name: external_id/i.test(String(error))) {
      throw error;
    }
  }
  sql.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS experiences_external_id_unique ON experiences(external_id) WHERE external_id IS NOT NULL"
  );
}

export function findExperienceByExternalId(sql, externalId) {
  return sql.exec(
    "SELECT * FROM experiences WHERE external_id = ? LIMIT 1",
    externalId
  ).toArray()[0] ?? null;
}
