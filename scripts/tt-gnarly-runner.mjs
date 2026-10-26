#!/usr/bin/env node
/** tt-gnarly-runner.mjs — drive the REAL PNS signing path locally.
 *  Loads webmssdk.js + webmssdk_ex.js + PNS loader + PNS core in a sandbox,
 *  fulfills the PNS config endpoint locally, then calls fetch() on a tiktok
 *  API URL and captures the signed URL (X-Gnarly) that the wrapper mints.
 *  All network fulfilled locally; nothing forwarded. */
import { chromium } from 'playwright';
import http from 'node:http';
import { writeFileSync, readFileSync } from 'node:fs';

const bundles = {
  wms:   readFileSync('/tmp/opencode/tt/js/webmssdk.js', 'utf-8'),
  wmsx:  readFileSync('/tmp/opencode/tt/js/webmssdk_ex.js', 'utf-8'),
  pnsl:  readFileSync('/tmp/opencode/tt/pns-loader.js', 'utf-8'),
  pnsc:  readFileSync('/tmp/opencode/tt/pns-core.js', 'utf-8'),
};

// patch webmssdk dispatch to allow tracing + cap runaway
const DL = 'var f=O[u.u++]<<8|O[u.u++];try{C[f](u)}';
bundles.wms = bundles.wms.replace(DL, 'var f=O[u.u++]<<8|O[u.u++];(self.__steps=(self.__steps||0)+1);if(self.__steps>8000000)throw new Error("STEP_LIMIT");try{C[f](u)}');

const srv = http.createServer((req,res)=>{
  res.setHeader('Content-Type','text/html');
  res.end('<!doctype html><html><body>sandbox<script>window.__net=[];</script></body></html>');
});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const port = srv.address().port;

const b = await chromium.launch({ headless:true });
const page = await b.newPage();
const errs=[];
page.on('pageerror', e=>errs.push(String(e).slice(0,250)));
page.on('console', m=>{ if(m.type()==='error') errs.push('console:'+m.text().slice(0,150)); });

// fulfill ALL outbound requests locally (PNS config + any API)
await page.route('**/*', async route => {
  const u = route.request().url();
  if (u.startsWith('http://127.0.0.1') || u==='about:blank') return route.continue();
  const method = route.request().method();
  // PNS privacy_headers config -> feed a benign config with signing-ish rules
  if (u.includes('privacy_headers')) {
    await route.fulfill({ status:200, contentType:'application/json',
      body: JSON.stringify({ code:0, data: [] }) });
  } else {
    await route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ statusCode:0, data:{} }) });
  }
});

// capture the final signed URL by wrapping fetch LAST (after PNS wraps it)
await page.addInitScript(() => { self.__final=[]; });
await page.goto(`http://127.0.0.1:${port}/`);

await page.addScriptTag({ content: bundles.wms });
await page.waitForTimeout(3000);
await page.addScriptTag({ content: bundles.wmsx });
await page.waitForTimeout(3000);
await page.addScriptTag({ content: bundles.pnsl });
await page.waitForTimeout(3000);
await page.addScriptTag({ content: bundles.pnsc });
await page.waitForTimeout(4000);

// now wrap fetch LAST so we see whatever the wrapper produces
await page.evaluate(() => {
  const orig = window.fetch.bind(window);
  window.fetch = async (...a) => {
    const u = a[0] instanceof Request ? a[0].url : String(a[0]);
    self.__final.push(u.slice(0,500));
    return orig(...a);
  };
});

// drive a signed request
const r = await page.evaluate(async () => {
  try {
    const resp = await window.fetch('https://www.tiktok.com/api/recommend/item_list/?aid=1988&app_language=en&device_id=1&iid=2&WebIdLastTime=1793019000');
    return { ok: resp.status, status: resp.status };
  } catch(e) { return { err: String(e).slice(0,150) }; }
}).catch(e=>({err:String(e).slice(0,150)}));

await page.waitForTimeout(3000);
const finals = await page.evaluate(() => self.__final || []).catch(()=>[]);
const steps = await page.evaluate(() => self.__steps||0).catch(()=>0);

console.log('fetch result:', JSON.stringify(r));
console.log('VM steps:', steps);
console.log('final URL captured:', finals.length ? finals[0] : '(none)');
if (finals.length) {
  const gn = finals[0].match(/[?&]X-Gnarly=([^&]*)/);
  const bg = finals[0].match(/[?&]X-Bogus=([^&]*)/);
  console.log('X-Gnarly in sandbox-minted URL:', gn ? gn[1].slice(0,60)+'... (len '+gn[1].length+')' : 'NO');
  console.log('X-Bogus:', bg ? bg[1] : 'none');
}
console.log('page errors:', errs.slice(0,5));
writeFileSync('/tmp/opencode/tt/gnarly-runner.json', JSON.stringify({r, steps, finals, errs},null,2));
srv.close(); await b.close();
