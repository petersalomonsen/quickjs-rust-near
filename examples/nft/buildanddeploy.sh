#!/bin/bash
set -e
# Build for WebAssembly target
cargo build --target=wasm32-unknown-unknown --release
# Remove unneeded WebAssembly exports
mkdir -p out
wasm-metadce -f meta-dce.json ../../target/wasm32-unknown-unknown/release/quickjs_rust_near_nft.wasm -o out/nft.wasm
# Optimize the Wasm binary
wasm-opt --converge -Oz --signext-lowering out/nft.wasm -o out/nft.wasm

if [ -z "$1" ]
then
    echo "Deploying to DEV account"
    near dev-deploy out/nft.wasm --initFunction=new --initArgs '{}'
else
    if [ $1=="--only-build" ]
    then
        echo "No deployment"
    else
        # Deploy to account given in argument to this script
        echo "Deploying to $1"
        near deploy $1 out/nft.wasm
    fi
fi
