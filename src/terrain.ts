import type { Rect } from './builders';
import { ETAGE, STAIR } from './plan';

/**
 * Sol praticable de la visite à pied : les deux niveaux et l'escalier qui les relie
 * (volée ouest montante, palier au sud, volée est jusqu'au palier de l'étage).
 */
export interface Terrain {
  /** Hauteur du sol sous (x, z) pour qui se tient à la hauteur `from` ; null si l'on ne peut y poser le pied. */
  height(x: number, z: number, from: number): number | null;
  /** Obstacles à contourner à cette hauteur. */
  colliders(y: number): Rect[];
  /** Niveau (0 : rez-de-chaussée, 1 : étage) à cette hauteur. */
  level(y: number): number;
}

const RISE = 0.17, RUN = 0.28;
const STEP = 0.4; // dénivelé franchissable d'un pas
const MID = -1.3; // séparation des deux volées
const TURN = STAIR.z1 + 10 * RUN; // début du palier intermédiaire
const HALF = 11 * RISE; // hauteur de ce palier

function stairHeight(x: number, z: number) {
  if (z >= TURN) return HALF;
  if (x < MID) return ((z - STAIR.z1) / RUN) * RISE; // première volée, vers le sud
  return Math.min(ETAGE.base, HALF + ((TURN - z) / RUN) * RISE); // seconde volée, vers le nord
}

export function makeTerrain(rdc: Rect[], etage: Rect[]): Terrain {
  // Au rez-de-chaussée, l'escalier n'est plus un obstacle plein : on le gravit.
  const ground = rdc.filter((c) => !(c.x1 === STAIR.x1 && c.z1 === STAIR.z1 && c.x2 === STAIR.x2 && c.z2 === STAIR.z2));
  const level = (y: number) => (y > (HALF + ETAGE.base) / 2 ? 1 : 0);
  return {
    level,
    colliders: (y) => (level(y) ? etage : ground),
    height(x, z, from) {
      const onStairs = x > STAIR.x1 && x < STAIR.x2 && z > STAIR.z1 && z < STAIR.z2;
      const h = onStairs ? stairHeight(x, z) : Math.abs(from) < Math.abs(from - ETAGE.base) ? 0 : ETAGE.base;
      return Math.abs(h - from) <= STEP ? h : null;
    },
  };
}
