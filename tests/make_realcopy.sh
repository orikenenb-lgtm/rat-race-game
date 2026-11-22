#!/bin/bash
# Integration copy with the REAL in-game files (no stubs): $COPY_DIR/rr2real (default /tmp/rr2real), three served locally.
set -e
SRC="${SRC:-$(cd "$(dirname "$0")/.." && pwd)}"
COPY_DIR="${COPY_DIR:-/tmp}"; mkdir -p "$COPY_DIR"
rm -rf $COPY_DIR/rr2real && cp -r "$SRC" $COPY_DIR/rr2real && rm -rf $COPY_DIR/rr2real/.git && rm -rf $COPY_DIR/rr2real/tests/stubs
ln -s /tmp/t/node_modules/three $COPY_DIR/rr2real/three
sed -i 's#https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js#/three/build/three.module.js#; s#https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/#/three/examples/jsm/#' $COPY_DIR/rr2real/index.html
grep -o '"three":"[^"]*"' $COPY_DIR/rr2real/index.html
