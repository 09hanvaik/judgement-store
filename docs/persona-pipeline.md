# The 3D persona pipeline

`/u/[slug]` is the audience surface: shader background, glass panels, and a
persona that speaks the answer. The answer itself is unchanged — it still comes
from the deterministic router, still shows the rule that fired, still carries the
disclosure. This pipeline only decides how those words are delivered.

## What is built

| Requirement | How | Keys |
|---|---|---|
| Single-step photo onboarding | Webcam capture or file upload at `/creator/[slug]/persona`, behind an explicit consent checkbox | none |
| Photo to rigged persona | Pluggable provider (Avaturn, Didimo) returning a GLB with ARKit / Oculus viseme blendshapes | one vendor key, or Daytona |
| Zero manual rigging | Nothing is modelled, boned or sculpted here — the provider ships the shapes | — |
| Arbitrary text to speech | ElevenLabs `/with-timestamps` | `ELEVENLABS_API_KEY` + a consented `voice_id` |
| Audio to expression sync | Character alignment mapped to visemes in `src/persona/visemes.ts`. No forced aligner, no motion capture | — |
| Autonomous secondary dynamics | Procedural blink, gaze drift, head tilt and a resting float — idle and while speaking | none |
| In-browser 3D rendering | three.js GLTF loader driving morph targets. No extension, no install | none |
| Performance first | Capped device pixel ratio, one light rig, no post-processing, smoothed blendshape weights | none |
| Low-latency playback | Cache-first: a pre-generated track starts immediately | none |
| Isolated cloud execution | `daytona/service.mjs` — one file, two endpoints, no state | Daytona |
| Secure credential proxying | Only `DAYTONA_API_KEY` reaches the web app; vendor keys live in the sandbox | Daytona |

## How lip-sync works without a forced aligner

ElevenLabs' `/with-timestamps` endpoint returns the audio **and** per-character
start and end times in one response. That single fact removes a whole stage from
the pipeline: there is no separate alignment pass, no phoneme extraction service,
and no pre-recorded motion capture.

```
text ──► ElevenLabs /with-timestamps ──► { audio_base64, alignment }
                                              │
                          alignmentToVisemes( alignment )
                                              │
                                    [ { t, v, w }, … ]
                                              │
                        three.js morph targets, driven by audio.currentTime
```

`src/persona/visemes.ts` is pure and shared by the generator script and the
renderer, so what is baked offline and what plays in the browser cannot drift.
It is covered by 13 tests: monotonic timing, weights inside 0..1, digraphs
(`th`, `ch`, `sh`) reading as one shape, one mouth-close per gap rather than per
space, and determinism.

## Ready Player Me shut down mid-build

That is why avatar generation is a provider interface and not a vendor
integration. `AVATAR_PROVIDER` selects an adapter, and the `manual` path needs no
vendor at all: paste any HTTPS `.glb` carrying viseme blendshapes into the
onboarding screen and the full pipeline runs. Swapping vendors is a config change
plus one adapter function.

## The rule that did not bend

Generation stays **off** the answer path.

`POST /api/persona/speak` is cache-first. A pre-generated track — written by
`npm run generate-persona` into `public/persona` and recorded in the
`persona_assets` table — is served with no external call at all. Live synthesis
is opt-in behind `PERSONA_LIVE=1` and exists only for lines nobody pre-generated.
If a provider is slow, missing or down, the response is marked `estimated` and
the browser speaks the line with an approximate mouth. A visitor never sees an
error because a vendor had a bad day.

So: run `npm run generate-persona` before a demo, and the persona speaks with
zero external calls while anyone is watching.

## Setup

```bash
npm run db:reset && npm run dev
```

1. Open `/creator/aditi/persona`. It reports exactly what is configured.
2. Capture or upload a portrait, tick consent, generate — or paste a `.glb` URL.
3. Set a consented `voice_id` on the creator row for speech.
4. Pre-generate the demo lines:

```bash
npm run generate-persona -- --creator aditi
```

5. Open `/u/aditi`.

With none of that configured the page still works: the stand-in orb, the
browser's own voice, and an estimated mouth.

## Still honest about

- The `estimated` mouth is a speaking-rate assumption, not a measurement. It is
  labelled `estimated` in the API response for exactly that reason.
- Viseme mapping is letter-based, not phoneme-based. It reads well at
  conversational speed and is deliberately coarse — stylised beats uncanny.
- Neither vendor adapter has been run against a live account from this machine,
  because no keys were available here. The request shapes follow each vendor's
  documented API, and the failure path is the one that has been exercised: any
  error falls back to browser speech rather than surfacing to the visitor.
- A consented `voice_id` is a real gate, not a formality. Without one, speech
  synthesis is skipped entirely regardless of which keys are present.
