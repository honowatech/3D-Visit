import type { Opening, Rect } from './builders';

/**
 * Relevé des deux niveaux d'après les plans de l'architecte (cotes déduites des surfaces indiquées).
 * Repère : origine à l'angle nord-ouest du séjour du rez-de-chaussée, x vers l'est, z vers le sud.
 * Les murs sont donnés par leur axe ; hauteurs des ouvertures relatives au sol du niveau.
 */

export interface PlanWall {
  axis: 'x' | 'z';
  at: number;
  from: number;
  to: number;
  openings: Opening[];
  low?: number; // garde-corps : hauteur réduite
}

export interface RoomLabel { name: string; area?: string; x: number; z: number }

export interface LevelPlan {
  name: string;
  base: number; // niveau du sol fini
  top: number; // dessus des murs
  walls: PlanWall[];
  floors: Rect[]; // surfaces carrelées (rectangles disjoints)
  labels: RoomLabel[];
}

const win = (from: number, to: number, sill = 0.9, head = 2.45): Opening => ({ from, to, sill, head, kind: 'window' });
const small = (from: number, to: number): Opening => win(from, to, 1.5, 2.1);
const door = (from: number, to: number): Opening => ({ from, to, sill: 0, head: 2.1, kind: 'door' });
const pass = (from: number, to: number, head = 2.3): Opening => ({ from, to, sill: 0, head, kind: 'passage' });

/** Mur courant le long de x (à z = at) ou le long de z (à x = at). */
const X = (at: number, from: number, to: number, ...openings: Opening[]): PlanWall => ({ axis: 'x', at, from, to, openings });
const Z = (at: number, from: number, to: number, ...openings: Opening[]): PlanWall => ({ axis: 'z', at, from, to, openings });
const r = (x1: number, z1: number, x2: number, z2: number): Rect => ({ x1, z1, x2, z2 });

export const SEJOUR = { w: 4.72, d: 5.33, h: 3.1 };
export const SLAB = 0.3;
export const STAIR = { x1: -2.6, x2: 0, z1: 1.9, z2: 5.9 };

export const RDC: LevelPlan = {
  name: 'Rez-de-chaussée',
  base: 0,
  top: 3.1,
  walls: [
    // Façades
    X(-5.82, -8.55, 1.22, win(-7.0, -5.4), win(-1.3, 0.3, 1.05, 2.3)),
    X(-4.05, 1.22, 4.82),
    X(4.24, -8.0, -4.38, win(-7.3, -5.0)),
    X(3.31, -4.38, -2.7, { ...door(-4.1, -3.0), open: -1 }),
    X(6.0, -2.7, -0.1),
    X(5.43, -0.1, 4.82, win(1.04, 3.68)),
    Z(-8.55, -5.82, -0.1, small(-2.25, -1.65), small(-0.95, -0.4)),
    Z(-8.0, -0.1, 4.24),
    Z(-4.38, 3.31, 4.24),
    Z(4.82, -4.05, 5.43, win(-3.0, -1.1), win(1.2, 4.0)),
    // Refends et cloisons
    X(-0.1, -8.55, 1.22, pass(-4.15, -3.0)),
    X(-2.67, -8.55, -4.38, { ...door(-5.4, -4.6), open: -1 }),
    X(-1.25, -8.55, -5.8),
    X(-1.73, -4.38, -2.7),
    Z(-5.8, -2.67, -0.1, { ...door(-2.4, -1.6), open: -1 }, { ...door(-1.0, -0.3), open: -1 }),
    Z(-4.38, -5.82, -1.73),
    Z(-4.38, -0.1, 3.31, { ...door(0.6, 1.5), open: -1 }),
    Z(-2.7, -5.82, 6.0, pass(-2.6, -1.9, 2.1), { ...door(-1.45, -0.65), open: 1 }, pass(0.2, 1.7)),
    Z(-0.1, 2.0, 6.0),
    Z(1.22, -5.82, -0.1, { ...door(-5.0, -4.2), open: 1 }, { ...door(-1.4, -0.5), open: -1 }),
  ],
  floors: [
    r(-8.65, -5.92, 1.32, -0.1),
    r(1.32, -5.92, 4.92, -0.1),
    r(-8.1, -0.1, 4.92, 5.53),
    r(-8.1, 5.53, 0, 6.1),
  ],
  labels: [
    { name: 'Séjour', area: '24,8', x: 2.36, z: 3.0 },
    { name: 'Salle à manger', area: '14,1', x: 3.0, z: -2.0 },
    { name: 'Cuisine', area: '21,5', x: -0.7, z: -3.2 },
    { name: 'Réserve', area: '6,3', x: -3.55, z: -4.0 },
    { name: "Chambre d'amis", area: '12,7', x: -6.5, z: -4.3 },
    { name: "Salle d'eau", area: '3,4', x: -7.2, z: -1.95 },
    { name: 'WC', area: '2,7', x: -7.2, z: -0.65 },
    { name: "Salle d'étude", area: '13,7', x: -6.2, z: 2.0 },
    { name: 'Hall', area: '4,7', x: -3.55, z: 1.7 },
    { name: 'Escalier', x: -1.3, z: 3.9 },
    { name: 'Terrasse', area: '11,2', x: -5.6, z: 5.2 },
    { name: 'Terrasse cuisine', area: '6,3', x: 3.0, z: -5.0 },
  ],
};

export const ETAGE: LevelPlan = {
  name: 'Étage',
  base: RDC.top + SLAB,
  top: RDC.top + SLAB + 3.0,
  walls: [
    // Façades
    X(-6.05, -9.73, -4.25, win(-7.3, -5.9)),
    X(-7.0, -4.25, -1.27, small(-3.9, -3.3), small(-2.3, -1.7)),
    X(-6.05, -1.27, 6.02, win(-0.9, 0.5), win(2.7, 4.3)),
    X(4.0, -8.18, -2.7, win(-7.6, -4.3, 0.4, 2.45), door(-3.75, -2.95)),
    X(5.43, -0.1, 4.82, win(1.0, 3.7)),
    X(6.0, -2.7, -0.1),
    Z(-9.73, -6.05, -0.1, small(-1.8, -1.2)),
    Z(-8.18, -0.1, 4.0),
    Z(4.82, -0.1, 5.43, win(1.0, 3.3)),
    Z(6.02, -6.05, -0.1, win(-4.9, -3.0), small(-1.05, -0.5)),
    // Refends et cloisons
    X(-4.05, -4.25, -1.27, { ...door(-4.0, -3.25), open: -1 }),
    X(-2.9, -9.73, -2.7),
    X(-1.48, -1.27, 6.02, { ...door(-1.0, -0.2), open: -1 }, pass(1.97, 2.75, 2.1)),
    X(-0.1, -9.73, -6.62),
    X(-0.1, -1.2, 6.02),
    Z(-6.62, -2.9, -0.1, { ...door(-1.1, -0.3), open: -1 }),
    Z(-4.25, -7.0, -4.05),
    Z(-4.25, -2.9, -1.0),
    Z(-2.7, -7.0, 6.0, { ...door(-3.9, -3.1), open: -1 }, { ...door(-1.0, -0.2), open: -1 }),
    Z(-1.27, -7.0, -1.48, { ...door(-5.0, -4.2), open: -1 }),
    Z(-0.1, -0.1, 6.0, pass(0.3, 1.5, 2.2)),
    Z(1.77, -6.05, -0.1, { ...door(-1.1, -0.3), open: 1 }),
    Z(2.9, -1.48, -0.1, { ...door(-1.2, -0.5), open: 1 }),
    // Garde-corps du balcon de la suite
    { ...Z(-8.18, 4.0, 6.0), low: 1.0 },
    { ...X(6.0, -8.18, -2.7), low: 1.0 },
  ],
  floors: [
    r(-9.83, -6.15, 6.12, -0.1),
    r(-4.35, -7.1, -1.17, -6.15),
    r(-8.28, -0.1, STAIR.x1, 6.1),
    r(STAIR.x1, -0.1, 0, STAIR.z1),
    r(0, -0.1, 4.92, 5.53),
  ],
  labels: [
    { name: 'Séjour familial', area: '23,7', x: 2.36, z: 2.8 },
    { name: 'Chambre 1', area: '17,1', x: -7.0, z: -4.5 },
    { name: 'Chambre 2', area: '12,2', x: 0.25, z: -3.9 },
    { name: 'Chambre 3', area: '17,5', x: 3.9, z: -3.9 },
    { name: 'Suite parentale', area: '22,2', x: -5.4, z: 2.0 },
    { name: 'Dressing', area: '5,9', x: -5.4, z: -1.5 },
    { name: 'Salle de bains', area: '7,4', x: -8.2, z: -1.5 },
    { name: "Salle d'eau", area: '3,6', x: -3.5, z: -5.6 },
    { name: "Salle d'eau", area: '3,6', x: -2.0, z: -5.6 },
    { name: "Salle d'eau", area: '3,5', x: 4.5, z: -0.8 },
    { name: 'Palier', area: '8,2', x: -1.3, z: -1.0 },
    { name: 'Balcon', area: '9,9', x: -5.4, z: 5.0 },
  ],
};

/** Parcelle clôturée (≈ 393 m²), portail au sud. */
export const PLOT: Rect = { x1: -10.8, z1: -8.2, x2: 7.2, z2: 13.6 };

/**
 * Emprise des pièces, pour nommer l'endroit où se trouve le visiteur.
 * L'ordre compte : la première emprise qui contient le point l'emporte.
 */
export interface Room { name: string; area?: string; level: 0 | 1; rects: Rect[] }

const room = (level: 0 | 1, name: string, area: string | undefined, ...rects: Rect[]): Room => ({ name, area, level, rects });

export const ROOMS: Room[] = [
  room(0, 'Séjour', '24,8', r(-0.1, -0.1, 4.82, 5.43)),
  room(0, 'Salle à manger', '14,1', r(1.22, -4.05, 4.82, -0.1)),
  room(0, 'Terrasse cuisine', '6,3', r(1.22, -5.92, 4.92, -4.05)),
  room(0, 'Cuisine', '21,5', r(-2.7, -5.82, 1.22, -0.1)),
  room(0, 'Réserve', '6,3', r(-4.38, -5.82, -2.7, -1.73)),
  room(0, "Chambre d'amis", '12,7', r(-8.55, -5.82, -4.38, -2.67)),
  room(0, "Salle d'eau", '3,4', r(-8.55, -2.67, -5.8, -1.25)),
  room(0, 'WC visiteurs', '2,7', r(-8.55, -1.25, -5.8, -0.1)),
  room(0, 'Couloir', undefined, r(-5.8, -2.67, -2.7, -0.1)),
  room(0, "Salle d'étude", '13,7', r(-8.0, -0.1, -4.38, 4.24)),
  room(0, "Hall d'entrée", '4,7', r(-4.38, -0.1, -2.7, 3.31)),
  room(0, 'Escalier', undefined, r(-2.7, -0.1, -0.1, 6.0)),
  room(0, 'Terrasse', '11,2', r(-8.1, 3.31, -2.7, 6.1)),
  room(1, 'Séjour familial', '23,7', r(-0.1, -0.1, 4.82, 5.43)),
  room(1, "Salle d'eau", '3,6', r(-4.25, -7.0, -2.7, -4.05)),
  room(1, "Salle d'eau", '3,6', r(-2.7, -7.0, -1.27, -4.05)),
  room(1, "Salle d'eau", '3,5', r(2.9, -1.48, 6.02, -0.1)),
  room(1, 'Chambre 1', '17,1', r(-9.73, -6.05, -2.7, -2.9)),
  room(1, 'Chambre 2', '12,2', r(-1.27, -6.05, 1.77, -1.48)),
  room(1, 'Chambre 3', '17,5', r(1.77, -6.05, 6.02, -1.48)),
  room(1, 'Salle de bains', '7,4', r(-9.73, -2.9, -6.62, -0.1)),
  room(1, 'Dressing', '5,9', r(-6.62, -2.9, -4.25, -0.1)),
  room(1, 'Suite parentale', '22,2', r(-8.18, -0.1, -2.7, 4.0), r(-4.25, -2.9, -2.7, -0.1)),
  room(1, 'Balcon', '9,9', r(-8.18, 4.0, -2.7, 6.0)),
  room(1, 'Escalier', undefined, r(-2.7, STAIR.z1, -0.1, 6.0)),
  room(1, 'Palier', '8,2', r(-2.7, -4.05, -1.27, -1.48), r(-2.7, -1.48, 2.9, -0.1), r(-2.7, -0.1, -0.1, STAIR.z1)),
];
