#!/usr/bin/env node
/** tt-local-exec.mjs v3 — faithful executor on a real local origin.
 *  Serve a blank page over http://localhost so document.cookie works, inject
 *  the real bundles, watch VM steps + token emission (byted_acrawler). */
import { chromium } from 'playwright';
import http from 'node:http';
import { writeFileSync, readFileSync } from 'node:fs';

let core = readFileSync('/tmp/opencode/tt/js/webmssdk.js', 'utf-8');
let ext  = readFileSync('/tmp/opencode/tt/js/webmssdk_ex.js', 'utf-8');
const DL = 'var f=O[u.u++]<<8|O[u.u++];try{C[f](u)}';
core = core.replace(DL, 'var f=O[u.u++]<<8|O[u.u++];(self.__steps=(self.__steps||0)+1);if(self.__steps>2000000)throw new Error("STEP_LIMIT");try{C[f](u)}');

// local server
const srv = http.createServer((req,res)=>{
  res.setHeader('Content-Type','text/html');
  res.end('<!doctype html><html><body>sandbox<script>window.__net=[];</script></body></html>');
});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const port = srv.address().port;

const b = await chromium.launch({ headless:true });
const page = await b.newPage();
const errs=[];
page.on('pageerror', e=>errs.push(String(e).slice(0,300)));
page.on('console', m=>{ if(m.type()==='error') errs.push('console:'+m.text().slice(0,200)); });
await page.route('http://*', async route => {
  await route.fulfill({ status:200, contentType:'application/json', body:'{}' });
});

await page.goto(`http://127.0.0.1:${port}/`);
await page.addScriptTag({ content: core });
await page.waitForTimeout(5000);
await page.addScriptTag({ content: ext });
await page.waitForTimeout(10000);

const out = await page.evaluate(() => ({
  steps: self.__steps||0,
  acrawler: (typeof self.byted_acrawler!=='undefined') ? String(self.byted_acrawler).slice(0,200) : null,
  cookie: document.cookie.slice(0,300),
  ls: (()=>{const o={};try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);o[k]=(localStorage.getItem(k)||'').slice(0,100);}}catch(_){}return o;})(),
  net: (self.__net||[]).slice(0,10),
})).catch(e=>({evalErr:String(e)}));
console.log(JSON.stringify(out,null,2));
console.log('errors:', errs.slice(0,6));
writeFileSync('/tmp/opencode/tt/local-exec3.json', JSON.stringify({out,errs},null,2));
srv.close(); await b.close();
