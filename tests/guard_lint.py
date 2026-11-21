#!/usr/bin/env python3
# Static check (T7 §2.9, Tier 0, < 1 s): every browser suite installs the shared Supabase guard, the production ref appears
# nowhere else in tests/, and no test installs packages. Exit 1 with file:line on any violation.  Usage: python3 tests/guard_lint.py
import os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
PROD = 'xvqaxphyfqdzkddmoosu'
# browser suites that still use their own Supabase route (they never reach production: every *.supabase.co request is routed
# locally). CR-20 asks the owning lanes to switch to FB.install(); the allowlist must shrink to 0.
ALLOW = {
    'stability_e2e.py': 'T1: own 503 route for every *.supabase.co URL + unrouted-request check (CR-20)',
    't4_*.py': 'T4: own route (CR-20)',
    't5_*.py': 'T5: own route (CR-20)',
}
# files allowed to contain the production ref (the guard itself, this lint, and live-only legacy files behind an env guard)
REF_ALLOW = {'fakebackend.py': 'defines SB_PROD (the guard)', 'guard_lint.py': 'this check',
             'security_live.mjs': 'live-only, exits SKIPPED unless RR_LIVE=1 + a non-production RR_SB_URL'}
INSTALL_RE = re.compile(r'\b(npm\s+(i|install)\b|pip3?\s+install\b)')

def allowed(name, table):
    import fnmatch
    return next((why for pat, why in table.items() if fnmatch.fnmatch(name, pat)), None)

def main():
    bad = []
    for name in sorted(os.listdir(HERE)):
        path = os.path.join(HERE, name)
        if not os.path.isfile(path) or not name.endswith(('.py', '.mjs', '.js', '.sh')): continue
        lines = open(path, encoding='utf-8', errors='replace').read().split('\n')
        text = '\n'.join(lines)
        if name.endswith('.py') and 'chromium.launch' in text and name != 'fakebackend_test.py':
            if not allowed(name, ALLOW):
                if 'import fakebackend' not in text and 'fakebackend as FB' not in text:
                    bad.append(f'{name}:1: browser suite does not import tests/fakebackend.py')
                if not re.search(r'FB\.install(_mode)?\(', text):
                    bad.append(f'{name}:1: browser suite never calls FB.install(ctx, …) (the Supabase guard)')
                for i, l in enumerate(lines, 1):
                    if 'chromium.launch' in l and 'chrome_args' not in l and 'FB.chrome_args' not in text:
                        bad.append(f'{name}:{i}: chromium.launch without FB.chrome_args(...) (DNS rule + --no-proxy-server)')
        if not allowed(name, REF_ALLOW):
            for i, l in enumerate(lines, 1):
                if PROD in l: bad.append(f'{name}:{i}: production Supabase ref outside fakebackend.py (use FB.SB_PROD)')
        if name != 'serve_copies.sh':
            for i, l in enumerate(lines, 1):
                if INSTALL_RE.search(l) and 'guard_lint' not in name: bad.append(f'{name}:{i}: installs packages ({INSTALL_RE.search(l).group(0)})')
    for b in bad: print('VIOLATION', b)
    print(f'guard_lint: {len(bad)} violation(s); allowlist: ' + '; '.join(f'{k} ({v})' for k, v in ALLOW.items()))
    return 1 if bad else 0

if __name__ == '__main__':
    sys.exit(main())
