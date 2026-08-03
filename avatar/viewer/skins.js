import * as THREE from "three";
function createClaySkin() {
  const mk = (color, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
  return {
    name: "clay",
    materials: {
      skin: mk(15119766, 0.75),
      hair: mk(7031343, 0.85),
      beard: mk(9067064, 0.85),
      eye: mk(15921388, 0.35),
      teeth: mk(16052198, 0.4),
      shirt: mk(6127769, 0.9)
    }
  };
}
const GLYPHS = "\u30A2\u30A4\u30A6\u30A8\u30AA\u30AB\u30AD\u30AF\u30B1\u30B3\u30B5\u30B7\u30B9\u30BB\u30BD\u30BF\u30C1\u30C4\u30C6\u30C80123456789ZXCVBNMASDFGH";
function makeRainCanvas(cols, rows, cell, seed) {
  const canvas = document.createElement("canvas");
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext("2d");
  let a = seed >>> 0;
  const rnd = () => {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const speeds = Array.from({ length: cols }, () => 4 + rnd() * 14);
  const phases = Array.from({ length: cols }, () => rnd() * rows);
  const chars = Array.from({ length: cols * rows }, () => GLYPHS[rnd() * GLYPHS.length | 0]);
  function redraw(t) {
    ctx.fillStyle = "#020703";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${cell * 0.82}px monospace`;
    ctx.textBaseline = "top";
    for (let c = 0; c < cols; c += 1) {
      const head = (phases[c] + t * speeds[c]) % (rows * 1.5);
      for (let r = 0; r < rows; r += 1) {
        const dist = head - r;
        if (dist < 0 || dist > 16) continue;
        const ch = chars[c * rows + (r + (t * speeds[c] | 0)) % rows];
        if (dist < 1) ctx.fillStyle = "#eaffee";
        else ctx.fillStyle = `rgba(70, ${Math.max(110, 255 - dist * 12) | 0}, 110, ${Math.max(0.3, 1 - dist * 0.055)})`;
        ctx.fillText(ch, c * cell, r * cell);
      }
    }
  }
  redraw(0);
  return { canvas, redraw };
}
function createMatrixSkin() {
  const zones = [
    { key: "skin", cols: 48, rows: 48, seed: 20897, emissive: 2873706, intensity: 1 },
    { key: "hair", cols: 40, rows: 40, seed: 30642, emissive: 2006092, intensity: 0.85 },
    { key: "beard", cols: 36, rows: 36, seed: 39363, emissive: 2603099, intensity: 0.9 },
    { key: "eye", cols: 8, rows: 8, seed: 43972, emissive: 12058575, intensity: 1.6 },
    { key: "teeth", cols: 10, rows: 6, seed: 52693, emissive: 9109427, intensity: 1.2 },
    { key: "shirt", cols: 64, rows: 64, seed: 61430, emissive: 1869891, intensity: 0.7 }
  ];
  const materials = {};
  const animators = [];
  for (const z of zones) {
    const { canvas, redraw } = makeRainCanvas(z.cols, z.rows, 16, z.seed);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.MeshStandardMaterial({
      color: 133638,
      roughness: 0.55,
      metalness: 0.1,
      emissive: z.emissive,
      emissiveIntensity: z.intensity * 2.2,
      emissiveMap: tex,
      envMapIntensity: 0.15
    });
    materials[z.key] = mat;
    animators.push((t) => {
      redraw(t);
      tex.needsUpdate = true;
    });
  }
  return {
    name: "matrix",
    materials,
    update: (t) => {
      for (const a of animators) a(t);
    }
  };
}
function createLikenessSkin(albedoUrl, onReady) {
  const tex = new THREE.TextureLoader().load(albedoUrl, () => onReady?.());
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const shared = () => new THREE.MeshStandardMaterial({
    map: tex,
    color: 12895428,
    // tame ACES + key-light blowout on the bright de-lit albedo
    roughness: 0.62,
    metalness: 0
  });
  const materials = {
    skin: shared(),
    hair: shared(),
    beard: shared(),
    teeth: shared(),
    shirt: shared(),
    eye: shared()
  };
  materials.eye.roughness = 0.15;
  const REF = { u0: 51 / 512, u1: 471 / 512, v0: 43 / 512, v1: 508 / 512 };
  const ANCHORS = [
    { t: 0, y: Number.NaN },
    // bbox top (filled at attach)
    { t: (190 / 512 - REF.v0) / (REF.v1 - REF.v0), y: 0.2 },
    // eye line
    { t: (369 / 512 - REF.v0) / (REF.v1 - REF.v0), y: -0.365 },
    // chin
    { t: 1, y: Number.NaN }
    // bbox bottom (filled at attach)
  ];
  return {
    name: "likeness",
    materials,
    onAttach: (root) => {
      root.updateWorldMatrix(true, true);
      const bbox = new THREE.Box3().setFromObject(root);
      const v = new THREE.Vector3();
      root.traverse((o) => {
        const mesh = o;
        if (!mesh.isMesh) return;
        const geo = mesh.geometry;
        const pos = geo.attributes.position;
        const uv = new Float32Array(pos.count * 2);
        for (let i = 0; i < pos.count; i += 1) {
          v.fromBufferAttribute(pos, i);
          mesh.localToWorld(v);
          const nx = (v.x - bbox.min.x) / (bbox.max.x - bbox.min.x);
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
          const photoV = REF.v0 + tFromTop * (REF.v1 - REF.v0);
          uv[i * 2] = REF.u0 + nx * (REF.u1 - REF.u0);
          uv[i * 2 + 1] = 1 - photoV;
        }
        geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
        geo.attributes.uv.needsUpdate = true;
      });
    }
  };
}
export {
  createClaySkin,
  createLikenessSkin,
  createMatrixSkin
};
