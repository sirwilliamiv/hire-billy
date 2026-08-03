/**
 * Billy bust SKINS — material sets that swap onto the geometry shell via applyBillySkin.
 * The shell (createBillyBustModel) owns geometry; skins own appearance only.
 *
 * Both non-clay skins share ONE mapping: the reference photo is projected onto the
 * bust with landmark-anchored vertical mapping (applyLikenessUVs), so photo pixels
 * land on the matching body regions.
 *
 * - createLikenessSkin(): the photo itself, unlit — the model looks like the photo
 * - createMatrixSkin(): streaming glyph rain whose brightness is masked by the photo,
 *   so the face emerges FROM the code (the "face in the matrix" effect)
 * - createClaySkin(): neutral review look
 */
import * as THREE from 'three';
import type { BillySkin } from './createBillyBustModel.js';

// subject bbox inside reference-clean.png (measured: x 51..471, y 43..508 of 512)
const REF = { u0: 51 / 512, u1: 471 / 512, v0: 43 / 512, v1: 508 / 512 };
// piecewise vertical anchors (photo row of 512 -> model world y)
const ROWS = { eye: 190, chin: 369 };
const ANCHOR_Y = { eye: 0.20, chin: -0.365 };

/**
 * Orthographic front projection with landmark-anchored vertical mapping:
 * eyes land on eyes, chin on chin, collar on the chest. Writes the projected
 * coordinates into each mesh's `uv` attribute (whole-photo 0..1 space).
 * Single-view limitation: back-facing regions receive smeared edge pixels.
 */
export function applyLikenessUVs(root: THREE.Object3D): void {
  root.updateWorldMatrix(true, true);
  const bbox = new THREE.Box3().setFromObject(root);
  const tEye = (ROWS.eye / 512 - REF.v0) / (REF.v1 - REF.v0);
  const tChin = (ROWS.chin / 512 - REF.v0) / (REF.v1 - REF.v0);
  // bottom anchor is FIXED at the reference-frame bottom (not the model bbox) so a
  // torso that extends below the photo crop keeps real cloth texture instead of streaks
  const anchors = [
    { t: 0, y: bbox.max.y },
    { t: tEye, y: ANCHOR_Y.eye },
    { t: tChin, y: ANCHOR_Y.chin },
    { t: 1, y: -0.82 },  // photo bottom row at TRUE scale (139px below chin); below = clamp
  ];
  const v = new THREE.Vector3();
  const skinTargets: Record<string, string> =
    (root as THREE.Group).userData?.sculptRuntime?.skinTargets ?? {};
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const isShirt = skinTargets[mesh.name] === 'shirt';
    const geo = mesh.geometry as THREE.BufferGeometry;
    const pos = geo.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i);
      mesh.localToWorld(v);
      const nx = (v.x - bbox.min.x) / (bbox.max.x - bbox.min.x);
      let tFromTop = 1;
      for (let s = 0; s < anchors.length - 1; s += 1) {
        const y0 = anchors[s].y, y1 = anchors[s + 1].y;
        if (v.y <= y0 && v.y >= y1) {
          const seg = (y0 - v.y) / Math.max(1e-6, y0 - y1);
          tFromTop = anchors[s].t + seg * (anchors[s + 1].t - anchors[s].t);
          break;
        }
      }
      if (v.y > anchors[0].y) tFromTop = 0;
      let photoV = REF.v0 + tFromTop * (REF.v1 - REF.v0); // y-down in photo
      let photoU = REF.u0 + nx * (REF.u1 - REF.u0);
      if (isShirt) {
        // the model's shoulders sit higher/wider than the photo's sloped shoulder
        // line — clamp samples below the photo's shoulder boundary so background
        // white never lands on cloth. Boundary ~row 398 center, rising ~row 470 at edges.
        const boundary = (400 + 78 * Math.pow((photoU - 0.5) / 0.41, 2)) / 512;
        if (photoV < boundary) photoV = Math.min(boundary + 0.015, REF.v1);
      }
      // the reference is a circular crop — samples outside the circle are blank
      // background. Pull them radially back inside so cloth stays cloth.
      {
        const dx = photoU - 0.5, dy = photoV - 0.5;
        const r = Math.hypot(dx, dy), rMax = 0.47;
        if (r > rMax) {
          const s = rMax / r;
          photoU = 0.5 + dx * s;
          photoV = 0.5 + dy * s;
        }
      }
      uv[i * 2] = photoU;
      uv[i * 2 + 1] = 1 - photoV; // -> uv y-up
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.attributes.uv.needsUpdate = true;
  });
}

// ---------------------------------------------------------------------------
// clay
// ---------------------------------------------------------------------------
export function createClaySkin(): BillySkin {
  const mk = (color: number, roughness = 0.8) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
  return {
    name: 'clay',
    materials: {
      skin: mk(0xe6b596, 0.75),
      hair: mk(0x6b4a2f, 0.85),
      beard: mk(0x8a5a38, 0.85),
      eye: mk(0xf2f0ec, 0.35),
      teeth: mk(0xf4efe6, 0.4),
      shirt: mk(0x5d8099, 0.9),
    },
  };
}

// ---------------------------------------------------------------------------
// likeness — the photo itself, unlit
// ---------------------------------------------------------------------------
export function createLikenessSkin(albedoUrl: string, onReady?: () => void): BillySkin {
  const tex = new THREE.TextureLoader().load(albedoUrl, () => onReady?.());
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  // UNLIT photo color: the projected pixels ARE the look. Scene lights and tone
  // mapping would repaint the photo and push it back toward CG.
  const shared = () => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  return {
    name: 'likeness',
    materials: { skin: shared(), hair: shared(), beard: shared(), teeth: shared(), shirt: shared(), eye: shared() },
    onAttach: (root) => applyLikenessUVs(root),
  };
}

// ---------------------------------------------------------------------------
// matrix — glyph rain masked by the photo (the face emerges from the code)
// ---------------------------------------------------------------------------
const GLYPHS = 'アイウエオカキクケコサシスセソタチツテト0123456789ZXCVBNMASDFGH';

export function createMatrixSkin(albedoUrl: string, onReady?: () => void): BillySkin {
  const SIZE = 1024;
  const CELL = 12;
  const COLS = Math.floor(SIZE / CELL);
  const ROWS_N = Math.floor(SIZE / CELL);

  // luminance mask of the subject (photo bg is uniform #f5f5f5 -> masked out)
  const mask = document.createElement('canvas');
  mask.width = mask.height = SIZE;
  const maskCtx = mask.getContext('2d')!;
  let maskReady = false;
  const img = new Image();
  img.onload = () => {
    maskCtx.drawImage(img, 0, 0, SIZE, SIZE);
    const d = maskCtx.getImageData(0, 0, SIZE, SIZE);
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const isBg = r > 233 && g > 233 && b > 233 && Math.max(r, g, b) - Math.min(r, g, b) < 12;
      // dark-region lift: hair/beard are dark in the photo but must still glow
      let lum = isBg ? 0 : Math.pow((0.299 * r + 0.587 * g + 0.114 * b) / 255, 0.65);
      if (!isBg) lum = 0.35 + lum * 0.65;
      const q = Math.round(lum * 255);
      px[i] = q; px[i + 1] = q; px[i + 2] = q; px[i + 3] = 255;
    }
    maskCtx.putImageData(d, 0, 0);
    maskReady = true;
    onReady?.();
  };
  img.src = albedoUrl;

  // rain state (deterministic)
  let a = 0xb111;
  const rnd = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const speeds = Array.from({ length: COLS }, () => 5 + rnd() * 16);
  const phases = Array.from({ length: COLS }, () => rnd() * ROWS_N);
  const chars = Array.from({ length: COLS * ROWS_N }, () => GLYPHS[(rnd() * GLYPHS.length) | 0]);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  function redraw(t: number) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#010502';
    ctx.fillRect(0, 0, SIZE, SIZE);
    if (maskReady) {
      // the face ghosts faintly in the code even between glyph trails
      ctx.globalAlpha = 0.5;
      ctx.drawImage(mask, 0, 0);
      ctx.globalAlpha = 1;
      // tint the ghost green
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = '#2fd06c';
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.font = `${CELL * 0.9}px monospace`;
    ctx.textBaseline = 'top';
    for (let c = 0; c < COLS; c += 1) {
      const head = (phases[c] + t * speeds[c]) % (ROWS_N * 1.4);
      for (let r = 0; r < ROWS_N; r += 1) {
        const dist = head - r;
        if (dist < 0 || dist > 18) continue;
        const ch = chars[c * ROWS_N + ((r + ((t * speeds[c]) | 0)) % ROWS_N)];
        if (dist < 1) ctx.fillStyle = '#eaffee';
        else ctx.fillStyle = `rgba(80, ${Math.max(120, 255 - dist * 10) | 0}, 120, ${Math.max(0.35, 1 - dist * 0.05)})`;
        ctx.fillText(ch, c * CELL, r * CELL);
      }
    }
    if (maskReady) {
      // glyph brightness carries the photo: bright where the face is bright
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(mask, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  redraw(0);

  const shared = () => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  return {
    name: 'matrix',
    materials: { skin: shared(), hair: shared(), beard: shared(), teeth: shared(), shirt: shared(), eye: shared() },
    onAttach: (root) => applyLikenessUVs(root),
    update: (t) => { redraw(t); tex.needsUpdate = true; },
  };
}
