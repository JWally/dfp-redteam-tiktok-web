#!/usr/bin/env node
/** tt-probe.mjs — load TikTok's real web app in a browser (DNS-overridden via
 *  Chromium host-resolver-rules), capture every outbound request + the
 *  signature params (X-Bogus/X-Argon2/msToken/__ac_signature), and save the
 *  obfuscated bundles. All TikTok API responses fulfilled locally — nothing
 *  forwarded. */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const DNS = {
  'www.tiktok.com':'23.218.232.14',
  'lf16-tiktok-web.tiktokcdn-us.com':'23.53.127.144',
  'lf16-cdn-tos.tiktokcdn-us.com':'23.55.178.7',
};
const rules = Object.entries(DNS).map(([h,ip])=>`MAP ${h} ${ip}`).join(', ');

const b = await chromium.launch({ headless:true, args:[`--host-resolver-rules=${rules}`] });
const ctx = await b.newContext();
const page = await ctx.newPage();
const log = { requests:[], bundles:{}, cookies:[], pageErrors:[] };

page.on('request', req => {
  const u = req.url();
  if (/tiktok|byteoversea|cdn/.test(u)) {
    log.requests.push({ method: req.method(), url: u, headers: req.headers() });
  }
});
page.on('response', async r => {
  const u = r.url();
  if (/\.js($|\?)/.test(u)) {
    try { const body = await r.text(); if (body && body.length > 30000) log.bundles[u.slice(0,200)] = body; } catch(_) {}
  }
});
page.on('pageerror', e => log.pageErrors.push(String(e).slice(0,300)));

// fulfill all tiktok API calls locally (never forward)
await page.route(/\/api\/|\/aweme\/|\/creative_radar_api\/|passport|/ , async route => {
  const u = route.request().url();
  if (/tiktok\.com\/api\/|\/aweme\/|\/passport\/|user\/|homepage/.test(u)) {
    await route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ statusCode:0, data:{}, status_msg:'local' }) });
  } else {
    await route.continue();
  }
});

await page.goto('https://www.tiktok.com/', { waitUntil:'load', timeout: 60000 }).catch(()=>{});
await page.waitForTimeout(15000);
const cookies = await ctx.cookies().catch(()=>[]);
log.cookies = cookies.map(c=>({name:c.name, domain:c.domain, value:(c.value||'').slice(0,80)}));
log.sigParams = log.requests
  .filter(r=>/\/api\//.test(r.url))
  .map(r=>{
    let u;
    try { u = new URL(r.url); } catch { return {url:r.url.slice(0,120)}; }
    const q = Object.fromEntries(u.searchParams.entries());
    return { path: u.pathname.slice(0,60), sig: Object.fromEntries(Object.entries(q).filter(([k])=>/X-Bogus|X-Argon|msToken|signature|__ac_|verifyFp|a_bogus|is_encryption/i.test(k))) , cookieHeader: r.headers['cookie'] ? r.headers['cookie'].slice(0,120) : null };
  })
  .filter(x=>Object.keys(x.sig||{}).length || x.cookieHeader);

mkdirSync('/tmp/opencode/tt',{recursive:true});
writeFileSync('probe-log.json', JSON.stringify(log,null,2));
writeFileSync('/tmp/opencode/tt/requests.txt', log.requests.map(r=>`${r.method} ${r.url}`).join('\n'));

console.log('requests:', log.requests.length, '| bundles saved:', Object.keys(log.bundles).length);
console.log('\n=== cookie names ===');
console.log(log.cookies.map(c=>c.name).join(', '));
console.log('\n=== signature params observed on /api/ calls ===');
for (const s of log.sigParams.slice(0,12)) console.log(' ', JSON.stringify(s));
console.log('\n=== all outbound hosts (unique) ===');
const hosts = [...new Set(log.requests.map(r=>{ try{ return new URL(r.url).host; }catch(_){ return '?'; } }))];
console.log(hosts.join('\n'));
await b.close();
