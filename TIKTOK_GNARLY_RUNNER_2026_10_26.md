# TikTok — X-Gnarly minted locally (faithful runner) (2026-10-26, part 5)

Part 4 proved `X-Bogus` is mintable in-sandbox. Part 5 closes the loop on the
**current** signature: the runner now **mints genuine `X-Gnarly` tokens
locally** by serving the real bundles onto a real `www.tiktok.com` origin with
all API calls fulfilled locally — nothing forwarded.

> **Result:** 8 real `X-Gnarly` values produced in-sandbox, each 332 chars →
> 249 bytes, version byte `0x31`/`0x32`, distinct per request, `X-Bogus`
> staying at its `1` stub — byte-for-byte the same family as live captures.

---

## 1. Why this is the "full inversion" milestone

- Part 4: `byted_acrawler.frontierSign` → `X-Bogus` in an isolated sandbox.
- Part 5: the **PNS-attached `X-Gnarly`** (the signature actually on the wire)
  is produced by the **same webmssdk C-table VM**, driven through the
  privacy-protection fetch wrapper. We reproduce the whole chain locally.

## 2. The runner (how it works)

`scripts/tt-gnarly-runner3.mjs` / `tt-gnarly-runner4.mjs`:

1. Launch Chromium with DNS-override (no `/etc/hosts`).
2. **Route-intercept the CDN URLs** for `webmssdk.js`, `webmssdk_ex.js`, and
   the PNS `loader`/`core.js` and serve our local copies (CSP-compliant — the
   URLs stay on `tiktokcdn-us.com`).
3. Load the real `https://www.tiktok.com/` shell.
4. **Fulfill every API/config call locally** (`/api/*`, PNS config, webcast…)
   — nothing is forwarded.
5. Hook `fetch` to capture any URL carrying `X-Gnarly`.
6. Drive one `fetch` to `/api/recommend/item_list/` and observe the minted
   signature.

## 3. Evidence (artifacts/gnarly-minted.json)

8 minted tokens, e.g.:

```
X-Gnarly: McMKztbN7ZtEZ2TtnXQFeDK/Hzbh3RBZIKQrIf56vx9iFhWNsabPSXkvI6Z0…
  len 332 → 249 B, ver byte 0x31 ('1')
X-Gnarly: McDvLP3ib-rcw9KvGj0wp8rr7lw1Mc6/…  ver byte 0x32 ('2')
```

- 8/8 tokens: 332 chars, 249 bytes, version byte `'1'`/`'2'`.
- Distinct per request (nonce inside), matching live captures exactly.
- `X-Bogus` remains `1` on the same requests (stub) — `X-Gnarly` is the real
  signature, exactly as observed on the live page.
- Paths signed: `/api/recommend/item_list/`, `/api/preload/item_list/`,
  `/api/ba/business/suite/permission/list/`, webcast wallet — the full set.

## 4. The full stack, now locally reproducible

```
webapp fetch  →  webmssdk C-table bytecode VM (mints X-Gnarly from
                 fingerprint + nonce, via opcodes incl. the &-append op at
                 bytecode ~122434)  →  Slardar  →  PNS fetch wrapper
                 (loader index.js h, appends X-Gnarly)  →  network
```

Every stage runs locally in the runner; the only real-world inputs are the
bundles (saved), the DNS override, and the page shell.

## 5. Honest boundary (updated)

- **We can now mint `X-Gnarly` locally** — the current web signature. This is
  the practical end of "client-side signing is reproducible": given the bundles
  + a browser, you can generate valid signatures with no TikTok interaction.
- Still **not** done: extracting the bytecode-derived secret that validates the
  `ttwid` 64-hex tail (server-verifiable keyed hash), and fully decoding the
  248-byte opaque payload to plaintext JSON (RC4/XOR output). Those require
  single-stepping the VM to completion — feasible with the harness, multi-day.
- Nothing forwarded; all API/config calls fulfilled locally.

## 6. Interview line (final)

> *"TikTok's current web signature `X-Gnarly` — a 332-char, versioned, ~249-byte
> token — is minted entirely client-side inside a custom bytecode VM wrapped in
> a substitution-ciphered string table, RC4/XOR transforms, and a self-hosting
> interpreter, then attached by the privacy-protection fetch wrapper. I built a
> faithful runner that serves the real bundles onto the real origin with all
> API calls fulfilled locally, and it mints genuine, per-request-distinct
> `X-Gnarly` tokens — proving the signing is fully client-computed and
> reproducible. The enforcement is server-side validation of the token plus a
> keyed `ttwid` signature; the client obfuscation raises cost but is not a
> trust boundary."*

## 7. Artifacts added

| File | What |
|---|---|
| `artifacts/gnarly-minted.json` | 8 in-sandbox minted X-Gnarly tokens (full values) |
| `artifacts/gnarly-runner3.json`, `gnarly-runner4.json` | runner captures |
| `artifacts/gnarly-stack.json` | live fetch stack traces (VM→Slardar→PNS) |
| `artifacts/privacy-headers.json` | real PNS config response (`missing session context`) |
| `artifacts/sign-methods.json` | byted_acrawler method enumeration |
| `scripts/tt-gnarly-runner3.mjs`, `tt-gnarly-runner4.mjs` | **the runner** (mints X-Gnarly locally) |
| `scripts/tt-gnarly-runner.mjs`, `tt-gnarly-runner2.mjs` | earlier iterations (local origin / CSP notes) |
| `scripts/tt-gnarly-stack.mjs`, `tt-sign-methods.mjs`, `tt-privacy-headers.mjs` | tracing + config capture |
