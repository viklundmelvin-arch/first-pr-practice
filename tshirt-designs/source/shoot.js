const {chromium}=require('playwright');const D=require('./designs.js');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1000,height:1000},deviceScaleFactor:3});
await p.route('**/*',r=>r.continue());
for(const k of Object.keys(D)){await p.goto('http://localhost:8766/render.html#'+k);await p.reload();await p.waitForSelector('body[data-ready]');await p.waitForTimeout(300);
await p.locator('svg').screenshot({path:`out/${k}.png`,omitBackground:true});}
await b.close()})();
