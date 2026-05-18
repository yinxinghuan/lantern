import * as THREE from 'three';
import type { CrystalType } from './constants';

export type Phase = 'splash' | 'playing' | 'gameover';

export interface Stick {
  active: boolean;
  x: number;
  y: number;
}

export type MonsterState = 'lurking' | 'fleeing' | 'striking' | 'cooldown';

export interface Monster {
  id: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: number;
  state: MonsterState;
  fleeT: number;
  cooldownT: number;
  strikeT: number;        // counts up: 0→TELEGRAPH = warning, then up to +LIVE = live, then resets
  strikeAimX: number;
  strikeAimZ: number;
  isBoss?: boolean;       // The Dark Lord — only retreats from green strong-light
}

export interface Crystal {
  id: number;
  position: THREE.Vector3;
  type: CrystalType;
}

export interface ExitStone {
  position: THREE.Vector3;
}

export interface Wall {
  id: number;
  position: THREE.Vector3;
  bornAt: number;
}

export type PillarVariant = 'spike' | 'dome' | 'cluster';

export interface Pillar {
  id: number;
  position: THREE.Vector3;
  scale: number;
  rot: number;
  variant: PillarVariant;
}

export interface FxEvent {
  key: number;
  type: 'pickup_gold' | 'pickup_red' | 'pickup_green' | 'pickup_blue' | 'monster_flee' | 'strike_telegraph' | 'strike_hit' | 'wall_pulse';
  x: number;
  z: number;
  born: number;
}
