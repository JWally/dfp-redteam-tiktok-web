# TikTok — Honest-boundary push (2026-10-26, part 2)

**What we actually cracked vs. what remains.** This is the follow-on to
`TIKTOK_WEB_VM_WRITEUP_2026_10_26.md`. We took the boundary from "we see the
architecture" to **plaintext**: decoded the string tables, deobfuscated the
collector, extracted + inflated the real VM bytecode program, and instrumented
the live page to capture the exact device signals the SDK reads. All API calls
fulfilled locally; nothing forwarded.

---

## 1. The string-table decoder — cracked

`webmssdk_ex.js` ships a 1,913-entry string table `k`. The decoder (visible at
byte 30119) is a **positional substitution cipher + base64**:

```js
k = [
  "vXypzJ==", "d8Y9TYE7VFeuxx09aOIsgpyggkVuKJ0+xXX/7jbR!mNZLg", /* … 1911 more */
].map(A => A.split("").map(c =>
  -1 === "UqIuMBXWkiHDnZwQjrycfSJpFtANxCVvbazsTKEhGgYRdOmPloeL".indexOf(c)
    ? c
    : "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"[custom.indexOf(c)]
).join(""))
```

- Each char in the 52-char custom alphabet maps **positionally** onto
  `a-zA-Z`; non-alphabet chars (base64 `+/=`, digits) pass through.
- Result is base64 text, decoded with `atob` at use sites.
- Verified decode: `k[688]→"string"`, `k[629]→"getItem"`,
  `k[862]→"charCodeAt"`, `k[1219]→"call"`, `k[1439]→"function"`.
- Full table recovered: `artifacts/deob/k-table.txt` (all 1,913 plaintext
  strings).

**Key plaintext strings recovered** (see `k-table.txt`):
WebGL (`getParameter`, `getSupportedExtensions`, `WEBGL_debug_renderer_info`,
`UNMASKED_VENDOR_WEBGL`, `UNMASKED_RENDERER_WEBGL`, `SHADING_LANGUAGE_VERSION`,
`sharedMemory`, `maxStorageTextures*`), plugins
(`plugins.`, `loadPlugins`, `PLUGINS_LOAD_PREFIX`), cookies/storage
(`device_id`, `USER_ID_COOKIE_NAME`, `DEVICE_ID_COOKIE_NAME`, `localStorage`,
`sessionStorage`, `setStorageUserIdAndDeviceId`, `glueCodeForStorageSecurity`),
and a regex that strips secrets from URLs:
`(cookie|auth|jwt|token|key|ticket|secret|credential|session|password)`.

## 2. The collector — deobfuscated

`artifacts/deob/webmssdk_ex.deob.js` is the full bundle with every `k[i]`
replaced by its literal. It contains the **WebGL fingerprint field list**:

```js
w = {
  supportedExtensions, antialias, blueBits, depthBits, greenBits,
  maxAnisotropy, maxCombinedTextureImageUnits, maxCubeMapTextureSize,
  maxFragmentUniformVectors, maxRenderbufferSize, maxTextureImageUnits,
  maxTextureSize, maxVaryingVectors, maxVertexAttribs,
  maxVertexTextureImageUnits, maxVertexUniformVectors,
  shadingLanguageVersion, stencilBits, version,
  vendor, renderer, gpu        // from UNMASKED_VENDOR/RENDERER_WEBGL
};
```

plus a transform (`A[1428]`) that maps raw WebGL values → an encoded form.

## 3. The real VM — `webmssdk.js`

The signature computation is a **custom bytecode VM**, not plain JS:

- **Readers:** `J(n)` 16-bit BE, `L(n)` 8-bit, `K(n)` 24-bit over a Uint8Array
  `O` (instruction pointer `n.u`).
- **String decode:** `m(n,t)` = UTF-8 decode → **XOR** each byte with key `t`
  (repeating); results cached in `S[`a`+":"+`b`]` (splittable concat cache).
- **RC4 block** at byte 12859 (256-byte KSA/PRGA) — the encrypted payload layer.
- **Opcodes:** `C[]` dispatch table of `function(n){…}` handlers (call, return,
  member access, control flow, exceptions, `Object.defineProperty`, bit ops…).
- **Frames:** `Y()` builds a VM state `{A:regs, M:stack, I:jumps, o:parent, S}`;
  calls chain frames via `n.o` (so the bytecode can recurse/isolate).
- **State:** registers map to a numeric state table
  `A.B.A[i].v` / `t.A[907].v` holding `msToken`, `ttwid`, `tt_webid`,
  `fetchSignTime`, `exBundleProof`, `bogusIndex`, `msNewTokenList`, `WEBGL`.
- **The bytecode blob is embedded + inflated:** `O = dwInfl.dwAbA(R("1J13…"))`
  → 69.5 KB base64 → 52 KB → **98,961 bytes of actual VM bytecode**
  (`artifacts/deob/vm-bytecode.bin`).
- **Self-hosting:** the T-table (1,272 entries) includes base64 fragments of
  the VM's *own* interpreter source (`function J(n){return O[n.u++]<<8|…}`,
  `e[u+2]=(3&c[2])<<6|c[3]`, frame builders) decoded + evaluated at runtime.
  The VM rebuilds parts of itself from data — an anti-tamper / anti-trace
  measure that defeats static breakpoints on the interpreter body.

## 4. The signatures, at the plaintext boundary

**`ttwid` = `1 | <32B device-id base64url> | <unix-ts> | <64-hex sig>`**

- The 32-byte device-id is high-entropy binary, not plaintext JSON.
- The 64-hex tail is a **keyed hash** (MD5- or SHA-256-family — the VM embeds
  **MD5 round constants** in T: `680876937`=0xd76aa478, `389564586`=0xe8c7b756,
  `606105819`=0x242070db, …). None of the public candidates
  (`md5(id)`, `md5(id+ts)`, `md5("1|id|ts")`, `sha256(…)`, …) reproduce it →
  the key is **derived/embedded in the bytecode**, so it's server-verifiable
  and not derivable from the wire.

**`msToken` = 160-char base64url → 120 bytes high-entropy binary** (RC4/XOR
layer; not plaintext-decodable without running the VM).

**`X-Gnarly`** = fresh ~332-char base64url per request (249 bytes).

## 5. What the SDK actually reads (live instrumentation)

We injected property traps **before** the SDK loaded and captured every read on
the real page (`artifacts/instr-reads.json`, 726 reads):

| Signal | Value captured (this headless run) |
|---|---|
| `navigator.userAgent` | `Mozilla/5.0 … HeadlessChrome/14…` (256 reads) |
| `hardwareConcurrency` | 12 (35 reads) |
| `deviceMemory` | 32 (6) |
| `maxTouchPoints` | 0 (9) |
| `platform` | `Linux x86_64` (25) |
| `language` / `languages` | `en-US` (19/17) |
| `vendor` / `product` / `productSub` | `Google Inc.` / `Gecko` / `20030107` |
| `webdriver` / `onLine` / `cookieEnabled` | `true`/`true`/`true` |
| `screen.width×height` | 1280×720 (19 each) |
| `screen.colorDepth` / `pixelDepth` | 24 (2 each) |
| `screen.orientation` | (4) |
| WebGL `getParameter` | 22 distinct params incl. `VERSION`, `SHADING_LANGUAGE_VERSION`, all `MAX_*`, bit-depths, `UNMASKED_VENDOR_WEBGL` (`Google Inc. (Google)`), `UNMASKED_RENDERER_WEBGL` (`ANGLE (Google, Vulkan … SwiftShader)`) |
| `getExtension` | `WEBGL_debug_renderer_info`, `EXT_texture_filter_anisotropic` |
| `getSupportedExtensions` | full list (3) |
| `navigator.permissions` | (63 reads) |
| `navigator.connection` | (49) |
| cookies read | `ttwid`, `msToken`, `tt_csrf_token`, `tt_chain_token`, `gd_random` |

**This is the honest "what it's looking at" answer:** navigator composite
(UA/platform/cores/memory/touch/language/vendor), screen dims + depth,
the full WebGL capability surface, permissions/connection, and the storage +
cookie state — wrapped in the VM + cipher layers so the wire payload is opaque.

## 6. Tamper differential (what feeds the token)

| Experiment | Result |
|---|---|
| Different contexts, tampered nav/UA | `msToken` + `ttwid` differ |
| **Same context**, reload w/ tamper | `msToken` rotates |
| **Same context**, reload w/o tamper (control) | `msToken` **also** rotates |
| Two **byte-identical** contexts (fixed UA + injected identical signals) | `ttwid` device-id **differs**, `msToken` **differs** |

**Honest conclusion:** the collected signals feed the signature, but the token
is **not a pure deterministic hash of the settable signals** — there is a
**nonce/session component** (and/or signals we can't set, e.g. canvas,
timezone, WebGL state from the real renderer). So you can't force a target
token by spoofing a handful of navigator/screen props; the device-id and token
carry entropy beyond the fingerprint fields we can control.

## 7. Honest boundary (what we did NOT break)

- We did **not** fully decrypt `msToken`/`X-Gnarly` payloads to plaintext JSON —
  that requires executing the VM (RC4 + XOR + self-hosting interpreter) over
  the embedded bytecode, a multi-day job (X-Bogus took public RE teams that
  long; `X-Gnarly` is the successor).
- We did **not** extract the keyed `ttwid` signature secret (it's derived
  inside the bytecode; none of the public-part candidates matched).
- We proved the signals **are** read and the payloads **are** client-built and
  opaque, and that a nonce is involved — which is the right scope for an
  interview-grade honest finding.

## 8. Interview line (updated)

> *"TikTok's web anti-bot is client-computed signing wrapped in a real custom
> bytecode VM: a 1,913-entry substitution-ciphered string table, an RC4 + XOR
> transform, a self-hosting interpreter that rebuilds itself from base64, and a
> ~99 KB inflated bytecode program embedded in `webmssdk.js`. The signatures —
> `X-Gnarly` (fresh/request), `msToken` (120B opaque), `ttwid` (32B device-id +
> keyed 32B sig) — are all observable at the network boundary and fed by a
> device-fingerprint read I've enumerated live (navigator, screen, 22 WebGL
> params, extensions, storage). It's the most layered obfuscation of the batch
> and the token includes a nonce so it's not spoofable by fixing a few props —
> but it's still client-computed and instrumentable; the real enforcement is
> server-side validation of the keyed signature."*

## 9. Artifacts added

| File | What |
|---|---|
| `artifacts/deob/k-table.txt` | all 1,913 decoded strings |
| `artifacts/deob/k-entries.json` | raw ciphertext entries |
| `artifacts/deob/k-plaintext.json` | decoded entries |
| `artifacts/deob/webmssdk_ex.deob.js` | collector bundle, fully deobfuscated |
| `artifacts/deob/vm-bytecode.bin` | the inflated 98,961-byte VM program |
| `artifacts/instr-reads.json` | 726 live device-signal reads |
| `artifacts/tamper-results.json` | cross-context differential |
| `artifacts/ctx-tamper.json` / `deterministic2.json` | same-context + determinism controls |
| `scripts/tt-instr-probe.mjs` | live instrumentation probe |
| `scripts/tt-tamper-probe.mjs` | cross-context tamper differential |
| `scripts/tt-ctx-tamper.mjs` / `tt-ctx-control.mjs` | same-context + control |
| `scripts/tt-deterministic.mjs` / `tt-deterministic2.mjs` | nonce/entropy check |
