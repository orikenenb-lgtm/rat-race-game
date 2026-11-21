#!/bin/bash
# Builds the lobby test copy in $COPY_DIR/rr2lobby (default /tmp/rr2lobby): real project + stubs for the in-game screen (stubs never touch the project).
set -e
SRC="${SRC:-$(cd "$(dirname "$0")/.." && pwd)}"
COPY_DIR="${COPY_DIR:-/tmp}"
rm -rf $COPY_DIR/rr2lobby && cp -r "$SRC" $COPY_DIR/rr2lobby && rm -rf $COPY_DIR/rr2lobby/.git
ln -s /tmp/t/node_modules/three $COPY_DIR/rr2lobby/three
cp $SRC/tests/stubs/index.html $COPY_DIR/rr2lobby/index.html
mkdir -p $COPY_DIR/rr2lobby/css && cp $SRC/tests/stubs/css/game.css $COPY_DIR/rr2lobby/css/game.css
for f in main game ui audio; do cp $SRC/tests/stubs/js/$f.js $COPY_DIR/rr2lobby/js/$f.js; done
# engine-lead files the lobby reads lazily: use the stub only while the real one does not exist yet
for f in life history; do [ -f $SRC/js/$f.js ] || cp $SRC/tests/stubs/js/$f.js $COPY_DIR/rr2lobby/js/$f.js; done
echo "test copy ready"
