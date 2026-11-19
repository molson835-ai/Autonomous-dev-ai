import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const creative = readFileSync(new URL("../agent/skills/creative-development.md", import.meta.url), "utf8");
const plan = readFileSync(new URL("../docs/superpowers/plans/2026-11-19-eve-art-research-and-toolsmith.md", import.meta.url), "utf8");

test("Phase 2 defines all eight creative skills", () => {
  for (const phrase of [
    "Skill 4 — Reference gathering",
    "Skill 5 — Concept expansion",
    "Skill 6 — Constraint play",
    "Skill 7 — Critique loop",
    "Skill 8 — Style development",
    "Skill 9 — Cross-domain inspiration",
    "Skill 10 — Trend versus timeless balancing",
    "Skill 11 — Idea journal",
  ]) assert.ok(creative.includes(phrase), `Missing ${phrase}`);
});

test("creative skills preserve originality and owner approval boundaries", () => {
  assert.match(creative, /specific living artists' recognizable styles/);
  assert.match(creative, /recognizable copyrighted characters/);
  assert.match(creative, /All creative outputs remain proposals/);
  assert.match(creative, /Owner feedback is the authoritative preference signal/);
});

test("critique rubric has a capped revision loop and blocks critical issues", () => {
  assert.match(creative, /Initial provisional pass threshold is 80\/100/);
  assert.match(creative, /cap at three revision rounds/);
  assert.match(creative, /critical technical flaws or unresolved rights\/policy issues are automatic holds/);
});

test("memory-dependent creative work requires verified persistence", () => {
  assert.match(creative, /Verify memory write\/read-back/);
  assert.match(creative, /do not claim persistence or historical retrieval when memory is unavailable/);
  assert.match(plan, /Memory-dependent scheduled skills remain disabled until persistent write\/read-back is repeatedly verified/);
});

test("phase 2 uses shared specialist skills and the dependency-aware build order", () => {
  assert.match(plan, /not eight independent agents/);
  assert.match(plan, /Skills 4–11/);
  assert.match(plan, /Skills 8 and 11/);
});
