import * as THREE from 'three';

/** Switchable lightweight vertex-lit materials for integrated / software GPUs. */
export class MaterialQuality {
  private pairs = new Map<THREE.MeshStandardMaterial, THREE.MeshLambertMaterial>();
  private original = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private low = false;

  set(scene: THREE.Scene, low: boolean) {
    this.low = low;
    scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      if (!this.original.has(object)) this.original.set(object, object.material);
      const source = this.original.get(object)!;
      const convert = (m: THREE.Material) => {
        if (!(m instanceof THREE.MeshStandardMaterial) || !low) return m;
        let fast = this.pairs.get(m);
        if (!fast) {
          fast = new THREE.MeshLambertMaterial({ color: m.color, map: m.map, emissive: m.emissive, emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity, transparent: m.transparent, opacity: m.opacity, side: m.side, depthWrite: m.depthWrite, vertexColors: m.vertexColors });
          this.pairs.set(m, fast);
        }
        return fast;
      };
      object.material = Array.isArray(source) ? source.map(convert) : convert(source);
    });
  }

  update() {
    if (!this.low) return;
    for (const [source, fast] of this.pairs) { fast.emissive.copy(source.emissive); fast.emissiveIntensity = source.emissiveIntensity; fast.color.copy(source.color); }
  }
}
