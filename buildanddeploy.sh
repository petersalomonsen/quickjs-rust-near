#!/bin/bash
set -e
# Build for WebAssembly target
RUSTFLAGS='-C link-arg=-s' cargo build --target=wasm32-unknown-unknown --release
# Remove unneeded WebAssembly exports
wasm-metadce -f meta-dce.json target/wasm32-unknown-unknown/release/quickjs_rust_near.wasm -o out/main.wasm
# Optimize the Wasm binary
wasm-opt -Oz --signext-lowering out/main.wasm -o out/main.wasm
if [ -z "$1" ]
then
    # Deploy to DEV account
    echo n | near dev-deploy
else
    # Deploy to account given in argument to this script
    echo "Deploying to $1"
    near deploy $1 out/main.wasm
fi
