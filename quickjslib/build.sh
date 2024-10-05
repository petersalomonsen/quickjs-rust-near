#!/bin/bash

source ../emsdk/emsdk_env.sh
QUICKJS_ROOT=../quickjs-2024-01-13
export CC=clang
(cd $QUICKJS_ROOT && make CC=emcc AR=emar libquickjs.a)
emcc -Oz -I$QUICKJS_ROOT -s USE_PTHREADS=0 libjseval.c -c
emar rcs libjseval.a libjseval.o
emcc -s EXPORTED_FUNCTIONS="['_malloc']" --no-entry wasmlib.c libjseval.a $QUICKJS_ROOT/libquickjs.a -Oz -o jseval.wasm
wasm-opt -Oz jseval.wasm -o jseval.wasm
