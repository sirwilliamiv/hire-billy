/**
 * Billy Portrait Bust — procedural Three.js SHELL.
 *
 * Hand-refined from the img2threejs generated factory (spec: avatar/pipeline/spec.json).
 * Contract:
 *  - Geometry only ("shell/bones"): every mesh gets its material from a Skin object.
 *  - Pivot nodes carry position/rotation ONLY (scale 1,1,1); size lives in geometry.
 *    This prevents non-uniform parent scales from squashing nested parts (eyes under head).
 *  - root.userData.sculptRuntime = { nodes, meshes, sockets, colliders, destructionGroups }
 *  - applyBillySkin(root, skin) swaps materials on named meshes without touching geometry.
 *
 * Units: 1.0 = one head height (chin -> crown incl. hair). Model faces +z.
 * Subject's anatomical left = +x (faces camera at +z).
 * All procedural noise is deterministically seeded.
 */
import * as THREE from 'three';

export type ProceduralModelOptions = {
  wireframe?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
};

export type ProceduralModelRuntime = {
  nodes: Record<string, THREE.Object3D>;
  meshes: Record<string, THREE.Mesh>;
  sockets: Record<string, THREE.Object3D>;
  colliders: Record<string, { type: string; center: [number, number, number]; size: [number, number, number] }>;
  destructionGroups: Record<string, THREE.Object3D[]>;
  skinTargets: Record<string, string>; // meshId -> material slot name
};

export type BillySkin = {
  name: string;
  materials: Record<string, THREE.Material>; // slot -> material (slots: skin, hair, beard, eye, teeth, shirt)
  onAttach?: (root: THREE.Group) => void;
  update?: (timeSeconds: number) => void;
};

// ---------------------------------------------------------------------------
// deterministic PRNG (mulberry32) — same clump layout on every build
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Blockout clay materials per slot — replaced wholesale by applyBillySkin.
function clayMaterials(): Record<string, THREE.Material> {
  const mk = (color: number, roughness = 0.8) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
  return {
    skin: mk(0xe6b596, 0.75),
    hair: mk(0x6b4a2f, 0.85),
    beard: mk(0x8a5a38, 0.85),
    eye: mk(0xf2f0ec, 0.35),
    teeth: mk(0xf4efe6, 0.4),
    shirt: mk(0x5d8099, 0.9),
  };
}

function extrudeShape(points: [number, number][]): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) s.lineTo(points[i][0], points[i][1]);
  return s;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------
export function createBillyPortraitBustModel(options: ProceduralModelOptions = {}): THREE.Group {
  const castShadow = options.castShadow ?? true;
  const receiveShadow = options.receiveShadow ?? true;

  const nodes: ProceduralModelRuntime['nodes'] = {};
  const meshes: ProceduralModelRuntime['meshes'] = {};
  const sockets: ProceduralModelRuntime['sockets'] = {};
  const colliders: ProceduralModelRuntime['colliders'] = {};
  const destructionGroups: ProceduralModelRuntime['destructionGroups'] = {};
  const skinTargets: ProceduralModelRuntime['skinTargets'] = {};

  const mats = clayMaterials();

  const root = new THREE.Group();
  root.name = 'billy-bust';
  nodes.root = root;

  function pivot(id: string, parent: THREE.Object3D, pos: [number, number, number], rotDeg: [number, number, number] = [0, 0, 0]): THREE.Group {
    const g = new THREE.Group();
    g.name = `${id}__pivot`;
    g.position.set(...pos);
    g.rotation.set(
      THREE.MathUtils.degToRad(rotDeg[0]),
      THREE.MathUtils.degToRad(rotDeg[1]),
      THREE.MathUtils.degToRad(rotDeg[2]),
    );
    parent.add(g);
    nodes[id] = g;
    destructionGroups[id] = [g];
    return g;
  }

  function addMesh(id: string, node: THREE.Object3D, geometry: THREE.BufferGeometry, slot: string, size?: [number, number, number]): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, mats[slot]);
    mesh.name = id;
    if (size) mesh.scale.set(...size); // scale on the LEAF mesh only — never cascades
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    node.add(mesh);
    meshes[id] = mesh;
    skinTargets[id] = slot;
    const box = new THREE.Box3().setFromObject(mesh);
    const c = new THREE.Vector3(); const s = new THREE.Vector3();
    box.getCenter(c); box.getSize(s);
    colliders[id] = { type: 'box', center: [c.x, c.y, c.z], size: [s.x, s.y, s.z] };
    return mesh;
  }

  function socket(id: string, node: THREE.Object3D, pos: [number, number, number]): void {
    const s = new THREE.Object3D();
    s.name = id;
    s.position.set(...pos);
    node.add(s);
    sockets[id] = s;
  }

  // --- torso / shirt -------------------------------------------------------
  // Front-silhouette profile (world units), extruded and tapered front-to-back.
  const shirtNode = pivot('shirt', root, [0, -0.76, 0]);
  // slightly wider on -x: the reference subject sits a touch left-of-center
  const shirtProfile: [number, number][] = [
    [-0.88, -0.85], [-0.88, -0.35], [-0.82, -0.08], [-0.58, 0.19], [-0.28, 0.38], [-0.11, 0.43],
    [0.11, 0.43], [0.28, 0.38], [0.56, 0.17], [0.8, -0.1], [0.85, -0.38], [0.85, -0.85],
  ];
  const shirtGeo = new THREE.ExtrudeGeometry(extrudeShape(shirtProfile), {
    depth: 0.55, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.12, bevelSegments: 5, steps: 1,
  });
  shirtGeo.translate(0, 0, -0.275); // center depth on pivot
  addMesh('shirt', shirtNode, shirtGeo, 'shirt');
  socket('socket-neck', shirtNode, [0, 0.42, 0.02]);
  socket('socket-collar', shirtNode, [0, 0.38, 0.1]);
  socket('socket-placket', shirtNode, [0, -0.05, 0.29]);

  // collar: open spread band around the neck V (torus arc, flattened)
  const collarNode = pivot('collar', shirtNode, [0, 0.44, 0.08]);
  const collarGeo = new THREE.TorusGeometry(0.17, 0.06, 10, 24, Math.PI * 1.5);
  collarGeo.rotateX(Math.PI / 2);            // lay flat around neck
  collarGeo.rotateY(-Math.PI * 0.78 + Math.PI); // open the gap at the front V
  addMesh('collar', collarNode, collarGeo, 'shirt', [1, 1.6, 1]);

  // placket strip
  const placketNode = pivot('placket', shirtNode, [0, -0.08, 0.315]);
  addMesh('placket', placketNode, new THREE.BoxGeometry(0.13, 0.52, 0.025), 'shirt');
  // button row (repetition system button-row, 3 instances, linear spacing)
  for (let i = 0; i < 3; i += 1) {
    const bNode = pivot(`button-${i}`, placketNode, [0, 0.18 - i * 0.24, 0.018]);
    const bGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.012, 20);
    bGeo.rotateX(Math.PI / 2);
    addMesh(`button-${i}`, bNode, bGeo, 'shirt');
  }

  // --- neck ----------------------------------------------------------------
  const neckNode = pivot('neck', shirtNode, [0, 0.40, 0.02]);
  const neckGeo = new THREE.CylinderGeometry(0.12, 0.16, 0.3, 28, 4);
  addMesh('neck', neckNode, neckGeo, 'skin');
  socket('socket-head', neckNode, [0, 0.14, 0]);

  // --- head ----------------------------------------------------------------
  // Ellipsoid base with jaw taper via vertex deformation (continuous-sculpt).
  const headNode = pivot('head', neckNode, [0, 0.52, 0.02]); // roll comes from the projected photo, not geometry
  const headGeo = new THREE.SphereGeometry(0.5, 48, 36);
  {
    const pos = headGeo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i);
      const t = THREE.MathUtils.clamp((-v.y + 0.05) / 0.55, 0, 1); // 0 at mid, 1 at bottom
      const taper = 1 - 0.22 * t * t;          // jaw narrows toward chin
      v.x *= taper;
      const chin = 1 - 0.1 * t;                // slight chin pull-in front-to-back
      v.z *= chin;
      if (v.y > 0.15 && v.z > 0) v.z *= 0.94;  // flatten upper face plane slightly
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    headGeo.computeVertexNormals();
  }
  addMesh('head', headNode, headGeo, 'skin', [0.76, 0.94, 0.8]);
  // NOTE: head mesh scale (0.72, 0.94, 0.8) is on the LEAF mesh; child pivots below are
  // siblings on headNode (unscaled), so eyes/nose/mouth keep true shapes.
  socket('socket-eye-l', headNode, [0.115, 0.04, 0.31]);
  socket('socket-eye-r', headNode, [-0.115, 0.04, 0.31]);
  socket('socket-nose', headNode, [0, -0.06, 0.38]);
  socket('socket-mouth', headNode, [0, -0.31, 0.32]);
  socket('socket-ear-l', headNode, [0.37, 0, 0.02]);
  socket('socket-ear-r', headNode, [-0.37, 0, 0.02]);
  socket('socket-beard', headNode, [0, -0.28, 0.12]);
  socket('socket-scalp', headNode, [0, 0.42, -0.04]);
  socket('socket-scalp-back', headNode, [0, 0.28, -0.34]);

  // --- eyes ----------------------------------------------------------------
  for (const [side, x] of [['l', 0.115], ['r', -0.115]] as const) {
    const eNode = pivot(`eye-${side}`, headNode, [x, 0.04, 0.325]);
    addMesh(`eye-${side}`, eNode, new THREE.SphereGeometry(0.04, 24, 18), 'eye');
  }

  // --- nose ----------------------------------------------------------------
  // Side-profile wedge, extruded laterally then tapered (continuous-sculpt).
  const noseNode = pivot('nose', headNode, [0, -0.045, 0.33]);
  const noseProfile: [number, number][] = [
    [0.0, 0.16], [0.028, 0.1], [0.05, 0.0], [0.085, -0.09], [0.1, -0.125],
    [0.065, -0.14], [0.0, -0.14],
  ];
  const noseGeo = new THREE.ExtrudeGeometry(extrudeShape(noseProfile), {
    depth: 0.12, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.03, bevelSegments: 4, steps: 1,
  });
  noseGeo.rotateY(-Math.PI / 2);     // profile x (forward projection) -> +z, extrude across face
  noseGeo.translate(0.06, 0, 0);    // center the lateral extrusion
  {
    // taper the bridge narrower than the alae
    const pos = noseGeo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i);
      const t = THREE.MathUtils.clamp((v.y + 0.14) / 0.3, 0, 1); // 0 at tip-bottom, 1 at bridge-top
      v.x *= 0.38 + 0.2 * (1 - t);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    noseGeo.computeVertexNormals();
  }
  addMesh('nose', noseNode, noseGeo, 'skin', [1, 1, 0.65]);

  // --- mouth (open smile) + teeth -----------------------------------------
  const mouthNode = pivot('mouth', headNode, [0, -0.30, 0.27]);
  const mouthProfile: [number, number][] = [
    [-0.17, 0.0], [-0.12, 0.05], [0.0, 0.07], [0.12, 0.05], [0.17, 0.0],
    [0.12, -0.06], [0.0, -0.08], [-0.12, -0.06],
  ];
  const mouthGeo = new THREE.ExtrudeGeometry(extrudeShape(mouthProfile), {
    depth: 0.04, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2, steps: 1,
  });
  // curve the lip band around the face: push corners back
  {
    const pos = mouthGeo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i);
      v.z -= (v.x * v.x) * 1.1;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    mouthGeo.computeVertexNormals();
  }
  addMesh('mouth', mouthNode, mouthGeo, 'skin');
  socket('socket-teeth', mouthNode, [0, 0.005, 0.04]);
  const teethNode = pivot('teeth-row', mouthNode, [0, 0.0, 0.028]);
  const teethGeo = new THREE.BoxGeometry(0.21, 0.045, 0.04, 8, 1, 1);
  {
    const pos = teethGeo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i);
      v.z -= (v.x * v.x) * 1.1; // follow the lip curve
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    teethGeo.computeVertexNormals();
  }
  addMesh('teeth-row', teethNode, teethGeo, 'teeth');

  // --- ears (occluded by hair — generic low-prominence proxies) -----------
  for (const [side, x] of [['l', 0.36], ['r', -0.36]] as const) {
    const eNode = pivot(`ear-${side}`, headNode, [x, 0.0, 0.0], [0, side === 'l' ? 12 : -12, 0]);
    const earGeo = new THREE.SphereGeometry(0.085, 16, 12);
    addMesh(`ear-${side}`, eNode, earGeo, 'skin', [0.22, 0.9, 0.55]);
  }

  // --- beard shell ---------------------------------------------------------
  // Conforming shell over the lower face: lower hemisphere, pushed to the jaw line.
  const beardNode = pivot('beard', headNode, [0, -0.12, 0.04]);
  // Band from below the cheekbones down around the chin (phi 0.58pi..0.98pi),
  // front-facing only — a jaw strap, not a face mask.
  const beardGeo = new THREE.SphereGeometry(0.385, 36, 18, 0, Math.PI * 2, Math.PI * 0.58, Math.PI * 0.4);
  {
    const pos = beardGeo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i);
      const t = THREE.MathUtils.clamp(-v.y / 0.38, 0, 1);
      v.x *= (1 - 0.2 * t * t) * 0.93;   // follow jaw taper
      v.z *= 1 - 0.06 * t;
      if (v.z < 0.02) v.z = 0.02 + (v.z - 0.02) * 0.15; // clip to the front of the jaw only
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    beardGeo.computeVertexNormals();
  }
  addMesh('beard', beardNode, beardGeo, 'beard', [0.945, 1.04, 0.94]);

  // --- hair: 12 curl clumps (repetition system hair-curl-clumps) ----------
  // Deterministic distribution over the scalp; fuller on anatomical left (+x).
  const hairNode = pivot('hair', headNode, [0, 0.10, -0.02]);
  const rand = mulberry32(0xb111);
  const clumpGeoBase = new THREE.SphereGeometry(1, 18, 14);
  // knobbly curl surface: radial hash-noise displacement, deterministic per clump.
  // The reference hair silhouette is ragged; smooth spheres read as buns.
  let clumpSeed = 7;
  function curlClumpGeo(): THREE.BufferGeometry {
    const g = clumpGeoBase.clone();
    const seed = (clumpSeed += 13);
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i);
      const n = Math.sin(v.x * 4.1 + seed) * Math.cos(v.y * 3.7 + seed * 1.7) +
        Math.sin(v.z * 4.6 + seed * 2.3) * Math.cos(v.x * 3.2 - seed);
      const amp = 1 + n * 0.13;
      pos.setXYZ(i, v.x * amp, v.y * amp, v.z * amp);
    }
    g.computeVertexNormals();
    return g;
  }
  const clumpSpecs: { theta: number; phi: number; scale: number }[] = [];
  const RING: [number, number, number][] = [
    // [azimuth deg from +z front, elevation deg from equator, base scale]
    // crown sweep (big, voluminous)
    [0, 68, 1.3], [35, 62, 1.25], [-35, 62, 1.3], [75, 60, 1.15], [-75, 58, 1.25],
    [120, 58, 1.25], [-120, 58, 1.3], [165, 62, 1.3],
    // upper sides
    [55, 38, 1.05], [-55, 36, 1.25],
    // temples down to ear level: -x (image-left, subject's right) fuller per reference
    [80, 16, 1.1], [-80, 14, 1.45],
    [105, 10, 1.0], [-105, 8, 1.2],
    // behind ears / nape sides
    [140, 18, 1.05], [-140, 16, 1.15],
    // long side falls: reference hair drops beside the face to jaw level
    [82, -4, 1.1], [-82, -6, 1.3],
    [95, -18, 1.0], [-95, -20, 1.15],
  ];
  for (const [azDeg, elDeg, s] of RING) {
    clumpSpecs.push({ theta: THREE.MathUtils.degToRad(azDeg), phi: THREE.MathUtils.degToRad(elDeg), scale: s });
  }
  const headRx = 0.36, headRy = 0.47, headRz = 0.40; // head mesh radii
  clumpSpecs.forEach((c, i) => {
    const jitter = () => (rand() - 0.5) * 0.14;
    const dirX = Math.sin(c.theta) * Math.cos(c.phi);
    const dirY = Math.sin(c.phi);
    const dirZ = Math.cos(c.theta) * Math.cos(c.phi);
    const px = dirX * headRx * 0.98;
    const py = dirY * headRy * 0.88 + 0.02;
    const pz = dirZ * headRz * 0.9;
    const cNode = pivot(`hair-clump-${i}`, hairNode, [px, py, pz], [
      (rand() - 0.5) * 30, (rand() - 0.5) * 40, (rand() - 0.5) * 30,
    ]);
    const s = c.scale * (0.9 + rand() * 0.25);
    addMesh(`hair-clump-${i}`, cNode, curlClumpGeo(), 'hair', [
      0.19 * s * (1 + jitter()), 0.15 * s * (1 + jitter()), 0.17 * s * (1 + jitter()),
    ]);
  });
  // front hairline row: brings the hairline down to ~0.34 of head height
  // (head local y ~0.2 at the forehead) and feathers it with wisps
  // fringe arc: 7 overlapping clumps across the forehead. Bottom edge lands at
  // head-local y~0.33 = the measured reference hairline (0.233 of head height incl hair).
  // hairNode sits at y 0.10, so local fringe y = 0.32 -> world 0.42.
  // clump centers computed against the head ellipsoid (radii 0.36/0.47/0.40 in headNode
  // space) so the fringe rides ON the forehead surface instead of inside it
  for (let i = 0; i < 7; i += 1) {
    const x = -0.2 + i * (0.4 / 6) + (rand() - 0.5) * 0.02;
    const yHead = 0.37 + (rand() - 0.5) * 0.02;               // hairline bottom edge ~0.27 local
    const r = Math.sqrt(Math.max(0.05, 1 - (yHead / 0.47) ** 2 - (x / 0.36) ** 2 * 0.35));
    const zHead = 0.40 * r + 0.03;                             // proud of the surface
    const fNode = pivot(`hair-front-${i}`, hairNode, [x, yHead - 0.10, zHead + 0.02], [
      (rand() - 0.5) * 30, 0, (rand() - 0.5) * 40,
    ]);
    addMesh(`hair-front-${i}`, fNode, curlClumpGeo(), 'hair', [0.11, 0.1, 0.1]);
  }
  // small wisps feather the hairline edge
  for (let i = 0; i < 4; i += 1) {
    const x = -0.18 + i * 0.12 + (rand() - 0.5) * 0.04;
    const wNode = pivot(`hair-wisp-${i}`, hairNode, [x, 0.16 + (rand() - 0.5) * 0.02, 0.28], [
      (rand() - 0.5) * 40, 0, (rand() - 0.5) * 50,
    ]);
    addMesh(`hair-wisp-${i}`, wNode, curlClumpGeo(), 'hair', [0.045, 0.035, 0.04]);
  }
  // hair-back inferred nape mass (speculative — hidden in reference)
  const hairBackNode = pivot('hair-back', headNode, [0, 0.14, -0.28]);
  addMesh('hair-back', hairBackNode, curlClumpGeo(), 'hair', [0.36, 0.34, 0.22]);

  // --- runtime -------------------------------------------------------------
  const runtime: ProceduralModelRuntime = { nodes, meshes, sockets, colliders, destructionGroups, skinTargets };
  root.userData.sculptRuntime = runtime;
  root.userData.applySkin = (skin: BillySkin) => applyBillySkin(root, skin);
  return root;
}

// ---------------------------------------------------------------------------
// skin swap API — the whole point of the shell
// ---------------------------------------------------------------------------
export function applyBillySkin(root: THREE.Group, skin: BillySkin): void {
  const runtime = root.userData.sculptRuntime as ProceduralModelRuntime | undefined;
  if (!runtime) throw new Error('applyBillySkin: root has no sculptRuntime');
  for (const [meshId, slot] of Object.entries(runtime.skinTargets)) {
    const mesh = runtime.meshes[meshId];
    const material = skin.materials[slot];
    if (mesh && material) mesh.material = material;
  }
  skin.onAttach?.(root);
  root.userData.activeSkin = skin;
}

// ---------------------------------------------------------------------------
// look-dev helpers (match lightingFromPhoto spec block)
// ---------------------------------------------------------------------------
export function createBillyPortraitBustLookDevLights(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'billy-lookdev-lights';
  // key: large soft area-ish light front-upper-left of the SUBJECT'S photo (viewer-left = -x... photo key is image-left = +x subject side flipped; use viewer-left)
  const key = new THREE.DirectionalLight(0xfff4ea, 2.6);
  key.position.set(-1.6, 2.2, 2.6);
  key.castShadow = false;
  g.add(key);
  const fill = new THREE.AmbientLight(0xf2f4f8, 0.55);
  g.add(fill);
  const rim = new THREE.DirectionalLight(0xdce8f2, 1.1);
  rim.position.set(1.2, 2.4, -2.2);
  g.add(rim);
  return g;
}

export function createBillyPortraitBustEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf5f5f5);
  const top = new THREE.Mesh(
    new THREE.SphereGeometry(10, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide }),
  );
  scene.add(top);
  const tex = pmrem.fromScene(scene, 0.04).texture;
  pmrem.dispose();
  return tex;
}

export function configureBillyPortraitBustRenderer(renderer: THREE.WebGLRenderer): void {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}
