const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bBearer\s+[A-Za-z0-9._~+\/-]{16,}/i,
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|client[_-]?secret)\s*[:=]\s*[^\s,;]{8,}/i,
  /\bsk-[A-Za-z0-9_-]{16,}/i,
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
