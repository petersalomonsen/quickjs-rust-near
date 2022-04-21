#!/bin/bash

cargo build --target=wasm32-wasi
mv target/wasm32-wasi/debug/quickjs_rust.wasm main.wasm
node fixwasm.js