const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY(?: BLOCK)?-----/i,
  /\bBearer\s+[A-Za-z0-9._~+\/=-]{16,}/i,
  /(?:api[_-]?key|api[_-]?token|access[_-]?token|refresh[_-]?token|auth[_-]?token|secret(?:[_-]?key)?|client[_-]?secret|password|passwd|private[_-]?key)["']?\s*[:=]\s*["']?[^\s"',;]{8,}/i,
  /\bsk-[A-Za-z0-9_-]{16,}/i,
  /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
];

export function isSafeMemoryText(value, maxLength = 6000) {
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (!text || text.length > maxLength) return false;
  return !SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

export function normalizeMemoryQuery(value, maxLength = 300) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}
