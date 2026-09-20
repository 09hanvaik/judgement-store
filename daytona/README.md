# Daytona sandbox — the credential boundary

This service exists so that no provider credential is ever in the browser, and
none but the Daytona token is in the web app.

```
browser  ──►  Next server        ──►  Daytona sandbox  ──►  ElevenLabs
              (DAYTONA_API_KEY)       (all other keys)  ──►  Avaturn / Didimo
```

Two endpoints, no state, no database, one file.

| Route | In | Out |
|---|---|---|
| `POST /tts` | `{ text, voice_id }` | `{ audio_base64, alignment }` |
| `POST /avatar` | `{ image_base64 }` | `{ model_url }` |
| `GET /health` | — | `{ ok, providers }` |

## Deploy

```bash
daytona create --name persona-proxy --image node:22-alpine
```

Copy `service.mjs` into the sandbox and set its environment:

```bash
SERVICE_TOKEN=<a long random string>
ELEVENLABS_API_KEY=<key>
AVATURN_API_KEY=<key>          # or DIDIMO_API_KEY=<key>
AVATAR_PROVIDER=avaturn        # or didimo
PORT=8080
```

```bash
node service.mjs
```

Then point the web app at it:

```bash
DAYTONA_API_URL=https://<sandbox-host>
DAYTONA_API_KEY=<the same SERVICE_TOKEN>
```

Check it before wiring anything up:

```bash
curl https://<sandbox-host>/health
```

`providers` must report `true` for what you intend to use. A `false` means that
key is missing inside the sandbox, and the web app will fall back to the
browser's own voice rather than fail.

## Why a shared secret and not the Daytona API key

`SERVICE_TOKEN` authorises *this service*, not your Daytona account. If it
leaks, rotate one string; your Daytona credentials are unaffected and nobody can
touch your workspaces. The service never echoes a credential in an error.

## What this is not

It is not on the answer path. Routing, rules, ranking and rendering never call
it, and a visitor asking a question never triggers it. It is used by creator-side
onboarding and by the offline generator, plus the opt-in live-speech path.
