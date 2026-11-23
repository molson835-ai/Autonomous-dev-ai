import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("creative renderer uses a fresh network-denied sandbox and private Blob storage", async () => {
  const source = await read("agent/lib/creative-renderer.ts");
  assert.match(source, /Sandbox\.create/);
  assert.match(source, /if \(!WORKER_IMAGE\)/);
  assert.match(source, /networkPolicy:\s*"deny-all"/);
  assert.match(source, /persistent:\s*false/);
  assert.match(source, /resources:\s*\{\s*vcpus:\s*2\s*\}/);
  assert.match(source, /sandbox\.readFileToBuffer/);
  assert.match(source, /access:\s*"private"/);
  assert.match(source, /head\(pathname\)/);
  assert.match(source, /metadata\.size !== expectedBytes/);
  assert.match(source, /artifact_created_and_stored/);
  assert.match(source, /signedDownloadUrl/);
  assert.match(source, /sandbox\.stop/);
});
test("creative tool delegates to the renderer and does not expose a shell tool", async () => {
  const source = await read("agent/tools/create_artifact.ts");
  assert.match(source, /renderCreativeArtifact\(input\)/);
  assert.match(source, /FluidSynth/);
  assert.match(source, /FFmpeg/);
  assert.doesNotMatch(source, /command:\s*z\.string|shell:\s*z\.string/);
});
test("download route verifies expiring signed tokens and only serves artifact namespace", async () => {
  const source = await read("apps/web/app/api/artifacts/download/route.ts");
  assert.match(source, /createHmac/);
  assert.match(source, /timingSafeEqual/);
  assert.match(source, /payload\.p\.startsWith\("eve-artifacts\/"\)/);
  assert.match(source, /payload\.e <= Math\.floor\(Date\.now\(\) \/ 1000\)/);
  assert.match(source, /get\(payload\.p,\s*\{\s*access:\s*"private"\s*\}\)/);
  assert.match(source, /X-Content-Type-Options/);
});
test("worker uses fixed argv execution and supports open-source renderers", async () => {
  const source = await read("worker/creative/render.py");
  assert.match(source, /subprocess\.run\(args,/);
  assert.match(source, /"inkscape"/);
  assert.match(source, /"fluidsynth"/);
  assert.match(source, /"ffmpeg"/);
  assert.doesNotMatch(source, /shell\s*=\s*True/);
  assert.doesNotMatch(source, /os\.system\s*\(/);
});
test("chat component only shows a download link for stored artifacts", async () => {
  const source = await read("apps/web/app/_components/artifact-tool-content.tsx");
  assert.match(source, /artifact_created_and_stored/);
  assert.match(source, /href=\{artifact\.downloadUrl\}/);
  assert.match(source, /artifact\.previewUrl/);
});
