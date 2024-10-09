#!/bin/bash
set -e
# Build for WebAssembly target
cargo build --target=wasm32-unknown-unknown --release
# Remove unneeded WebAssembly exports
mkdir -p out
wasm-metadce -f meta-dce.json ../../target/wasm32-unknown-unknown/release/quickjs_rust_near_fungible_token.wasm -o out/fungible_token.wasm
# Optimize the Wasm binary
wasm-opt --converge -Oz --signext-lowering out/fungible_token.wasm -o out/fungible_token.wasm
echo "you can find the contract wasm file in out/fungible_token.wasm"
