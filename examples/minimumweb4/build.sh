#!/bin/bash
set -e
# Build for WebAssembly target
RUSTFLAGS='-C link-arg=-s' cargo build --target=wasm32-unknown-unknown --release
mkdir -p out
# Remove unneeded WebAssembly exports
wasm-metadce --enable-sign-ext --enable-bulk-memory --enable-nontrapping-float-to-int --enable-mutable-globals -f meta-dce.json ../../target/wasm32-unknown-unknown/release/quickjs_rust_near_minimum_web4.wasm -o out/minimum_web4.wasm
# Optimize the Wasm binary
wasm-opt --enable-sign-ext --enable-bulk-memory --enable-nontrapping-float-to-int --enable-mutable-globals --signext-lowering --llvm-nontrapping-fptoint-lowering --llvm-memory-copy-fill-lowering -Oz out/minimum_web4.wasm -o out/minimum_web4.wasm
