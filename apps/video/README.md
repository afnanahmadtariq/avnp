# Relay demo videos

This package contains two editable Relay motion films. Both use the production brand palette and the product's real architectural boundaries.

- `RelayDemo` is the 60-second customer-facing product film.
- `RelayTech` is the faster 59-second technical architecture overview.

## Outputs

- `dist/relay-demo.mp4` — 1920×1080 H.264 master
- `dist/relay-demo.webm` — VP9 web version
- `dist/relay-demo-poster.png` — social and homepage poster frame
- `public/captions/relay-demo.srt` — caption sidecar
- `dist/relay-tech-overview.mp4` — 1920×1080 H.264 technical master
- `dist/relay-tech-overview.webm` — VP9 technical web version
- `dist/relay-tech-overview-poster.png` — architecture poster from 00:09
- `public/captions/relay-tech-overview.srt` — technical caption sidecar

## Commands

```bash
pnpm video:dev
pnpm video:render
pnpm video:render:tech
```

The generated ElevenLabs narrations and scores live in `public/audio/`. Their source copy, request settings, and music prompts live in `scripts/` so either soundtrack can be regenerated without changing its composition.
