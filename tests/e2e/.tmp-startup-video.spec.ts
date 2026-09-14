import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test('record startup 10s', async ({ browser }) => {
  test.setTimeout(25000);
  const out = path.resolve('capturas-inicio-40ms');
  fs.mkdirSync(out, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 912 },
    recordVideo: { dir: out, size: { width: 1920, height: 912 } },
  });
  const page = await context.newPage();
  const errors:any[] = [];
  page.on('console', m => { if (m.type() === 'error') errors.push({type:'console',text:m.text()}); });
  page.on('pageerror', e => errors.push({type:'pageerror',text:String(e)}));
  await page.goto('http://127.0.0.1:4174/', { waitUntil: 'commit' });
  await page.waitForTimeout(10000);
  const video = page.video();
  await context.close();
  if (!video) throw new Error('video missing');
  await video.saveAs(path.join(out, 'startup-10s.webm'));
  fs.writeFileSync(path.join(out, 'browser-errors.json'), JSON.stringify(errors,null,2));
});
