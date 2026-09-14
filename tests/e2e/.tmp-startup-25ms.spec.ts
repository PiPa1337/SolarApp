import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test('capture startup every 25ms', async ({ page }) => {
  test.setTimeout(45000);
  await page.setViewportSize({ width: 1920, height: 912 });
  const out = path.resolve('capturas-inicio-25ms');
  fs.mkdirSync(out, { recursive: true });
  const timeline:any[] = [];
  const errors:any[] = [];
  page.on('console', m => { if (m.type() === 'error') errors.push({ type:'console', text:m.text() }); });
  page.on('pageerror', e => errors.push({ type:'pageerror', text:String(e) }));
  const start = Date.now();
  await page.goto('http://127.0.0.1:4174/', { waitUntil: 'commit' });
  for (let i = 0; i < 360; i++) {
    const target = start + i * 25;
    const wait = target - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
    const elapsed = Date.now() - start;
    const state = await page.evaluate(() => {
      const root = document.documentElement;
      const boot = document.querySelector('.app-boot-sequence');
      const header = document.querySelector('.app-header--dashboard-cosmic');
      const content = document.querySelector('.dashboard-cosmic__content');
      const op = (el: Element | null) => el ? getComputedStyle(el).opacity : null;
      return {
        boot: root.getAttribute('data-solara-boot'),
        entry: root.getAttribute('data-solara-dashboard-entry'),
        bootClass: boot?.className ?? null,
        headerOpacity: op(header),
        contentOpacity: op(content),
      };
    });
    const name = `frame-${String(i).padStart(3,'0')}_${String(elapsed).padStart(5,'0')}ms.png`;
    await page.screenshot({ path: path.join(out, name) });
    timeline.push({ i, elapsed, name, ...state });
  }
  fs.writeFileSync(path.join(out, 'timeline.json'), JSON.stringify(timeline, null, 2));
  fs.writeFileSync(path.join(out, 'browser-errors.json'), JSON.stringify(errors, null, 2));
});
