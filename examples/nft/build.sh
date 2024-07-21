#!/bin/bash
set -e
# Build for WebAssembly target
cargo build --target=wasm32-unknown-unknown --release
# Remove unneeded WebAssembly exports
mkdir -p out
wasm-metadce -f meta-dce.json ../../target/wasm32-unknown-unknown/release/quickjs_rust_near_nft.wasm -o out/nft.wasm
# Optimize the Wasm binary
wasm-opt --converge -Oz --signext-lowering out/nft.wasm -o out/nft.wasm
echo "you can find the contract wasm file in out/nft.wasm"
