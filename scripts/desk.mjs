import { open } from './shot.mjs';
for (const [w, h] of [[1440, 900], [1280, 720]]) {
  const { browser, page, errors } = await open(w, h);
  await page.waitForTimeout(2500); await page.screenshot({ path: `shots/50-desk-${w}.png` });
  await page.click('[data-act="tutskip"]'); await page.click('.tool[data-arg="build"]'); await page.waitForTimeout(400);
  await page.screenshot({ path: `shots/51-desk-${w}-flyout.png` });
  console.log(w, 'overflow', await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), errors.filter(e => !e.includes('TUNNEL')));
  await browser.close();
}
