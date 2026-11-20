const MAX_ARTIFACT_BYTES = 64 * 1024;
const CSP = "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; media-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'; object-src 'none'";

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

export function validateHtmlArtifact(input) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, errors: ["An artifact object is required."] };
  }
  if (Object.keys(input).some((key) => !["name", "content"].includes(key))) errors.push("Only name and content are supported.");
  if (typeof input.name !== "string" || input.name.trim().length < 1 || input.name.length > 80) errors.push("name must contain 1–80 characters.");
  if (typeof input.content !== "string" || input.content.trim().length === 0) {
    errors.push("content must be non-empty HTML text.");
    return { valid: false, errors };
  }
  const bytes = byteLength(input.content);
  if (bytes > MAX_ARTIFACT_BYTES) errors.push("HTML artifact exceeds the 64 KiB limit.");
  if (/[\u0000-\u0008\u000B\u000C-\u001F\u007F]/u.test(input.content)) errors.push("HTML contains disallowed control characters.");
  if (!/^\s*<!doctype html\b/i.test(input.content)) errors.push("A complete HTML5 document must begin with <!doctype html>.");
  if (!/<html\b[\s>]/i.test(input.content) || !/<\/html\s*>/i.test(input.content)) errors.push("The HTML document must have opening and closing html tags.");
  if (!/<head\b[\s>]/i.test(input.content) || !/<\/head\s*>/i.test(input.content)) errors.push("The HTML document must have a complete head element.");
  if (!/<body\b[\s>]/i.test(input.content) || !/<\/body\s*>/i.test(input.content)) errors.push("The HTML document must have a complete body element.");
  if (!/<meta\s+name=["']viewport["']/i.test(input.content)) errors.push("Include a responsive viewport meta tag for mobile preview.");
  if (/<script\b[^>]*\bsrc\s*=/i.test(input.content) || /\s(?:src|href)\s*=\s*["']https?:\/\//i.test(input.content)) errors.push("External scripts and external asset URLs are not allowed in standalone artifacts.");
  if (errors.length) return { valid: false, errors };
  const safeName = input.name.trim().replace(/[^a-z0-9 _-]/gi, "").replace(/\s+/g, "-").slice(0, 48) || "eve-artifact";
  const previewHtml = input.content.replace(/<head\b[^>]*>/i, (head) => head + `\n<meta http-equiv="Content-Security-Policy" content="${CSP}">\n`);
  return {
    valid: true,
    status: "artifact_validated_not_executed",
    artifact: { name: input.name.trim(), filename: `${safeName}.html`, mediaType: "text/html", bytes, content: previewHtml, previewHtml },
    limits: { maxBytes: MAX_ARTIFACT_BYTES, filesPerCall: 1, externalNetwork: false, serverFilesystem: false, codeExecutionByAgent: false, browserPreviewSandboxed: true, persistence: false },
  };
}
