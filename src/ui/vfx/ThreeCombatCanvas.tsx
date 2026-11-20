import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { IThreeVfxCue } from './vfxClassifier';

interface ThreeCombatCanvasProps {
  cue: IThreeVfxCue | null;
  enabled: boolean;
}

interface IActiveThreeEffect {
  group: THREE.Group;
  age: number;
  duration: number;
  update: (dt: number, progress: number) => void;
  dispose: () => void;
}

function disposeGroupResources(group: THREE.Group): void {
  group.traverse((obj) => {
    if (
      obj instanceof THREE.Mesh ||
      obj instanceof THREE.Line ||
      obj instanceof THREE.Points
    ) {
      obj.geometry.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) {
        mat.forEach((m) => m.dispose());
      } else {
        mat.dispose();
      }
    }
  });
}

function createEffect(cue: IThreeVfxCue): IActiveThreeEffect {
  const group = new THREE.Group();
  const startY = cue.direction === 'UP' ? -2.2 : cue.direction === 'DOWN' ? 2.2 : 0;
  const endY = cue.direction === 'UP' ? 2.1 : cue.direction === 'DOWN' ? -2.1 : 0;
  const dirSign = cue.direction === 'UP' ? 1 : -1;

  // ===================== 1. STAND RUSH (ORA ORA / MUDA MUDA) =====================
  if (cue.vfxType === 'STAND_RUSH') {
    const duration = 1.15;
    const streaks: { mesh: THREE.Mesh; delay: number; xOffset: number; speed: number; z: number }[] = [];
    const coneGeo = new THREE.ConeGeometry(0.13, 1.05, 5);

    for (let i = 0; i < 36; i++) {
      const color = i % 3 === 0 ? 0xf2c12e : i % 3 === 1 ? 0xe6194b : 0xfff5c0;
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.96 });
      const mesh = new THREE.Mesh(coneGeo.clone(), mat);
      const xOffset = (Math.random() - 0.5) * 3.1;
      const z = (Math.random() - 0.5) * 1.4;
      mesh.rotation.z = dirSign > 0 ? 0 : Math.PI;
      mesh.position.set(xOffset, startY, z);
      group.add(mesh);
      streaks.push({
        mesh,
        delay: (i / 36) * 0.36,
        xOffset,
        speed: 1.65 + Math.random() * 0.65,
        z,
      });
    }
    coneGeo.dispose();

    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xfff5c0,
      transparent: true,
      opacity: 0.9,
    });
    const flashCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 1), flashMat);
    flashCore.position.set(0, endY, 0.3);
    group.add(flashCore);

    const ringMat1 = new THREE.MeshBasicMaterial({
      color: 0xf2c12e,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    });
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.065, 10, 36), ringMat1);
    ring1.position.set(0, endY, 0.2);
    ring1.rotation.x = 0.55;
    group.add(ring1);

    const ringMat2 = new THREE.MeshBasicMaterial({
      color: 0xe6194b,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.05, 10, 36), ringMat2);
    ring2.position.set(0, endY, 0.1);
    ring2.rotation.x = -0.55;
    group.add(ring2);

    return {
      group,
      age: 0,
      duration,
      update: (dt, p) => {
        for (const s of streaks) {
          const local = Math.max(0, Math.min(1, (p - s.delay) * s.speed));
          const ease = 1 - Math.pow(1 - local, 2);
          s.mesh.position.y = THREE.MathUtils.lerp(startY, endY, ease);
          s.mesh.position.x = THREE.MathUtils.lerp(s.xOffset, s.xOffset * 0.22, ease);
          const mat = s.mesh.material as THREE.MeshBasicMaterial;
          mat.opacity = local > 0 && local < 1 ? Math.sin(local * Math.PI) : 0;
        }
        const impact = Math.max(0, (p - 0.18) / 0.82);
        flashCore.rotation.z += dt * 9;
        flashCore.rotation.y += dt * 7;
        flashCore.scale.setScalar(0.35 + Math.sin(impact * Math.PI) * 2.5);
        flashMat.opacity = impact > 0 ? Math.max(0, 1 - impact * 1.25) : 0;

        ring1.scale.setScalar(0.4 + impact * 5.0);
        ring1.rotation.z = p * 5.5;
        ringMat1.opacity = Math.max(0, 1 - impact);

        ring2.scale.setScalar(0.3 + impact * 4.0);
        ring2.rotation.z = -p * 6.5;
        ringMat2.opacity = Math.max(0, 1 - impact * 1.1);
      },
      dispose: () => disposeGroupResources(group),
    };
  }

  // ===================== 2. FIRE / EXPLOSION / BURN =====================
  if (cue.vfxType === 'FIRE_EXPLOSION') {
    const duration = 1.25;
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xff5a1f,
      wireframe: true,
      transparent: true,
      opacity: 0.9,
    });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), coreMat);
    core.position.set(0, endY, 0);
    group.add(core);

    const flameRingMat = new THREE.MeshBasicMaterial({
      color: 0xf2c12e,
      transparent: true,
      opacity: 0.85,
    });
    const flameRing = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 10, 28), flameRingMat);
    flameRing.position.set(0, endY, 0);
    group.add(flameRing);

    const embers: { mesh: THREE.Mesh; vel: THREE.Vector3 }[] = [];
    for (let i = 0; i < 42; i++) {
      const m = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.09 + Math.random() * 0.09, 0),
        new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? 0xff4500 : 0xffcc33,
          transparent: true,
          opacity: 1,
        }),
      );
      m.position.set(0, endY, 0);
      const angle = Math.random() * Math.PI * 2;
      const spd = 1.4 + Math.random() * 3.8;
      group.add(m);
      embers.push({
        mesh: m,
        vel: new THREE.Vector3(
          Math.cos(angle) * spd,
          Math.sin(angle) * spd + 0.9,
          (Math.random() - 0.5) * 2.5,
        ),
      });
    }

    return {
      group,
      age: 0,
      duration,
      update: (dt, p) => {
        core.rotation.x += dt * 4.5;
        core.rotation.y += dt * 5.2;
        core.scale.setScalar(0.5 + Math.sin(p * Math.PI) * 2.6);
        coreMat.opacity = Math.max(0, 1 - p);

        flameRing.rotation.x = p * 5;
        flameRing.rotation.y = p * 4;
        flameRing.scale.setScalar(0.4 + p * 4.5);
        flameRingMat.opacity = Math.max(0, 1 - p * 1.1);

        for (const e of embers) {
          e.mesh.position.addScaledVector(e.vel, dt);
          e.mesh.rotation.x += dt * 7;
          e.mesh.rotation.y += dt * 6;
          e.vel.multiplyScalar(0.97);
          const mat = e.mesh.material as THREE.MeshBasicMaterial;
          mat.opacity = Math.max(0, 1 - p * 1.05);
        }
      },
      dispose: () => disposeGroupResources(group),
    };
  }

  // ===================== 3. HAMON / ELECTRIC OVERDRIVE =====================
  if (cue.vfxType === 'HAMON_ELECTRIC') {
    const duration = 1.15;
    const rings: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; offset: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i === 1 ? 0xfff59d : 0xf2c12e,
        transparent: true,
        opacity: 0.95,
      });
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.045, 8, 36), mat);
      mesh.position.set(0, endY, 0);
      group.add(mesh);
      rings.push({ mesh, mat, offset: i * 0.14 });
    }

    const bolts: THREE.Line[] = [];
    for (let b = 0; b < 5; b++) {
      const pts: THREE.Vector3[] = [];
      const segments = 9;
      for (let s = 0; s <= segments; s++) {
        const t = s / segments;
        const y = THREE.MathUtils.lerp(startY, endY, t);
        const jitter = s === 0 || s === segments ? 0 : (Math.random() - 0.5) * 1.5;
        pts.push(new THREE.Vector3(jitter, y, (Math.random() - 0.5) * 0.8));
      }
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const lineMat = new THREE.LineBasicMaterial({
        color: b % 2 === 0 ? 0xfef08a : 0xfacc15,
        transparent: true,
        opacity: 1,
      });
      const line = new THREE.Line(lineGeo, lineMat);
      group.add(line);
      bolts.push(line);
    }

    return {
      group,
      age: 0,
      duration,
      update: (_dt, p) => {
        for (const r of rings) {
          const local = Math.max(0, Math.min(1, (p - r.offset) / 0.72));
          r.mesh.scale.setScalar(0.3 + local * 4.8);
          r.mesh.rotation.z = p * 7;
          r.mesh.rotation.x = 0.65;
          r.mat.opacity = local > 0 ? Math.max(0, 1 - local) : 0;
        }
        for (const bolt of bolts) {
          const mat = bolt.material as THREE.LineBasicMaterial;
          mat.opacity = Math.max(0, (1 - p) * (0.65 + Math.random() * 0.35));
          bolt.rotation.y = Math.sin(p * 30) * 0.18;
        }
      },
      dispose: () => disposeGroupResources(group),
    };
  }

  // ===================== 4. WATER / ICE SHARDS =====================
  if (cue.vfxType === 'WATER_ICE') {
    const duration = 1.15;
    const shards: { mesh: THREE.Mesh; startX: number; delay: number }[] = [];
    for (let i = 0; i < 28; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0x38bdf8 : 0xe0f2fe,
        transparent: true,
        opacity: 0.92,
      });
      const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), mat);
      mesh.scale.set(0.6, 2.2, 0.6);
      const startX = (Math.random() - 0.5) * 3.4;
      mesh.position.set(startX, startY, (Math.random() - 0.5) * 1.1);
      group.add(mesh);
      shards.push({ mesh, startX, delay: (i / 28) * 0.3 });
    }

    const rippleMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const ripple = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.52, 32), rippleMat);
    ripple.position.set(0, endY, 0);
    group.add(ripple);

    return {
      group,
      age: 0,
      duration,
      update: (dt, p) => {
        for (const s of shards) {
          const local = Math.max(0, Math.min(1, (p - s.delay) * 1.65));
          s.mesh.position.y = THREE.MathUtils.lerp(startY, endY, local);
          s.mesh.position.x = THREE.MathUtils.lerp(s.startX, s.startX * 0.25, local);
          s.mesh.rotation.y += dt * 8;
          const mat = s.mesh.material as THREE.MeshBasicMaterial;
          mat.opacity = local > 0 && local < 1 ? Math.sin(local * Math.PI) : 0;
        }
        const rLocal = Math.max(0, (p - 0.25) / 0.75);
        ripple.scale.setScalar(0.5 + rLocal * 4.5);
        rippleMat.opacity = Math.max(0, 1 - rLocal);
      },
      dispose: () => disposeGroupResources(group),
    };
  }

  // ===================== 5. TIME STOP (ZA WARUDO!) =====================
  if (cue.vfxType === 'TIME_STOP') {
    const duration = 1.85;
    const domeMat = new THREE.MeshBasicMaterial({
      color: 0xf2c12e,
      wireframe: true,
      transparent: true,
      opacity: 0.78,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 16), domeMat);
    group.add(dome);

    const clockRings: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; axis: number }[] = [];
    const colors = [0xf2c12e, 0xe6194b, 0xc084fc];
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: colors[i]!,
        transparent: true,
        opacity: 0.92,
      });
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(1.15 + i * 0.58, 0.06, 10, 48), mat);
      group.add(mesh);
      clockRings.push({ mesh, mat, axis: i });
    }

    // Giant 3D clock hands that whip rapidly then SNAP-FREEZE mid-stop
    const hourPivot = new THREE.Group();
    const hourMat = new THREE.MeshBasicMaterial({ color: 0xf2c12e, transparent: true, opacity: 0.95 });
    const hourBar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.55, 0.08), hourMat);
    hourBar.position.y = 0.7;
    hourPivot.add(hourBar);
    group.add(hourPivot);

    const minPivot = new THREE.Group();
    const minMat = new THREE.MeshBasicMaterial({ color: 0xfff5c0, transparent: true, opacity: 0.95 });
    const minBar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.3, 0.08), minMat);
    minBar.position.y = 1.05;
    minPivot.add(minBar);
    group.add(minPivot);

    // Suspended frozen time shards
    const timeShards: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; drift: THREE.Vector3 }[] = [];
    for (let i = 0; i < 24; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0xf2c12e : 0xc084fc,
        transparent: true,
        opacity: 0.9,
      });
      const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), mat);
      const a = (i / 24) * Math.PI * 2;
      const r = 1.6 + Math.random() * 2.4;
      mesh.position.set(Math.cos(a) * r, Math.sin(a) * r * 0.75, (Math.random() - 0.5) * 1.8);
      group.add(mesh);
      timeShards.push({
        mesh,
        mat,
        drift: new THREE.Vector3(Math.cos(a) * 1.5, Math.sin(a) * 1.5, 0),
      });
    }

    return {
      group,
      age: 0,
      duration,
      update: (dt, p) => {
        const expand = Math.min(1, p * 2.3);
        const frozen = p >= 0.44;
        const fadeOut = p < 0.74 ? 1 : Math.max(0, (1 - p) / 0.26);

        dome.scale.setScalar(0.2 + expand * 10.5);
        dome.rotation.y += dt * (frozen ? 0.06 : 2.9);
        domeMat.opacity = 0.58 * fadeOut;

        // Spin fast, then snap-freeze at mid-duration like Za Warudo!
        const spinFactor = frozen ? 0.03 : 6.4;
        for (const r of clockRings) {
          if (r.axis === 0) r.mesh.rotation.z += dt * spinFactor;
          if (r.axis === 1) r.mesh.rotation.x += dt * spinFactor * 0.9;
          if (r.axis === 2) r.mesh.rotation.y += dt * spinFactor * 1.1;
          r.mesh.scale.setScalar(0.5 + expand * 1.35);
          r.mat.opacity = 0.88 * fadeOut;
        }

        hourPivot.rotation.z -= dt * (frozen ? 0.02 : 4.2);
        minPivot.rotation.z -= dt * (frozen ? 0.02 : 12.5);
        hourMat.opacity = 0.95 * fadeOut;
        minMat.opacity = 0.95 * fadeOut;

        for (const ts of timeShards) {
          if (!frozen) {
            ts.mesh.position.addScaledVector(ts.drift, dt);
            ts.mesh.rotation.x += dt * 7;
            ts.mesh.rotation.y += dt * 7;
          }
          ts.mat.opacity = 0.88 * fadeOut;
        }
      },
      dispose: () => disposeGroupResources(group),
    };
  }

  // ===================== 6. VOID / PSYCHIC (CREAM / THE HAND / REQUIEM) =====================
  if (cue.vfxType === 'VOID_PSYCHIC') {
    const duration = 1.25;
    const knotMat = new THREE.MeshBasicMaterial({
      color: 0xa855f7,
      wireframe: true,
      transparent: true,
      opacity: 0.9,
    });
    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.65, 0.14, 48, 8), knotMat);
    knot.position.set(0, endY, 0);
    group.add(knot);

    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x0b090e,
      transparent: true,
      opacity: 0.95,
    });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 16), coreMat);
    core.position.set(0, endY, 0);
    group.add(core);

    return {
      group,
      age: 0,
      duration,
      update: (dt, p) => {
        const pulse = Math.sin(p * Math.PI);
        knot.rotation.x += dt * 4;
        knot.rotation.y += dt * 5;
        knot.scale.setScalar(0.35 + pulse * 2.1);
        knotMat.opacity = Math.max(0, 1 - p * 0.95);

        core.scale.setScalar(0.2 + pulse * 1.6);
        coreMat.opacity = Math.max(0, 1 - p);
      },
      dispose: () => disposeGroupResources(group),
    };
  }

  // ===================== 7. HEAL / RESTORATION =====================
  if (cue.vfxType === 'HEAL_RESTORE') {
    const duration = 1.2;
    const orbs: { mesh: THREE.Mesh; angle: number; heightOffset: number }[] = [];
    for (let i = 0; i < 28; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0x00e599 : 0xf2c12e,
        transparent: true,
        opacity: 0.95,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 8), mat);
      group.add(mesh);
      orbs.push({ mesh, angle: (i / 28) * Math.PI * 4, heightOffset: (i / 28) * 1.4 });
    }

    return {
      group,
      age: 0,
      duration,
      update: (_dt, p) => {
        for (const o of orbs) {
          const theta = o.angle + p * 6;
          const r = 0.95 * (1 - p * 0.35);
          o.mesh.position.set(
            Math.cos(theta) * r,
            endY - 0.7 + o.heightOffset + p * 1.8,
            Math.sin(theta) * r,
          );
          const mat = o.mesh.material as THREE.MeshBasicMaterial;
          mat.opacity = Math.sin(p * Math.PI);
        }
      },
      dispose: () => disposeGroupResources(group),
    };
  }

  // ===================== 8. EVOLUTION ASCENSION =====================
  if (cue.vfxType === 'EVOLUTION') {
    const duration = 1.7;
    const pillarMat = new THREE.MeshBasicMaterial({
      color: 0xf2c12e,
      transparent: true,
      opacity: 0.46,
      side: THREE.DoubleSide,
    });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.55, 10, 18, 1, true), pillarMat);
    group.add(pillar);

    const crownMat = new THREE.MeshBasicMaterial({
      color: 0xfff5c0,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    });
    const crownRing = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.07, 10, 44), crownMat);
    crownRing.rotation.x = Math.PI / 2;
    group.add(crownRing);

    const stars: { mesh: THREE.Mesh; angle: number; radius: number; yStart: number }[] = [];
    for (let i = 0; i < 44; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? 0xf2c12e : i % 3 === 1 ? 0xfff5c0 : 0xe6194b,
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), mat);
      group.add(mesh);
      stars.push({
        mesh,
        angle: (i / 44) * Math.PI * 8,
        radius: 0.85 + Math.random() * 1.9,
        yStart: -3.1 + Math.random() * 2.6,
      });
    }

    return {
      group,
      age: 0,
      duration,
      update: (dt, p) => {
        pillar.rotation.y += dt * 3.6;
        pillar.scale.x = 0.45 + Math.sin(p * Math.PI) * 1.55;
        pillar.scale.z = pillar.scale.x;
        pillarMat.opacity = Math.sin(p * Math.PI) * 0.48;

        crownRing.position.y = -2.2 + p * 4.4;
        crownRing.scale.setScalar(0.6 + p * 3.4);
        crownRing.rotation.z += dt * 5;
        crownMat.opacity = Math.sin(p * Math.PI) * 0.92;

        for (const st of stars) {
          const a = st.angle + p * 6;
          st.mesh.position.set(
            Math.cos(a) * st.radius,
            st.yStart + p * 5.8,
            Math.sin(a) * st.radius,
          );
          st.mesh.rotation.x += dt * 7;
          st.mesh.rotation.y += dt * 7;
          const mat = st.mesh.material as THREE.MeshBasicMaterial;
          mat.opacity = Math.sin(p * Math.PI);
        }
      },
      dispose: () => disposeGroupResources(group),
    };
  }

  // ===================== 9. KO SHATTER =====================
  const duration = 1.45;
  const shards: { mesh: THREE.Mesh; vel: THREE.Vector3; rot: THREE.Vector3 }[] = [];
  for (let i = 0; i < 56; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: i % 3 === 0 ? 0xe6194b : i % 3 === 1 ? 0xf2c12e : 0x1e1729,
      transparent: true,
      opacity: 1,
    });
    const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.17, 0), mat);
    mesh.position.set(0, endY, 0);
    const angle = Math.random() * Math.PI * 2;
    const speed = 2.4 + Math.random() * 5.2;
    group.add(mesh);
    shards.push({
      mesh,
      vel: new THREE.Vector3(Math.cos(angle) * speed, Math.sin(angle) * speed, (Math.random() - 0.5) * 4.2),
      rot: new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9),
    });
  }

  const blastMat = new THREE.MeshBasicMaterial({
    color: 0xe6194b,
    transparent: true,
    opacity: 0.96,
  });
  const blast = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.09, 10, 40), blastMat);
  blast.position.set(0, endY, 0);
  group.add(blast);

  const blast2Mat = new THREE.MeshBasicMaterial({
    color: 0xf2c12e,
    transparent: true,
    opacity: 0.9,
  });
  const blast2 = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.065, 10, 40), blast2Mat);
  blast2.position.set(0, endY, 0.2);
  blast2.rotation.x = 0.65;
  group.add(blast2);

  const slashMat = new THREE.MeshBasicMaterial({
    color: 0xfff5c0,
    transparent: true,
    opacity: 0.95,
  });
  const slashPlane = new THREE.Mesh(new THREE.PlaneGeometry(11, 0.28), slashMat);
  slashPlane.position.set(0, endY, 0.35);
  slashPlane.rotation.z = -0.35;
  group.add(slashPlane);

  return {
    group,
    age: 0,
    duration,
    update: (dt, p) => {
      blast.scale.setScalar(0.3 + p * 6.4);
      blastMat.opacity = Math.max(0, 1 - p);

      const p2 = Math.max(0, (p - 0.1) / 0.9);
      blast2.scale.setScalar(0.25 + p2 * 5.4);
      blast2.rotation.z += dt * 5;
      blast2Mat.opacity = p2 > 0 ? Math.max(0, 1 - p2) : 0;

      const sp = Math.min(1, p * 3.5);
      slashPlane.scale.set(0.2 + sp * 1.4, 1 + sp * 2.5, 1);
      slashMat.opacity = Math.max(0, 1 - sp);

      for (const sh of shards) {
        sh.mesh.position.addScaledVector(sh.vel, dt);
        sh.vel.y -= dt * 2.9;
        sh.mesh.rotation.x += sh.rot.x * dt;
        sh.mesh.rotation.y += sh.rot.y * dt;
        const mat = sh.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, 1 - p * 1.05);
      }
    },
    dispose: () => disposeGroupResources(group),
  };
}

export function ThreeCombatCanvas({ cue, enabled }: ThreeCombatCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const activeEffectsRef = useRef<IActiveThreeEffect[]>([]);
  const shakeRef = useRef(0);
  const lastCueIdRef = useRef<string | null>(null);

  // Initialize Three.js WebGL stage once (zero React re-renders per frame)
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
      52,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.1,
      100,
    );
    camera.position.set(0, 0, 7.2);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // Subtle ambient 3D JoJo golden motes
    const moteCount = 75;
    const positions = new Float32Array(moteCount * 3);
    for (let i = 0; i < moteCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 9;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 5 - 1.5;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const moteMat = new THREE.PointsMaterial({
      color: 0xf2c12e,
      size: 0.06,
      transparent: true,
      opacity: 0.35,
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

      motes.rotation.y += dt * 0.05;
      motes.rotation.x += dt * 0.02;

      // 3D WebGL impact camera shake
      if (shakeRef.current > 0.002) {
        camera.position.x = (Math.random() - 0.5) * shakeRef.current;
        camera.position.y = (Math.random() - 0.5) * shakeRef.current;
        shakeRef.current *= Math.pow(0.03, dt);
      } else {
        camera.position.x = 0;
        camera.position.y = 0;
      }

      const effects = activeEffectsRef.current;
      for (let i = effects.length - 1; i >= 0; i--) {
        const fx = effects[i]!;
        fx.age += dt;
        const progress = Math.min(1, fx.age / fx.duration);
        fx.update(dt, progress);
        if (fx.age >= fx.duration) {
          scene.remove(fx.group);
          fx.dispose();
          effects.splice(i, 1);
        }
      }

      renderer.render(scene, camera);
    };
    rafId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      for (const fx of activeEffectsRef.current) {
        scene.remove(fx.group);
        fx.dispose();
      }
      activeEffectsRef.current = [];
      moteGeo.dispose();
      moteMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
    };
  }, [enabled]);

  // Spawn new 3D VFX effect imperatively whenever a new combat cue arrives
  useEffect(() => {
    if (!enabled || !cue || !sceneRef.current) return;
    if (lastCueIdRef.current === cue.id) return;
    lastCueIdRef.current = cue.id;

    const fx = createEffect(cue);
    sceneRef.current.add(fx.group);
    activeEffectsRef.current.push(fx);

    // Proportional WebGL camera punch shake
    const shakeStrength: Record<IThreeVfxCue['vfxType'], number> = {
      KO_SHATTER: 0.56,
      TIME_STOP: 0.48,
      EVOLUTION: 0.38,
      FIRE_EXPLOSION: 0.36,
      STAND_RUSH: 0.28,
      HAMON_ELECTRIC: 0.26,
      VOID_PSYCHIC: 0.26,
      WATER_ICE: 0.22,
      HEAL_RESTORE: 0.08,
    };
    shakeRef.current = Math.max(shakeRef.current, shakeStrength[cue.vfxType] ?? 0.22);
  }, [cue, enabled]);

  if (!enabled) return null;

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-25 overflow-hidden"
    />
  );
}
