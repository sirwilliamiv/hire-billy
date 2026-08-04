# Image Analysis — the candidate headshot reference

Reference: `/Users/b/Desktop/Screenshot 2026-08-03 at 1.10.57 PM.png`
Protocol: grimoire/intake/image_analysis.md (layers 1–8, observation before inference)

## Layer 1 — Identification & classification

- Observed: a photographic head-and-shoulders portrait of an adult human male, presented in a
  circular crop on a dark near-black field (screenshot of a profile avatar).
- Work type: **portrait bust** (head + neck + upper-torso/shoulders).
- Broad classification: human character, head/bust reconstruction target.
- `primaryDomain`: **character**. Confidence: 0.97.
- Inference: this is a profile/avatar photo (circular mask, studio backdrop) — framing is
  suitable as a front-view reference for a bust.

## Layer 2 — Overall form & silhouette

- Bounding volume: head is an ovoid (taller than wide), sitting on a frustum neck, over a
  broad trapezoidal shoulder mass. Whole bust fits a vertically oriented cuboid roughly
  1 : 1.35 (width : height) within the circle.
- Symmetry: bilateral, approximately — head has a slight tilt (top of head toward the
  anatomical right, a few degrees) and hair mass is asymmetric.
- Shape language: organic throughout; no geometric/hard-surface parts.
- Proportion (reference dimension = head height, chin→crown incl. hair):
  - Face (chin→hairline) ≈ 0.72 head heights; hair adds ≈ 0.28 above.
  - Head width (at temples incl. hair) ≈ 0.85 head heights.
  - Visible shoulder span ≈ 2.1 head heights.
  - Neck: short in view — collar sits high; chin→collar ≈ 0.25 head heights.

## Layer 3 — Macro → meso → micro decomposition

- **Macro**: cranium+face mass; hair volume; neck; torso/shoulder mass (shirt).
- **Meso**:
  - Face: forehead plane, brow ridge, eye sockets (2), nose (bridge + tip + alae), cheeks
    (zygomatic + smile-lifted buccal mass), mouth (open smile, upper teeth row visible),
    chin/jaw, ears (both partially occluded by hair — right ear more hidden).
  - Hair: top swept-back curl mass, lateral temple curls (left lateral mass fuller in view),
    front hairline waves, sideburns transitioning to beard.
  - Beard: mustache, chin beard, jawline stubble up the cheeks (short, follows jaw).
  - Shirt: collar (spread, open at throat), placket with buttons (2 visible), shoulder yokes,
    wrinkle folds radiating from armpits/placket.
- **Micro**: hair strand curls (irregular, wavy, ~finger-width curl radius), beard stipple
  gradient (dense at chin/mustache → sparse on upper cheeks), smile creases (nasolabial folds),
  crow's-feet at outer eye corners, brow hairs, button discs, chambray weave texture.

## Layer 4 — Spatial relationships

- `<hair-mass, attached-to+overlapping, cranium>` — overlap contact; occludes forehead top,
  both temples, tops of both ears.
- `<beard, embedded-in, lower-face skin>` — surface-embedded stipple layer, not a separate solid.
- `<head, socketed-on, neck>` — butt/socket contact at jaw shadow line; neck partially occluded
  by collar and chin.
- `<neck, inside, collar>` — collar wraps neck, open V at throat.
- `<torso, below, head>` — shoulders slope down laterally from collar.
- Eyes sit at ≈ 0.45 of face height from chin; mouth center ≈ 0.22; nose base ≈ 0.33.

## Layer 5 — Materials & surface (PBR)

- **Skin** (face/neck): dielectric; albedo warm light beige, mid-high value; roughness ~0.55
  (soft sheen on forehead/nose tip = lower roughness there ~0.4); subsurface warm response on
  ears/nose (inference: standard skin SSS). Micro-normal: pores, smile creases.
- **Hair**: dielectric fiber mass; albedo mid-value warm brown (lighter caramel highlights on
  curl crests — observed highlight, partly baked lighting); roughness anisotropic along strands
  ~0.35 tangential; opaque with soft silhouette edges.
- **Beard**: same family as hair, slightly redder/ginger hue, higher sparsity → skin shows
  through (blend layer, coverage 0.3–0.8 by zone).
- **Eyes**: sclera near-white low roughness; iris blue-gray, mid value; dark pupil; strong
  specular catchlight upper-left of each iris (baked studio light — do not bake into albedo).
- **Teeth**: upper row visible, near-white, low roughness, slight warm tint.
- **Shirt**: woven cotton chambray; albedo desaturated light blue, mid-high value; roughness
  ~0.85 matte; visible weave micro-texture; white buttons (plastic, roughness ~0.4).
- **Backdrop**: near-white seamless studio background, very soft gradient, no detail.

## Layer 6 — Color & finish

- Skin: warm beige, hue ~25°, saturation low-mid, value high-mid.
- Hair: brown, hue ~30°, saturation mid, value mid (0.35–0.55 with highlight stops at 0.65).
- Beard: brown with ginger cast, hue ~22°, slightly higher saturation than scalp hair.
- Eyes: desaturated blue, hue ~210°, value mid-high.
- Shirt: desaturated blue, hue ~215°, saturation low, value 0.7; finish matte.
- Background: off-white, value 0.92–0.96, neutral-to-cool.
- Lighting in photo: large soft key from front-upper-left (photo space), soft shadows under
  chin/right of nose — MUST be removed (de-lit) before any albedo projection.

## Layer 7 — Identity-defining features

1. Wavy, voluminous swept-back brown hair with irregular curls, notable volume above crown and
   at temples (silhouette-defining).
2. Short full beard + mustache, ginger-cast, denser at chin, open smile through it.
3. Broad open smile with visible upper teeth; strong nasolabial folds and lifted cheeks.
4. Blue-gray eyes, slightly narrowed by the smile; crow's-feet.
5. Straight nose with slightly rounded tip.
6. Light-blue chambray collared shirt, open collar, visible buttons.
7. Slight head tilt (a few degrees) in the reference pose.

## Layer 8 — Uncertainty & single-image limits

- **Hidden**: entire back of head/hair, top-down hair part, back of torso, ears mostly
  occluded (tops hidden by hair; geometry speculative), under-chin/jaw underside.
- **Occluded**: forehead top by hair; neck by collar; lower teeth by lip.
- **Uncertain**: precise ear shape; hair length at nape; exact hairline under front waves;
  eye color exactness (blue vs blue-green) at this resolution.
- Single front view → depth of nose projection, cheekbone depth, and cranium depth are
  estimated from population norms (inference, flagged speculative).
- Circular crop removes everything below mid-chest.

## Suitability verdict (for reference-suitability step)

Suitable as a front-view likeness reference for a **stylized-to-mid-fidelity bust shell**:
single view, good resolution, soft even lighting, face unobstructed. NOT sufficient for exact
back-of-head or ear geometry — those will be plausible interpolations. Recommend accepting
stylized/approximate for hidden regions.
