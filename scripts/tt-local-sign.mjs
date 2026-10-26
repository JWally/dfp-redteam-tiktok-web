#!/usr/bin/env node
/** tt-local-sign.mjs — inspect byted_acrawler and invoke it to sign a request
 *  fully in-sandbox (faithful executor). */
import { chromium } from 'playwright';
import http from 'node:http';
import { writeFileSync, readFileSync } from 'node:fs';

let core = readFileSync('/tmp/opencode/tt/js/webmssdk.js', 'utf-8');
let ext  = readFileSync('/tmp/opencode/tt/js/webmssdk_ex.js', 'utf-8');
const DL = 'var f=O[u.u++]<<8|O[u.u++];try{C[f](u)}';
core = core.replace(DL, 'var f=O[u.u++]<<8|O[u.u++];(self.__steps=(self.__steps||0)+1);if(self.__steps>5000000)throw new Error("STEP_LIMIT");try{C[f](u)}');

const srv = http.createServer((req,res)=>{
  res.setHeader('Content-Type','text/html');
  res.end('<!doctype html><html><body>sandbox<script>window.__net=[];</script></body></html>');
});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const port = srv.address().port;
const b = await chromium.launch({ headless:true });
const page = await b.newPage();
await page.route('http://*', async route => { await route.fulfill({ status:200, contentType:'application/json', body:'{}' }); });
await page.goto(`http://127.0.0.1:${port}/`);
await page.addScriptTag({ content: core });
await page.waitForTimeout(5000);
await page.addScriptTag({ content: ext });
await page.waitForTimeout(10000);

// inspect the acrawler object's keys/methods
const info = await page.evaluate(() => {
  const ac = self.byted_acrawler || {};
  const out = { type: typeof ac, keys: Object.keys(ac).slice(0,50) };
  out.methods = {};
  for (const k of Object.keys(ac)) {
    const v = ac[k];
    out.methods[k] = typeof v === 'function' ? 'function' : typeof v;
  }
  return out;
}).catch(e=>({err:String(e)}));
console.log('byted_acrawler:', JSON.stringify(info,null,2));

// try to call common signing entry points
for (const fn of ['sign','__bogus','gen','getSign','signature','X-Bogus']) {
  if (!info.methods || info.methods[fn]!=='function') continue;
  const r = await page.evaluate(async (fn) => {
    try { return await self.byted_acrawler[fn]('x-tt-dt:1&aid:1988&param:test'); }
    catch(e){ return 'ERR:'+String(e).slice(0,120); }
  }, fn).catch(e=>'ERR2:'+String(e).slice(0,120));
  console.log(`call ${fn} ->`, String(r).slice(0,120));
}
writeFileSync('/tmp/opencode/tt/local-sign.json', JSON.stringify({info},null,2));
srv.close(); await b.close();
