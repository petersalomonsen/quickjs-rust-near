#!/bin/bash
set -e
# Build for WebAssembly target
cargo build --target=wasm32-unknown-unknown --release
# Remove unneeded WebAssembly exports
mkdir -p out
wasm-metadce --enable-sign-ext --enable-bulk-memory --enable-nontrapping-float-to-int --enable-mutable-globals -f meta-dce.json ../../target/wasm32-unknown-unknown/release/quickjs_rust_near_fungible_token.wasm -o out/fungible_token.wasm
# Optimize the Wasm binary
wasm-opt --enable-sign-ext --enable-bulk-memory --enable-nontrapping-float-to-int --enable-mutable-globals --signext-lowering --llvm-nontrapping-fptoint-lowering --llvm-memory-copy-fill-lowering --converge -Oz out/fungible_token.wasm -o out/fungible_token.wasm
echo "you can find the contract wasm file in out/fungible_token.wasm"
