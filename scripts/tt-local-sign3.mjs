#!/usr/bin/env node
/** tt-local-sign3.mjs — verify X-Bogus stability/format, hunt X-Gnarly. */
import { chromium } from 'playwright';
import http from 'node:http';
import { writeFileSync, readFileSync } from 'node:fs';

let core = readFileSync('/tmp/opencode/tt/js/webmssdk.js', 'utf-8');
let ext  = readFileSync('/tmp/opencode/tt/js/webmssdk_ex.js', 'utf-8');
const DL = 'var f=O[u.u++]<<8|O[u.u++];try{C[f](u)}';
core = core.replace(DL, 'var f=O[u.u++]<<8|O[u.u++];(self.__steps=(self.__steps||0)+1);if(self.__steps>8000000)throw new Error("STEP_LIMIT");try{C[f](u)}');

const srv = http.createServer((req,res)=>{
  res.setHeader('Content-Type','text/html');
  res.end('<!doctype html><html><body>sandbox</body></html>');
});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const port = srv.address().port;
const b = await chromium.launch({ headless:true });
const page = await b.newPage();
await page.route('http://*', async route => { await route.fulfill({ status:200, contentType:'application/json', body:'{}' }); });
await page.goto(`http://127.0.0.1:${port}/`);
await page.addScriptTag({ content: core });
await page.waitForTimeout(4000);
await page.addScriptTag({ content: ext });
await page.waitForTimeout(8000);

const res = await page.evaluate(async () => {
  const ac = self.byted_acrawler;
  const out = {};
  // stability: same input twice
  const input = 'aid=1988&app_language=en&device_platform=web&param=x';
  out.same1 = await ac.frontierSign(input);
  out.same2 = await ac.frontierSign(input);
  out.diff1 = await ac.frontierSign('aid=1988&param=OTHER');
  // does it sign the full URL? try a realistic item_list URL
  out.urlSign = await ac.frontierSign('https://www.tiktok.com/api/recommend/item_list/?aid=1988&app_language=en&browser_language=en&device_id=7240000000000000&iid=7310000000000000&WebIdLastTime=1793019000&window_width=1280&window_height=720');
  // check for any gnarly-related globals/methods
  out.gnarlyKeys = Object.keys(self).filter(k=>/gnarly|sign/i.test(k));
  out.acKeys = Object.keys(ac);
  // try to find a sign method with 'body' or full-request support
  out.isWebmssdk = ac.isWebmssdk;
  out.getReferer = await ac.getReferer ? String(await ac.getReferer()).slice(0,80) : null;
  return out;
}).catch(e=>({err:String(e).slice(0,200)}));
console.log(JSON.stringify(res,null,2));
writeFileSync('/tmp/opencode/tt/local-sign3.json', JSON.stringify(res,null,2));
srv.close(); await b.close();
