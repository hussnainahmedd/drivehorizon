import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { VehiclePhysics } from './physics';

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const rubber = new THREE.MeshStandardMaterial({ color: 0x141719, roughness: 0.94 });
const trim = new THREE.MeshStandardMaterial({ color: 0x20282b, roughness: 0.53, metalness: 0.4 });
const chrome = new THREE.MeshStandardMaterial({ color: 0xa6adaf, roughness: 0.25, metalness: 0.85 });
const glass = new THREE.MeshStandardMaterial({ color: 0x344e58, metalness: 0.6, roughness: 0.14 });
const darkGlass = new THREE.MeshStandardMaterial({ color: 0x223942, metalness: 0.55, roughness: 0.12 });
const tireGeo = new THREE.CylinderGeometry(0.345, 0.345, 0.245, 20);
const hubGeo = new THREE.CylinderGeometry(0.225, 0.225, 0.252, 16);
const hubInnerGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.259, 12);
const trafficSurface = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.46, metalness: 0.3 });

function block(parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  const m = new THREE.Mesh(boxGeo, material); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}

function profileGeometry(width: number, profile: [number, number][]) {
  const shape = new THREE.Shape(); profile.forEach(([z, y], i) => i ? shape.lineTo(z, y) : shape.moveTo(z, y)); shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { steps: 1, depth: width, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.035, bevelThickness: 0.035 });
  const p = geo.getAttribute('position');
  for (let i = 0; i < p.count; i++) { const z = p.getX(i), y = p.getY(i), x = p.getZ(i) - width / 2; p.setXYZ(i, -x, y, z); }
  geo.computeVertexNormals(); return geo;
}

function mergeStatic(group: THREE.Group) {
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const meshes = group.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);
  for (const mesh of meshes) {
    mesh.updateMatrix(); const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone(); const geo = source.applyMatrix4(mesh.matrix);
    const material = mesh.material as THREE.Material;
    const list = buckets.get(material) || []; list.push(geo); buckets.set(material, list); group.remove(mesh);
  }
  for (const [material, geometries] of buckets) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries), material); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    geometries.forEach(g => g.dispose());
  }
}

export class CarModel {
  readonly group = new THREE.Group();
  readonly body = new THREE.Group();
  readonly wheels: THREE.Group[] = [];
  readonly frontPivots: THREE.Group[] = [];
  readonly headMaterial = new THREE.MeshStandardMaterial({ color: 0xe8e5d4, emissive: 0xffecc2, emissiveIntensity: 0.1, roughness: 0.22 });
  readonly tailMaterial = new THREE.MeshStandardMaterial({ color: 0x8b2420, emissive: 0xff2517, emissiveIntensity: 0.2, roughness: 0.28 });
  readonly paint: THREE.MeshStandardMaterial;
  private headlights: THREE.SpotLight[] = [];
  private lightTargets: THREE.Object3D[] = [];
  private damageMarks = new THREE.Group();

  constructor(color = 0x709491, player = false) {
    this.paint = new THREE.MeshStandardMaterial({ color, metalness: 0.54, roughness: 0.3 });
    this.group.add(this.body);
    const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 32;
    const sc = shadowCanvas.getContext('2d')!, gradient = sc.createRadialGradient(16, 16, 3, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(0,0,0,.6)'); gradient.addColorStop(0.55, 'rgba(0,0,0,.3)'); gradient.addColorStop(1, 'rgba(0,0,0,0)'); sc.fillStyle = gradient; sc.fillRect(0, 0, 32, 32);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 6.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false, opacity: 0.8 })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = -0.005; this.group.add(shadow);
    const shell = new THREE.Mesh(profileGeometry(1.77, [[-2.16, 0.47], [-2.17, 0.93], [-1.72, 1.07], [0.86, 1.04], [2.03, 0.85], [2.19, 0.62], [2.12, 0.45]]), this.paint);
    shell.castShadow = true; shell.receiveShadow = true; this.body.add(shell);
    const cabin = new THREE.Mesh(profileGeometry(1.55, [[-1.44, 1], [-0.97, 1.62], [0.55, 1.61], [1.17, 1.03]]), glass);
    cabin.castShadow = true; this.body.add(cabin);
    block(this.body, this.paint, 0, 1.645, -0.21, 1.59, 0.075, 1.59);
    block(this.body, this.paint, 0, 1.057, -1.62, 1.75, 0.07, 0.85);
    // Pillars, window seals, door frames, handles, and lower sill details.
    for (const side of [-1, 1]) {
      const b = block(this.body, trim, side * 0.795, 1.34, -0.25, 0.055, 0.57, 0.1);
      b.rotation.x = 0.02;
      const a = block(this.body, this.paint, side * 0.79, 1.33, 0.85, 0.06, 0.83, 0.06); a.rotation.x = -0.77;
      const c = block(this.body, this.paint, side * 0.79, 1.33, -1.205, 0.07, 0.79, 0.07); c.rotation.x = 0.62;
      block(this.body, chrome, side * 0.892, 1.048, -0.1, 0.025, 0.027, 2.85);
      block(this.body, trim, side * 0.914, 0.53, -0.1, 0.035, 0.12, 3.4);
      block(this.body, trim, side * 0.902, 0.81, -0.27, 0.012, 0.47, 0.014);
      block(this.body, chrome, side * 0.917, 0.99, 0.03, 0.028, 0.038, 0.19);
      block(this.body, chrome, side * 0.917, 0.99, -1.08, 0.028, 0.038, 0.19);
      block(this.body, trim, side * 0.977, 1.16, 0.78, 0.21, 0.08, 0.075);
      block(this.body, this.paint, side * 1.058, 1.18, 0.78, 0.2, 0.14, 0.3);
      block(this.body, darkGlass, side * 1.06, 1.18, 0.617, 0.17, 0.1, 0.01);
      // Lights wrap into the front and rear corners.
      block(this.body, this.headMaterial, side * 0.64, 0.82, 2.078, 0.44, 0.135, 0.105);
      block(this.body, this.headMaterial, side * 0.64, 0.753, 2.09, 0.44, 0.02, 0.12);
      block(this.body, this.tailMaterial, side * 0.635, 0.89, -2.17, 0.46, 0.17, 0.06);
      block(this.body, this.tailMaterial, side * 0.875, 0.89, -2.05, 0.045, 0.17, 0.27);
      block(this.body, trim, side * 0.57, 0.48, -2.19, 0.25, 0.07, 0.13);
    }
    block(this.body, trim, 0, 0.72, 2.155, 0.67, 0.23, 0.07);
    for (let y = 0; y < 4; y++) block(this.body, chrome, 0, 0.641 + y * 0.049, 2.2, 0.66, 0.012, 0.012);
    block(this.body, trim, 0, 0.52, 2.18, 1.73, 0.1, 0.06);
    block(this.body, trim, 0, 0.48, -2.2, 1.74, 0.1, 0.06);
    block(this.body, chrome, 0, 1.001, -2.157, 0.18, 0.035, 0.025);
    // Plate texture and rear-window defroster lines.
    const plateCanvas = document.createElement('canvas'); plateCanvas.width = 256; plateCanvas.height = 64;
    const ctx = plateCanvas.getContext('2d')!; ctx.fillStyle = '#e8e4d2'; ctx.fillRect(0, 0, 256, 64); ctx.fillStyle = '#233434'; ctx.font = 'bold 37px monospace'; ctx.textAlign = 'center'; ctx.fillText(player ? 'HL · 084' : 'HL · 219', 128, 45);
    const plate = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(plateCanvas), roughness: 0.6 });
    block(this.body, plate, 0, 0.71, -2.215, 0.47, 0.115, 0.016).rotation.y = Math.PI;
    block(this.body, plate, 0, 0.52, 2.216, 0.44, 0.09, 0.012);
    for (const z of [-1.4, 1.36]) for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(side * 0.884, 0.355, z); this.group.add(pivot);
      const wheel = new THREE.Group(); pivot.add(wheel); this.wheels.push(wheel);
      if (z > 0) this.frontPivots.push(pivot);
      const tire = new THREE.Mesh(tireGeo, rubber); tire.rotation.z = Math.PI / 2; tire.castShadow = true; wheel.add(tire);
      const hub = new THREE.Mesh(hubGeo, chrome); hub.rotation.z = Math.PI / 2; wheel.add(hub);
      const inner = new THREE.Mesh(hubInnerGeo, trim); inner.rotation.z = Math.PI / 2; wheel.add(inner);
      for (let i = 0; i < 5; i++) {
        const spoke = block(wheel, chrome, side * 0.132, 0, 0, 0.012, 0.042, 0.39); spoke.rotation.x = i / 5 * Math.PI;
      }
    }
    if (player) {
      for (const side of [-1, 1]) {
        const light = new THREE.SpotLight(0xffe6ba, 0, 65, 0.4, 0.65, 1.5); light.position.set(side * 0.64, 0.85, 2.1);
        const target = new THREE.Object3D(); target.position.set(side * 1.5, -0.25, 36); this.group.add(target); light.target = target;
        this.group.add(light); this.headlights.push(light); this.lightTargets.push(target);
      }
      // A restrained courier accent across the rear hatch.
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
      const c = canvas.getContext('2d')!; c.fillStyle = '#1d3939'; c.fillRect(0, 0, 512, 128); c.fillStyle = '#d5ecb4'; c.font = 'bold 39px sans-serif'; c.textAlign = 'center'; c.fillText('H A R B O R L I N E', 256, 54); c.font = '20px sans-serif'; c.fillText('C O A S T A L   C O U R I E R', 256, 94);
      const mat = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas), roughness: 0.5 });
      block(this.body, mat, 0, 0.912, -2.215, 0.69, 0.175, 0.01).rotation.y = Math.PI;
    }
    mergeStatic(this.body);
    this.wheels.forEach(mergeStatic);
    if (!player) {
      // Traffic retains silhouette/detail but bakes static material colors and wheel meshes.
      // This reduces each AI car from ~25 draw calls to 4 without affecting its collision model.
      const geometries: THREE.BufferGeometry[] = [];
      const bake = (mesh: THREE.Mesh, matrix: THREE.Matrix4) => {
        const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        source.applyMatrix4(matrix);
        const color = (mesh.material as THREE.MeshStandardMaterial).color, colors: number[] = [];
        for (let i = 0; i < source.getAttribute('position').count; i++) colors.push(color.r, color.g, color.b);
        source.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometries.push(source);
      };
      for (const object of [...this.body.children]) {
        if (!(object instanceof THREE.Mesh) || object.material === this.headMaterial || object.material === this.tailMaterial) continue;
        object.updateMatrix(); bake(object, object.matrix); this.body.remove(object);
      }
      for (const wheel of this.wheels) {
        const pivot = wheel.parent!; pivot.updateMatrix();
        for (const object of [...wheel.children]) if (object instanceof THREE.Mesh) { object.updateMatrix(); bake(object, new THREE.Matrix4().multiplyMatrices(pivot.matrix, object.matrix)); wheel.remove(object); }
      }
      const baked = new THREE.Mesh(mergeGeometries(geometries), trafficSurface); baked.castShadow = true; baked.receiveShadow = true; this.body.add(baked); geometries.forEach(g => g.dispose());
    } else {
      const scratch = new THREE.MeshStandardMaterial({ color: 0x495653, roughness: 1 });
      for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
        const mark = block(this.damageMarks, scratch, side * 0.92, 0.67 + i * 0.053, 0.35 - i * 0.12, 0.012, 0.013, 0.4 + i * 0.07); mark.rotation.x = 0.13;
      }
      this.body.add(this.damageMarks); this.damageMarks.visible = false;
    }
  }

  update(physics: VehiclePhysics, headlights: boolean, night: number) {
    this.group.position.set(physics.x, 0.055, physics.z); this.group.rotation.y = physics.heading;
    this.body.position.y = physics.heave; this.body.rotation.x = physics.pitch; this.body.rotation.z = physics.roll;
    for (const pivot of this.frontPivots) pivot.rotation.y = physics.steering;
    for (const wheel of this.wheels) wheel.rotation.x = physics.wheelAngle;
    this.tailMaterial.emissiveIntensity = physics.braking > 0.1 || physics.handbraking ? 3.5 : headlights ? 0.9 : 0.16;
    this.headMaterial.emissiveIntensity = headlights ? 3 : 0.08;
    for (const light of this.headlights) light.intensity = headlights ? 75 + night * 45 : 0;
    this.paint.roughness = 0.3 + (1 - physics.health / 100) * 0.44;
    this.damageMarks.visible = physics.health < 75;
  }

  updateTraffic(x: number, z: number, heading: number, wheel: number, braking: boolean, night: number) {
    this.group.position.set(x, 0.055, z); this.group.rotation.y = heading;
    for (const w of this.wheels) w.rotation.x = wheel;
    this.tailMaterial.emissiveIntensity = braking ? 2.7 : 0.2 + night;
    this.headMaterial.emissiveIntensity = 0.3 + night * 2;
  }
}
