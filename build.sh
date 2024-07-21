#!/bin/bash
set -e
mkdir -p out
# Build for WebAssembly target
cargo build --target=wasm32-unknown-unknown --release
# Remove unneeded WebAssembly exports
wasm-metadce -f meta-dce.json target/wasm32-unknown-unknown/release/quickjs_rust_near.wasm -o out/main.wasm
# Optimize the Wasm binary
wasm-opt --converge -Oz --signext-lowering out/main.wasm -o out/main.wasm
echo "The webassembly binary can be found in out/main.wasm"
