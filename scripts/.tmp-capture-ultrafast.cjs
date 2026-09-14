const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async()=>{
  const out = path.resolve('capturas-inicio-ultrafast');
  fs.mkdirSync(out,{recursive:true});
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:1920,height:912}});
  const errors=[];
  page.on('console', m=>{ if(m.type()==='error') errors.push({t:Date.now(),text:m.text()}); });
  page.on('pageerror', e=>errors.push({t:Date.now(),text:String(e)}));
  const t0=Date.now();
  await page.goto('http://127.0.0.1:4174/', {waitUntil:'commit'});
  const interval=50;
  const duration=9000;
  for(let i=0;i<=Math.floor(duration/interval);i++){
    const target=t0+i*interval;
    const wait=target-Date.now();
    if(wait>0) await new Promise(r=>setTimeout(r,wait));
    const elapsed=Date.now()-t0;
    const name=`frame-${String(i).padStart(3,'0')}_${String(elapsed).padStart(5,'0')}ms.png`;
    await page.screenshot({path:path.join(out,name)});
  }
  fs.writeFileSync(path.join(out,'browser-errors.json'), JSON.stringify(errors,null,2));
  await browser.close();
  console.log(out);
  console.log('frames', fs.readdirSync(out).filter(f=>f.endsWith('.png')).length);
})();
