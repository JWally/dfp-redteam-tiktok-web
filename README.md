# TikTok Web — VM / obfuscation run-through

**2026-10-26 · authorized, public-asset analysis · all TikTok API calls
fulfilled locally (nothing forwarded)**

> TikTok signs its `/api/*` calls with **`X-Gnarly`** (fresh ~332-char token per
> request) + **`msToken`**, generated client-side in a device SDK
> (`webmssdk.js` / `webmssdk_ex.js`) wrapped in a **string-table decoder +
> substitution cipher + an `O`-dispatch "bytecode" VM** (numeric instruction
> arrays). Most layered obfuscation of the batch — but the signatures are
> client-computed and observable at the network boundary, so it's a
> cost-raiser, not a boundary. Enforcement is server-side.

## What's here
- `TIKTOK_WEB_VM_WRITEUP_2026_10_26.md` — full writeup (deployment, identity/
  signature state, the k-table + O-dispatch VM architecture, attack approach,
  honest boundaries, interview line)
- `scripts/tt-probe.mjs` — loads the real TikTok web app (Chromium
  `--host-resolver-rules` DNS override), captures every outbound request + the
  signature params, saves bundles; **fulfills all API calls locally**
- `artifacts/` — signature samples (X-Gnarly/msToken/X-Bogus), request log,
  outbound hosts, bundle manifest

```bash
npm install
node scripts/tt-probe.mjs     # → probe-log.json + artifacts/ (local only)
```

## Key findings
1. **Signatures**: `X-Gnarly` (332, fresh/request), `msToken` (160),
   `X-Bogus` → now a `1` stub (superseded). Identity: `ttwid`, `device_id`,
   `iid`, `odinId`.
2. **The VM**: `k[...]` string-table (4,817 refs) + substitution cipher +
   `O[0..13]` dispatch running numeric instruction arrays
   (`[1390,0]`, `[49,0,4029]`, `[255,0,8,4,1394,1,…]`).
3. **Reality check**: the classic `_0x` splice-VM is gone; it's modular
   webpack + a device SDK with the k/O VM inside `webmssdk_ex.js`.
4. **Attack surface**: signatures observable client-side; instrument the
   k-decoder + O-dispatch + sign call sites (same playbook as Castle/Verisoul).
5. **Placement**: ~55–60 on "resistance to determined RE" — breaks cheap
   mass-bypass, not a trust boundary.

## Honest boundaries
No full `X-Gnarly`/`msToken` algorithm reversal (multi-day; `X-Bogus` is
publicly documented). All API calls fulfilled locally; no user/auth data.

## Demo video — the full minted signatures

`assets/videos/full-payload-demo.mp4` — a terminal-capture video of
`scripts/demo-tiktok.py` showing the **complete minted X-Gnarly values**
(332-char signatures per request, minted in-sandbox by the faithful runner —
no truncation). Reproduce it yourself:

```bash
python3 scripts/demo-tiktok.py artifacts/gnarly-minted.json
```

The full minted values are also at `artifacts/gnarly-minted.json`.
