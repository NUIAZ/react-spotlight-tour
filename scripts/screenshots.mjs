// scripts/screenshots.mjs: captures docs/ media from the live demo. Playwright
// is not a dependency; point PLAYWRIGHT_DIR at a project that has it:
//   PLAYWRIGHT_DIR=../x/node_modules/playwright BROWSER_CHANNEL=msedge node scripts/screenshots.mjs
// Produces: hero.png / hero-dark.png (tour mid-step), tour-frames/*.png (one
// per step, the raw material for a GIF), and page.png. The GIF itself is
// assembled by scripts/make-gif.py (Pillow) from the frames, because animated
// media sells a tour library better than any still.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';

const pw = process.env.PLAYWRIGHT_DIR ? pathToFileURL(resolve(process.env.PLAYWRIGHT_DIR, 'index.mjs')).href : 'playwright';
const { chromium } = await import(pw);
const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'docs');
mkdirSync(resolve(out, 'tour-frames'), { recursive: true });
const site = process.env.SITE_URL || 'https://nuiaz.github.io/react-spotlight-tour/';
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined });

async function withTour(scheme, fn) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, colorScheme: scheme });
  await page.goto(site, { waitUntil: 'networkidle' });
  // The demo AUTO-STARTS the tour for first-time visitors (fresh profile =
  // first-time), so the overlay may already be up and its scrim covers the
  // button. Use the auto-started tour if present; click only if it is not.
  const auto = await page.waitForSelector('[role="dialog"]', { timeout: 9500 }).catch(() => null);
  if (!auto) {
    await page.getByRole('button', { name: /Take the tour/i }).first().click();
    await page.waitForSelector('[role="dialog"]');
  }
  await page.waitForTimeout(450); // let the ring settle (transition)
  await fn(page);
  await page.close();
}

// Hero: mid-tour (step 2), light and dark.
await withTour('light', async page => {
  await page.getByRole('button', { name: /^Next$/ }).click();
  await page.waitForTimeout(450);
  await page.screenshot({ path: resolve(out, 'hero.png') });
  console.log('wrote hero.png');
});
await withTour('dark', async page => {
  await page.getByRole('button', { name: /^Next$/ }).click();
  await page.waitForTimeout(450);
  await page.screenshot({ path: resolve(out, 'hero-dark.png') });
  console.log('wrote hero-dark.png');
});

// Frames: the page before the tour, then every step, then after finish.
{
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, colorScheme: 'light' });
  await page.goto(site, { waitUntil: 'networkidle' });
  let n = 0;
  const frame = async () => { await page.screenshot({ path: resolve(out, 'tour-frames', `f${String(n++).padStart(2, '0')}.png`) }); };
  await frame();
  const auto = await page.waitForSelector('[role="dialog"]', { timeout: 9500 }).catch(() => null);
  if (!auto) {
    await page.getByRole('button', { name: /Take the tour/i }).first().click();
    await page.waitForSelector('[role="dialog"]');
  }
  for (let step = 0; step < 8; step++) {
    await page.waitForTimeout(500);
    await frame();
    const next = page.getByRole('button', { name: /^(Next|Finish|Done)$/ }).first();
    if (!(await next.count())) break;
    const label = await next.textContent();
    await next.click();
    if (label && /Finish|Done/.test(label)) { await page.waitForTimeout(400); await frame(); break; }
  }
  console.log('wrote', n, 'tour frames');
  await page.close();
}
await browser.close();
