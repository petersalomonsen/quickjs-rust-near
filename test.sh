#!/bin/bash
RUSTFLAGS='-C link-args=-initial-memory=2097152' cargo test --target=wasm32-wasi --no-run
WASMTIME_BACKTRACE_DETAILS=1 $HOME/.wasmtime/bin/wasmtime target/wasm32-wasi/debug/deps/*.wasm -- --show-output
