import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test('trace startup compositor screenshots', async ({ page }) => {
  test.setTimeout(30000);
  await page.setViewportSize({ width: 1920, height: 912 });
  const out = path.resolve('capturas-inicio-compositor');
  fs.mkdirSync(out, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const trace:any[] = [];
  cdp.on('Tracing.dataCollected', ({ value }) => trace.push(...value));
  let complete!: () => void;
  const done = new Promise<void>(r => complete = r);
  cdp.on('Tracing.tracingComplete', () => complete());
  await cdp.send('Tracing.start', {
    categories: 'disabled-by-default-devtools.screenshot',
    options: 'record-as-much-as-possible',
    transferMode: 'ReportEvents'
  });
  await page.goto('http://127.0.0.1:4174/', { waitUntil: 'commit' });
  await page.waitForTimeout(8500);
  await cdp.send('Tracing.end');
  await done;
  const shots = trace.filter(e => e.name === 'Screenshot' && e.args?.snapshot).sort((a,b)=>a.ts-b.ts);
  const t0 = shots[0]?.ts ?? 0;
  const meta:any[] = [];
  shots.forEach((e,i) => {
    const elapsed = Math.round((e.ts - t0) / 1000);
    const name = `frame-${String(i).padStart(4,'0')}_${String(elapsed).padStart(5,'0')}ms.jpg`;
    fs.writeFileSync(path.join(out,name), Buffer.from(e.args.snapshot,'base64'));
    meta.push({i,elapsed,name});
  });
  fs.writeFileSync(path.join(out,'frames.json'), JSON.stringify(meta,null,2));
  console.log('screenshots', shots.length);
  if (meta.length > 1) {
    const gaps = meta.slice(1).map((f,i)=>f.elapsed-meta[i].elapsed).sort((a,b)=>a-b);
    console.log('gap ms min/median/max', gaps[0], gaps[Math.floor(gaps.length/2)], gaps[gaps.length-1]);
  }
});
