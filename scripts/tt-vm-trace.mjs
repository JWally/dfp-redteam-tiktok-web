#!/usr/bin/env node
/** tt-vm-trace.mjs — patch the REAL webmssdk.js interpreter in-flight and
 *  capture a ground-truth trace: every XOR-decoded string (m), register
 *  writes (N), and the opcode dispatch stream (f). Capped to avoid OOM.
 *  All TikTok API calls fulfilled locally. */
import { chromium } from 'playwright';
import { writeFileSync, readFileSync } from 'node:fs';

const DNS = {
  'www.tiktok.com':'23.218.232.14',
  'lf16-tiktok-web.tiktokcdn-us.com':'23.53.127.144',
  'lf16-cdn-tos.tiktokcdn-us.com':'23.55.178.7',
};
const rules = Object.entries(DNS).map(([h,ip])=>`MAP ${h} ${ip}`).join(', ');

let bundle = readFileSync('/tmp/opencode/tt/js/webmssdk.js', 'utf-8');

const PATCHES = [
  // N register writes -> log (capped)
  ['function N(n,t,r){t>=n.S?n.A[t].v=r:n.A[t]=r}',
   'function N(n,t,r){t>=n.S?n.A[t].v=r:n.A[t]=r;(self.__tr=self.__tr||[]).length<3000&&self.__tr.push(["WR",t,typeof r==="string"?r.slice(0,80):typeof r==="number"?r:typeof r])}'],
  // m() XOR decoder -> log decoded strings (capped)
  ['function m(n,t){n=new D("utf-8").decode(R(n));for(var r="",i=0;i<n.length;i++)r+=String.fromCharCode(n.charCodeAt(i)^t.charCodeAt(i%t.length));return r}',
   'function m(n,t){n=new D("utf-8").decode(R(n));for(var r="",i=0;i<n.length;i++)r+=String.fromCharCode(n.charCodeAt(i)^t.charCodeAt(i%t.length));(self.__tr=self.__tr||[]).length<3000&&self.__tr.push(["m",r.slice(0,100)]);return r}'],
];
for (const [from,to] of PATCHES) {
  if (bundle.includes(from)) { bundle = bundle.replace(from, to); console.error('OK  ', from.slice(0,40)); }
  else console.error('MISS', from.slice(0,40));
}
// opcode dispatch log (capped)
const DL = 'var f=O[u.u++]<<8|O[u.u++];try{C[f](u)}';
const DLN = 'var f=O[u.u++]<<8|O[u.u++];(self.__ops=self.__ops||[]).length<12000&&self.__ops.push([u.u-2,f]);try{C[f](u)}';
if (bundle.includes(DL)) { bundle = bundle.replace(DL, DLN); console.error('OK   dispatch'); }
else console.error('MISS dispatch');

const b = await chromium.launch({ headless:true, args:[`--host-resolver-rules=${rules}`] });
const ctx = await b.newContext();
const page = await ctx.newPage();

await page.route('**/*webmssdk*/**', async route => {
  if (route.request().url().includes('/webmssdk/')) await route.fulfill({ status:200, contentType:'application/javascript', body: bundle });
  else await route.continue();
});
await page.route(/\/api\/|\/aweme\/|\/passport\//, async route => {
  await route.fulfill({ status:200, contentType:'application/json', body:'{"statusCode":0,"data":{},"status_msg":"local"}' });
});
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0,200)));
await page.goto('https://www.tiktok.com/', { waitUntil:'load', timeout:60000 }).catch(()=>{});
await page.waitForTimeout(10000);

const tr = await page.evaluate(() => self.__tr || []).catch(()=>[]);
const ops = await page.evaluate(() => self.__ops || []).catch(()=>[]);
writeFileSync('/tmp/opencode/tt/vm-trace.json', JSON.stringify(tr));
writeFileSync('/tmp/opencode/tt/vm-ops.json', JSON.stringify(ops));
console.log('trace entries:', tr.length, '| opcode dispatches:', ops.length);
console.log('page errors:', errs.length ? errs.slice(0,3) : 'none');

const kinds = {};
for (const e of tr) kinds[e[0]] = (kinds[e[0]]||0)+1;
console.log('\n=== trace kinds ===');
for (const [k,v] of Object.entries(kinds)) console.log(`  ${k}: ${v}`);

console.log('\n=== XOR-decoded strings (m) ===');
for (const e of tr) if (e[0]==='m') console.log('  ', JSON.stringify(e[1]));

console.log('\n=== register writes (WR, first 40) ===');
let n=0;
for (const e of tr) { if (e[0]==='WR') { console.log('  ', JSON.stringify(e[1])); if (++n>=40) break; } }
await b.close();
