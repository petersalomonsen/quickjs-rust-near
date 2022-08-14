#!/bin/bash
RUSTFLAGS='-C link-arg=-s' cargo build --target=wasm32-unknown-unknown --release
cp target/wasm32-unknown-unknown/release/quickjs_rust_near.wasm out/main.wasm 
near dev-deploy