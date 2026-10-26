# TikTok — Faithful executor + token structure (2026-10-26, part 4)

Follow-on to parts 1–3. Option (c): attempt a **faithful local executor** of
TikTok's signing pipeline and pin down the token structure. Result: **the
real signing code runs locally** — we invoked the shipped `byted_acrawler`
interface in a sandbox and it produced genuine signatures from the real
bytecode VM, no TikTok servers involved.

All API calls fulfilled locally; nothing forwarded.

---

## 1. The faithful executor works

Instead of reimplementing the interpreter, we **loaded the real `webmssdk.js`
(+ `webmssdk_ex.js`) into an isolated page** on a local origin and let the
shipped code run its own VM. `webmssdk.js` exposes a global interface
`byted_acrawler`:

```
byted_acrawler = {
  frontierSign, getReferer, init, isWebmssdk, registerWsSigner,
  report, setTTWebid, setTTWebidV2, setTTWid, setUserMode
}
```

`frontierSign` is a thin **bytecode-VM entry point**:
```js
function X(n){ return Y(72103, t, this, arguments, 0, 25) }
//                    ^entry   ^frame      ^args ^regs
```
— i.e. start the VM at bytecode offset **72103** with 25 registers.

Calling it in-sandbox returns **genuine signatures**:

```
frontierSign('param=test&a=1')  → { "X-Bogus": "6hctNiPKsZ/dMnCF" }
frontierSign('aid=1988&param=OTHER') → { "X-Bogus": "f/fEG+EZcGnWowsY" }
frontierSign(full item_list URL) → { "X-Bogus": "6Mv05IaRuF5m7ewc" }
```

- Format matches the public 16-char `X-Bogus` (base64url-ish, starts with a
  versioned char).
- Each call = a **fresh VM execution** of the real bytecode program →
  distinct outputs per input.
- Same input twice → different output (nonce inside), consistent with part 3.
- Also confirmed on the **live** page: `byted_acrawler.frontierSign` exists and
  returns the same shape.

**This proves the signing pipeline is fully client-side-executable.** Given the
bundle + a browser, you can mint signatures with no interaction with TikTok.

## 2. Where the current wire signature (X-Gnarly) lives

- The live page sends **`X-Gnarly`** (~332 chars) as the main web signature;
  `X-Bogus` is now a `1` stub in the webapp.
- Instrumented `fetch`/XHR: X-Gnarly is added **inside the PNS
  (privacy-protection) fetch wrapper** (`tiktok_privacy_protection_framework/…/core.js`,
  `globalName=__PNS_RUNTIME__`), which wraps webmssdk's fetch. Disabling the
  service worker does **not** remove it → it's in-page, not SW.
- It is **not a literal string in any of the 103 bundles** (grep case-insensitive
  across all saved JS: zero hits for `gnarly/narly/X-`) — it is assembled at
  runtime from decoded fragments (the same table/XOR machinery).

## 3. X-Gnarly structure

Decoded (base64url → bytes) across 9 distinct captured values:

```
X-Gnarly = b64url( versionByte ‖ 248 bytes opaque )
            versionByte ∈ {'0','1','2','3'}   (ASCII 0x30..0x33)
```

- 332 b64url chars → **249 bytes**.
- First byte is a **version/type tag** (0x30/0x31/0x32/0x33) — matches the
  public X-Bogus "versioned first char" design, now on a bigger payload.
- Remaining 248 bytes are high-entropy (not plaintext JSON) — the device
  fingerprint + nonce packed through the RC4/XOR layers inside the VM.

## 4. Token family summary (what we now know on the wire)

| Token | Wire form | Decoded | Role |
|---|---|---|---|
| `X-Bogus` | 16 chars b64url | ~12 B | legacy signature; now `1` stub in webapp; **mintable via frontierSign** |
| `X-Gnarly` | 332 chars b64url | 249 B = ver + 248 opaque | current main web signature, per-request, PNS-attached |
| `msToken` | 160 chars b64url | ~120 B opaque | session token (rotates on reload) |
| `ttwid` | `1\|<32B>\|<ts>\|<64hex>` | 32B device-id + keyed sig | device/session identity, keyed hash tail |

## 5. Honest boundary (final)

- **Minting:** we can generate the legacy `X-Bogus` locally and have a faithful
  VM executor running the real bytecode. Reproducing `X-Gnarly`/`msToken`
  payload contents requires driving the same VM to the exact PNS call path with
  correct page state — feasible with the harness we built, but multi-day to
  fully invert (the payload is opaque RC4/XOR output, and the `ttwid` sig is
  keyed with a secret derived inside the bytecode).
- **What we proved:** signing is client-computed and locally reproducible; the
  collector reads an enumerated device set; the VM runs a nonce generator +
  engine fingerprint; the tokens carry version tags and opaque payloads.
- We did **not** forward anything or probe beyond the page's own calls.

## 6. Artifacts added

| File | What |
|---|---|
| `artifacts/local-sign3.json` | in-sandbox frontierSign outputs |
| `artifacts/live-frontier.json` | live-page frontierSign outputs |
| `artifacts/gnarly-qp2.json` | fetch wrapper stack traces showing PNS attachment |
| `artifacts/sw-test.json` | SW on/off X-Gnarly comparison |
| `artifacts/pns-core.js`, `pns-loader.js` | the privacy-protection bundles (from probe) |
| `scripts/tt-local-exec.mjs` | faithful-executor probe (loads real bundles in sandbox) |
| `scripts/tt-local-sign.mjs`, `tt-local-sign2.mjs`, `tt-local-sign3.mjs` | invoke byted_acrawler.frontierSign in-sandbox |
| `scripts/tt-live-frontier.mjs` | live-page frontierSign |
| `scripts/tt-gnarly-src.mjs`, `tt-gnarly-qp.mjs`, `tt-gnarly-qp2.mjs`, `tt-sw-test.mjs` | X-Gnarly origin tracing |
