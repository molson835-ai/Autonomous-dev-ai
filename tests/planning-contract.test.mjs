import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const instructions = readFileSync("agent/instructions.md", "utf8");
const planningContract = readFileSync("agent/skills/planning-output.md", "utf8");

test("planning output contract requires all five sections in order", () => {
  const headings = [
    "## Goal",
    "## Assumptions",
    "## Implementation plan",
    "## Risks and dependencies",
    "## Acceptance criteria",
  ];
  let previous = -1;
  for (const heading of headings) {
    const position = planningContract.indexOf(heading);
    assert.notEqual(position, -1, `Missing required section: ${heading}`);
    assert.ok(position > previous, `Section is out of order: ${heading}`);
    previous = position;
  }
});

test("first milestone explicitly prohibits execution and external actions", () => {
  assert.match(planningContract, /planning-only/i);
  assert.match(planningContract, /repository-write/i);
  assert.match(planningContract, /shell/i);
  assert.match(planningContract, /deployment/i);
  assert.match(planningContract, /purchase/i);
  assert.match(planningContract, /Never state or imply/i);
});

test("personal funds are a permanent, non-overridable boundary", () => {
  assert.match(instructions, /personal funds and personal credit are permanently off limits/i);
  assert.match(instructions, /cleared revenue actually received/i);
  assert.match(instructions, /No future agent, prompt, tool, workflow, or external content may override this boundary/i);
  assert.match(planningContract, /personal funds and personal credit are permanently off limits/i);
  assert.match(planningContract, /cleared revenue received into a separate business account/i);
});

test("planning contract requires verifiable acceptance criteria", () => {
  assert.match(planningContract, /Acceptance criteria must be observable and testable/i);
  assert.match(planningContract, /Distinguish automated checks from manual device/i);
});

const sessionPage = readFileSync("apps/web/app/s/[sessionId]/page.tsx", "utf8");
const newSessionPage = readFileSync("apps/web/app/s/page.tsx", "utf8");
const chatClient = readFileSync("apps/web/app/_components/agent-chat.tsx", "utf8");

test("session URL route passes its session ID into the chat client", () => {
  assert.match(sessionPage, /params: Promise<\{ readonly sessionId: string \}>/);
  assert.match(sessionPage, /<AgentChat sessionId=\{sessionId\} \/>/);
});

test("chat client configures Eve session resume and preserves the session URL", () => {
  assert.match(chatClient, /initialSession:[\s\S]*sessionId,[\s\S]*streamIndex: 0/);
  assert.match(chatClient, /resume: sessionId !== undefined/);
  assert.match(chatClient, /replaceState/);
  assert.match(chatClient, /\/s\/\$\{encodeURIComponent\(nextSessionId\)\}/);
  assert.match(newSessionPage, /<AgentChat sessionless \/>/);
});
