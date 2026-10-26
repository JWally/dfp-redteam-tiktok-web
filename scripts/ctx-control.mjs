#!/usr/bin/env node
/** ctx-control.mjs — control for ctx-tamper: same context, NO tamper, reload.
 *  If msToken also rotates here, rotation is normal refresh and the tamper
 *  differential needs a different read. */
import { chromium } from 'playwright';
const DNS = { 'www.tiktok.com':'23.218.232.14','lf16-tiktok-web.tiktokcdn-us.com':'23.53.127.144','lf16-cdn-tos.tiktokcdn-us.com':'23.55.178.7' };
const rules = Object.entries(DNS).map(([h,ip])=>`MAP ${h} ${ip}`).join(', ');
const b = await chromium.launch({ headless:true, args:[`--host-resolver-rules=${rules}`] });
const ctx = await b.newContext();
const page = await ctx.newPage();
await page.route(/\/api\/|\/aweme\/|\/passport\//, async route => { await route.fulfill({ status:200, contentType:'application/json', body:'{"statusCode":0,"data":{},"status_msg":"local"}' }); });
const cookie = async n => (await ctx.cookies().catch(()=>[])).find(c=>c.name===n)?.value || null;
await page.goto('https://www.tiktok.com/', { waitUntil:'load', timeout:60000 }).catch(()=>{});
await page.waitForTimeout(7000);
const t0 = await cookie('msToken'), w0 = await cookie('ttwid');
await page.goto('https://www.tiktok.com/', { waitUntil:'load', timeout:60000 }).catch(()=>{});
await page.waitForTimeout(7000);
const t1 = await cookie('msToken'), w1 = await cookie('ttwid');
console.log('control t0 msToken:', t0?.slice(0,45), t0?.length);
console.log('control t1 msToken:', t1?.slice(0,45), t1?.length);
console.log('control msToken changed w/o tamper:', t0!==t1);
console.log('control ttwid same:', w0?.split('|')[1]===w1?.split('|')[1], `(${w0?.split('|')[1]} -> ${w1?.split('|')[1]})`);
await b.close();
