#!/usr/bin/env node
/** tamper-probe.mjs — clean vs tampered device-signal differential on the REAL
 *  TikTok webmssdk. Three browsers: clean / tampered navigator+screen / tampered
 *  WebGL. Captures the X-Gnarly + msToken emitted on /api/recommend/item_list.
 *  All API calls fulfilled locally. */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const DNS = {
  'www.tiktok.com':'23.218.232.14',
  'lf16-tiktok-web.tiktokcdn-us.com':'23.53.127.144',
  'lf16-cdn-tos.tiktokcdn-us.com':'23.55.178.7',
};
const rules = Object.entries(DNS).map(([h,ip])=>`MAP ${h} ${ip}`).join(', ');

async function run(label, init) {
  const b = await chromium.launch({ headless:true, args:[`--host-resolver-rules=${rules}`] });
  const ctx = await b.newContext();
  const page = await ctx.newPage();
  if (init) await page.addInitScript(init);
  const sigs = [];
  page.on('request', req => {
    const u = req.url();
    if (!/\/api\//.test(u)) return;
    const m = u.match(/[?&](X-Gnarly|msToken|X-Bogus)=([^&]*)/g) || [];
    if (m.length) sigs.push({ url: u.slice(0,80), params: Object.fromEntries(m.map(x=>{const [a,val]=x.slice(1).split('=');return [a,val];})) });
  });
  await page.route(/\/api\/|\/aweme\/|\/passport\//, async route => {
    await route.fulfill({ status:200, contentType:'application/json', body:'{"statusCode":0,"data":{},"status_msg":"local"}' });
  });
  await page.goto('https://www.tiktok.com/', { waitUntil:'load', timeout:60000 }).catch(()=>{});
  await page.waitForTimeout(9000);
  const cookies = (await ctx.cookies().catch(()=>[])).filter(c=>['msToken','ttwid'].includes(c.name)).map(c=>({name:c.name, value:c.value}));
  await b.close();
  return { label, sigs, cookies };
}

const clean = await run('clean', null);
const tamperNav = await run('tamper-nav', () => {
  Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get(){ return 99; } });
  Object.defineProperty(Navigator.prototype, 'deviceMemory', { get(){ return 999; } });
  Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get(){ return 7; } });
  Object.defineProperty(Screen.prototype, 'width', { get(){ return 1920; } });
  Object.defineProperty(Screen.prototype, 'height', { get(){ return 1080; } });
  Object.defineProperty(Screen.prototype, 'colorDepth', { get(){ return 30; } });
});
const tamperUA = await run('tamper-ua', () => {
  Object.defineProperty(Navigator.prototype, 'userAgent', { get(){ return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'; } });
  Object.defineProperty(Navigator.prototype, 'platform', { get(){ return 'MacIntel'; } });
  Object.defineProperty(Navigator.prototype, 'language', { get(){ return 'fr-FR'; } });
});

const out = { clean, tamperNav, tamperUA };
writeFileSync('/tmp/opencode/tt/tamper-results.json', JSON.stringify(out,null,2));
for (const r of [clean, tamperNav, tamperUA]) {
  console.log(`\n=== ${r.label} ===`);
  console.log('  cookies:', r.cookies.map(c=>`${c.name}=${c.value.slice(0,40)}...`).join(' | '));
  const s = r.sigs.filter(x=>x.params['X-Gnarly'] || x.params['msToken']).slice(0,3);
  for (const x of s) console.log('  sig:', JSON.stringify(x).slice(0,200));
}
// compare
function tok(r){ const c=r.cookies.find(c=>c.name==='msToken'); return c? c.value : null; }
console.log('\n=== DIFFERENTIAL ===');
console.log('msToken clean:', tok(clean)?.slice(0,50));
console.log('msToken tamperNav:', tok(tamperNav)?.slice(0,50));
console.log('msToken tamperUA:', tok(tamperUA)?.slice(0,50));
console.log('nav-differs-from-clean:', tok(clean)!==tok(tamperNav));
console.log('ua-differs-from-clean:', tok(clean)!==tok(tamperUA));
