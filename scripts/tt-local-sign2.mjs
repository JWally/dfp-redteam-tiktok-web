#!/usr/bin/env node
/** tt-local-sign2.mjs — invoke byted_acrawler.frontierSign in-sandbox. */
import { chromium } from 'playwright';
import http from 'node:http';
import { writeFileSync, readFileSync } from 'node:fs';

let core = readFileSync('/tmp/opencode/tt/js/webmssdk.js', 'utf-8');
let ext  = readFileSync('/tmp/opencode/tt/js/webmssdk_ex.js', 'utf-8');
const DL = 'var f=O[u.u++]<<8|O[u.u++];try{C[f](u)}';
core = core.replace(DL, 'var f=O[u.u++]<<8|O[u.u++];(self.__steps=(self.__steps||0)+1);if(self.__steps>8000000)throw new Error("STEP_LIMIT");try{C[f](u)}');

const srv = http.createServer((req,res)=>{
  res.setHeader('Content-Type','text/html');
  res.end('<!doctype html><html><body>sandbox</body></html>');
});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const port = srv.address().port;
const b = await chromium.launch({ headless:true });
const page = await b.newPage();
await page.route('http://*', async route => { await route.fulfill({ status:200, contentType:'application/json', body:'{}' }); });
await page.goto(`http://127.0.0.1:${port}/`);
await page.addScriptTag({ content: core });
await page.waitForTimeout(4000);
await page.addScriptTag({ content: ext });
await page.waitForTimeout(8000);

// inspect frontierSign arity + source (source may be the VM-wrapped function but toString might reveal shape)
const meta = await page.evaluate(() => {
  const ac = self.byted_acrawler;
  return {
    frontierSignLen: ac.frontierSign.length,
    initLen: ac.init.length,
    frontierSignSrc: String(ac.frontierSign).slice(0,300),
  };
}).catch(e=>({err:String(e)}));
console.log('meta:', JSON.stringify(meta,null,2));

// try invoking frontierSign with various shapes
const attempts = [
  'param=test&a=1',
  { url:'https://www.tiktok.com/api/recommend/item_list/', params:{a:'1'} },
  ['param=test&a=1', {}],
];
for (let i=0;i<attempts.length;i++){
  const r = await page.evaluate((a) => {
    try { const res = self.byted_acrawler.frontierSign(a); return Promise.resolve(res).then(v=>JSON.stringify(v).slice(0,160),e=>'REJ:'+String(e).slice(0,100)); }
    catch(e){ return 'THROW:'+String(e).slice(0,120); }
  }, attempts[i]).catch(e=>'ERR:'+String(e).slice(0,120));
  console.log(`attempt ${i}:`, String(r).slice(0,180));
}
writeFileSync('/tmp/opencode/tt/local-sign2.json', JSON.stringify({meta},null,2));
srv.close(); await b.close();
