function safeString(value, fallback = "unknown") {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function mapTool(entry) {
  return {
    name: safeString(entry?.name),
    source: safeString(entry?.logicalPath),
    source_kind: safeString(entry?.sourceKind),
    owner: safeString(entry?.owner?.kind),
    has_execute: entry?.hasExecute === true,
    requires_approval: entry?.requiresApproval === true,
    has_auth: entry?.hasAuth === true,
  };
}

function mapResolver(entry) {
  return {
    slug: safeString(entry?.slug),
    source: safeString(entry?.logicalPath),
    source_kind: safeString(entry?.sourceKind),
    owner: safeString(entry?.owner?.kind),
  };
}

/**
 * Project Eve's authenticated agent-info response into a small owner-safe
 * capability report. Never return instructions, schemas, source contents,
 * tokens, or server paths.
 */
export function projectRuntimeCapabilities(info, {
  checkedAt = new Date().toISOString(),
  environment = "unknown",
} = {}) {
  const staticTools = Array.isArray(info?.tools?.static) ? info.tools.static : [];
  const dynamicTools = Array.isArray(info?.tools?.dynamic) ? info.tools.dynamic : [];
  const disabled = Array.isArray(info?.composition?.disabled) ? info.composition.disabled : [];
  const shadowed = Array.isArray(info?.composition?.shadowed) ? info.composition.shadowed : [];

  return {
    checked_at: checkedAt,
    environment,
    agent_name: safeString(info?.agent?.name),
    model_id: safeString(info?.agent?.model?.id, info?.agent?.model?.routing?.kind === "dynamic" ? "dynamic" : "unknown"),
    agent_info_version: Number.isInteger(info?.version) ? info.version : null,
    manifest_scope: "compiled-deployment-definitions",
    static_tools: staticTools.map(mapTool).sort((a, b) => a.name.localeCompare(b.name)),
    dynamic_tool_resolvers: dynamicTools.map(mapResolver).sort((a, b) => a.slug.localeCompare(b.slug)),
    disabled_definitions: disabled.map(item => safeString(item?.logicalPath)).sort(),
    shadowed_definitions: shadowed.map(item => safeString(item?.logicalPath)).sort(),
    discovery_errors: Number.isInteger(info?.diagnostics?.discoveryErrors) ? info.diagnostics.discoveryErrors : null,
    discovery_warnings: Number.isInteger(info?.diagnostics?.discoveryWarnings) ? info.diagnostics.discoveryWarnings : null,
    limitations: [
      "This is Eve's authenticated compiled deployment manifest, not a per-turn effective tool list.",
      "Dynamic resolver outputs and session-specific authorization gates are not resolved by this inspection.",
      "A listed tool is not proof that a particular session can call it; confirm availability with a safe live invocation.",
    ],
  };
}
