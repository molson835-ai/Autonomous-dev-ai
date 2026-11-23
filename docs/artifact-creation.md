# Eve Creative Artifact Creation and Delivery

## Supported outputs

| Format | Output | How it is produced | Delivery |
|---|---|---|---|
| HTML | Interactive or animated self-contained artwork/document | Eve-authored HTML/CSS/inline JS; strict validator and sandboxed preview | Browser download link |
| SVG | Vector artwork, icons, posters, diagrams | Eve-authored self-contained SVG; script/event/remote-link rejection | Browser download link and preview |
| Music | Short original synthesized composition | Eve-authored bounded note score; Web Audio OfflineAudioContext renders PCM WAV in the browser | Audio preview and browser download link |
| Video | Short original motion-graphics sequence | Eve-authored storyboard; Canvas + MediaRecorder renders WebM in the browser | Video preview and browser download link |

## Lifecycle

1. Eve calls `create_artifact` with the selected format and a complete source or structured recipe.
2. The server validates file structure or media recipe bounds. It does not execute source code or generate binary media.
3. For HTML/SVG, the client renders an isolated preview and creates a browser download link.
4. For music/video, the client renders a WAV/WebM locally after the user-visible media action; it then exposes playback and a download link.
5. Eve must wait for the actual rendered media card before claiming a WAV/WebM file is ready.

## Bounds and security

- HTML/SVG source: 64 KiB maximum per artifact.
- Media recipe: 16 KiB maximum.
- Music: 40–200 BPM, 1–16 bars, 1–128 notes, MIDI pitches 36–96.
- Video: 640×360 or 1280×720, 24 or 30 fps, 1–6 scenes, 1–5 seconds per scene (maximum 30 seconds).
- No external network calls, third-party provider credits, server filesystem writes, public publishing, or server-side persistence.
- HTML preview is sandboxed in an iframe with restrictive Content Security Policy.
- SVG rejects scripts, event handlers, foreignObject, and remote/executable links.
- Music/video synthesis occurs on the user's device using browser APIs. Unsupported browsers must report a render failure rather than claim a file exists.

## Delivery limitations

The download link is a browser-session blob URL. It works in the current chat/browser session and is not a durable public URL, cloud-storage object, or cross-device share link. No asset is uploaded to server storage. Eve must not claim that the artifact was stored or publicly hosted.

This milestone creates procedural vector artwork, synthesized music, and motion graphics. It is not an integration with a generative image/video/music model and does not create photorealistic AI imagery or cinematic generative video. Third-party providers such as Invideo are not automatically callable by Eve merely because they are connected to ChatGPT. A provider API integration and separately configured authorization/credit policy are required for those capabilities.

## Acceptance tests

- HTML: validated artifact card, isolated preview, Download HTML link.
- SVG: validated vector preview, Download SVG link.
- Music: validated score, successful browser WAV render, playback control, Download WAV link.
- Video: validated storyboard, successful browser WebM render, playback control, Download WebM link.
- If the renderer/browser cannot complete, the UI must show an error and must not display a download link.
