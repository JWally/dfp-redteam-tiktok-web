#!/usr/bin/env node
/** instr-probe.mjs — instrument the REAL TikTok webmssdk in a browser:
 *  patch WebGL getParameter/getExtension, canvas, navigator/screen getters,
 *  localStorage/sessionStorage, document.cookie BEFORE the SDK loads, and log
 *  every signal the device SDK reads + the signatures it emits. All API calls
 *  fulfilled locally. */
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
const reads = [];
const webgl = [];

await page.addInitScript(() => {
  window.__sigLog = [];
  const log = (kind, key, val) => { try { window.__sigLog.push([kind, key, typeof val==='object'? '[obj]': String(val).slice(0,80)]); } catch(_){} };
  // Navigator getter trap
  const nav = navigator;
  const navKeys = ['userAgent','appVersion','platform','language','languages','hardwareConcurrency','deviceMemory','maxTouchPoints','vendor','product','productSub','oscpu','webdriver','cookieEnabled','doNotTrack','connection','onLine','mediaDevices','bluetooth','credentials','permissions','storage'];
  const descs = {};
  for (const k of navKeys) {
    try { const d = Object.getOwnPropertyDescriptor(Navigator.prototype, k); if (d && d.get) descs[k]=d.get; } catch(_){}
  }
  for (const k of navKeys) {
    try {
      if (descs[k]) Object.defineProperty(Navigator.prototype, k, { configurable:true, get(){ const v = descs[k].call(this); log('navigator.'+k, k, v); return v; } });
    } catch(_){}
  }
  // Screen
  for (const k of ['width','height','availWidth','availHeight','colorDepth','pixelDepth','orientation','availLeft','availTop','deviceXDPI','deviceYDPI']) {
    try { const d = Object.getOwnPropertyDescriptor(Screen.prototype, k); if (d && d.get) Object.defineProperty(Screen.prototype, k, { configurable:true, get(){ const v = d.get.call(this); log('screen.'+k, k, v); return v; } }); } catch(_){}
  }
  // WebGL
  const gp = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(p){ const v = gp.call(this,p); window.__sigLog.push(['webgl.getParameter', p, String(v).slice(0,60)]); return v; };
  const gpe = WebGLRenderingContext.prototype.getExtension;
  WebGLRenderingContext.prototype.getExtension = function(n){ const v = gpe.call(this,n); window.__sigLog.push(['webgl.getExtension', n, v?'yes':'no']); return v; };
  const gsa = WebGLRenderingContext.prototype.getSupportedExtensions;
  WebGLRenderingContext.prototype.getSupportedExtensions = function(){ const v = gsa.call(this); window.__sigLog.push(['webgl.getSupportedExtensions','', String(v).slice(0,200)]); return v; };
  // localStorage / sessionStorage
  for (const st of ['localStorage','sessionStorage']) {
    const orig = Object.getOwnPropertyDescriptor(Window.prototype, st).get;
    Object.defineProperty(Window.prototype, st, { configurable:true, get(){ const s = orig.call(this); const proto = Object.getPrototypeOf(s); const origGet = proto.getItem; proto.getItem = function(k){ log(st+'.getItem', k, (s.get? s.get(k):'')?.slice(0,60)); return origGet.call(this,k); }; return s; } });
  }
  // document.cookie
  const dc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
  Object.defineProperty(Document.prototype, 'cookie', { configurable:true, get(){ const v = dc.get.call(this); log('document.cookie','', v.slice(0,200)); return v; }, set(v){ return dc.set.call(this,v); } });
});

// fulfill API calls locally
await page.route(/\/api\/|\/aweme\/|\/passport\/|\/v\d+\//, async route => {
  const u = route.request().url();
  if (/\.js($|\?)/.test(u)) return route.continue();
  await route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({statusCode:0, data:{}, status_msg:'local'}) });
});

const out = { reads:[], signatures:[], cookies:[], errors:[] };
page.on('pageerror', e => out.errors.push(String(e).slice(0,200)));

await page.goto('https://www.tiktok.com/', { waitUntil:'load', timeout:60000 }).catch(()=>{});
await page.waitForTimeout(12000);

// pull the read log out of the page
const collected = await page.evaluate(() => window.__sigLog || []).catch(()=>[]);
out.reads = collected;

// capture signatures actually emitted
const sigs = [];
for (const r of await ctx._newCDPSession ? [] : []) {}
out.cookies = (await ctx.cookies().catch(()=>[])).map(c=>({name:c.name, value:c.value.slice(0,80)}));

writeFileSync('/tmp/opencode/tt/instr-reads.json', JSON.stringify(out,null,2));

// summarize
const byKind = {};
for (const [kind,key,val] of collected) { (byKind[kind]=byKind[kind]||[]).push([key,val]); }
console.log('total reads:', collected.length);
for (const [k,v] of Object.entries(byKind)) console.log(`  ${k}: ${v.length}`);
console.log('\n=== navigator reads (dedup by key) ===');
const nd = {};
for (const [kind,key,val] of collected) if (kind.startsWith('navigator')) nd[key]=val;
for (const [k,v] of Object.entries(nd)) console.log(`  ${k} = ${v}`);
console.log('\n=== screen reads ===');
for (const [kind,key,val] of collected) if (kind.startsWith('screen')) console.log(`  ${key} = ${val}`);
console.log('\n=== webgl getParameter (dedup) ===');
const wp = {};
for (const [kind,key,val] of collected) if (kind==='webgl.getParameter') wp[key]=val;
console.log('  count distinct params:', Object.keys(wp).length);
console.log('  sample:', Object.entries(wp).slice(0,15));
console.log('\n=== storage / cookie ===');
for (const [kind,key,val] of collected) if (/storage|cookie/.test(kind)) console.log(`  ${kind} ${key} = ${String(val).slice(0,70)}`);
console.log('\n=== cookies set ===');
console.log(out.cookies.map(c=>c.name).join(', '));
await b.close();
