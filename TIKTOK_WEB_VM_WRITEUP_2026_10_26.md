# TikTok Web — VM / obfuscation run-through (2026-10-26)

**Subject:** TikTok's web client anti-bot signing & the obfuscation around it
(the "custom-bytecode VM" family)
**Method:** public web-app analysis. Loaded the real `www.tiktok.com` in a
browser (DNS-overridden via Chromium `--host-resolver-rules`), captured every
outbound request + the signature params, saved 100+ webpack bundles, and
reverse-engineered the obfuscation architecture. **All TikTok API calls were
fulfilled locally — nothing was forwarded.**

> **TL;DR:** TikTok signs its `/api/*` calls with **`X-Gnarly`** (a fresh
> ~332-char token per request) + **`msToken`**, generated client-side inside a
> dedicated device SDK (`webmssdk.js` / `webmssdk_ex.js`) wrapped in a
> **string-table decoder + substitution cipher + an `O`-dispatch "bytecode"
> interpreter** that runs on small numeric instruction arrays. It's the most
> layered obfuscation of the batch — but the signatures are **client-computed
> and observable at the network boundary**, so it's a cost-raiser, not a
> boundary. The enforcement is server-side (the API rejects bad signatures).

---

## 1. Deployment / surface

- ~**103 webpack chunks** served from `tiktokcdn-us.com` (react-v18 webapp,
  async islands, players, i18n, telemetry).
- **Device/anti-bot SDKs:** `webmssdk.js` (245 KB) + `webmssdk_ex.js` (346 KB),
  `secsdk`, `slardar` (monitoring), BYTEDANCE tea-sdk telemetry, webcast.
- **API/identity hosts:** `www.tiktok.com/api/*`, `tiktokv.us` (`libra`,
  `mcs`, `mon` — webid/session/telemetry), `ttwstatic.com` (login static),
  `tiktokcdn-us.com/common-sign` (signing CDN), `tiktokw.us`.

## 2. Identity & signature state

**Cookies:** `ttwid` (versioned: `1|<b64>|<ts>|<hex>`), `msToken`,
`tt_csrf_token`, `tt_chain_token`, `gd_random`.

**Query params:** `device_id`, `iid`, `odinId`, `aid`, `app_language`,
`browser_*`, `screen_width`, `window_width`, `WebIdLastTime`.

**Signatures observed on `/api/*` (captured without forwarding):**

```
POST /api/recommend/item_list/
   X-Gnarly: MRWRx4R/cWfG-8D8kPDS8YE62Qyj5cKP2Ekg0WghxkrDUHwVjxqW9OKoRdqHtJZrR9H… (332)
   X-Bogus: 1   msToken: (cookie)

GET  /api/ba/business/suite/permission/list/
   X-Gnarly: MRdr14mESuY1CqbeqABAzTe1lThgugsRzjN0pBzWXkzHWh-gbpxkhplJqaiI64WH4/cQO… (332)
   msToken: zVx97aoKwv1n_hO-3cWBQkeIS7b2E5uXPFLcMaPcOe1wt8_CJ2tliJ0ec49boe… (160)
```

`X-Gnarly` is **fresh per request** (the two calls differ) → client-generated,
request-specific. `X-Bogus` is now a `1` stub in this build — **replaced by
`X-Gnarly`** as the main web signature.

## 3. The VM / obfuscation architecture (in `webmssdk_ex.js`)

Three layers interlock:

1. **String-table decoder `k[...]`** — 4,817 accesses; strings are decoded at
   runtime (not plaintext). Includes a **substitution-cipher alphabet** layer
   (a custom 52-char alphabet mapped positionally onto `a-zA-Z`) plus base64,
   so even decoded string data is transformed before use.
2. **`O[...]` dispatch object (opcodes 0–13)** — the "custom bytecode"
   interpreter the HN-era articles described. It is invoked with **small
   numeric instruction arrays**:
   ```
   O[0]([1390,0])            O[8](n,4)        O[6]([49,0,4029], ctx, this, args, 0, 49)
   O[10](A)                  O[12](k[1709])   O[3](A,Q,O[8](A,c))
   O[6]([255,0,8,4,1394,1,null,2,3,1395,6], i, this, arguments, …)
   ```
   These arrays are the encoded operation streams; `O[...]` dispatches on the
   leading values and executes the encoded logic.
3. **Numeric runtime state table** (`A.B.A[...].v` / `t.A[907].v`) holding the
   anti-bot state: `msToken`, `ttwid`, `tt_webid`, `fetchSignTime`,
   `XHRSignTime`, `signalCollectTime`, `exBundleSeed`, `exBundleProof`,
   `computeExProof`, `bogusIndex`, `msNewTokenList` — i.e. the exact inputs the
   signing code reads/updates.

Notable: the **classic `_0x` splice-VM** of 2023-24 is **gone** from this
build. TikTok re-architected to modular webpack + a dedicated device SDK with
the `k`-table + `O`-dispatch VM. The "crazy bytecode VM" is now inside
`webmssdk_ex.js`.

## 4. What we learned about "how it holds up"

- The signatures are **client-generated and observable**: we captured
  `X-Gnarly`/`msToken` at the network boundary without forwarding anything.
  Same class as the device-intelligence SDKs in this project (Stytch, Oscilar,
  Verisoul, Castle): the anti-bot computation happens in the browser, so it's
  instrumentable.
- **Attack approach:** hook the `k` decoder + the `O` dispatch + the
  sign-generation call sites at runtime (the same structural-hook playbook as
  Castle/Verisoul); differential (mutate a param → observe the signature
  change) to map inputs to `X-Gnarly`; then reimplement/replay. `X-Bogus` was
  publicly reversed this way; `X-Gnarly` is the successor and would take the
  same runtime pass.
- **Placement (100-pt resistance to determined RE):** the device SDK's
  obfuscation (`k`-table + substitution + `O`-dispatch VM) is the most layered
  of the batch — roughly **55–60**, comparable to Castle's pool/VM but with a
  real runtime state machine on top. It breaks cheap mass-bypass tools, but a
  determined attacker with runtime control can instrument it.
- **Server-side:** the *value* of `X-Gnarly`/`msToken` is validated server-side
  (bad signatures are rejected), so the signature is **server-verified but
  client-computed** — the replay/tamper story depends on server-side checks
  (IP/session/TLS correlation), exactly like the other vendors. Client signing
  is a cost-raiser; it isn't a trust boundary.

## 5. Honest boundaries

- We identified the architecture + observed the signatures; we did **not**
  fully reverse the `X-Gnarly`/`msToken` generation algorithm (a full pass over
  the `k`-table + `O`-dispatch + the compute function — a multi-day job, and
  `X-Bogus` is already publicly documented).
- All API calls fulfilled locally; nothing forwarded; no user/auth data
  touched; no probing of the API beyond the page's own calls (intercepted).

## 6. Interview line

> *"TikTok's web anti-bot is client-computed signing: `X-Gnarly` + `msToken`
> generated inside a device SDK wrapped in a string-table decoder, a
> substitution cipher, and an `O`-dispatch bytecode VM running on numeric
> instruction arrays. It's the most layered obfuscation of the batch — but it's
> still instrumentable at runtime, the signatures are observable at the network
> boundary, and the actual enforcement is server-side validation of the
> signature."*

## 7. Artifacts

| File | What |
|---|---|
| `scripts/tt-probe.mjs` | loads real TikTok (DNS-overridden), captures signatures + bundles, fulfills API locally |
| `artifacts/probe-log.json` | all captured requests + 103 saved bundle bodies |
| `artifacts/requests.txt` | every outbound request (method + URL) |
| `artifacts/signature-samples.json` | `X-Gnarly`/`msToken`/`X-Bogus` samples |
| `artifacts/hosts.txt` | outbound host set |
| `artifacts/bundle-manifest.json` | the 103 bundles (URL + size) |
| `js/webmssdk.js`, `js/webmssdk_ex.js` | key device-SDK bundles (from probe) |
