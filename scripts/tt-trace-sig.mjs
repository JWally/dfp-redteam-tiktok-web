#!/usr/bin/env node
import { chromium } from 'playwright';
import { writeFileSync, readFileSync } from 'node:fs';
const DNS = { 'www.tiktok.com':'23.218.232.14','lf16-tiktok-web.tiktokcdn-us.com':'23.53.127.144','lf16-cdn-tos.tiktokcdn-us.com':'23.55.178.7' };
const rules = Object.entries(DNS).map(([h,ip])=>`MAP ${h} ${ip}`).join(', ');
let bundle = readFileSync('/tmp/opencode/tt/js/webmssdk.js', 'utf-8');
const PATCHES = [
  ['function N(n,t,r){t>=n.S?n.A[t].v=r:n.A[t]=r}',
   'function N(n,t,r){t>=n.S?n.A[t].v=r:n.A[t]=r;(self.__tr=self.__tr||[]).length<4000&&self.__tr.push(["WR",t,typeof r==="string"?r.slice(0,120):typeof r==="number"?r:typeof r])}'],
];
for (const [f,t] of PATCHES) if (bundle.includes(f)) bundle=bundle.replace(f,t);
const DL='var f=O[u.u++]<<8|O[u.u++];try{C[f](u)}';
bundle=bundle.replace(DL,'var f=O[u.u++]<<8|O[u.u++];(self.__ops=self.__ops||[]).length<20000&&self.__ops.push([u.u-2,f]);try{C[f](u)}');
const b = await chromium.launch({ headless:true, args:[`--host-resolver-rules=${rules}`] });
const ctx = await b.newContext();
const page = await ctx.newPage();
const sigs=[];
page.on('request', req=>{ const u=req.url(); if(/\/api\//.test(u)){ const m=u.match(/[?&](X-Gnarly|msToken|X-Bogus)=([^&]*)/g)||[]; if(m.length) sigs.push(Object.fromEntries(m.map(x=>{const[a,v]=x.slice(1).split('=');return[a,v.slice(0,60)];} ))); } });
await page.route('**/*webmssdk*/**', async route => route.request().url().includes('/webmssdk/') ? route.fulfill({status:200,contentType:'application/javascript',body:bundle}) : route.continue());
await page.route(/\/api\/|\/aweme\/|\/passport\//, async route=>route.fulfill({status:200,contentType:'application/json',body:'{"statusCode":0,"data":{},"status_msg":"local"}'}));
await page.goto('https://www.tiktok.com/',{waitUntil:'load',timeout:60000}).catch(()=>{});
await page.waitForTimeout(9000);
const tr=await page.evaluate(()=>self.__tr||[]).catch(()=>[]);
const ops=await page.evaluate(()=>self.__ops||[]).catch(()=>[]);
const cookies=(await ctx.cookies().catch(()=>[])).filter(c=>['msToken','ttwid'].includes(c.name)).map(c=>({name:c.name,value:c.value}));
writeFileSync('/tmp/opencode/tt/trace-sig.json',JSON.stringify({tr,ops,cookies,sigs},null,2));
// blocks + correlation
const blocks=[];
for (const e of tr) if(e[0]==='WR'&&e[1]===12&&typeof e[2]==='string'&&e[2].length>=10) blocks.push(e[2]);
console.log('blocks:', blocks);
console.log('cookies:', cookies.map(c=>`${c.name}=${c.value.slice(0,60)}`).join(' | '));
console.log('sigs:', JSON.stringify(sigs.slice(0,2)));
// does any token contain a block (raw or in any rotation) ? 
const alltok = [...cookies.map(c=>c.value), ...sigs.flatMap(s=>Object.values(s))].join('|');
for (const bl of blocks) {
  console.log(`block ${bl}: ${alltok.includes(bl)?'FOUND RAW':'not raw'}`);
}
await b.close();
