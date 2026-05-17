import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import {
  CAMERA_FOV, CAMERA_POS, ARENA_HALF,
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
function Player({ state }: { state: React.MutableRefObject<GameRef> }) {
  const groupRef = useRef<THREE.Group>(null);
  const lanternMat = useRef<THREE.MeshStandardMaterial>(null);
  // SpotLight + its target are wired explicitly via refs each frame because
  // three.js doesn't auto-update a target's matrixWorld when the target is
  // only attached as a `target` property (vs being a real scene-graph child).
  // Without this, the light direction was locked at game start regardless
  // of which way the player turned.
  const spotRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  useFrame(({ clock }) => {
    const d = state.current;
    if (!groupRef.current) return;
    groupRef.current.position.copy(d.pos);
    groupRef.current.rotation.y = d.rot;
    if (spotRef.current && targetRef.current) {
      if (spotRef.current.target !== targetRef.current) {
        spotRef.current.target = targetRef.current;
      }
      targetRef.current.updateMatrixWorld(true);
    }
    if (lanternMat.current) {
      lanternMat.current.emissiveIntensity = 3.2 + Math.sin(clock.getElapsedTime() * 4) * 0.4;
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
        <meshStandardMaterial ref={lanternMat} color="#ffe9a0" emissive="#ffd24a" emissiveIntensity={3.2} />
      </mesh>

      {/* Real SpotLight — the lantern's actual scene-illuminating cone.
          Strengthened (intensity 260) since the decorative volumetric beam
          was removed; this is now the sole source of forward floor light. */}
      <spotLight
        ref={spotRef}
        position={[0, 1.05, 0.40]}
        angle={Math.PI / 3.0}
        penumbra={0.5}
        intensity={600}
        distance={32}
        decay={0.70}
        color="#ffd189"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0008}
        shadow-normalBias={0.04}
        shadow-camera-near={0.4}
        shadow-camera-far={32}
      />
      <object3D ref={targetRef} position={[0, -1.0, 4]} />
      {/* Local PointLight at the lantern — short-range warm bounce so the
          player's body, hat and feet are visible from the camera above,
          not just a featureless silhouette. */}
      <pointLight position={[0, 1.0, 0.5]} color="#ffb060" intensity={2.4} distance={3.5} decay={1.0} />

      {/* Volumetric beam cone — softer than before so it complements the
          (now strong + warm) hard SpotLight without overpowering it. Two
          layers: halo + thinner core. Apex anchored at the lantern. */}
      <mesh position={[0, 0.50, 2.10]} rotation={[-Math.PI * 0.403, 0, 0]}>
        <coneGeometry args={[1.6, 3.35, 28, 1, true]} />
        <meshBasicMaterial
          color="#ffd28a"
          transparent
          opacity={0.16}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh position={[0, 0.50, 2.10]} rotation={[-Math.PI * 0.403, 0, 0]}>
        <coneGeometry args={[0.9, 3.35, 24, 1, true]} />
        <meshBasicMaterial
          color="#ffe1a8"
          transparent
          opacity={0.18}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

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
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} roughness={0.3} metalness={0.6} />
            </mesh>
            {/* glow halo on the floor under each crystal */}
            <mesh position={[0, -0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.45, 18]} />
              <meshBasicMaterial color={color} transparent opacity={0.45} depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

// Cave pillars / stalagmites — static decoration with shadow value
function Pillars({ state }: { state: React.MutableRefObject<GameRef> }) {
  const d = state.current;
  return (
    <>
      {d.pillars.map(p => (
        <group key={p.id} position={[p.position.x, 0, p.position.z]} rotation={[0, p.rot, 0]} scale={p.scale}>
          <mesh position={[0, 1.0, 0]} castShadow>
            <coneGeometry args={[0.45, 2.4, 8]} />
            <meshStandardMaterial color="#3a322a" roughness={0.95} />
          </mesh>
          <mesh position={[0, 0.15, 0]} castShadow>
            <cylinderGeometry args={[0.55, 0.7, 0.30, 10]} />
            <meshStandardMaterial color="#2a221a" roughness={0.95} />
          </mesh>
        </group>
      ))}
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

// Monsters — dark twisted shapes. Eyes glow yellow when lurking, white when
// fleeing. When striking, a tendril (dark hand) extends toward the player
// during the telegraph + live windows.
function Monsters({ state }: { state: React.MutableRefObject<GameRef> }) {
  const groupRefs = useRef<Map<number, THREE.Group>>(new Map());
  const tendrilRefs = useRef<Map<number, THREE.Mesh>>(new Map());
  const tendrilMats = useRef<Map<number, THREE.MeshStandardMaterial>>(new Map());
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
      const tendril = tendrilRefs.current.get(m.id);
      const tMat = tendrilMats.current.get(m.id);
      if (tendril && tMat) {
        const striking = m.state === 'striking';
        tendril.visible = striking;
        if (striking) {
          const phase = m.strikeT / MONSTER_STRIKE_TELEGRAPH;
          // Telegraph: tendril grows from short to full reach. Live: pulse.
          const live = m.strikeT >= MONSTER_STRIKE_TELEGRAPH;
          const reach = live
            ? MONSTER_STRIKE_RANGE_MAX
            : Math.min(1, phase) * MONSTER_STRIKE_RANGE_MAX;
          // place tendril halfway between monster and reach point, aligned to aimXZ
          const ax = m.strikeAimX;
          const az = m.strikeAimZ;
          tendril.position.set(ax * reach * 0.5, 0.65, az * reach * 0.5);
          tendril.rotation.set(0, Math.atan2(ax, az), 0);
          tendril.scale.set(0.15, reach, 0.15);
          tMat.emissiveIntensity = live ? 2.4 : 0.6 + phase * 1.4;
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
          {/* glowing eyes */}
          <mesh position={[-0.12, 1.25, 0.40]}>
            <sphereGeometry args={[0.06, 10, 8]} />
            <meshStandardMaterial color="#ffdc4a" emissive="#ffa820" emissiveIntensity={1.4} />
          </mesh>
          <mesh position={[ 0.12, 1.25, 0.40]}>
            <sphereGeometry args={[0.06, 10, 8]} />
            <meshStandardMaterial color="#ffdc4a" emissive="#ffa820" emissiveIntensity={1.4} />
          </mesh>
          {/* contact shadow */}
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.6, 18]} />
            <meshBasicMaterial color="#000" transparent opacity={0.55} />
          </mesh>
          {/* dark-hand tendril — appears during 'striking' state, scale along
              local Y is set per-frame to grow from 0 → full reach */}
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
            <cylinderGeometry args={[1, 1, 1, 8]} />
            <meshStandardMaterial color="#1a0020" emissive="#a020c0" emissiveIntensity={1.0} transparent opacity={0.85} />
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
      {/* Night cave atmosphere — keep it dark, but give the air a faint cool
          tint so the warm lantern glow reads against a cold periphery. Mirrors
          Piper's NIGHT preset, dialed down ~30% since this game lives in a
          cave rather than an open pasture. */}
      <fog attach="fog" args={['#080c14', 6, 22]} />
      <ambientLight intensity={0.20} color="#1a2436" />
      <hemisphereLight args={['#2a3450', '#080a12', 0.18]} />
      <Fireflies />
      {/* Floor: dark damp stone */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[ARENA_HALF * 4, ARENA_HALF * 4]} />
        <meshStandardMaterial color="#241c14" roughness={0.85} />
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

      <Pillars state={state} />
      <Crystals state={state} />
      <Walls state={state} />
      <Player state={state} />
      <Monsters state={state} />
    </>
  );
}
