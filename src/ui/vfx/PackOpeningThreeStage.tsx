import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { CardRarity } from '../../data/progressionData';

export interface PackVfxSignal {
  id: number;
  kind: 'TEAR' | 'SR_REVEAL' | 'UR_JACKPOT';
  accentHex?: string;
}

interface PackOpeningThreeStageProps {
  highestRarity: CardRarity;
  signal: PackVfxSignal | null;
  enabled?: boolean;
  className?: string;
}

interface BurstEffect {
  group: THREE.Group;
  age: number;
  duration: number;
  update: (dt: number, p: number) => void;
  dispose: () => void;
}

function disposeGroup(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.Points) {
      obj.geometry.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    }
  });
}

function hexToInt(hex: string | undefined, fallback: number): number {
  if (!hex) return fallback;
  const clean = hex.replace('#', '');
  const parsed = Number.parseInt(clean, 16);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function createPackBurst(signal: PackVfxSignal): BurstEffect {
  const group = new THREE.Group();
  const isUr = signal.kind === 'UR_JACKPOT';
  const isSr = signal.kind === 'SR_REVEAL';
  const accent = hexToInt(signal.accentHex, isUr ? 0xf2c12e : isSr ? 0xe6194b : 0x38bdf8);
  const duration = isUr ? 2.1 : isSr ? 1.25 : 1.35;

  // Shockwave rings
  const ringCount = isUr ? 4 : isSr ? 2 : 3;
  const rings: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; delay: number; maxScale: number }[] =
    [];
  for (let i = 0; i < ringCount; i++) {
    const color = isUr
      ? i % 2 === 0
        ? 0xf2c12e
        : 0xe6194b
      : i === 0
        ? accent
        : 0xf2c12e;
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.42 + i * 0.12, isUr ? 0.08 : 0.055, 10, 44),
      mat,
    );
    mesh.rotation.x = (i - 1) * 0.42;
    group.add(mesh);
    rings.push({ mesh, mat, delay: i * 0.08, maxScale: isUr ? 7.5 : 5.2 });
  }

  // Horizontal slash blade beam on TEAR
  let slashBeam: THREE.Mesh | null = null;
  let slashMat: THREE.MeshBasicMaterial | null = null;
  if (signal.kind === 'TEAR') {
    slashMat = new THREE.MeshBasicMaterial({
      color: 0xfff3b0,
      transparent: true,
      opacity: 1,
    });
    slashBeam = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.24), slashMat);
    slashBeam.rotation.z = 0.08;
    slashBeam.position.set(0, 1.1, 1.2);
    group.add(slashBeam);
  }

  // Golden ascension pillar & time dome on UR_JACKPOT
  let dome: THREE.Mesh | null = null;
  let domeMat: THREE.MeshBasicMaterial | null = null;
  let pillar: THREE.Mesh | null = null;
  let pillarMat: THREE.MeshBasicMaterial | null = null;
  if (isUr) {
    domeMat = new THREE.MeshBasicMaterial({
      color: 0xf2c12e,
      wireframe: true,
      transparent: true,
      opacity: 0.65,
    });
    dome = new THREE.Mesh(new THREE.SphereGeometry(0.8, 18, 14), domeMat);
    group.add(dome);

    pillarMat = new THREE.MeshBasicMaterial({
      color: 0xf2c12e,
      transparent: true,
      opacity: 0.48,
      side: THREE.DoubleSide,
    });
    pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.8, 11, 18, 1, true), pillarMat);
    group.add(pillar);
  }

  // Explosive 3D crystalline stars / shards
  const shardCount = isUr ? 88 : isSr ? 38 : 58;
  const shards: { mesh: THREE.Mesh; vel: THREE.Vector3; rot: THREE.Vector3 }[] = [];
  for (let i = 0; i < shardCount; i++) {
    const color = isUr
      ? i % 3 === 0
        ? 0xf2c12e
        : i % 3 === 1
          ? 0xfff5c0
          : 0xe6194b
      : isSr
        ? i % 2 === 0
          ? 0xe6194b
          : 0xf2c12e
        : i % 2 === 0
          ? accent
          : 0xf2c12e;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
    const geo =
      i % 2 === 0
        ? new THREE.OctahedronGeometry(isUr ? 0.16 : 0.12, 0)
        : new THREE.TetrahedronGeometry(isUr ? 0.17 : 0.13, 0);
    const mesh = new THREE.Mesh(geo, mat);
    const theta = Math.random() * Math.PI * 2;
    const phi = (Math.random() - 0.5) * Math.PI;
    const speed = (isUr ? 3.2 : 2.3) + Math.random() * (isUr ? 5.6 : 4.2);
    group.add(mesh);
    shards.push({
      mesh,
      vel: new THREE.Vector3(
        Math.cos(theta) * Math.cos(phi) * speed,
        Math.sin(phi) * speed + 0.6,
        (Math.random() - 0.5) * 4.5,
      ),
      rot: new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9),
    });
  }

  return {
    group,
    age: 0,
    duration,
    update: (dt, p) => {
      for (const r of rings) {
        const local = Math.max(0, Math.min(1, (p - r.delay) / (1 - r.delay)));
        const ease = 1 - Math.pow(1 - local, 3);
        r.mesh.scale.setScalar(0.35 + ease * r.maxScale);
        r.mesh.rotation.z += dt * (isUr ? 4.5 : 3.2);
        r.mat.opacity = local > 0 ? Math.max(0, 1 - local) : 0;
      }

      if (slashBeam && slashMat) {
        const sp = Math.min(1, p * 3.2);
        slashBeam.scale.set(0.2 + sp * 1.4, 1 + sp * 3.5, 1);
        slashMat.opacity = Math.max(0, 1 - sp);
      }

      if (dome && domeMat && pillar && pillarMat) {
        const expand = Math.min(1, p * 2.1);
        dome.scale.setScalar(0.3 + expand * 9.5);
        dome.rotation.y += dt * (p < 0.45 ? 3.4 : 0.35);
        domeMat.opacity = p < 0.65 ? 0.55 : Math.max(0, (1 - p) / 0.35) * 0.55;

        pillar.rotation.y -= dt * 3.8;
        pillar.scale.x = 0.4 + Math.sin(p * Math.PI) * 1.6;
        pillar.scale.z = pillar.scale.x;
        pillarMat.opacity = Math.sin(p * Math.PI) * 0.48;
      }

      for (const s of shards) {
        s.mesh.position.addScaledVector(s.vel, dt);
        s.vel.multiplyScalar(0.975);
        s.vel.y -= dt * 1.4;
        s.mesh.rotation.x += s.rot.x * dt;
        s.mesh.rotation.y += s.rot.y * dt;
        const mat = s.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, 1 - p * 1.05);
      }
    },
    dispose: () => disposeGroup(group),
  };
}

export function PackOpeningThreeStage({
  highestRarity,
  signal,
  enabled = true,
  className = 'pointer-events-none fixed inset-0 z-20 overflow-hidden',
}: PackOpeningThreeStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const burstsRef = useRef<BurstEffect[]>([]);
  const shakeRef = useRef(0);
  const lastSignalIdRef = useRef<number | null>(null);
  const rarityRef = useRef<CardRarity>(highestRarity);
  rarityRef.current = highestRarity;

  useEffect(() => {
    if (!enabled) return;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      return;
    }

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      54,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.1,
      100,
    );
    camera.position.set(0, 0, 7.4);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // Ambient orbital rings + golden stardust around the pack opening stage
    const isUr = rarityRef.current === 'BIZARRE_RARE';
    const isSr = rarityRef.current === 'SUPER_RARE';
    const auraColor = isUr ? 0xf2c12e : isSr ? 0xe6194b : 0x38bdf8;

    const auraGroup = new THREE.Group();
    const ring1Mat = new THREE.MeshBasicMaterial({
      color: auraColor,
      transparent: true,
      opacity: isUr ? 0.34 : isSr ? 0.24 : 0.16,
    });
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.03, 8, 56), ring1Mat);
    ring1.rotation.x = 1.1;
    auraGroup.add(ring1);

    const ring2Mat = new THREE.MeshBasicMaterial({
      color: isUr ? 0xe6194b : 0xf2c12e,
      transparent: true,
      opacity: isUr ? 0.28 : 0.14,
    });
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.024, 8, 56), ring2Mat);
    ring2.rotation.x = -0.9;
    ring2.rotation.y = 0.5;
    auraGroup.add(ring2);
    scene.add(auraGroup);

    const moteCount = isUr ? 140 : 95;
    const positions = new Float32Array(moteCount * 3);
    for (let i = 0; i < moteCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 9;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 5 - 1;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const moteMat = new THREE.PointsMaterial({
      color: auraColor,
      size: isUr ? 0.095 : 0.07,
      transparent: true,
      opacity: isUr ? 0.72 : 0.45,
    });
    const motes = new THREE.Points(moteGeo, moteMat);
    scene.add(motes);

    const handleResize = () => {
      if (!container) return;
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    let rafId = 0;
    let lastTime = performance.now();

    const animate = (now: number) => {
      rafId = window.requestAnimationFrame(animate);
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const spinSpeed = rarityRef.current === 'BIZARRE_RARE' ? 1.45 : 0.7;
      ring1.rotation.z += dt * spinSpeed;
      ring2.rotation.z -= dt * spinSpeed * 0.85;
      ring2.rotation.y += dt * 0.4;
      motes.rotation.y += dt * 0.14;
      motes.rotation.z += dt * 0.04;

      // Subtle camera punch shake on bursts
      if (shakeRef.current > 0.001) {
        camera.position.x = (Math.random() - 0.5) * shakeRef.current;
        camera.position.y = (Math.random() - 0.5) * shakeRef.current;
        shakeRef.current *= Math.pow(0.04, dt);
      } else {
        camera.position.x = 0;
        camera.position.y = 0;
      }

      const bursts = burstsRef.current;
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i]!;
        b.age += dt;
        const p = Math.min(1, b.age / b.duration);
        b.update(dt, p);
        if (b.age >= b.duration) {
          scene.remove(b.group);
          b.dispose();
          bursts.splice(i, 1);
        }
      }

      renderer.render(scene, camera);
    };
    rafId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      for (const b of burstsRef.current) {
        scene.remove(b.group);
        b.dispose();
      }
      burstsRef.current = [];
      disposeGroup(auraGroup);
      moteGeo.dispose();
      moteMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
    };
  }, [enabled, highestRarity]);

  useEffect(() => {
    if (!enabled || !signal || !sceneRef.current) return;
    if (lastSignalIdRef.current === signal.id) return;
    lastSignalIdRef.current = signal.id;

    const burst = createPackBurst(signal);
    sceneRef.current.add(burst.group);
    burstsRef.current.push(burst);
    shakeRef.current =
      signal.kind === 'UR_JACKPOT' ? 0.55 : signal.kind === 'TEAR' ? 0.34 : 0.22;
  }, [signal, enabled]);

  if (!enabled) return null;

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={className}
    />
  );
}
