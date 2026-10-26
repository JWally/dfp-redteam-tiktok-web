#!/usr/bin/env node
/** ctx-tamper.mjs — SAME-context differential. Same browser context (same
 *  device_id/ttwid), capture msToken at t0, tamper a device signal, force the
 *  SDK to refresh msToken, compare. Proves the collected signal feeds the token. */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const DNS = {
  'www.tiktok.com':'23.218.232.14',
  'lf16-tiktok-web.tiktokcdn-us.com':'23.53.127.144',
  'lf16-cdn-tos.tiktokcdn-us.com':'23.55.178.7',
};
const rules = Object.entries(DNS).map(([h,ip])=>`MAP ${h} ${ip}`).join(', ');
const b = await chromium.launch({ headless:true, args:[`--host-resolver-rules=${rules}`] });
const ctx = await b.newContext();
const page = await ctx.newPage();
const seen = [];
page.on('request', req => {
  const u = req.url();
  if (/\/api\//.test(u)) {
    const m = u.match(/msToken=([^&]*)/); if (m) seen.push({ t: Date.now(), msToken: m[1].slice(0,60) });
  }
});
await page.route(/\/api\/|\/aweme\/|\/passport\//, async route => {
  await route.fulfill({ status:200, contentType:'application/json', body:'{"statusCode":0,"data":{},"status_msg":"local"}' });
});
const cookie = async () => (await ctx.cookies().catch(()=>[])).find(c=>c.name==='msToken')?.value || null;

await page.goto('https://www.tiktok.com/', { waitUntil:'load', timeout:60000 }).catch(()=>{});
await page.waitForTimeout(8000);
const t0 = await cookie();
const ttwid0 = (await ctx.cookies().catch(()=>[])).find(c=>c.name==='ttwid')?.value || null;
console.log('t0 msToken:', t0?.slice(0,40), 'len', t0?.length);
console.log('t0 ttwid :', ttwid0?.slice(0,40));

// NOW tamper inside the same context
await page.addInitScript(() => {
  Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get(){ return 99; } });
  Object.defineProperty(Navigator.prototype, 'deviceMemory', { get(){ return 888; } });
  Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get(){ return 7; } });
  Object.defineProperty(Screen.prototype, 'colorDepth', { get(){ return 48; } });
});
// force reload — same context, same device_id, but tampered signals
await page.goto('https://www.tiktok.com/', { waitUntil:'load', timeout:60000 }).catch(()=>{});
await page.waitForTimeout(8000);
const t1 = await cookie();
const ttwid1 = (await ctx.cookies().catch(()=>[])).find(c=>c.name==='ttwid')?.value || null;
console.log('t1 msToken:', t1?.slice(0,40), 'len', t1?.length);
console.log('t1 ttwid :', ttwid1?.slice(0,40));

console.log('\n=== RESULT ===');
console.log('msToken changed within same context:', t0 !== t1, t0===t1 ? '(same!)' : '');
console.log('ttwid  changed within same context:', ttwid0 !== ttwid1);
// also count msToken appearances
writeFileSync('/tmp/opencode/tt/ctx-tamper.json', JSON.stringify({t0,t1,ttwid0,ttwid1,seen},null,2));
await b.close();
