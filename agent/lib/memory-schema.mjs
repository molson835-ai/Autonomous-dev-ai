export function ensureExperienceExternalIdColumn(sql) {
  const columns = sql.exec("PRAGMA table_info(experiences)").toArray();
  if (!columns.some((column) => column.name === "external_id")) sql.exec("ALTER TABLE experiences ADD COLUMN external_id TEXT");
  sql.exec("CREATE UNIQUE INDEX IF NOT EXISTS experiences_external_id_unique ON experiences(external_id) WHERE external_id IS NOT NULL");
}
export function findExperienceByExternalId(sql, externalId) {
  return sql.exec("SELECT * FROM experiences WHERE external_id = ? LIMIT 1", externalId).toArray()[0] ?? null;
}
