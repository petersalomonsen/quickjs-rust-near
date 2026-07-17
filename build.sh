#!/bin/bash
set -e
mkdir -p out
# Build for WebAssembly target
cargo build --target=wasm32-unknown-unknown --release
# Remove unneeded WebAssembly exports
wasm-metadce --enable-sign-ext --enable-bulk-memory --enable-nontrapping-float-to-int --enable-mutable-globals -f meta-dce.json target/wasm32-unknown-unknown/release/quickjs_rust_near.wasm -o out/main.wasm
# Optimize the Wasm binary
wasm-opt --enable-sign-ext --enable-bulk-memory --enable-nontrapping-float-to-int --enable-mutable-globals --signext-lowering --llvm-nontrapping-fptoint-lowering --llvm-memory-copy-fill-lowering --converge -Oz out/main.wasm -o out/main.wasm
echo "The webassembly binary can be found in out/main.wasm"
