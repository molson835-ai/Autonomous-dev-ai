import { defineTool } from "eve/tools";
import { z } from "zod";
import { validateHtmlArtifact } from "../lib/artifact-policy.mjs";

export default defineTool({
  description: "Create one bounded standalone HTML artwork or document artifact. Supply a complete responsive HTML5 document (including viewport meta tag). The tool validates and returns the file contents for a sandboxed browser preview and owner download. It does not write to a server filesystem, execute code, access the network, install packages, persist files, commit, or deploy. Only one HTML file up to 64 KiB is accepted per call; external assets and scripts are prohibited.",
  inputSchema: z.object({ name: z.string().trim().min(1).max(80), content: z.string().min(1).max(65536) }).strict(),
  async execute(input) { return validateHtmlArtifact(input); },
});
