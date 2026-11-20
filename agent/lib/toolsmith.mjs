const SLUG = /^[a-z][a-z0-9-]{1,47}$/;
const FIELD = /^[a-z][A-Za-z0-9]{0,39}$/;
const RESERVED = new Set(["constructor", "prototype", "__proto__"]);
const TYPES = new Set(["string", "number", "boolean"]);

function isText(value, max) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function literal(value) {
  return JSON.stringify(value);
}

/**
 * Validate a declarative proposal. Arbitrary source code, network access,
 * filesystem access, shell execution, secrets, and persistence are not inputs.
 */
export function validateToolProposal(proposal) {
  const errors = [];
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) {
    return { valid: false, errors: ["A tool proposal object is required."] };
  }
  if (!isText(proposal.name, 48) || !SLUG.test(proposal.name)) {
    errors.push("name must be a 2–48 character lowercase slug beginning with a letter.");
  }
  if (!isText(proposal.description, 300)) errors.push("description must be 1–300 characters.");
  if (!isText(proposal.purpose, 500)) errors.push("purpose must be 1–500 characters.");
  if (proposal.capability !== "pure") errors.push("Only pure, deterministic tools are supported.");
  if (proposal.fields !== undefined && !Array.isArray(proposal.fields)) {
    errors.push("fields must be an array.");
  }
  const fields = Array.isArray(proposal.fields) ? proposal.fields : [];
  if (fields.length < 1 || fields.length > 8) errors.push("Provide between 1 and 8 input fields.");
  const seen = new Set();
  for (const [index, field] of fields.entries()) {
    if (!field || typeof field !== "object" || Array.isArray(field)) {
      errors.push(`fields[${index}] must be an object.`);
      continue;
    }
    if (!isText(field.name, 40) || !FIELD.test(field.name) || RESERVED.has(field.name)) {
      errors.push(`fields[${index}].name must be a safe camelCase identifier.`);
    } else if (seen.has(field.name)) {
      errors.push(`Duplicate field name: ${field.name}.`);
    } else {
      seen.add(field.name);
    }
    if (!TYPES.has(field.type)) errors.push(`fields[${index}].type must be string, number, or boolean.`);
    if (field.required !== undefined && typeof field.required !== "boolean") {
      errors.push(`fields[${index}].required must be boolean.`);
    }
    if (field.type === "string") {
      if (!Number.isInteger(field.maxLength) || field.maxLength < 1 || field.maxLength > 2000) {
        errors.push(`fields[${index}].maxLength must be an integer from 1 to 2000.`);
      }
    }
    if (field.type === "number") {
      if (!Number.isFinite(field.min) || !Number.isFinite(field.max) || field.min >= field.max ||
          Math.abs(field.min) > 1_000_000_000 || Math.abs(field.max) > 1_000_000_000) {
        errors.push(`fields[${index}] requires finite min/max bounds with min < max and absolute values ≤ 1 billion.`);
      }
    }
    for (const key of Object.keys(field)) {
      if (!["name", "type", "required", "maxLength", "min", "max"].includes(key)) {
        errors.push(`fields[${index}] contains unsupported property: ${key}.`);
      }
    }
  }
  for (const key of Object.keys(proposal)) {
    if (!["name", "description", "purpose", "capability", "fields"].includes(key)) {
      errors.push(`Unsupported proposal property: ${key}.`);
    }
  }
  return { valid: errors.length === 0, errors };
}

function schemaFor(field) {
  let schema = field.type === "string"
    ? `z.string().max(${field.maxLength})`
    : field.type === "number"
      ? `z.number().min(${field.min}).max(${field.max})`
      : "z.boolean()";
  if (field.required === false) schema += ".optional()";
  return schema;
}

/**
 * Generates a fixed TypeScript scaffold from a validated data-only spec.
 * The generated execute body is deliberately inert until a developer
 * implements and tests it. No supplied code is evaluated or interpolated.
 */
export function generateToolScaffold(proposal) {
  const validation = validateToolProposal(proposal);
  if (!validation.valid) {
    return { generated: false, errors: validation.errors };
  }
  const fields = proposal.fields
    .map((field) => `    ${literal(field.name)}: ${schemaFor(field)},`)
    .join("\n");
  const source = [
    'import { defineTool } from "eve/tools";',
    'import { z } from "zod";',
    "",
    "export default defineTool({",
    `  description: ${literal(`PROPOSAL ONLY — ${proposal.description} Implement and review before enabling. ${proposal.purpose}`)},`,
    "  inputSchema: z.object({",
    fields,
    "  }).strict(),",
    "  async execute(input) {",
    "    // TODO: Implement a deterministic, side-effect-free operation.",
    "    // Add focused tests and a security review before this tool is enabled.",
    `    return { status: "not_implemented", tool: ${literal(proposal.name)}, received: input };`,
    "  },",
    "});",
    "",
  ].join("\n");
  return {
    generated: true,
    name: proposal.name,
    source,
    limits: {
      capability: "pure",
      filesystem: false,
      network: false,
      shell: false,
      secrets: false,
      persistence: false,
      automaticRegistration: false,
      automaticExecution: false,
    },
    nextSteps: [
      "Review the generated source; it is untrusted until reviewed.",
      "Implement only the stated pure operation; do not add broader permissions.",
      "Add happy-path, malformed-input, boundary, and adversarial tests.",
      "Run typecheck, focused tests, and CI against the exact commit SHA.",
      "Submit a draft pull request; owner approval is required before merge or deployment.",
    ],
  };
}
