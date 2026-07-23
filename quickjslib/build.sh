#!/bin/bash
# Reproducible build of jseval.wasm.
#
# Pins the QuickJS version (downloaded from bellard.org if not present) and,
# when emcc is not already on the PATH, bootstraps a pinned emsdk. The
# QuickJS source is extracted into this directory (gitignored) so the build
# does not depend on — or interfere with — checkouts elsewhere in the repo.
set -euo pipefail

QUICKJS_VERSION=2026-06-04
EMSDK_VERSION=3.1.74

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
cd "$SCRIPT_DIR"

QUICKJS_ROOT="$SCRIPT_DIR/quickjs-$QUICKJS_VERSION"

if [ ! -d "$QUICKJS_ROOT" ]; then
    curl -fLO "https://bellard.org/quickjs/quickjs-$QUICKJS_VERSION.tar.xz"
    tar -xf "quickjs-$QUICKJS_VERSION.tar.xz"
    rm "quickjs-$QUICKJS_VERSION.tar.xz"
fi

if ! command -v emcc > /dev/null; then
    if [ ! -d "$SCRIPT_DIR/emsdk" ]; then
        git clone https://github.com/emscripten-core/emsdk.git "$SCRIPT_DIR/emsdk"
    fi
    (cd "$SCRIPT_DIR/emsdk" && git fetch --tags && git checkout "$EMSDK_VERSION" \
        && ./emsdk install "$EMSDK_VERSION" && ./emsdk activate "$EMSDK_VERSION")
    source "$SCRIPT_DIR/emsdk/emsdk_env.sh"
fi

echo "Building with $(emcc --version | head -1)"

(cd "$QUICKJS_ROOT" && make CC=emcc AR=emar libquickjs.a)
emcc -Oz -I"$QUICKJS_ROOT" libjseval.c -c
emar rcs libjseval.a libjseval.o
emcc -sERROR_ON_UNDEFINED_SYMBOLS=0 --no-entry -I"$QUICKJS_ROOT" -s STANDALONE_WASM=1 -s EXPORTED_FUNCTIONS="['_malloc', '_free']" wasmlib.c libjseval.a "$QUICKJS_ROOT/libquickjs.a" -Oz -o jseval.wasm
