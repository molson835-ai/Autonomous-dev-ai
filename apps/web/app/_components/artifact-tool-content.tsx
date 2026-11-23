"use client";

import { FileIcon } from "lucide-react";

type Artifact = {
  name?: string;
  filename?: string;
  bytes?: number;
  format?: "html" | "svg" | "music" | "video";
  mediaType?: string;
  downloadUrl?: string;
  previewUrl?: string;
  previewHtml?: string;
};
type Result = { valid?: boolean; status?: string; errors?: string[]; artifact?: Artifact };

export function ArtifactToolContent({ output }: { readonly output: unknown }) {
  const result = (typeof output === "string" ? safeJson(output) : output) as Result | undefined;
  const artifact = result?.artifact;
  if (result?.valid !== true || result.status !== "artifact_created_and_stored" || !artifact?.filename || !artifact.downloadUrl) {
    return <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(output, null, 2)}</pre>;
  }

  const isHtml = artifact.format === "html";
  const isSvg = artifact.format === "svg";
  const isMusic = artifact.format === "music";
  const isVideo = artifact.format === "video";
  return (
    <section className="w-full space-y-3 rounded-lg border bg-card p-3" aria-label="Created artifact">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{artifact.name ?? "Eve artifact"}</p>
          <p className="text-xs text-muted-foreground">{artifact.filename}{artifact.bytes ? ` · ${formatBytes(artifact.bytes)}` : ""} · Stored privately</p>
        </div>
        <a className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground" href={artifact.downloadUrl}>
          <FileIcon className="size-4" /> Download
        </a>
      </div>
      {isHtml && artifact.previewHtml ? (
        <div className="overflow-hidden rounded-md border bg-white">
          <iframe title={artifact.name ?? "Eve artwork preview"} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={artifact.previewHtml} className="h-[min(65vh,620px)] w-full" />
        </div>
      ) : null}
      {isSvg && artifact.previewUrl ? (
        <img src={artifact.previewUrl} alt={artifact.name ?? "Eve vector artwork"} className="max-h-[520px] w-full rounded-md border bg-white object-contain" />
      ) : null}
      {isMusic && artifact.previewUrl ? <audio controls preload="metadata" src={artifact.previewUrl} className="w-full" /> : null}
      {isVideo && artifact.previewUrl ? <video controls preload="metadata" src={artifact.previewUrl} className="w-full rounded-md" /> : null}
      <p className="text-xs text-muted-foreground">Saved in private artifact storage. This download link and stored file expire after 30 days.</p>
    </section>
  );
}

function safeJson(value: string): unknown {
  try { return JSON.parse(value) as unknown; } catch { return undefined; }
}
function formatBytes(size: number): string {
  return size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`;
}
