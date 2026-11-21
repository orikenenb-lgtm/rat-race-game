#!/bin/bash
# Builds the lobby test copy in /tmp/rr2lobby: real project + stubs for the in-game screen (stubs never touch the project).
set -e
SRC="${SRC:-$(cd "$(dirname "$0")/.." && pwd)}"
rm -rf /tmp/rr2lobby && cp -r "$SRC" /tmp/rr2lobby && rm -rf /tmp/rr2lobby/.git
ln -s /tmp/t/node_modules/three /tmp/rr2lobby/three
cp $SRC/tests/stubs/index.html /tmp/rr2lobby/index.html
mkdir -p /tmp/rr2lobby/css && cp $SRC/tests/stubs/css/game.css /tmp/rr2lobby/css/game.css
for f in main game ui audio; do cp $SRC/tests/stubs/js/$f.js /tmp/rr2lobby/js/$f.js; done
# engine-lead files the lobby reads lazily: use the stub only while the real one does not exist yet
for f in life history; do [ -f $SRC/js/$f.js ] || cp $SRC/tests/stubs/js/$f.js /tmp/rr2lobby/js/$f.js; done
echo "test copy ready"
