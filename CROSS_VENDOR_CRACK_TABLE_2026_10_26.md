# Cross-vendor "how hard to crack" table (2026-10-26, updated 2026-10-31)

Consolidated honest scores for the device-intelligence / anti-bot vendors
red-teamed in this project. Two scales, kept separate on purpose:

- **Crypto-RE effort (1–10):** how much reverse-engineering work the *client*
  layer cost us to get to plaintext / mint a token (self-assessed, per-vendor
  writeups).
- **Resistance to a determined RE (0–100):** how well the client holds up
  against an attacker with runtime control (injected hooks + DNS override +
  faithful execution). 100 = the client is a real trust boundary. All of these
  are **not** boundaries — server-side validation is the real enforcement.

> Everything here was done on authorized, own-stack / public-asset analysis;
> all telemetry fulfilled locally (nothing forwarded); findings stated honestly,
> not overstated.

---

## The table

| Vendor | What we proved | Client architecture | Client-computed & mintable? | Payload observed? | Tamper succeeded? | Crypto-RE effort (1–10) | Resistance to determined RE (0–100) | Honest boundary / real defense |
|---|---|---|---|---|---|---|---|---|
| **reCAPTCHA v2** (Auth0 login instance) | 829 KB engine dissected: minimal signal surface (navigator/canvas/screen/timing; **no webdriver/webgl/audio/fonts**), explicit **iframe-detection** check (`parent != self ? true : frameElement != null`), challenge flow mapped (anchor/bframe/reload/userverify); get-through attempt: automated clicks **rejected — no token, no reload fired** | thin widget + hidden interaction scoring; token exists only after server accepts | **No** — token is server-issued after interaction/challenge | **No client payload** (token only exists post-acceptance) | **No** — never got a token to tamper | n/a (no client crypto) | **~85** | Interaction scoring + image challenge = server-issued proof (same class as hCaptcha). No client payload to read or tamper — that's the point |
| **hCaptcha** | architecture mapped end-to-end: server-issued **JWT tickets** (`hsw`/`hsj`) pin **hash-verified** bundle URLs, challenge data encrypted (`enc_get_req`), context-gated **WASM secure module** (`hsw.js`) whose strings never decode + WASM never instantiates under automation; gate fires server-side on first contact ("Please try again") | JWT-ticketed, hash-pinned, WASM-backed module; encrypted wire | **No** — requires server tickets + challenge solve; client won't even init under automation | **Yes — encrypted envelope** (`enc_get_req` captured, opaque by design) | **No** — client won't init under automation | **n/a (couldn't init client module)** | **~85** | The client is **not the boundary**: server-side session assessment + human challenge (ML-solver problem, not RE). Closest to Fingerprint Pro's server-computed design |
| **Fingerprint Pro** | assessment only: loader v3.12.16+v4.1.6, OSS engine v5.3.0; identity **server-computed + signed** `_vid_` cookie; commercial agent CDN key-gated | server-computed identity (architecturally different) | No — identity not client-mintable | **Yes — encrypted P0 envelope** (3,273-B multi-layer, undecryptable) | **Yes — tamper differential**: spoofed signals → server accepted a *different* visitor_id (`SO22...` → `D4m9...`) | n/a (assessment) | **~80+ (identity)** | The strongest identity boundary of the batch; agent bundle not obtainable |
| **EveryDollar** (Dave Ramsey) | **no dedicated DFP vendor**: canvas/webgl/device markers are **rrweb session replay + Mixpanel `$device_id`**, not fraud SDKs; stack = Auth0 Universal Login + reCAPTCHA v2 + Datadog/Sentry + Segment/Mixpanel | Auth0-hosted login (server-decided) + rrweb/analytics; CloudFront edge | **No** — Auth0 session is server-issued; nothing client-mintable | **n/a** — no DFP payload shipped | **n/a** | n/a (no client crypto) | **~80** | Auth0 Universal Login + reCAPTCHA v2; server-verified token, clean client. No device-proof surface to attack |
| **Coinbase** (exchange + www) | **no in-house client fingerprinting**: exchange app = clean client, `coinbase_device_id` is analytics, auth = HMAC/TOTP API (`CB-ACCESS-*`); www behind Cloudflare JS challenge + Turnstile (`0x4AAAAAAADnPIDROrmt1Wwj`); cfsolve analysis grounds "edge verification is the good kind of blocker" | Cloudflare edge (TLS+HTTP2+JS-execution verification) + server-side API auth | **No** (edge + auth; nothing client-mintable) | **n/a** — clean client, no fp payload | **n/a** | n/a (no client crypto) | **~80 (edge)** | The good architecture: buy Cloudflare at the edge, HMAC/TOTP at the API. Client is clean by design |
| **Verisoul** | `dd` cipher validated 100%, 195-field payload, per-delivery rotation of ids **and** constants | client-ish `device_id`/`browser_id`; AES/`dd`-style cipher | Yes — mint your own; structural hooks (rotation defeats static) | **Yes — plaintext** (195-field payload fully read) | **Yes** — cipher reversed 100%, tamper validated | **9.5** | **72** | Replay bound by `session_token`; server checks the binding |
| **Stytch DFP** (Twilio) | AES-256-CBC key leak (`C+96⊕table8304`), full decrypt, tamper-reseal PoC | C++→WASM device-intel; compact/obfuscated/encrypted | Yes — key in code, WASM memory readable | **Yes — plaintext** (after key recovery + decrypt) | **Yes** — tamper-and-reseal PoC | **9** | **70** | Verdict is server-side; WASM readable, key recoverable |
| **Kraken** (Pro) | Cloudflare edge + **in-house proof-of-work** (`/pow` → double SHA-256 leading-zero nonce → `x-pow` header, fresh per request + server-verified) + WebAuthn passkey step-up + `iapi.kraken.com` risk API; **no client fingerprint bundle** | Cloudflare edge + PoW cost-gate + hardware auth + server-side risk | **No** (PoW is cost-based, can't be replayed/tampered) | **Yes — plaintext** (`x-pow` nonce visible client-side) | **No** — PoW is fresh + server-verified; tampering = invalid answer | **6** | **70** | The rare "client-computed" defense done right: PoW is fresh, verifiable, cost-based — the answer is worthless without the work. Strongest client-side defense of the batch |
| **TikTok web** | full stack: substitution-ciphered 1,913-entry string table, deobfuscated collector, 98,961-B inflated VM bytecode, live VM trace (nonce gen + engine fingerprint), **faithful runner mints X-Gnarly locally** | custom bytecode VM + self-hosting interpreter + RC4/XOR + per-request nonce + engine checks | **Yes — X-Bogus & X-Gnarly minted in-sandbox** | **Yes — plaintext** (signals + signatures captured) | **Yes** — minted locally in faithful runner | **9.5** | **65–70** | Server validates X-Gnarly + keyed `ttwid` sig; obfuscation raises cost, not a boundary |
| **HUMAN Security / PerimeterX** (BootBarn) | full surface mapped: PX-Show block deployment, 8-host stack, base91 string table decoded (525), plaintext collector telemetry at JSON boundary, embedded WebGL shader fingerprint; **clean-launch real Chrome loads the full storefront — launch signature is the gate** | server-scored block deployment; XOR-wire + base91 strings; WebGL shader + behavioral bundle | **No** (server decides + captcha); client-readable though | **Yes — plaintext** (collector telemetry at JSON boundary) | **No** — client-readable but no client-mintable proof; server scores | **4** | **65** | Server-side scoring decides (launch/UA/software-GL/behavior); captcha fallback. Client obfuscation is a cost-raiser, not a boundary |
| **Castle** | token fully client-minted (0 network), `__cuid`, deobfuscation pass (58,809-char pool, 1,612 identifiers, numeric-keyed table, ROT13/anti-debug workers), token = `Rw` binary-tree checksum, `Nx` hook, rotating-hash finding | heaviest obfuscation of the SDK batch | Yes — public bypass ecosystem (FuckCastle/TakionAPI) mints tokens from pk | **Yes — plaintext** (token minted entirely client-side, 0 network) | **Yes** — mint own token; public bypass ecosystem | **8** | **63** | Server-side Risk scoring; client is a carrier, not a proof |
| **Forter** (Wish.com) | `/events` payload captured at `sendBeacon` boundary — **encrypted Blob (`Be` magic)**, not plaintext; `forterToken` format decoded (`<site_id>_<ts>__<b64:16B>_-<chk>-v2`); `wpt.json` timing plaintext; 593 KB sensor is **CFG-flattened (switch-loop), not a VM**; signal surface navigator(222)/localStorage(44)/webgl(18+UNMASKED)/canvas/mouse | CFG-flattened sensor; encrypted telemetry envelope; `prop.json` config holds the likely key source | **Not yet** — payload envelope unbroken (no plaintext reached); token format decoded only | **Yes — encrypted** (`Be`-magic blob captured at sendBeacon; `wpt.json` plaintext) | **Not yet** — no plaintext to tamper; envelope held | **7** | **~62** | Server-side decrypt/verdict; blob stays opaque in transit so far. Flattening is a cost-raiser, not a boundary |
| **Binance** | full stack: AWS WAF JS challenge (`aws-waf-token`) + **in-house `BNC_FV_KEY` fingerprint** (`dynamic-fingerprint.4a1db346.js`: canvas/webgl/audio/fonts/hardware → 32-hex hash in `localStorage.__BNC_FP_INFO__`) — **read in full + tamper-proven** (signal rewrite flips the hash) + Themis feature-flags + HMAC/2FA API auth | AWS WAF edge + client-computed fingerprint cookie + server auth | Fingerprint **Yes** (tamper-proven); system No (WAF+auth) | **Yes — plaintext** (`__BNC_FP_INFO__` read in full) | **Yes** — signal rewrite flips the hash (tamper-proven) | **5** | **62** | Layering is the defense: WAF stops automated launches, API auth stops unauthorized actions, fingerprint is a correlation signal not a proof |
| **SEON** (v6 JS SDK) | 2,857-string table recovered, full 9,713-B pre-encryption fingerprint tree read at `JSON.stringify` boundary, `W;ver;salt;cipher` session fully client-minted (0 network), custom cipher (no WebCrypto/AES-GCM), tamper differential (tz/canvas/webdriver), DNS-exfil (`*.seondnsresolve.com`) | `_0x`-obfuscated JS (base64+URI string array); custom cipher; big fraud-browser detection surface (ad-link selectors, native-app IDs, webdriver probes) | **Yes — mint + tamper any signal before sealing** | **Yes — plaintext** (9,713-B pre-encryption tree at `JSON.stringify`) | **Yes** — mint + tamper before sealing (differential proven) | **7** | **60** | Server-side Fraud API scoring is the real check; client is a carrier. Custom cipher unbroken (we read plaintext pre-encryption, same boundary as all) |
| **Oscilar** | ChaCha20 state leak, 48-module payload, oracle | client `deviceID` in payload | Yes — mint/persist your own | **Yes — plaintext** (pre-encryption payload + key recovered) | **Yes** — clean-vs-tampered oracle | **7.5** | **58** | Server-side verdict; payload readable |
| **Kasada** (KPSDK: Twitch/Nike/FootLocker) | `x-kpsdk-cd` captured **plaintext JSON** — replay/garbage/empty `cd` all accepted (presence-checked); **deep pass (2026-11-01): fresh `x-kpsdk-ct` minted with one GET** — no `/tl` POST on this deployment, the cleared ct comes back in the `ips.js` response header, VM never verified; end-to-end mint → `gql.twitch.tv/integrity` 200 + fresh v4.local token on all 3 merchants; VM itself devirtualized (86-opcode ISA, 68,748-word stream, verified disassembler) | VM-obfuscated KPSDK (`ips.js`/`p.js`, ~158 KB); `ct` cleared server-side on asset delivery | **Yes — full session mint** (one-GET ct + arbitrary cd/h) | **Yes — plaintext** (`cd` JSON + `ips.js` header ct) | **Yes** — garbage `cd` accepted AND fresh `ct` minted | **4** | **~50** | `ct` is server-issued but the server never verifies the VM on this deployment — the whole client challenge reduces to fetching a public asset. IP/TLS binding is the only remaining lever (untested cross-host) |
| **Signifyd / OICU** (lite.js) | plaintext-input hook at `SubtleCrypto.encrypt` (read/tamper before sealing), `device_id` mint | ECDH(P-256)→HKDF→AES-GCM sealed to a static **server** public key; ECDSA signed | Yes — mint fresh (attack = "be the encryptor") | **Yes — plaintext** (at `SubtleCrypto.encrypt` boundary, pre-seal) | **Yes** — tamper before sealing, reseal, ship | **2** | **35** | Client crypto is **genuinely unbreakable** (public-key, private half never ships); finding comes from the *trust model* — client is the encryptor and server trusts client-asserted identity — not from crypto |
| **Sift** | **no live deployment pinned this pass**: probes of Wingstop/Wayfair/Instacart/Wish + CDN `s.js` 404s documented; next steps defined in hunt doc | n/a (not observed this pass) | n/a | n/a | n/a | n/a | n/a (not assessed) | Still to assess — hunt writeup + probe scripts in repo; no live target found yet |

---

## Reading the columns (what the scores actually mean)

- **Payload observed?** = did we get eyes on the *bytes the client ships* (the
  telemetry/fingerprint/token envelope), and were they **plaintext** (readable
  at a hook/`JSON.stringify`/sendBeacon boundary), **encrypted** (captured but
  opaque — envelope not decrypted), or **none** (no client payload exists)?
- **Tamper succeeded?** = did we modify the payload (or spoof its inputs)
  *before shipping* and have the **server still accept the result** — either
  the same response as clean, or a *different* accepted identity/verdict? This
  overlaps with "Client-computed & mintable?" but is not identical:
  - **Fingerprint Pro** is the clean counterexample: identity is **not**
    client-mintable (server-computed), yet **tamper succeeded** — spoofed
    signals got the server to accept a *different* visitor_id. Minting needs
    control of the identity; tampering only needs control of the inputs.
  - **Kraken** is the reverse: PoW is client-computed but **not** tamperable —
    the answer is worthless without the work, so tampering just produces an
    invalid answer.
- **Crypto-RE effort (1–10)** = how much *cryptographic* reverse-engineering
  the client layer required to reach plaintext / mint a token. High scores
  (Stytch, Oscilar, Verisoul) mean we had to recover symmetric keys or break a
  client-side cipher. **A low score here can mean two opposite things** — no
  crypto at all, *or crypto that is genuinely unbreakable client-side*.
  **Signifyd is the second case:** its ECDH+AES-GCM envelope is sealed to a
  static server public key, so the ciphertext cannot be decrypted without the
  server private key. We never broke it — we read/tampered the plaintext at the
  `SubtleCrypto.encrypt` boundary *before* sealing. That's why its crypto-RE
  effort is **2**: there was no crypto to break, the finding is about the trust
  model (client is the encryptor; server trusts client-asserted identity).
- **Resistance to determined RE (0–100)** = how well the client holds up against
  an attacker with runtime control. 100 = the client is a real trust boundary.
  None of these are boundaries — server-side validation is the real enforcement.

## Reading the TikTok row (final numbers)- **Crypto-RE effort 9.5:** to reach *plaintext + local minting* we had to
  crack the substitution cipher, deobfuscate the collector, extract + inflate
  the real bytecode, patch the live interpreter for a dynamic trace, and build
  a faithful runner that serves the real bundles on the real origin with all
  API calls fulfilled locally. That's the most layered client of the batch.
- **Resistance 65–70:** real bytecode VM + self-hosting interpreter + RC4/XOR +
  per-request nonce + engine-fingerprint checks. It breaks cheap mass-bypass
  tools, and the nonce means you can't force a token by spoofing a few props —
  but with runtime control it's fully traceable, and **we minted the current
  signature (X-Gnarly) locally** (part 5). It is a cost-raiser, not a trust
  boundary.

## Cross-cutting takeaways

1. **Every vendor in the SDK batch is client-computable.** None of Stytch,
   Oscilar, Verisoul, Castle, or Signifyd stop a determined attacker from
   minting/persisting tokens. The differences are *cost*, not *capability*.
2. **The server-issued-proof tier holds the top of the table.** hCaptcha,
   reCAPTCHA v2, Fingerprint Pro, and EveryDollar/Auth0 share the design that
   actually resists: the client cannot mint the proof — a server-issued token
   or signed identity only exists after server-side acceptance. That's why
   nothing client-side was breakable there.
3. **PoW isn't automatically good — it depends on verification.** Kraken's PoW
   is the good kind (fresh nonce, server-verified, answer worthless without
   the work). Kasada's `x-kpsdk-cd` is the cautionary kind (plaintext, garbage
   accepted, presence-checked not verified) — its real gate is the `ct`
   handshake + IP/TLS, not the client PoW.
4. **TikTok's web layer is the most *engineered* client** (custom VM +
   self-hosting + nonce) but lands in the same class: client-computed,
   instrumentable, server-verified.
5. **The real defense is always server-side** (risk scoring, keyed signatures,
   session/binding checks, WAF edge). Client obfuscation/VM/ciphers set the
   price of entry; they don't create the boundary.

## Source writeups

| Vendor | Writeup |
|---|---|
| Stytch | `dfp-redteam-stytch-twilio-2026-10-25/STYTCH_DFP_RECON_2026_10_25.md` |
| Oscilar | `ms-argus-attack-bots/bots/OSCILAR_CRYPTO_DEEP_2026_10_25.md` (+OSCILAR_DEEP/RECON/WRITEUP) |
| Verisoul | `dfp-redteam-verisoul-2026-10-25/VERISOUL_WRITEUP_2026_10_25.md` |
| Castle | `dfp-redteam-castle-2026-10-26/CASTLE_ASSESSMENT_2026_10_26.md` |
| Signifyd/OICU | `ms-argus-attack-bots/bots/OICU_LIBRARY_MITM_2026_10_25.md` (local-only repo) |
| SEON | `dfp-redteam-seon-2026-10-31/SEON_WRITEUP_2026_10_31.md` |
| hCaptcha | `dfp-redteam-hcaptcha-2026-10-31/HCAPTCHA_ASSESSMENT_2026_10_31.md` |
| HUMAN Security / PerimeterX (BootBarn) | `dfp-redteam-bootbarn-humanx-2026-10-31/BOOTBARN_HUMANX_ASSESSMENT_2026_10_31.md` |
| Coinbase | `dfp-redteam-coinbase-2026-10-31/COINBASE_ASSESSMENT_2026_10_31.md` |
| Binance | `dfp-redteam-binance-2026-10-31/BINANCE_ASSESSMENT_2026_10_31.md` |
| Kraken (Pro) | `dfp-redteam-kraken-2026-10-31/KRAKEN_ASSESSMENT_2026_10_31.md` |
| Fingerprint Pro | `ms-argus-attack-bots/bots/FINGERPRINT_PRO_ASSESSMENT_2026_10_26.md` |
| TikTok web | `dfp-redteam-tiktok-web-2026-10-26/TIKTOK_WEB_VM_WRITEUP_2026_10_26.md` (+BOUNDARY_PUSH, VM_TRACE, FAITHFUL_EXECUTOR, GNARLY_RUNNER) |
| Kasada | `dfp-redteam-kasada-2026-10-31/KASADA_MERCHANT_PASS_2026_10_31.md` (ksd-twitch.mjs, ksd-modify.mjs, nike-ksd.mjs, fl-ksd.mjs) |
| Forter | `dfp-redteam-forter-2026-10-31/FORTER_SENSOR_PASS_2026_10_31.md` (ftr-wish/events/hook/blob.mjs) |
| Sift | `dfp-redteam-sift-2026-10-31/SIFT_HUNT_2026_10_31.md` (sift-probe.mjs) |
| EveryDollar | `dfp-redteam-everydollar-2026-10-31/EVERYDOLLAR_ASSESSMENT_2026_10_31.md` (+RECAPTCHA_DISSECTION) |
| reCAPTCHA v2 | `dfp-redteam-everydollar-2026-10-31/RECAPTCHA_DISSECTION_2026_10_31.md` (engine: assets/recaptcha__en.js) |
