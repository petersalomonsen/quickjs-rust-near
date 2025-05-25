#!/bin/bash

source ../emsdk/emsdk_env.sh
QUICKJS_ROOT=../quickjs-2024-01-13
export CC=clang
(cd $QUICKJS_ROOT && make CC=emcc AR=emar libquickjs.a)
emcc -Oz -I$QUICKJS_ROOT libjseval.c -c
emar rcs libjseval.a libjseval.o
emcc -sERROR_ON_UNDEFINED_SYMBOLS=0 --no-entry -I$QUICKJS_ROOT -s STANDALONE_WASM=1 -s EXPORTED_FUNCTIONS="['_malloc', '_free']" wasmlib.c libjseval.a $QUICKJS_ROOT/libquickjs.a -Oz -o jseval.wasm

