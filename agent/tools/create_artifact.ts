import { defineTool } from "eve/tools";
import { z } from "zod";
import { renderCreativeArtifact } from "../lib/creative-renderer";

const base = { name: z.string().trim().min(1).max(80) };
export default defineTool({
  description: "Create a real downloadable creative file using open-source software in an isolated Linux rendering worker. Supports: html (complete self-contained HTML document), svg (vector artwork rendered to SVG with a PNG preview), music (JSON score with title, bpm 40–200, bars 1–16, notes [{pitch: MIDI 36–96, startBeat, durationBeats, velocity?, waveform?}] rendered to WAV with FluidSynth), and video (JSON storyboard with width 640|1280, height 360|720, fps 24|30, and scenes [{durationSeconds: 1–5, background: #RRGGBB, title, subtitle?, motion?: rise|drift|pulse|orbit}] rendered to MP4 with FFmpeg). The worker has no network access and does not execute user-supplied code. Finished files are uploaded to private Vercel Blob storage and returned with expiring signed download links. Do not claim success unless the tool returns status artifact_created_and_stored and a downloadUrl.",
  inputSchema: z.discriminatedUnion("format", [
    z.object({ ...base, format: z.literal("html"), content: z.string().min(1).max(65536) }).strict(),
    z.object({ ...base, format: z.literal("svg"), content: z.string().min(1).max(65536) }).strict(),
    z.object({ ...base, format: z.literal("music"), content: z.string().min(1).max(16384) }).strict(),
    z.object({ ...base, format: z.literal("video"), content: z.string().min(1).max(16384) }).strict(),
  ]),
  async execute(input) {
    return renderCreativeArtifact(input);
  },
});
