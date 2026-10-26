#!/usr/bin/env node
/** tt-sign-methods.mjs — enumerate byted_acrawler + any global sign methods on
 *  the LIVE page, call them, look for long-token (X-Gnarly) output. */
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
  const out = { globals: [], acKeys: [], calls: [] };
  // global sign-ish functions
  for (const k of Object.keys(self)) {
    if (/sign|acrawler|frontier|bogus|gnarly|bogus/i.test(k)) {
      const v = self[k];
      if (typeof v === 'function') out.globals.push([k, v.length]);
    }
  }
  const ac = self.byted_acrawler || {};
  out.acKeys = Object.keys(ac);
  const input = 'https://www.tiktok.com/api/recommend/item_list/?aid=1988&app_language=en&device_platform=web&device_id=7240000000000000&iid=7310000000000000&WebIdLastTime=1793019000&browser_language=en&browser_platform=Win32&browser_name=Chrome&browser_version=125&browser_online=true&os=windows';
  for (const k of Object.keys(ac)) {
    if (typeof ac[k] === 'function') {
      try {
        const res = await ac[k](input);
        const s = JSON.stringify(res);
        out.calls.push({ k, len: s.length, head: s.slice(0,120) });
      } catch(e) { out.calls.push({ k, err: String(e).slice(0,80) }); }
    }
  }
  return out;
}).catch(e=>({evalErr:String(e).slice(0,200)}));
console.log(JSON.stringify(r,null,2));
writeFileSync('/tmp/opencode/tt/sign-methods.json', JSON.stringify(r,null,2));
await b.close();
