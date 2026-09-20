'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Single-step photo onboarding: webcam capture or a file, straight to a rigged
 * model. Ready Player Me shut down mid-build, so the model URL is also directly
 * settable — the renderer only needs a GLB with viseme blendshapes, and which
 * vendor produced it is a configuration detail.
 */

interface Props {
  slug: string;
  name: string;
  accent: string;
  personaUrl: string | null;
  canGenerateFromPhoto: boolean;
}

/**
 * A free, correctly-rigged head for when no vendor is configured: three.js's
 * own face-capture sample, 52 ARKit blendshapes, served from jsDelivr.
 */
const SAMPLE_MODEL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/models/gltf/facecap.glb';

export function PersonaOnboarding({ slug, name, accent, personaUrl, canGenerateFromPhoto }: Props) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [image, setImage] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [consent, setConsent] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCamera(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  async function startCamera() {
    setMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 720, height: 720 },
      });
      streamRef.current = stream;
      setCamera(true);
      // The element mounts with `camera`, so attach on the next frame.
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      });
    } catch {
      setMessage('No camera available, or permission was declined. Upload a photo instead.');
    }
  }

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const size = Math.min(video.videoWidth, video.videoHeight) || 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(
      video,
      (video.videoWidth - size) / 2,
      (video.videoHeight - size) / 2,
      size,
      size,
      0,
      0,
      size,
      size,
    );
    setImage(canvas.toDataURL('image/jpeg', 0.9));
    stopCamera();
  }

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function generate() {
    if (!image || !consent) return;
    setBusy(true);
    setMessage(null);
    const response = await fetch('/api/persona/avatar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ creatorSlug: slug, image, consent: true }),
    });
    const data = (await response.json()) as { ok?: boolean; detail?: string; error?: string };
    setBusy(false);
    setMessage(data.ok ? 'Persona generated. The audience surface will use it now.' : (data.detail ?? data.error ?? 'Failed.'));
    if (data.ok) router.refresh();
  }

  async function setUrl() {
    if (!manualUrl.trim() || !consent) return;
    setBusy(true);
    setMessage(null);
    const response = await fetch('/api/persona/model', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ creatorSlug: slug, modelUrl: manualUrl.trim(), consent: true }),
    });
    const data = (await response.json()) as { ok?: boolean; detail?: string; error?: string };
    setBusy(false);
    setMessage(data.ok ? 'Model set. The audience surface will use it now.' : (data.detail ?? data.error ?? 'Failed.'));
    if (data.ok) {
      setManualUrl('');
      router.refresh();
    }
  }

  async function remove() {
    setBusy(true);
    await fetch(`/api/persona/avatar?creatorSlug=${encodeURIComponent(slug)}`, { method: 'DELETE' });
    setBusy(false);
    setMessage('Persona removed. Every surface falls back to the stand-in presence.');
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {personaUrl ? (
        <section className="card px-5 py-4">
          <h2 className="label">Current persona</h2>
          <p className="mt-1 break-all font-mono text-xs text-muted">{personaUrl}</p>
          <button type="button" className="btn btn-quiet mt-3" onClick={remove} disabled={busy}>
            Remove persona
          </button>
        </section>
      ) : null}

      <section className="card space-y-4 px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold">Portrait</h2>
          <p className="mt-1 text-sm text-muted">
            One front-facing photo of {name.split(' ')[0]}. It is sent once, converted, and not stored
            by this app — only the resulting model URL is kept.
          </p>
        </div>

        {camera ? (
          <div className="space-y-3">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="aspect-square w-full max-w-xs rounded-xl border border-line object-cover"
            />
            <div className="flex gap-2">
              <button type="button" className="btn btn-primary" onClick={capture}>
                Capture
              </button>
              <button type="button" className="btn btn-quiet" onClick={stopCamera}>
                Cancel
              </button>
            </div>
          </div>
        ) : image ? (
          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt="Captured portrait"
              className="aspect-square w-full max-w-xs rounded-xl border border-line object-cover"
            />
            <button type="button" className="btn btn-quiet" onClick={() => setImage(null)}>
              Use a different photo
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-quiet" onClick={startCamera}>
              Use webcam
            </button>
            <label className="btn btn-quiet cursor-pointer">
              Upload a photo
              <input type="file" accept="image/*" className="hidden" onChange={onFile} />
            </label>
          </div>
        )}

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-1"
          />
          <span>
            {name} has consented to a likeness and voice built from this material, and to it being
            labelled as an AI version of her wherever it appears.
          </span>
        </label>

        <button
          type="button"
          className="btn btn-primary"
          style={{ background: accent }}
          onClick={generate}
          disabled={busy || !image || !consent || !canGenerateFromPhoto}
        >
          {busy ? 'Working…' : 'Generate persona'}
        </button>

        {!canGenerateFromPhoto ? (
          <p className="text-sm text-muted">
            No photo-to-model provider is configured, so generation is off. Set{' '}
            <code>DAYTONA_API_URL</code>, or <code>AVATURN_API_KEY</code> / <code>DIDIMO_API_KEY</code>{' '}
            — or paste a model URL below, which needs no provider at all.
          </p>
        ) : null}
      </section>

      <section className="card space-y-3 px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold">Or point at a model</h2>
          <p className="mt-1 text-sm text-muted">
            Any HTTPS <code>.glb</code> whose mesh carries ARKit or Oculus viseme blendshapes. This is
            the escape hatch when a vendor disappears — and one did, mid-build.
          </p>
        </div>
        <input
          value={manualUrl}
          onChange={(event) => setManualUrl(event.target.value)}
          placeholder="https://…/persona.glb"
          className="w-full rounded-full border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-ink"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-quiet"
            onClick={setUrl}
            disabled={busy || !manualUrl.trim() || !consent}
          >
            Use this model
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => setManualUrl(SAMPLE_MODEL)}
            disabled={busy}
          >
            Use a free sample head
          </button>
        </div>
        <p className="text-xs text-muted">
          The sample is three.js&apos;s face-capture model: 52 ARKit blendshapes, no vendor, no key.
          It is a stand-in likeness, not {name.split(' ')[0]} — label it as such if you show it.
        </p>
      </section>

      {message ? <p className="text-sm">{message}</p> : null}
    </div>
  );
}
