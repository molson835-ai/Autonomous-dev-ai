import test from "node:test";
import assert from "node:assert/strict";
import { validateArtifact, validateHtmlArtifact } from "../agent/lib/artifact-policy.mjs";

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test</title></head><body><main>Hello</main></body></html>`;

test("accepts complete responsive HTML and retains the sandbox policy", () => {
  const result = validateHtmlArtifact({ name: "My Artwork!", content: html });
  assert.equal(result.valid, true);
  assert.equal(result.artifact.filename, "My-Artwork.html");
  assert.equal(result.artifact.mediaType, "text/html;charset=utf-8");
  assert.match(result.artifact.previewHtml, /Content-Security-Policy/);
  assert.equal(result.limits.serverFilesystem, false);
});
test("rejects incomplete HTML, remote assets, and oversized content", () => {
  assert.equal(validateHtmlArtifact({ name: "x", content: "<html>" }).valid, false);
  assert.equal(validateHtmlArtifact({ name: "x", content: html.replace("</body>", '<img src="https://example.com/a.png"></body>') }).valid, false);
  assert.equal(validateHtmlArtifact({ name: "x", content: html + "x".repeat(65536) }).valid, false);
});
test("accepts self-contained SVG and rejects script and event-handler injection", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#f00"/></svg>';
  const result = validateArtifact({ format: "svg", name: "Original art", content: svg });
  assert.equal(result.valid, true);
  assert.equal(result.artifact.filename, "Original-art.svg");
  assert.equal(result.artifact.mediaType, "image/svg+xml;charset=utf-8");
  assert.equal(validateArtifact({ format: "svg", name: "bad", content: svg.replace("<circle", '<circle onload="alert(1)"') }).valid, false);
  assert.equal(validateArtifact({ format: "svg", name: "bad", content: svg.replace("<circle", '<script>alert(1)</script><circle') }).valid, false);
});
test("validates bounded original music score recipes", () => {
  const content = JSON.stringify({ title: "Sunrise", bpm: 110, bars: 4, notes: [{ pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.4, waveform: "triangle" }] });
  const result = validateArtifact({ format: "music", name: "Sunrise theme", content });
  assert.equal(result.valid, true);
  assert.equal(result.artifact.filename, "Sunrise-theme.wav");
  assert.equal(result.artifact.mediaType, "audio/wav");
  assert.equal(result.limits.externalCredits, false);
  assert.equal(validateArtifact({ format: "music", name: "bad", content: JSON.stringify({ title: "x", bpm: 500, bars: 4, notes: [] }) }).valid, false);
});
test("validates bounded motion-graphics storyboards", () => {
  const content = JSON.stringify({ width: 640, height: 360, fps: 24, scenes: [{ durationSeconds: 2, background: "#112233", title: "Coastline", subtitle: "A new horizon", motion: "drift" }] });
  const result = validateArtifact({ format: "video", name: "Coastline intro", content });
  assert.equal(result.valid, true);
  assert.equal(result.artifact.filename, "Coastline-intro.webm");
  assert.equal(result.artifact.mediaType, "video/webm");
  assert.equal(result.limits.externalCredits, false);
  assert.equal(validateArtifact({ format: "video", name: "bad", content: JSON.stringify({ width: 1920, height: 1080, fps: 60, scenes: [] }) }).valid, false);
});
test("rejects unknown formats, extra keys, and malformed descriptors", () => {
  assert.equal(validateArtifact({ format: "mp4", name: "x", content: "{}" }).valid, false);
  assert.equal(validateArtifact({ format: "music", name: "x", content: "not json" }).valid, false);
  assert.equal(validateArtifact({ format: "html", name: "x", content: html, path: "/tmp/x" }).valid, false);
});
