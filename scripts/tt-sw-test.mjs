#!/usr/bin/env node
/** tt-sw-test.mjs — does disabling the service worker remove X-Gnarly? */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const DNS = { 'www.tiktok.com':'23.218.232.14','lf16-tiktok-web.tiktokcdn-us.com':'23.53.127.144','lf16-cdn-tos.tiktokcdn-us.com':'23.55.178.7' };
const rules = Object.entries(DNS).map(([h,ip])=>`MAP ${h} ${ip}`).join(', ');

async function run(label, disableSW) {
  const b = await chromium.launch({ headless:true, args:[`--host-resolver-rules=${rules}`] });
  const ctx = await b.newContext();
  const page = await ctx.newPage();
  const sigs = [];
  page.on('request', req => {
    const u = req.url();
    if (!/\/api\//.test(u)) return;
    const m = u.match(/[?&]X-Gnarly=([^&]*)/);
    const bogus = u.match(/[?&]X-Bogus=([^&]*)/);
    if (m || bogus) sigs.push({ url: u.slice(0,60), gnarly: m?m[1].length:0, bogus: bogus?bogus[1]:null });
  });
  if (disableSW) {
    await ctx.addInitScript(() => {
      // sabotage navigator.serviceWorker so SW can't register/control
      try { Object.defineProperty(Navigator.prototype,'serviceWorker',{get(){return undefined;}}); } catch(_){}
    });
  }
  await page.route(/\/api\/|\/aweme\/|\/passport\//, async route => { await route.fulfill({ status:200, contentType:'application/json', body:'{"statusCode":0,"data":{},"status_msg":"local"}' }); });
  await page.goto('https://www.tiktok.com/', { waitUntil:'load', timeout:60000 }).catch(()=>{});
  await page.waitForTimeout(10000);
  const sw = await page.evaluate(() => (navigator.serviceWorker && navigator.serviceWorker.controller) ? String(navigator.serviceWorker.controller.scriptURL).slice(0,80) : 'none').catch(()=>'none');
  await b.close();
  return { label, sw, sigCount: sigs.length, sigs: sigs.slice(0,4) };
}
const normal = await run('normal', false);
const noSW = await run('noSW', true);
console.log(JSON.stringify({normal,noSW},null,2));
writeFileSync('/tmp/opencode/tt/sw-test.json', JSON.stringify({normal,noSW},null,2));
