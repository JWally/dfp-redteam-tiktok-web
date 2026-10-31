# Cross-vendor "how hard to crack" table (2026-10-26)

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

| Vendor | What we proved | Client architecture | Client-computed & mintable? | Crypto-RE effort (1–10) | Resistance to determined RE (0–100) | Honest boundary / real defense |
|---|---|---|---|---|---|---|
| **Stytch DFP** (Twilio) | AES-256-CBC key leak (`C+96⊕table8304`), full decrypt, tamper-reseal PoC | C++→WASM device-intel; compact/obfuscated/encrypted | Yes — key in code, WASM memory readable | **9** | **70** | Verdict is server-side; WASM readable, key recoverable |
| **Verisoul** | `dd` cipher validated 100%, 195-field payload, per-delivery rotation of ids **and** constants | client-ish `device_id`/`browser_id`; AES/`dd`-style cipher | Yes — mint your own; structural hooks (rotation defeats static) | **9.5** | **72** | Replay bound by `session_token`; server checks the binding |
| **Oscilar** | ChaCha20 state leak, 48-module payload, oracle | client `deviceID` in payload | Yes — mint/persist your own | **7.5** | **58** | Server-side verdict; payload readable |
| **Castle** | token fully client-minted (0 network), `__cuid`, deobfuscation pass (58,809-char pool, 1,612 identifiers, numeric-keyed table, ROT13/anti-debug workers), token = `Rw` binary-tree checksum, `Nx` hook, rotating-hash finding | heaviest obfuscation of the SDK batch | Yes — public bypass ecosystem (FuckCastle/TakionAPI) mints tokens from pk | **8** | **63** | Server-side Risk scoring; client is a carrier, not a proof |
| **Signifyd / OICU** (lite.js) | plaintext-input hook at `SubtleCrypto.encrypt` (read/tamper before sealing), `device_id` mint | ECDH(P-256)→HKDF→AES-GCM sealed to a static **server** public key; ECDSA signed | Yes — mint fresh (attack = "be the encryptor") | **2** | **35** | Client crypto is **genuinely unbreakable** (public-key, private half never ships); finding comes from the *trust model* — client is the encryptor and server trusts client-asserted identity — not from crypto |
| **SEON** (v6 JS SDK) | 2,857-string table recovered, full 9,713-B pre-encryption fingerprint tree read at `JSON.stringify` boundary, `W;ver;salt;cipher` session fully client-minted (0 network), custom cipher (no WebCrypto/AES-GCM), tamper differential (tz/canvas/webdriver), DNS-exfil (`*.seondnsresolve.com`) | `_0x`-obfuscated JS (base64+URI string array); custom cipher; big fraud-browser detection surface (ad-link selectors, native-app IDs, webdriver probes) | **Yes — mint + tamper any signal before sealing** | **7** | **60** | Server-side Fraud API scoring is the real check; client is a carrier. Custom cipher unbroken (we read plaintext pre-encryption, same boundary as all) |
| **Fingerprint Pro** | assessment only: loader v3.12.16+v4.1.6, OSS engine v5.3.0; identity **server-computed + signed** `_vid_` cookie; commercial agent CDN key-gated | server-computed identity (architecturally different) | No — identity not client-mintable | n/a (assessment) | **~80+ (identity)** | The strongest identity boundary of the batch; agent bundle not obtainable |
| **TikTok web** | full stack: substitution-ciphered 1,913-entry string table, deobfuscated collector, 98,961-B inflated VM bytecode, live VM trace (nonce gen + engine fingerprint), **faithful runner mints X-Gnarly locally** | custom bytecode VM + self-hosting interpreter + RC4/XOR + per-request nonce + engine checks | **Yes — X-Bogus & X-Gnarly minted in-sandbox** | **9.5** | **65–70** | Server validates X-Gnarly + keyed `ttwid` sig; obfuscation raises cost, not a boundary |
| **hCaptcha** | architecture mapped end-to-end: server-issued **JWT tickets** (`hsw`/`hsj`) pin **hash-verified** bundle URLs, challenge data encrypted (`enc_get_req`), context-gated **WASM secure module** (`hsw.js`) whose strings never decode + WASM never instantiates under automation; gate fires server-side on first contact ("Please try again") | JWT-ticketed, hash-pinned, WASM-backed module; encrypted wire | **No** — requires server tickets + challenge solve; client won't even init under automation | **n/a (couldn't init client module)** | **~85** | The client is **not the boundary**: server-side session assessment + human challenge (ML-solver problem, not RE). Closest to Fingerprint Pro's server-computed design |

---

## Reading the columns (what the scores actually mean)

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
2. **Fingerprint Pro is the architectural exception** — server-computed +
   signed identity is the only design where the client isn't the minting party.
3. **TikTok's web layer is the most *engineered* client** (custom VM +
   self-hosting + nonce) but lands in the same class: client-computed,
   instrumentable, server-verified.
4. **The real defense is always server-side** (risk scoring, keyed signatures,
   session/binding checks). Client obfuscation/VM/ciphers set the price of
   entry; they don't create the boundary.

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
| Fingerprint Pro | `ms-argus-attack-bots/bots/FINGERPRINT_PRO_ASSESSMENT_2026_10_26.md` |
| TikTok web | `dfp-redteam-tiktok-web-2026-10-26/TIKTOK_WEB_VM_WRITEUP_2026_10_26.md` (+BOUNDARY_PUSH, VM_TRACE, FAITHFUL_EXECUTOR, GNARLY_RUNNER) |
