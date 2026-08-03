# Projection Route Decision

**Decision: projection REQUIRED** — user explicitly wants a photo-likeness skin on the shell.

- Shell geometry: stylized character route (reconstruction.md) — hand-parameterized bust, hair as clumped masses.
- Likeness skin: projection-first (likeness_maximization.md): camera solved (reference-camera.json, heuristic FOV 40, front view, agent-refine on overlay), de-lit albedo produced (albedo-delit.png, confidence 0.59 — residual specular on forehead/nose noted; acceptable for a texture skin, will be reviewed on-mesh).
- bake_projected_texture.py runs at material-pass once the front-face mesh exists (deferred, not skipped).
- Matrix-rain skin: fully procedural shader material; no projection needed.
- Honesty per contract: single image → back/sides of likeness texture are mirrored/palette-continued with per-region confidence flags; no 100% likeness claim.
