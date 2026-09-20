import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

/**
 * Captures the running app in the exact states the launch video needs.
 *
 * The brag video's "show the thing" rule wants real UI, not a recreation — and
 * the interesting states (an answer with its rule panel open, a refusal) only
 * exist after a click, so a plain page screenshot will not do.
 *
 *   npm run dev            # in another terminal
 *   node scripts/capture-frames.mjs <out-dir>
 */

const OUT = resolve(process.argv[2] ?? 'brag-frames');
const BASE = process.env.CAPTURE_BASE ?? 'http://localhost:3000';
const CHROME =
  process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const VIEWPORT = { width: 1440, height: 960, deviceScaleFactor: 2 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickByText(page, text) {
  const handle = await page.evaluateHandle((needle) => {
    const button = [...document.querySelectorAll('button')].find((b) =>
      b.textContent.toLowerCase().includes(needle.toLowerCase()),
    );
    if (button) button.click();
    return Boolean(button);
  }, text);
  const clicked = await handle.jsonValue();
  if (!clicked) console.warn(`  ! no button matching "${text}"`);
  return clicked;
}

/** Stop the shader and the 3D idle loop so frames are identical run to run. */
async function freezeMotion(page) {
  await page.evaluate(() => {
    document.querySelectorAll('*').forEach((el) => {
      el.style.animationPlayState = 'paused';
    });
  });
}

async function shot(page, name, options = {}) {
  await sleep(options.settle ?? 900);
  await page.screenshot({ path: resolve(OUT, `${name}.png`), ...options.shot });
  console.log(`  wrote ${name}.png`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: VIEWPORT,
    args: ['--force-color-profile=srgb', '--font-render-hinting=none', '--use-gl=angle'],
  });

  try {
    const page = await browser.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') console.warn('  page error:', m.text().slice(0, 120));
    });

    // --- the engine ---------------------------------------------------------
    console.log('capturing /demo');
    await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle2', timeout: 120000 });
    await sleep(3000);
    await shot(page, '01-demo-top');

    await page.evaluate(() => window.scrollTo({ top: 260, behavior: 'instant' }));
    await shot(page, '02-demo-stages');

    // Expand a stage so the real JSON is on screen.
    await page.evaluate(() => {
      const row = [...document.querySelectorAll('button')].find((b) =>
        b.textContent.includes('apply rules'),
      );
      if (row) row.click();
    });
    await shot(page, '03-demo-stage-open', { settle: 1200 });

    // A refusal probe, so the engine screen also shows a non-answer.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await clickByText(page, 'No verdict on record');
    await shot(page, '04-demo-no-verdict', { settle: 2500 });

    // --- the persona --------------------------------------------------------
    console.log('capturing /u/aditi');
    await page.goto(`${BASE}/u/aditi`, { waitUntil: 'networkidle2', timeout: 120000 });
    await sleep(7000); // the GLB and the shader both need a moment
    await freezeMotion(page);
    await shot(page, '05-persona-idle', { settle: 1500 });

    await clickByText(page, 'Best event you have been to');
    await sleep(4000);
    await freezeMotion(page);
    await shot(page, '06-persona-answers', { settle: 1200 });

    await clickByText(page, 'Take the seed-stage offer');
    await sleep(4000);
    await freezeMotion(page);
    await shot(page, '07-persona-declines', { settle: 1200 });

    // --- the creator --------------------------------------------------------
    console.log('capturing /creator/aditi');
    await page.goto(`${BASE}/creator/aditi`, { waitUntil: 'networkidle2', timeout: 120000 });
    await sleep(2500);
    await shot(page, '08-creator-funnel');

    const y = await page.evaluate(() => {
      const heading = [...document.querySelectorAll('h2')].find((h) =>
        h.textContent.includes('What to make next'),
      );
      return heading ? heading.getBoundingClientRect().top + window.scrollY - 40 : 0;
    });
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
    await shot(page, '09-creator-make-next');

    console.log(`\nframes in ${OUT}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
