#!/usr/bin/env node
/** deterministic.mjs — are ttwid/msToken deterministic functions of the
 *  collected device signals? Two identical contexts (fixed UA, injected
 *  identical signals) -> compare ttwid + msToken. */
import { chromium } from 'playwright';
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
  const cs = (await ctx.cookies().catch(()=>[]));
  const m = cs.find(c=>c.name==='msToken')?.value, w = cs.find(c=>c.name==='ttwid')?.value;
  await b.close();
  return { m, w };
}
const A = await run(), B = await run();
console.log('A ttwid:', A.w?.slice(0,60));
console.log('B ttwid:', B.w?.slice(0,60));
console.log('A msToken:', A.m?.slice(0,60));
console.log('B msToken:', B.m?.slice(0,60));
console.log('\nttwid device-id identical:', A.w?.split('|')[1]===B.w?.split('|')[1]);
console.log('msToken identical:', A.m===B.m);
