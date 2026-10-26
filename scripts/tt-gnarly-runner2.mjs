#!/usr/bin/env node
/** tt-gnarly-runner2.mjs — inject ONLY webmssdk.js + webmssdk_ex.js onto a real
 *  www.tiktok.com origin (DNS-overridden, all API calls fulfilled locally) and
 *  watch whether the SDK itself mints X-Gnarly during init + on a driven fetch.
 *  Isolates which bundle + step produces the current signature. */
import { chromium } from 'playwright';
import { writeFileSync, readFileSync } from 'node:fs';
const DNS = { 'www.tiktok.com':'23.218.232.14','lf16-tiktok-web.tiktokcdn-us.com':'23.53.127.144','lf16-cdn-tos.tiktokcdn-us.com':'23.55.178.7' };
const rules = Object.entries(DNS).map(([h,ip])=>`MAP ${h} ${ip}`).join(', ');
const wms = readFileSync('/tmp/opencode/tt/js/webmssdk.js','utf-8');
const wmsx = readFileSync('/tmp/opencode/tt/js/webmssdk_ex.js','utf-8');
const pnsl = readFileSync('/tmp/opencode/tt/pns-loader.js','utf-8');
const pnsc = readFileSync('/tmp/opencode/tt/pns-core.js','utf-8');

const b = await chromium.launch({ headless:true, args:[`--host-resolver-rules=${rules}`] });
const ctx = await b.newContext();
const page = await ctx.newPage();

// capture every URL that carries X-Gnarly, with a minimal stack
await page.addInitScript(() => {
  self.__gn=[];
  const of = window.fetch;
  window.fetch = function(...a){
    const u = a[0] instanceof Request ? a[0].url : String(a[0]);
    if (/X-Gnarly/.test(u)) self.__gn.push({ u: u.slice(0,220), t: Date.now() });
    return of.apply(this,a);
  };
});
// fulfill all API/config calls locally (never forward), but let JS/CDN through
await page.route('**/*', async route => {
  const u = route.request().url();
  if (/\.js($|\?)/.test(u) || u.startsWith('data:') || u==='https://www.tiktok.com/') return route.continue();
  await route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ statusCode:0, code:0, data:{}, results:null, status_msg:'local' }) });
});

// minimal blank-ish page on the real origin (no webapp assets)
await page.goto('https://www.tiktok.com/', { waitUntil:'domcontentloaded', timeout:60000 }).catch(()=>{});
// strip the real app scripts? Simpler: navigate a data-free page on the origin is hard; instead inject on whatever loaded
await page.waitForTimeout(2000);
// capture pre-existing state, then inject our bundles
await page.addScriptTag({ content: wms });
await page.waitForTimeout(6000);
await page.addScriptTag({ content: wmsx });
await page.waitForTimeout(6000);
await page.addScriptTag({ content: pnsl });
await page.addScriptTag({ content: pnsc });
await page.waitForTimeout(6000);

// drive a fetch through the signing path
await page.evaluate(async () => {
  try {
    await window.fetch('https://www.tiktok.com/api/recommend/item_list/?aid=1988&app_language=en&device_platform=web&device_id=7240000000000000&iid=7310000000000000&WebIdLastTime=1793019000');
  } catch(e){}
}).catch(()=>{});
await page.waitForTimeout(5000);

const gn = await page.evaluate(() => self.__gn || []).catch(()=>[]);
const state = await page.evaluate(() => ({
  cookie: document.cookie.slice(0,200),
  hasAC: !!self.byted_acrawler,
  acKeys: self.byted_acrawler ? Object.keys(self.byted_acrawler) : [],
})).catch(()=>({}));

console.log('X-Gnarly URLs captured:', gn.length);
for (const g of gn.slice(0,3)) console.log('  ', g.u.slice(0,140));
console.log('page state:', JSON.stringify(state));
writeFileSync('/tmp/opencode/tt/gnarly-runner2.json', JSON.stringify({gn, state},null,2));
await b.close();
