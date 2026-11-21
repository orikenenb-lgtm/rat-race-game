#!/bin/bash
# Integration copy with the REAL in-game files (no stubs): /tmp/rr2real, three served locally.
set -e
SRC="${SRC:-$(cd "$(dirname "$0")/.." && pwd)}"
rm -rf /tmp/rr2real && cp -r "$SRC" /tmp/rr2real && rm -rf /tmp/rr2real/.git && rm -rf /tmp/rr2real/tests/stubs
ln -s /tmp/t/node_modules/three /tmp/rr2real/three
sed -i 's#https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js#/three/build/three.module.js#; s#https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/#/three/examples/jsm/#' /tmp/rr2real/index.html
grep -o '"three":"[^"]*"' /tmp/rr2real/index.html
