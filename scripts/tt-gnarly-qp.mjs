#!/usr/bin/env node
/** tt-gnarly-qp.mjs — trace who adds X-Gnarly as a query param. Hook URL
 *  mutation sites: location assign, XHR open, fetch, and request interception. */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const DNS = { 'www.tiktok.com':'23.218.232.14','lf16-tiktok-web.tiktokcdn-us.com':'23.53.127.144','lf16-cdn-tos.tiktokcdn-us.com':'23.55.178.7' };
const rules = Object.entries(DNS).map(([h,ip])=>`MAP ${h} ${ip}`).join(', ');
const b = await chromium.launch({ headless:true, args:[`--host-resolver-rules=${rules}`] });
const ctx = await b.newContext();
const page = await ctx.newPage();
await page.addInitScript(() => {
  self.__m=[];
  const tag = (p) => new Error().stack.split('\n').slice(1,5).map(x=>x.trim().replace(/^at /,'').slice(0,100));
  // patch fetch to inspect final URL
  const of = window.fetch;
  window.fetch = function(...a){
    const u = String(a[0]);
    if (/X-Gnarly|X-Bogus|msToken/.test(u)) self.__m.push(['fetch', u.slice(-220), tag('fetch')]);
    return of.apply(this,a);
  };
  // patch XHR open to inspect final URL
  const XHR = window.XMLHttpRequest;
  const oo = XHR.prototype.open;
  XHR.prototype.open = function(m,u,...r){
    if (/X-Gnarly|X-Bogus|msToken/.test(String(u))) self.__m.push(['xhr.open', String(u).slice(-220), tag('xhr')]);
    return oo.call(this,m,u,...r);
  };
});
await page.route(/\/api\/|\/aweme\/|\/passport\//, async route => { await route.fulfill({ status:200, contentType:'application/json', body:'{"statusCode":0,"data":{},"status_msg":"local"}' }); });
await page.goto('https://www.tiktok.com/', { waitUntil:'load', timeout:60000 }).catch(()=>{});
await page.waitForTimeout(10000);
const m = await page.evaluate(() => self.__m || []).catch(()=>[]);
console.log('mutations captured:', m.length);
for (const x of m.slice(0,6)) console.log('\n', JSON.stringify(x,null,1).slice(0,700));
writeFileSync('/tmp/opencode/tt/gnarly-qp.json', JSON.stringify(m,null,2));
await b.close();
