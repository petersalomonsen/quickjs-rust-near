#!/bin/bash
RUSTFLAGS='-C link-arg=-s' cargo test --target=wasm32-wasi --no-run
$HOME/.wasmtime/bin/wasmtime target/wasm32-wasi/debug/deps/*.wasm -- --show-output