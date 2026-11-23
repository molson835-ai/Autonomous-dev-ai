import { head, put } from "@vercel/blob";
import { Sandbox } from "@vercel/sandbox";
import { createHmac, randomUUID } from "node:crypto";
import { env } from "node:process";
import { validateArtifact } from "./artifact-policy.mjs";

const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;
const LINK_TTL_SECONDS = 30 * 24 * 60 * 60;
const WORKER_IMAGE = env.EVE_CREATIVE_WORKER_IMAGE ?? "eve-creative-worker:latest";
const OUTPUTS = {
  html: { filename: "artifact.html", contentType: "text/html; charset=utf-8" },
  svg: { filename: "artifact.svg", contentType: "image/svg+xml" },
  music: { filename: "artifact.wav", contentType: "audio/wav" },
  video: { filename: "artifact.mp4", contentType: "video/mp4" },
} as const;

type CreativeInput = {
  format: "html" | "svg" | "music" | "video";
  name: string;
  content: string;
};
type LinkPayload = { p: string; n: string; t: string; e: number; d: "attachment" | "inline" };

function safeFilename(name: string, extension: string): string {
  const base = name.trim().replace(/[^a-z0-9 _-]/gi, "").replace(/\s+/g, "-").slice(0, 48) || "eve-artifact";
  return `${base}.${extension}`;
}

function publicBaseUrl(): string | undefined {
  const configured = env.EVE_PUBLIC_BASE_URL ?? env.VERCEL_PROJECT_PRODUCTION_URL ?? env.VERCEL_URL;
  if (!configured) return undefined;
  return configured.startsWith("http://") || configured.startsWith("https://") ? configured.replace(/\/$/, "") : `https://${configured.replace(/\/$/, "")}`;
}

function signedDownloadUrl(pathname: string, filename: string, contentType: string, disposition: "attachment" | "inline" = "attachment"): string {
  const secret = env.ARTIFACT_LINK_SECRET;
  const base = publicBaseUrl();
  if (!secret || !base) throw new Error("Artifact delivery is not configured: set ARTIFACT_LINK_SECRET and EVE_PUBLIC_BASE_URL.");
  const payload: LinkPayload = { p: pathname, n: filename, t: contentType, e: Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS, d: disposition };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${base}/api/artifacts/download?token=${encoded}.${signature}`;
}

async function verifyPrivateUpload(pathname: string, expectedBytes: number, expectedContentType: string) {
  // The Blob SDK automatically uses BLOB_READ_WRITE_TOKEN or Vercel OIDC + BLOB_STORE_ID.
  const metadata = await head(pathname);
  if (!metadata || metadata.size !== expectedBytes || metadata.contentType !== expectedContentType) {
    throw new Error("Stored artifact metadata did not match the rendered file.");
  }
  return metadata;
}

async function uploadPrivate(pathname: string, bytes: Buffer, contentType: string) {
  return put(pathname, bytes, {
    access: "private",
    addRandomSuffix: true,
    ttlDays: 30,
    contentType,
  });
}

export async function renderCreativeArtifact(input: CreativeInput) {
  const validation = validateArtifact(input);
  if (!validation.valid) return validation;

  if (!env.BLOB_READ_WRITE_TOKEN && !(env.VERCEL_OIDC_TOKEN && env.BLOB_STORE_ID)) {
    return { valid: false, errors: ["Private artifact storage is not connected. Connect a private Vercel Blob store to the Eve project."] };
  }
  if (!env.ARTIFACT_LINK_SECRET || !publicBaseUrl()) {
    return { valid: false, errors: ["Download-link signing is not configured. Set ARTIFACT_LINK_SECRET and EVE_PUBLIC_BASE_URL in the Eve project environment."] };
  }
  if (!env.VERCEL_OIDC_TOKEN && !env.VERCEL_TOKEN) {
    return { valid: false, errors: ["Vercel Sandbox authentication is unavailable. Enable Vercel OIDC for the production project or configure a scoped VERCEL_TOKEN."] };
  }

  const sandbox = await Sandbox.create({
    name: `eve-creative-${randomUUID().slice(0, 12)}`,
    image: WORKER_IMAGE,
    persistent: false,
    timeout: 5 * 60 * 1000,
    resources: { vcpus: 2 },
    networkPolicy: "deny-all",
  });

  try {
    const inputPath = "/tmp/eve-artifact-input.json";
    const outputDir = "/tmp/eve-artifact-output";
    await sandbox.writeFiles([{
      path: inputPath,
      content: Buffer.from(JSON.stringify({ format: input.format, name: input.name, content: input.content }), "utf8"),
    }]);

    const command = await sandbox.runCommand("python3", ["/opt/eve-creative/render.py", inputPath, outputDir]);
    if (command.exitCode !== 0) {
      const stderr = (await command.stderr()).slice(-2500);
      throw new Error(`Creative renderer failed (exit ${command.exitCode}): ${stderr || "no diagnostic output"}`);
    }

    const primary = OUTPUTS[input.format];
    const outputPath = `${outputDir}/${primary.filename}`;
    const bytes = await sandbox.readFileToBuffer({ path: outputPath });
    if (!bytes || bytes.byteLength === 0) throw new Error("Creative renderer completed without producing the expected output file.");
    if (bytes.byteLength > MAX_OUTPUT_BYTES) throw new Error("Rendered artifact exceeds the 100 MiB delivery limit.");

    const filename = safeFilename(input.name, primary.filename.split(".").pop()!);
    const storagePath = `eve-artifacts/${new Date().toISOString().slice(0, 10)}/${randomUUID()}/${filename}`;
    const stored = await uploadPrivate(storagePath, bytes, primary.contentType);
    await verifyPrivateUpload(stored.pathname, bytes.byteLength, primary.contentType);
    const downloadUrl = signedDownloadUrl(stored.pathname, filename, primary.contentType, "attachment");
    let previewUrl = input.format === "music" || input.format === "video" ? signedDownloadUrl(stored.pathname, filename, primary.contentType, "inline") : undefined;

    let previewBytes: Buffer | null = null;
    if (input.format === "svg") {
      previewBytes = await sandbox.readFileToBuffer({ path: `${outputDir}/preview.png` });
    }
    if (previewBytes?.byteLength) {
      if (previewBytes.byteLength > 12 * 1024 * 1024) throw new Error("SVG preview exceeds the 12 MiB limit.");
      const preview = await uploadPrivate(`eve-artifacts/${new Date().toISOString().slice(0, 10)}/${randomUUID()}/preview.png`, previewBytes, "image/png");
      await verifyPrivateUpload(preview.pathname, previewBytes.byteLength, "image/png");
      previewUrl = signedDownloadUrl(preview.pathname, "preview.png", "image/png", "inline");
    }

    return {
      valid: true,
      status: "artifact_created_and_stored",
      artifact: {
        name: input.name.trim(),
        filename,
        format: input.format,
        mediaType: primary.contentType,
        bytes: bytes.byteLength,
        downloadUrl,
        ...(previewUrl ? { previewUrl } : {}),
        ...(input.format === "html" && validation.artifact?.previewHtml ? { previewHtml: validation.artifact.previewHtml } : {}),
      },
      delivery: { storage: "private-vercel-blob", verified: true, linkExpiresInSeconds: LINK_TTL_SECONDS },
      renderer: { runtime: "isolated-vercel-sandbox", image: WORKER_IMAGE, network: "denied", persistentWorkspace: false },
    };
  } finally {
    await sandbox.stop().catch(() => undefined);
  }
}
