# Relay demo video

This package contains the editable 60-second Relay product film. It uses the production brand palette and the deterministic moving-services demo data already present in the product.

## Outputs

- `dist/relay-demo.mp4` — 1920×1080 H.264 master
- `dist/relay-demo.webm` — VP9 web version
- `dist/relay-demo-poster.png` — social and homepage poster frame
- `public/captions/relay-demo.srt` — caption sidecar

## Commands

```bash
pnpm video:dev
pnpm video:render
```

The generated ElevenLabs narration and score live in `public/audio/`. Their source copy and prompt live in `scripts/` so the soundtrack can be regenerated without changing the composition.
