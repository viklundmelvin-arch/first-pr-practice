const {chromium}=require('playwright');
const jobs=[['back','#efe6d2','#c9a24a','#15233f','navy'],['chest','#efe6d2','#c9a24a','#15233f','navy'],
            ['back','#15233f','#8a6a2e','#e8e0cf','ecru'],['chest','#15233f','#8a6a2e','#e8e0cf','ecru']];
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1000,height:1420},deviceScaleFactor:3});
for(const [k,i,a,bg,n] of jobs){await p.goto('about:blank');await p.goto('http://localhost:8767/hrender.html#'+encodeURIComponent([k,i,a,bg].join('|')));await p.waitForSelector('body[data-ready]');await p.waitForTimeout(300);
await p.locator('svg').screenshot({path:`hout/${k}-${n}.png`,omitBackground:true});}await b.close()})();
