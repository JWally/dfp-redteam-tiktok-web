#!/usr/bin/env node
/** tt-privacy-headers.mjs — capture the real PNS privacy_headers response
 *  (config that enables X-Gnarly signing). Read-only observation. */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const DNS = { 'www.tiktok.com':'23.218.232.14','lf16-tiktok-web.tiktokcdn-us.com':'23.53.127.144','lf16-cdn-tos.tiktokcdn-us.com':'23.55.178.7' };
const rules = Object.entries(DNS).map(([h,ip])=>`MAP ${h} ${ip}`).join(', ');
const b = await chromium.launch({ headless:true, args:[`--host-resolver-rules=${rules}`] });
const ctx = await b.newContext();
const page = await ctx.newPage();
const captured = [];
page.on('response', async r => {
  if (r.url().includes('privacy_headers')) {
    try {
      const body = await r.text();
      captured.push({ url: r.url(), status: r.status(), body: body.slice(0,3000) });
    } catch(_){}
  }
});
// do NOT fulfill privacy_headers (let it go to server) but fulfill other API calls
await page.route(/\/api\/|\/aweme\/|\/passport\//, async route => {
  if (route.request().url().includes('privacy_headers')) return route.continue();
  await route.fulfill({ status:200, contentType:'application/json', body:'{"statusCode":0,"data":{},"status_msg":"local"}' });
});
await page.goto('https://www.tiktok.com/', { waitUntil:'load', timeout:60000 }).catch(()=>{});
await page.waitForTimeout(8000);
console.log('captured responses:', captured.length);
for (const c of captured) {
  console.log('URL:', c.url.slice(0,80), 'status:', c.status);
  console.log('BODY:', c.body.slice(0,1500));
}
writeFileSync('/tmp/opencode/tt/privacy-headers.json', JSON.stringify(captured,null,2));
await b.close();
