import puppeteer from 'puppeteer-core';

/**
 * How long after a click does she actually start speaking?
 *
 * The screencast recorder starts rolling on the click, so the clips carry a
 * short head of silence. Measuring it here lets the edit trim to the exact
 * frame speech begins, which is what keeps voice and mouth in step.
 */

const CHROME =
  process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.CAPTURE_BASE ?? 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  defaultViewport: { width: 1440, height: 960 },
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});

try {
  const page = await browser.newPage();
  await page.goto(`${BASE}/u/aditi`, { waitUntil: 'networkidle2', timeout: 120000 });
  await sleep(8000);

  for (const label of ['Best event you have been to', 'Take the seed-stage offer']) {
    const ms = await page.evaluate(async (needle) => {
      const started = performance.now();
      [...document.querySelectorAll('button')]
        .find((b) => b.textContent.toLowerCase().includes(needle.toLowerCase()))
        ?.click();
      for (let i = 0; i < 400; i += 1) {
        if (document.querySelector('.persona-hero')?.dataset.speaking === 'true') {
          return performance.now() - started;
        }
        await new Promise((r) => setTimeout(r, 20));
      }
      return -1;
    }, label);

    console.log(`${label} -> ${Math.round(ms)} ms`);
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(8000);
  }
} finally {
  await browser.close();
}
