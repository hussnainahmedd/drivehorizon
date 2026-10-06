import * as THREE from 'three';
import { CITY_EDGE, DEPOT, DESTINATIONS, FUEL_STATION, GARAGE, ROADS, ROAD_HALF, type Settings } from './config';
import { clamp, lerp, seededRandom, SpatialHash, type Point } from './math';
import { signalState } from './signals';

type Instance = { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry?: number; color?: number };
const box = new THREE.BoxGeometry(1, 1, 1);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 7);
const foliage = new THREE.IcosahedronGeometry(1, 1);
const dummy = new THREE.Object3D();

function material(color: number, roughness = 0.88, metalness = 0) { return new THREE.MeshStandardMaterial({ color, roughness, metalness }); }
function instances(scene: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], data: Instance[], shadows = true) {
  if (!data.length) return;
  const mesh = new THREE.InstancedMesh(geo, mat, data.length);
  data.forEach((d, i) => { dummy.position.set(d.x, d.y, d.z); dummy.rotation.set(0, d.ry || 0, 0); dummy.scale.set(d.sx, d.sy, d.sz); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); if (d.color !== undefined) mesh.setColorAt(i, new THREE.Color(d.color)); });
  mesh.castShadow = shadows; mesh.receiveShadow = true; mesh.computeBoundingSphere(); scene.add(mesh); return mesh;
}
function meshBox(parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  const mesh = new THREE.Mesh(box, mat); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function noiseTexture(color: [number, number, number], variance: number, repeat: number) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!, image = ctx.createImageData(128, 128), rand = seededRandom(901);
  for (let i = 0; i < image.data.length; i += 4) { const v = (rand() - 0.5) * variance; image.data[i] = color[0] + v; image.data[i + 1] = color[1] + v; image.data[i + 2] = color[2] + v; image.data[i + 3] = 255; }
  ctx.putImageData(image, 0, 0); const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(repeat, repeat); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
function facade(color: string, modern: boolean, seed: number) {
  const canvas = document.createElement('canvas'), glow = document.createElement('canvas'); canvas.width = glow.width = 256; canvas.height = glow.height = 512;
  const ctx = canvas.getContext('2d')!, gc = glow.getContext('2d')!, rand = seededRandom(seed);
  ctx.fillStyle = color; ctx.fillRect(0, 0, 256, 512); gc.fillStyle = '#000'; gc.fillRect(0, 0, 256, 512);
  for (let y = 0; y < 512; y += 64) {
    ctx.fillStyle = modern ? '#617171' : '#bbb7a6'; ctx.fillRect(0, y + 59, 256, modern ? 3 : 4);
    for (let x = 0; x < 256; x += 64) {
      const w = modern ? 54 : 32, h = modern ? 51 : 36, left = x + (64 - w) / 2, top = y + 8;
      ctx.fillStyle = '#404e4c'; ctx.fillRect(left - 2, top - 2, w + 4, h + 4);
      const gradient = ctx.createLinearGradient(0, top, 0, top + h); gradient.addColorStop(0, '#354b52'); gradient.addColorStop(0.5, rand() > 0.5 ? '#6f9398' : '#587278'); gradient.addColorStop(1, '#3a5258'); ctx.fillStyle = gradient; ctx.fillRect(left, top, w, h);
      ctx.fillStyle = '#9caaa2'; ctx.fillRect(left + w / 2, top, 1.5, h);
      if (!modern) { ctx.fillStyle = '#d5d0bc'; ctx.fillRect(left - 4, top + h + 2, w + 8, 4); }
      if (rand() > 0.52) { gc.fillStyle = rand() > 0.3 ? '#ffd59c' : '#b8d5dd'; gc.fillRect(left, top, w, h); gc.fillStyle = '#000'; gc.fillRect(left + w / 2, top, 2, h); }
    }
  }
  const map = new THREE.CanvasTexture(canvas), emissiveMap = new THREE.CanvasTexture(glow); map.colorSpace = emissiveMap.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map, emissiveMap, emissive: 0xffffff, emissiveIntensity: 0, roughness: modern ? 0.4 : 0.85, metalness: modern ? 0.3 : 0 });
}

export class World {
  readonly colliders = new SpatialHash();
  readonly buildingFootprints: { x: number; z: number; w: number; d: number; park?: boolean }[] = [];
  readonly group = new THREE.Group();
  readonly sun = new THREE.DirectionalLight(0xffe4ba, 3);
  readonly ambient = new THREE.HemisphereLight(0xc5e4f1, 0x68634b, 2);
  readonly sky: THREE.Mesh;
  night = 0; hour = 16.8;
  private facadeMaterials: THREE.MeshStandardMaterial[] = [];
  private lampMaterial = new THREE.MeshStandardMaterial({ color: 0xffe3b0, emissive: 0xffd89b, emissiveIntensity: 0.3 });
  private lampPools: THREE.InstancedMesh | undefined;
  private signalMats = [new THREE.MeshStandardMaterial({ color: 0x306454, emissive: 0x62ffa5 }), new THREE.MeshStandardMaterial({ color: 0x733c32, emissive: 0xff4a2e })];
  private water: THREE.Mesh;
  private skyUniforms: { [key: string]: THREE.IUniform };
  private sunDir = new THREE.Vector3();
  private skyColor = new THREE.Color();
  private warmSky = new THREE.Color(0xe4ccb0);
  private nightSky = new THREE.Color(0x152d41);
  private darkSky = new THREE.Color(0x081523);

  constructor(readonly scene: THREE.Scene) {
    scene.add(this.group, this.sun, this.sun.target, this.ambient);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -65, right: 65, top: 65, bottom: -65, near: 1, far: 240 });
    this.sun.shadow.bias = -0.00025; this.sun.shadow.normalBias = 0.14;
    this.skyUniforms = { topColor: { value: new THREE.Color(0x729daa) }, horizonColor: { value: new THREE.Color(0xe1d3ae) }, sunDirection: { value: new THREE.Vector3(-0.7, 0.4, -0.45) }, night: { value: 0 } };
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1600, 24, 16), new THREE.ShaderMaterial({ uniforms: this.skyUniforms, vertexShader: 'varying vec3 vWorld; void main(){ vWorld = (modelMatrix * vec4(position,1.0)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }', fragmentShader: `varying vec3 vWorld; uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 sunDirection; uniform float night; void main(){vec3 d=normalize(vWorld-cameraPosition); float h=sqrt(max(0.,d.y)); vec3 color=mix(horizonColor,topColor,h); float sun=max(0.,dot(d,sunDirection)); color+=vec3(1.,.68,.34)*pow(sun,28.)*.25*(1.-night); color+=vec3(1.,.9,.7)*smoothstep(.9994,.9998,sun)*(1.-night)*2.; gl_FragColor=vec4(color,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`, side: THREE.BackSide, depthWrite: false }));
    this.sky.renderOrder = -10; scene.add(this.sky); scene.fog = new THREE.Fog(0xd9d6bf, 190, 660);
    const grass = new THREE.MeshStandardMaterial({ map: noiseTexture([112, 124, 89], 18, 120), roughness: 1 });
    meshBox(this.group, grass, -260, -0.36, 220, 1120, 0.5, 1020);
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(3400, 3400, 1, 1), new THREE.MeshStandardMaterial({ color: 0x628f97, roughness: 0.37, metalness: 0.42 }));
    this.water.rotation.x = -Math.PI / 2; this.water.position.set(0, -0.45, 0); scene.add(this.water);
    this.buildRoads(); this.buildBlocks(); this.buildDetails(); this.buildCoast(); this.buildLandmarks();
  }

  private buildRoads() {
    const asphaltMap = noiseTexture([67, 73, 72], 11, 1); asphaltMap.repeat.set(9, 286); asphaltMap.anisotropy = 4;
    const asphalt = new THREE.MeshStandardMaterial({ map: asphaltMap, roughness: 0.95 });
    const roadData: Instance[] = [], lines: Instance[] = [], yellow: Instance[] = [], curbs: Instance[] = [];
    // Subdivision also makes vertex-lit headlights work on the WebGL 1 performance path.
    const surface = new THREE.PlaneGeometry(18, CITY_EDGE * 2, 6, 140); surface.rotateX(-Math.PI / 2);
    for (const r of ROADS) {
      const a = new THREE.Mesh(surface, asphalt); a.position.set(r, 0.005, 0); a.receiveShadow = true; this.group.add(a);
      const b = new THREE.Mesh(surface, asphalt); b.position.set(0, 0.009, r); b.rotation.y = Math.PI / 2; b.receiveShadow = true; this.group.add(b);
      for (let t = -280; t < 281; t += 10) {
        if (ROADS.some(j => Math.abs(t - j) < 14)) continue;
        for (const s of [-1, 1]) {
          yellow.push({ x: r + s * 0.16, y: 0.026, z: t, sx: 0.09, sy: 0.018, sz: 5.6 });
          yellow.push({ x: t, y: 0.026, z: r + s * 0.16, sx: 5.6, sy: 0.018, sz: 0.09 });
          lines.push({ x: r + s * 7.95, y: 0.03, z: t, sx: 0.12, sy: 0.02, sz: 8 });
          lines.push({ x: t, y: 0.03, z: r + s * 7.95, sx: 8, sy: 0.02, sz: 0.12 });
        }
      }
      for (let i = 0; i < 4; i++) {
        const mid = (ROADS[i] + ROADS[i + 1]) / 2;
        for (const s of [-1, 1]) {
          curbs.push({ x: r + s * 9.25, y: 0.09, z: mid, sx: 0.4, sy: 0.18, sz: 99 });
          curbs.push({ x: mid, y: 0.09, z: r + s * 9.25, sx: 99, sy: 0.18, sz: 0.4 });
        }
      }
    }
    for (const x of ROADS) for (const z of ROADS) {
      for (const s of [-1, 1]) {
        for (let stripe = -7; stripe <= 7; stripe += 2) {
          lines.push({ x: x + stripe, y: 0.025, z: z + s * 12, sx: 0.95, sy: 0.015, sz: 3.4 });
          lines.push({ x: x + s * 12, y: 0.025, z: z + stripe, sx: 3.4, sy: 0.015, sz: 0.95 });
        }
        lines.push({ x: x + s * 4.5, y: 0.027, z: z - s * 15, sx: 6.8, sy: 0.018, sz: 0.28 });
        lines.push({ x: x + s * 15, y: 0.027, z: z + s * 4.5, sx: 0.28, sy: 0.018, sz: 6.8 });
      }
    }
    instances(this.group, box, material(0xd5d0b7), lines, false);
    instances(this.group, box, material(0xc7ac69), yellow, false);
    instances(this.group, box, material(0xc3c0af), curbs);
    instances(this.group, box, asphalt, roadData, false);
  }

  private buildBlocks() {
    const rand = seededRandom(7721), palette = ['#c4b59d', '#b4b8aa', '#ad9c85', '#c7c2af', '#8d9e9b', '#a9b7b4', '#bca38c', '#819398'];
    this.facadeMaterials = palette.map((p, i) => facade(p, i === 4 || i === 7, 312 + i));
    const batches: Instance[][] = palette.map(() => []), rooftops: Instance[] = [], ac: Instance[] = [], sidewalks: Instance[] = [], garden: Instance[] = [], foundations: Instance[] = [], shopfronts: Instance[] = [], awnings: Instance[] = [], doors: Instance[] = [];
    const trees: Point[] = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const cx = ROADS[i] + 60, cz = ROADS[j] + 60;
      sidewalks.push({ x: cx, y: 0.09, z: cz, sx: 101, sy: 0.17, sz: 101 });
      garden.push({ x: cx, y: 0.185, z: cz, sx: 88, sy: 0.05, sz: 88 });
      const park = i === 1 && j === 2;
      if (park) {
        this.buildingFootprints.push({ x: cx, z: cz, w: 92, d: 92, park: true });
        sidewalks.push({ x: cx, y: 0.22, z: cz, sx: 5, sy: 0.08, sz: 94 });
        sidewalks.push({ x: cx, y: 0.22, z: cz, sx: 94, sy: 0.08, sz: 5 });
        for (let t = 0; t < 20; t++) trees.push({ x: cx + (rand() - 0.5) * 82, z: cz + (rand() - 0.5) * 82 });
        const fountain = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.65, 32), material(0xcac4ad)); fountain.position.set(cx, 0.5, cz); this.group.add(fountain);
        const water = new THREE.Mesh(new THREE.CylinderGeometry(8.3, 8.3, 0.1, 32), material(0x78a3a1, 0.24, 0.2)); water.position.set(cx, 0.84, cz); this.group.add(water);
        meshBox(this.group, material(0xe2d6bb), cx, 2.5, cz, 1.1, 4, 1.1);
        this.colliders.add({ x: cx, z: cz, halfX: 9, halfZ: 9, kind: 'barrier' });
        continue;
      }
      const positions = [[-31, -32], [0, -33], [31, -32], [-32, 0], [32, 0], [-31, 32], [0, 33], [31, 32]];
      positions.forEach(([px, pz], index) => {
        const x = cx + px, z = cz + pz;
        // Open lots for the dispatch yard and the two service forecourts.
        if ((i === 1 && j === 0 && px > 20) || (i === 3 && j === 1 && px < -20 && pz >= 0) || (i === 0 && j === 1 && px > 20 && pz >= 0)) return;
        const w = 22 + rand() * 5, d = 21 + rand() * 6;
        const downtown = i === 2 && (j === 1 || j === 2);
        const h = downtown ? 20 + rand() * 32 : 8.4 + Math.floor(rand() * 4) * 3.5;
        const style = downtown && index % 3 === 0 ? 7 : Math.floor(rand() * palette.length);
        batches[style].push({ x, y: h / 2 + 0.25, z, sx: w, sy: h, sz: d });
        foundations.push({ x, y: 0.51, z, sx: w + 0.35, sy: 0.6, sz: d + 0.35 });
        rooftops.push({ x, y: h + 0.42, z, sx: w + 0.65, sy: 0.35, sz: d + 0.65 });
        rooftops.push({ x, y: h + 0.67, z, sx: w - 1, sy: 0.14, sz: d - 1 });
        ac.push({ x: x + 3, y: h + 1.3, z, sx: 3, sy: 1.2, sz: 3.5 });
        ac.push({ x: x - 4, y: h + 1, z: z + 2, sx: 2.3, sy: 0.7, sz: 2 });
        const frontage = [0x6d8068, 0x9c7960, 0x789294, 0x9d9878][(i + j + index) % 4];
        if (Math.abs(pz) > 20) {
          const front = z + Math.sign(pz) * (d / 2 + 0.05);
          shopfronts.push({ x, y: 1.6, z: front, sx: w - 2.3, sy: 2.5, sz: 0.08 });
          awnings.push({ x, y: 3.02, z: front + Math.sign(pz) * 0.4, sx: w - 1, sy: 0.2, sz: 1.3, color: frontage });
          doors.push({ x, y: 1.57, z: front + Math.sign(pz) * 0.07, sx: 0.1, sy: 2.5, sz: 0.12 });
          doors.push({ x: x + 2, y: 1.57, z: front + Math.sign(pz) * 0.07, sx: 0.1, sy: 2.5, sz: 0.12 });
        } else {
          const front = x + Math.sign(px) * (w / 2 + 0.05);
          shopfronts.push({ x: front, y: 1.6, z, sx: 0.08, sy: 2.5, sz: d - 2.3 });
          awnings.push({ x: front + Math.sign(px) * 0.4, y: 3.02, z, sx: 1.3, sy: 0.2, sz: d - 1, color: frontage });
          doors.push({ x: front + Math.sign(px) * 0.07, y: 1.57, z, sx: 0.12, sy: 2.5, sz: 0.1 });
          doors.push({ x: front + Math.sign(px) * 0.07, y: 1.57, z: z + 2, sx: 0.12, sy: 2.5, sz: 0.1 });
        }
        this.colliders.add({ x, z, halfX: w / 2 + 0.15, halfZ: d / 2 + 0.15, kind: 'building' });
        this.buildingFootprints.push({ x, z, w, d });
      });
      for (const sign of [-1, 1]) for (const off of [-14, 14]) {
        trees.push({ x: cx + sign * 47, z: cz + off }); trees.push({ x: cx + off, z: cz + sign * 47 });
      }
    }
    instances(this.group, box, material(0xb8b7a8), sidewalks);
    instances(this.group, box, material(0x83936b), garden, false);
    const roofMat = material(0x8e938b);
    batches.forEach((data, i) => instances(this.group, box, [this.facadeMaterials[i], this.facadeMaterials[i], roofMat, roofMat, this.facadeMaterials[i], this.facadeMaterials[i]], data));
    instances(this.group, box, material(0xc6c1af), rooftops);
    instances(this.group, box, material(0x9b9f99, 0.7, 0.25), ac);
    instances(this.group, box, material(0x9b9c90), foundations);
    instances(this.group, box, material(0x304e52, 0.23, 0.4), shopfronts);
    instances(this.group, box, material(0xffffff), awnings);
    instances(this.group, box, material(0xb2b2a0, 0.5, 0.4), doors);
    this.addTrees(trees, rand);
  }

  private addTrees(points: Point[], rand: () => number) {
    const trunks: Instance[] = [], crowns: Instance[] = [], beds: Instance[] = [];
    const greens = [0x758c5a, 0x607950, 0x839666, 0x78905e];
    for (const { x, z } of points) {
      const height = 4.5 + rand() * 2.5, size = 2.1 + rand();
      trunks.push({ x, y: height / 2, z, sx: 0.22, sy: height, sz: 0.22 });
      crowns.push({ x, y: height + 0.5, z, sx: size, sy: size * 1.2, sz: size, ry: rand() * 6, color: greens[Math.floor(rand() * greens.length)] });
      crowns.push({ x: x + 1, y: height + 0.2, z: z + 0.6, sx: size * 0.7, sy: size * 0.8, sz: size * 0.75, color: greens[Math.floor(rand() * greens.length)] });
      beds.push({ x, y: 0.19, z, sx: 2.8, sy: 0.16, sz: 2.8 });
      this.colliders.add({ x, z, halfX: 0.32, halfZ: 0.32, kind: 'tree' });
    }
    instances(this.group, cylinder, material(0x6e6652), trunks);
    const leafMaterial = material(0xffffff); leafMaterial.map = noiseTexture([225, 235, 210], 42, 3);
    instances(this.group, foliage, leafMaterial, crowns);
    instances(this.group, box, material(0x9f9d8e), beds);
  }

  private buildDetails() {
    const poles: Instance[] = [], arms: Instance[] = [], bulbs: Instance[] = [], pools: Instance[] = [], benches: Instance[] = [], bollards: Instance[] = [], signalBoxes: Instance[] = [], signalA: Instance[] = [], signalB: Instance[] = [];
    for (const r of ROADS) for (let t = -266; t <= 266; t += 48) {
      if (ROADS.some(v => Math.abs(t - v) < 17)) continue;
      for (const side of [-1, 1]) {
        poles.push({ x: r + side * 10.7, y: 3.9, z: t, sx: 0.115, sy: 7.8, sz: 0.115 });
        arms.push({ x: r + side * 9.3, y: 7.78, z: t, sx: 3, sy: 0.1, sz: 0.12 });
        bulbs.push({ x: r + side * 7.9, y: 7.7, z: t, sx: 0.9, sy: 0.09, sz: 0.4 });
        pools.push({ x: r + side * 5.8, y: 0.05, z: t, sx: 11, sy: 11, sz: 1, ry: 0 });
        poles.push({ x: t, y: 3.9, z: r + side * 10.7, sx: 0.115, sy: 7.8, sz: 0.115 });
        arms.push({ x: t, y: 7.78, z: r + side * 9.3, sx: 0.12, sy: 0.1, sz: 3 });
        bulbs.push({ x: t, y: 7.7, z: r + side * 7.9, sx: 0.4, sy: 0.09, sz: 0.9 });
        pools.push({ x: t, y: 0.05, z: r + side * 5.8, sx: 11, sy: 11, sz: 1 });
      }
    }
    for (const x of ROADS) for (const z of ROADS) {
      for (const side of [-1, 1]) {
        poles.push({ x: x + side * 10.5, y: 2.5, z: z - side * 10.5, sx: 0.1, sy: 5, sz: 0.1 });
        signalBoxes.push({ x: x + side * 10.5, y: 4.5, z: z - side * 10.5, sx: 0.42, sy: 1.08, sz: 0.32 });
        signalA.push({ x: x + side * 10.5, y: 4.32, z: z - side * 10.5 + side * 0.18, sx: 0.24, sy: 0.25, sz: 0.045 });
        signalB.push({ x: x + side * 10.7, y: 4.65, z: z - side * 10.5, sx: 0.045, sy: 0.25, sz: 0.24 });
      }
    }
    for (let z = -258; z < 270; z += 30) {
      benches.push({ x: 270, y: 0.7, z, sx: 1.1, sy: 0.18, sz: 2.8 });
      benches.push({ x: 270.45, y: 1.13, z, sx: 0.15, sy: 0.75, sz: 2.8 });
      bollards.push({ x: 281, y: 0.55, z, sx: 0.24, sy: 1.1, sz: 0.24 });
    }
    instances(this.group, cylinder, material(0x414e4b, 0.6, 0.5), poles);
    instances(this.group, box, material(0x414e4b, 0.6, 0.5), arms);
    instances(this.group, box, this.lampMaterial, bulbs, false);
    instances(this.group, box, material(0x77755e), benches);
    instances(this.group, cylinder, material(0x3c4945), bollards);
    instances(this.group, box, material(0x27332f), signalBoxes);
    instances(this.group, box, this.signalMats[0], signalA, false);
    instances(this.group, box, this.signalMats[1], signalB, false);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64; const c = canvas.getContext('2d')!;
    const gradient = c.createRadialGradient(32, 32, 0, 32, 32, 32); gradient.addColorStop(0, 'rgba(255,215,147,.35)'); gradient.addColorStop(0.4, 'rgba(255,215,147,.18)'); gradient.addColorStop(1, 'rgba(255,215,147,0)'); c.fillStyle = gradient; c.fillRect(0, 0, 64, 64);
    const poolGeo = new THREE.PlaneGeometry(1, 1); poolGeo.rotateX(-Math.PI / 2);
    // Plane lies in XZ, so instance scaling must use X and Z.
    pools.forEach(p => { p.sz = p.sy; p.sy = 1; });
    this.lampPools = instances(this.group, poolGeo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }), pools, false);
  }

  private buildCoast() {
    const rand = seededRandom(812), rail: Instance[] = [], coastMat = material(0xb6b2a0);
    meshBox(this.group, coastMat, 277, 0.1, 0, 16, 0.22, 574);
    meshBox(this.group, coastMat, 0, 0.05, -279, 560, 0.15, 14);
    meshBox(this.group, material(0x969c91), 287, -1.2, 0, 2, 3, 577);
    for (let z = -284; z < 286; z += 8) rail.push({ x: 285, y: 0.6, z, sx: 0.12, sy: 1.2, sz: 0.12 });
    rail.push({ x: 285, y: 1.05, z: 0, sx: 0.1, sy: 0.09, sz: 570 });
    rail.push({ x: 285, y: 0.5, z: 0, sx: 0.06, sy: 0.06, sz: 570 });
    instances(this.group, box, material(0x778b86, 0.5, 0.4), rail);
    const mountains: Instance[] = [];
    for (let i = 0; i < 34; i++) { const a = i / 34 * Math.PI * 1.4 + Math.PI * 0.35; const d = 640 + rand() * 300; mountains.push({ x: Math.cos(a) * d - 150, y: 24 + rand() * 40, z: Math.sin(a) * d + 120, sx: 95 + rand() * 170, sy: 80 + rand() * 160, sz: 100 + rand() * 140, ry: rand() * 5 }); }
    instances(this.group, new THREE.ConeGeometry(1, 1, 6), material(0x7c9689), mountains, false);
    // Working port, container stacks, piers, and two silhouettes of harbor cranes.
    const containers: Instance[] = [];
    for (let i = 0; i < 24; i++) containers.push({ x: -228 + Math.floor(i / 6) * 18, y: 1.5 + (i % 2) * 2.6, z: -310 - Math.floor(i % 6 / 2) * 7, sx: 12, sy: 2.6, sz: 4.7, color: [0x7f9690, 0xb49174, 0x7d969e, 0xa4a491][i % 4] });
    meshBox(this.group, material(0x9c9c8b), -180, -0.16, -326, 175, 0.6, 78);
    instances(this.group, box, material(0xffffff), containers);
    for (const x of [-234, -144]) {
      const crane = material(0xaba381, 0.7, 0.25);
      for (const side of [-1, 1]) meshBox(this.group, crane, x + side * 7, 17, -340, 1.6, 34, 1.6);
      meshBox(this.group, crane, x, 33, -351, 18, 1.8, 52);
      meshBox(this.group, material(0x3b4a49), x, 20, -372, 0.1, 25, 0.1);
      const brace = meshBox(this.group, crane, x, 19, -340, 1.1, 31, 1.1); brace.rotation.z = 0.4;
    }
    // A few small sailboats just off the eastern boardwalk.
    for (let i = 0; i < 5; i++) {
      const boat = new THREE.Group(); boat.position.set(340 + rand() * 150, 0, -240 + i * 115); boat.rotation.y = rand() * 2;
      const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), material(0xd8d8c8)); hull.scale.set(1.6, 0.6, 4.5); boat.add(hull);
      meshBox(boat, material(0x6f7a73), 0, 4.5, 0, 0.09, 9, 0.09);
      const sail = new THREE.BufferGeometry(); sail.setAttribute('position', new THREE.Float32BufferAttribute([0, 1, 0, 0, 8.5, 0, 0, 1, 3.4], 3)); sail.computeVertexNormals(); boat.add(new THREE.Mesh(sail, new THREE.MeshStandardMaterial({ color: 0xe5dfc7, side: THREE.DoubleSide, roughness: 1 }))); this.group.add(boat);
    }
  }

  private sign(text: string, sub: string, x: number, y: number, z: number, rotation: number, width: number, bg = '#243d39') {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256; const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 1024, 256); ctx.strokeStyle = '#cbdab0'; ctx.lineWidth = 3; ctx.strokeRect(14, 14, 996, 228);
    ctx.fillStyle = '#f1eedb'; ctx.textAlign = 'center'; ctx.font = '600 76px sans-serif'; ctx.fillText(text, 512, 125); ctx.font = '28px sans-serif'; ctx.fillStyle = '#cad5b8'; ctx.fillText(sub, 512, 191);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: 0.14, roughness: 0.7 })); mesh.position.set(x, y, z); mesh.rotation.y = rotation; this.group.add(mesh);
    return mesh;
  }

  private buildLandmarks() {
    const concrete = material(0xb3b6a4), mint = material(0x506e60), roof = material(0x546a62, 0.7, 0.2), yellow = material(0xe4dbaa);
    // The waterfront hotel and harbor warehouse anchor the outer streets.
    meshBox(this.group, this.facadeMaterials[3], 260, 7.3, 183, 22, 14.4, 35);
    meshBox(this.group, roof, 260, 14.7, 183, 23, 0.35, 36);
    this.colliders.add({ x: 260, z: 183, halfX: 11, halfZ: 17.5, kind: 'building' });
    this.buildingFootprints.push({ x: 260, z: 183, w: 22, d: 35 });
    meshBox(this.group, this.facadeMaterials[1], -263, 3.8, -179, 21, 7.4, 35);
    meshBox(this.group, roof, -263, 7.6, -179, 22, 0.3, 36);
    this.colliders.add({ x: -263, z: -179, halfX: 10.5, halfZ: 17.5, kind: 'building' });
    this.buildingFootprints.push({ x: -263, z: -179, w: 21, d: 35 });
    // Dispatch depot opens directly onto Harbor Boulevard.
    meshBox(this.group, concrete, -27, 0.19, -188, 31, 0.2, 62);
    meshBox(this.group, mint, -37, 3.3, -190, 10, 6.4, 43);
    meshBox(this.group, roof, -30, 6.52, -188, 25, 0.3, 49);
    for (const z of [-211, -166]) meshBox(this.group, roof, -18, 3.3, z, 0.23, 6.5, 0.23);
    this.sign('HARBORLINE', 'DISPATCH  /  SOUTH QUAY', -17.7, 5.65, -188, Math.PI / 2, 16);
    this.colliders.add({ x: -37, z: -190, halfX: 5, halfZ: 21.5, kind: 'building' });
    this.buildingFootprints.push({ x: -37, z: -190, w: 10, d: 43 });
    for (let i = 0; i < 5; i++) meshBox(this.group, yellow, -25, 0.31, -211 + i * 10, 13, 0.025, 0.13);
    const boxMat = material(0xb99e72);
    for (let i = 0; i < 9; i++) meshBox(this.group, boxMat, -32 + (i % 3) * 1.1, 0.65 + Math.floor(i / 6) * 0.9, -173 + Math.floor(i / 3) % 2 * 1.1, 0.9, 0.9, 0.9);
    // Service forecourts: broad drive-in access, no invisible triggers.
    for (const [p, isFuel] of [[FUEL_STATION, true], [GARAGE, false]] as const) {
      const side = isFuel ? 1 : -1;
      meshBox(this.group, concrete, p.x + side * 2, 0.14, p.z, 32, 0.22, 42);
      meshBox(this.group, isFuel ? material(0xd0bc90) : mint, p.x + side * 13, 2.7, p.z + 8, 8, 5.2, 21);
      this.colliders.add({ x: p.x + side * 13, z: p.z + 8, halfX: 4, halfZ: 10.5, kind: 'building' });
      this.buildingFootprints.push({ x: p.x + side * 13, z: p.z + 8, w: 8, d: 21 });
      meshBox(this.group, roof, p.x, 5.5, p.z - 4, 18, 0.32, 23);
      this.sign(isFuel ? 'TIDAL' : 'QUAYSIDE', isFuel ? 'FUEL  /  OPEN 24 HOURS' : 'MOTOR WORKS  /  REPAIR', p.x - side * 9.1, 4.8, p.z - 4, -side * Math.PI / 2, 12);
      for (const dz of [-13, 5]) meshBox(this.group, roof, p.x + side * 6, 2.75, p.z + dz, 0.22, 5.5, 0.22);
      if (isFuel) for (const dz of [-9, 2]) {
        meshBox(this.group, material(0xd8d7c0), p.x + 4, 1.05, p.z + dz, 0.9, 1.9, 1.2);
        meshBox(this.group, mint, p.x + 3.51, 1.45, p.z + dz, 0.02, 0.45, 0.65);
        this.colliders.add({ x: p.x + 4, z: p.z + dz, halfX: 0.5, halfZ: 0.6, kind: 'barrier' });
      }
    }
    // Named storefronts are visible from their actual delivery bays.
    const signs = [
      ['SUNDAY', 'COFFEE & SLOW MORNINGS', -15, 4.2, -61, Math.PI / 2, 10, '#826649'],
      ['THE FOUNDRY', 'OBJECTS  /  DESIGN  /  STUDIO', 182, 4.3, -15, 0, 12, '#4c5d59'],
      ['BOTANICAL HOUSE', 'FLOWERS FOR THE EVERYDAY', -135, 4.3, 176, Math.PI / 2, 12, '#516649'],
      ['SEABROOK', 'A HOTEL BY THE WATER', 248.9, 4.3, 183, -Math.PI / 2, 12, '#687f7c'],
      ['NORTHSIDE', 'RECORDS  /  GOOD COMPANY', -183, 4.2, 135, Math.PI, 10, '#865f47'],
      ['PIER 09', 'WAREHOUSE  /  MARINE SUPPLY', -251, 4.2, -179, Math.PI / 2, 12, '#5c716a'],
    ] as const;
    for (const [name, sub, x, y, z, rot, w, bg] of signs) {
      const isX = Math.abs(Math.sin(rot)) > 0.5;
      meshBox(this.group, roof, x, y - 1.3, z, isX ? 1.6 : w + 1, 0.17, isX ? w + 1 : 1.6);
      this.sign(name, sub, x, y, z, rot, w, bg);
    }
    // Curbside loading bays make stops legible at ground level.
    const bays: Instance[] = [];
    for (const p of [DEPOT, ...DESTINATIONS]) {
      const vertical = Math.abs(p.x % 120) < 10;
      for (const s of [-1, 1]) bays.push({ x: p.x + (vertical ? s * 2.3 : 0), y: 0.035, z: p.z + (vertical ? 0 : s * 2.3), sx: vertical ? 0.12 : 10, sy: 0.02, sz: vertical ? 10 : 0.12 });
    }
    instances(this.group, box, material(0xb9d997), bays, false);
  }

  update(dt: number, focus: Point, settings: Settings, elapsed: number, savedHour?: number) {
    if (settings.timeMode === 'cycle') this.hour = savedHour ?? (this.hour + dt * 24 / 1800) % 24;
    else this.hour = settings.timeMode === 'day' ? 12 : settings.timeMode === 'night' ? 22 : 17.6;
    const angle = (this.hour - 6) / 24 * Math.PI * 2;
    const elevation = Math.sin(angle);
    this.night = 1 - clamp((elevation + 0.08) / 0.35, 0, 1);
    const warmth = 1 - clamp(elevation / 0.8, 0, 1);
    this.sunDir.set(-Math.cos(angle) * 0.85, Math.max(0.09, elevation), -0.45).normalize();
    this.sun.position.set(focus.x + this.sunDir.x * 120, this.sunDir.y * 120, focus.z + this.sunDir.z * 120);
    this.sun.target.position.set(focus.x, 0, focus.z);
    this.sun.intensity = lerp(2.7, 0, this.night);
    this.sun.color.setRGB(1, 0.96 - warmth * 0.15, 0.88 - warmth * 0.22);
    this.ambient.intensity = lerp(1.8, 0.72, this.night);
    this.ambient.color.setHex(this.night > 0.7 ? 0x7999bb : 0xc6e0e5);
    this.skyColor.set(0xbacfd0).lerp(this.warmSky, warmth * 0.6).lerp(this.nightSky, this.night);
    (this.scene.fog as THREE.Fog).color.copy(this.skyColor);
    this.skyUniforms.topColor.value.set(0x759fae).lerp(this.darkSky, this.night);
    this.skyUniforms.horizonColor.value.copy(this.skyColor);
    this.skyUniforms.sunDirection.value.copy(this.sunDir); this.skyUniforms.night.value = this.night;
    this.sky.position.set(focus.x, 0, focus.z);
    for (const m of this.facadeMaterials) m.emissiveIntensity = this.night * 0.85;
    this.lampMaterial.emissiveIntensity = 0.15 + this.night * 3.5;
    if (this.lampPools) (this.lampPools.material as THREE.MeshBasicMaterial).opacity = this.night * 0.85;
    const signalColors = { green: 0x62ffa5, amber: 0xffc65e, red: 0xff4a2e };
    this.signalMats[0].emissive.setHex(signalColors[signalState(elapsed, true)]);
    this.signalMats[1].emissive.setHex(signalColors[signalState(elapsed, false)]);
    this.signalMats.forEach(m => m.emissiveIntensity = 1.7);
    this.water.position.y = -0.45 + Math.sin(elapsed * 0.3) * 0.025;
  }
}
