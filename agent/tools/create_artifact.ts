import { defineTool } from "eve/tools";
import { z } from "zod";
import { validateArtifact } from "../lib/artifact-policy.mjs";

const base = { name: z.string().trim().min(1).max(80) };
export default defineTool({
  description: "Create a downloadable creative artifact in the chat. Supports self-contained HTML or SVG artwork, original short music compositions rendered locally to WAV, and short motion-graphics videos rendered locally to WebM. For html/svg, content is the complete source. For music, content is JSON with title, bpm (40–200), bars (1–16), and notes [{pitch: MIDI 36–96, startBeat, durationBeats, velocity?, waveform?}]. For video, content is JSON with width 640|1280, height 360|720, fps 24|30, and scenes [{durationSeconds: 1–5, background: #RRGGBB, title, subtitle?, motion?: rise|drift|pulse|orbit}]. The chat client performs audio/video rendering on the owner's device; no external provider, network, paid credits, or server storage is used. A validated recipe is not a rendered file: wait for the client-rendered media card before claiming a WAV/WebM is ready.",
  inputSchema: z.discriminatedUnion("format", [
    z.object({ ...base, format: z.literal("html"), content: z.string().min(1).max(65536) }).strict(),
    z.object({ ...base, format: z.literal("svg"), content: z.string().min(1).max(65536) }).strict(),
    z.object({ ...base, format: z.literal("music"), content: z.string().min(1).max(16384) }).strict(),
    z.object({ ...base, format: z.literal("video"), content: z.string().min(1).max(16384) }).strict(),
  ]),
  async execute(input) { return validateArtifact(input); },
});
