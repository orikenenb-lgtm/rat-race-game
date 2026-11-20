#!/bin/bash
# Integration copy with the REAL in-game files (no stubs): /tmp/rr2real, three served locally.
set -e
rm -rf /tmp/rr2real && cp -r /home/claude/rr2 /tmp/rr2real && rm -rf /tmp/rr2real/tests/stubs
ln -s /tmp/t/node_modules/three /tmp/rr2real/three
sed -i 's#https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js#/three/build/three.module.js#; s#https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/#/three/examples/jsm/#' /tmp/rr2real/index.html
grep -o '"three":"[^"]*"' /tmp/rr2real/index.html
