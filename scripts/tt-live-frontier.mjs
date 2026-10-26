#!/usr/bin/env node
/** tt-live-frontier.mjs — call byted_acrawler.frontierSign on the LIVE page
 *  and compare to sandbox output. */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const DNS = { 'www.tiktok.com':'23.218.232.14','lf16-tiktok-web.tiktokcdn-us.com':'23.53.127.144','lf16-cdn-tos.tiktokcdn-us.com':'23.55.178.7' };
const rules = Object.entries(DNS).map(([h,ip])=>`MAP ${h} ${ip}`).join(', ');
const b = await chromium.launch({ headless:true, args:[`--host-resolver-rules=${rules}`] });
const ctx = await b.newContext();
const page = await ctx.newPage();
await page.route(/\/api\/|\/aweme\/|\/passport\//, async route => { await route.fulfill({ status:200, contentType:'application/json', body:'{"statusCode":0,"data":{},"status_msg":"local"}' }); });
await page.goto('https://www.tiktok.com/', { waitUntil:'load', timeout:60000 }).catch(()=>{});
await page.waitForTimeout(9000);
const r = await page.evaluate(async () => {
  const ac = self.byted_acrawler;
  const out = { has: !!ac, keys: ac ? Object.keys(ac) : [] };
  if (ac && ac.frontierSign) {
    const input = 'aid=1988&app_language=en&device_platform=web&param=x';
    try { out.ret = await ac.frontierSign(input); } catch(e){ out.err = String(e).slice(0,150); }
    try { out.ret2 = await ac.frontierSign('https://www.tiktok.com/api/recommend/item_list/?aid=1988&device_id=1&iid=2&WebIdLastTime=3'); } catch(e){ out.err2 = String(e).slice(0,150); }
  }
  return out;
}).catch(e=>({evalErr:String(e).slice(0,200)}));
console.log(JSON.stringify(r,null,2));
writeFileSync('/tmp/opencode/tt/live-frontier.json', JSON.stringify(r,null,2));
await b.close();
