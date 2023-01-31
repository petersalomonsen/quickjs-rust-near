#!/bin/bash
set -e
# Build for WebAssembly target
RUSTFLAGS='-C link-arg=-s' cargo build --target=wasm32-unknown-unknown --release
# Remove unneeded WebAssembly exports
wasm-metadce -f meta-dce.json ../../target/wasm32-unknown-unknown/release/quickjs_rust_near_minimum_web4.wasm -o out/minimum_web4.wasm
# Optimize the Wasm binary
wasm-opt -Oz --signext-lowering out/minimum_web4.wasm -o out/minimum_web4.wasm
