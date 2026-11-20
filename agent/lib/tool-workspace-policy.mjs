const ALLOWED_ROOTS = Object.freeze([
  "agent/tools/",
  "agent/lib/",
  "agent/skills/",
  "tests/",
  "docs/",
]);
const MAX_FILES = 5;
const MAX_FILE_BYTES = 32 * 1024;
const MAX_TOTAL_BYTES = 80 * 1024;
const DENIED_NAMES = new Set([
  ".env", ".env.local", ".env.production", "package.json",
  "package-lock.json", "pnpm-lock.yaml", "yarn.lock",
  "wrangler.jsonc", "wrangler.toml", "tsconfig.json",
]);
const DENIED_PREFIXES = [
  ".github/",
  "apps/web/",
  "memory/",
  "infra/",
  "deploy/",
];
const DENIED_SEGMENTS = new Set(["node_modules", ".git", ".next", "dist", "build"]);

function utf8Bytes(value) {
  return new TextEncoder().encode(value).byteLength;
}

function validPath(path) {
  if (typeof path !== "string" || path.length < 1 || path.length > 180) return false;
  if (path.startsWith("/") || path.includes("\\") || path.includes("\0") ||
      path.includes("%") || path.includes(":") || path.trim() !== path) return false;
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || DENIED_SEGMENTS.has(part))) return false;
  if (DENIED_NAMES.has(parts.at(-1))) return false;
  if (DENIED_PREFIXES.some((prefix) => path.startsWith(prefix))) return false;
  return ALLOWED_ROOTS.some((root) => path.startsWith(root));
}

/**
 * Validate a proposed set of new text files for a future isolated workspace.
 * This function does not read, write, execute, install, commit, or submit files.
 */
export function validateWorkspaceProposal(proposal) {
  const errors = [];
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) {
    return { valid: false, errors: ["A workspace proposal object is required."] };
  }
  if (Object.keys(proposal).some((key) => key !== "files")) {
    errors.push("Only the files property is supported.");
  }
  if (!Array.isArray(proposal.files) || proposal.files.length < 1 || proposal.files.length > MAX_FILES) {
    errors.push(`Provide between 1 and ${MAX_FILES} proposed files.`);
    return { valid: false, errors };
  }
  const seen = new Set();
  let totalBytes = 0;
  const files = [];
  for (const [index, file] of proposal.files.entries()) {
    if (!file || typeof file !== "object" || Array.isArray(file)) {
      errors.push(`files[${index}] must be an object.`);
      continue;
    }
    if (Object.keys(file).some((key) => !["path", "content", "operation"].includes(key))) {
      errors.push(`files[${index}] contains unsupported properties.`);
    }
    if (file.operation !== "create") {
      errors.push(`files[${index}] must use operation "create"; edits and deletes are not supported.`);
    }
    if (!validPath(file.path)) {
      errors.push(`files[${index}] path is outside the new-file allowlist or is unsafe.`);
    } else if (seen.has(file.path)) {
      errors.push(`Duplicate proposed path: ${file.path}.`);
    } else {
      seen.add(file.path);
    }
    if (typeof file.content !== "string" || file.content.length === 0) {
      errors.push(`files[${index}].content must be non-empty UTF-8 text.`);
      continue;
    }
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(file.content)) {
      errors.push(`files[${index}].content contains disallowed control characters.`);
    }
    const bytes = utf8Bytes(file.content);
    if (bytes > MAX_FILE_BYTES) errors.push(`files[${index}] exceeds the 32 KiB file limit.`);
    totalBytes += bytes;
    files.push({ path: file.path, bytes, operation: "create" });
  }
  if (totalBytes > MAX_TOTAL_BYTES) errors.push("The proposal exceeds the 80 KiB total content limit.");
  return errors.length
    ? { valid: false, errors }
    : {
        valid: true,
        files,
        totalBytes,
        limits: {
          maxFiles: MAX_FILES,
          maxFileBytes: MAX_FILE_BYTES,
          maxTotalBytes: MAX_TOTAL_BYTES,
          createOnly: true,
          allowlistedRoots: ALLOWED_ROOTS,
          filesystemAccess: false,
          execution: false,
          packageInstallation: false,
          networkAccess: false,
          commitOrPullRequest: false,
        },
        status: "validated_proposal_only",
      };
}
