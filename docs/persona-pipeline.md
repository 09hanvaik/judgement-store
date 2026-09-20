# The persona surface, and what is not built

`/u/[slug]` is the audience surface: shader background, glass panels, and a
speaking presence that reads the answer aloud. It runs with **no keys, no network
and no third-party service**, which is the only reason it is safe to put on a demo
path that the rest of this product promises never makes external calls.

## What is real today

| Piece | How it works | Keys needed |
|---|---|---|
| Answer | The same deterministic router every other surface uses | none |
| Voice | The browser's own `SpeechSynthesis` | none |
| Mouth / presence | A pulse envelope driven by speech start and end | none |
| Background | A hand-written WebGL fragment shader, ~40 lines, no library | none |
| Reduced motion | Shader time freezes, ring animation stops | none |
| No WebGL | A CSS radial gradient carries the same look | none |

The amplitude envelope is a **stand-in, not a lip-sync**. It is honest about being
one: it reacts to whether she is speaking, not to which phoneme she is on.

## What is specified but not built

The 3D persona spec — single-photo onboarding, automated rigging, TTS, viseme
mapping, autonomous blinks and gaze, Daytona orchestration — is not in this repo.
It needs services and credentials that are not configured here, and every one of
them would put a live third-party call on the answer path.

That trade is the whole argument of this product, so it was not made quietly.

### Where it would slot in

The seam is deliberately narrow. `PersonaStage` needs exactly two things from a
persona implementation:

```ts
// 1. something to render
<PersonaView personaId={...} />

// 2. something to drive it
speak(text: string): {
  onStart(): void
  onFrame(level: number, viseme?: string): void   // today: an envelope
  onEnd(): void
}
```

Swapping the stand-in for a rigged head means replacing `speak()` and the `.orb`
element. Nothing else on the page changes, because the answer, the rule and the
disclosure are already independent of how the words are delivered.

A real build would need, roughly:

1. **Photo → avatar.** A hosted avatar-generation service that returns a rigged
   GLB with ARKit-style blendshapes. Zero manual rigging is a service promise, not
   something to implement.
2. **Text → audio + timings.** A TTS provider that returns word or phoneme
   timings alongside the audio, otherwise the timings have to be inferred.
3. **Timings → visemes.** A phoneme-to-blendshape map applied on the render loop.
4. **Render.** `three.js` with a GLTF loader, driving morph targets.
5. **Idle behaviour.** Procedural blink, gaze drift and micro head-tilt on a timer
   — the cheapest part, and the one that does most for believability.
6. **Daytona.** An isolated container holding the orchestration and, importantly,
   the credentials: the browser would call Daytona, and Daytona would call the
   avatar and speech providers, so no token is ever in client code.

### What that costs the product

Steps 2 and 3 are on the request path. The moment they are, an answer depends on a
network round trip and an external provider's uptime, and the claim that the whole
thing works offline stops being true.

The honest version is to keep generation **offline**, the way answer audio already
works: pre-generate the persona's delivery for the seeded demo answers with
`npm run generate-audio`, cache it, and let the browser fall back to its own voice
for anything not yet cached. Answers stay deterministic; only the polish is async.
