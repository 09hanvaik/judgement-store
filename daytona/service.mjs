import { createServer } from 'node:http';

/**
 * The Daytona sandbox service.
 *
 * Its entire job is to be the only place the provider credentials exist. The
 * browser never sees them; the Next server only ever holds DAYTONA_API_KEY, and
 * calls this. Two endpoints, no state, no database.
 *
 *   POST /tts     { text, voice_id }      -> { audio_base64, alignment }
 *   POST /avatar  { image_base64 }        -> { model_url }
 *   GET  /health                          -> { ok, providers }
 *
 * Env (set these in the Daytona sandbox, not in the web app):
 *   SERVICE_TOKEN      shared secret; must match the web app's DAYTONA_API_KEY
 *   ELEVENLABS_API_KEY
 *   AVATURN_API_KEY  or  DIDIMO_API_KEY   (AVATAR_PROVIDER picks between them)
 *   PORT               default 8080
 */

const PORT = Number(process.env.PORT ?? 8080);
const TOKEN = process.env.SERVICE_TOKEN?.trim();
const MAX_BODY = 12 * 1024 * 1024;

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('body_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('invalid_json'));
      }
    });
    req.on('error', reject);
  });
}

/** Constant-time-ish comparison so a wrong token leaks nothing by timing. */
function authorised(req) {
  if (!TOKEN) return false;
  const header = req.headers.authorization ?? '';
  const presented = header.replace(/^Bearer\s+/i, '');
  if (presented.length !== TOKEN.length) return false;
  let diff = 0;
  for (let i = 0; i < TOKEN.length; i += 1) diff |= presented.charCodeAt(i) ^ TOKEN.charCodeAt(i);
  return diff === 0;
}

async function tts({ text, voice_id: voiceId }) {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new Error('ELEVENLABS_API_KEY not set in the sandbox');
  if (!text || !voiceId) throw new Error('text and voice_id are required');

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`,
    {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.15 },
      }),
    },
  );
  if (!response.ok) throw new Error(`elevenlabs ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return { audio_base64: data.audio_base64, alignment: data.alignment };
}

async function avatar({ image_base64: image }) {
  if (!image) throw new Error('image_base64 is required');
  const provider = (process.env.AVATAR_PROVIDER || '').trim().toLowerCase()
    || (process.env.AVATURN_API_KEY ? 'avaturn' : process.env.DIDIMO_API_KEY ? 'didimo' : '');

  if (provider === 'avaturn') {
    const response = await fetch('https://api.avaturn.me/v1/avatars/from-image', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.AVATURN_API_KEY.trim() },
      body: JSON.stringify({ image, export: { format: 'glb', morph_targets: 'ARKit' } }),
    });
    if (!response.ok) throw new Error('avaturn ' + response.status + ': ' + (await response.text()));
    const data = await response.json();
    const url = data.url || data.glb_url || data?.data?.url;
    if (!url) throw new Error('avaturn returned no model url');
    return { model_url: url, provider };
  }

  if (provider === 'didimo') {
    const response = await fetch('https://api.didimo.co/v3/didimos', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'DIDIMO-API-KEY': process.env.DIDIMO_API_KEY.trim() },
      body: JSON.stringify({
        input_type: 'photo',
        photo: image,
        transfer_formats: ['glb'],
        avatar_structure: 'full-body',
        features: ['arkit', 'oculus_lipsync'],
      }),
    });
    if (!response.ok) throw new Error('didimo ' + response.status + ': ' + (await response.text()));
    const data = await response.json();
    const url = data.url || (data.key ? 'https://api.didimo.co/v3/didimos/' + data.key + '/glb' : null);
    if (!url) throw new Error('didimo returned no model url');
    return { model_url: url, provider };
  }

  throw new Error('no avatar provider configured in the sandbox (set AVATURN_API_KEY or DIDIMO_API_KEY)');
}

const ROUTES = { '/tts': tts, '/avatar': avatar };

createServer(async (req, res) => {
  const url = (req.url ?? '/').split('?')[0];

  if (req.method === 'GET' && url === '/health') {
    return send(res, 200, {
      ok: true,
      providers: {
        elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY?.trim()),
        avatar: (process.env.AVATAR_PROVIDER || '').trim()
          || (process.env.AVATURN_API_KEY ? 'avaturn' : process.env.DIDIMO_API_KEY ? 'didimo' : false),
      },
    });
  }

  const handler = ROUTES[url];
  if (req.method !== 'POST' || !handler) return send(res, 404, { error: 'not_found' });
  if (!authorised(req)) return send(res, 401, { error: 'unauthorised' });

  try {
    send(res, 200, await handler(await readBody(req)));
  } catch (error) {
    // The message is safe to return: no credential is ever interpolated into it.
    send(res, 502, { error: 'upstream_failed', detail: String(error?.message ?? error) });
  }
}).listen(PORT, () => {
  console.log(`persona proxy on :${PORT}`);
  if (!TOKEN) console.warn('SERVICE_TOKEN is not set — every request will be rejected.');
});
