# TikTok — VM executed live: nonce generator + engine fingerprint (2026-10-26, part 3)

Follow-on to parts 1–2. We **executed the real bytecode VM** by patching the
interpreter in-flight on the live page and capturing a ground-truth execution
trace (`artifacts/vm-trace.json`, `vm-ops.json`). This turns the static
"the VM does X" claims into **observed, verified behavior**.

All API calls fulfilled locally; nothing forwarded.

---

## 1. How we traced it

Intercepted `webmssdk.js` over the network and patched three primitives *before
the interpreter ran*:

- `N(n,t,r)` (register write) → log `[reg, value]` (capped at 3000)
- `m(n,t)` (XOR string decoder) → log the decoded plaintext (capped)
- the dispatch loop `var f=O[u.u++]<<8|O[u.u++]; C[f](u)` → log every opcode
  + bytecode offset (capped at 12k)

No behavior changed; we only appended side-effect-free logging.

## 2. The opcode table, for real

- **`C` table = `webmssdk.js` bytes 5556..154390 — 365 handlers** (opcodes
  0..~364). Earlier static count of 81 was an undercount from a faulty
  brace-splitter; the live trace shows opcodes 0..362 actually dispatched.
- Trace reached bytecode offsets 0..98,941 of the 98,961-byte program — i.e.
  **the entire embedded program executes**, including far into the tail.
- 20,000+ dispatches captured (cap), 239 distinct opcodes observed live.

## 3. The nonce generator — recovered and verified

The dominant pattern in the register-write trace is a loop that builds
**10-character random blocks** over the 62-char alphabet
`a-zA-Z0-9`. Per character:

```
t = Date.now()              // 1793019425111
r = Math.random()           // 0.1966901364328294
v = Number(String(t) + "." + r)     // 1793019425111.1968  (t with r as fraction)
i = Math.floor(v * 62) % 62         // 111167204356894 % 62 = 12
token += charset[i]                 // charset[12] = 'm'
```

**Verified against the trace:** `floor(1793019425111.1968 * 62) % 62 = 12`
→ `'m'`, exactly the char the trace shows being appended
(`UgTmp… → UgTmpm…`).

Observed blocks (all 10 chars, all in the 62-char charset):

```
H0rLmdZqCL  mJjrXkMBoD  OmuzqfXc5L  cSanh2BeFu  UgTmpLZHgl  XUBCDMG9lF
comorR6TMI  zHSlWJbzOV  IvKhia6yFO  azPpluZDzS  si6AuWdWoJ  D43SGuyFN8 …
```

**This is the entropy source that makes the token non-reproducible from fixed
signals** — it explains part 2's finding that byte-identical contexts produce
different `ttwid`/`msToken`. The blocks are a pure function of
`Date.now()+Math.random()`, then **transformed** (RC4/XOR layers) into the wire
token — none of the blocks appear raw in the captured `ttwid`/`msToken`/
`X-Gnarly` strings.

## 4. Engine fingerprinting — observed

The trace also shows the VM doing **browser-engine detection** by capturing
runtime artifacts:

```js
// (1) call toFixed with an invalid digit count → capture the RangeError message
(-1).toFixed(80)  // → "toFixed() digits argument must be between 0 and 100"
// read e.message, then e.length === 51  (hardcoded expected length)
// (2) introspect native function toString
Array.toString()  // → "function Array() { [native code] }"
// read .name === "Array", and split/join for structure
```

Exact trace sequence:

```
WR 8=-1                 // call (-1).toFixed(80)
m('toFixed')            // XOR-decoded
m('message')            // e.message
WR 8="toFixed() digits argument must be between 0 and 100"
m('length'); WR 7=51    // expect length 51
m('split'); m('name'); m('join')
WR 9="function Array() { [native code] }"   // Array.toString()
WR 8="Array"            // .name
```

Different JS engines / tampered runtimes produce different error-message text
and different native-function `toString()` → this is a **detector for
engine-swap and native-function tampering**, layered on top of the WebGL/nav
fingerprint from the collector.

## 5. What this means for the honest picture

- The signatures are **client-computed from (a) a device fingerprint and
  (b) a fresh nonce**, then packed through RC4 + XOR inside the VM. The nonce
  guarantees tokens aren't replayable/fixable by spoofing a few props; the
  fingerprint binds them to the device.
- The full token can be reproduced only by **executing the VM faithfully**
  (which we now *can* trace, and could step through fully given the
  interpreter + bytecode we've extracted) — a multi-day project, and
  `X-Bogus`'s public reversal history shows the same effort scale.
- We have now **statically decoded** the string tables and **dynamically
  verified** the two core runtime behaviors (nonce gen, engine fingerprint).

## 6. Placement update

On "resistance to a determined RE with runtime control," TikTok's stack now
scores higher than the device-SDK vendors in this project: **~65–70** (was
55–60). Reasoning: real bytecode VM + self-hosting interpreter + RC4/XOR +
per-request nonce + engine-fingerprint checks. Still not a trust boundary —
every input is observable at runtime and the program is fully traceable with
the tools above — but it costs meaningful RE time and defeats cheap tamper
tools.

## 7. Artifacts added

| File | What |
|---|---|
| `artifacts/vm-trace.json` | live register-write + XOR-decoded-string trace |
| `artifacts/vm-ops.json` | live opcode dispatch stream (offset, opcode) |
| `artifacts/trace-sig.json` | trace + cookies + X-Gnarly in the same run |
| `scripts/tt-vm-trace.mjs` | the interpreter-patching probe |
| `scripts/tt-trace-sig.mjs` | trace + signature correlation probe |
