import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import {
  CAMERA_FOV, CAMERA_POS, ARENA_HALF,
  PLAYER_SPEED,
  WALL_RADIUS, WALL_DURATION,
  MONSTER_STRIKE_RANGE_MAX, MONSTER_STRIKE_TELEGRAPH,
} from '../constants';
import { useGameLoop, GameRef, PickupKind, SfxKey } from '../hooks/useGameLoop';
import type { Stick } from '../types';

interface SceneProps {
  state: React.MutableRefObject<GameRef>;
  playing: boolean;
  stickRef: React.MutableRefObject<Stick>;
  onScore: (s: number) => void;
  onDepth: (d: number) => void;
  onLightRadius: (r: number) => void;
  onGameOver: (final: number) => void;
  onPickup?: (kind: PickupKind, value: number) => void;
  onStrikeHit?: () => void;
  playSfx: (k: SfxKey) => void;
  haptic?: (k: 'light' | 'heavy') => void;
}

// Follow camera — anchored to the player, slight lerp. Mirrors penguin-sumo.
function FollowCamera({ state }: { state: React.MutableRefObject<GameRef> }) {
  const { camera, size } = useThree();
  const desired = useMemo(() => new THREE.Vector3(), []);
  const lookAt = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    camera.position.set(CAMERA_POS[0], CAMERA_POS[1], CAMERA_POS[2]);
    (camera as THREE.PerspectiveCamera).fov = CAMERA_FOV;
    (camera as THREE.PerspectiveCamera).near = 0.1;
    (camera as THREE.PerspectiveCamera).far = 200;
    camera.lookAt(0, 0, 0);
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  useFrame(() => {
    const d = state.current;
    desired.set(d.pos.x + CAMERA_POS[0], CAMERA_POS[1], d.pos.z + CAMERA_POS[2]);
    camera.position.lerp(desired, 0.16);
    lookAt.set(d.pos.x, 0, d.pos.z);
    camera.lookAt(lookAt);
  });
  return null;
}

// Player explorer + lantern. Two pieces: a chunky humanoid body and a
// glowing lantern hanging in front. The lantern carries the real SpotLight
// that illuminates the floor + nearby crystals + monsters.
// Base values for the lantern's omnidirectional glow. The "breath" function
// in useFrame modulates both intensity and distance around these.
const LANTERN_BASE_INTENSITY = 170;     // PointLight intensity units (decay=2)
const LANTERN_BASE_DISTANCE  = 30;      // world units of reach

function Player({ state }: { state: React.MutableRefObject<GameRef> }) {
  const groupRef = useRef<THREE.Group>(null);
  const lanternMat = useRef<THREE.MeshStandardMaterial>(null);
  const lanternLightRef = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const d = state.current;
    if (!groupRef.current) return;
    groupRef.current.position.copy(d.pos);
    groupRef.current.rotation.y = d.rot;
    const t = clock.getElapsedTime();

    // Body life: slow chest-breathing when idle, faster jog-bounce when
    // moving, blended by speed so the transition is smooth. Plus a tiny
    // side-to-side lean while walking to sell the gait.
    const moveFactor = Math.min(1, d.speed / PLAYER_SPEED);
    const idleBob = Math.sin(t * 1.8) * 0.04;
    const walkBob = Math.abs(Math.sin(t * 9)) * 0.12;
    groupRef.current.position.y = idleBob * (1 - moveFactor) + walkBob * moveFactor;
    groupRef.current.rotation.z = Math.sin(t * 9) * 0.07 * moveFactor;
    // Two-band flicker — wider amplitude than before so the breath reads
    // clearly. Range approximately [0.65, 1.35] on the slow band.
    //   • slow sinusoid (~5.5s period) → the lantern's "breath"
    //   • fast jitter   (~7-11Hz)      → flame restlessness
    const slow = Math.sin(t * 1.14) * 0.32;
    const fast = (Math.sin(t * 7.0) + Math.sin(t * 11.3) * 0.4) * 0.08;
    const breath = 1.0 + slow + fast;
    if (lanternLightRef.current) {
      lanternLightRef.current.intensity = LANTERN_BASE_INTENSITY * breath;
      // Distance breathes much more visibly now — range from ~0.62×D when
      // the flame ducks to ~1.22×D when it flares.
      lanternLightRef.current.distance  = LANTERN_BASE_DISTANCE  * (0.92 + slow * 0.95);
    }
    if (lanternMat.current) {
      lanternMat.current.emissiveIntensity = 3.2 * breath;
    }
  });
  return (
    <group ref={groupRef}>
      {/* tiny contact shadow — kept faint so it blends into the lit floor */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.5, 24]} />
        <meshBasicMaterial color="#000" transparent opacity={0.25} />
      </mesh>
      {/* lower body */}
      <RoundedBox args={[0.55, 0.55, 0.45]} radius={0.16} smoothness={5} position={[0, 0.35, 0]} castShadow>
        <meshStandardMaterial color="#3c2b1f" roughness={0.9} />
      </RoundedBox>
      {/* coat */}
      <RoundedBox args={[0.7, 0.7, 0.5]} radius={0.20} smoothness={5} position={[0, 0.95, 0]} castShadow>
        <meshStandardMaterial color="#5a4030" roughness={0.85} />
      </RoundedBox>
      {/* head */}
      <mesh position={[0, 1.45, 0]} castShadow>
        <sphereGeometry args={[0.22, 16, 12]} />
        <meshStandardMaterial color="#d6b69a" roughness={0.8} />
      </mesh>
      {/* hat */}
      <mesh position={[0, 1.66, -0.04]} castShadow>
        <coneGeometry args={[0.26, 0.30, 18]} />
        <meshStandardMaterial color="#2a1a12" roughness={0.9} />
      </mesh>
      {/* lantern stick + lantern body */}
      <mesh position={[0.30, 1.05, 0.30]} rotation={[0.6, 0, -0.4]}>
        <cylinderGeometry args={[0.025, 0.025, 0.7, 8]} />
        <meshStandardMaterial color="#2a1a10" />
      </mesh>
      <mesh position={[0.46, 0.85, 0.50]}>
        <boxGeometry args={[0.22, 0.30, 0.22]} />
        <meshStandardMaterial color="#1a1410" />
      </mesh>
      <mesh position={[0.46, 0.85, 0.50]}>
        <sphereGeometry args={[0.13, 14, 10]} />
        <meshStandardMaterial ref={lanternMat} color="#ffc070" emissive="#ff8a30" emissiveIntensity={3.2} />
      </mesh>

      {/* The lantern — a single omnidirectional warm orange PointLight at
          the hanging-bulb position. Intensity + distance "breathe" in
          useFrame (slow sin + small fast jitter) for the candle-flame
          flicker the lantern needs. castShadow so the player still throws
          a shadow on the cave floor. */}
      <pointLight
        ref={lanternLightRef}
        position={[0.46, 0.85, 0.50]}
        color="#ff9a3a"
        intensity={LANTERN_BASE_INTENSITY}
        distance={LANTERN_BASE_DISTANCE}
        decay={2}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0008}
        shadow-normalBias={0.04}
        shadow-camera-near={0.3}
        shadow-camera-far={20}
      />

      {/* feet — short cylinders */}
      <mesh position={[-0.14, 0.10, 0]} castShadow>
        <cylinderGeometry args={[0.10, 0.10, 0.20, 10]} />
        <meshStandardMaterial color="#1a0e08" />
      </mesh>
      <mesh position={[0.14, 0.10, 0]} castShadow>
        <cylinderGeometry args={[0.10, 0.10, 0.20, 10]} />
        <meshStandardMaterial color="#1a0e08" />
      </mesh>
    </group>
  );
}

// Drifting glow specks — atmospheric extra borrowed from Piper's night
// preset. Cool blue-white so they read as cave-spirits against the warm
// lantern. Each firefly is a tiny additive-blended sphere (round, glowy)
// rather than gl_POINT (which renders as a square sprite). Positions are
// world-space so they linger as the player moves through them.
function Fireflies() {
  const COUNT = 50;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { positions, vel, dummy } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const vel = new Float32Array(COUNT * 3);
    const W = ARENA_HALF * 1.6;
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * W;
      positions[i * 3 + 1] = 0.4 + Math.random() * 2.4;
      positions[i * 3 + 2] = (Math.random() - 0.5) * W;
      vel[i * 3 + 0] = (Math.random() - 0.5) * 0.35;
      vel[i * 3 + 1] = (Math.random() - 0.5) * 0.20;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.35;
    }
    return { positions, vel, dummy: new THREE.Object3D() };
  }, []);
  useFrame(({ clock }, delta) => {
    const m = meshRef.current;
    if (!m) return;
    const c = Math.min(delta, 0.05);
    const t = clock.getElapsedTime();
    const W = ARENA_HALF * 1.6;
    for (let i = 0; i < COUNT; i++) {
      const xi = i * 3, yi = i * 3 + 1, zi = i * 3 + 2;
      positions[xi] += vel[xi] * c + Math.sin(t * 0.6 + i) * 0.004;
      positions[yi] += vel[yi] * c;
      positions[zi] += vel[zi] * c + Math.cos(t * 0.5 + i * 1.3) * 0.004;
      if (positions[yi] < 0.3 || positions[yi] > 3.0) vel[yi] *= -1;
      if (Math.abs(positions[xi]) > W / 2) vel[xi] *= -1;
      if (Math.abs(positions[zi]) > W / 2) vel[zi] *= -1;
      // Per-instance twinkle via scale
      const twinkle = 0.7 + Math.sin(t * 1.6 + i * 0.7) * 0.3;
      dummy.position.set(positions[xi], positions[yi], positions[zi]);
      dummy.scale.setScalar(twinkle);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]}>
      <sphereGeometry args={[0.06, 8, 6]} />
      <meshBasicMaterial color="#cfe2ff" transparent opacity={0.85} depthWrite={false} blending={THREE.AdditiveBlending} />
    </instancedMesh>
  );
}

// Per-crystal mesh sync. Renders the 4 types in distinct colors with
// emissive shimmer + slow rotation.
function Crystals({ state }: { state: React.MutableRefObject<GameRef> }) {
  const refs = useRef<Map<number, THREE.Group>>(new Map());
  const [, force] = useState(0);
  const lastCount = useRef(-1);
  useFrame(({ clock }) => {
    const d = state.current;
    const t = clock.getElapsedTime();
    if (d.crystals.length !== lastCount.current) {
      lastCount.current = d.crystals.length;
      force(x => x + 1);
    }
    for (const cr of d.crystals) {
      const g = refs.current.get(cr.id);
      if (!g) continue;
      g.position.copy(cr.position);
      g.position.y = 0.35 + Math.sin(t * 1.6 + cr.id) * 0.10;
      g.rotation.y = t * 0.8 + cr.id;
    }
  });
  const d = state.current;
  return (
    <>
      {d.crystals.map(cr => {
        const color =
          cr.type === 'red'   ? '#ff3a3a' :
          cr.type === 'green' ? '#48ff80' :
          cr.type === 'blue'  ? '#5aa8ff' :
                                '#ffd64a';
        return (
          <group
            key={cr.id}
            ref={el => {
              if (el) refs.current.set(cr.id, el);
              else refs.current.delete(cr.id);
            }}
          >
            <mesh castShadow>
              <octahedronGeometry args={[0.35, 0]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.8} roughness={0.3} metalness={0.6} />
            </mesh>
            {/* inner halo — bright disc directly under the crystal */}
            <mesh position={[0, -0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.65, 22]} />
              <meshBasicMaterial color={color} transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
            {/* outer halo — much wider, dim, so the crystal advertises its
                position from beyond the lantern's direct reach */}
            <mesh position={[0, -0.29, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[1.6, 28]} />
              <meshBasicMaterial color={color} transparent opacity={0.18} depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

// A fixed pool of N PointLights that get assigned each frame to the N
// nearest visible crystals. Gives the cave a multi-source "stage-light"
// quality (like DJ Disco) without per-crystal lights — keeps GPU cost
// predictable. No shadows because mobile would choke.
function CrystalLights({ state }: { state: React.MutableRefObject<GameRef> }) {
  const POOL = 4;
  const refs = useRef<(THREE.PointLight | null)[]>([]);
  const tmpVec = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const d = state.current;
    if (d.crystals.length === 0) {
      for (const l of refs.current) if (l) l.intensity = 0;
      return;
    }
    // Sort crystals by distance² to player (cheap — typical N is ~18-26)
    const sorted = d.crystals
      .map(c => ({
        c,
        d2: (c.position.x - d.pos.x) ** 2 + (c.position.z - d.pos.z) ** 2,
      }))
      .sort((a, b) => a.d2 - b.d2)
      .slice(0, POOL);

    for (let i = 0; i < POOL; i++) {
      const light = refs.current[i];
      if (!light) continue;
      const entry = sorted[i];
      if (!entry) { light.intensity = 0; continue; }
      const c = entry.c;
      tmpVec.set(c.position.x, 0.5, c.position.z);
      light.position.copy(tmpVec);
      light.color.set(
        c.type === 'red'   ? '#ff2a3a' :
        c.type === 'green' ? '#48ff80' :
        c.type === 'blue'  ? '#5aa8ff' :
                             '#ffd64a'
      );
      // Fade with distance² so distant crystals contribute less while
      // still being visually anchored when nearby.
      const distFalloff = Math.max(0.2, 1 - entry.d2 / 200);
      light.intensity = 14 * distFalloff;
      light.distance = 8;
    }
  });
  return (
    <>
      {Array.from({ length: POOL }).map((_, i) => (
        <pointLight
          key={i}
          ref={el => { refs.current[i] = el; }}
          color="#ffffff"
          intensity={0}
          distance={8}
          decay={2}
        />
      ))}
    </>
  );
}

// Cave pillars / stalagmites. Three variants (spike / dome / cluster) so the
// arena reads as a varied cave rather than a forest of identical cones —
// gives the player landmarks to track their position between sweeps.
function Pillars({ state }: { state: React.MutableRefObject<GameRef> }) {
  const d = state.current;
  return (
    <>
      {d.pillars.map(p => (
        <group key={p.id} position={[p.position.x, 0, p.position.z]} rotation={[0, p.rot, 0]} scale={p.scale}>
          {p.variant === 'spike' && (
            <>
              <mesh position={[0, 1.0, 0]} castShadow>
                <coneGeometry args={[0.45, 2.4, 8]} />
                <meshStandardMaterial color="#3a322a" roughness={0.95} />
              </mesh>
              <mesh position={[0, 0.15, 0]} castShadow>
                <cylinderGeometry args={[0.55, 0.7, 0.30, 10]} />
                <meshStandardMaterial color="#2a221a" roughness={0.95} />
              </mesh>
            </>
          )}
          {p.variant === 'dome' && (
            <>
              <mesh position={[0, 0.55, 0]} castShadow>
                <sphereGeometry args={[0.85, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
                <meshStandardMaterial color="#322a22" roughness={1} />
              </mesh>
              <mesh position={[0, 0.05, 0]} castShadow>
                <cylinderGeometry args={[1.05, 1.15, 0.10, 14]} />
                <meshStandardMaterial color="#241c14" roughness={1} />
              </mesh>
            </>
          )}
          {p.variant === 'cluster' && (
            <>
              <mesh position={[-0.30, 0.6, 0]} rotation={[0, 0, -0.18]} castShadow>
                <coneGeometry args={[0.32, 1.4, 7]} />
                <meshStandardMaterial color="#3a322a" roughness={0.95} />
              </mesh>
              <mesh position={[0.25, 0.85, 0.15]} rotation={[0, 0.4, 0.10]} castShadow>
                <coneGeometry args={[0.36, 1.9, 7]} />
                <meshStandardMaterial color="#3a322a" roughness={0.95} />
              </mesh>
              <mesh position={[0.10, 0.45, -0.30]} castShadow>
                <coneGeometry args={[0.28, 1.0, 7]} />
                <meshStandardMaterial color="#322a22" roughness={0.95} />
              </mesh>
              <mesh position={[0, 0.10, 0]} castShadow>
                <cylinderGeometry args={[0.85, 0.95, 0.18, 12]} />
                <meshStandardMaterial color="#241c14" roughness={1} />
              </mesh>
            </>
          )}
        </group>
      ))}
    </>
  );
}

// Central altar / extinguished fire bowl — a fixed landmark at world origin.
// Players always know "here is home" by seeing it. Faint cyan ash glow
// reads as "the old fire, long cold" — narratively reinforces the lantern
// the player carries being the only living flame.
function Altar() {
  const ashMat = useRef<THREE.MeshStandardMaterial>(null);
  const altarLightRef = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pulse = 0.55 + Math.sin(t * 0.7) * 0.18;
    if (ashMat.current) ashMat.current.emissiveIntensity = pulse;
    // Faint cool-blue point light at the bowl — gives the altar its own
    // pool of illumination, breaks the single-warm-source monotony.
    if (altarLightRef.current) altarLightRef.current.intensity = 8 + pulse * 6;
  });
  return (
    <group position={[0, 0, 0]}>
      {/* stone ring base */}
      <mesh position={[0, 0.08, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.2, 1.35, 0.16, 24]} />
        <meshStandardMaterial color="#2a231b" roughness={1} />
      </mesh>
      {/* basin lip */}
      <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.05, 1.10, 0.24, 24]} />
        <meshStandardMaterial color="#2e261d" roughness={0.95} />
      </mesh>
      {/* hollow interior — torus to read as a bowl rim */}
      <mesh position={[0, 0.42, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.95, 0.10, 8, 22]} />
        <meshStandardMaterial color="#1a140e" roughness={1} />
      </mesh>
      {/* cold ash — faint cyan emissive, subtle pulse */}
      <mesh position={[0, 0.38, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.85, 24]} />
        <meshStandardMaterial ref={ashMat} color="#3a4e5a" emissive="#5e8aa8" emissiveIntensity={0.55} roughness={1} />
      </mesh>
      {/* point light embedded in the bowl — no shadow (perf) */}
      <pointLight
        ref={altarLightRef}
        position={[0, 0.55, 0]}
        color="#7eaee0"
        intensity={11}
        distance={7}
        decay={2}
      />
    </group>
  );
}

// Glowing moss / cracks at the inside-base of the perimeter walls. Cool
// blue-green so the player sees the boundary even when the warm lantern
// hasn't reached it — without breaking the dark-cave mood.
function WallEdges() {
  return (
    <>
      <mesh position={[0, 0.05, -ARENA_HALF + 0.05]}>
        <boxGeometry args={[ARENA_HALF * 2.0, 0.10, 0.08]} />
        <meshStandardMaterial color="#0a1a18" emissive="#1f6e74" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[0, 0.05,  ARENA_HALF - 0.05]}>
        <boxGeometry args={[ARENA_HALF * 2.0, 0.10, 0.08]} />
        <meshStandardMaterial color="#0a1a18" emissive="#1f6e74" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[-ARENA_HALF + 0.05, 0.05, 0]}>
        <boxGeometry args={[0.08, 0.10, ARENA_HALF * 2.0]} />
        <meshStandardMaterial color="#0a1a18" emissive="#1f6e74" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[ ARENA_HALF - 0.05, 0.05, 0]}>
        <boxGeometry args={[0.08, 0.10, ARENA_HALF * 2.0]} />
        <meshStandardMaterial color="#0a1a18" emissive="#1f6e74" emissiveIntensity={0.8} />
      </mesh>
    </>
  );
}

// Wall pulses from blue-crystal pickups — short-lived glowing pillars
function Walls({ state }: { state: React.MutableRefObject<GameRef> }) {
  const refs = useRef<Map<number, { group: THREE.Group; ringMat: THREE.MeshBasicMaterial | null; coreMat: THREE.MeshStandardMaterial | null }>>(new Map());
  const [, force] = useState(0);
  const lastCount = useRef(-1);
  useFrame(() => {
    const d = state.current;
    if (d.walls.length !== lastCount.current) {
      lastCount.current = d.walls.length;
      force(x => x + 1);
    }
    for (const w of d.walls) {
      const r = refs.current.get(w.id);
      if (!r) continue;
      const age = d.time - w.bornAt;
      const t = Math.min(1, age / WALL_DURATION);
      // Fade out over the last 30% of life
      const fade = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      if (r.coreMat) r.coreMat.emissiveIntensity = (0.8 + Math.sin(d.time * 6) * 0.25) * fade;
      if (r.ringMat) r.ringMat.opacity = 0.6 * fade;
      r.group.position.copy(w.position);
    }
  });
  const d = state.current;
  return (
    <>
      {d.walls.map(w => (
        <group
          key={w.id}
          ref={el => {
            if (el) {
              const ringMatRef = (el.children[1] as THREE.Mesh | undefined)?.material as THREE.MeshBasicMaterial | undefined;
              const coreMatRef = (el.children[0] as THREE.Mesh | undefined)?.material as THREE.MeshStandardMaterial | undefined;
              refs.current.set(w.id, { group: el, ringMat: ringMatRef ?? null, coreMat: coreMatRef ?? null });
            } else {
              refs.current.delete(w.id);
            }
          }}
        >
          <mesh position={[0, 1.1, 0]} castShadow>
            <cylinderGeometry args={[WALL_RADIUS * 0.65, WALL_RADIUS * 0.75, 2.2, 18]} />
            <meshStandardMaterial color="#3a6ed6" emissive="#5aa8ff" emissiveIntensity={0.8} transparent opacity={0.85} />
          </mesh>
          <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[WALL_RADIUS * 0.85, WALL_RADIUS, 36]} />
            <meshBasicMaterial color="#7accff" transparent opacity={0.6} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
        </group>
      ))}
    </>
  );
}

// Monsters — dark twisted shapes. Eyes glow yellow when lurking, red when
// striking. During the 1.2s strike telegraph: a pulsing red floor ring at
// the monster's feet AND a stretching tendril aimed at the player. Both
// flash on the live-hit frame.
function Monsters({ state }: { state: React.MutableRefObject<GameRef> }) {
  const groupRefs = useRef<Map<number, THREE.Group>>(new Map());
  const tendrilRefs = useRef<Map<number, THREE.Mesh>>(new Map());
  const tendrilMats = useRef<Map<number, THREE.MeshStandardMaterial>>(new Map());
  const tendrilTipRefs = useRef<Map<number, THREE.Mesh>>(new Map());
  const tendrilTipMats = useRef<Map<number, THREE.MeshBasicMaterial>>(new Map());
  const ringRefs = useRef<Map<number, THREE.Mesh>>(new Map());
  const ringMats = useRef<Map<number, THREE.MeshBasicMaterial>>(new Map());
  const eyeMats = useRef<Map<number, [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial]>>(new Map());
  const [, force] = useState(0);
  const lastCount = useRef(-1);

  useFrame(({ clock }) => {
    const d = state.current;
    if (d.monsters.length !== lastCount.current) {
      lastCount.current = d.monsters.length;
      force(x => x + 1);
    }
    const t = clock.getElapsedTime();
    for (const m of d.monsters) {
      const g = groupRefs.current.get(m.id);
      if (g) {
        g.position.copy(m.position);
        g.rotation.y = m.rotation;
        // bob slightly while lurking
        g.position.y = Math.abs(Math.sin(t * 2 + m.id)) * 0.12;
      }
      const striking = m.state === 'striking';
      const phase = striking ? m.strikeT / MONSTER_STRIKE_TELEGRAPH : 0;
      const live = striking && m.strikeT >= MONSTER_STRIKE_TELEGRAPH;

      // Tendril — a tapered cone lying horizontally along the strike
      // direction (monster-local +Z, since the monster faces the player
      // and rotation is frozen during the strike). The cone tapers from
      // a wide base at the monster to a narrow tip at the strike target —
      // direction is unambiguous, like an arrow. Bright red tip ball
      // marks "the bit that grabs you".
      const tendril = tendrilRefs.current.get(m.id);
      const tMat = tendrilMats.current.get(m.id);
      const tip = tendrilTipRefs.current.get(m.id);
      const tipMat = tendrilTipMats.current.get(m.id);
      if (tendril && tMat) {
        tendril.visible = striking;
        if (striking) {
          const reach = live
            ? MONSTER_STRIKE_RANGE_MAX
            : Math.min(1, phase) * MONSTER_STRIKE_RANGE_MAX;
          // Place the cone in monster-local space: midpoint along +Z,
          // tilted so its long axis runs along +Z, scaled by reach.
          tendril.position.set(0, 0.65, reach * 0.5);
          tendril.rotation.set(Math.PI / 2, 0, 0);
          tendril.scale.set(0.30, reach, 0.30);
          tMat.emissiveIntensity = live ? 4.5 : 1.4 + phase * 2.6;
        }
      }
      if (tip && tipMat) {
        tip.visible = striking;
        if (striking) {
          const reach = live
            ? MONSTER_STRIKE_RANGE_MAX
            : Math.min(1, phase) * MONSTER_STRIKE_RANGE_MAX;
          tip.position.set(0, 0.65, reach);
          const tipPulse = 1 + Math.sin(t * 16) * 0.25;
          tip.scale.setScalar(tipPulse);
          tipMat.opacity = live ? 1.0 : 0.55 + phase * 0.45;
        }
      }

      // Strike-warning floor ring at monster feet. Pulses scale + opacity
      // through the telegraph so the player has a clear "DON'T BE THERE"
      // indicator even at the edge of their lantern reach.
      const ring = ringRefs.current.get(m.id);
      const rMat = ringMats.current.get(m.id);
      if (ring && rMat) {
        ring.visible = striking;
        if (striking) {
          // Pulse: 1.6 Hz oscillation on size + opacity
          const pulse = 0.8 + Math.sin(t * 12) * 0.20;
          const baseScale = 1.0 + phase * 0.9;          // grows as windup builds
          ring.scale.set(baseScale * pulse, 1, baseScale * pulse);
          rMat.opacity = live ? 0.95 : 0.50 + phase * 0.40;
        }
      }

      // Eye color flip — yellow when lurking/fleeing/cooldown, red when
      // mid-strike so the player knows WHICH monster is the one launching.
      const eyes = eyeMats.current.get(m.id);
      if (eyes) {
        if (striking) {
          eyes[0].emissive.setHex(0xff2828);
          eyes[1].emissive.setHex(0xff2828);
          const pulse = 1.6 + Math.sin(t * 12) * 0.7;
          eyes[0].emissiveIntensity = pulse;
          eyes[1].emissiveIntensity = pulse;
        } else {
          eyes[0].emissive.setHex(0xffa820);
          eyes[1].emissive.setHex(0xffa820);
          eyes[0].emissiveIntensity = 1.4;
          eyes[1].emissiveIntensity = 1.4;
        }
      }
    }
  });

  const d = state.current;
  return (
    <>
      {d.monsters.map(m => (
        <group
          key={m.id}
          ref={el => {
            if (el) groupRefs.current.set(m.id, el);
            else groupRefs.current.delete(m.id);
          }}
        >
          {/* main body — twisted dark hood */}
          <mesh position={[0, 0.85, 0]} castShadow>
            <coneGeometry args={[0.55, 1.5, 8]} />
            <meshStandardMaterial color="#0a0810" roughness={0.95} />
          </mesh>
          {/* hood ring */}
          <mesh position={[0, 1.55, 0]}>
            <torusGeometry args={[0.28, 0.06, 6, 14]} />
            <meshStandardMaterial color="#1a1422" roughness={0.85} />
          </mesh>
          {/* glowing eyes (emissive updated per-frame so they can turn red) */}
          <mesh
            position={[-0.12, 1.25, 0.40]}
            ref={el => {
              if (!el) { eyeMats.current.delete(m.id); return; }
              const prev = eyeMats.current.get(m.id);
              const left = el.material as THREE.MeshStandardMaterial;
              eyeMats.current.set(m.id, [left, prev ? prev[1] : (left)]);
            }}
          >
            <sphereGeometry args={[0.06, 10, 8]} />
            <meshStandardMaterial color="#ffdc4a" emissive="#ffa820" emissiveIntensity={1.4} />
          </mesh>
          <mesh
            position={[0.12, 1.25, 0.40]}
            ref={el => {
              if (!el) return;
              const prev = eyeMats.current.get(m.id);
              const right = el.material as THREE.MeshStandardMaterial;
              eyeMats.current.set(m.id, [prev ? prev[0] : right, right]);
            }}
          >
            <sphereGeometry args={[0.06, 10, 8]} />
            <meshStandardMaterial color="#ffdc4a" emissive="#ffa820" emissiveIntensity={1.4} />
          </mesh>
          {/* contact shadow */}
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.6, 18]} />
            <meshBasicMaterial color="#000" transparent opacity={0.55} />
          </mesh>
          {/* Strike-warning floor ring — flat on the ground, only shown
              while striking, scales/pulses through the telegraph window. */}
          <mesh
            position={[0, 0.04, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            visible={false}
            ref={el => {
              if (!el) { ringRefs.current.delete(m.id); ringMats.current.delete(m.id); return; }
              ringRefs.current.set(m.id, el);
              ringMats.current.set(m.id, el.material as THREE.MeshBasicMaterial);
            }}
          >
            <ringGeometry args={[0.95, 1.15, 32]} />
            <meshBasicMaterial color="#ff3838" transparent opacity={0.6} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
          </mesh>
          {/* dark-hand tendril — tapered cone laid horizontally along the
              monster's local +Z (= strike direction). Wide at the monster
              (base) → narrow at the strike target (tip), so direction is
              read-instantly. */}
          <mesh
            ref={el => {
              if (el) {
                tendrilRefs.current.set(m.id, el);
                tendrilMats.current.set(m.id, el.material as THREE.MeshStandardMaterial);
              } else {
                tendrilRefs.current.delete(m.id);
                tendrilMats.current.delete(m.id);
              }
            }}
            visible={false}
          >
            {/* base radius wide (1.0), tip radius narrow via the geometry's
                second arg... wait, ConeGeometry doesn't taper to a custom tip.
                Use CylinderGeometry with different top/bottom radii instead. */}
            <cylinderGeometry args={[0.15, 1.0, 1, 10]} />
            <meshStandardMaterial color="#1a0008" emissive="#ff3838" emissiveIntensity={1.4} transparent opacity={0.92} />
          </mesh>
          {/* Bright-red glowing claw tip at the strike's landing point —
              the player should look at THIS dot, not the body, to dodge. */}
          <mesh
            ref={el => {
              if (el) {
                tendrilTipRefs.current.set(m.id, el);
                tendrilTipMats.current.set(m.id, el.material as THREE.MeshBasicMaterial);
              } else {
                tendrilTipRefs.current.delete(m.id);
                tendrilTipMats.current.delete(m.id);
              }
            }}
            visible={false}
          >
            <sphereGeometry args={[0.22, 14, 10]} />
            <meshBasicMaterial color="#ff6060" transparent opacity={0.95} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
        </group>
      ))}
    </>
  );
}

export function Scene(props: SceneProps) {
  const { state, playing, stickRef } = props;
  useGameLoop({
    state, playing, stick: stickRef.current,
    onScore: props.onScore,
    onDepth: props.onDepth,
    onLightRadius: props.onLightRadius,
    onGameOver: props.onGameOver,
    onPickup: props.onPickup,
    onStrikeHit: props.onStrikeHit,
    playSfx: props.playSfx,
    haptic: props.haptic,
  });

  return (
    <>
      <FollowCamera state={state} />
      {/* Cave ambient — very dark with a tiny up-fill so silhouettes are barely visible outside the lantern */}
      {/* Night cave atmosphere. Three.js distance fog. PREVIOUSLY 6→22 which
          put the player (camera-distance ~17.5 with cam at y=16) at ~70%
          fog blend already — the canvas read as dim even before the CSS
          fog overlay multiplied on top. New range 14→58 keeps the player
          and immediate surroundings clear, distant features fade. */}
      <fog attach="fog" args={['#080c14', 14, 58]} />
      <ambientLight intensity={0.38} color="#1f2c40" />
      <hemisphereLight args={['#36456a', '#101418', 0.32]} />
      <Fireflies />
      {/* Floor: dark damp stone */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[ARENA_HALF * 4, ARENA_HALF * 4]} />
        <meshStandardMaterial color="#2c2118" roughness={0.85} />
      </mesh>
      {/* Cave walls (outer ring) — taller dark cylinders around perimeter */}
      <mesh position={[0, 1.5, -ARENA_HALF - 0.5]} castShadow>
        <boxGeometry args={[ARENA_HALF * 2.4, 6, 1]} />
        <meshStandardMaterial color="#100a08" roughness={1} />
      </mesh>
      <mesh position={[0, 1.5,  ARENA_HALF + 0.5]} castShadow>
        <boxGeometry args={[ARENA_HALF * 2.4, 6, 1]} />
        <meshStandardMaterial color="#100a08" roughness={1} />
      </mesh>
      <mesh position={[-ARENA_HALF - 0.5, 1.5, 0]} castShadow>
        <boxGeometry args={[1, 6, ARENA_HALF * 2.4]} />
        <meshStandardMaterial color="#100a08" roughness={1} />
      </mesh>
      <mesh position={[ ARENA_HALF + 0.5, 1.5, 0]} castShadow>
        <boxGeometry args={[1, 6, ARENA_HALF * 2.4]} />
        <meshStandardMaterial color="#100a08" roughness={1} />
      </mesh>

      <Altar />
      <WallEdges />
      <Pillars state={state} />
      <Crystals state={state} />
      <CrystalLights state={state} />
      <Walls state={state} />
      <Player state={state} />
      <Monsters state={state} />
    </>
  );
}
