#!/usr/bin/env node
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const DNS = { 'www.tiktok.com':'23.218.232.14','lf16-tiktok-web.tiktokcdn-us.com':'23.53.127.144','lf16-cdn-tos.tiktokcdn-us.com':'23.55.178.7' };
const rules = Object.entries(DNS).map(([h,ip])=>`MAP ${h} ${ip}`).join(', ');
const FIXED = () => {
  Object.defineProperty(Navigator.prototype,'userAgent',{get(){return 'FIXED-UA/1.0 (TestOS) TestKit/5.0'}});
  Object.defineProperty(Navigator.prototype,'platform',{get(){return 'FixedPlatform'}});
  Object.defineProperty(Navigator.prototype,'hardwareConcurrency',{get(){return 42}});
  Object.defineProperty(Navigator.prototype,'deviceMemory',{get(){return 8}});
  Object.defineProperty(Navigator.prototype,'maxTouchPoints',{get(){return 3}});
  Object.defineProperty(Navigator.prototype,'language',{get(){return 'xx-XX'}});
  Object.defineProperty(Screen.prototype,'width',{get(){return 1111}});
  Object.defineProperty(Screen.prototype,'height',{get(){return 2222}});
  Object.defineProperty(Screen.prototype,'colorDepth',{get(){return 12}});
};
async function run() {
  const b = await chromium.launch({ headless:true, args:[`--host-resolver-rules=${rules}`] });
  const ctx = await b.newContext({ userAgent: 'FixedBrowser/9.0' });
  const page = await ctx.newPage();
  await page.addInitScript(FIXED);
  await page.route(/\/api\/|\/aweme\/|\/passport\//, async route => { await route.fulfill({ status:200, contentType:'application/json', body:'{"statusCode":0,"data":{},"status_msg":"local"}' }); });
  await page.goto('https://www.tiktok.com/', { waitUntil:'load', timeout:60000 }).catch(()=>{});
  await page.waitForTimeout(7000);
  const cs = await ctx.cookies().catch(()=>[]);
  const m = cs.find(c=>c.name==='msToken')?.value, w = cs.find(c=>c.name==='ttwid')?.value;
  await b.close();
  return { m, w };
}
const A = await run(), B = await run();
const dec = v => v ? decodeURIComponent(v) : null;
const did = v => dec(v)?.split('|')[1] || null;
writeFileSync('/tmp/opencode/tt/deterministic2.json', JSON.stringify({A:{w:A.w,m:A.m},B:{w:B.w,m:B.m}},null,2));
console.log('A ttwid:', dec(A.w));
console.log('B ttwid:', dec(B.w));
console.log('A msToken[:40]:', A.m?.slice(0,40));
console.log('B msToken[:40]:', B.m?.slice(0,40));
console.log('\n>>> ttwid device-id identical (proper split):', did(A.w)===did(B.w));
console.log('>>> msToken identical:', A.m===B.m);
