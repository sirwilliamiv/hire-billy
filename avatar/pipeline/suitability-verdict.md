# Reference Suitability Verdict — reference.png (Billy headshot)

Rubric: grimoire/intake/validation_rubric.md

**Verdict: `character-conditional -> stylized`** (pass with conditions)

- One obvious target subject: human head-and-shoulders portrait, occupies most of the circular
  crop. Strong frontal silhouette; face unobstructed; major materials (skin, hair, beard,
  chambray shirt, eyes, teeth) clearly visible. Resolution 690×612, technically clean
  (probe: pass, no warnings).
- Humanoid, character-like form language → character-conditional per rubric, NOT reject,
  despite hair-dominant silhouette.
- Route: standard character pipeline (`grimoire/character/reconstruction.md`) building a
  **stylized-to-mid-fidelity bust shell**. Projection-first likeness
  (`likeness_maximization.md`) is reserved for the *likeness skin* texture layer, not the
  shell geometry — the user's explicit goal is a reusable shell with swappable skins
  (matrix-rain shader skin + photo-likeness skin).
- Stylization level: realistic head proportions for the bust (single head, no body, so head
  ratio debate does not apply); hidden regions (back of head, nape hair, ear tops, under-jaw)
  are plausible interpolations and are flagged as such.
- Conditions/limits: single front view; back-of-head and ear geometry approximate; per-region
  confidence will be reported; no photoreal strand hair — stylized clumped hair masses.

User intent (stated): avatar of the face as a shell/bones so different skins can be applied.
This matches character-conditional -> stylized with a projection-derived texture skin as an
optional maximum-likeness surface layer.
