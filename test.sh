#!/bin/bash
set -e
rm -f target/wasm32-wasi/debug/deps/*.wasm
RUSTFLAGS='-C link-args=--initial-memory=2097152' cargo test --target=wasm32-wasi --no-run
WASMTIME_BACKTRACE_DETAILS=1 $HOME/.wasmtime/bin/wasmtime target/wasm32-wasi/debug/deps/quickjs_rust_near-*.wasm -- --show-output
