import * as THREE from 'three';
import type { LevelPlan } from './plan';

/**
 * Appareillage électrique : un interrupteur et une prise près de chaque porte, des deux côtés
 * du mur, côté poignée. Posés d'après le plan, donc toujours à jour si une porte bouge.
 */
export function buildFittings(levels: LevelPlan[]): THREE.Group {
  const g = new THREE.Group();
  const plate = new THREE.MeshPhysicalMaterial({ color: '#f4f1ea', roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const key = new THREE.MeshStandardMaterial({ color: '#e6e2d9', roughness: 0.5 });
  const hole = new THREE.MeshStandardMaterial({ color: '#2a2826', roughness: 0.8 });
  const plateGeo = new THREE.BoxGeometry(0.082, 0.082, 0.01);
  const keyGeo = new THREE.BoxGeometry(0.045, 0.06, 0.006);
  const holeGeo = new THREE.CylinderGeometry(0.019, 0.019, 0.004, 16).rotateX(Math.PI / 2);

  for (const level of levels) for (const w of level.walls) {
    if (w.low) continue;
    for (const o of w.openings) {
      if (o.kind !== 'door') continue;
      // Côté poignée (la charnière est en `to`), à 15 cm du dormant ; à défaut, de l'autre côté
      const free = (a: number) =>
        a > w.from + 0.15 && a < w.to - 0.15 && !w.openings.some((q) => a > q.from - 0.1 && a < q.to + 0.1);
      const a = [o.from - 0.2, o.to + 0.2].find(free);
      if (a === undefined) continue;
      for (const side of [-1, 1]) for (const [y, socket] of [[1.1, false], [0.3, true]] as const) {
        const unit = new THREE.Group();
        unit.add(new THREE.Mesh(plateGeo, plate));
        const inner = new THREE.Mesh(socket ? holeGeo : keyGeo, socket ? hole : key);
        inner.position.z = socket ? 0.005 : 0.007;
        if (!socket) inner.rotation.x = 0.06;
        unit.add(inner);
        const p = w.at + side * 0.105;
        unit.position.set(w.axis === 'x' ? a : p, level.base + y, w.axis === 'x' ? p : a);
        unit.rotation.y = w.axis === 'x' ? (side > 0 ? 0 : Math.PI) : side * Math.PI / 2;
        g.add(unit);
      }
    }
  }
  g.traverse((o) => { o.receiveShadow = true; });
  return g;
}
