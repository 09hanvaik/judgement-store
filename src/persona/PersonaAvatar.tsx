'use client';

import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { frameAt, type VisemeTrack } from './visemes';

/**
 * In-browser 3D persona. Renders a rigged GLB (Ready Player Me heads carry
 * ARKit blendshapes) and drives its morph targets from a viseme track.
 *
 * Performance over muscle simulation, on purpose: capped device pixel ratio,
 * one light rig, no post-processing, and smoothed blendshape weights so the
 * mouth never jitters between frames.
 */

export interface PersonaHandle {
  /** Play a track. Audio is optional: without it the mouth still runs to the clock. */
  play(track: VisemeTrack, audio?: HTMLAudioElement | null): void;
  stop(): void;
}

interface Props {
  modelUrl: string;
  accent: string;
  onReady?: (ok: boolean) => void;
  className?: string;
}

/** Blendshapes we drive ourselves; everything else on the mesh is left alone. */
const IDLE_SHAPES = ['eyeBlinkLeft', 'eyeBlinkRight'];

export const PersonaAvatar = forwardRef<PersonaHandle, Props>(function PersonaAvatar(
  { modelUrl, accent, onReady, className },
  ref,
) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playRef = useRef<PersonaHandle['play']>(() => {});
  const stopRef = useRef<PersonaHandle['stop']>(() => {});

  useImperativeHandle(ref, () => ({
    play: (track, audio) => playRef.current(track, audio),
    stop: () => stopRef.current(),
  }));

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(22, 1, 0.1, 100);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      onReady?.(false);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    // Stylised three-point rig. Flattering, cheap, and stable frame to frame.
    scene.add(new THREE.HemisphereLight(0xffffff, 0x20242e, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(1.4, 1.8, 2.4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(new THREE.Color(accent), 2.4);
    rim.position.set(-2, 1.1, -1.6);
    scene.add(rim);

    const root = new THREE.Group();
    scene.add(root);

    let meshes: THREE.Mesh[] = [];
    let head: THREE.Object3D | null = null;
    let disposed = false;

    const setShape = (name: string, value: number) => {
      for (const mesh of meshes) {
        const index = mesh.morphTargetDictionary?.[name];
        if (index === undefined || !mesh.morphTargetInfluences) continue;
        mesh.morphTargetInfluences[index] = value;
      }
    };

    const clearVisemes = () => {
      for (const mesh of meshes) {
        if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) continue;
        for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
          if (name.startsWith('viseme_')) mesh.morphTargetInfluences[index] = 0;
        }
      }
    };

    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        if (disposed) return;
        const model = gltf.scene;
        meshes = [];
        model.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh && mesh.morphTargetDictionary) meshes.push(mesh);
          if (/head/i.test(child.name) && !head) head = child;
        });

        // Frame the head: measure, then lift the camera to eye level.
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const eyeY = box.max.y - size.y * 0.12;
        model.position.sub(new THREE.Vector3(center.x, 0, center.z));
        root.add(model);
        camera.position.set(0, eyeY, size.y * 0.62 + 1.55);
        camera.lookAt(0, eyeY, 0);

        onReady?.(true);
      },
      undefined,
      () => onReady?.(false),
    );

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    // --- playback state -----------------------------------------------------
    let track: VisemeTrack | null = null;
    let audioEl: HTMLAudioElement | null = null;
    let startedAt = 0;
    const smoothed = new Map<string, number>();

    playRef.current = (nextTrack, audio) => {
      track = nextTrack;
      audioEl = audio ?? null;
      startedAt = performance.now();
    };
    stopRef.current = () => {
      track = null;
      audioEl = null;
      clearVisemes();
    };

    // --- autonomous secondary dynamics -------------------------------------
    let nextBlink = 1.2 + Math.random() * 2.4;
    let blinkPhase = -1;
    let gazeTarget = new THREE.Vector2(0, 0);
    let nextGaze = 1.8;

    const clock = new THREE.Clock();
    let raf = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.elapsedTime;

      if (!reduced) {
        // Blink: a fast close, a slower open, at irregular intervals.
        nextBlink -= dt;
        if (blinkPhase < 0 && nextBlink <= 0) {
          blinkPhase = 0;
          nextBlink = 1.6 + Math.random() * 3.6;
        }
        if (blinkPhase >= 0) {
          blinkPhase += dt;
          const v = blinkPhase < 0.07 ? blinkPhase / 0.07 : Math.max(0, 1 - (blinkPhase - 0.07) / 0.13);
          for (const shape of IDLE_SHAPES) setShape(shape, v);
          if (blinkPhase > 0.2) {
            blinkPhase = -1;
            for (const shape of IDLE_SHAPES) setShape(shape, 0);
          }
        }

        // Gaze and a resting head drift, so she is never perfectly still.
        nextGaze -= dt;
        if (nextGaze <= 0) {
          gazeTarget = new THREE.Vector2((Math.random() - 0.5) * 0.16, (Math.random() - 0.5) * 0.1);
          nextGaze = 1.4 + Math.random() * 2.8;
        }
        root.rotation.y += (gazeTarget.x - root.rotation.y) * dt * 1.6;
        root.rotation.x += (gazeTarget.y * 0.5 - root.rotation.x) * dt * 1.6;
        root.position.y = Math.sin(elapsed * 0.7) * 0.004;
      }

      // Visemes, driven by the audio clock when there is audio to follow.
      if (track) {
        const t = audioEl && !audioEl.paused ? audioEl.currentTime : (performance.now() - startedAt) / 1000;
        if (t > track.durationSec + 0.25) {
          stopRef.current();
        } else {
          const { current, next } = frameAt(track.frames, t);
          const span = next ? Math.max(next.t - current.t, 0.001) : 0.12;
          const progress = Math.min(1, Math.max(0, (t - current.t) / span));
          // Ease out of the shape as the next one approaches: no popping.
          const target = current.w * (1 - progress * 0.55);

          for (const [name, value] of smoothed) {
            if (name === current.v) continue;
            const decayed = value * 0.72;
            smoothed.set(name, decayed);
            setShape(name, decayed < 0.01 ? 0 : decayed);
          }
          const previous = smoothed.get(current.v) ?? 0;
          const blended = previous + (target - previous) * 0.45;
          smoothed.set(current.v, blended);
          setShape(current.v, blended);
        }
      }

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      scene.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry?.dispose();
          const material = mesh.material;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material?.dispose();
        }
      });
    };
  }, [modelUrl, accent, onReady]);

  return <div ref={mountRef} className={className} aria-hidden />;
});
