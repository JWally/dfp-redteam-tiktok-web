#!/usr/bin/env node
/** tt-gnarly-runner3.mjs — serve the REAL webmssdk/PNS bundles via route
 *  interception on the real www.tiktok.com origin (CSP-compliant, URL is from
 *  tiktokcdn-us.com). Watch whether X-Gnarly is minted by the SDK's own init +
 *  a driven fetch. All API calls fulfilled locally; nothing forwarded. */
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

await page.addInitScript(() => {
  self.__gn=[];
  const of = window.fetch;
  window.fetch = function(...a){
    const u = a[0] instanceof Request ? a[0].url : String(a[0]);
    if (/X-Gnarly/.test(u)) self.__gn.push({ u: u.slice(0,220), t: Date.now() });
    return of.apply(this,a);
  };
});

await page.route('**/*', async route => {
  const u = route.request().url();
  // serve our local SDK copies for the real CDN URLs
  if (u.includes('/webmssdk/') && u.endsWith('webmssdk.js')) return route.fulfill({ status:200, contentType:'application/javascript', body: wms });
  if (u.includes('/webmssdk_ex/') && u.endsWith('webmssdk_ex.js')) return route.fulfill({ status:200, contentType:'application/javascript', body: wmsx });
  if (u.includes('privacy_protection_framework/loader') && u.includes('/loader/')) return route.fulfill({ status:200, contentType:'application/javascript', body: pnsl });
  if (u.includes('core.js?globalName=__PNS_RUNTIME__')) return route.fulfill({ status:200, contentType:'application/javascript', body: pnsc });
  // let JS bundles + the shell through, fulfill API/config locally
  if (/\.js($|\?)/.test(u) || u.startsWith('data:') || u==='https://www.tiktok.com/') return route.continue();
  await route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ statusCode:0, code:0, data:{}, results:null, status_msg:'local' }) });
});

await page.goto('https://www.tiktok.com/', { waitUntil:'load', timeout:60000 }).catch(()=>{});
await page.waitForTimeout(12000);

// drive a signed fetch through the full chain
await page.evaluate(async () => {
  try {
    await window.fetch('https://www.tiktok.com/api/recommend/item_list/?aid=1988&app_language=en&device_platform=web&device_id=7240000000000000&iid=7310000000000000&WebIdLastTime=1793019000');
  } catch(e){}
}).catch(()=>{});
await page.waitForTimeout(4000);

const gn = await page.evaluate(() => self.__gn || []).catch(()=>[]);
const state = await page.evaluate(() => ({
  cookie: document.cookie.slice(0,200),
  hasAC: !!self.byted_acrawler,
  acKeys: self.byted_acrawler ? Object.keys(self.byted_acrawler) : [],
  sw: navigator.serviceWorker && navigator.serviceWorker.controller ? 'controlled' : 'none',
})).catch(()=>({}));

console.log('X-Gnarly URLs captured:', gn.length);
for (const g of gn.slice(0,4)) console.log('  ', g.u.slice(0,150));
console.log('state:', JSON.stringify(state));
writeFileSync('/tmp/opencode/tt/gnarly-runner3.json', JSON.stringify({gn,state},null,2));
await b.close();
