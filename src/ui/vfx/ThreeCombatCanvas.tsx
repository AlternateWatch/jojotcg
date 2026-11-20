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

interface EffectAnchors {
  start: THREE.Vector3;
  end: THREE.Vector3;
  angle: number;
  perp: THREE.Vector3;
  distance: number;
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

function screenToWorld(
  clientX: number,
  clientY: number,
  camera: THREE.PerspectiveCamera,
  rect: DOMRect,
): THREE.Vector3 {
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const ndcX = ((clientX - rect.left) / width) * 2 - 1;
  const ndcY = -((clientY - rect.top) / height) * 2 + 1;
  const vFovRad = THREE.MathUtils.degToRad(camera.fov);
  const visibleHeight = 2 * Math.tan(vFovRad / 2) * camera.position.z;
  const visibleWidth = visibleHeight * camera.aspect;
  return new THREE.Vector3(ndcX * (visibleWidth / 2), ndcY * (visibleHeight / 2), 0);
}

function getElementWorldCenter(
  selector: string,
  camera: THREE.PerspectiveCamera,
  canvasRect: DOMRect,
): THREE.Vector3 | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  return screenToWorld(r.left + r.width / 2, r.top + r.height / 2, camera, canvasRect);
}

function resolveCueAnchors(
  cue: IThreeVfxCue,
  camera: THREE.PerspectiveCamera,
  container: HTMLDivElement,
): EffectAnchors {
  const canvasRect = container.getBoundingClientRect();

  // Safe fallbacks aligned to the actual battlefield cards (NOT the player hand at the bottom)
  const fallbackStartY = cue.direction === 'UP' ? -0.75 : cue.direction === 'DOWN' ? 1.55 : 0;
  const fallbackEndY = cue.direction === 'UP' ? 1.55 : cue.direction === 'DOWN' ? -0.75 : 0;
  let start = new THREE.Vector3(0, fallbackStartY, 0);
  let end = new THREE.Vector3(0, fallbackEndY, 0);

  if (cue.vfxType === 'TIME_STOP') {
    start = new THREE.Vector3(0, 0.35, 0);
    end = new THREE.Vector3(0, 0.35, 0);
  } else {
    // 1. Target card: prefer exact instanceId, fallback to target player's Active slot
    let resolvedEnd: THREE.Vector3 | null = null;
    if (cue.targetInstanceId) {
      resolvedEnd = getElementWorldCenter(
        `[data-vfx-instance="${cue.targetInstanceId}"]`,
        camera,
        canvasRect,
      );
    }
    if (!resolvedEnd && cue.targetPlayerId) {
      resolvedEnd = getElementWorldCenter(
        `[data-vfx-owner="${cue.targetPlayerId}"][data-vfx-zone="ACTIVE"]`,
        camera,
        canvasRect,
      );
    }
    if (resolvedEnd) {
      end = resolvedEnd;
    }

    // 2. Source card: attacker's Active slot (or same as target for self-centered effects)
    let resolvedStart: THREE.Vector3 | null = null;
    if (cue.sourcePlayerId && cue.sourcePlayerId !== cue.targetPlayerId) {
      resolvedStart = getElementWorldCenter(
        `[data-vfx-owner="${cue.sourcePlayerId}"][data-vfx-zone="ACTIVE"]`,
        camera,
        canvasRect,
      );
    } else if (cue.sourcePlayerId === cue.targetPlayerId && resolvedEnd) {
      resolvedStart = resolvedEnd.clone();
    }
    if (resolvedStart) {
      start = resolvedStart;
    }
  }

  const delta = new THREE.Vector3().subVectors(end, start);
  const distance = delta.length();
  const dir = distance > 0.05 ? delta.clone().normalize() : new THREE.Vector3(0, cue.direction === 'DOWN' ? -1 : 1, 0);
  const angle = Math.atan2(dir.y, dir.x) - Math.PI / 2;
  const perp = new THREE.Vector3(-dir.y, dir.x, 0);

  return { start, end, angle, perp, distance };
}

function createEffect(cue: IThreeVfxCue, anchors: EffectAnchors): IActiveThreeEffect {
  const group = new THREE.Group();
  const { start, end, angle, perp, distance } = anchors;

  // ===================== 1. STAND RUSH (ORA ORA / MUDA MUDA) =====================
  if (cue.vfxType === 'STAND_RUSH') {
    const duration = 1.12;
    const streaks: {
      mesh: THREE.Mesh;
      delay: number;
      lateral: number;
      speed: number;
      z: number;
    }[] = [];
    const coneGeo = new THREE.ConeGeometry(0.11, 0.95, 5);

    // Kinetic rush beam connecting attacker card -> target card
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xf2c12e,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
    });
    const beamLen = Math.max(0.6, distance);
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(0.55, beamLen), beamMat);
    beam.position.copy(start).lerp(end, 0.5);
    beam.position.z = -0.1;
    beam.rotation.z = angle;
    group.add(beam);

    // 38 oriented Stand fist streaks flying directly from attacker card -> target card
    for (let i = 0; i < 38; i++) {
      const color = i % 3 === 0 ? 0xf2c12e : i % 3 === 1 ? 0xe6194b : 0xfff5c0;
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.98 });
      const mesh = new THREE.Mesh(coneGeo.clone(), mat);
      const lateral = (Math.random() - 0.5) * 1.45;
      const z = (Math.random() - 0.5) * 0.9;
      mesh.rotation.z = angle;
      mesh.position.copy(start).addScaledVector(perp, lateral);
      mesh.position.z = z;
      group.add(mesh);
      streaks.push({
        mesh,
        delay: (i / 38) * 0.34,
        lateral,
        speed: 1.85 + Math.random() * 0.65,
        z,
      });
    }
    coneGeo.dispose();

    // Anime cross-flare impact flash centered directly on target card
    const flareMat = new THREE.MeshBasicMaterial({
      color: 0xfff8cc,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    });
    const flareH = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.22), flareMat);
    flareH.position.set(end.x, end.y, 0.35);
    flareH.rotation.z = 0.28;
    group.add(flareH);

    const flareV = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.22), flareMat.clone());
    flareV.position.set(end.x, end.y, 0.35);
    flareV.rotation.z = 0.28 + Math.PI / 2;
    group.add(flareV);

    // Dual shockwave rings erupting at target card
    const ringMat1 = new THREE.MeshBasicMaterial({
      color: 0xf2c12e,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    });
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.055, 10, 36), ringMat1);
    ring1.position.set(end.x, end.y, 0.22);
    ring1.rotation.x = 0.5;
    group.add(ring1);

    const ringMat2 = new THREE.MeshBasicMaterial({
      color: 0xe6194b,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.045, 10, 36), ringMat2);
    ring2.position.set(end.x, end.y, 0.14);
    ring2.rotation.x = -0.5;
    group.add(ring2);

    // 26 radial impact sparks bursting off target card
    const sparks: { mesh: THREE.Mesh; vel: THREE.Vector3 }[] = [];
    for (let i = 0; i < 26; i++) {
      const spMat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0xf2c12e : 0xe6194b,
        transparent: true,
        opacity: 1,
      });
      const sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), spMat);
      sp.position.set(end.x, end.y, 0.25);
      const a = Math.random() * Math.PI * 2;
      const spd = 1.6 + Math.random() * 3.4;
      group.add(sp);
      sparks.push({
        mesh: sp,
        vel: new THREE.Vector3(Math.cos(a) * spd, Math.sin(a) * spd, (Math.random() - 0.5) * 2.2),
      });
    }

    return {
      group,
      age: 0,
      duration,
      update: (dt, p) => {
        beam.scale.x = 0.4 + Math.sin(p * Math.PI) * 1.1;
        beamMat.opacity = Math.sin(p * Math.PI) * 0.35;

        for (const s of streaks) {
          const local = Math.max(0, Math.min(1, (p - s.delay) * s.speed));
          const ease = 1 - Math.pow(1 - local, 2);
          s.mesh.position.lerpVectors(start, end, ease);
          s.mesh.position.addScaledVector(perp, s.lateral * (1 - ease * 0.78));
          s.mesh.position.z = s.z * (1 - ease * 0.6);
          const mat = s.mesh.material as THREE.MeshBasicMaterial;
          mat.opacity = local > 0 && local < 1 ? Math.sin(local * Math.PI) : 0;
        }

        const impact = Math.max(0, (p - 0.16) / 0.84);
        const flareScale = Math.sin(Math.min(1, impact * 2.2) * Math.PI) * 1.45;
        flareH.scale.set(0.3 + flareScale, 0.6 + flareScale * 0.5, 1);
        flareV.scale.set(0.3 + flareScale, 0.6 + flareScale * 0.5, 1);
        flareH.rotation.z += dt * 3.5;
        flareV.rotation.z += dt * 3.5;
        flareMat.opacity = impact > 0 ? Math.max(0, 1 - impact * 1.5) : 0;
        (flareV.material as THREE.MeshBasicMaterial).opacity = flareMat.opacity;

        ring1.scale.setScalar(0.35 + impact * 4.4);
        ring1.rotation.z = p * 5.5;
        ringMat1.opacity = impact > 0 ? Math.max(0, 1 - impact) : 0;

        ring2.scale.setScalar(0.28 + impact * 3.5);
        ring2.rotation.z = -p * 6.5;
        ringMat2.opacity = impact > 0 ? Math.max(0, 1 - impact * 1.1) : 0;

        for (const sp of sparks) {
          if (impact > 0) {
            sp.mesh.position.addScaledVector(sp.vel, dt);
            sp.vel.multiplyScalar(0.95);
            sp.mesh.rotation.z += dt * 8;
          }
          const mat = sp.mesh.material as THREE.MeshBasicMaterial;
          mat.opacity = impact > 0 ? Math.max(0, 1 - impact * 1.1) : 0;
        }
      },
      dispose: () => disposeGroupResources(group),
    };
  }

  // ===================== 2. FIRE / EXPLOSION / BURN =====================
  if (cue.vfxType === 'FIRE_EXPLOSION') {
    const duration = 1.28;
    const hasTravel = distance > 0.45;

    // Blazing fireball projectile streaking from start -> end before detonating
    let proj: THREE.Mesh | null = null;
    let projMat: THREE.MeshBasicMaterial | null = null;
    if (hasTravel) {
      projMat = new THREE.MeshBasicMaterial({ color: 0xffcc33, transparent: true, opacity: 1 });
      proj = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), projMat);
      proj.position.copy(start);
      group.add(proj);
    }

    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xff5a1f,
      wireframe: true,
      transparent: true,
      opacity: 0.92,
    });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), coreMat);
    core.position.set(end.x, end.y, 0.1);
    group.add(core);

    const flameRingMat = new THREE.MeshBasicMaterial({
      color: 0xf2c12e,
      transparent: true,
      opacity: 0.9,
    });
    const flameRing = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 10, 32), flameRingMat);
    flameRing.position.set(end.x, end.y, 0.15);
    group.add(flameRing);

    const flameRing2Mat = new THREE.MeshBasicMaterial({
      color: 0xe6194b,
      transparent: true,
      opacity: 0.85,
    });
    const flameRing2 = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 10, 32), flameRing2Mat);
    flameRing2.position.set(end.x, end.y, 0.12);
    flameRing2.rotation.x = 0.8;
    group.add(flameRing2);

    const embers: { mesh: THREE.Mesh; vel: THREE.Vector3 }[] = [];
    for (let i = 0; i < 52; i++) {
      const m = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.08 + Math.random() * 0.08, 0),
        new THREE.MeshBasicMaterial({
          color: i % 3 === 0 ? 0xff4500 : i % 3 === 1 ? 0xffcc33 : 0xe6194b,
          transparent: true,
          opacity: 1,
        }),
      );
      m.position.set(end.x, end.y, 0.15);
      const a = Math.random() * Math.PI * 2;
      const spd = 1.5 + Math.random() * 3.9;
      group.add(m);
      embers.push({
        mesh: m,
        vel: new THREE.Vector3(Math.cos(a) * spd, Math.sin(a) * spd + 0.6, (Math.random() - 0.5) * 2.5),
      });
    }

    return {
      group,
      age: 0,
      duration,
      update: (dt, p) => {
        const travelDone = hasTravel ? 0.22 : 0;
        if (proj && projMat) {
          const tp = Math.min(1, p / travelDone);
          proj.position.lerpVectors(start, end, tp);
          proj.rotation.x += dt * 12;
          proj.rotation.y += dt * 10;
          proj.scale.setScalar(0.8 + tp * 0.7);
          projMat.opacity = p < travelDone ? 1 : 0;
        }

        const blast = Math.max(0, (p - travelDone) / (1 - travelDone));
        core.rotation.x += dt * 5;
        core.rotation.y += dt * 5.8;
        core.scale.setScalar(0.35 + Math.sin(blast * Math.PI) * 2.6);
        coreMat.opacity = blast > 0 ? Math.max(0, 1 - blast) : 0;

        flameRing.rotation.x = blast * 5;
        flameRing.rotation.y = blast * 4;
        flameRing.scale.setScalar(0.3 + blast * 4.4);
        flameRingMat.opacity = blast > 0 ? Math.max(0, 1 - blast * 1.1) : 0;

        flameRing2.rotation.z = -blast * 6;
        flameRing2.scale.setScalar(0.25 + blast * 3.6);
        flameRing2Mat.opacity = blast > 0 ? Math.max(0, 1 - blast * 1.15) : 0;

        for (const e of embers) {
          if (blast > 0) {
            e.mesh.position.addScaledVector(e.vel, dt);
            e.mesh.rotation.x += dt * 7;
            e.mesh.rotation.y += dt * 6;
            e.vel.multiplyScalar(0.965);
          }
          const mat = e.mesh.material as THREE.MeshBasicMaterial;
          mat.opacity = blast > 0 ? Math.max(0, 1 - blast * 1.05) : 0;
        }
      },
      dispose: () => disposeGroupResources(group),
    };
  }

  // ===================== 3. HAMON / ELECTRIC OVERDRIVE =====================
  if (cue.vfxType === 'HAMON_ELECTRIC') {
    const duration = 1.18;
    const rings: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; offset: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i === 1 ? 0xfff59d : 0xf2c12e,
        transparent: true,
        opacity: 0.95,
      });
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.045, 8, 36), mat);
      mesh.position.set(end.x, end.y, 0.15);
      group.add(mesh);
      rings.push({ mesh, mat, offset: i * 0.14 });
    }

    // 7 jagged golden lightning arcs directly connecting start card -> end card
    const bolts: THREE.Line[] = [];
    for (let b = 0; b < 7; b++) {
      const pts: THREE.Vector3[] = [];
      const segments = 10;
      for (let s = 0; s <= segments; s++) {
        const t = s / segments;
        const pt = new THREE.Vector3().lerpVectors(start, end, t);
        const jitter = s === 0 || s === segments ? 0 : (Math.random() - 0.5) * 0.95;
        pt.addScaledVector(perp, jitter);
        pt.z = (Math.random() - 0.5) * 0.6;
        pts.push(pt);
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
          r.mesh.scale.setScalar(0.3 + local * 4.4);
          r.mesh.rotation.z = p * 7;
          r.mesh.rotation.x = 0.65;
          r.mat.opacity = local > 0 ? Math.max(0, 1 - local) : 0;
        }
        for (const bolt of bolts) {
          const mat = bolt.material as THREE.LineBasicMaterial;
          mat.opacity = Math.max(0, (1 - p) * (0.6 + Math.random() * 0.4));
        }
      },
      dispose: () => disposeGroupResources(group),
    };
  }

  // ===================== 4. WATER / ICE SHARDS =====================
  if (cue.vfxType === 'WATER_ICE') {
    const duration = 1.18;
    const shards: { mesh: THREE.Mesh; lateral: number; delay: number }[] = [];
    for (let i = 0; i < 32; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0x38bdf8 : 0xe0f2fe,
        transparent: true,
        opacity: 0.94,
      });
      const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), mat);
      mesh.scale.set(0.55, 2.2, 0.55);
      mesh.rotation.z = angle;
      const lateral = (Math.random() - 0.5) * 1.8;
      mesh.position.copy(start).addScaledVector(perp, lateral);
      group.add(mesh);
      shards.push({ mesh, lateral, delay: (i / 32) * 0.3 });
    }

    const rippleMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
    });
    const ripple = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.48, 32), rippleMat);
    ripple.position.set(end.x, end.y, 0.15);
    group.add(ripple);

    return {
      group,
      age: 0,
      duration,
      update: (dt, p) => {
        for (const s of shards) {
          const local = Math.max(0, Math.min(1, (p - s.delay) * 1.75));
          s.mesh.position.lerpVectors(start, end, local);
          s.mesh.position.addScaledVector(perp, s.lateral * (1 - local * 0.78));
          s.mesh.rotation.y += dt * 9;
          const mat = s.mesh.material as THREE.MeshBasicMaterial;
          mat.opacity = local > 0 && local < 1 ? Math.sin(local * Math.PI) : 0;
        }
        const rLocal = Math.max(0, (p - 0.22) / 0.78);
        ripple.scale.setScalar(0.45 + rLocal * 4.4);
        rippleMat.opacity = rLocal > 0 ? Math.max(0, 1 - rLocal) : 0;
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
    dome.position.copy(end);
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
      mesh.position.copy(end);
      group.add(mesh);
      clockRings.push({ mesh, mat, axis: i });
    }

    const hourPivot = new THREE.Group();
    hourPivot.position.copy(end);
    const hourMat = new THREE.MeshBasicMaterial({ color: 0xf2c12e, transparent: true, opacity: 0.95 });
    const hourBar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.55, 0.08), hourMat);
    hourBar.position.y = 0.7;
    hourPivot.add(hourBar);
    group.add(hourPivot);

    const minPivot = new THREE.Group();
    minPivot.position.copy(end);
    const minMat = new THREE.MeshBasicMaterial({ color: 0xfff5c0, transparent: true, opacity: 0.95 });
    const minBar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.3, 0.08), minMat);
    minBar.position.y = 1.05;
    minPivot.add(minBar);
    group.add(minPivot);

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
      mesh.position.set(end.x + Math.cos(a) * r, end.y + Math.sin(a) * r * 0.75, (Math.random() - 0.5) * 1.8);
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
      opacity: 0.92,
    });
    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.55, 0.12, 48, 8), knotMat);
    knot.position.set(end.x, end.y, 0.15);
    group.add(knot);

    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x0b090e,
      transparent: true,
      opacity: 0.95,
    });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16), coreMat);
    core.position.set(end.x, end.y, 0.12);
    group.add(core);

    // Imploding purple void motes pulled straight into target card
    const motes: { mesh: THREE.Mesh; startAngle: number; startRadius: number }[] = [];
    for (let i = 0; i < 24; i++) {
      const mMat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0xc084fc : 0xe6194b,
        transparent: true,
        opacity: 0.9,
      });
      const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.09, 0), mMat);
      group.add(m);
      motes.push({
        mesh: m,
        startAngle: (i / 24) * Math.PI * 2,
        startRadius: 1.5 + Math.random() * 0.9,
      });
    }

    return {
      group,
      age: 0,
      duration,
      update: (dt, p) => {
        const pulse = Math.sin(p * Math.PI);
        knot.rotation.x += dt * 4.5;
        knot.rotation.y += dt * 5.5;
        knot.scale.setScalar(0.35 + pulse * 1.9);
        knotMat.opacity = Math.max(0, 1 - p * 0.95);

        core.scale.setScalar(0.2 + pulse * 1.45);
        coreMat.opacity = Math.max(0, 1 - p);

        for (const mt of motes) {
          const a = mt.startAngle + p * 6.5;
          const r = mt.startRadius * (1 - p * 0.9);
          mt.mesh.position.set(end.x + Math.cos(a) * r, end.y + Math.sin(a) * r, 0.2);
          mt.mesh.rotation.z += dt * 8;
          (mt.mesh.material as THREE.MeshBasicMaterial).opacity = Math.sin(p * Math.PI);
        }
      },
      dispose: () => disposeGroupResources(group),
    };
  }

  // ===================== 7. HEAL / RESTORATION =====================
  if (cue.vfxType === 'HEAL_RESTORE') {
    const duration = 1.25;
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x00e599,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.045, 8, 36), haloMat);
    halo.position.set(end.x, end.y, 0.15);
    halo.rotation.x = 1.15;
    group.add(halo);

    const orbs: { mesh: THREE.Mesh; angle: number; heightOffset: number }[] = [];
    for (let i = 0; i < 30; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0x00e599 : 0xf2c12e,
        transparent: true,
        opacity: 0.95,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), mat);
      group.add(mesh);
      orbs.push({ mesh, angle: (i / 30) * Math.PI * 4, heightOffset: (i / 30) * 1.2 });
    }

    return {
      group,
      age: 0,
      duration,
      update: (dt, p) => {
        halo.scale.setScalar(0.6 + p * 1.6);
        halo.rotation.z += dt * 4;
        haloMat.opacity = Math.sin(p * Math.PI) * 0.85;

        for (const o of orbs) {
          const theta = o.angle + p * 6.5;
          const r = 0.85 * (1 - p * 0.35);
          o.mesh.position.set(
            end.x + Math.cos(theta) * r,
            end.y - 0.6 + o.heightOffset + p * 1.6,
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
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.35, 9.5, 18, 1, true), pillarMat);
    pillar.position.set(end.x, end.y, 0);
    group.add(pillar);

    const crownMat = new THREE.MeshBasicMaterial({
      color: 0xfff5c0,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    });
    const crownRing = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.065, 10, 44), crownMat);
    crownRing.position.set(end.x, end.y, 0.1);
    crownRing.rotation.x = Math.PI / 2;
    group.add(crownRing);

    const stars: { mesh: THREE.Mesh; angle: number; radius: number; yStart: number }[] = [];
    for (let i = 0; i < 44; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? 0xf2c12e : i % 3 === 1 ? 0xfff5c0 : 0xe6194b,
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), mat);
      group.add(mesh);
      stars.push({
        mesh,
        angle: (i / 44) * Math.PI * 8,
        radius: 0.75 + Math.random() * 1.6,
        yStart: end.y - 2.2 + Math.random() * 2.0,
      });
    }

    return {
      group,
      age: 0,
      duration,
      update: (dt, p) => {
        pillar.rotation.y += dt * 3.6;
        pillar.scale.x = 0.45 + Math.sin(p * Math.PI) * 1.4;
        pillar.scale.z = pillar.scale.x;
        pillarMat.opacity = Math.sin(p * Math.PI) * 0.48;

        crownRing.position.y = end.y - 1.6 + p * 3.6;
        crownRing.scale.setScalar(0.55 + p * 2.8);
        crownRing.rotation.z += dt * 5;
        crownMat.opacity = Math.sin(p * Math.PI) * 0.92;

        for (const st of stars) {
          const a = st.angle + p * 6;
          st.mesh.position.set(
            end.x + Math.cos(a) * st.radius,
            st.yStart + p * 4.8,
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
  for (let i = 0; i < 58; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: i % 3 === 0 ? 0xe6194b : i % 3 === 1 ? 0xf2c12e : 0x1e1729,
      transparent: true,
      opacity: 1,
    });
    const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.15, 0), mat);
    mesh.position.set(end.x, end.y, 0.15);
    const a = Math.random() * Math.PI * 2;
    const speed = 2.2 + Math.random() * 5.0;
    group.add(mesh);
    shards.push({
      mesh,
      vel: new THREE.Vector3(Math.cos(a) * speed, Math.sin(a) * speed, (Math.random() - 0.5) * 4.0),
      rot: new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9),
    });
  }

  const blastMat = new THREE.MeshBasicMaterial({
    color: 0xe6194b,
    transparent: true,
    opacity: 0.96,
  });
  const blast = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.085, 10, 40), blastMat);
  blast.position.set(end.x, end.y, 0.18);
  group.add(blast);

  const blast2Mat = new THREE.MeshBasicMaterial({
    color: 0xf2c12e,
    transparent: true,
    opacity: 0.9,
  });
  const blast2 = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.06, 10, 40), blast2Mat);
  blast2.position.set(end.x, end.y, 0.22);
  blast2.rotation.x = 0.65;
  group.add(blast2);

  const slashMat = new THREE.MeshBasicMaterial({
    color: 0xfff5c0,
    transparent: true,
    opacity: 0.95,
  });
  const slashPlane = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 0.24), slashMat);
  slashPlane.position.set(end.x, end.y, 0.35);
  slashPlane.rotation.z = -0.45;
  group.add(slashPlane);

  return {
    group,
    age: 0,
    duration,
    update: (dt, p) => {
      blast.scale.setScalar(0.3 + p * 5.8);
      blastMat.opacity = Math.max(0, 1 - p);

      const p2 = Math.max(0, (p - 0.1) / 0.9);
      blast2.scale.setScalar(0.25 + p2 * 4.8);
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
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
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
    cameraRef.current = camera;

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
      cameraRef.current = null;
    };
  }, [enabled]);

  // Spawn new 3D VFX effect targeting the exact battlefield card DOM positions
  useEffect(() => {
    if (!enabled || !cue || !sceneRef.current || !cameraRef.current || !containerRef.current) {
      return;
    }
    if (lastCueIdRef.current === cue.id) return;
    lastCueIdRef.current = cue.id;

    const anchors = resolveCueAnchors(cue, cameraRef.current, containerRef.current);
    const fx = createEffect(cue, anchors);
    sceneRef.current.add(fx.group);
    activeEffectsRef.current.push(fx);

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
