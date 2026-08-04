# the candidate Avatar — procedural Three.js bust with swappable skins

A code-only 3D bust of the candidate built from `pipeline/reference.png` via the
[img2threejs](https://github.com/img2threejs/img2threejs) staged sculpting pipeline
(character profile: landmark measurement, quality-gated spec, measured render↔reference
correction loop).

## The contract: shell + skins

The **shell** (`src/createBustModel.ts`) is geometry only — 50 named parts
(head, 31 hair curl clumps, beard band, open-smile mouth + teeth, eyes, nose, ears,
neck, shirt/collar/placket/buttons) under pivot groups with sockets, box colliders,
and destruction groups exposed at `root.userData.sculptRuntime`. No skin is baked in.

**Skins** (`src/skins.ts`) are material sets applied via `applythe candidateSkin(root, skin)`:

- `createMatrixSkin()` — streaming green glyph rain (animated canvas emissive textures,
  per-zone density/tint; call `skin.update(t)` per frame)
- `createLikenessSkin(url)` — the de-lit reference photo projected front-orthographically
  with landmark-anchored vertical mapping (eyes→eyes, chin→chin, collar→chest)
- `createClaySkin()` — neutral zone-colored review look

```js
import { createthe candidatePortraitBustModel, applythe candidateSkin } from './createBustModel.js';
import { createMatrixSkin } from './skins.js';

const bust = createthe candidatePortraitBustModel();
scene.add(bust);
const skin = createMatrixSkin();
applythe candidateSkin(bust, skin);          // swap any time; geometry untouched
// per frame: skin.update?.(elapsedSeconds)
```

## Viewer

```
cd avatar/viewer && python3 -m http.server 8765
open "http://localhost:8765/index.html?skin=matrix&dist=3.5&ty=-0.36"
```

Query params: `skin=matrix|likeness|clay` (omit = blockout clay), `yaw`, `pitch`,
`dist`, `ty`, `fov`, `flat=1` (unlit map-stripped evidence mode).

Rebuild after editing `src/`:
`npx esbuild src/*.ts --outdir=viewer --format=esm`

## Pipeline state (avatar/pipeline/)

- Blockout pass **accepted** (12 measured iterations; landmark deltas <0.06,
  aligned-silhouette IoU 0.82, aspect/scale/symmetry gates pass, no degenerate
  orbit views, part-coverage gate 0 errors). `state.json` sits at `structural-pass`.
- `measure.py` — zone-classifying landmark measurer (render vs reference deltas + fix hints)
- `align_render.py` — bbox/circle framing normalizer so IoU measures shape, not framing
- Honesty notes: single front photo → back of head, nape, ear geometry are inferred
  (low confidence); likeness skin smears on back-facing surfaces; hairline sits ~0.05
  head-heights high. Remaining passes (form/material/lighting/interaction/optimization)
  are unlocked but not yet run.
