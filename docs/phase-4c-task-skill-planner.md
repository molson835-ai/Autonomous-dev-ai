# Phase 4C — bounded task-to-skill planner

## Purpose

The planner maps a task's explicit skill requirements to supplied skill evidence and resource-catalog metadata. It returns evidence gaps, matching resources, and objective acceptance criteria so Eve can prepare a bounded learning plan before work begins.

## Inputs

- A bounded task description.
- One to 30 unique skill requirements, each with a required evidence status and one to ten objective acceptance criteria.
- Existing skill evidence with evidence references and reviewer type.
- Up to 200 catalog resource summaries, including skill tags, trust state, license, and cost model.

Skill tags are matched by normalized exact equality; the planner does not infer semantic equivalence or invent missing tags.

## Evidence rules

- Only evidence with a non-empty evidence reference and a reviewer type of owner, independent reviewer, or automated test contributes to the reported skill status.
- Agent self-reports never count as practiced or demonstrated.
- The strongest supported status is reported; the planner does not change or promote any skill status.
- A gap exists when the supported status is below the task's required status.

## Resource rules

- Rejected and stale resources are excluded.
- Discovered, quarantined, and reviewed resources may be shown as research leads, but are never execution-ready.
- Unknown license, unknown or paid cost, and limited free-tier resources require further review.
- Even an approved resource is only a recommendation; the planner never installs, executes, or grants permissions.

## Safety and limitations

The planner is deterministic and side-effect free. It does not fetch sources, verify license or pricing claims, run tests, access persistent memory, create tasks, or approve learning. Its input evidence and catalog metadata remain untrusted until independently checked.

The existing owner approval and memory-promotion boundaries remain unchanged. A plan or score cannot establish demonstrated competence by itself.
