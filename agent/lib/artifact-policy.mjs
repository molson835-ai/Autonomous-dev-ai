const MAX_ARTIFACT_BYTES = 64 * 1024;
const MAX_MEDIA_DESCRIPTOR_BYTES = 16 * 1024;
const CSP = "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; media-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'; object-src 'none'";

function byteLength(value) { return new TextEncoder().encode(value).byteLength; }
function safeFilename(name, extension) {
  const base = name.trim().replace(/[^a-z0-9 _-]/gi, "").replace(/\s+/g, "-").slice(0, 48) || "eve-artifact";
  return base + "." + extension;
}
function invalid(errors) { return { valid: false, errors }; }

export function validateArtifact(input) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) return invalid(["An artifact object is required."]);
  if (!["html", "svg", "music", "video"].includes(input.format)) return invalid(["format must be html, svg, music, or video."]);
  if (typeof input.name !== "string" || input.name.trim().length < 1 || input.name.length > 80) errors.push("name must contain 1–80 characters.");
  if (errors.length) return invalid(errors);

  if (input.format === "html") return validateHtml(input, errors);
  if (input.format === "svg") return validateSvg(input, errors);
  if (input.format === "music") return validateMusic(input, errors);
  return validateVideo(input, errors);
}

function validateHtml(input, errors) {
  if (typeof input.content !== "string" || input.content.trim().length === 0) return invalid(["content must be non-empty HTML text."]);
  if (byteLength(input.content) > MAX_ARTIFACT_BYTES) errors.push("HTML artifact exceeds the 64 KiB limit.");
  if (/[\u0000-\u0008\u000B\u000C-\u001F\u007F]/u.test(input.content)) errors.push("HTML contains disallowed control characters.");
  if (!/^\s*<!doctype html\b/i.test(input.content)) errors.push("A complete HTML5 document must begin with <!doctype html>.");
  if (!/<html\b[\s>]/i.test(input.content) || !/<\/html\s*>/i.test(input.content)) errors.push("The HTML document must have opening and closing html tags.");
  if (!/<head\b[\s>]/i.test(input.content) || !/<\/head\s*>/i.test(input.content)) errors.push("The HTML document must have a complete head element.");
  if (!/<body\b[\s>]/i.test(input.content) || !/<\/body\s*>/i.test(input.content)) errors.push("The HTML document must have a complete body element.");
  if (!/<meta\s+name=["']viewport["']/i.test(input.content)) errors.push("Include a responsive viewport meta tag for mobile preview.");
  if (/<script\b[^>]*\bsrc\s*=/i.test(input.content) || /\s(?:src|href)\s*=\s*["']https?:\/\//i.test(input.content)) errors.push("External scripts and external asset URLs are not allowed in standalone artifacts.");
  if (errors.length) return invalid(errors);
  const previewHtml = "<!doctype html><html><head><meta http-equiv=" + JSON.stringify("Content-Security-Policy") + " content=" + JSON.stringify(CSP) + "></head><body style=" + JSON.stringify("margin:0") + ">" + input.content + "</body></html>";
  return result(input.name, "html", "text/html;charset=utf-8", "html", input.content, previewHtml);
}

function validateSvg(input, errors) {
  if (typeof input.content !== "string" || input.content.trim().length === 0) return invalid(["content must be SVG markup."]);
  if (byteLength(input.content) > MAX_ARTIFACT_BYTES) errors.push("SVG artifact exceeds the 64 KiB limit.");
  if (!/^\s*<svg\b/i.test(input.content) || !/<\/svg\s*>\s*$/i.test(input.content)) errors.push("Provide one complete SVG root element.");
  if (/<script\b|\bon[a-z]+\s*=|javascript:|<foreignObject\b|(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|\/\/|data:text\/html)/i.test(input.content)) errors.push("SVG scripts, event handlers, foreignObject, and remote or executable links are prohibited.");
  if (/url\s*\(|@import/i.test(input.content)) errors.push("SVG CSS imports and URL references are prohibited.");
  if (errors.length) return invalid(errors);
  const previewHtml = "<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="" + CSP + ""></head><body style="margin:0">" + input.content + "</body></html>";
  return result(input.name, "svg", "image/svg+xml;charset=utf-8", "svg", input.content, previewHtml);
}

function parseDescriptor(input, errors) {
  if (typeof input.content !== "string" || byteLength(input.content) > MAX_MEDIA_DESCRIPTOR_BYTES) {
    errors.push("Media descriptor must be JSON text no larger than 16 KiB.");
    return null;
  }
  try { return JSON.parse(input.content); } catch { errors.push("Media descriptor must be valid JSON."); return null; }
}
function validateMusic(input, errors) {
  const score = parseDescriptor(input, errors);
  if (!score) return invalid(errors);
  if (typeof score.title !== "string" || score.title.length > 100) errors.push("Music title is required and must be at most 100 characters.");
  if (!Number.isInteger(score.bpm) || score.bpm < 40 || score.bpm > 200) errors.push("bpm must be an integer from 40 to 200.");
  if (!Number.isInteger(score.bars) || score.bars < 1 || score.bars > 16) errors.push("bars must be an integer from 1 to 16.");
  if (!Array.isArray(score.notes) || score.notes.length < 1 || score.notes.length > 128) errors.push("notes must contain 1–128 notes.");
  if (Array.isArray(score.notes)) for (const [i, note] of score.notes.entries()) {
    if (!note || !Number.isInteger(note.pitch) || note.pitch < 36 || note.pitch > 96) errors.push(`notes[${i}].pitch must be MIDI 36–96.`);
    if (!Number.isFinite(note.startBeat) || note.startBeat < 0 || note.startBeat > 64) errors.push(`notes[${i}].startBeat is out of range.`);
    if (!Number.isFinite(note.durationBeats) || note.durationBeats <= 0 || note.durationBeats > 8) errors.push(`notes[${i}].durationBeats is out of range.`);
    if (note.velocity !== undefined && (!Number.isFinite(note.velocity) || note.velocity < 0 || note.velocity > 1)) errors.push(`notes[${i}].velocity must be 0–1.`);
    if (note.waveform !== undefined && !["sine", "triangle", "square", "sawtooth"].includes(note.waveform)) errors.push(`notes[${i}].waveform is unsupported.`);
  }
  if (errors.length) return invalid(errors);
  return { valid: true, status: "media_recipe_validated", artifact: { name: input.name.trim(), filename: safeFilename(input.name, "wav"), format: "music", mediaType: "audio/wav", composition: score }, limits: { generation: "browser-local-synthesis", network: false, serverPersistence: false, externalCredits: false } };
}
function validateVideo(input, errors) {
  const storyboard = parseDescriptor(input, errors);
  if (!storyboard) return invalid(errors);
  if (!Number.isInteger(storyboard.width) || ![640, 1280].includes(storyboard.width)) errors.push("width must be 640 or 1280.");
  if (!Number.isInteger(storyboard.height) || ![360, 720].includes(storyboard.height)) errors.push("height must be 360 or 720.");
  if (!Number.isInteger(storyboard.fps) || ![24, 30].includes(storyboard.fps)) errors.push("fps must be 24 or 30.");
  if (!Array.isArray(storyboard.scenes) || storyboard.scenes.length < 1 || storyboard.scenes.length > 6) errors.push("scenes must contain 1–6 scenes.");
  if (Array.isArray(storyboard.scenes)) for (const [i, scene] of storyboard.scenes.entries()) {
    if (!Number.isFinite(scene.durationSeconds) || scene.durationSeconds < 1 || scene.durationSeconds > 5) errors.push(`scenes[${i}].durationSeconds must be 1–5.`);
    if (typeof scene.background !== "string" || !/^#[0-9a-f]{6}$/i.test(scene.background)) errors.push(`scenes[${i}].background must be a six-digit hex color.`);
    if (typeof scene.title !== "string" || scene.title.length > 80) errors.push(`scenes[${i}].title must be at most 80 characters.`);
    if (scene.subtitle !== undefined && (typeof scene.subtitle !== "string" || scene.subtitle.length > 120)) errors.push(`scenes[${i}].subtitle must be at most 120 characters.`);
    if (scene.motion !== undefined && !["rise", "drift", "pulse", "orbit"].includes(scene.motion)) errors.push(`scenes[${i}].motion is unsupported.`);
  }
  if (errors.length) return invalid(errors);
  return { valid: true, status: "media_recipe_validated", artifact: { name: input.name.trim(), filename: safeFilename(input.name, "webm"), format: "video", mediaType: "video/webm", storyboard }, limits: { generation: "browser-local-canvas-recording", network: false, serverPersistence: false, externalCredits: false } };
}
function result(name, format, mediaType, extension, content, previewHtml) {
  return { valid: true, status: "artifact_validated_not_executed", artifact: { name: name.trim(), filename: safeFilename(name, extension), format, mediaType, bytes: byteLength(content), content, previewHtml }, limits: { maxBytes: MAX_ARTIFACT_BYTES, filesPerCall: 1, externalNetwork: false, serverFilesystem: false, codeExecutionByAgent: false, browserPreviewSandboxed: true, persistence: false } };
}
export function validateHtmlArtifact(input) {
  if (!input || typeof input !== "object") return invalid(["An artifact object is required."]);
  return validateArtifact({ ...input, format: "html" });
}
