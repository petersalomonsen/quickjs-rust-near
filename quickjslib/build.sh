#!/bin/bash
# Build of jseval.wasm, reproducible per toolchain.
#
# This script serves two contexts:
# - The repo build (invoked by ../build.rs): uses the QuickJS checkout and
#   emsdk at the repo root. build.rs links libquickjs.a from that QuickJS
#   directory, so it must be built there.
# - Standalone (npm package CI / fresh clone): downloads the pinned QuickJS
#   release into this directory (gitignored) and uses emcc from the PATH,
#   bootstrapping a pinned emsdk if none is installed.
set -euo pipefail

QUICKJS_VERSION=2026-06-04
EMSDK_VERSION=3.1.74

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
cd "$SCRIPT_DIR"

if [ -d "../quickjs-$QUICKJS_VERSION" ]; then
    QUICKJS_ROOT=$(cd "../quickjs-$QUICKJS_VERSION" && pwd)
else
    QUICKJS_ROOT="$SCRIPT_DIR/quickjs-$QUICKJS_VERSION"
    if [ ! -d "$QUICKJS_ROOT" ]; then
        curl -fLO "https://bellard.org/quickjs/quickjs-$QUICKJS_VERSION.tar.xz"
        tar -xf "quickjs-$QUICKJS_VERSION.tar.xz"
        rm "quickjs-$QUICKJS_VERSION.tar.xz"
    fi
fi

if ! command -v emcc > /dev/null && [ -f ../emsdk/emsdk_env.sh ]; then
    set +u
    source ../emsdk/emsdk_env.sh || true
    set -u
fi

if ! command -v emcc > /dev/null; then
    if [ ! -d "$SCRIPT_DIR/emsdk" ]; then
        git clone https://github.com/emscripten-core/emsdk.git "$SCRIPT_DIR/emsdk"
    fi
    (cd "$SCRIPT_DIR/emsdk" && git fetch --tags && git checkout "$EMSDK_VERSION" \
        && ./emsdk install "$EMSDK_VERSION" && ./emsdk activate "$EMSDK_VERSION")
    set +u
    source "$SCRIPT_DIR/emsdk/emsdk_env.sh"
    set -u
fi

echo "Building with $(emcc --version | head -1)"

(cd "$QUICKJS_ROOT" && make CC=emcc AR=emar libquickjs.a)
emcc -Oz -I"$QUICKJS_ROOT" libjseval.c -c
emar rcs libjseval.a libjseval.o
emcc -sERROR_ON_UNDEFINED_SYMBOLS=0 --no-entry -I"$QUICKJS_ROOT" -s STANDALONE_WASM=1 -s EXPORTED_FUNCTIONS="['_malloc', '_free']" wasmlib.c libjseval.a "$QUICKJS_ROOT/libquickjs.a" -Oz -o jseval.wasm
