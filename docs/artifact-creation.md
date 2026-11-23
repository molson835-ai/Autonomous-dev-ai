# Eve Creative Artifact Creation and Delivery

## Architecture

Eve creates files through a bounded `create_artifact` tool. The tool validates a declarative request, starts a fresh isolated Vercel Sandbox from the prebuilt creative-worker image, writes only the validated input descriptor, and invokes one fixed Python renderer. The sandbox has a deny-all network policy and is non-persistent. It does not run model-written shell commands or scripts.

The renderer uses open-source software:

| Format | Renderer | Stored output |
|---|---|---|
| HTML | Self-contained document source; sandboxed browser preview | HTML |
| SVG | Inkscape | SVG plus PNG preview |
| Music | FluidSynth with a General MIDI SoundFont; a bounded score is converted to MIDI | WAV |
| Video | Pillow scene artwork and FFmpeg motion/encoding | MP4 |

Blender is installed in the worker image for a later declarative 3D-scene adapter. The current public tool schema does not yet expose arbitrary Blender scripts or a 3D scene language.

## Delivery lifecycle

1. Eve calls `create_artifact` with a complete HTML/SVG source or a bounded music/video JSON descriptor.
2. Server-side validation rejects unsupported fields, unsafe SVG constructs, malformed descriptors, and out-of-range parameters.
3. A fresh, network-isolated Vercel Sandbox runs the fixed renderer. The renderer receives a JSON input file, never a user-provided shell command.
4. The server reads the expected output file and verifies it is non-empty and within the 100 MiB limit.
5. The finished file is uploaded to private Vercel Blob storage. SVG previews are uploaded separately.
6. Eve returns a signed download link served by `/api/artifacts/download`. Links and stored files expire after 30 days. The private Blob object is not made public.
7. The web chat renders the preview and provides the actual Download link. Eve may only claim completion when the tool returns `status: artifact_created_and_stored` with a download URL.

## Current bounds

- HTML/SVG source: 64 KiB maximum.
- Music/video descriptors: 16 KiB maximum.
- Music: 40–200 BPM, 1–16 bars, 1–128 notes, MIDI pitches 36–96, optional General MIDI instrument program 0–127.
- Video: 640×360 or 1280×720, 24 or 30 fps, 1–6 scenes, 1–5 seconds per scene, 30 seconds maximum.
- Rendered output: 100 MiB maximum; SVG preview: 12 MiB maximum.
- Per-render sandbox: 2 vCPU, 4 GiB memory, five-minute timeout, deny-all network, non-persistent workspace.
- Private download links expire after 30 days. Private Blob objects use a 30-day TTL and are automatically deleted after that retention period.

## Required one-time project setup

The production integration is intentionally fail-closed until its resources are connected.

1. Create a **private** Vercel Blob store in the Vercel team and connect it to project `autonomous-dev-ai`. This provides the project-scoped Blob environment configuration.
2. Enable Vercel OIDC for the project so `@vercel/sandbox` can authenticate from the deployed Eve runtime.
3. Build and push the worker image from the repository root after linking the Vercel project:
   `npm run build:creative-worker-image`
4. Set these Vercel Production environment variables:
   - `EVE_CREATIVE_WORKER_IMAGE=eve-creative-worker:latest`
   - `EVE_PUBLIC_BASE_URL=https://autonomous-dev-ai.vercel.app`
   - `ARTIFACT_LINK_SECRET` to a randomly generated secret (for example, `openssl rand -base64 32`).
5. Redeploy Production after the environment variables and worker image are ready.

The tool reports a clear configuration error rather than pretending to create a file when Blob, Sandbox authentication, or the signed-link secret is missing. Do not put credentials in Git, prompts, task descriptions, or chat messages.

## Security and spending boundaries

- No public Blob objects; downloads use signed, expiring URLs backed by private Blob storage.
- No arbitrary shell tool is exposed to Eve. The renderer executes only fixed commands with argument arrays.
- The render sandbox cannot reach the network. It cannot contact customers, publish files, or call third-party generative services.
- No paid image/video/music model is invoked. The current outputs are procedural vector art, synthesized music, and generated motion graphics—not photorealistic generative media.
- Sandbox and Blob usage may incur Vercel usage charges. Resource creation, image publishing, and Production deployment require owner approval; this PR does not provision or deploy them.
- The download route accepts only signed tokens for the `eve-artifacts/` namespace and a fixed content-type allowlist.

## Acceptance tests

- Unit tests cover descriptor validation, unsafe SVG rejection, malformed recipes, output bounds, signed-token tampering/expiry, and the storage/renderer contracts.
- End-to-end acceptance after one-time setup: ask Eve for one SVG artwork, one short original music composition, and one short video. Each must produce a stored private object, a verified signed link, a working download, and a preview where supported.
- A successful tool call is not an end-to-end pass until a real file has been downloaded and opened from the chat link.
