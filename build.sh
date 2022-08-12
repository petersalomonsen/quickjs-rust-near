#!/bin/bash

#RUSTFLAGS='-C link-arg=-s' 
cargo build --target=wasm32-wasi
mv target/wasm32-wasi/debug/quickjs_rust.wasm main.wasm
node fixwasm.js

# replace wasi imports
#wat2wasm main.wat
#wasm-opt -Oz main.wasm -o out/main.wasm