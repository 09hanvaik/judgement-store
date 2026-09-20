import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';

/**
 * Records the persona actually speaking, so the launch video shows real
 * lip-sync rather than a still of a face.
 *
 * Frames come from a CDP screencast of the live page; the audio is the same
 * cached ElevenLabs track the page plays, pulled from persona_assets and muxed
 * back on afterwards so picture and voice stay in step.
 *
 *   node scripts/capture-clips.mjs <out-dir>
 */

const OUT = resolve(process.argv[2] ?? 'brag-clips');
const BASE = process.env.CAPTURE_BASE ?? 'http://localhost:3000';
const CHROME =
  process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const FPS = 30;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CLIPS = [
  { name: 'answers', button: 'Best event you have been to', seconds: 9 },
  { name: 'declines', button: 'Take the seed-stage offer', seconds: 12 },
];

async function recordClip(page, client, clip) {
  const frames = [];
  const dir = resolve(OUT, `${clip.name}-frames`);
  mkdirSync(dir, { recursive: true });

  client.on('Page.screencastFrame', async ({ data, sessionId }) => {
    frames.push(data);
    try {
      await client.send('Page.screencastFrameAck', { sessionId });
    } catch {
      // The screencast is already stopping; the frame is still usable.
    }
  });

  await client.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    maxWidth: 1440,
    maxHeight: 960,
    everyNthFrame: 1,
  });

  // Click and let her talk. The audio element starts on the same tick.
  await page.evaluate((needle) => {
    const button = [...document.querySelectorAll('button')].find((b) =>
      b.textContent.toLowerCase().includes(needle.toLowerCase()),
    );
    if (button) button.click();
  }, clip.button);

  await sleep(clip.seconds * 1000);
  await client.send('Page.stopScreencast');

  frames.forEach((data, i) => {
    writeFileSync(resolve(dir, `f${String(i).padStart(5, '0')}.jpg`), Buffer.from(data, 'base64'));
  });

  console.log(`  ${clip.name}: ${frames.length} frames over ~${clip.seconds}s`);
  return { dir, count: frames.length };
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: { width: 1440, height: 960, deviceScaleFactor: 1 },
    args: [
      '--force-color-profile=srgb',
      '--font-render-hinting=none',
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.goto(`${BASE}/u/aditi`, { waitUntil: 'networkidle2', timeout: 120000 });
    await sleep(8000); // the GLB, the shader and the first paint

    const client = await page.createCDPSession();

    for (const clip of CLIPS) {
      console.log(`recording ${clip.name}`);
      const { dir, count } = await recordClip(page, client, clip);
      if (count === 0) {
        console.warn(`  ! no frames for ${clip.name}`);
        continue;
      }

      const real = count / clip.seconds;
      const out = resolve(OUT, `${clip.name}.mp4`);
      // The screencast drops frames under load, so rebuild at a constant rate
      // from whatever arrived rather than assuming 30fps.
      execFileSync(
        'ffmpeg',
        [
          '-v', 'error', '-y',
          '-framerate', real.toFixed(4),
          '-i', resolve(dir, 'f%05d.jpg'),
          '-r', String(FPS),
          '-vf', 'scale=1440:960:flags=lanczos',
          '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
          out,
        ],
        { stdio: 'inherit' },
      );
      console.log(`  wrote ${clip.name}.mp4 (${real.toFixed(1)} captured fps)`);

      // Reset for the next question.
      await page.reload({ waitUntil: 'networkidle2' });
      await sleep(8000);
    }

    console.log(`\nclips in ${OUT}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
