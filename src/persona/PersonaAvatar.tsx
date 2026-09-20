'use client';

import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { frameAt, type Viseme, type VisemeTrack } from './visemes';
import { BLINK_SHAPES, VISEME_TO_ARKIT, canonicalShapeName } from './arkit';

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

/** One entry per canonical blendshape, pointing at every mesh that carries it. */
type ShapeIndex = Map<string, Array<{ mesh: THREE.Mesh; index: number }>>;

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
    } catch (error) {
      console.warn('persona: no WebGL context for the avatar', error);
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

    const shapes: ShapeIndex = new Map();
    /** True when the rig ships Oculus visemes; false means drive ARKit instead. */
    let hasVisemes = false;
    let mouthShapes: string[] = [];
    let disposed = false;

    const setShape = (name: string, value: number) => {
      const targets = shapes.get(name);
      if (!targets) return;
      for (const { mesh, index } of targets) {
        if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = value;
      }
    };

    /** A viseme is one slider on a viseme rig, and a small chord on an ARKit one. */
    const applyViseme = (viseme: Viseme, weight: number) => {
      if (hasVisemes) {
        setShape(viseme, weight);
        return;
      }
      for (const [shape, factor] of Object.entries(VISEME_TO_ARKIT[viseme] ?? {})) {
        setShape(shape, weight * (factor ?? 0));
      }
    };

    const clearMouth = () => {
      for (const name of mouthShapes) setShape(name, 0);
    };

    // Many rigged heads ship KTX2-compressed textures. The transcoder is
    // vendored into public/basis so this needs no CDN at runtime.
    const loader = new GLTFLoader();
    const ktx2 = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer);
    loader.setKTX2Loader(ktx2);
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(
      modelUrl,
      (gltf) => {
        if (disposed) return;
        const model = gltf.scene;

        // Index every blendshape under one canonical spelling, so a mapping
        // written once survives a rig that names things its own way.
        model.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh || !mesh.morphTargetDictionary) return;
          for (const [raw, index] of Object.entries(mesh.morphTargetDictionary)) {
            const name = canonicalShapeName(raw);
            const bucket = shapes.get(name) ?? [];
            bucket.push({ mesh, index });
            shapes.set(name, bucket);
          }
        });

        hasVisemes = [...shapes.keys()].some((name) => name.startsWith('viseme_'));
        mouthShapes = hasVisemes
          ? [...shapes.keys()].filter((name) => name.startsWith('viseme_'))
          : [...new Set(Object.values(VISEME_TO_ARKIT).flatMap((mix) => Object.keys(mix)))];

        if (shapes.size === 0) {
          // A model with no blendshapes can still be shown, but it cannot speak.
          console.warn('persona: model has no morph targets — the mouth will not move');
        }

        // Normalise scale so framing does not depend on the model's units: a
        // head scan and a full-body avatar both end up one unit tall.
        const raw = new THREE.Box3().setFromObject(model);
        const rawSize = raw.getSize(new THREE.Vector3());
        const scale = rawSize.y > 0 ? 1 / rawSize.y : 1;
        model.scale.setScalar(scale);

        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
        root.add(model);

        // Fit the model to the vertical field of view, then crop in slightly so
        // it reads as a portrait rather than a figure floating in a box.
        const fovRad = (camera.fov * Math.PI) / 180;
        const fitDistance = size.y / (2 * Math.tan(fovRad / 2));
        const targetY = size.y * 0.55;
        camera.position.set(0, targetY, fitDistance * 0.92);
        camera.lookAt(0, targetY, 0);
        camera.updateProjectionMatrix();

        onReady?.(true);
      },
      undefined,
      (error) => {
        console.warn(`persona: could not load ${modelUrl}`, error);
        onReady?.(false);
      },
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
      clearMouth();
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
          for (const shape of BLINK_SHAPES) setShape(shape, v);
          if (blinkPhase > 0.2) {
            blinkPhase = -1;
            for (const shape of BLINK_SHAPES) setShape(shape, 0);
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
            applyViseme(name as Viseme, decayed < 0.01 ? 0 : decayed);
          }
          const previous = smoothed.get(current.v) ?? 0;
          const blended = previous + (target - previous) * 0.45;
          smoothed.set(current.v, blended);
          applyViseme(current.v, blended);
        }
      }

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      ktx2.dispose();
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
