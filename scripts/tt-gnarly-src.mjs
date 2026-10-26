#!/usr/bin/env node
/** tt-gnarly-src.mjs — trace which script + code path attaches X-Gnarly to
 *  requests on the real page. */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const DNS = { 'www.tiktok.com':'23.218.232.14','lf16-tiktok-web.tiktokcdn-us.com':'23.53.127.144','lf16-cdn-tos.tiktokcdn-us.com':'23.55.178.7' };
const rules = Object.entries(DNS).map(([h,ip])=>`MAP ${h} ${ip}`).join(', ');
const b = await chromium.launch({ headless:true, args:[`--host-resolver-rules=${rules}`] });
const ctx = await b.newContext();
const page = await ctx.newPage();

// hook setRequestHeader + fetch to log X-Gnarly/X-Bogus header sets + stack
await page.addInitScript(() => {
  self.__hdr=[];
  const orig = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function(k,v){
    if (/X-Gnarly|X-Bogus|msToken|X-Argon/i.test(k)) {
      const st = new Error().stack.split('\n').slice(1,4).map(x=>x.trim().slice(0,120));
      self.__hdr.push(['xhr', k, String(v).slice(0,60), st]);
    }
    return orig.call(this,k,v);
  };
  const of = window.fetch;
  window.fetch = function(...a){
    try {
      const h = a[1] && a[1].headers;
      if (h && typeof h==='object') {
        const flat = h instanceof Headers ? Object.fromEntries(h.entries()) : h;
        for (const k of Object.keys(flat)) if (/X-Gnarly|X-Bogus/i.test(k)) {
          const st = new Error().stack.split('\n').slice(1,4).map(x=>x.trim().slice(0,120));
          self.__hdr.push(['fetch', k, String(flat[k]).slice(0,60), st]);
        }
      }
    } catch(_){}
    return of.apply(this,a);
  };
});
await page.route(/\/api\/|\/aweme\/|\/passport\//, async route => { await route.fulfill({ status:200, contentType:'application/json', body:'{"statusCode":0,"data":{},"status_msg":"local"}' }); });
await page.goto('https://www.tiktok.com/', { waitUntil:'load', timeout:60000 }).catch(()=>{});
await page.waitForTimeout(10000);
const hdr = await page.evaluate(() => self.__hdr || []).catch(()=>[]);
console.log('header sets captured:', hdr.length);
for (const h of hdr.slice(0,8)) console.log(JSON.stringify(h));
writeFileSync('/tmp/opencode/tt/gnarly-src.json', JSON.stringify(hdr,null,2));
await b.close();
