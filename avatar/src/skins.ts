/**
 * Billy bust SKINS — material sets that swap onto the geometry shell via applyBillySkin.
 * The shell (createBillyBustModel) owns geometry/UVs; skins own appearance only.
 *
 * - createMatrixSkin(): streaming green glyph columns (canvas emissive texture, animated)
 * - createLikenessSkin(): the de-lit reference photo front-projected onto the bust
 * - createClaySkin(): neutral zone-colored clay (review/blockout look)
 */
import * as THREE from 'three';
import type { BillySkin } from './createBillyBustModel.js';

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
// matrix rain
// ---------------------------------------------------------------------------
const GLYPHS = 'アイウエオカキクケコサシスセソタチツテト0123456789ZXCVBNMASDFGH';

function makeRainCanvas(cols: number, rows: number, cell: number, seed: number): {
  canvas: HTMLCanvasElement; redraw: (t: number) => void;
} {
  const canvas = document.createElement('canvas');
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext('2d')!;
  // deterministic per-column speeds/phases
  let a = seed >>> 0;
  const rnd = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const speeds = Array.from({ length: cols }, () => 4 + rnd() * 14);
  const phases = Array.from({ length: cols }, () => rnd() * rows);
  const chars = Array.from({ length: cols * rows }, () => GLYPHS[(rnd() * GLYPHS.length) | 0]);

  function redraw(t: number) {
    ctx.fillStyle = '#020703';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${cell * 0.82}px monospace`;
    ctx.textBaseline = 'top';
    for (let c = 0; c < cols; c += 1) {
      const head = (phases[c] + t * speeds[c]) % (rows * 1.5);
      for (let r = 0; r < rows; r += 1) {
        const dist = head - r;
        if (dist < 0 || dist > 16) continue;
        const ch = chars[(c * rows + ((r + ((t * speeds[c]) | 0)) % rows))];
        if (dist < 1) ctx.fillStyle = '#eaffee';
        else ctx.fillStyle = `rgba(70, ${Math.max(110, 255 - dist * 12) | 0}, 110, ${Math.max(0.3, 1 - dist * 0.055)})`;
        ctx.fillText(ch, c * cell, r * cell);
      }
    }
  }
  redraw(0);
  return { canvas, redraw };
}

export function createMatrixSkin(): BillySkin {
  const zones: { key: string; cols: number; rows: number; seed: number; emissive: number; intensity: number }[] = [
    { key: 'skin', cols: 48, rows: 48, seed: 0x51a1, emissive: 0x2bd96a, intensity: 1.0 },
    { key: 'hair', cols: 40, rows: 40, seed: 0x77b2, emissive: 0x1e9c4c, intensity: 0.85 },
    { key: 'beard', cols: 36, rows: 36, seed: 0x99c3, emissive: 0x27b85b, intensity: 0.9 },
    { key: 'eye', cols: 8, rows: 8, seed: 0xabc4, emissive: 0xb7ffcf, intensity: 1.6 },
    { key: 'teeth', cols: 10, rows: 6, seed: 0xcdd5, emissive: 0x8affb3, intensity: 1.2 },
    { key: 'shirt', cols: 64, rows: 64, seed: 0xeff6, emissive: 0x1c8843, intensity: 0.7 },
  ];
  const materials: Record<string, THREE.Material> = {};
  const animators: ((t: number) => void)[] = [];
  for (const z of zones) {
    const { canvas, redraw } = makeRainCanvas(z.cols, z.rows, 16, z.seed);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x020a06,
      roughness: 0.55,
      metalness: 0.1,
      emissive: z.emissive,
      emissiveIntensity: z.intensity * 2.2,
      emissiveMap: tex,
      envMapIntensity: 0.15,
    });
    materials[z.key] = mat;
    animators.push((t) => { redraw(t); tex.needsUpdate = true; });
  }
  return {
    name: 'matrix',
    materials,
    update: (t) => { for (const a of animators) a(t); },
  };
}

// ---------------------------------------------------------------------------
// likeness (front-projected de-lit photo)
// ---------------------------------------------------------------------------
/**
 * Orthographic front projection of the de-lit reference photo onto the shell.
 * The subject's bbox in the photo maps onto the bust's world bbox, so photo
 * pixels land on the matching body regions. Back-facing regions receive
 * smeared edge pixels (single-view limitation — mirrored/inferred, low
 * confidence); the avatar is intended to be viewed frontally.
 */
export function createLikenessSkin(albedoUrl: string, onReady?: () => void): BillySkin {
  const tex = new THREE.TextureLoader().load(albedoUrl, () => onReady?.());
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;

  const shared = () => new THREE.MeshStandardMaterial({
    map: tex,
    color: 0xc4c4c4, // tame ACES + key-light blowout on the bright de-lit albedo
    roughness: 0.62,
    metalness: 0,
  });
  const materials: Record<string, THREE.Material> = {
    skin: shared(), hair: shared(), beard: shared(), teeth: shared(), shirt: shared(),
    eye: shared(),
  };
  (materials.eye as THREE.MeshStandardMaterial).roughness = 0.15;

  // subject bbox inside reference-clean.png (measured: x 51..471, y 43..508 of 512)
  const REF = { u0: 51 / 512, u1: 471 / 512, v0: 43 / 512, v1: 508 / 512 };
  // piecewise vertical anchors (photo row -> model world y):
  // eye line 190/512 -> 0.20, chin (beard bottom) 369/512 -> -0.365
  const ANCHORS: { t: number; y: number }[] = [
    { t: 0, y: Number.NaN },                                       // bbox top (filled at attach)
    { t: (190 / 512 - REF.v0) / (REF.v1 - REF.v0), y: 0.20 },      // eye line
    { t: (369 / 512 - REF.v0) / (REF.v1 - REF.v0), y: -0.365 },    // chin
    { t: 1, y: Number.NaN },                                       // bbox bottom (filled at attach)
  ];

  return {
    name: 'likeness',
    materials,
    onAttach: (root) => {
      root.updateWorldMatrix(true, true);
      const bbox = new THREE.Box3().setFromObject(root);
      const v = new THREE.Vector3();
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const geo = mesh.geometry as THREE.BufferGeometry;
        const pos = geo.attributes.position;
        const uv = new Float32Array(pos.count * 2);
        for (let i = 0; i < pos.count; i += 1) {
          v.fromBufferAttribute(pos, i);
          mesh.localToWorld(v);
          const nx = (v.x - bbox.min.x) / (bbox.max.x - bbox.min.x);
          // piecewise vertical map through landmark anchors, so eyes land on eyes,
          // the chin on the chin, and the collar stays on the chest
          const A = ANCHORS;
          A[0].y = bbox.max.y;
          A[A.length - 1].y = bbox.min.y;
          let tFromTop = 1;
          for (let s = 0; s < A.length - 1; s += 1) {
            const y0 = A[s].y, y1 = A[s + 1].y;
            if (v.y <= y0 && v.y >= y1) {
              const seg = (y0 - v.y) / Math.max(1e-6, y0 - y1);
              tFromTop = A[s].t + seg * (A[s + 1].t - A[s].t);
              break;
            }
          }
          if (v.y > A[0].y) tFromTop = 0;
          const photoV = REF.v0 + tFromTop * (REF.v1 - REF.v0); // y-down in photo
          uv[i * 2] = REF.u0 + nx * (REF.u1 - REF.u0);
          uv[i * 2 + 1] = 1 - photoV; // photo y-down -> uv y-up
        }
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        geo.attributes.uv.needsUpdate = true;
      });
    },
  };
}
