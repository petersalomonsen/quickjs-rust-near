#!/bin/bash
set -e
# Build for WebAssembly target
cargo build --target=wasm32-unknown-unknown --release

WASM_FILENAME=../../target/wasm32-unknown-unknown/release/quickjs_rust_near_purejs.wasm
wasm2wat $WASM_FILENAME > purejs.wat
OBJDUMP_DATA_SECTION=`wasm-objdump -h $WASM_FILENAME | grep "Data start"`
node ./manipulatepurejswat.js "$OBJDUMP_DATA_SECTION"
wat2wasm purejs.wat
wasm-metadce -f meta-dce.json purejs.wasm -o purejs.wasm
# Optimize the Wasm binary
wasm-opt -Oz --signext-lowering purejs.wasm -o purejs.wasm
