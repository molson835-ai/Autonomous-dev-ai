#!/usr/bin/env python3
"""Deterministic, allowlisted creative renderer for Eve. Never executes user-supplied code."""
import json
import math
import os
import struct
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def run(args):
    completed = subprocess.run(args, capture_output=True, text=True, timeout=240, check=False)
    if completed.returncode:
        raise RuntimeError((completed.stderr or completed.stdout or "renderer command failed")[-3000:])


def font(size, bold=False):
    path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    return ImageFont.truetype(path, size=size)


def render_html(data, out):
    (out / "artifact.html").write_text(data["content"], encoding="utf-8")


def render_svg(data, out):
    source = out / "artifact.svg"
    source.write_text(data["content"], encoding="utf-8")
    run(["inkscape", str(source), "--export-type=png", "--export-filename=" + str(out / "preview.png"), "--export-width=1600"])


def vlq(value):
    value = max(0, int(value))
    buffer = value & 0x7F
    while True:
        value >>= 7
        if not value:
            break
        buffer <<= 8
        buffer |= ((value & 0x7F) | 0x80)
    result = bytearray()
    while True:
        result.append(buffer & 0xFF)
        if buffer & 0x80:
            buffer >>= 8
        else:
            break
    return bytes(result)


def render_music(data, out):
    score = json.loads(data["content"])
    ppq = 480
    tempo = int(60_000_000 / score["bpm"])
    events = [(0, 0, bytes([0xC0, int(score.get("instrument", 0))])), (0, 1, b"\xFF\x51\x03" + tempo.to_bytes(3, "big"))]
    for note in score["notes"]:
        start = round(note["startBeat"] * ppq)
        end = round((note["startBeat"] + note["durationBeats"]) * ppq)
        pitch = int(note["pitch"])
        velocity = max(1, min(127, round(note.get("velocity", 0.55) * 127)))
        events.append((start, 2, bytes([0x90, pitch, velocity])))
        events.append((end, 1, bytes([0x80, pitch, 0])))
    events.sort(key=lambda item: (item[0], item[1]))
    track = bytearray()
    last_tick = 0
    for tick, _, message in events:
        track.extend(vlq(tick - last_tick))
        track.extend(message)
        last_tick = tick
    track.extend(b"\x00\xFF\x2F\x00")
    midi = b"MThd" + struct.pack(">IHHH", 6, 0, 1, ppq) + b"MTrk" + struct.pack(">I", len(track)) + bytes(track)
    midi_path = out / "composition.mid"
    midi_path.write_bytes(midi)
    candidates = [
        Path("/usr/share/sounds/sf2/FluidR3_GM.sf2"),
        Path("/usr/share/sounds/sf2/default-GM.sf2"),
    ]
    soundfont = next((path for path in candidates if path.exists()), None)
    if soundfont is None:
        all_fonts = list(Path("/usr/share/sounds/sf2").glob("*.sf2"))
        soundfont = all_fonts[0] if all_fonts else None
    if soundfont is None:
        raise RuntimeError("No General MIDI SoundFont was installed in the creative worker image.")
    run(["fluidsynth", "-ni", "-g", "0.7", "-F", str(out / "artifact.wav"), "-r", "44100", str(soundfont), str(midi_path)])


def hex_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i:i+2], 16) for i in (0, 2, 4))


def make_scene(scene, width, height, index, out):
    base = hex_rgb(scene["background"])
    image = Image.new("RGB", (width, height))
    pixels = image.load()
    accent = ((base[0] + 92) % 256, (base[1] + 72) % 256, (base[2] + 112) % 256)
    for y in range(height):
        ratio = y / max(1, height - 1)
        color = tuple(round(base[c] * (1-ratio) + accent[c] * ratio) for c in range(3))
        for x in range(width):
            pixels[x, y] = color
    draw = ImageDraw.Draw(image, "RGBA")
    draw.ellipse((width*0.58, height*0.08, width*0.92, height*0.62), fill=(255,255,255,28), outline=(255,255,255,110), width=max(2,width//320))
    draw.ellipse((width*0.66, height*0.16, width*0.84, height*0.48), fill=(255,255,255,18), outline=(255,255,255,70), width=max(2,width//480))
    draw.rounded_rectangle((width*0.08, height*0.12, width*0.92, height*0.88), radius=max(18,width//40), outline=(255,255,255,75), width=max(2,width//480))
    title_font = font(max(24, int(height*0.075)), True)
    sub_font = font(max(16, int(height*0.033)))
    title = scene["title"][:100]
    box = draw.textbbox((0,0), title, font=title_font)
    draw.text(((width-(box[2]-box[0]))/2, height*0.68), title, font=title_font, fill=(255,255,255,255), stroke_width=1, stroke_fill=(0,0,0,70))
    subtitle = scene.get("subtitle", "")[:140]
    if subtitle:
        box = draw.textbbox((0,0), subtitle, font=sub_font)
        draw.text(((width-(box[2]-box[0]))/2, height*0.80), subtitle, font=sub_font, fill=(255,255,255,235))
    path = out / f"scene-{index:02d}.png"
    image.save(path, optimize=True)
    return path


def render_video(data, out):
    board = json.loads(data["content"])
    width, height, fps = board["width"], board["height"], board["fps"]
    clips = []
    for index, scene in enumerate(board["scenes"], 1):
        still = make_scene(scene, width, height, index, out)
        clip = out / f"clip-{index:02d}.mp4"
        frames = max(1, round(scene["durationSeconds"] * fps))
        motion = scene.get("motion", "drift")
        if motion == "rise":
            motion_args = "z='1.06':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)-min(on*0.6,ih*0.04)'"
        elif motion == "pulse":
            motion_args = "z='1.03+0.025*sin(on/8)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
        elif motion == "orbit":
            motion_args = "z='1.06':x='iw/2-(iw/zoom/2)+sin(on/14)*iw*0.03':y='ih/2-(ih/zoom/2)+cos(on/14)*ih*0.03'"
        else:
            motion_args = "z='min(zoom+0.0007,1.06)':x='iw/2-(iw/zoom/2)+sin(on/18)*iw*0.025':y='ih/2-(ih/zoom/2)'"
        vf = "zoompan=" + motion_args + ":d=1:s=" + str(width) + "x" + str(height) + ":fps=" + str(fps) + ",format=yuv420p"
        run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-framerate", str(fps), "-i", str(still), "-frames:v", str(frames), "-vf", vf, "-an", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", str(clip)])
        clips.append(clip)
    concat = out / "concat.txt"
    concat.write_text("".join("file '" + str(path) + "'\n" for path in clips), encoding="utf-8")
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-c:v", "libx264", "-preset", "ultrafast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out / "artifact.mp4")])


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: render.py INPUT_JSON OUTPUT_DIR")
    input_path, output_dir = Path(sys.argv[1]), Path(sys.argv[2])
    output_dir.mkdir(parents=True, exist_ok=True)
    data = json.loads(input_path.read_text(encoding="utf-8"))
    handlers = {"html": render_html, "svg": render_svg, "music": render_music, "video": render_video}
    handler = handlers.get(data.get("format"))
    if handler is None:
        raise RuntimeError("Unsupported creative format.")
    handler(data, output_dir)
    expected = {"html": "artifact.html", "svg": "artifact.svg", "music": "artifact.wav", "video": "artifact.mp4"}[data["format"]]
    if not (output_dir / expected).is_file() or (output_dir / expected).stat().st_size == 0:
        raise RuntimeError("Renderer did not create a non-empty output file.")
    print(json.dumps({"ok": True, "format": data["format"], "output": expected, "bytes": (output_dir / expected).stat().st_size}))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
