#!/usr/bin/env node
/** tt-gnarly-runner4.mjs — capture full X-Gnarly values minted in-sandbox,
 *  verify format + that they differ per request, and save artifacts. */
import { chromium } from 'playwright';
import { writeFileSync, readFileSync } from 'node:fs';
const DNS = { 'www.tiktok.com':'23.218.232.14','lf16-tiktok-web.tiktokcdn-us.com':'23.53.127.144','lf16-cdn-tos.tiktokcdn-us.com':'23.55.178.7' };
const rules = Object.entries(DNS).map(([h,ip])=>`MAP ${h} ${ip}`).join(', ');
const wms = readFileSync('/tmp/opencode/tt/js/webmssdk.js','utf-8');
const wmsx = readFileSync('/tmp/opencode/tt/js/webmssdk_ex.js','utf-8');
const pnsl = readFileSync('/tmp/opencode/tt/pns-loader.js','utf-8');
const pnsc = readFileSync('/tmp/opencode/tt/pns-core.js','utf-8');
const b = await chromium.launch({ headless:true, args:[`--host-resolver-rules=${rules}`] });
const ctx = await b.newContext();
const page = await ctx.newPage();
await page.addInitScript(() => {
  self.__gn=[];
  const of = window.fetch;
  window.fetch = function(...a){
    const u = a[0] instanceof Request ? a[0].url : String(a[0]);
    const m = u.match(/[?&]X-Gnarly=([^&]*)/);
    const mb = u.match(/[?&]X-Bogus=([^&]*)/);
    if (m || mb) self.__gn.push({ path: u.split('?')[0].slice(0,70), gnarly: m?m[1]:null, bogus: mb?mb[1]:null, full: u.slice(0,120) });
    return of.apply(this,a);
  };
});
await page.route('**/*', async route => {
  const u = route.request().url();
  if (u.includes('/webmssdk/') && u.endsWith('webmssdk.js')) return route.fulfill({ status:200, contentType:'application/javascript', body: wms });
  if (u.includes('/webmssdk_ex/') && u.endsWith('webmssdk_ex.js')) return route.fulfill({ status:200, contentType:'application/javascript', body: wmsx });
  if (u.includes('privacy_protection_framework/loader') && u.includes('/loader/')) return route.fulfill({ status:200, contentType:'application/javascript', body: pnsl });
  if (u.includes('core.js?globalName=__PNS_RUNTIME__')) return route.fulfill({ status:200, contentType:'application/javascript', body: pnsc });
  if (/\.js($|\?)/.test(u) || u.startsWith('data:') || u==='https://www.tiktok.com/') return route.continue();
  await route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ statusCode:0, code:0, data:{}, results:null, status_msg:'local' }) });
});
await page.goto('https://www.tiktok.com/', { waitUntil:'load', timeout:60000 }).catch(()=>{});
await page.waitForTimeout(12000);
await page.evaluate(async () => {
  try { await window.fetch('https://www.tiktok.com/api/recommend/item_list/?aid=1988&device_id=7240000000000000&iid=7310000000000000'); } catch(e){}
}).catch(()=>{});
await page.waitForTimeout(4000);
const gn = await page.evaluate(() => self.__gn || []).catch(()=>[]);
writeFileSync('/tmp/opencode/tt/gnarly-minted.json', JSON.stringify(gn,null,2));
console.log('minted:', gn.length);
const vals = gn.map(g=>g.gnarly).filter(Boolean);
console.log('X-Gnarly values:', vals.length);
const lens = [...new Set(vals.map(v=>v.length))];
console.log('lengths:', lens);
if (vals.length>=2) console.log('differ per request:', vals[0] !== vals[1]);
if (vals.length) console.log('sample head:', vals[0].slice(0,60));
// version byte check
import('node:url').then(()=>{});
await b.close();
