FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      blender \
      ffmpeg \
      fluidsynth \
      fluid-soundfont-gm \
      fonts-dejavu-core \
      inkscape \
      python3 \
      python3-pil \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY render.py /opt/eve-creative/render.py
RUN python3 -m py_compile /opt/eve-creative/render.py \
 && command -v blender \
 && command -v ffmpeg \
 && command -v fluidsynth \
 && command -v inkscape

WORKDIR /tmp
