"use client";

import { useEffect, useRef, useState } from "react";
import { FileIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type Artifact = {
  name?: string; filename?: string; bytes?: number; content?: string; previewHtml?: string;
  format?: "html" | "svg" | "music" | "video"; mediaType?: string;
  composition?: { title: string; bpm: number; bars: number; notes: Array<{ pitch: number; startBeat: number; durationBeats: number; velocity?: number; waveform?: OscillatorType }> };
  storyboard?: { width: number; height: number; fps: number; scenes: Array<{ durationSeconds: number; background: string; title: string; subtitle?: string; motion?: "rise" | "drift" | "pulse" | "orbit" }> };
};
type Result = { valid?: boolean; artifact?: Artifact };

export function ArtifactToolContent({ output }: { readonly output: unknown }) {
  const result = (typeof output === "string" ? safeJson(output) : output) as Result | undefined;
  const artifact = result?.artifact;
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [downloadUrl, setDownloadUrl] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!artifact?.content || !["html", "svg"].includes(artifact.format ?? "")) return;
    const blob = new Blob([artifact.content], { type: artifact.mediaType ?? "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    setDownloadUrl(url);
    return () => { URL.revokeObjectURL(url); setDownloadUrl(undefined); };
  }, [artifact?.content, artifact?.mediaType, artifact?.format]);

  if (result?.valid !== true || !artifact?.filename) return <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(output, null, 2)}</pre>;
  const label = artifact.format === "music" ? "Render WAV" : artifact.format === "video" ? "Render WebM" : `Download ${artifact.format?.toUpperCase() ?? "FILE"}`;

  async function renderMedia() {
    setBusy(true); setError(undefined);
    try {
      const blob = artifact?.format === "music" && artifact.composition
        ? await renderWav(artifact.composition)
        : artifact?.format === "video" && artifact.storyboard && canvasRef.current
          ? await renderWebm(canvasRef.current, artifact.storyboard)
          : null;
      if (!blob) throw new Error("This artifact recipe is incomplete.");
      const url = URL.createObjectURL(blob);
      setDownloadUrl((old) => { if (old) URL.revokeObjectURL(old); return url; });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The browser could not render this media.");
    } finally { setBusy(false); }
  }

  const isPreviewable = artifact.format === "html" || artifact.format === "svg";
  return (
    <section className="w-full space-y-3 rounded-lg border bg-card p-3" aria-label="Created artifact">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0"><p className="truncate font-medium text-sm">{artifact.name ?? "Eve artifact"}</p><p className="text-xs text-muted-foreground">{artifact.filename}{artifact.bytes ? ` · ${formatBytes(artifact.bytes)}` : ""}</p></div>
        {isPreviewable ? (
          downloadUrl ? <a className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground" href={downloadUrl} download={artifact.filename}><FileIcon className="size-4" /> Download {artifact.format?.toUpperCase()}</a> : <span className="text-xs text-muted-foreground">Preparing download…</span>
        ) : (
          downloadUrl ? <a className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground" href={downloadUrl} download={artifact.filename}><FileIcon className="size-4" /> Download {artifact.format === "music" ? "WAV" : "WebM"}</a> : <Button onClick={renderMedia} disabled={busy} size="sm" type="button">{busy ? "Rendering…" : label}</Button>
        )}
      </div>
      {isPreviewable ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">Preview · isolated</p>
            <div className="flex gap-1">
              <Button onClick={() => setDevice("mobile")} size="xs" type="button" variant={device === "mobile" ? "secondary" : "ghost"}>Mobile</Button>
              <Button onClick={() => setDevice("desktop")} size="xs" type="button" variant={device === "desktop" ? "secondary" : "ghost"}>Desktop</Button>
            </div>
          </div>
          <div className="flex justify-center overflow-hidden rounded-md bg-muted p-2">
            <iframe title={artifact.name ?? "Eve artifact preview"} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={artifact.previewHtml ?? ""} className="h-[min(65vh,620px)] w-full rounded border bg-white" style={{ maxWidth: device === "mobile" ? 390 : 960 }} />
          </div>
        </>
      ) : (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>{artifact.format === "music" ? "Original note sequence. Rendered locally in your browser as a WAV audio file." : "Original motion-graphics storyboard. Rendered locally in your browser as a WebM video file."}</p>
          {artifact.format === "video" ? <canvas ref={canvasRef} width={artifact.storyboard?.width ?? 640} height={artifact.storyboard?.height ?? 360} className="hidden" /> : null}
        </div>
      )}
      {downloadUrl && !isPreviewable && artifact.format === "music" ? <audio controls src={downloadUrl} className="w-full" /> : null}
      {downloadUrl && !isPreviewable && artifact.format === "video" ? <video controls src={downloadUrl} className="w-full rounded-md" /> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <p className="text-xs text-muted-foreground">Files are rendered and downloaded in this browser session; they are not uploaded to server storage or published to a public URL.</p>
    </section>
  );
}

function safeJson(value: string): unknown { try { return JSON.parse(value) as unknown; } catch { return undefined; } }
function formatBytes(size: number): string { return size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`; }

async function renderWav(score: NonNullable<Artifact["composition"]>): Promise<Blob> {
  const secondsPerBeat = 60 / score.bpm;
  const duration = score.bars * 4 * secondsPerBeat + 0.5;
  const sampleRate = 44100;
  const context = new OfflineAudioContext(1, Math.ceil(duration * sampleRate), sampleRate);
  for (const note of score.notes) {
    const start = note.startBeat * secondsPerBeat;
    const end = start + note.durationBeats * secondsPerBeat;
    if (start >= duration) continue;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = note.waveform ?? "triangle";
    osc.frequency.value = 440 * Math.pow(2, (note.pitch - 69) / 12);
    const level = Math.max(0.001, Math.min(1, note.velocity ?? 0.35)) * 0.18;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(level, start + 0.015);
    gain.gain.setValueAtTime(level, Math.max(start + 0.016, end - 0.04));
    gain.gain.exponentialRampToValueAtTime(0.0001, Math.max(start + 0.02, end));
    osc.connect(gain); gain.connect(context.destination);
    osc.start(start); osc.stop(Math.min(duration, end + 0.03));
  }
  const rendered = await context.startRendering();
  return new Blob([audioBufferToWav(rendered)], { type: "audio/wav" });
}
function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const samples = buffer.getChannelData(0);
  const out = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(out);
  const write = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  write(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); write(8, "WAVE");
  write(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, "data"); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) { const s = Math.max(-1, Math.min(1, samples[i]!)); view.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true); }
  return out;
}
async function renderWebm(canvas: HTMLCanvasElement, board: NonNullable<Artifact["storyboard"]>): Promise<Blob> {
  if (typeof MediaRecorder === "undefined" || !canvas.captureStream) throw new Error("Video rendering is not supported by this browser. Try the latest Chrome.");
  const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((x) => MediaRecorder.isTypeSupported(x));
  if (!mime) throw new Error("This browser does not offer a supported WebM encoder.");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas rendering is unavailable.");
  const stream = canvas.captureStream(board.fps);
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, { mimeType: mime });
  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => reject(new Error("The browser video encoder failed."));
    recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
  });
  recorder.start(250);
  const total = board.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
  const started = performance.now();
  await new Promise<void>((resolve) => {
    const frame = (now: number) => {
      const elapsed = (now - started) / 1000;
      let offset = 0;
      let scene = board.scenes[board.scenes.length - 1]!;
      let local = scene.durationSeconds;
      for (const candidate of board.scenes) {
        if (elapsed < offset + candidate.durationSeconds) { scene = candidate; local = elapsed - offset; break; }
        offset += candidate.durationSeconds;
      }
      drawScene(ctx, board.width, board.height, scene, local);
      if (elapsed >= total) { recorder.stop(); stream.getTracks().forEach((track) => track.stop()); resolve(); }
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  return finished;
}
function drawScene(ctx: CanvasRenderingContext2D, width: number, height: number, scene: NonNullable<Artifact["storyboard"]>["scenes"][number], t: number) {
  ctx.fillStyle = scene.background; ctx.fillRect(0, 0, width, height);
  const wave = Math.sin(t * 2.2);
  const x = width / 2 + (scene.motion === "drift" ? wave * width * 0.16 : scene.motion === "orbit" ? Math.cos(t * 1.7) * width * 0.16 : 0);
  const y = height * 0.38 + (scene.motion === "rise" ? (1 - Math.min(1, t / scene.durationSeconds)) * height * 0.22 : scene.motion === "orbit" ? Math.sin(t * 1.7) * height * 0.12 : 0);
  const radius = Math.min(width, height) * (scene.motion === "pulse" ? 0.16 + 0.025 * wave : 0.14);
  const gradient = ctx.createRadialGradient(x, y, 1, x, y, radius * 2.3);
  gradient.addColorStop(0, "#ffffff"); gradient.addColorStop(1, scene.background);
  ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(x, y, radius * 2.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(height * 0.075)}px system-ui, sans-serif`; ctx.fillText(scene.title, width / 2, height * 0.72, width * 0.86);
  if (scene.subtitle) { ctx.font = `${Math.round(height * 0.032)}px system-ui, sans-serif`; ctx.fillText(scene.subtitle, width / 2, height * 0.81, width * 0.86); }
}
