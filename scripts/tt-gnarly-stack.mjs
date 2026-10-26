#!/usr/bin/env node
/** tt-gnarly-stack.mjs — full stack trace of the fetch that carries X-Gnarly
 *  on the REAL page, to locate the exact signing frame. */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const DNS = { 'www.tiktok.com':'23.218.232.14','lf16-tiktok-web.tiktokcdn-us.com':'23.53.127.144','lf16-cdn-tos.tiktokcdn-us.com':'23.55.178.7' };
const rules = Object.entries(DNS).map(([h,ip])=>`MAP ${h} ${ip}`).join(', ');
const b = await chromium.launch({ headless:true, args:[`--host-resolver-rules=${rules}`] });
const ctx = await b.newContext();
const page = await ctx.newPage();
await page.addInitScript(() => {
  self.__g=[];
  const of = window.fetch;
  window.fetch = function(...a){
    const u = a[0] instanceof Request ? a[0].url : String(a[0]);
    if (/X-Gnarly/.test(u)) {
      self.__g.push({ u: u.slice(-240), stack: new Error().stack.split('\n').slice(1,12).map(x=>x.trim()) });
    }
    return of.apply(this,a);
  };
});
await page.route(/\/api\/|\/aweme\/|\/passport\//, async route => { await route.fulfill({ status:200, contentType:'application/json', body:'{"statusCode":0,"data":{},"status_msg":"local"}' }); });
await page.goto('https://www.tiktok.com/', { waitUntil:'load', timeout:60000 }).catch(()=>{});
await page.waitForTimeout(10000);
const g = await page.evaluate(() => self.__g || []).catch(()=>[]);
console.log('gnarly fetches:', g.length);
for (const x of g.slice(0,2)) {
  console.log('\nURL tail:', x.u);
  console.log('STACK:');
  for (const f of x.stack) console.log('  ', f.slice(0,160));
}
writeFileSync('/tmp/opencode/tt/gnarly-stack.json', JSON.stringify(g,null,2));
await b.close();
