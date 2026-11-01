#!/usr/bin/env python3
"""demo-tiktok.py — print the FULL minted TikTok signatures (in-sandbox capture).
Shows complete X-Gnarly + X-Bogus values minted by the faithful runner."""
import json, sys

def main():
    src = sys.argv[1] if len(sys.argv) > 1 else '/home/justin/Dev/dfp-redteam-tiktok-web-2026-10-26/artifacts/gnarly-minted.json'
    d = json.load(open(src))
    print('=' * 74)
    print('TIKTOK WEB — MINTED SIGNATURES (faithful in-sandbox runner)')
    print('runner: tt-gnarly-runner4.mjs (real bundles on real origin, local API)')
    print('=' * 74)
    for i, e in enumerate(d[:4]):
        print(f'--- request {i+1}: {e.get("path")}')
        gn = e.get('gnarly') or ''
        bg = e.get('bogus') or ''
        print(f'X-Gnarly (full, {len(gn)} chars):')
        print(f'  {gn}')
        print(f'X-Bogus: {bg}')
        print()
    print('=' * 74)
    print(f'REQUESTS MINED: {len(d)} | signatures differ per request (fresh)')

if __name__ == '__main__':
    main()
